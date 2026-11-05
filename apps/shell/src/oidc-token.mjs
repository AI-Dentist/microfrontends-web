// Only native RS256 verification. No token-header URL is ever fetched.
const knownRoles = new Set(['ADMIN', 'CAJERO', 'ODONTOLOGO', 'RECEPCIONISTA']);
// Permit a small issuer clock lead, never an extension of token expiry.
const CLOCK_TOLERANCE_SECONDS = 60;
const invalid = () => { throw Error('OIDC token validation failed'); };
const nonempty = value => typeof value === 'string' && value.length > 0;
const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function trustedMetadata(oidc, metadata) {
  if (!record(metadata) || metadata.issuer !== oidc.issuer) invalid();
  const issuer = new URL(oidc.issuer);
  const result = { issuer: metadata.issuer };
  for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint']) {
    const value = metadata[field];
    if (!nonempty(value) || /[\s\\#]/u.test(value)) invalid();
    let endpoint;
    try { endpoint = new URL(value); } catch { invalid(); }
    if (endpoint.origin !== issuer.origin || endpoint.username || endpoint.password || endpoint.hash) invalid();
    result[field] = endpoint.href;
  }
  if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes('S256')) invalid();
  if (metadata.response_types_supported && !metadata.response_types_supported.includes('code')) invalid();
  return Object.freeze(result);
}

function bytes(part) {
  if (!nonempty(part) || !/^[A-Za-z0-9_-]+$/u.test(part) || part.length % 4 === 1) invalid();
  try {
    return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  } catch { invalid(); }
}
function json(part) {
  try {
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(part)));
    if (!record(result)) invalid();
    return result;
  } catch { invalid(); }
}
function audiences(claim) {
  const values = typeof claim === 'string' ? [claim] : claim;
  if (!Array.isArray(values) || !values.length || values.some(v => !nonempty(v)) || new Set(values).size !== values.length) invalid();
  return values;
}
async function verified(token, { oidc, jwks, crypto, now }) {
  if (!nonempty(token) || token.length > 65536) invalid();
  const parts = token.split('.');
  if (parts.length !== 3) invalid();
  const header = json(parts[0]);
  if (header.alg !== 'RS256' || !nonempty(header.kid) || ['jku', 'x5u', 'jwk', 'x5c', 'crit', 'b64'].some(k => Object.hasOwn(header, k))) invalid();
  if (!Array.isArray(jwks?.keys)) invalid();
  const matches = jwks.keys.filter(k => k.kid === header.kid);
  if (matches.length !== 1) invalid();
  const key = matches[0];
  if (key.kty !== 'RSA' || (key.alg !== undefined && key.alg !== 'RS256') || (key.use !== undefined && key.use !== 'sig') || (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) || Object.hasOwn(key, 'd')) invalid();
  try {
    const publicKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (publicKey.algorithm.modulusLength < 2048) invalid();
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!valid) invalid();
  } catch { invalid(); }
  const claims = json(parts[1]);
  if (claims.iss !== oidc.issuer || !nonempty(claims.sub) || !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.iat) || claims.iat > now + CLOCK_TOLERANCE_SECONDS || claims.iat >= claims.exp) invalid();
  if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + CLOCK_TOLERANCE_SECONDS)) invalid();
  return claims;
}

/** The caller must obtain jwks ONLY through trustedMetadata's jwks_uri. */
export async function verifyTokenSet(tokens, options) {
  if (!Number.isSafeInteger(options.now)) invalid();
  const { oidc, nonce, refresh = false, previous } = options;
  if (!record(tokens) || tokens.token_type?.toLowerCase() !== 'bearer' || !nonempty(tokens.access_token)) invalid();
  if (tokens.refresh_token !== undefined && !nonempty(tokens.refresh_token)) invalid();
  const access = await verified(tokens.access_token, options);
  const resourceAudiences = audiences(access.aud);
  if (!oidc.apiAudiences.every(a => resourceAudiences.includes(a)) || access.azp !== oidc.clientId) invalid();
  let id;
  if (tokens.id_token !== undefined) {
    id = await verified(tokens.id_token, options);
    const clientAudiences = audiences(id.aud);
    if (!clientAudiences.includes(oidc.clientId) || (clientAudiences.length > 1 && id.azp !== oidc.clientId) || (id.azp !== undefined && id.azp !== oidc.clientId)) invalid();
    if ((!refresh || id.nonce !== undefined) && id.nonce !== nonce) invalid();
    if (refresh) {
      if (!previous || id.sub !== previous.subject || id.auth_time !== previous.idClaims.auth_time || id.azp !== previous.idClaims.azp) invalid();
      const originalAudiences = audiences(previous.idClaims.aud);
      if (clientAudiences.length !== originalAudiences.length || !clientAudiences.every(a => originalAudiences.includes(a))) invalid();
    }
    if (id.auth_time !== undefined && (!Number.isSafeInteger(id.auth_time) || id.auth_time > options.now + CLOCK_TOLERANCE_SECONDS)) invalid();
  } else {
    // Core 12.2: refresh may omit ID token; initial login never may.
    if (!refresh || !previous) invalid();
    id = previous.idClaims;
  }
  if (id.sub !== access.sub || (refresh && access.sub !== previous?.subject)) invalid();
  const rawRoles = access.realm_access?.roles;
  const roles = Array.isArray(rawRoles) ? [...new Set(rawRoles.filter(r => knownRoles.has(r)))] : [];
  return Object.freeze({ subject: access.sub, roles: Object.freeze(roles), expiresAt: access.exp * 1000,
    idClaims: Object.freeze({ ...id }), accessToken: tokens.access_token,
    idToken: tokens.id_token ?? previous?.idToken,
    refreshToken: tokens.refresh_token ?? (refresh ? previous?.refreshToken : undefined) });
}
