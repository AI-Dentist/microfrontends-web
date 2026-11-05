import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/api/ms3Api.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE = 'https://host.example/api/agendamiento';
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

// Responses shaped exactly like the MS3 controllers (CitaController, HorarioController, StockController).
const cita = { id: 'c-1', idempotency_key: 'k', odontologo_id: 'o-1', consultorio_id: 'k-1',
  paciente_id: 'p-1', fecha_hora: '2030-01-02 09:00:00', estado: 'RESERVADA' };

function hosted(t, respond) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers,
      body: options.body === undefined ? undefined : JSON.parse(options.body) });
    return respond(url, options);
  });
  const service = api.createMs3Service({ hosted: true, apiBaseUrl: BASE, getAccessToken: () => 'tok' });
  return { service, calls };
}

test('crearCita sends a random UUID Idempotency-Key and returns the success envelope', async (t) => {
  const { service, calls } = hosted(t, () => reply(201, { success: true, data: cita,
    idempotente: false, mensaje: 'Cita reservada con éxito.', timestamp: 'x' }));
  const body = await service.crearCita({ paciente_id: 'p-1' });
  assert.match(calls[0].headers['Idempotency-Key'], UUID);
  assert.equal(calls[0].headers['X-Idempotency-Key'], calls[0].headers['Idempotency-Key']);
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.deepEqual(api.envelopeData(body), cita);
  assert.equal(body.idempotente, false);
});

test('an explicit idempotency key is sent verbatim', async (t) => {
  const { service, calls } = hosted(t, () => reply(200, { success: true, data: cita, idempotente: true }));
  await service.crearCita({ paciente_id: 'p-1' }, { idempotencyKey: 'intent-key' });
  assert.equal(calls[0].headers['Idempotency-Key'], 'intent-key');
});

test('an intent keeps its key across retries of the same payload and renews otherwise', () => {
  const keys = ['a', 'b', 'c', 'd'];
  const intent = api.createIntent(() => keys.shift());
  const payload = { paciente_id: 'p-1', fecha_hora: '2030-01-02 09:00:00' };
  assert.equal(intent.key(payload), 'a');
  assert.equal(intent.key({ ...payload }), 'a');
  assert.equal(intent.key({ ...payload, fecha_hora: '2030-01-02 10:00:00' }), 'b');
  intent.renew();
  assert.equal(intent.key({ ...payload, fecha_hora: '2030-01-02 10:00:00' }), 'c');
  assert.match(api.createIntent().key(payload), UUID);
});

for (const [label, status, body, expected] of [
  ['409 collision', 409, { success: false, error: 'Conflicto de horario: ocupado.', code: 'SCHEDULE_COLLISION' },
    { status: 409, code: 'SCHEDULE_COLLISION', message: 'Conflicto de horario: ocupado.' }],
  ['422 domain validation', 422, { success: false, error: 'Error de validación de campos para la cita.',
    code: 'INVALID_APPOINTMENT_DATA', errors: { paciente_id: ['required'] } },
    { status: 422, code: 'INVALID_APPOINTMENT_DATA', message: 'Error de validación de campos para la cita.' }],
  ['422 framework validation without code', 422, { message: 'The nueva fecha hora field is required.',
    errors: { nueva_fecha_hora: ['The nueva fecha hora field is required.'] } },
    { status: 422, code: 'HTTP_422', message: 'The nueva fecha hora field is required.' }],
  ['403 role', 403, { success: false, error: 'Acceso denegado', code: 'FORBIDDEN_ROLE' },
    { status: 403, code: 'FORBIDDEN_ROLE', message: 'Acceso denegado' }],
]) {
  test(`${label} surfaces the backend code and message`, async (t) => {
    const { service } = hosted(t, () => reply(status, body));
    await assert.rejects(service.crearCita({}), (error) => {
      assert.equal(error.name, 'Ms3ApiError');
      assert.equal(error.status, expected.status);
      assert.equal(error.code, expected.code);
      assert.equal(error.message, expected.message);
      assert.deepEqual(error.errors, body.errors);
      return true;
    });
  });
}

test('describeError distinguishes conflict from validation and lists field errors', () => {
  const conflict = new api.Ms3ApiError({ status: 409, code: 'SCHEDULE_COLLISION', message: 'ocupado' });
  const validation = new api.Ms3ApiError({ status: 422, code: 'INVALID_HORARIO_DATA', message: 'inválido',
    errors: { fecha: ['must be a date', 'required'] } });
  assert.equal(api.describeError(conflict), 'Conflict (SCHEDULE_COLLISION): ocupado');
  assert.equal(api.describeError(validation),
    'Validation failed (INVALID_HORARIO_DATA): inválido — fecha: must be a date, required');
  assert.equal(api.describeError(new api.Ms3ApiError({ status: 500, code: 'X', message: 'boom' })),
    'Request failed (HTTP 500, X): boom');
  assert.equal(api.describeError(new Error('offline')), 'offline');
});

test('non-JSON error bodies fall back to the HTTP status', async (t) => {
  const { service } = hosted(t, () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }));
  await assert.rejects(service.getStock(), { name: 'Ms3ApiError', status: 502, code: 'HTTP_502',
    message: 'MS3 request failed (HTTP 502)' });
});

test('appointment transitions use the real MS3 verbs, paths and bodies', async (t) => {
  const { service, calls } = hosted(t, () => reply(200, { success: true, data: { ...cita, estado: 'CANCELADA' }, mensaje: 'ok' }));
  await service.cancelarCita('c 1/x');
  await service.reprogramarCita('c-1', '2030-02-03 10:00:00');
  await service.noAsistio('c-1');
  assert.deepEqual(calls.map(({ url, method, body }) => [url, method, body]), [
    [`${BASE}/citas/c%201%2Fx/cancelar`, 'PATCH', undefined],
    [`${BASE}/citas/c-1/reprogramar`, 'PUT', { nueva_fecha_hora: '2030-02-03 10:00:00' }],
    [`${BASE}/citas/c-1/no-asistio`, 'PATCH', undefined],
  ]);
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers['Idempotency-Key'], undefined);
});

test('completion sends stock consumption only when the caller lists insumos explicitly', async (t) => {
  const { service, calls } = hosted(t, () => reply(200, { success: true, data: { ...cita, estado: 'COMPLETADA' },
    insumos_descontados: 0, movimientos: [], mensaje: 'ok' }));
  await service.completarCita('c-1');
  await service.completarCita('c-1', { insumos: [{ insumo_id: 'i-1', cantidad: 2 }], motivo: 'Resina' });
  assert.deepEqual(calls.map(({ url, method, body }) => [url, method, body]), [
    [`${BASE}/citas/c-1/completar`, 'PATCH', {}],
    [`${BASE}/citas/c-1/completar`, 'PATCH', { insumos: [{ insumo_id: 'i-1', cantidad: 2 }], motivo: 'Resina' }],
  ]);
  assert.equal(calls.length, 2, 'no stock movement request is ever made implicitly');
});

test('hours creation posts the backend fields; movements validate type and quantity before HTTP', async (t) => {
  const { service, calls } = hosted(t, () => reply(201, { success: true, data: {}, mensaje: 'ok' }));
  const horario = { odontologo_id: 'u', consultorio_id: 'v', especialidad: 'Endodoncia',
    fecha: '2030-01-02', hora_inicio: '08:00', hora_fin: '12:00', disponible: true };
  await service.crearHorario(horario);
  await service.registrarMovimiento({ insumo_id: 'i-1', tipo_movimiento: 'AJUSTE', cantidad: 3,
    motivo: 'Conteo', direccion: 'DECREMENTO' });
  assert.deepEqual(calls.map(({ url, method, body }) => [url, method, body]), [
    [`${BASE}/horarios`, 'POST', horario],
    [`${BASE}/stock/movimientos`, 'POST', { insumo_id: 'i-1', tipo_movimiento: 'AJUSTE', cantidad: 3,
      motivo: 'Conteo', direccion: 'DECREMENTO' }],
  ]);
  for (const bad of [{ tipo_movimiento: 'DESCONTAR' }, { cantidad: 0 }, { cantidad: 1.5 }, { motivo: '' }]) {
    await assert.rejects(service.registrarMovimiento({ insumo_id: 'i-1', tipo_movimiento: 'ENTRADA_COMPRA',
      cantidad: 1, motivo: 'x', ...bad }), { name: 'Ms3ApiError', status: 422 });
  }
  assert.equal(calls.length, 2);
});

test('list readers accept the data envelope and the legacy top-level keys', () => {
  assert.deepEqual(api.listFrom({ success: true, data: { insumos: [{ id: 'i' }] }, insumos: [] }, 'insumos'), [{ id: 'i' }]);
  assert.deepEqual(api.listFrom({ citas: [{ id: 'c' }] }, 'citas'), [{ id: 'c' }]);
  assert.deepEqual(api.listFrom({}, 'citas'), []);
});

test('role hint reads realm_access.roles from the token payload and fails false on garbage', () => {
  const token = roles => `h.${Buffer.from(JSON.stringify({ realm_access: { roles } })).toString('base64url')}.s`;
  assert.equal(api.hasRole(token(['ADMIN']), 'ADMIN'), true);
  assert.equal(api.hasRole(token(['ROLE_ADMIN']), 'ADMIN'), true);
  assert.equal(api.hasRole(token(['RECEPCIONISTA']), 'ADMIN'), false);
  assert.equal(api.hasRole('garbage', 'ADMIN'), false);
  assert.equal(api.hasRole(null, 'ADMIN'), false);
});

test('hosted fail-closed rules cover every new operation', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return reply(200, {}); });
  const service = api.createMs3Service({ hosted: true, apiBaseUrl: BASE, getAccessToken: () => null });
  for (const [operation, args] of [['cancelarCita', ['c']], ['reprogramarCita', ['c', 'x']],
    ['completarCita', ['c']], ['noAsistio', ['c']], ['crearHorario', [{}]],
    ['registrarMovimiento', [{ insumo_id: 'i', tipo_movimiento: 'AJUSTE', cantidad: 1, motivo: 'm' }]]]) {
    await assert.rejects(service[operation](...args), { name: 'Ms3CapabilityError' });
  }
  assert.deepEqual(calls, []);
});

test('late results of new operations are inert after retirement', async (t) => {
  let release;
  const { service } = hosted(t, () => new Promise(resolve => { release = () => resolve(reply(200, { success: true, data: cita })); }));
  const pending = service.cancelarCita('c-1');
  await new Promise(setImmediate);
  service.retire();
  release();
  await assert.rejects(pending, { name: 'Ms3CapabilityError' });
});

test('query suffix is preserved on new endpoints', async (t) => {
  const urls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { urls.push(url); return reply(200, { success: true, data: {} }); });
  const service = api.createMs3Service({ hosted: true, apiBaseUrl: `${BASE}/?tenant=a%2Fb`, getAccessToken: () => 'tok' });
  await service.cancelarCita('c-1');
  await service.registrarMovimiento({ insumo_id: 'i', tipo_movimiento: 'ENTRADA_COMPRA', cantidad: 1, motivo: 'm' });
  assert.deepEqual(urls, [`${BASE}/citas/c-1/cancelar?tenant=a%2Fb`, `${BASE}/stock/movimientos?tenant=a%2Fb`]);
});

test('manual movement optional key sends only the canonical header and preserves the exact request', async (t) => {
  const movement = { insumo_id: 'fixture-i', tipo_movimiento: 'AJUSTE', cantidad: 2,
    motivo: 'Conteo ficticio', direccion: 'DECREMENTO' };
  const envelope = { success: true, data: { id: 'fixture-m', fecha: '2030-01-02 09:00:00', ...movement } };
  const { service, calls } = hosted(t, () => reply(201, envelope));
  assert.deepEqual(await service.registrarMovimiento(movement, { idempotencyKey: 'fixture-intent' }), envelope);
  assert.deepEqual(calls, [{ url: `${BASE}/stock/movimientos`, method: 'POST', body: movement,
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'fixture-intent', Authorization: 'Bearer tok' } }]);
  assert.equal(calls[0].headers['X-Idempotency-Key'], undefined, 'never send both aliases');
});

test('legacy one-argument manual movement keeps the exact body and headers without a key', async (t) => {
  const movement = { insumo_id: 'fixture-i', tipo_movimiento: 'ENTRADA_COMPRA', cantidad: 2, motivo: 'Conteo ficticio' };
  const envelope = { success: true, data: { id: 'fixture-legacy', ...movement } };
  const { service, calls } = hosted(t, () => reply(201, envelope));
  assert.deepEqual(await service.registrarMovimiento(movement), envelope);
  assert.deepEqual(calls, [{ url: `${BASE}/stock/movimientos`, method: 'POST', body: movement,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' } }]);
});

test('standalone default movement stays anonymous and keyless for the legacy call', async (t) => {
  const calls = [];
  const movement = { insumo_id: 'fixture-i', tipo_movimiento: 'SALIDA_PROCEDIMIENTO', cantidad: 1, motivo: 'Uso ficticio' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: JSON.parse(options.body) });
    return reply(201, { success: true, data: { id: 'fixture-standalone', ...movement } });
  });
  const result = await api.ms3Service.registrarMovimiento(movement);
  assert.equal(result.data.id, 'fixture-standalone');
  assert.deepEqual(calls, [{ url: 'http://localhost:8001/api/agendamiento/stock/movimientos', method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: movement }]);
});

for (const [label, idempotencyKey] of [['undefined', undefined], ['null', null], ['empty', '']]) {
  test(`minor adjustments: stock key ${label} keeps the request keyless`, async t => {
    const movement = { insumo_id: 'fixture-i', tipo_movimiento: 'ENTRADA_COMPRA', cantidad: 1, motivo: 'Conteo ficticio' };
    const { service, calls } = hosted(t, () => reply(201, { success: true, data: movement }));
    await service.registrarMovimiento(movement, { idempotencyKey });
    assert.deepEqual(calls, [{ url: `${BASE}/stock/movimientos`, method: 'POST', body: movement,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' } }]);
  });
}
for (const [label, idempotencyKey] of [['zero', 0], ['number', 7], ['boolean', false], ['array', []], ['object', {}]]) {
  test(`minor adjustments: stock key ${label} rejects before HTTP`, async t => {
    const movement = { insumo_id: 'fixture-i', tipo_movimiento: 'ENTRADA_COMPRA', cantidad: 1, motivo: 'Conteo ficticio' };
    const { service, calls } = hosted(t);
    await assert.rejects(service.registrarMovimiento(movement, { idempotencyKey }), error => {
      assert.equal(error.status, 422);
      assert.equal(error.code, 'INVALID_IDEMPOTENCY_KEY');
      assert.match(error.message, /idempotencyKey must be a string/);
      return true;
    });
    assert.deepEqual(calls, []);
  });
}

test('datetime-local values become the MS3 date-time format', () => {
  assert.equal(api.toBackendDateTime('2030-01-02T09:30'), '2030-01-02 09:30:00');
  assert.equal(api.toBackendDateTime('2030-01-02T09:30:15'), '2030-01-02 09:30:15');
});
