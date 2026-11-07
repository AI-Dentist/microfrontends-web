// Local-only signed activation documents. Never use this document as API auth.
const TYPE = 'erp-offline-grant+jws';
const AUDIENCE = 'erp-offline-local-only';
const MAX_NS = 28_800_000_000_000n;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const FIELDS = ['version','grantId','grantIssuer','audience','erpUserId','identityIssuer','identitySubject','role','capabilities','workspaceId','deviceId','issuedAt','expiresAt'];
const BINDING = ['erpUserId','identityIssuer','identitySubject','role','capabilities','workspaceId','deviceId'];
const CAPABILITIES = Object.freeze({
  ADMIN: ['CASH','EXPENSES','MANUAL_ORDERS','PATIENTS'],
  CAJERO: ['CASH','EXPENSES','MANUAL_ORDERS'],
  RECEPCIONISTA: ['MANUAL_ORDERS','PATIENTS'],
});
export class OfflineGrantError extends Error {
  constructor(code = 'OFFLINE_GRANT_INVALID') { super(code); this.name = 'OfflineGrantError'; this.code = code; }
}
const fail = () => { throw new OfflineGrantError(); };
function exact(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value,name));
}
const text = value => typeof value === 'string' && value.length > 0;
function sameSet(left, right) {
  return Array.isArray(left) && Array.isArray(right) && new Set(left).size === left.length
    && left.length === right.length && left.every(v => typeof v === 'string' && right.includes(v));
}
function binary(value, url = false) {
  if (!text(value) || value.length > 16_384) fail();
  if (url ? !/^[A-Za-z0-9_-]+$/u.test(value) : !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail();
  const normalized = url ? value.replace(/-/gu,'+').replace(/_/gu,'/') : value;
  const decoded = atob(normalized), canonical = btoa(decoded);
  if ((url ? canonical.replace(/=/gu,'').replace(/\+/gu,'-').replace(/\//gu,'_') : canonical) !== value) fail();
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}
function json(segment) { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(binary(segment,true))); }
function instant(value) {
  if (typeof value !== 'string') fail();
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
  if (!match) fail();
  const milliseconds = Date.parse(match[1]+'Z');
  if (!Number.isSafeInteger(milliseconds) || new Date(milliseconds).toISOString().slice(0,19) !== match[1]) fail();
  return BigInt(milliseconds)*1_000_000n + BigInt((match[2] ?? '').padEnd(9,'0'));
}
function binding(grant) {
  return Object.freeze(Object.fromEntries(BINDING.map(k=>[k,k==='capabilities'?Object.freeze([...grant[k]]):grant[k]])));
}
async function verified(credential, spki, nowMs) {
  if (!text(credential) || credential.length > 32_768 || !Number.isSafeInteger(nowMs) || nowMs < 0) fail();
  const segments = credential.split('.'); if (segments.length !== 3) fail();
  const header = json(segments[0]);
  if (!exact(header,['alg','typ','kid']) || header.alg !== 'RS256' || header.typ !== TYPE || !text(header.kid)) fail();
  const key = await crypto.subtle.importKey('spki',binary(spki),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if (key.algorithm.modulusLength < 2048) fail();
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,binary(segments[2],true),new TextEncoder().encode(segments[0]+'.'+segments[1]));
  if (!valid) fail();
  const grant = json(segments[1]);
  if (!exact(grant,FIELDS) || grant.version !== 1 || grant.audience !== AUDIENCE) fail();
  for (const k of ['grantId','erpUserId','workspaceId','deviceId']) if (typeof grant[k] !== 'string' || !UUID.test(grant[k])) fail();
  for (const k of ['grantIssuer','identityIssuer','identitySubject']) if (!text(grant[k])) fail();
  if (typeof grant.role !== 'string' || !Object.hasOwn(CAPABILITIES,grant.role) || !sameSet(grant.capabilities,CAPABILITIES[grant.role])) fail();
  const start = instant(grant.issuedAt), end = instant(grant.expiresAt), now = BigInt(nowMs)*1_000_000n;
  if (end <= start || end-start > MAX_NS || now < start) fail();
  // Millisecond clocks cannot resolve a fractional last millisecond: expire early,
  // never extend validity by truncating the signed deadline upward.
  if (nowMs >= Number(end/1_000_000n)) throw new OfflineGrantError('OFFLINE_GRANT_EXPIRED');
  const frozen = Object.freeze({...grant,capabilities:Object.freeze([...grant.capabilities])});
  return {header,grant:frozen,binding:binding(frozen),expiresAtMs:Number(end/1_000_000n)};
}
function redacted(error) { if (error instanceof OfflineGrantError) throw error; fail(); }

/** Offline verification requires the complete identity and authority pinned online. */
export async function verifyPinnedGrant({credential,authority,expected,nowMs=Date.now()} = {}) {
  try {
    if (!exact(authority,['spki','kid','grantIssuer']) || !text(authority.kid) || !text(authority.grantIssuer) || !exact(expected,BINDING)) fail();
    const result = await verified(credential,authority.spki,nowMs);
    if (result.header.kid !== authority.kid || result.grant.grantIssuer !== authority.grantIssuer) fail();
    for (const name of BINDING) {
      if (name === 'capabilities' ? !sameSet(expected[name],result.grant[name]) : expected[name] !== result.grant[name]) fail();
    }
    return Object.freeze({grant:result.grant,binding:result.binding,expiresAtMs:result.expiresAtMs});
  } catch (error) { redacted(error); }
}

/**
 * Provision ONLY from the explicit authenticated online activation response.
 * SPKI is supplied by that channel, never by the unverified JWS. Verified kid,
 * issuer and canonical actor become the full pin for subsequent local unlocks.
 */
export async function provisionOnlineGrant({credential,spki,identity,workspaceId,deviceId,nowMs=Date.now()} = {}) {
  try {
    if (!exact(identity,['issuer','subject']) || !text(identity.issuer) || !text(identity.subject)) fail();
    const result = await verified(credential,spki,nowMs);
    if (result.grant.identityIssuer !== identity.issuer || result.grant.identitySubject !== identity.subject
      || result.grant.workspaceId !== workspaceId || result.grant.deviceId !== deviceId) fail();
    const authority = Object.freeze({spki,kid:result.header.kid,grantIssuer:result.grant.grantIssuer});
    return Object.freeze({credential,authority,grant:result.grant,binding:result.binding,expiresAtMs:result.expiresAtMs});
  } catch (error) { redacted(error); }
}
