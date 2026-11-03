import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto as crypto } from 'node:crypto';
import { createAuthSession } from '../src/auth-session.mjs';
import * as runtime from '../src/remote-runtime.mjs';

// Only framework metadata/import wiring is adapted; all ModulePage method bodies
// run unchanged. The runtime wrapper retains callbacks but delegates every action.
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const bridge = '__remoteAuthRevocationHarness';
const angular = asModule(`
  export const inject = token => globalThis.${bridge}.inject(token);
  export const signal = value => Object.assign(() => value, { set: next => { value = next; } });
`);
const router = asModule('export class Router {} export class ActivatedRoute {} export class NavigationEnd {}');
const platform = asModule(`
  export const AUTH_SESSION = 'auth', PLATFORM_CONFIG = 'config';
  export const getAccessToken = () => globalThis.${bridge}.auth.getAccessToken();
`);
const remoteRuntime = asModule(`
  export const confinedPath = (...args) => globalThis.${bridge}.runtime.confinedPath(...args);
  export const loadStyles = (...args) => globalThis.${bridge}.runtime.loadStyles(...args);
  export const createRemoteSession = options => {
    globalThis.${bridge}.states.push(options.onState);
    return globalThis.${bridge}.runtime.createRemoteSession(options);
  };
`);
let source = (await readFile(new URL('../src/module-page.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
source = source.replace(/@Component\(\{[\s\S]*?\n\}\)\n/, '')
  .replace(/@ViewChild\('surface', \{ static: true \}\) /, '')
  .replace(/import \{[^\n]+\} from '@angular\/core';/, `import { inject, signal } from '${angular}';`)
  .replace("'@angular/router'", `'${router}'`)
  .replace("import { filter } from 'rxjs';", 'const filter = predicate => predicate;')
  .replace("'./platform'", `'${platform}'`)
  .replace("'./remote-runtime.mjs'", `'${remoteRuntime}'`);
const { ModulePage } = await import(asModule(stripTypeScriptTypes(source, { mode: 'transform' })));
const { Router, ActivatedRoute } = await import(router);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', key.publicKey), kid: 'synthetic', alg: 'RS256', use: 'sig' };
const oidc = { issuer: 'https://login.example/realm', clientId: 'mf-erp', redirectUri: 'https://shell.example/auth/callback', postLogoutRedirectUri: 'https://shell.example/', scopes: ['openid', 'profile'], apiAudiences: ['ms-erp'] };
const metadata = { issuer: oidc.issuer, authorization_endpoint: 'https://login.example/auth', token_endpoint: 'https://login.example/token', jwks_uri: 'https://login.example/certs', end_session_endpoint: 'https://login.example/logout' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(claims) {
  const input = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode(claims)}`;
  return input + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(input))).toString('base64url');
}
function fixture(remoteExtra = {}) {
  let now = 1_000_000, tx, serial = 0, subject = 'same-person', rejectRefresh = false;
  const storage = new Map(), mounts = [], states = [], navigations = [], timers = new Map();
  const auth = createAuthSession({ oidc, pageUrl: 'https://shell.example/', crypto, now: () => now,
    storage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    history: { replaceState() {} }, setTimer: (fn, ms) => { const id = {}; timers.set(id, { fn, ms }); return id; }, clearTimer: id => timers.delete(id),
    navigate: href => { if (new URL(href).pathname === '/auth') tx = JSON.parse([...storage.values()][0]); },
    fetch: async href => {
      if (href.endsWith('/.well-known/openid-configuration')) return { ok: true, json: async () => metadata };
      if (href === metadata.jwks_uri) return { ok: true, json: async () => ({ keys: [jwk] }) };
      assert.equal(href, metadata.token_endpoint);
      if (rejectRefresh) throw Error('Synthetic rejection');
      const common = { iss: oidc.issuer, sub: subject, iat: now / 1000, exp: now / 1000 + 120, jti: String(++serial) };
      const tokens = { token_type: 'Bearer', refresh_token: 'synthetic-refresh', access_token: await sign({ ...common, aud: oidc.apiAudiences, azp: oidc.clientId }), id_token: await sign({ ...common, aud: oidc.clientId, nonce: tx.nonce }) };
      return { ok: true, json: async () => tokens };
    },
  });
  let nextMount = deferred(), navigationListener, unsubscribed = false;
  const routerInstance = { url: '/erp', navigateByUrl: async path => { navigations.push(path); }, events: { pipe: () => ({ subscribe: fn => { navigationListener = fn; return { unsubscribe: () => { unsubscribed = true; } }; } }) } };
  const remote = { id: 'erp', basePath: '/erp', apiBaseUrl: 'https://api.example', entry: asModule(`
    export const contractVersion = 1;
    export const mount = (container, context) => globalThis.${bridge}.mount(container, context);
  `), ...remoteExtra };
  const root = { append() {} };
  const controls = { auth, runtime, states,
    inject: token => token === 'auth' ? auth : token === 'config' ? { remotes: [remote] } : token === Router ? routerInstance : token === ActivatedRoute ? { snapshot: { data: { remoteId: 'erp' } } } : assert.fail('Unexpected injection'),
    mount: (container, context) => {
      const completion = deferred(), started = nextMount; nextMount = deferred();
      const record = { context, container, completion, updates: [], unmounts: 0 };
      record.finish = () => completion.resolve({ update: next => { record.updates.push(next); }, unmount: () => { record.unmounts++; } });
      mounts.push(record); started.resolve(record); return completion.promise;
    },
  };
  globalThis[bridge] = controls;
  const previousDocument = globalThis.document, previousLocation = globalThis.location;
  globalThis.document = { createElement: () => ({ removed: false, remove() { this.removed = true; } }) };
  globalThis.location = { origin: 'https://shell.example' };
  let page;
  return { auth, mounts, states, navigations, storage, timers,
    async login(sub = 'same-person') { subject = sub; rejectRefresh = false; await auth.login('/erp'); await auth.callback(`${oidc.redirectUri}?code=synthetic&state=${tx.state}`); },
    async open() { const started = nextMount.promise; page = new ModulePage(); page.surface = { nativeElement: { attachShadow: () => root } }; page.ngAfterViewInit(); return started; },
    async retry() { const started = nextMount.promise; page.retry(); return started; },
    get page() { return page; },
    navigate: () => navigationListener(),
    expire() { now += 120000; assert.equal(auth.getAccessToken(), null); },
    async reject() { rejectRefresh = true; await assert.rejects(auth.refresh()); },
    async drain() { for (let i = 0; i < 30; i++) await Promise.resolve(); },
    async cleanup() {
      page?.ngOnDestroy(); for (const mount of mounts) mount.finish();
      for (let i = 0; i < 30; i++) await Promise.resolve();
      await auth.logout(); assert.equal(storage.size, 0); assert.equal(timers.size, 0);
      if (page) assert.equal(unsubscribed, true);
      globalThis.document = previousDocument; globalThis.location = previousLocation; delete globalThis[bridge];
    },
  };
}
function retired(f, mount) {
  const before = f.navigations.length;
  const token = mount.context.getAccessToken(); mount.context.onNavigate('/erp/retained');
  // Never include token values in assertion diagnostics, even on failure.
  assert.deepEqual({ staleGetterReturnedNewToken: token !== null, staleNavigation: f.navigations.length - before }, { staleGetterReturnedNewToken: false, staleNavigation: 0 });
}

test('mount context carries a frozen copy of configured service base URLs only when present', async () => {
  const urls = { agenda: 'https://api.example/api/agendamiento', erp: 'https://api.example/api/erp/graphql' };
  const f = fixture({ serviceBaseUrls: urls });
  try {
    await f.login(); const mount = await f.open();
    assert.deepEqual(mount.context.serviceBaseUrls, urls);
    assert.notEqual(mount.context.serviceBaseUrls, urls);
    assert.equal(Object.isFrozen(mount.context.serviceBaseUrls), true);
    mount.finish(); await f.drain(); f.navigate(); await f.drain();
    assert.deepEqual(mount.updates.at(-1).serviceBaseUrls, urls);
  } finally { await f.cleanup(); }
  const plain = fixture();
  try {
    await plain.login(); const mount = await plain.open();
    assert.equal(Object.hasOwn(mount.context, 'serviceBaseUrls'), false);
    mount.finish(); await plain.drain();
  } finally { await plain.cleanup(); }
});

test('C1: logout + destroy + same-subject login cannot revive a held production mount', async () => {
  const f = fixture();
  try {
    await f.login(); const old = await f.open();
    assert.equal(typeof old.context.getAccessToken(), 'string');
    await f.auth.logout(); f.page.ngOnDestroy(); await f.login();
    retired(f, old); old.finish(); await f.drain();
    assert.equal(old.unmounts, 1); assert.equal(old.container.removed, true);
    f.states[0]('ready'); assert.equal(f.page.state(), 'error');
  } finally { await f.cleanup(); }
});

for (const reason of ['logout', 'destroy', 'expiry', 'rejection', 'principal']) test(`C1: ${reason} permanently retires retained capabilities and state callbacks`, async () => {
  const f = fixture();
  try {
    await f.login(); const old = await f.open();
    if (reason === 'logout') await f.auth.logout();
    if (reason === 'destroy') f.page.ngOnDestroy();
    if (reason === 'expiry') f.expire();
    if (reason === 'rejection') await f.reject();
    if (reason === 'principal') await f.login('other-person');
    retired(f, old);
    await f.login(); retired(f, old);
    const before = f.page.state(); f.states[0]('ready'); assert.equal(f.page.state(), before);
    old.finish(); await f.drain(); assert.equal(old.unmounts, 1);
    assert.equal(old.container.removed, true);
  } finally { await f.cleanup(); }
});

test('C1: retry isolates late completion/state; active replacement keeps synchronous refreshed tokens and navigation', async () => {
  const f = fixture();
  try {
    await f.login(); const old = await f.open(), replacement = await f.retry();
    retired(f, old); assert.equal(old.container.removed, true);
    assert.equal(f.page.state(), 'loading');
    f.states[0]('error'); f.states[0]('ready'); assert.equal(f.page.state(), 'loading');
    old.finish(); await f.drain(); assert.equal(old.unmounts, 1); assert.equal(f.page.state(), 'loading');
    replacement.finish(); await f.drain(); assert.equal(f.page.state(), 'ready');
    const first = replacement.context.getAccessToken(); assert.equal(typeof first, 'string');
    await f.auth.refresh(); const refreshed = replacement.context.getAccessToken();
    assert.equal(typeof refreshed, 'string'); assert.equal(refreshed !== first, true);
    assert.equal(refreshed === f.auth.getAccessToken(), true); retired(f, old);
    replacement.context.onNavigate('/erp/current'); replacement.context.onNavigate('/clinical');
    assert.deepEqual(f.navigations, ['/erp/current']);
    f.navigate(); await f.drain(); assert.equal(replacement.updates.length, 1);
    assert.equal(replacement.updates[0].getAccessToken() === refreshed, true);
    await f.auth.logout(); retired(f, replacement); retired(f, { context: replacement.updates[0] });
    await f.drain(); assert.equal(replacement.unmounts, 1);
  } finally { await f.cleanup(); }
});
