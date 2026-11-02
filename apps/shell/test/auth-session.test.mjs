import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import { createAuthSession } from '../src/auth-session.mjs';

const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', key.publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
const oidc = { issuer: 'https://login.example/realm', clientId: 'mf-erp', redirectUri: 'https://shell.example/auth/callback', postLogoutRedirectUri: 'https://shell.example/', scopes: ['openid', 'profile'], apiAudiences: ['ms-erp', 'ms2-clinico-ia', 'ms3-agenda-stock'] };
const metadata = { issuer: oidc.issuer, authorization_endpoint: 'https://login.example/auth', token_endpoint: 'https://login.example/token', jwks_uri: 'https://login.example/certs', end_session_endpoint: 'https://login.example/logout' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(claims, header = {}) {
  const data = `${encode({ alg: 'RS256', kid: 'test', ...header })}.${encode(claims)}`;
  return data + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(data))).toString('base64url');
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture(options = {}) {
  let time = 1_000_000, transaction, tokenCalls = 0;
  const stored = new Map(), requests = [], navigations = [], history = [], timers = new Map();
  let timerId = 0;
  const storage = { getItem: k => stored.get(k) ?? null, setItem: (k, v) => stored.set(k, v), removeItem: k => stored.delete(k) };
  const f = {
    stored, requests, navigations, history, timers, storage,
    now: () => time, advance: n => { time += n; },
    get tokenCalls() { return tokenCalls; }, get tx() { return transaction; },
    tokenResponse: undefined,
    async tokens({ sub = 'person', nonce = transaction?.nonce, roles = ['ODONTOLOGO', 'RECEPCIONISTA'], id = true, header = {}, ...changes } = {}) {
      const common = { iss: oidc.issuer, sub, iat: Math.floor(time / 1000), exp: Math.floor(time / 1000) + 120, ...changes };
      return { token_type: 'Bearer', access_token: await sign({ ...common, aud: oidc.apiAudiences, azp: oidc.clientId, realm_access: { roles } }), ...(id ? { id_token: await sign({ ...common, aud: oidc.clientId, nonce }, header) } : {}), refresh_token: 'synthetic-refresh-' + tokenCalls };
    },
  };
  const fetch = async (href, init) => {
    requests.push({ href, init });
    if (href.endsWith('/.well-known/openid-configuration')) return { ok: true, json: async () => options.metadata ?? metadata };
    if (href === metadata.jwks_uri) return { ok: true, json: async () => ({ keys: [jwk] }) };
    if (href === metadata.token_endpoint) { tokenCalls++; return { ok: true, json: async () => f.tokenResponse ? f.tokenResponse() : f.tokens() }; }
    throw Error('Unexpected protocol URL');
  };
  f.session = createAuthSession({ oidc: options.unconfigured ? undefined : oidc, pageUrl: 'https://shell.example/', storage, history: { replaceState: (_, __, href) => history.push(href) }, crypto, fetch, now: f.now,
    navigate: href => { navigations.push(href); const u = new URL(href); if (u.pathname === '/auth') transaction = JSON.parse([...stored.values()][0]); },
    setTimer: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id), timeoutMs: 5000 });
  f.login = async () => { await f.session.login('/clinical?tab=1'); return new URL(navigations.at(-1)); };
  f.callback = (extra = '') => f.session.callback(`${oidc.redirectUri}?code=synthetic-code&state=${transaction.state}${extra}`);
  f.authenticated = async () => { await f.login(); await f.callback(); };
  return f;
}
async function requested(f, count) {
  for (let i = 0; i < 100 && f.tokenCalls < count; i++) await Promise.resolve();
  assert.equal(f.tokenCalls, count, 'controlled token request must be in flight');
}
function closed(f) {
  assert.equal(f.session.getAccessToken(), null);
  assert.equal(f.session.snapshot().status === 'authenticated', false);
  assert.deepEqual(f.session.snapshot().roles, []);
  assert.equal(f.session.snapshot().subject, null);
  assert.equal(f.stored.size, 0);
}
for (const configured of [false, true]) test(`denied global storage getter allows ${configured ? 'configured' : 'unconfigured'} startup`, async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const requests = [], navigations = [], history = [];
  let reads = 0;
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() {
      reads++;
      throw new DOMException('Storage denied', 'SecurityError');
    } });
    const session = createAuthSession({ oidc: configured ? oidc : undefined,
      pageUrl: 'https://shell.example/', crypto,
      fetch: async href => {
        requests.push(href);
        assert.equal(href, oidc.issuer + '/.well-known/openid-configuration');
        return { ok: true, json: async () => metadata };
      },
      navigate: href => navigations.push(href),
      history: { replaceState: (_, __, href) => history.push(href) },
    });
    const expected = { status: configured ? 'unauthenticated' : 'unconfigured', subject: null, roles: [] };
    assert.deepEqual(session.snapshot(), expected);
    assert.equal(session.getAccessToken(), null);
    assert.deepEqual(requests, []);
    assert.deepEqual(navigations, []);
    assert.equal(reads, 0, 'startup does not need storage');
    await assert.rejects(session.login('/erp'), { message: 'Authentication failed. Please sign in again.' });
    assert.deepEqual(session.snapshot(), expected);
    assert.equal(session.getAccessToken(), null);
    assert.deepEqual(requests, configured ? [oidc.issuer + '/.well-known/openid-configuration'] : []);
    assert.deepEqual(navigations, []);
    if (configured) {
      assert.ok(reads > 0, 'PKCE persistence encounters the denied getter');
      await assert.rejects(session.callback(oidc.redirectUri + '?code=synthetic&state=missing'));
      assert.deepEqual(history, ['/auth/callback']);
      assert.deepEqual(session.snapshot(), expected);
      assert.equal(session.getAccessToken(), null);
      assert.equal(requests.length, 1, 'no token exchange without persisted PKCE');
      assert.deepEqual(navigations, []);
    } else assert.equal(reads, 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor);
    else delete globalThis.sessionStorage;
    assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), descriptor);
  }
});
test('missing OIDC is unconfigured and never reads legacy storage or fetches', async () => {
  const f = fixture({ unconfigured: true });
  f.storage.getItem = () => { throw Error('No legacy reads'); };
  assert.equal(f.session.snapshot().status, 'unconfigured');
  assert.equal(f.session.getAccessToken(), null);
  await assert.rejects(f.session.login('/erp'));
  assert.equal(f.requests.length, 0);
});
test('PKCE S256, state/nonce and one short-lived transaction only; synchronous getter; replay rejected', async () => {
  const f = fixture(); const u = await f.login();
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('scope'), 'openid profile');
  assert.equal(f.stored.size, 1);
  assert.ok(f.tx.state.length >= 32 && f.tx.nonce.length >= 32 && f.tx.verifier.length >= 43);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(f.tx.verifier))).toString('base64url');
  assert.equal(u.searchParams.get('code_challenge') === challenge, true);
  assert.ok(f.tx.expiresAt - f.now() <= 300000);
  assert.deepEqual(Object.keys(f.tx).sort(), ['expiresAt', 'nonce', 'returnPath', 'state', 'verifier']);
  const path = await f.callback(); assert.equal(path, '/clinical?tab=1');
  assert.equal(f.session.snapshot().status, 'authenticated');
  assert.equal(typeof f.session.getAccessToken(), 'string');
  assert.deepEqual(f.session.snapshot().roles, ['ODONTOLOGO', 'RECEPCIONISTA']);
  assert.equal(f.stored.size, 0);
  const body = f.requests.find(r => r.init?.method === 'POST').init.body;
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('redirect_uri'), oidc.redirectUri);
  assert.equal(body.get('code_verifier') === f.tx.verifier, true);
  await assert.rejects(f.callback()); closed(f);
  assert.equal(f.tokenCalls, 1);
  assert.ok(f.history.every(h => !/[?]/.test(h)));
});
for (const [name, url, advance] of [
  ['missing state', () => `${oidc.redirectUri}?code=c`],
  ['bad state', () => `${oidc.redirectUri}?code=c&state=bad`],
  ['duplicate state', tx => `${oidc.redirectUri}?code=c&state=${tx.state}&state=${tx.state}`],
  ['duplicate code', tx => `${oidc.redirectUri}?code=c&code=d&state=${tx.state}`],
  ['error plus code', tx => `${oidc.redirectUri}?code=c&error=denied&state=${tx.state}`],
  ['expired state', tx => `${oidc.redirectUri}?code=c&state=${tx.state}`, 300001],
  ['foreign callback', tx => `https://evil.example/auth/callback?code=c&state=${tx.state}`],
  ['fragment credentials', tx => `${oidc.redirectUri}?code=c&state=${tx.state}#code=d`],
]) test(`callback rejects ${name} before token exchange or UI privilege`, async () => {
  const f = fixture(); await f.login(); if (advance) f.advance(advance);
  const statuses = []; f.session.subscribe(s => statuses.push(s.status));
  await assert.rejects(f.session.callback(url(f.tx))); closed(f);
  assert.equal(f.tokenCalls, 0);
  assert.equal(statuses.includes('authenticated'), false);
  assert.equal(f.history.at(-1), '/auth/callback');
});
for (const [name, change] of [
  ['nonce', { nonce: 'other' }], ['expiry', { exp: 1000 }], ['signature algorithm', { header: { alg: 'none' } }], ['subject claim', { sub: '' }],
]) test(`invalid signed response (${name}) never creates a session or token storage`, async () => {
  const f = fixture(); await f.login(); f.tokenResponse = () => f.tokens(change);
  let privileged = false; f.session.subscribe(s => { privileged ||= s.status === 'authenticated'; });
  await assert.rejects(f.callback()); closed(f);
  assert.equal(privileged, false); assert.equal(f.tokenCalls, 1);
});
test('untrusted discovery fails before navigation, JWKS or token privileges', async () => {
  const f = fixture({ metadata: { ...metadata, jwks_uri: 'https://evil.example/jwks' } });
  await assert.rejects(f.login()); closed(f);
  assert.equal(f.requests.length, 1); assert.equal(f.navigations.length, 0);
});
test('unsafe return path never creates transaction or network traffic', async () => {
  for (const path of ['//evil.example', 'https://evil.example', '/\\evil', '/auth/callback?code=c']) {
    const f = fixture(); await assert.rejects(f.session.login(path)); closed(f); assert.equal(f.requests.length, 0);
  }
});
test('refresh single flight rotates in RAM; omitted refreshed ID/nonce allowed', async () => {
  const f = fixture(); await f.authenticated();
  const wait = deferred(); f.tokenResponse = () => wait.promise;
  const first = f.session.refresh(), second = f.session.refresh();
  assert.equal(first === second, true);
  wait.resolve(await f.tokens({ id: false })); await Promise.all([first, second]);
  assert.equal(f.tokenCalls, 2); assert.equal(f.stored.size, 0);
  assert.equal(f.session.snapshot().status, 'authenticated');
  f.tokenResponse = () => f.tokens({ nonce: undefined }); await f.session.refresh();
  const posts = f.requests.filter(r => r.init?.method === 'POST');
  assert.equal(posts[2].init.body.get('refresh_token') === 'synthetic-refresh-2', true, 'next exchange uses rotated refresh token');
  assert.equal(f.session.snapshot().status, 'authenticated');
});
test('logout clears gates before navigation; late refresh cannot resurrect principal', async () => {
  const f = fixture(); await f.authenticated(); const wait = deferred(); f.tokenResponse = () => wait.promise;
  const pending = f.session.refresh().catch(() => {}); await requested(f, 2);
  await f.session.logout(); closed(f);
  const u = new URL(f.navigations.at(-1));
  assert.equal(u.origin + u.pathname, metadata.end_session_endpoint);
  assert.equal(u.searchParams.get('post_logout_redirect_uri'), oidc.postLogoutRedirectUri);
  assert.equal(u.searchParams.get('client_id'), oidc.clientId);
  assert.equal(u.searchParams.has('id_token_hint'), true); assert.equal(u.searchParams.has('redirect_uri'), false);
  wait.resolve(await f.tokens()); await pending.catch(() => {}); closed(f);
});
test('late prior-principal refresh cannot clear or replace a new login', async () => {
  const f = fixture(); await f.authenticated(); const wait = deferred(); f.tokenResponse = () => wait.promise;
  const pending = f.session.refresh().catch(() => {}); await requested(f, 2);
  f.tokenResponse = () => f.tokens({ sub: 'new-person' }); await f.authenticated();
  wait.resolve(await f.tokens({ sub: 'person' })); await pending.catch(() => {});
  assert.equal(f.session.snapshot().subject, 'new-person'); assert.equal(f.stored.size, 0);
});
test('refresh principal change or rejection clears all grants', async () => {
  for (const response of [f => f.tokens({ sub: 'other' }), () => Promise.reject(Error('Rejected'))]) {
    const f = fixture(); await f.authenticated(); f.tokenResponse = () => response(f);
    await assert.rejects(f.session.refresh()); closed(f);
  }
});
test('expiry immediately clears synchronous getter, roles, and notifies mount owners', async () => {
  const f = fixture(); await f.authenticated(); const states = []; f.session.subscribe(s => states.push(s.status));
  f.advance(120000); closed(f); assert.equal(states.at(-1), 'unauthenticated');
});
test('storage removal failure cannot keep UI grants alive on logout', async () => {
  const f = fixture(); await f.authenticated();
  const states = []; f.session.subscribe(s => states.push(s.status));
  f.storage.removeItem = () => { throw Error('Storage denied'); };
  await f.session.logout().catch(() => {});
  assert.equal(f.session.getAccessToken(), null);
  assert.equal(states.at(-1), 'unauthenticated');
  assert.equal(f.session.snapshot().subject, null);
});
test('bounded refresh clears grants and aborts even if network ignores cancellation', async () => {
  const f = fixture(); await f.authenticated(); const wait = deferred(); f.tokenResponse = () => wait.promise;
  const pending = f.session.refresh(); const rejection = assert.rejects(pending); await requested(f, 2);
  const timeout = [...f.timers.values()].find(t => t.ms === 5000);
  assert.ok(timeout); timeout.fn(); await rejection; closed(f);
  wait.resolve(await f.tokens()); await Promise.resolve(); closed(f);
});
