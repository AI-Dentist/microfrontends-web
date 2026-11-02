import { validateOidc } from './runtime-config.mjs';
import { confinedPath } from './remote-runtime.mjs';
import { trustedMetadata, verifyTokenSet } from './oidc-token.mjs';

const transactionKey = 'platform.oidc.pkce.v1';
const transactionLifetime = 300000;
const failure = () => Error('Authentication failed. Please sign in again.');
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');

/** One tab, one principal. Only the short-lived PKCE transaction is persisted. */
export function createAuthSession({ oidc: input, pageUrl = globalThis.location?.href,
  storage, history = globalThis.history,
  crypto = globalThis.crypto, fetch = globalThis.fetch,
  now = Date.now, navigate = href => globalThis.location.assign(href),
  setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 10000 } = {}) {
  const oidc = input ? validateOidc(input, pageUrl) : undefined;
  const origin = new URL(pageUrl).origin;
  let generation = 0, current = null, nonce, metadata, pendingRefresh;
  let expiryTimer, refreshTimer;
  const listeners = new Set(), controllers = new Set();
  const state = () => Object.freeze({ status: current ? 'authenticated' : oidc ? 'unauthenticated' : 'unconfigured', subject: current?.subject ?? null, roles: Object.freeze([...(current?.roles ?? [])]) });
  const notify = () => { const next = state(); for (const listener of listeners) listener(next); };
  // Acquire browser storage only inside protected transaction operations.
  const transactionStorage = () => storage === undefined ? globalThis.sessionStorage : storage;
  const removeTransaction = () => { if (oidc) transactionStorage().removeItem(transactionKey); };
  function clear() {
    generation++;
    current = null; nonce = undefined; pendingRefresh = undefined;
    clearTimer(expiryTimer); clearTimer(refreshTimer);
    for (const controller of controllers) controller.abort();
    controllers.clear();
    // Revocation and mount notifications must not depend on browser storage access.
    // Callback consumption remains strict: removal failure prevents code exchange.
    try { removeTransaction(); } catch { /* Storage denial cannot retain RAM grants. */ }
    notify();
  }
  function fresh() {
    if (current && now() >= current.expiresAt) clear();
    return current;
  }
  function path(value) {
    if (typeof value !== 'string' || value.startsWith('/auth/') || !confinedPath(value, '', origin)) throw failure();
    return value;
  }
  function guard(expected) { if (generation !== expected) throw failure(); }
  async function bounded(work) {
    const controller = new AbortController(); controllers.add(controller);
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => work(controller.signal)),
        new Promise((_, reject) => { timer = setTimer(() => { controller.abort(); reject(failure()); }, timeoutMs); }),
      ]);
    } finally { clearTimer(timer); controllers.delete(controller); }
  }
  async function request(href, init = {}) {
    const response = await fetch(href, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw failure();
    return response.json();
  }
  async function discover(signal) {
    if (!metadata) {
      const result = await request(oidc.issuer.replace(/\/$/u, '') + '/.well-known/openid-configuration', { signal });
      metadata = trustedMetadata(oidc, result);
    }
    return metadata;
  }
  function random() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
  function schedule() {
    clearTimer(expiryTimer); clearTimer(refreshTimer);
    const remaining = current.expiresAt - now();
    expiryTimer = setTimer(() => { if (current) clear(); }, Math.max(0, remaining));
    if (current.refreshToken) refreshTimer = setTimer(() => { void refresh().catch(() => {}); }, Math.max(0, remaining - Math.min(30000, remaining / 2)));
  }
  async function exchange(body, expected, txNonce, previous) {
    const result = await bounded(async signal => {
      const endpoints = await discover(signal); guard(expected);
      const tokens = await request(endpoints.token_endpoint, { method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      guard(expected);
      const jwks = await request(endpoints.jwks_uri, { signal }); guard(expected);
      return verifyTokenSet(tokens, { oidc, jwks, crypto, now: Math.floor(now() / 1000), nonce: txNonce, refresh: !!previous, previous });
    });
    guard(expected);
    if (result.expiresAt <= now()) throw failure();
    current = result; nonce = txNonce; schedule(); notify();
  }
  async function login(returnPath = '/') {
    if (!oidc) throw failure();
    const target = path(returnPath);
    clear(); const expected = generation;
    try {
      const endpoints = await bounded(signal => discover(signal)); guard(expected);
      const tx = { state: random(), nonce: random(), verifier: random(), expiresAt: now() + transactionLifetime, returnPath: target };
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tx.verifier))));
      guard(expected); transactionStorage().setItem(transactionKey, JSON.stringify(tx));
      const href = new URL(endpoints.authorization_endpoint);
      for (const [key, value] of Object.entries({ client_id: oidc.clientId, redirect_uri: oidc.redirectUri, response_type: 'code', scope: oidc.scopes.join(' '), state: tx.state, nonce: tx.nonce, code_challenge: challenge, code_challenge_method: 'S256' })) href.searchParams.set(key, value);
      navigate(href.href);
    } catch { if (generation === expected) clear(); throw failure(); }
  }
  async function callback(href) {
    if (!oidc) throw failure();
    const expected = ++generation;
    current = null; pendingRefresh = undefined;
    clearTimer(expiryTimer); clearTimer(refreshTimer); notify();
    // Always remove credentials, even malformed/foreign callback parameters.
    history.replaceState(null, '', new URL(oidc.redirectUri).pathname);
    let raw;
    try { raw = transactionStorage().getItem(transactionKey); } finally { removeTransaction(); }
    try {
      const tx = JSON.parse(raw);
      const url = new URL(href), configured = new URL(oidc.redirectUri);
      if (url.origin !== configured.origin || url.pathname !== configured.pathname || url.hash || url.username || url.password) throw failure();
      for (const key of url.searchParams.keys()) {
        if (!['code', 'state', 'session_state', 'iss'].includes(key) || url.searchParams.getAll(key).length !== 1) throw failure();
      }
      if (!tx || typeof tx !== 'object' || !Number.isSafeInteger(tx.expiresAt) || tx.expiresAt <= now() || tx.expiresAt > now() + transactionLifetime || !/^[A-Za-z0-9_-]{43}$/u.test(tx.state) || !/^[A-Za-z0-9_-]{43}$/u.test(tx.nonce) || !/^[A-Za-z0-9_-]{43}$/u.test(tx.verifier)) throw failure();
      if (!url.searchParams.get('code') || url.searchParams.get('state') !== tx.state || (url.searchParams.has('iss') && url.searchParams.get('iss') !== oidc.issuer)) throw failure();
      const returnPath = path(tx.returnPath);
      const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: oidc.clientId, redirect_uri: oidc.redirectUri, code: url.searchParams.get('code'), code_verifier: tx.verifier });
      await exchange(body, expected, tx.nonce);
      return returnPath;
    } catch { if (generation === expected) clear(); throw failure(); }
  }
  // Intentionally not async: concurrent callers receive the same Promise.
  function refresh() {
    if (pendingRefresh) return pendingRefresh;
    const previous = fresh();
    if (!previous?.refreshToken) { if (previous) clear(); return Promise.reject(failure()); }
    const expected = generation, originalNonce = nonce;
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: oidc.clientId, refresh_token: previous.refreshToken });
    const work = exchange(body, expected, originalNonce, previous).catch(() => {
      if (generation === expected) clear();
      throw failure();
    }).finally(() => { if (pendingRefresh === work) pendingRefresh = undefined; });
    pendingRefresh = work;
    return work;
  }
  async function logout() {
    const idToken = current?.idToken, endpoints = metadata;
    clear();
    if (oidc && endpoints) {
      const href = new URL(endpoints.end_session_endpoint);
      href.searchParams.set('client_id', oidc.clientId);
      href.searchParams.set('post_logout_redirect_uri', oidc.postLogoutRedirectUri);
      if (idToken) href.searchParams.set('id_token_hint', idToken);
      navigate(href.href);
    }
  }
  return Object.freeze({ login, callback, refresh, logout,
    snapshot() { fresh(); return state(); },
    getAccessToken() { return fresh()?.accessToken ?? null; },
    subscribe(listener) { listeners.add(listener); listener(state()); return () => listeners.delete(listener); },
  });
}
