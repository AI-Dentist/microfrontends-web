import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {webcrypto} from 'node:crypto';
const api=await import('./activation.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const now=Date.parse('2026-11-07T00:00:00Z'),workspaceId='11111111-1111-4111-8111-111111111111',deviceId='22222222-2222-4222-8222-222222222222';
const claims={version:1,grantId:'33333333-3333-4333-8333-333333333333',grantIssuer:'https://erp-grant.example',audience:'erp-offline-local-only',erpUserId:'44444444-4444-4444-8444-444444444444',identityIssuer:'https://identity.example',identitySubject:'owner-a',role:'ADMIN',capabilities:['CASH','EXPENSES','MANUAL_ORDERS','PATIENTS'],workspaceId,deviceId,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+28800000).toISOString()};
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const spki=Buffer.from(await webcrypto.subtle.exportKey('spki',pair.publicKey)).toString('base64');
const head={alg:'RS256',typ:'erp-offline-grant+jws',kid:'synthetic'};
const input=[head,claims].map(o=>Buffer.from(JSON.stringify(o)).toString('base64url')).join('.');
const signature=await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input));
const credential=input+'.'+Buffer.from(signature).toString('base64url');
const body={data:{activarJornadaOffline:{credencial:credential,clavePublicaSpki:spki}}};
const context=()=>({token:'SYNTHETIC_BEARER',identityIssuer:claims.identityIssuer,identitySubject:claims.identitySubject,epoch:1});
async function http(t,handler){const requests=[];const server=createServer(async(req,res)=>{const parts=[];for await(const part of req)parts.push(part);requests.push({method:req.method,headers:req.headers,body:JSON.parse(Buffer.concat(parts).toString())});await handler(req,res);});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>new Promise(ok=>{server.close(ok);server.closeAllConnections();}));return{endpoint:'http://127.0.0.1:'+server.address().port+'/graphql',requests};}
const send=(res,value=body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const args=endpoint=>({endpoint,getOnlineContext:context,workspaceId,deviceId,nowMs:()=>now+1000});
test('explicit online activation public API exists',()=>assert.equal(typeof api.activateOnlineGrant,'function'));
test('actual HTTP activation sends only UUID duration input and transient bearer',async t=>{
  const s=await http(t,(_,res)=>send(res));const r=await api.activateOnlineGrant({...args(s.endpoint),pin:'SHOULD_NEVER_TRAVEL'});
  assert.equal(s.requests.length,1);const req=s.requests[0];assert.equal(req.method,'POST');assert.equal(req.headers.authorization,'Bearer SYNTHETIC_BEARER');assert.equal(req.headers['idempotency-key'],undefined);
  assert.deepEqual(req.body.variables,{input:{workspaceId,deviceId,durationSeconds:28800}});assert.ok(req.body.query.includes('activarJornadaOffline'));
  assert.ok(!JSON.stringify(req.body).includes('SHOULD_NEVER_TRAVEL'));assert.ok(!JSON.stringify(r).includes('SYNTHETIC_BEARER'));assert.equal(r.grant.erpUserId,claims.erpUserId);assert.equal(r.ownerEpoch,1);
});
test('a response cannot extend the explicitly requested duration',async t=>{
  const s=await http(t,(_,res)=>send(res));await assert.rejects(()=>api.activateOnlineGrant({...args(s.endpoint),durationSeconds:1}),{code:'OFFLINE_GRANT_INVALID'});assert.equal(s.requests.length,1);
});
test('missing or expired online capability cannot issue an activation request',async t=>{
  const s=await http(t,(_,res)=>send(res));for(const getOnlineContext of [()=>null,()=>({}),()=>{throw Error('retired');}])await assert.rejects(()=>api.activateOnlineGrant({...args(s.endpoint),getOnlineContext}),{code:'OFFLINE_ACTIVATION_REQUIRED'});
  assert.equal(s.requests.length,0);
});
test('logout or owner replacement during the response cannot provision a workspace',async t=>{
  let release,received;const gate=new Promise(ok=>{release=ok;}),arrived=new Promise(ok=>{received=ok;});const current=context();
  const s=await http(t,async(_,res)=>{received();await gate;send(res);});const pending=api.activateOnlineGrant({...args(s.endpoint),getOnlineContext:()=>current});
  await arrived;current.epoch=2;current.identitySubject='owner-b';release();await assert.rejects(()=>pending,{code:'OFFLINE_ACTIVATION_CHANGED'});assert.equal(s.requests.length,1);
});
test('HTTP and GraphQL errors never masquerade as a successful activation',async t=>{
  for(const [value,status]of [[body,401],[{...body,errors:[{message:'SYNTHETIC_PRIVATE_ERROR'}]},200],[{data:{activarJornadaOffline:null}},200]]){
    const s=await http(t,(_,res)=>send(res,value,status));await assert.rejects(()=>api.activateOnlineGrant(args(s.endpoint)),{code:'OFFLINE_ACTIVATION_FAILED'});assert.equal(s.requests.length,1);
  }
});
test('invalid window or private endpoint input fails before a network request',async t=>{
  const s=await http(t,(_,res)=>send(res));for(const durationSeconds of [0,28801,1.5])await assert.rejects(()=>api.activateOnlineGrant({...args(s.endpoint),durationSeconds}),{code:'OFFLINE_ACTIVATION_INVALID'});
  await assert.rejects(()=>api.activateOnlineGrant({...args(s.endpoint),endpoint:s.endpoint+'?token=SYNTHETIC'}),{code:'OFFLINE_ACTIVATION_INVALID'});assert.equal(s.requests.length,0);
});
