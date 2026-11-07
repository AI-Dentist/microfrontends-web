import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Unit protocol (mock only): controller.postMessage({type:'ERP_PUBLIC_STATUS'},
// [port]) replies on port with {version,complete,assets,publicBootConfig,
// runtimePolicy}. Runtime publishes window.erpPublicRuntime = {ready,version};
// ready becomes false on a rejected target. This is not browser/SW proof.
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const src = fileURLToPath(new URL('../src/', import.meta.url));
const known = 'https://erp.example/v1/routes.js';
const config = { schemaVersion: 1, remotes: [
  { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation', entry: 'https://erp.example/v1/remoteEntry.json', styles: 'https://erp.example/v1/styles.css', apiBaseUrl: 'https://shell.example/api/erp/graphql' },
  ...['operations', 'clinical'].map(id => ({ id, label: id, basePath: `/${id}`, kind: 'module', entry: `https://${id}.example/remote.js`, styles: `https://${id}.example/remote.css`, apiBaseUrl: `https://shell.example/api/${id}` })),
] };
const assets = [{ url: known, sha256: 'a'.repeat(64), kind: 'js' }];
const runtimePolicy = { adapter: 'native-federation-load-module-v1', targets: [known] };
const payload = { schemaVersion: 1, publicBootConfig: config, assets, runtimePolicy };
const release = { ...payload, version: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };

async function startup(controlled, { statusChange = value => value, scriptURL = `https://shell.example/erp-sw.js?release=${release.version}`, changeDuringInit = false } = {}) {
  let finish, fail;
  const booted = new Promise((ok, reject) => { finish = ok; fail = reject; });
  const delegated = [], calls = [], messages = [];
  const shim = async target => { delegated.push(target); return { target }; };
  const controller = controlled ? { scriptURL, postMessage(message, ports) {
    messages.push(message);
    if (message.type === 'ERP_PUBLIC_STATUS') queueMicrotask(() => ports[0].postMessage(statusChange(structuredClone({ version: release.version, complete: true, assets, publicBootConfig: config, runtimePolicy }))));
  } } : null;
  class MessageChannel {
    constructor() {
      this.port1 = { onmessage: null, close() {}, start() {} };
      this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })), close() {} };
    }
  }
  const listeners = new Map();
  const serviceWorker = { controller, ready: Promise.resolve({ active: controller }),
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  const replaceController = next => { serviceWorker.controller = next; for (const listener of listeners.get('controllerchange') ?? []) listener({ type: 'controllerchange' }); };
  const window = { location: new URL('https://shell.example/erp') };
  const context = vm.createContext({ window, document: { querySelector: () => ({ replaceChildren: fail, setAttribute() {} }), createElement: () => ({}) },
    navigator: { serviceWorker },
    location: window.location, MessageChannel, crypto: webcrypto, TextEncoder, TextDecoder, URL, URLSearchParams,
    setTimeout, clearTimeout, queueMicrotask, console, importShim: shim,
    fetch: async url => {
      if (String(url).includes('platform-config.json')) return { ok: true, json: async () => structuredClone(config) };
      if (String(url).includes('erp-public-release.json')) return { ok: true, json: async () => structuredClone(release) };
      throw Error(`Unexpected fetch: ${url}`);
    },
  });
  window.navigator = context.navigator; window.crypto = webcrypto; window.importShim = shim;
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const mod = { exports: {} }; cache.set(path, mod);
    const source = readFileSync(path, 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const local = spec => {
      if (spec === '@angular-architects/native-federation') return { initFederation: async (manifest, options) => { calls.push({ manifest, options, loader: options?.loadModuleFn ?? shim }); if (changeDuringInit) replaceController({ scriptURL }); } };
      if (spec === './bootstrap') return { bootstrap: async value => finish(value) };
      if (spec === './runtime-config.mjs') return { validateConfig: value => value };
      if (spec === './remote-runtime.mjs') return { bounded: value => value };
      if (spec.startsWith('.')) return load(resolve(dirname(path), spec));
      throw Error(`Unexpected dependency: ${spec}`);
    };
    vm.runInContext(`(function(require,module,exports){${js}\n})`, context, { filename: path })(local, mod, mod.exports);
    return mod.exports;
  }
  load(resolve(src, 'main.ts'));
  let timer;
  let bootConfig;
  try { bootConfig = await Promise.race([booted, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('bootstrap barrier not reached')), 1000); })]); }
  finally { clearTimeout(timer); }
  return { calls, delegated, messages, window, shim, bootConfig, replaceController, controller };
}

test('verified controlled public release binds a guard before bootstrap and rejects unlisted federation targets', async () => {
  const state = await startup(true);
  assert.equal(state.calls.length, 1);
  const { loader } = state.calls[0];
  assert.equal(state.window.erpPublicRuntime?.ready, true);
  assert.deepEqual(await loader(known), { target: known });
  assert.deepEqual(state.delegated, [known]);
  for (const target of ['https://erp.example/v1/unknown.js', 'https://evil.example/code.js', 'https://erp.example/api/data.js', 'https://erp.example/auth/login.js', `${known}?token=synthetic`, `${known}#fragment`, 'blob:https://shell.example/id', null]) {
    await assert.rejects(async () => loader(target), `must reject ${target}`);
    assert.deepEqual(state.delegated, [known]);
    assert.equal(state.window.erpPublicRuntime?.ready, false);
  }
});

test('controller change after bootstrap invalidates readiness and rejects the old guard', async () => {
  const state = await startup(true);
  assert.equal(state.window.erpPublicRuntime.ready, true);
  state.replaceController({ scriptURL: state.controller.scriptURL });
  assert.equal(state.window.erpPublicRuntime.ready, false);
  await assert.rejects(async () => state.calls[0].loader(known));
  assert.deepEqual(state.delegated, []);
  state.replaceController(state.controller);
  assert.equal(state.window.erpPublicRuntime.ready, false);
  await assert.rejects(async () => state.calls[0].loader(known));
  assert.deepEqual(state.delegated, []);
});

test('controller change during federation initialization cannot mark a stale guard ready', async () => {
  const state = await startup(true, { changeDuringInit: true });
  assert.equal(state.window.erpPublicRuntime.ready, false);
  await assert.rejects(async () => state.calls[0].loader(known));
  assert.deepEqual(state.delegated, []);
});

test('controller script URL change invalidates the guard before delegation', async () => {
  const state = await startup(true);
  state.controller.scriptURL = 'https://shell.example/erp-sw.js?release=' + '0'.repeat(64);
  await assert.rejects(async () => state.calls[0].loader(known));
  assert.equal(state.window.erpPublicRuntime.ready, false);
  assert.deepEqual(state.delegated, []);
});

for (const [name, options] of [
  ['tampered version', { statusChange: s => ({ ...s, version: '0'.repeat(64) }) }],
  ['unlisted policy', { statusChange: s => ({ ...s, runtimePolicy: { ...s.runtimePolicy, targets: [known, 'https://evil.example/code.js'] } }) }],
  ['invalid controller', { scriptURL: `https://evil.example/erp-sw.js?release=${release.version}` }],
  ['private identity in status', { statusChange: s => ({ ...s, token: 'synthetic' }) }],
]) test(`${name} cannot claim active readiness`, async () => {
  const state = await startup(true, options);
  assert.notEqual(state.window.erpPublicRuntime?.ready, true);
  assert.equal(state.calls[0].options?.loadModuleFn, undefined);
  assert.equal(JSON.stringify(state.window.erpPublicRuntime).includes('synthetic'), false);
});

test('without a controller normal online startup keeps the default loader and remote config', async () => {
  const state = await startup(false);
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].options?.loadModuleFn, undefined);
  assert.equal(state.calls[0].loader, state.shim);
  assert.deepEqual(state.bootConfig, config);
  assert.deepEqual(state.messages, []);
  const target = 'https://other.example/remote.js';
  assert.deepEqual(await state.calls[0].loader(target), { target });
  assert.deepEqual(state.delegated, [target]);
});
