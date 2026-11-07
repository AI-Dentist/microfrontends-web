'use strict';
// Public resources only. Completion is not identity, PIN or API authorization.
const origin = self.location.origin;
const version = new URL(self.location.href).searchParams.get('release');
const name = `erp-public-v1-${version}`;
const marker = `${origin}/__erp_public_release__/${version}`;
const hex = /^[a-f0-9]{64}$/u;
const contracts = new Set(['native-federation-load-module-v1', 'es-module-shims-fetch-v1', 'configured-module-remotes-v1', 'owned-ort-wasm-paths-v1']);
const mime = {html:['text/html'],js:['text/javascript','application/javascript'],mjs:['text/javascript','application/javascript'],css:['text/css'],json:['application/json'],webmanifest:['application/manifest+json','application/json'],svg:['image/svg+xml'],png:['image/png'],jpg:['image/jpeg'],jpeg:['image/jpeg'],gif:['image/gif'],webp:['image/webp'],ico:['image/x-icon','image/vnd.microsoft.icon'],woff:['font/woff','application/font-woff'],woff2:['font/woff2'],ttf:['font/ttf'],otf:['font/otf'],eot:['application/vnd.ms-fontobject'],wasm:['application/wasm']};
const keys = (x, names) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === names.length && names.every(k => Object.hasOwn(x,k));
function check(condition) { if (!condition) throw Error('Invalid public generation'); }
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join(''); }
function publicURL(value) {
  check(typeof value==='string' && !/[\\%?#\s]/u.test(value));
  const u=new URL(value);
  check(u.href===value && !u.username && !u.password && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))));
  return u;
}
function forbidden(u) { return /(?:^|\/)(?:api|graphql|auth|oauth|token)(?:\/|$)/iu.test(u.pathname) || /(?:^|\/|[-_.])(?:private|secret|credentials?|platform-config)(?:\/|[-_.]|$)/iu.test(u.pathname) || /\.map$/iu.test(u.pathname); }
function config(input) {
  check(input && Object.keys(input).every(k=>['schemaVersion','remotes','oidc'].includes(k)) && input.schemaVersion===1 && Array.isArray(input.remotes) && input.remotes.length===3);
  const ids=new Set();
  for(const r of input.remotes) {
    check(r && Object.keys(r).every(k=>['id','label','basePath','kind','entry','styles','apiBaseUrl','serviceBaseUrls'].includes(k)) && ['erp','operations','clinical'].includes(r.id) && !ids.has(r.id));ids.add(r.id);
    check(r.basePath==='/'+r.id && typeof r.label==='string' && r.label.trim() && r.kind===(r.id==='erp'?'native-federation':'module'));
    check(publicURL(r.entry).pathname.endsWith(r.id==='erp'?'/remoteEntry.json':'.js'));
    if(r.styles!==undefined) check(publicURL(r.styles).pathname.endsWith('.css'));
    publicURL(r.apiBaseUrl);
    if(r.serviceBaseUrls!==undefined) {check(r.serviceBaseUrls && Object.keys(r.serviceBaseUrls).every(k=>['erp','agenda','clinical'].includes(k)));for(const v of Object.values(r.serviceBaseUrls))publicURL(v);}
  }
  if(input.oidc!==undefined) {
    const o=input.oidc;check(keys(o,['issuer','clientId','redirectUri','postLogoutRedirectUri','scopes','apiAudiences']));
    publicURL(o.issuer);check(typeof o.clientId==='string' && o.clientId && !/\s/u.test(o.clientId));
    for(const k of ['redirectUri','postLogoutRedirectUri'])check(publicURL(o[k]).origin===origin);
    for(const k of ['scopes','apiAudiences'])check(Array.isArray(o[k]) && o[k].length && o[k].every(v=>typeof v==='string' && v && !/\s/u.test(v)) && new Set(o[k]).size===o[k].length);
    check(o.scopes.includes('openid'));
  }
  return input;
}
async function validate(m) {
  check(keys(m,['schemaVersion','version','publicBootConfig','assets','runtimePolicy']) && m.schemaVersion===1 && hex.test(m.version) && m.version===version);
  const c=config(m.publicBootConfig), erp=new URL('.',c.remotes.find(r=>r.id==='erp').entry).href;
  check(Array.isArray(m.assets) && m.assets.length>0 && m.assets.length<=10000);
  const targets=[];let previous='';
  for(const a of m.assets) {
    check(keys(a,['url','sha256','kind']) && hex.test(a.sha256) && Object.hasOwn(mime,a.kind));
    const u=publicURL(a.url);
    check((u.origin===origin || a.url.startsWith(erp)) && !forbidden(u) && u.pathname.endsWith('.'+a.kind) && a.url>previous);
    check(a.kind!=='json' || u.pathname.endsWith('/remoteEntry.json'));
    for(const r of c.remotes)for(const api of [r.apiBaseUrl,...Object.values(r.serviceBaseUrls??{})]) check(a.url!==api && !a.url.startsWith(api+'/'));
    previous=a.url;if(a.kind==='js'||a.kind==='mjs')targets.push(a.url);
  }
  const p=m.runtimePolicy;
  check(p && Object.keys(p).every(k=>['adapter','targets','contracts'].includes(k)) && p.adapter==='native-federation-load-module-v1' && JSON.stringify(p.targets)===JSON.stringify(targets));
  if(p.contracts!==undefined)check(Array.isArray(p.contracts) && new Set(p.contracts).size===p.contracts.length && p.contracts.every(k=>contracts.has(k)));
  check(await digest(new TextEncoder().encode(JSON.stringify({schemaVersion:1,publicBootConfig:c,assets:m.assets,runtimePolicy:p})))===version);
  return m;
}
async function verified(response, asset) {
  check(response && response.ok && ['basic','cors'].includes(response.type) && !response.redirected);
  check(mime[asset.kind].includes((response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()));
  check(await digest(await response.clone().arrayBuffer())===asset.sha256);
  return response;
}
let verifiedMetadata = null;
async function complete(audit = true) {
  if (!audit && verifiedMetadata) return verifiedMetadata;
  if(!(await caches.keys()).includes(name)) { verifiedMetadata = null; return null; }
  const cache=await caches.open(name), response=await cache.match(marker);
  if(!response) { verifiedMetadata = null; return null; }
  try {
    const m=await validate(await response.json());
    const present = new Set((await cache.keys()).map(request => request.url));
    if (present.size !== m.assets.length + 1 || !present.has(marker) || m.assets.some(a => !present.has(a.url))) { verifiedMetadata = null; return null; }
    verifiedMetadata = m;
    return m;
  } catch { verifiedMetadata = null; return null; }
}
async function install() {
  check(hex.test(version??''));
  const prior = await complete();
  try {
    const response=await fetch(`${origin}/erp-public-release.json`,{credentials:'omit',cache:'no-store',redirect:'error'});
    check(response.ok && ['basic','cors'].includes(response.type) && !response.redirected);
    const m=await validate(await response.json());
    const own = m.assets.find(a => a.url === new URL(self.location.pathname, origin).href);
    if (m.runtimePolicy.contracts?.includes('es-module-shims-fetch-v1')) check(own?.kind === 'js');
    if (own) await verified(await fetch(self.location.href,{credentials:'omit',cache:'no-store',redirect:'error',mode:'cors'}),own);
    // Reuse is safe only after checking fresh metadata and the executing URL's
    // published source. A failed maintenance install never deletes a complete cache.
    if (prior) return;
    await caches.delete(name);
    const cache=await caches.open(name), urls=new Set(m.assets.map(a=>a.url));
    for(const a of m.assets) {
      const r=await verified(await fetch(a.url,{credentials:'omit',cache:'no-store',redirect:'error',mode:'cors'}),a);
      if(a.kind==='json') {
        const entry=await r.clone().json();check(keys(entry,['$version','name','shared','exposes']) && entry.$version==='v4' && typeof entry.name==='string' && Array.isArray(entry.shared) && Array.isArray(entry.exposes));
        const base=new URL('.',a.url), moduleURLs=new Set(m.runtimePolicy.targets);
        const target=path=>typeof path==='string' && !/[\\%?#\s]/u.test(path) && urls.has(new URL(path,base).href) && moduleURLs.has(new URL(path,base).href);
        for(const shared of entry.shared) {check(shared && Object.keys(shared).every(k=>['requiredVersion','singleton','strictVersion','version','packageName','entries'].includes(k)) && shared.entries && typeof shared.entries==='object' && !Array.isArray(shared.entries));for(const path of Object.values(shared.entries))check(target(path));}
        for(const exposed of entry.exposes)check(keys(exposed,['key','outFileName']) && typeof exposed.key==='string' && target(exposed.outFileName));
      }
      await cache.put(a.url,r);
    }
    // This marker is the sole publication point, after every verified put.
    await cache.put(marker,new Response(JSON.stringify(m),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
  } catch(error) {if (!prior) await caches.delete(name);throw error;}
}
async function handle(request) {
  const u=new URL(request.url);
  const publicConfig=u.origin===origin && u.pathname==='/platform-config.json';
  const sensitive=request.method!=='GET' || request.headers.has('authorization') || u.search || u.hash || u.pathname.includes('%');
  if(sensitive || (!publicConfig && forbidden(u)))return fetch(request);
  const m=await complete(false);
  if(publicConfig) {
    try{return await fetch(request,{cache:'no-store'});}catch(error){if(!m)throw error;return new Response(JSON.stringify(m.publicBootConfig),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  }
  if(!m)return fetch(request);
  if(u.origin===origin && u.pathname==='/erp-public-release.json')return new Response(JSON.stringify(m),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const a=m.assets.find(x=>x.url===u.href);
  if(a) {
    const r=await (await caches.open(name)).match(a.url);
    if(r)return verified(r,a);
    const net=await fetch(request,{credentials:'omit',cache:'no-store',redirect:'error'});
    return verified(net,a);
  }
  if(request.mode==='navigate' && u.origin===origin && !u.pathname.split('/').pop().includes('.')) {
    const index=m.assets.find(x=>x.url===origin+'/index.html');
    if(index)return verified(await (await caches.open(name)).match(index.url),index);
  }
  if(['script','worker','sharedworker'].includes(request.destination)) {
    const online=m.publicBootConfig.remotes.filter(r=>r.kind==='module').some(r=>u.href.startsWith(new URL('.',r.entry).href));
    if(!online)throw Error('Unlisted public module target');
  }
  return fetch(request);
}
self.addEventListener('install',event=>event.waitUntil(install()));
// No skipWaiting or clients.claim: existing clients retain their pinned version.
self.addEventListener('fetch',event=>event.respondWith(handle(event.request)));
self.addEventListener('message',event=>{
  if(event.data?.type!=='ERP_PUBLIC_STATUS'||!event.ports?.[0])return;
  event.waitUntil((async()=>{const m=await complete();event.ports[0].postMessage(m?{version,complete:true,assets:m.assets,publicBootConfig:m.publicBootConfig,runtimePolicy:m.runtimePolicy}:{version,complete:false,assets:[],publicBootConfig:null,runtimePolicy:null});})());
});
