import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const api=await import('./grant.mjs').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return{};throw error;});
const epoch=Date.parse('2026-11-07T00:00:00.000Z');
const keyOptions={name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'};
const keys=await webcrypto.subtle.generateKey(keyOptions,true,['sign','verify']);
const spki=Buffer.from(await webcrypto.subtle.exportKey('spki',keys.publicKey)).toString('base64');
const claims={version:1,grantId:'33333333-3333-4333-8333-333333333333',grantIssuer:'https://erp-grant.example',audience:'erp-offline-local-only',erpUserId:'44444444-4444-4444-8444-444444444444',identityIssuer:'https://identity.example',identitySubject:'synthetic-subject',role:'ADMIN',capabilities:['CASH','EXPENSES','MANUAL_ORDERS','PATIENTS'],workspaceId:'11111111-1111-4111-8111-111111111111',deviceId:'22222222-2222-4222-8222-222222222222',issuedAt:new Date(epoch).toISOString(),expiresAt:new Date(epoch+28800000).toISOString()};
const authority={spki,kid:'synthetic-rsa',grantIssuer:claims.grantIssuer};
const expected=Object.fromEntries(['erpUserId','identityIssuer','identitySubject','role','capabilities','workspaceId','deviceId'].map(k=>[k,claims[k]]));
async function signed(payload=claims,header={alg:'RS256',typ:'erp-offline-grant+jws',kid:authority.kid}){
  const input=[header,payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input));
  return input+'.'+Buffer.from(signature).toString('base64url');
}
const options=async(payload=claims)=>({credential:await signed(payload),authority,expected,nowMs:epoch+1000});
test('pinned offline grant public API exists independently of JWT authentication',()=>{
  assert.equal(typeof api.verifyPinnedGrant,'function');assert.equal(typeof api.provisionOnlineGrant,'function');
});
test('valid exact eight-hour grant verifies with immutable canonical binding',async()=>{
  const result=await api.verifyPinnedGrant(await options());assert.equal(result.grant.erpUserId,claims.erpUserId);assert.equal(result.expiresAtMs,epoch+28800000);
  assert.ok(Object.isFrozen(result.grant));assert.ok(Object.isFrozen(result.grant.capabilities));assert.deepEqual(result.binding,expected);
});
for(const [role,capabilities]of [['CAJERO',['CASH','EXPENSES','MANUAL_ORDERS']],['RECEPCIONISTA',['MANUAL_ORDERS','PATIENTS']]])test('canonical capability map '+role,async()=>{
  const payload={...claims,role,capabilities},o=await options(payload);o.expected={...expected,role,capabilities};assert.equal((await api.verifyPinnedGrant(o)).grant.role,role);
});
test('a different public key cannot verify the pinned signed document',async()=>{
  const other=await webcrypto.subtle.generateKey(keyOptions,true,['sign','verify']);const otherSpki=Buffer.from(await webcrypto.subtle.exportKey('spki',other.publicKey)).toString('base64');
  const o=await options();await assert.rejects(()=>api.verifyPinnedGrant({...o,authority:{...authority,spki:otherSpki}}),{code:'OFFLINE_GRANT_INVALID'});
});
test('online provisioning pins only the verified authenticated response context',async()=>{
  const result=await api.provisionOnlineGrant({credential:await signed(),spki,identity:{issuer:claims.identityIssuer,subject:claims.identitySubject},workspaceId:claims.workspaceId,deviceId:claims.deviceId,nowMs:epoch+1000});
  assert.deepEqual(result.authority,authority);assert.deepEqual(result.binding,expected);
});
for(const field of ['erpUserId','identityIssuer','identitySubject','role','workspaceId','deviceId'])test('rejects different pinned '+field,async()=>{
  const o=await options();o.expected={...expected,[field]:'different'};await assert.rejects(()=>api.verifyPinnedGrant(o),{code:'OFFLINE_GRANT_INVALID'});
});
test('rejects API JWT type, other algorithm, changed signature and wrong kid',async()=>{
  for(const header of [{alg:'RS256',typ:'JWT',kid:authority.kid},{alg:'HS256',typ:'erp-offline-grant+jws',kid:authority.kid},{alg:'RS256',typ:'erp-offline-grant+jws',kid:'other'}]){
    const o=await options();o.credential=await signed(claims,header);await assert.rejects(()=>api.verifyPinnedGrant(o),{code:'OFFLINE_GRANT_INVALID'});
  }
  const o=await options();const p=o.credential.split('.');p[1]=Buffer.from(JSON.stringify({...claims,identitySubject:'tampered'})).toString('base64url');o.credential=p.join('.');await assert.rejects(()=>api.verifyPinnedGrant(o),{code:'OFFLINE_GRANT_INVALID'});
});
test('rejects wrong authority, capability set and unknown payload fields',async()=>{
  const o=await options();await assert.rejects(()=>api.verifyPinnedGrant({...o,authority:{...authority,grantIssuer:'other'}}),{code:'OFFLINE_GRANT_INVALID'});
  for(const bad of [{...claims,capabilities:['CASH']},{...claims,accessToken:'SYNTHETIC_NOT_A_BEARER'}]){const credential=await signed(bad);await assert.rejects(()=>api.verifyPinnedGrant({...o,credential}),{code:'OFFLINE_GRANT_INVALID'});}
});
test('expiry is exclusive and duration cannot exceed eight hours even by a nanosecond',async()=>{
  const o=await options();await assert.rejects(()=>api.verifyPinnedGrant({...o,nowMs:epoch+28800000}),{code:'OFFLINE_GRANT_EXPIRED'});
  await assert.rejects(()=>api.verifyPinnedGrant({...o,nowMs:epoch-1}),{code:'OFFLINE_GRANT_INVALID'});
  const tooLong={...claims,expiresAt:'2026-11-07T08:00:00.000000001Z'};const credential=await signed(tooLong);await assert.rejects(()=>api.verifyPinnedGrant({...o,credential}),{code:'OFFLINE_GRANT_INVALID'});
});
test('online provisioning rejects coerced canonical actor and role values',async()=>{
  for(const bad of [{...claims,erpUserId:[claims.erpUserId]},{...claims,role:['ADMIN']}]){
    const credential=await signed(bad);
    await assert.rejects(()=>api.provisionOnlineGrant({credential,spki,identity:{issuer:claims.identityIssuer,subject:claims.identitySubject},workspaceId:claims.workspaceId,deviceId:claims.deviceId,nowMs:epoch+1000}),{code:'OFFLINE_GRANT_INVALID'});
  }
});
test('unexpected document encodings, audience and invalid calendar dates fail closed',async()=>{
  const o=await options();for(const credential of [o.credential+'=',o.credential+'..','not-a-document'])await assert.rejects(()=>api.verifyPinnedGrant({...o,credential}),{code:'OFFLINE_GRANT_INVALID'});
  for(const bad of [{...claims,audience:'api'},{...claims,issuedAt:'2026-02-30T00:00:00Z'}]){const credential=await signed(bad);await assert.rejects(()=>api.verifyPinnedGrant({...o,credential}),{code:'OFFLINE_GRANT_INVALID'});}
});
