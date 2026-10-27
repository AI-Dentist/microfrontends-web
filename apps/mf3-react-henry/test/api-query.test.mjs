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
