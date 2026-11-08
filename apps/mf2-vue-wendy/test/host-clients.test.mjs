import test from 'node:test';
import assert from 'node:assert/strict';
import { createMs3Service } from '../src/api/ms3Api.js';

const ok = body => ({ ok: true, json: async () => body });

function recordFetch(t, respond = () => ok({})) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization });
    return respond(url, options);
  });
  return calls;
}

test('hosted service sends the current host token on every request at the pinned base', async (t) => {
  const calls = recordFetch(t);
  let token = 'host-one';
  const service = createMs3Service({ hosted: true,
    apiBaseUrl: 'https://host.example/agenda/?tenant=a%2Fb', getAccessToken: () => token });
  await service.getCitas();
  token = 'host-two';
  await service.getStock();
  assert.deepEqual(calls, [
    { url: 'https://host.example/agenda/citas?tenant=a%2Fb', authorization: 'Bearer host-one' },
    { url: 'https://host.example/agenda/stock?tenant=a%2Fb', authorization: 'Bearer host-two' },
  ]);
});

for (const [label, getter] of [
  ['null', () => null],
  ['empty', () => ''],
  ['throwing', () => { throw new Error('revoked'); }],
]) {
  test(`hosted ${label} capability rejects every operation with zero HTTP`, async (t) => {
    const calls = recordFetch(t);
    const service = createMs3Service({ hosted: true, apiBaseUrl: '/api/agendamiento',
      getAccessToken: getter });
    for (const operation of ['getCitas', 'getHorarios', 'getStock', 'crearCita']) {
      await assert.rejects(service[operation]({}), { name: 'Ms3CapabilityError' });
    }
    assert.deepEqual(calls, []);
  });
}

test('hosted service rejects a missing getter or base instead of using standalone defaults', () => {
  assert.throws(() => createMs3Service({ hosted: true, apiBaseUrl: '/api' }),
    { name: 'Ms3CapabilityError' });
  assert.throws(() => createMs3Service({ hosted: true, getAccessToken: () => 'x' }),
    { name: 'Ms3CapabilityError' });
});

test('a revoked hosted capability stays retired when the same getter returns a token again', async (t) => {
  const calls = recordFetch(t);
  let token = null;
  const service = createMs3Service({ hosted: true, apiBaseUrl: '/api/agendamiento',
    getAccessToken: () => token });
  await assert.rejects(service.getCitas(), { name: 'Ms3CapabilityError' });
  token = 'same-subject-new-session';
  await assert.rejects(service.getCitas(), { name: 'Ms3CapabilityError' });
  assert.equal(service.retired, true);
  assert.deepEqual(calls, []);
});

test('retire() makes new requests fail closed and already-issued results inert', async (t) => {
  let release;
  const calls = recordFetch(t, () => new Promise(resolve => {
    release = () => resolve(ok({ cita: { id: 'late-old-result' } }));
  }));
  const service = createMs3Service({ hosted: true, apiBaseUrl: '/api/agendamiento',
    getAccessToken: () => 'host-token' });
  const pending = service.crearCita({ paciente_id: 'p1' });
  await new Promise(setImmediate);
  service.retire();
  release();
  await assert.rejects(pending, { name: 'Ms3CapabilityError' });
  await assert.rejects(service.getStock(), { name: 'Ms3CapabilityError' });
  assert.equal(calls.length, 1);
});

test('standalone default keeps working without a token and ignores retirement flags', async (t) => {
  const calls = recordFetch(t);
  const service = createMs3Service();
  await service.getCitas();
  assert.equal(service.retired, false);
  assert.deepEqual(calls, [
    { url: '/api/agendamiento/citas', authorization: undefined },
  ]);
});
