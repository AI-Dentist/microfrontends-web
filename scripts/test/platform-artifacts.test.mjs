import assert from 'node:assert/strict';
import test from 'node:test';
import { serve } from '../platform-artifacts.mjs';

test('release server serves ESM with explicit CORS and never masks missing assets', async t => {
  const server = await serve('scripts/test', { prefix: '/releases/test/', corsOrigin: () => 'http://127.0.0.1:12345' });
  t.after(() => server.close());
  const response = await fetch(`${server.origin}/releases/test/platform.test.mjs`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript');
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:12345');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /unknown commands/);
  for (const path of ['/releases/test/missing.js', '/releases/test/missing.css', '/outside.js']) {
    const missing = await fetch(`${server.origin}${path}`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), '');
  }
});
