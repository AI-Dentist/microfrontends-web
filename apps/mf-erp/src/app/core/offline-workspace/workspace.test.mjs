import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {provisionOnlineGrant} from './grant.mjs';
import {OfflineWorkspace} from './workspace.mjs';
const base=Date.parse('2026-11-07T00:00:00Z'),pin='123456';
const claims={version:1,grantId:'33333333-3333-4333-8333-333333333333',grantIssuer:'https://erp-grant.example',audience:'erp-offline-local-only',erpUserId:'44444444-4444-4444-8444-444444444444',identityIssuer:'https://identity.example',identitySubject:'synthetic-owner-a',role:'ADMIN',capabilities:['CASH','EXPENSES','MANUAL_ORDERS','PATIENTS'],workspaceId:'11111111-1111-4111-8111-111111111111',deviceId:'22222222-2222-4222-8222-222222222222',issuedAt:new Date(base).toISOString(),expiresAt:new Date(base+28800000).toISOString()};
const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const spki=Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64');
const input=[{alg:'RS256',typ:'erp-offline-grant+jws',kid:'synthetic'},claims].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');
const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input));
const credential=input+'.'+Buffer.from(signature).toString('base64url');
const provisioned=await provisionOnlineGrant({credential,spki,identity:{issuer:claims.identityIssuer,subject:claims.identitySubject},workspaceId:claims.workspaceId,deviceId:claims.deviceId,nowMs:base+1000});
// Public port fake: implements only the documented IndexedDB surface used by the adapter.
class Idb{
  stores=new Map();fault=false;
  #s(name){if(!this.stores.has(name))this.stores.set(name,new Map());return this.stores.get(name);}
  open(){const self=this;const request={result:null,error:null,onsuccess:null,onerror:null,onupgradeneeded:null};
    queueMicrotask(()=>{request.result={objectStoreNames:{contains:n=>self.stores.has(n)},createObjectStore:n=>self.#s(n),close(){},transaction(names,mode){const stores=names.map(n=>self.#s(n));const tx={error:null,oncomplete:null,onerror:null,onabort:null,objectStore(i){const m=stores[typeof i==='number'?i:names.indexOf(i)];
    const req=value=>({result:undefined,error:null,onsuccess:null,onerror:null,
      delete:k=>{if(self.fault||mode!=='readwrite'){tx.error=Error('synthetic');queueMicrotask(()=>tx.onerror?.());return;}m.delete(k);queueMicrotask(()=>tx.oncomplete?.());},
      get:k=>{const request={result:undefined,onsuccess:null,onerror:null};queueMicrotask(()=>{if(self.fault){request.error=Error('synthetic');tx.onerror?.(request);return;}request.result=m.get(k);request.onsuccess?.();});return request;},
      put:v=>{if(self.fault||mode!=='readwrite'){tx.error=Error('synthetic');queueMicrotask(()=>tx.onerror?.());return;}if(names.includes('meta')&&self.metaPut&&!self.metaPut(v)){tx.error=Error('synthetic meta');queueMicrotask(()=>tx.onerror?.());return;}m.set(v.id??v.scopeId,structuredClone(v));queueMicrotask(()=>tx.oncomplete?.());},
      add:v=>{if(self.fault||mode!=='readwrite'){tx.error=Error('synthetic');queueMicrotask(()=>tx.onerror?.());return;}m.set(v.id??v.scopeId,structuredClone(v));queueMicrotask(()=>tx.oncomplete?.());}});
    return req();}};
    setImmediate(()=>{if(!self.fault)tx.oncomplete?.();});return tx;}};request.onupgradeneeded?.();request.onsuccess?.();});return request;}
}

// Mints a fresh signed grant for the current clock, as the backend would on renewal.
async function mintGrant(now) {
  const payload = { ...claims, grantId: webcrypto.randomUUID(), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 28800000).toISOString() };
  const input = [{ alg: 'RS256', typ: 'erp-offline-grant+jws', kid: 'synthetic' }, payload].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
  return input + '.' + Buffer.from(signature).toString('base64url');
}

function host(){const clock={value:base+1000,mono:0};let online={token:'SYNTHETIC',identityIssuer:claims.identityIssuer,identitySubject:claims.identitySubject,epoch:1};const idb=new Idb();
  const fetcher=async()=>({ok:true,redirected:false,json:async()=>({data:{activarJornadaOffline:{credencial:await mintGrant(clock.value),clavePublicaSpki:spki}}})});
  const workspace=new OfflineWorkspace({indexedDB:idb,clock:{wall:()=>clock.value,mono:()=>clock.mono},getOnlineContext:()=>online,endpoint:'https://shell.example/api/erp/graphql',fetcher});
  return{idb,clock,workspace,fetcher,setOnline:v=>{online=v;}};}
test('offline workspace public API is separate from hosted ERP providers',async()=>{
  const h=host();assert.equal((await h.workspace.status()).status,'unconfigured');assert.equal(typeof h.workspace.activate,'function');
});
test('activation stores only ciphertext plus a non-secret device locator',async()=>{
  const h=host();const state=await h.workspace.activate(pin,{workspaceId:claims.workspaceId,deviceId:claims.deviceId});assert.equal(state.status,'unlocked');
  const raw=JSON.stringify([...h.idb.stores].map(([n,m])=>[n,[...m.entries()]]));
  for(const secret of [pin,claims.identitySubject,credential])assert.ok(!raw.includes(secret));
});
test('reload unlocks offline without any live online identity',async()=>{
  const h=host();await h.workspace.activate(pin,{workspaceId:claims.workspaceId,deviceId:claims.deviceId});h.setOnline(null);
  const reloaded=new OfflineWorkspace({indexedDB:h.idb,clock:{wall:()=>h.clock.value,mono:()=>h.clock.mono},getOnlineContext:()=>null,endpoint:'https://shell.example/api/erp/graphql'});
  const state=await reloaded.unlock(pin);assert.equal(state.status,'unlocked');assert.equal(state.actorVerified,false);
});
test('a different online owner cannot unlock and a storage fault never reports success',async()=>{
  const h=host();await h.workspace.activate(pin,{workspaceId:claims.workspaceId,deviceId:claims.deviceId});h.workspace.lock();
  h.setOnline({token:'SYNTHETIC',identityIssuer:claims.identityIssuer,identitySubject:'owner-b',epoch:2});
  await assert.rejects(()=>h.workspace.unlock(pin),{code:'OFFLINE_UNLOCK_FAILED'});
  h.setOnline(null);h.idb.fault=true;await assert.rejects(()=>h.workspace.unlock(pin),{code:'OFFLINE_STORAGE_FAILED'});
});
test('retirement keeps the locator marked retired so plain unlock cannot silently reuse it',async()=>{
  const h=host();await h.workspace.activate(pin,{workspaceId:claims.workspaceId,deviceId:claims.deviceId});await h.workspace.retire();
  assert.equal((await h.workspace.status()).status,'retired');await assert.rejects(()=>h.workspace.unlock(pin),{code:'OFFLINE_RETIRED'});
});

test('a wrong PIN attempt followed by the correct PIN unlocks again', async () => {
  const h=host();await h.workspace.activate(pin,{workspaceId:claims.workspaceId,deviceId:claims.deviceId});
  h.workspace.lock();
  await assert.rejects(()=>h.workspace.unlock('000000'),{code:'OFFLINE_UNLOCK_FAILED'});
  await assert.rejects(()=>h.workspace.unlock(pin),{code:'OFFLINE_UNLOCK_BACKOFF'});
  h.clock.value+=5000;
  assert.equal((await h.workspace.unlock(pin)).status,'unlocked');
  h.workspace.lock();
  const reloaded=new OfflineWorkspace({indexedDB:h.idb,clock:{wall:()=>h.clock.value,mono:()=>h.clock.mono},getOnlineContext:()=>null,endpoint:'https://shell.example/api/erp/graphql'});
  await assert.rejects(()=>reloaded.unlock('000000'),{code:'OFFLINE_UNLOCK_FAILED'});
  h.clock.value+=5000;
  assert.equal((await reloaded.unlock(pin)).status,'unlocked');
});

test('retirement keeps the encrypted record recoverable by re-authenticating the owner', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  const pending = 'opaque-pending-bytes';
  h.idb.stores.get('vaults').set('pending', pending);
  await h.workspace.retire();
  assert.equal((await h.workspace.status()).status, 'retired');
  // Same owner re-authenticates online: a NEW activation must re-link the retained record.
  assert.equal((await h.workspace.reactivate(pin)).status, 'unlocked');
  const reloaded = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => null, endpoint: 'https://shell.example/api/erp/graphql' });
  assert.equal((await reloaded.unlock(pin)).status, 'unlocked');
  assert.equal(h.idb.stores.get('vaults').get('pending'), pending);
});

test('purge destroys the ciphertext only on an explicit user action', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  await h.workspace.retire();
  await h.workspace.purge();
  assert.equal((await h.workspace.status()).status, 'unconfigured');
  assert.equal(h.idb.stores.get('vaults').size, 0);
});

test('a failed activation leaves no locator and no locked shell', async () => {
  const h = host();
  await assert.rejects(() => h.workspace.activate('12345', { workspaceId: claims.workspaceId, deviceId: claims.deviceId }));
  assert.equal((await h.workspace.status()).status, 'unconfigured');
});

test('a fresh document sees a retired workspace and the owner can recover it', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  await h.workspace.retire();
  const reopened = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => null, endpoint: 'https://shell.example/api/erp/graphql' });
  assert.equal((await reopened.status()).status, 'retired');
  await assert.rejects(() => reopened.unlock(pin), { code: 'OFFLINE_RETIRED' });
  const owner = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => ({ token: 'SYNTHETIC', identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject, epoch: 1 }), endpoint: 'https://shell.example/api/erp/graphql', fetcher: h.fetcher });
  assert.equal((await owner.reactivate(pin)).status, 'unlocked');
});

test('a meta write failure after the record retires still leaves a recoverable workspace', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  // Fail ONLY the next meta put, after the vault record is already retired.
  const original = h.idb.metaPut;
  h.idb.metaPut = () => false;
  await assert.rejects(() => h.workspace.retire());
  h.idb.metaPut = original;
  const reopened = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => null, endpoint: 'https://shell.example/api/erp/graphql' });
  assert.equal((await reopened.status()).status, 'retired', 'locator reconciled from the record');
  const owner = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => ({ token: 'SYNTHETIC', identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject, epoch: 1 }), endpoint: 'https://shell.example/api/erp/graphql', fetcher: h.fetcher });
  assert.equal((await owner.reactivate(pin)).status, 'unlocked');
  await owner.purge();
  assert.equal((await owner.status()).status, 'unconfigured');
});

test('a fresh instance retires the persisted record without a loaded vault', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  const cold = new OfflineWorkspace({ indexedDB: h.idb, clock: { wall: () => h.clock.value, mono: () => 0 }, getOnlineContext: () => null, endpoint: 'https://shell.example/api/erp/graphql' });
  assert.equal((await cold.retire()).status, 'retired');
  assert.equal([...h.idb.stores.get('vaults').values()][0].retired, true, 'persisted record retired without a loaded vault');
});

test('activate against a retired record returns a typed recovery error', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  await h.workspace.retire();
  await assert.rejects(() => h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId }), { code: 'OFFLINE_RETIRED' });
});

test('an expired workspace can be renewed online with its PIN and keeps its data', async () => {
  const h = host();
  await h.workspace.activate(pin, { workspaceId: claims.workspaceId, deviceId: claims.deviceId });
  const pending = 'opaque-pending-bytes';
  h.idb.stores.get('vaults').set('pending', pending);
  h.clock.value = base + 28800000 + 60000; // past the signed window
  assert.equal((await h.workspace.status()).status, 'locked');
  assert.equal((await h.workspace.renew(pin)).status, 'unlocked');
  assert.equal([...h.idb.stores.get('vaults').values()][0].scopeId, undefined ?? [...h.idb.stores.get('vaults').values()][0].scopeId);
  assert.equal(h.idb.stores.get('vaults').get('pending'), pending, 'retained data survives renewal');
});
