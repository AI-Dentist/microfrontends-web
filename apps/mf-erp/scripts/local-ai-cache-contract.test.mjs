// Public SDK AutoConfig contract with synthetic JSON and an in-memory
// Cache API fixture. NOT browser persistence, ONNX inference, or model evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { env, AutoConfig } from '@huggingface/transformers';

test('SDK guard precedes cache; supported offline configuration reads remote-key cache and denies misses', async () => {
  const original = { ...env };
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const keys = [];
  let opens = 0;
  const denied = [];
  let writes = 0;
  const model = 'fixture/synthetic-config';
  const revision = 'synthetic-revision';
  const remoteKey = `https://huggingface.co/${model}/resolve/${revision}/config.json`;
  const cached = new Map([[remoteKey, JSON.stringify({ model_type: 'bert', hidden_size: 2 })]]);
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: {
    async open(name) {
      assert.equal(name, 'transformers-cache'); opens++;
      return {
        async match(key) { keys.push(key); return cached.has(key) ? new Response(cached.get(key)) : undefined; },
        async put() { writes++; assert.fail('Offline contract must not write cache'); },
      };
    },
  } });
  Object.assign(env, {
    allowLocalModels: false, allowRemoteModels: false, useBrowserCache: true,
    useFS: false, useFSCache: false, useCustomCache: false, logLevel: 50,
    localModelPath: '/models/',
    fetch: async (url) => { denied.push(url); throw new Error('Offline model resource cache miss'); },
  });
  try {
    await assert.rejects(AutoConfig.from_pretrained(model, { revision }), /both local and remote models are disabled/);
    await assert.rejects(AutoConfig.from_pretrained(model, { revision, local_files_only: true }), /Invalid configuration/);
    assert.equal(opens, 0); assert.deepEqual(keys, []); assert.deepEqual(denied, []);
    env.allowLocalModels = true;
    const config = await AutoConfig.from_pretrained(model, { revision });
    assert.equal(config.model_type, 'bert');
    assert.equal(config.hidden_size, 2);
    assert.deepEqual(keys, [`/models/${model}/config.json`, remoteKey]);
    assert.deepEqual(denied, []);
    cached.clear(); keys.length = 0;
    await assert.rejects(AutoConfig.from_pretrained(model, { revision }), /file was not found locally/);
    assert.equal(env.allowRemoteModels, false);
    // Only a local miss reaches the denial hook; no transport function is called.
    assert.deepEqual(denied, [`/models/${model}/config.json`]);
    assert.deepEqual(keys, [`/models/${model}/config.json`, remoteKey]);
    assert.equal(opens, 2);
    assert.equal(writes, 0);
    assert.equal(cached.size, 0);
  } finally {
    Object.assign(env, original);
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else Reflect.deleteProperty(globalThis, 'caches');
  }
  for (const [key, value] of Object.entries(original)) assert.equal(env[key], value, `Restored env.${key}`);
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'caches'), originalCaches);
});
