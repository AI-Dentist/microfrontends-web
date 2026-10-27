import test from 'node:test';
import assert from 'node:assert/strict';
import { createMs3Service } from '../src/api/ms3Api.js';

test('standalone defaults preserve reads, POST payload and both idempotency keys', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({ citas: [] }) };
  });
  t.mock.method(Date, 'now', () => 123);
  const service = createMs3Service();
  assert.deepEqual(await service.getCitas(), { citas: [] });
  await service.getHorarios();
  await service.getStock();
  await service.crearCita({ paciente_id: 'p1' });
  const base = 'http://localhost:8001/api/agendamiento';
  assert.deepEqual(calls, [
    [`${base}/citas`, { method: 'GET', headers: {} }],
    [`${base}/horarios`, { method: 'GET', headers: {} }],
    [`${base}/stock`, { method: 'GET', headers: {} }],
    [`${base}/citas`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Idempotency-Key': 'key-123',
      'Idempotency-Key': 'key-123',
    }, body: '{"paciente_id":"p1"}' }],
  ]);
});

test('runtime base and token are read on every request without leaking across instances', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return { ok: true, json: async () => ({}) };
  });
  t.mock.method(Date, 'now', () => 456);
  let token = 'first';
  let reads = 0;
  const service = createMs3Service({ apiBaseUrl: 'https://api.example/clinical/',
    getAccessToken: () => { reads++; return token; } });
  assert.equal(reads, 0);
  await service.getCitas();
  token = 'second';
  await service.getHorarios();
  token = null;
  await service.getStock();
  await createMs3Service().getStock();
  token = 'write-session';
  await service.crearCita({ paciente_id: 'p2' });
  assert.equal(reads, 4);
  assert.deepEqual(calls.slice(0, 3), [
    ['https://api.example/clinical/citas', { method: 'GET', headers: { Authorization: 'Bearer first' } }],
    ['https://api.example/clinical/horarios', { method: 'GET', headers: { Authorization: 'Bearer second' } }],
    ['https://api.example/clinical/stock', { method: 'GET', headers: {} }],
  ]);
  assert.deepEqual(calls[3], ['http://localhost:8001/api/agendamiento/stock', { method: 'GET', headers: {} }]);
  assert.deepEqual(calls[4], ['https://api.example/clinical/citas', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': 'key-456',
      'Idempotency-Key': 'key-456', Authorization: 'Bearer write-session' },
    body: '{"paciente_id":"p2"}' }]);
});

for (const base of ['https://api.example/api', '/api']) {
  for (const slash of ['', '/']) {
    test(`query suffix stays after all Vue endpoints: ${base}${slash}`, async (t) => {
      const calls = [];
      t.mock.method(globalThis, 'fetch', async (url) => {
        calls.push(url);
        return { ok: true, json: async () => ({}) };
      });
      const service = createMs3Service({ apiBaseUrl: `${base}${slash}?tenant=one&tag=a%2Fb&tag=two` });
      await service.getCitas();
      await service.getHorarios();
      await service.getStock();
      await service.crearCita({ paciente_id: 'p1' });
      assert.deepEqual(calls, ['citas', 'horarios', 'stock', 'citas'].map(
        endpoint => `${base}/${endpoint}?tenant=one&tag=a%2Fb&tag=two`));
    });
  }
}

test('named legacy ms3Service export retains default factory behavior', async (t) => {
  const { ms3Service } = await import('../src/api/ms3Api.js');
  assert.equal(typeof ms3Service?.getCitas, 'function');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({}) };
  });
  await ms3Service.getCitas();
  assert.deepEqual(calls, ['http://localhost:8001/api/agendamiento/citas']);
});

test('every API operation rejects non-ok HTTP without exposing response credentials', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401,
    json: async () => { throw new Error('must not parse rejected body'); } }));
  const service = createMs3Service();
  for (const operation of ['getCitas', 'getHorarios', 'getStock', 'crearCita']) {
    await assert.rejects(service[operation]({}), { message: 'MS3 request failed (HTTP 401)' });
  }
});
