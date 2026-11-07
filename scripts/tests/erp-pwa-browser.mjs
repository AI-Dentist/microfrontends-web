// Functional acceptance against current build outputs. No backend or identity.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,readdir,mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {root,artifacts,inspectPublicReleaseDraft,generatePublicRelease} from '../platform-artifacts.mjs';
import {createPublicInventory,publicAttestation,reviewedLoaderContract,ownedOrtPublicAssetPaths} from '../erp-public-inventory.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const proof=resolve(root,'.git/erp-offline-pwa-proof');await mkdir(proof,{recursive:true});
const result={stage:'setup',checks:{},privateRequests:0,externalRequests:0};
const servers=[],state={config:null,manifest:null,missing:new Set()};let browser,context;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.eot':'application/vnd.ms-fontobject','.otf':'font/otf'};
async function serve(directory,prefix='/',shell=false){
  const base=await realpath(resolve(root,directory));let origin;
  const server=createServer(async(req,res)=>{try{
    const u=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
    if(!shell){res.setHeader('Access-Control-Allow-Origin',state.shellOrigin??'*');res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'});res.end();return;}
    const json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
    if(req.headers.authorization || u.searchParams.has('token') || /^\/(?:api|auth|graphql)(?:\/|$)/.test(u.pathname)){result.privateRequests++;json({private:'SYNTHETIC_NOT_FOR_CACHE'},503);return;}
    if(shell && u.pathname==='/platform-config.json'){json(state.config);return;}
    if(shell && u.pathname==='/erp-public-release.json'){json(state.manifest);return;}
    if(state.missing.has(u.origin+u.pathname)){res.writeHead(404);res.end();return;}
    const path=decodeURIComponent(u.pathname);if(!path.startsWith(prefix)){res.writeHead(404);res.end();return;}
    let file=resolve(base,path.slice(prefix.length)||'index.html');if(!file.startsWith(base+sep)){res.writeHead(403);res.end();return;}
    try{if(!(await stat(file)).isFile())throw Error();}catch{if(shell&&!extname(path))file=resolve(base,'index.html');else{res.writeHead(404);res.end();return;}}
    const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(bytes);
  }catch{res.writeHead(500);res.end();}});
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});origin='http://127.0.0.1:'+server.address().port;
  const entry={origin,close:()=>new Promise(ok=>{server.close(ok);server.closeAllConnections();})};servers.push(entry);return entry;
}
async function candidate(shell,erp){
  const styles=(await readdir(resolve(root,artifacts.erp))).filter(n=>/^styles-[\w-]+\.css$/.test(n));assert.equal(styles.length,1);
  const opts={shellDir:resolve(root,artifacts.shell),erpDir:resolve(root,artifacts.erp),shellBaseUrl:shell.origin+'/',erpBaseUrl:erp.origin+'/releases/proof/',config:state.config};
  const draft=await inspectPublicReleaseDraft(opts);assert.deepEqual(draft.issues,[]);
  const roots=[{root:'shell',baseUrl:opts.shellBaseUrl,directory:opts.shellDir,files:[]},{root:'erp',baseUrl:opts.erpBaseUrl,directory:opts.erpDir,files:[]}];
  for(const a of draft.assets){const r=roots.find(r=>a.url.startsWith(r.baseUrl));assert.ok(r);r.files.push(a.url.slice(r.baseUrl.length));}
  roots[0].files.push('erp-sw.js');roots[1].files.push(...ownedOrtPublicAssetPaths());for(const r of roots)r.files=[...new Set(r.files)].sort();
  const loaderSites=draft.computedSites.map(s=>{const r=roots.find(r=>s.url.startsWith(r.baseUrl)),site={root:r.root,path:s.url.slice(r.baseUrl.length),moduleSha256:s.moduleSha256,expressionSha256:s.expressionSha256};
    site.adapter=s.pendingContract==='native-federation-load-module-v1'?s.pendingContract:reviewedLoaderContract(site);assert.ok(site.adapter,'unreviewed runtime');return site;});
  const inventory=await createPublicInventory({roots,loaderSites,attestation:publicAttestation});
  const release=await generatePublicRelease({...opts,inventory});
  await writeFile(resolve(proof,'browser-inventory.json'),JSON.stringify(inventory,null,2));
  const native=draft.computedSites.find(s=>s.pendingContract==='native-federation-load-module-v1').url;
  return{release,native};
}
async function rendered(page){await page.waitForFunction(()=>!!document.querySelector('platform-shell[ng-version]')?.children.length,null,{timeout:30000});}
async function ready(page,version){await rendered(page);await page.waitForFunction(v=>window.erpPublicRuntime?.ready===true&&window.erpPublicRuntime.version===v,version,{timeout:30000});}
async function importErp(page,native,entry){return page.evaluate(async({native,entry})=>{
  const ns=await globalThis.importShim(native);
  const load=Object.values(ns).find(v=>typeof v==='function'&&!v.toString().startsWith('class')&&v.toString().includes('unexpected arguments: Please pass remoteName or remoteEntry'));
  if(!load)throw Error('Published native API not found');const module=await load({remoteEntry:entry,exposedModule:'./Routes'});return typeof module.createErpRoutes==='function';
},{native,entry});}
async function cacheProof(page,releases){return page.evaluate(async releases=>{
  const versions=new Map(releases.map(r=>['erp-public-v1-'+r.version,r]));let checked=0;
  for(const name of await caches.keys()){
    if(!versions.has(name))throw Error('Unexpected CacheStorage namespace');const r=versions.get(name),cache=await caches.open(name),expected=new Map(r.assets.map(a=>[a.url,a]));
    const keys=await cache.keys();if(keys.length!==r.assets.length+1)throw Error('Unexpected public cache count');
    for(const key of keys){
      if(key.url===location.origin+'/__erp_public_release__/'+r.version){const m=await(await cache.match(key)).json();if(m.version!==r.version||m.publicBootConfig.subject||m.publicBootConfig.accessToken)throw Error('Private metadata');continue;}
      if(!expected.has(key.url)||new URL(key.url).search||/\/(api|auth|graphql)\//.test(new URL(key.url).pathname))throw Error('Unexpected private cache key');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await cache.match(key)).arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
      if(hash!==expected.get(key.url).sha256)throw Error('Cached body changed');checked++;
    }
  }
  return checked;
},releases);}
async function registerVersion(page,version){return page.evaluate(async v=>{
  const r=await navigator.serviceWorker.register('/erp-sw.js?release='+v,{scope:'/'});
  const w=r.installing??r.waiting;if(!w)return r.active?.scriptURL.includes(v)?'activated':'absent';
  return new Promise((ok,no)=>{const timer=setTimeout(()=>no(Error('Update lifecycle timeout')),60000);const check=()=>{if(['installed','activated','redundant'].includes(w.state)){clearTimeout(timer);ok(w.state);}};w.addEventListener('statechange',check);check();});
},version);}
try{
  const erp=await serve(artifacts.erp,'/releases/proof/'),ops=await serve(artifacts.operations,'/releases/proof/'),clinical=await serve(artifacts.clinical,'/releases/proof/'),shell=await serve(artifacts.shell,'/',true);state.shellOrigin=shell.origin;
  const style=(await readdir(resolve(root,artifacts.erp))).find(n=>/^styles-[\w-]+\.css$/.test(n));
  state.config={schemaVersion:1,remotes:[{id:'erp',label:'ERP',basePath:'/erp',kind:'native-federation',entry:erp.origin+'/releases/proof/remoteEntry.json',styles:erp.origin+'/releases/proof/'+style,apiBaseUrl:'/api/erp/graphql'},...[['operations',ops],['clinical',clinical]].map(([id,s])=>({id,label:id,basePath:'/'+id,kind:'module',entry:s.origin+'/releases/proof/remote.js',styles:s.origin+'/releases/proof/remote.css',apiBaseUrl:'/api/'+id}))]};
  result.stage='publisher';const c=await candidate(shell,erp),a=c.release;state.manifest=a;result.version=a.version;result.assets=a.assets.length;
  process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'apps/mf-erp/node_modules/.cache/playwright');const{chromium}=createRequire(resolve(root,'apps/mf-erp/package.json'))('playwright');
  browser=await chromium.launch({headless:true});context=await browser.newContext({serviceWorkers:'allow'});
  const origins=new Set(servers.map(s=>s.origin));await context.route('**/*',r=>{const u=new URL(r.request().url());if(!origins.has(u.origin)){result.externalRequests++;return r.abort();}return r.continue();});
  let page=await context.newPage();result.stage='online-install';assert.equal((await page.goto(shell.origin+'/',{waitUntil:'domcontentloaded'})).status(),200);await rendered(page);
  await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,no)=>setTimeout(()=>no(Error('Install timeout')),120000))]));
  await page.reload({waitUntil:'domcontentloaded'});await ready(page,a.version);result.checks.onlineBoot=true;
  result.stage='offline-native-graph';await context.setOffline(true);assert.equal((await page.reload({waitUntil:'domcontentloaded'})).status(),200);await ready(page,a.version);
  assert.equal(await importErp(page,c.native,state.config.remotes[0].entry),true);result.checks.offlineBootAndErpGraph=true;
  result.stage='online-other-modules';await context.setOffline(false);
  for(const remote of state.config.remotes.filter(r=>r.kind==='module'))assert.equal(await page.evaluate(async url=>typeof(await globalThis.importShim(url)).mount==='function',remote.entry),true);
  result.checks.otherOnlineModules=true;
  const cdp=await context.newCDPSession(page);const installability=await cdp.send('Page.getInstallabilityErrors');result.installabilityErrors=installability.installabilityErrors??[];assert.equal(result.installabilityErrors.length,0);result.checks.installable=true;
  result.stage='private-cache';await page.evaluate(async({origin,script})=>{
    for(const [url,options]of [[origin+'/api/erp/graphql',{}],[origin+'/auth/token',{}],[script+'?token=SYNTHETIC',{}],[script,{headers:{Authorization:'Bearer SYNTHETIC'}}]])await fetch(url,options);
  },{origin:shell.origin,script:a.assets.find(x=>x.kind==='js'&&x.url.startsWith(shell.origin)).url});
  result.checkedPublicBodies=await cacheProof(page,[a]);result.checks.noPrivateCache=true;
  result.stage='unknown-module';assert.equal(await page.evaluate(async origin=>{try{await importShim(origin+'/unlisted.js');return false;}catch{return window.erpPublicRuntime.ready===false;}},shell.origin),true);
  result.checks.unknownTargetRejected=true;await page.reload({waitUntil:'domcontentloaded'});await ready(page,a.version);
  result.stage='partial-update';const b=structuredClone(a),extraUrl=erp.origin+'/releases/proof/favicon.ico',bytes=await readFile(resolve(root,artifacts.erp,'favicon.ico'));
  b.assets.push({url:extraUrl,sha256:sha(bytes),kind:'ico'});b.assets.sort((x,y)=>x.url<y.url?-1:1);b.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:b.publicBootConfig,assets:b.assets,runtimePolicy:b.runtimePolicy}));state.manifest=b;state.missing.add(extraUrl);
  assert.equal(await registerVersion(page,b.version),'redundant');assert.equal(await page.evaluate(()=>new URL(navigator.serviceWorker.controller.scriptURL).searchParams.get('release')),a.version);
  await cacheProof(page,[a]);await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page,a.version);assert.equal(await importErp(page,c.native,state.config.remotes[0].entry),true);result.checks.partialUpdatePreservesOld=true;
  result.stage='complete-update';await context.setOffline(false);state.missing.clear();assert.equal(await registerVersion(page,b.version),'installed');await page.close();
  page=await context.newPage();await page.goto(shell.origin+'/',{waitUntil:'domcontentloaded'});await ready(page,b.version);await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page,b.version);assert.equal(await importErp(page,c.native,state.config.remotes[0].entry),true);
  result.checks.completeUpdateOffline=true;result.checkedPublicBodiesAfterUpdate=await cacheProof(page,[a,b]);result.stage='complete';result.outcome='PASS';
}catch(error){result.outcome='FAIL';result.error=String(error?.message??error).slice(0,1200);process.exitCode=1;}
finally{try{await context?.close();await browser?.close();for(const s of servers.reverse())await s.close();result.cleanup=true;}catch{result.cleanup=false;process.exitCode=1;}await writeFile(resolve(proof,'green-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
