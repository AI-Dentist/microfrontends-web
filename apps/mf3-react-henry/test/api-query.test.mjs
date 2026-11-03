import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient, httpClient } from '../src/api/client.js';

for (const base of ['https://api.example/api', '/api']) {
  for (const slash of ['', '/']) {
    for (const endpoint of ['health', '/health?view=full&tag=endpoint%2Fvalue']) {
      test(`query suffix joins correctly: ${base}${slash} + ${endpoint}`, async (t) => {
        const calls = [];
        t.mock.method(globalThis, 'fetch', async (url, options) => {
          calls.push([url, options.headers.Authorization]);
          return new Response('{}');
        });
        const apiBaseUrl = `${base}${slash}?tenant=one&tag=base%2Fvalue&tag=two`;
        const expected = `${base}/health?tenant=one&tag=base%2Fvalue&tag=two${endpoint.includes('?') ? '&view=full&tag=endpoint%2Fvalue' : ''}`;
        let token = 'first';
        const client = createHttpClient({ apiBaseUrl, getAccessToken: () => token });
        await client(endpoint);
        token = 'second';
        await client(endpoint);
        await httpClient(endpoint, { apiBaseUrl });
        assert.deepEqual(calls, [[expected, 'Bearer first'], [expected, 'Bearer second'], [expected, undefined]]);
      });
    }
    test(`query-free base preserves endpoint query: ${base}${slash}`, async (t) => {
      const calls = [];
      t.mock.method(globalThis, 'fetch', async (url) => {
        calls.push(url);
        return new Response('{}');
      });
      await createHttpClient({ apiBaseUrl: `${base}${slash}` })('/health?view=full');
      assert.deepEqual(calls, [`${base}/health?view=full`]);
    });
  }
}

for (const [name, client] of [
  ['shared httpClient', () => (endpoint) => httpClient(endpoint, { apiBaseUrl: 'http://h/api' })],
  ['hosted MS2 client', () => createHttpClient({ apiBaseUrl: 'http://h/api', getAccessToken: () => 'token' })],
]) {
  test(`${name} keeps its problem-details text when the body only has an error string`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'custom' }), { status: 400, statusText: 'Bad Request' }));
    await assert.rejects(client()('/a'), (error) => error.status === 400 && error.detail === 'Bad Request');
  });
}

test('MS3 envelope errors map {error} onto the problem details only when asked', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ success: false, error: 'Sin rol.', code: 'FORBIDDEN_ROLE' }), { status: 403, statusText: 'Forbidden' }));
  const agenda = createHttpClient({ apiBaseUrl: 'http://h/api', getAccessToken: () => 'token', envelopeErrors: true });
  await assert.rejects(agenda('/citas'), (error) => error.status === 403 && error.detail === 'Sin rol.' && error.message === 'Sin rol.');
});
