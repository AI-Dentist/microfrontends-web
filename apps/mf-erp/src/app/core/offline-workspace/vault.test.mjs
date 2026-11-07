import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {provisionOnlineGrant} from './grant.mjs';
const api=await import('./vault.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const base=Date.parse('2026-11-07T00:00:00Z'),pin='123456';
const claims={version:1,grantId:'33333333-3333-4333-8333-333333333333',grantIssuer:'https://erp-grant.example',audience:'erp-offline-local-only',erpUserId:'44444444-4444-4444-8444-444444444444',identityIssuer:'https://identity.example',identitySubject:'synthetic-owner-a',role:'ADMIN',capabilities:['CASH','EXPENSES','MANUAL_ORDERS','PATIENTS'],workspaceId:'11111111-1111-4111-8111-111111111111',deviceId:'22222222-2222-4222-8222-222222222222',issuedAt:new Date(base).toISOString(),expiresAt:new Date(base+28800000).toISOString()};
const keys=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const spki=Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64');
async function activation(payload=claims){const input=[{alg:'RS256',typ:'erp-offline-grant+jws',kid:'synthetic'},payload].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');const sig=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input));return{...await provisionOnlineGrant({credential:input+'.'+Buffer.from(sig).toString('base64url'),spki,identity:{issuer:payload.identityIssuer,subject:payload.identitySubject},workspaceId:payload.workspaceId,deviceId:payload.deviceId,nowMs:base+1000}),ownerEpoch:1};}
// Public persistence-port fixture. It accepts/exports ciphertext records only.
class CipherStore {
  envelope=null;records=new Map();writes=0;fault=false;
  async load(){return structuredClone(this.envelope);}
  async create(value){if(this.fault)throw Error('synthetic storage unavailable');if(this.envelope)throw Error('already exists');this.envelope=structuredClone(value);this.writes++;}
  async replaceContext(keyId,revision,context,clock){if(this.fault)throw Error('synthetic storage unavailable');if(this.envelope?.keyId!==keyId||this.envelope.revision!==revision||this.envelope.retired)throw Error('stale');this.envelope.context=structuredClone(context);if(clock)this.envelope.clock=structuredClone(clock);this.envelope.revision++;this.writes++;return this.envelope.revision;}
  async retire(){if(this.fault)throw Error('synthetic storage unavailable');if(this.envelope){this.envelope.retired=true;this.envelope.revision++;this.writes++;}}
  async relink(keyId,revision,context,clock){if(this.fault)throw Error('synthetic');if(this.envelope?.keyId!==keyId||this.envelope.revision!==revision||!this.envelope.retired)throw Error('stale');this.envelope.retired=false;this.envelope.context=structuredClone(context);if(clock)this.envelope.clock=structuredClone(clock);this.envelope.revision++;this.writes++;return this.envelope.revision;}
  async penalize(nowWall){await Promise.resolve();if(this.fault)throw Error('synthetic');const fails=(this.envelope.clock?.fails??0)+1;this.envelope.clock={...(this.envelope.clock??{}),fails,nextAttemptAt:nowWall+Math.min(1000*2**(fails-1),300000)};this.writes++;}
  async clearPenalty(){if(this.fault)throw Error('synthetic');if(this.envelope)this.envelope.clock={...(this.envelope.clock??{}),fails:0,nextAttemptAt:0};this.writes++;}
  exportEncrypted(){return structuredClone({envelope:this.envelope,records:[...this.records]});}
}
async function fixture(){const a=await activation(),scopeId=await api.workspaceScopeId(a.binding),store=new CipherStore();let wall=base+1000,mono=0,identity={issuer:claims.identityIssuer,subject:claims.identitySubject,epoch:1};const options={scopeId,store,clock:{wall:()=>wall,mono:()=>mono},getIdentity:()=>identity};const v=new api.OfflineVault(options);return{a,scopeId,store,v,options,setWall:v=>{wall=v;},setMono:v=>{mono=v;},setIdentity:v=>{identity=v;}};}
test('encrypted PIN vault public API exists without hosted or legacy providers',()=>{assert.equal(typeof api.OfflineVault,'function');assert.equal(typeof api.workspaceScopeId,'function');});
test('correct PIN unlocks a fresh instance; stored material has no plaintext identity, grant or PIN',async()=>{
  const f=await fixture();await f.v.activate(f.a,pin);assert.equal(f.v.state().status,'unlocked');f.v.lock();assert.equal(f.v.state().status,'locked');
  const restored=new api.OfflineVault(f.options);await restored.unlock(pin);assert.equal(restored.state().status,'unlocked');
  const raw=JSON.stringify(f.store.exportEncrypted());for(const secret of [pin,claims.identitySubject,claims.erpUserId,f.a.credential])assert.ok(!raw.includes(secret));
  // Fresh random 96-bit IV per write under a retained salt: wrap and context must differ.
  assert.notEqual(f.store.envelope.wrap.iv,f.store.envelope.context.iv);
  assert.equal(atob(f.store.envelope.wrap.iv).length,12);assert.equal(atob(f.store.envelope.context.iv).length,12);
});
test('fractional device clocks are normalised instead of failing storage',async()=>{
  const a=await activation(),scopeId=await api.workspaceScopeId(a.binding),store=new CipherStore();
  const vault=new api.OfflineVault({scopeId,store,clock:{wall:()=>base+1000.4,mono:()=>0.5},getIdentity:()=>({issuer:claims.identityIssuer,subject:claims.identitySubject,epoch:1})});
  assert.equal((await vault.activate(a,pin)).status,'unlocked');vault.lock();
  const restored=new api.OfflineVault({scopeId,store,clock:{wall:()=>base+1000.9,mono:()=>0.9},getIdentity:()=>({issuer:claims.identityIssuer,subject:claims.identitySubject,epoch:1})});
  assert.equal((await restored.unlock(pin)).status,'unlocked');
});
test('wrong PIN leaves persisted ciphertext, counters and lock state unchanged',async()=>{
  const f=await fixture();await f.v.activate(f.a,pin);f.v.lock();const before=f.store.exportEncrypted();
  await assert.rejects(()=>f.v.unlock('654321'),{code:'OFFLINE_UNLOCK_FAILED'});assert.equal(f.v.state().status,'locked');
  // Ciphertext must not change; only the persisted throttle counter may move.
  assert.equal(f.store.envelope.wrap.cipher,before.envelope.wrap.cipher);assert.equal(f.store.envelope.context.cipher,before.envelope.context.cipher);
  assert.equal(f.store.envelope.clock.fails,1);
});
test('ciphertext tamper and AAD scope relocation cannot unlock',async()=>{
  const f=await fixture();await f.v.activate(f.a,pin);f.v.lock();const original=f.store.exportEncrypted();
  f.store.envelope.context.cipher=(f.store.envelope.context.cipher[0]==='A'?'B':'A')+f.store.envelope.context.cipher.slice(1);
  await assert.rejects(()=>f.v.unlock(pin),{code:'OFFLINE_UNLOCK_FAILED'});assert.equal(f.v.state().status,'locked');
  f.store.envelope=original.envelope;const other=new api.OfflineVault({...f.options,scopeId:'f'.repeat(64)});await assert.rejects(()=>other.unlock(pin),{code:'OFFLINE_UNLOCK_FAILED'});
});
test('another online actor cannot unlock this owner even with the PIN',async()=>{
  const f=await fixture();await f.v.activate(f.a,pin);f.v.lock();f.setIdentity({issuer:claims.identityIssuer,subject:'owner-b',epoch:2});const before=f.store.exportEncrypted();
  await assert.rejects(()=>f.v.unlock(pin),{code:'OFFLINE_UNLOCK_FAILED'});assert.equal(f.v.state().status,'locked');assert.equal(f.store.envelope.wrap.cipher,before.envelope.wrap.cipher);
});
test('exclusive expiry, rollback and monotonic inconsistency clear the live workspace',async()=>{
  for(const kind of ['expiry','rollback','inconsistent']){const f=await fixture();await f.v.activate(f.a,pin);
    if(kind==='expiry')f.setWall(base+28800000);else if(kind==='rollback')f.setWall(base);else f.setMono(-1);
    assert.equal(f.v.state().status,'locked');assert.deepEqual(f.v.state().capabilities,[]);
  }
});
test('logout and principal change retire locally while retaining existing encrypted pending bytes',async()=>{
  for(const event of ['logout','principalChanged']){const f=await fixture();await f.v.activate(f.a,pin);const bytes=Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64');f.store.records.set('opaque-pending',bytes);
    await f.v[event]();assert.equal(f.v.state().status,'locked');assert.equal(f.store.records.get('opaque-pending'),bytes);
    const restored=new api.OfflineVault(f.options);await assert.rejects(()=>restored.unlock(pin),{code:'OFFLINE_RETIRED'});assert.equal(f.store.records.get('opaque-pending'),bytes);
  }
});
test('storage failure cannot report activation or unlocking success',async()=>{
  const f=await fixture();f.store.fault=true;await assert.rejects(()=>f.v.activate(f.a,pin),{code:'OFFLINE_STORAGE_FAILED'});assert.equal(f.v.state().status,'locked');assert.equal(f.store.envelope,null);
  f.store.fault=false;await f.v.activate(f.a,pin);f.v.lock();f.store.fault=true;await assert.rejects(()=>f.v.unlock(pin),{code:'OFFLINE_STORAGE_FAILED'});assert.equal(f.v.state().status,'locked');
});
test('unlock after a persisted clock rollback does not change encrypted state',async()=>{
  const f=await fixture();await f.v.activate(f.a,pin);f.v.lock();f.setWall(base);const before=f.store.exportEncrypted();await assert.rejects(()=>f.v.unlock(pin),{code:'OFFLINE_CLOCK_ROLLBACK'});assert.deepEqual(f.store.exportEncrypted(),before);
});

test('unlock survives a real document restart where mono resets near zero', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  // Document 1: elapsed mono grows while wall advances.
  const doc1 = new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 5000 }, getIdentity: identity });
  await doc1.activate(a, pin);
  doc1.lock();
  // Document 2: performance.now() restarted near zero, wall advanced 2s.
  const doc2 = new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 3000, mono: () => 12 }, getIdentity: identity });
  assert.equal((await doc2.unlock(pin)).status, 'unlocked');
});

test('a wall rollback still fails closed after a document restart', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  await (new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 5000, mono: () => 100 }, getIdentity: identity })).activate(a, pin);
  const restored = new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 5 }, getIdentity: identity });
  await assert.rejects(() => restored.unlock(pin), { code: 'OFFLINE_CLOCK_ROLLBACK' });
});

test('a wrong PIN persists a backoff the correct PIN must respect until it expires', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  let wall = base + 1000;
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  const open = () => new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => 100 }, getIdentity: identity });
  await open().activate(a, pin);
  await assert.rejects(() => open().unlock('000000'), { code: 'OFFLINE_UNLOCK_FAILED' });
  assert.equal(store.envelope.clock.fails, 1, 'failure counter persisted');
  assert.ok(store.envelope.clock.nextAttemptAt > wall, 'backoff persisted against the injected clock');
  await assert.rejects(() => open().unlock(pin), { code: 'OFFLINE_UNLOCK_BACKOFF' });
  wall = store.envelope.clock.nextAttemptAt + 1;
  assert.equal((await open().unlock(pin)).status, 'unlocked');
  assert.equal(store.envelope.clock.fails, 0, 'successful unlock resets the counter');
});

test('clock rollback is distinct from a wrong PIN and does not penalise', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  await new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 9000, mono: () => 100 }, getIdentity: identity }).activate(a, pin);
  const back = new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 10 }, getIdentity: identity });
  await assert.rejects(() => back.unlock(pin), { code: 'OFFLINE_CLOCK_ROLLBACK' });
  assert.equal(store.envelope.clock?.fails ?? 0, 0, 'rollback must not count as a wrong PIN');
});

test('a stationary wall while mono advances is treated as clock tampering', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  let mono = 100;
  await new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => mono }, getIdentity: identity }).activate(a, pin);
  const frozen = new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => mono }, getIdentity: identity });
  await frozen.unlock(pin);
  mono += 120000; // two minutes of monotonic time with the wall frozen
  await assert.rejects(() => frozen.unlock(pin), { code: 'OFFLINE_CLOCK_ROLLBACK' });
});

test('a tampered retired record cannot force an absurd KDF cost', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  await new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 0 }, getIdentity: identity }).activate(a, pin);
  await new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 0 }, getIdentity: identity }).retire();
  store.envelope.kdf.iterations = 100000000;
  const started = Date.now();
  await assert.rejects(() => new api.OfflineVault({ scopeId, store, clock: { wall: () => base + 1000, mono: () => 0 }, getIdentity: identity }).relink(a, pin), { code: 'OFFLINE_UNLOCK_FAILED' });
  assert.ok(Date.now() - started < 2000, 'rejected before running PBKDF2');
});

test('relink enforces backoff and never lowers the persisted wall floor', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  let wall = base + 1000;
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  const open = () => new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => 0 }, getIdentity: identity });
  await open().activate(a, pin);
  await open().retire();
  await open().unlock(pin).catch(() => {});
  await assert.rejects(() => open().unlock('000000'), { code: 'OFFLINE_RETIRED' });
  // A fresh activation re-links; the wall floor must not go backwards.
  const later = base + 50000;
  wall = later;
  const relinked = await open().relink(a, pin);
  assert.equal(relinked.status, 'unlocked');
  assert.ok(store.envelope.clock.maxWall >= later, 'maxWall is monotonic');
});

test('a burst of wrong PINs grows the persisted wait atomically', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const wall = base + 1000;
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  const open = () => new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => 0 }, getIdentity: identity });
  await open().activate(a, pin);
  await Promise.all(Array.from({ length: 5 }, () => open().unlock('000000').catch(() => {})));
  assert.equal(store.envelope.clock.fails, 5, 'every concurrent wrong PIN is counted');
  // Wait grows with the counter: 5th failure waits 2^4 * 1s.
  assert.equal(store.envelope.clock.nextAttemptAt, wall + 16000);
});

test('a wall advancing far slower than mono is treated as tampering', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  let wall = base + 1000, mono = 0;
  const vault = new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => mono }, getIdentity: identity });
  await vault.activate(a, pin);
  await vault.unlock(pin);
  // Two minutes of real monotonic time, but the device wall advanced only 5 seconds.
  mono += 120000; wall += 5000;
  await assert.rejects(() => vault.unlock(pin), { code: 'OFFLINE_CLOCK_ROLLBACK' });
});

test('an interactive unlock reports the exact lock reason while state() degrades quietly', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  let wall = base + 1000, mono = 0;
  const vault = new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => mono }, getIdentity: identity });
  await vault.activate(a, pin);
  mono += 120000; wall += 1000; // mono advances, wall crawls: witness fires
  assert.equal(vault.state().status, 'locked', 'poll degrades quietly');
  await assert.rejects(() => vault.unlock(pin), { code: 'OFFLINE_CLOCK_ROLLBACK' });
});

test('an interactive unlock advances the persisted wall floor', async () => {
  const a = await activation(), scopeId = await api.workspaceScopeId(a.binding), store = new CipherStore();
  const identity = () => ({ issuer: claims.identityIssuer, subject: claims.identitySubject, epoch: 1 });
  let wall = base + 1000;
  const open = () => new api.OfflineVault({ scopeId, store, clock: { wall: () => wall, mono: () => 0 }, getIdentity: identity });
  await open().activate(a, pin);
  const first = store.envelope.clock.maxWall;
  wall = base + 1000 + 7200000;
  await open().unlock(pin);
  assert.ok(store.envelope.clock.maxWall > first, 'floor advanced after a later unlock');
});
