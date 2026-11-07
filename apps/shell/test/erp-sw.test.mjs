import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
const source = () => readFile(new URL('../public/erp-sw.js', import.meta.url), 'utf8');
const shell = 'https://shell.example/', erp = 'https://erp.example/v1/';
const sha = x => createHash('sha256').update(x).digest('hex');
function fixture() {
  const config = { schemaVersion: 1, remotes: [
    {id:'erp',label:'ERP',basePath:'/erp',kind:'native-federation',entry:erp+'remoteEntry.json',styles:erp+'styles.css',apiBaseUrl:shell+'api/erp/graphql'},
    ...['operations','clinical'].map(id=>({id,label:id,basePath:'/'+id,kind:'module',entry:`https://${id}.example/remote.js`,styles:`https://${id}.example/remote.css`,apiBaseUrl:shell+'api/'+id})),
  ] };
  const files = new Map([
    [shell+'index.html',['<platform-shell></platform-shell><script src="/main.js"></script>','html','text/html']],
    [shell+'main.js',['export {};','js','text/javascript']],
    [shell+'remoteEntry.json',[JSON.stringify({$version:'v4',name:'shell',shared:[],exposes:[]}),'json','application/json']],
    [erp+'remoteEntry.json',[JSON.stringify({$version:'v4',name:'erp',shared:[],exposes:[{key:'./Routes',outFileName:'routes.js'}]}),'json','application/json']],
    [erp+'routes.js',['export const routes=[];','js','text/javascript']],
    [erp+'styles.css',['body{color:black}','css','text/css']],
  ]);
  const assets = [...files].map(([url,[body,kind]])=>({url,kind,sha256:sha(body)})).sort((a,b)=>a.url<b.url?-1:1);
  // Canonical property order is part of the generator's version format.
  for (let i=0;i<assets.length;i++) assets[i]={url:assets[i].url,sha256:assets[i].sha256,kind:assets[i].kind};
  const runtimePolicy={adapter:'native-federation-load-module-v1',targets:assets.filter(a=>a.kind==='js').map(a=>a.url)};
  const payload={schemaVersion:1,publicBootConfig:config,assets,runtimePolicy};
  return {files,release:{schemaVersion:1,version:sha(JSON.stringify(payload)),publicBootConfig:config,assets,runtimePolicy}};
}
function response(body, mime='application/json', status=200, type='basic', url='') {
  const r=new Response(body,{status,headers:{'Content-Type':mime}}), clone=r.clone.bind(r);
  Object.defineProperties(r,{type:{value:type},url:{value:url},clone:{value:()=>{const c=clone(); return responseClone(c,type,url);}}});
  return r;
}
function responseClone(r,type,url) {const clone=r.clone.bind(r); Object.defineProperties(r,{type:{value:type},url:{value:url},clone:{value:()=>responseClone(clone(),type,url)}});return r;}
function storage() {
  const maps=new Map();
  const key=r=>typeof r==='string'?r:r.url;
  return {maps, async keys(){return [...maps.keys()];},async delete(n){return maps.delete(n);},async open(n){
    if(!maps.has(n)) maps.set(n,new Map());const m=maps.get(n);
    return {async put(k,v){m.set(key(k),v.clone());},async match(k){return m.get(key(k))?.clone();},async keys(){return [...m.keys()].map(k=>new Request(k));}};
  }};
}
async function worker(f, caches=storage(), override=()=>null, version=f.release.version) {
  const handlers={}, network=[];
  const fetch=async input=>{const url=typeof input==='string'?input:input.url;network.push(url);const custom=override(url,input);if(custom) return custom;
    if(url===shell+'erp-public-release.json') return response(JSON.stringify(f.release),'application/json',200,'basic',url);
    const file=f.files.get(url)??(url.startsWith(shell+'erp-sw.js?release=')?f.files.get(shell+'erp-sw.js'):undefined);return file?response(file[0],file[2],200,url.startsWith(erp)?'cors':'basic',url):response('private synthetic','application/json',200,'basic',url);
  };
  const self={location:new URL(shell+'erp-sw.js?release='+version),registration:{scope:shell},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  vm.runInNewContext(await source(),{self,caches,fetch,crypto:webcrypto,Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,console});
  async function install(){let p;handlers.install({waitUntil:q=>{p=q;}});await p;}
  async function status(){let p,data;handlers.message({data:{type:'ERP_PUBLIC_STATUS'},ports:[{postMessage:d=>{data=d;}}],waitUntil:q=>{p=q;}});await p;return data;}
  async function request(url,options={}) {let p;const req=new Request(url,options.mode==='navigate'?{...options,mode:'cors'}:options);if(options.mode==='navigate')Object.defineProperty(req,'mode',{value:'navigate'});handlers.fetch({request:req,respondWith:q=>{p=q;}});return p?await p:fetch(req);}
  return {install,status,request,caches,network};
}
async function snapshot(caches) {const out={};for(const [name,m] of caches.maps){out[name]={};for(const [url,r] of m)out[name][url]=sha(Buffer.from(await r.clone().arrayBuffer()));}return out;}
test('atomic complete generation publishes status and only public assets',async()=>{
  const f=fixture(),w=await worker(f);await w.install();const s=await w.status();assert.equal(s.complete,true);assert.equal(s.version,f.release.version);
  const urls=[...w.caches.maps.values()].flatMap(m=>[...m.keys()]);assert.ok(urls.includes(erp+'routes.js'));assert.ok(!urls.some(u=>u.includes('/api/')||u.includes('platform-config.json')));
});
for(const kind of ['missing','digest','opaque','mime'])test(`failed ${kind} update preserves prior complete generation without writes`,async()=>{
  const f=fixture(),old=await worker(f);await old.install();const before=await snapshot(old.caches);
  const next=fixture();next.release.publicBootConfig.remotes[0].label='next';next.release.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:next.release.publicBootConfig,assets:next.release.assets,runtimePolicy:next.release.runtimePolicy}));
  const bad=await worker(next,old.caches,url=>url===shell+'main.js'?response(kind==='digest'?'changed':'export {};',kind==='mime'?'text/html':'text/javascript',kind==='missing'?404:200,kind==='opaque'?'opaque':'basic',url):null);
  await assert.rejects(()=>bad.install());assert.deepEqual(await snapshot(old.caches),before);assert.equal((await old.status()).complete,true);
});
test('public compiled GraphQL library code is not a private API response',async()=>{
  const f=fixture(),value=f.files.get(shell+'main.js');f.files.delete(shell+'main.js');f.files.set(shell+'graphql.ABC.js',value);
  f.files.get(shell+'index.html')[0]=f.files.get(shell+'index.html')[0].replace('/main.js','/graphql.ABC.js');
  f.release.assets=[...f.files].map(([url,[body,kind]])=>({url,sha256:sha(body),kind})).sort((a,b)=>a.url<b.url?-1:1);
  f.release.runtimePolicy.targets=f.release.assets.filter(a=>a.kind==='js').map(a=>a.url);
  f.release.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:f.release.publicBootConfig,assets:f.release.assets,runtimePolicy:f.release.runtimePolicy}));
  const w=await worker(f);await w.install();assert.equal((await w.status()).complete,true);
});
test('private requests, credentials and queries never enter public CacheStorage',async()=>{
  const w=await worker(fixture());await w.install();const before=await snapshot(w.caches);
  for(const [url,options] of [[shell+'api/erp/graphql',{}],[shell+'auth/token',{}],[shell+'main.js?token=synthetic',{}],[shell+'main.js',{headers:{Authorization:'Bearer synthetic'}}]]) await w.request(url,options);
  assert.deepEqual(await snapshot(w.caches),before);assert.equal(w.network.filter(u=>u.includes('/api/')||u.includes('/auth/')).length,2);
});
test('config HTTP errors are retained; network failure uses public snapshot without caching response',async()=>{
  const f=fixture();let offline=false;const w=await worker(f,storage(),url=>url===shell+'platform-config.json'?(offline?Promise.reject(Error('offline')):response('failure','application/json',503)):null);
  await w.install();assert.equal((await w.request(shell+'platform-config.json')).status,503);offline=true;
  const r=await w.request(shell+'platform-config.json');assert.equal(r.status,200);assert.deepEqual(await r.json(),f.release.publicBootConfig);
  assert.ok(![...w.caches.maps.values()].some(m=>m.has(shell+'platform-config.json')));
});
test('missing cached resource revokes complete status',async()=>{
  const f=fixture(),w=await worker(f);await w.install();for(const m of w.caches.maps.values())m.delete(erp+'routes.js');assert.equal((await w.status()).complete,false);
});
for(const kind of ['private-field','non-module-target'])test(`federation metadata rejects ${kind} before publication`,async()=>{
  const f=fixture(),url=erp+'remoteEntry.json',entry=JSON.parse(f.files.get(url)[0]);
  if(kind==='private-field')entry.token='SYNTHETIC';else entry.exposes[0].outFileName='styles.css';
  f.files.get(url)[0]=JSON.stringify(entry);f.release.assets.find(a=>a.url===url).sha256=sha(f.files.get(url)[0]);
  f.release.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:f.release.publicBootConfig,assets:f.release.assets,runtimePolicy:f.release.runtimePolicy}));
  const w=await worker(f);await assert.rejects(()=>w.install());assert.deepEqual(await w.caches.keys(),[]);
});
test('encoded private navigation never receives cached public index',async()=>{
  const w=await worker(fixture());await w.install();const before=await snapshot(w.caches);
  const r=await w.request(shell+'%61pi/data',{mode:'navigate'});assert.equal(await r.text(),'private synthetic');
  assert.deepEqual(await snapshot(w.caches),before);
});
test('same-version reuse must not hide manifest version drift',async()=>{
  const f=fixture(),old=await worker(f);await old.install();const before=await snapshot(old.caches);
  const next=fixture();next.release.publicBootConfig.remotes[0].label='new metadata';next.release.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:next.release.publicBootConfig,assets:next.release.assets,runtimePolicy:next.release.runtimePolicy}));
  const update=await worker(next,old.caches,()=>null,f.release.version);await assert.rejects(()=>update.install());assert.deepEqual(await snapshot(old.caches),before);
});
test('same-version reuse verifies the worker source before replacing its implementation',async()=>{
  const f=fixture();f.files.set(shell+'erp-sw.js',['// published worker','js','text/javascript']);
  f.release.assets=[...f.files].map(([url,[body,kind]])=>({url,sha256:sha(body),kind})).sort((a,b)=>a.url<b.url?-1:1);
  f.release.runtimePolicy.targets=f.release.assets.filter(a=>a.kind==='js').map(a=>a.url);f.release.runtimePolicy.contracts=['es-module-shims-fetch-v1','native-federation-load-module-v1'];
  f.release.version=sha(JSON.stringify({schemaVersion:1,publicBootConfig:f.release.publicBootConfig,assets:f.release.assets,runtimePolicy:f.release.runtimePolicy}));
  const old=await worker(f);await old.install();const before=await snapshot(old.caches);
  const update=await worker(f,old.caches,url=>url.startsWith(shell+'erp-sw.js?release=')?response('// different implementation','text/javascript',200,'basic',url):null);
  await assert.rejects(()=>update.install());assert.deepEqual(await snapshot(old.caches),before);
});
test('mismatched worker version cannot publish a generation',async()=>{
  const w=await worker(fixture(),storage(),()=>null,'0'.repeat(64));await assert.rejects(()=>w.install());assert.deepEqual(await w.caches.keys(),[]);
});
