import {provisionOnlineGrant,OfflineGrantError} from './grant.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const QUERY='mutation ActivateOffline($input:ActivarJornadaOfflineInput!){activarJornadaOffline(input:$input){credencial clavePublicaSpki}}';
export class OfflineActivationError extends Error {
  constructor(code){super(code);this.name='OfflineActivationError';this.code=code;}
}
const failure=code=>{throw new OfflineActivationError(code);};
function snapshot(getter){
  try {
    const value=getter();
    if(!value || !['token','identityIssuer','identitySubject'].every(k=>typeof value[k]==='string'&&value[k])
      || !(typeof value.epoch==='string'&&value.epoch || Number.isSafeInteger(value.epoch))) throw Error();
    // Copy primitives, never retain a mutable host snapshot across an await.
    return Object.freeze({token:value.token,identityIssuer:value.identityIssuer,identitySubject:value.identitySubject,epoch:value.epoch});
  }catch{failure('OFFLINE_ACTIVATION_REQUIRED');}
}
function current(getter,start){
  try{const next=snapshot(getter);if(Object.keys(start).every(k=>next[k]===start[k]))return;}catch{/* Redact host errors. */}
  failure('OFFLINE_ACTIVATION_CHANGED');
}
/** Explicit network-only activation. No PIN, idempotency key, cache or persistence. */
export async function activateOnlineGrant({endpoint,getOnlineContext,workspaceId,deviceId,durationSeconds=28800,nowMs=Date.now,fetcher=globalThis.fetch,signal}={}){
  let url;
  try{url=new URL(endpoint);}catch{failure('OFFLINE_ACTIVATION_INVALID');}
  if(typeof endpoint!=='string' || url.username || url.password || url.search || url.hash
    || !(url.protocol==='https:' || url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))
    || typeof workspaceId!=='string'||!UUID.test(workspaceId)||typeof deviceId!=='string'||!UUID.test(deviceId)
    || !Number.isInteger(durationSeconds)||durationSeconds<1||durationSeconds>28800
    || typeof getOnlineContext!=='function'||typeof fetcher!=='function'||typeof nowMs!=='function')failure('OFFLINE_ACTIVATION_INVALID');
  const start=snapshot(getOnlineContext),controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,15000);
  try{
    const response=await fetcher(url.href,{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+start.token},
      body:JSON.stringify({query:QUERY,variables:{input:{workspaceId,deviceId,durationSeconds}}})});
    current(getOnlineContext,start);
    if(!response.ok||response.redirected)failure('OFFLINE_ACTIVATION_FAILED');
    const reply=await response.json();current(getOnlineContext,start);
    const value=reply?.data?.activarJornadaOffline;
    if(reply.errors || !value || Object.keys(value).length!==2 || typeof value.credencial!=='string'||typeof value.clavePublicaSpki!=='string')failure('OFFLINE_ACTIVATION_FAILED');
    const provisioned=await provisionOnlineGrant({credential:value.credencial,spki:value.clavePublicaSpki,
      identity:{issuer:start.identityIssuer,subject:start.identitySubject},workspaceId,deviceId,nowMs:nowMs(),maxDurationSeconds:durationSeconds});
    current(getOnlineContext,start);
    return Object.freeze({...provisioned,ownerEpoch:start.epoch});
  }catch(error){
    if(error instanceof OfflineActivationError || error instanceof OfflineGrantError)throw error;
    failure('OFFLINE_ACTIVATION_FAILED');
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
