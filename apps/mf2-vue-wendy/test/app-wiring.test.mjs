import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// Mounts the real shipped remote bundle (App.vue + components) in jsdom with a
// scripted fetch. jsdom is borrowed read-only from the mf-erp dev tooling, not a dependency of this app.
const appDir = resolve(import.meta.dirname, '..');
let JSDOM;
try { ({ JSDOM } = createRequire(resolve(appDir, '../mf-erp/package.json'))('jsdom')); } catch { /* skipped below */ }

const ERP = 'https://host.example/erp/graphql';
const MS3 = 'https://host.example/agenda';
const jwt = roles => `h.${Buffer.from(JSON.stringify({ realm_access: { roles } })).toString('base64url')}.s`;
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };

const catalogs = {
  listarOdontologos: [{ id: 'od-uuid', nombres: 'Ana', apellidos: 'Paz', matriculaProfesional: 'M1' }],
  listarConsultorios: [{ id: 'co-uuid', codigo: 'C1', nombre: 'Sala 1', estado: 'ACTIVO' }],
  listarPacientes: [{ id: 'pa-uuid', nombres: 'Luis', apellidos: 'Gil', ciNit: '123' }],
};

let bundleDir;
let remote;
let dom;
test.before(async () => {
  if (!JSDOM) return;
  dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MutationObserver', 'SVGElement']) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  bundleDir = mkdtempSync(join(tmpdir(), 'mf2-wiring-'));
  await build({ root: appDir, configFile: resolve(appDir, 'vite.remote.config.js'), logLevel: 'silent',
    build: { outDir: bundleDir, emptyOutDir: true } });
  remote = await import(pathToFileURL(join(bundleDir, 'remote.js')).href);
});
test.after(() => {
  if (bundleDir) rmSync(bundleDir, { recursive: true, force: true });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'MutationObserver', 'SVGElement']) delete globalThis[key];
});

function host(t, { path = '/clinical/citas', roles = ['ADMIN'], serviceBaseUrls = { erp: ERP }, citaReplies = [], citas = [] } = {}) {
  const calls = [];
  const state = { citas, citaReplies: [...citaReplies],
    insumos: [{ id: 'i-1', codigo: 'RES-01', nombre: 'Resina', stock_actual: 4, stock_minimo: 5,
      unidad_medida: 'jeringa', alerta_reposicion: true }] };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, method: options.method, headers: options.headers, body });
    if (url === ERP) {
      const op = Object.keys(catalogs).find(name => body.query.includes(name));
      return reply(200, { data: { [op]: catalogs[op] } });
    }
    const path = url.slice(MS3.length + 1);
    if (options.method === 'GET') {
      if (path === 'citas') return reply(200, { success: true, data: { citas: state.citas }, citas: state.citas });
      if (path === 'horarios') return reply(200, { success: true, data: { horarios: [] }, horarios: [] });
      return reply(200, { success: true, data: { insumos: state.insumos }, insumos: state.insumos });
    }
    const next = state.citaReplies.shift();
    if (path === 'citas' && next) {
      if (next.status < 300) state.citas = [next.body.data];
      return reply(next.status, next.body);
    }
    return reply(200, { success: true, data: {}, mensaje: 'ok' });
  });
  const container = document.createElement('div');
  document.body.append(container);
  const token = jwt(roles);
  const instance = remote.mount(container, { contractVersion: 1, basePath: '/clinical', path,
    apiBaseUrl: MS3, ...(serviceBaseUrls ? { serviceBaseUrls } : {}), getAccessToken: () => token, onNavigate() {} });
  return { calls, container, instance };
}

function fill(container, selector, value, event = 'input') {
  const el = container.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new dom.window.Event(event, { bubbles: true }));
}

async function fillCita(container) {
  const selects = container.querySelectorAll('form select');
  for (const [index, id] of [[0, 'pa-uuid'], [1, 'od-uuid'], [2, 'co-uuid']]) {
    selects[index].value = id;
    selects[index].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  fill(container, 'input[type=datetime-local]', '2030-01-02T09:00');
  await settle();
}

const skip = JSDOM ? false : 'jsdom is not available from apps/mf-erp';

test('hosted form offers ERP catalog selections and posts canonical IDs with one key per intent', { skip }, async (t) => {
  const { calls, container, instance } = host(t, { citaReplies: [
    { status: 409, body: { success: false, error: 'Conflicto de horario', code: 'SCHEDULE_COLLISION' } },
    { status: 201, body: { success: true, idempotente: false, mensaje: 'Cita reservada con éxito.',
      data: { id: 'c-1', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', paciente_id: 'pa-uuid',
        fecha_hora: '2030-01-02 09:00:00', estado: 'RESERVADA' } } },
    { status: 201, body: { success: true, data: { id: 'c-2', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid',
      paciente_id: 'pa-uuid', fecha_hora: '2030-01-02 09:00:00', estado: 'RESERVADA' } } },
  ] });
  await settle();
  assert.equal(container.querySelectorAll('form input:not([type=datetime-local]):not(.search)').length, 0, 'no free-text IDs');
  assert.deepEqual([...container.querySelectorAll('form select option')].map(o => o.textContent.trim()).filter(Boolean),
    ['Seleccione un paciente', 'Luis Gil (123)', 'Seleccione un odontólogo', 'Ana Paz (M1)',
      'Seleccione un consultorio', 'C1 — Sala 1']);
  await fillCita(container);
  const submit = () => container.querySelector('form button[type=submit]').click();
  submit();
  await settle();
  assert.match(container.querySelector('.error').textContent, /Conflict \(SCHEDULE_COLLISION\): Conflicto de horario/);
  submit();
  await settle();
  const posts = calls.filter(c => c.method === 'POST' && c.url === `${MS3}/citas`);
  assert.deepEqual(posts[0].body, { paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid',
    fecha_hora: '2030-01-02 09:00:00' });
  assert.equal(posts[1].headers['Idempotency-Key'], posts[0].headers['Idempotency-Key'], 'retry reuses the key');
  assert.equal(container.querySelector('.error'), null);
  assert.match(container.textContent, /Cita reservada con éxito/);
  assert.equal(calls.filter(c => c.url.includes('/stock/movimientos')).length, 0, 'creating never touches stock');
  await fillCita(container);
  submit();
  await settle();
  const third = calls.filter(c => c.method === 'POST' && c.url === `${MS3}/citas`)[2];
  assert.notEqual(third.headers['Idempotency-Key'], posts[0].headers['Idempotency-Key'], 'a new intent gets a new key');
  instance.unmount();
});

test('hosted without serviceBaseUrls.erp disables the form with a clear error and makes no ERP request', { skip }, async (t) => {
  const { calls, container, instance } = host(t, { serviceBaseUrls: null });
  await settle();
  assert.match(container.textContent, /ERP catalog URL is not configured/);
  assert.equal(container.querySelector('form button[type=submit]').disabled, true);
  assert.equal(calls.filter(c => c.url === ERP).length, 0);
  assert.ok(calls.some(c => c.url === `${MS3}/citas`), 'the rest of the module still loads');
  instance.unmount();
});

test('hours form is ADMIN-only in hosted mode and posts the backend fields', { skip }, async (t) => {
  const reader = host(t, { path: '/clinical/horarios', roles: ['RECEPCIONISTA'] });
  await settle();
  assert.match(reader.container.textContent, /solo lectura/);
  assert.equal(reader.container.querySelector('form'), null);
  reader.instance.unmount();

  const admin = host(t, { path: '/clinical/horarios' });
  await settle();
  const selects = admin.container.querySelectorAll('form select');
  selects[0].value = 'od-uuid';
  selects[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  selects[1].value = 'co-uuid';
  selects[1].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const inputs = [...admin.container.querySelectorAll('form input:not([type=checkbox])')];
  [['Endodoncia'], ['2030-01-02'], ['08:00'], ['12:00']].forEach(([value], i) => {
    inputs[i].value = value;
    inputs[i].dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  admin.container.querySelector('form button[type=submit]').click();
  await settle();
  const post = admin.calls.find(c => c.method === 'POST' && c.url === `${MS3}/horarios`);
  assert.deepEqual(post.body, { odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', especialidad: 'Endodoncia',
    fecha: '2030-01-02', hora_inicio: '08:00', hora_fin: '12:00', disponible: true });
  admin.instance.unmount();
});

test('stock rows show the backend fields and a movement is sent only from the explicit form', { skip }, async (t) => {
  const { calls, container, instance } = host(t, { path: '/clinical/stock' });
  await settle();
  const writes = () => calls.filter(c => c.method === 'POST' && c.url.startsWith(MS3));
  assert.equal(writes().length, 0, 'loading never moves stock');
  assert.match(container.querySelector('tbody').textContent, /RES-01.*Resina.*4.*5.*jeringa.*Reponer urgente/);
  const [insumo, tipo] = container.querySelectorAll('form select');
  insumo.value = 'i-1';
  insumo.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  tipo.value = 'SALIDA_PROCEDIMIENTO';
  tipo.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await settle();
  fill(container, 'input[type=number]', '2');
  fill(container, 'form input:not([type=number])', 'Uso en consulta');
  container.querySelector('form button[type=submit]').click();
  await settle();
  assert.deepEqual(writes().map(c => [c.url, c.body]), [[`${MS3}/stock/movimientos`,
    { insumo_id: 'i-1', tipo_movimiento: 'SALIDA_PROCEDIMIENTO', cantidad: 2, motivo: 'Uso en consulta' }]]);
  instance.unmount();
});

test('appointment actions hit the real transitions; completing without insumos consumes no stock', { skip }, async (t) => {
  const open = { id: 'c-1', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', paciente_id: 'pa-uuid',
    fecha_hora: '2030-01-02 09:00:00', estado: 'RESERVADA' };
  const closed = { ...open, id: 'c-2', estado: 'COMPLETADA' };
  const { calls, container, instance } = host(t, { citas: [open, closed] });
  await settle();
  assert.equal(container.querySelectorAll('.acciones').length, 1, 'closed appointments offer no actions');
  assert.match(container.querySelector('tbody').textContent, /Luis Gil \(123\).*RESERVADA/);
  const writes = () => calls.filter(c => c.method !== 'GET' && c.url.startsWith(MS3)).map(c => [c.method, c.url.slice(MS3.length), c.body]);
  const button = text => [...container.querySelectorAll('.acciones button')].find(b => b.textContent.trim() === text);
  button('Cancelar').click();
  await settle();
  button('No asistió').click();
  await settle();
  button('Completar').click();
  await settle();
  container.querySelector('.panel button[type=submit]').click();
  await settle();
  assert.deepEqual(writes(), [['PATCH', '/citas/c-1/cancelar', undefined],
    ['PATCH', '/citas/c-1/no-asistio', undefined], ['PATCH', '/citas/c-1/completar', {}]]);
  instance.unmount();
});
