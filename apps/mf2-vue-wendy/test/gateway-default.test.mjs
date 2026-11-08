import test from 'node:test';
import assert from 'node:assert/strict';
import { createMs3Service } from '../src/api/ms3Api.js';
test('default requests use the gateway public prefix without a private backend port', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return new Response('{}'); });
  await createMs3Service().getCitas();
  assert.deepEqual(calls, ['/api/agendamiento/citas']);
});
