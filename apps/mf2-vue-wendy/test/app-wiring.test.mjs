import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compiles and mounts the shipped SFCs in memory with scripted fetch. No build,
// disk output or server; jsdom is borrowed read-only from mf-erp dev tooling.
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

const require = createRequire(resolve(appDir, 'package.json'));
const { parse, compileScript } = require('@vue/compiler-sfc');
const modules = new Map();
const vueModule = `data:text/javascript;base64,${Buffer.from(readFileSync(
  require.resolve('vue/dist/vue.runtime.esm-browser.js'), 'utf8')).toString('base64')}`;
function sourceModule(filename) {
  if (modules.has(filename)) return modules.get(filename);
  let source = readFileSync(filename, 'utf8');
  if (filename.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename });
    assert.deepEqual(errors, [], `parse ${filename}`);
    source = compileScript(descriptor, { id: filename, inlineTemplate: true }).content;
  }
  source = source.replace(/\bfrom\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
    const target = specifier === 'vue' ? vueModule
      : specifier.endsWith('.vue') ? sourceModule(resolve(dirname(filename), specifier))
        : specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : specifier;
    return `from ${quote}${target}${quote}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  modules.set(filename, url);
  return url;
}
let remote;
let dom;
const globals = ['window', 'document', 'Document', 'Node', 'Element', 'HTMLElement', 'Event', 'MutationObserver', 'SVGElement'];
test.before(async () => {
  if (!JSDOM) return;
  dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  for (const key of globals) {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
  }
  remote = await import(sourceModule(resolve(appDir, 'src/remote.js')));
});
test.after(() => {
  dom?.window.close();
  for (const key of globals) delete globalThis[key];
});

function host(t, { path = '/clinical/citas', roles = ['ADMIN'], serviceBaseUrls = { erp: ERP }, citaReplies = [], citas = [], mlDisponible = true, clusters = null, clusterStatus = 200 } = {}) {
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
      if (path === 'ml/clusters') return reply(clusterStatus, clusters || { success: true, data: { pacientes: { distribucion: {}, asignaciones: [] }, insumos: { distribucion: {}, asignaciones: [] }, datosSinteticos: true } });
      if (path === 'citas') return reply(200, { success: true, data: { citas: state.citas, mlDisponible }, citas: state.citas });
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


const clusterFixture = { success: true, data: {
  pacientes: { distribucion: { 'Frecuente y Puntual': 1 }, asignaciones: [{ paciente_id: 'pa-uuid', cluster: 'Frecuente y Puntual' }] },
  insumos: { distribucion: { 'Alta Rotación Crítica': 1 }, asignaciones: [{ insumo_id: 'i-1', cluster: 'Alta Rotación Crítica' }] }, datosSinteticos: true,
} };
test('ML appointments show risk, probability, recommendation and patient clusters; high-risk filter is exact', { skip }, async t => {
  const cita = { id: 'c-high', paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' };
  const s = host(t, { clusters: clusterFixture, citas: [
    { ...cita, nivelRiesgo: 'ALTO', probabilidadNoShow: 0.8, accionRecomendada: 'Confirmar por teléfono' },
    { ...cita, id: 'c-low', nivelRiesgo: 'MEDIO', probabilidadNoShow: 0.65, accionRecomendada: 'Recordatorio' },
  ] }); t.after(() => s.instance.unmount());
  await settle();
  assert.match(s.container.textContent, /Datos sintéticos/);
  assert.match(s.container.querySelector('[data-cluster-summary]').textContent, /Frecuente y Puntual.*1/);
  assert.equal(s.container.querySelectorAll('[data-risk]').length, 2);
  assert.match(s.container.querySelector('tbody').textContent, /ALTO.*80%.*Confirmar por teléfono.*Frecuente y Puntual/);
  assert.match(s.container.querySelector('tbody').textContent, /MEDIO.*65%/);
  const filter = s.container.querySelector('[aria-label="Solo alto riesgo"]'); filter.checked = true;
  filter.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await settle();
  assert.equal(s.container.querySelectorAll('[data-risk]').length, 1);
  assert.equal(s.calls.filter(c => c.url === `${MS3}/ml/clusters`).length, 1);
});
test('ML stock shows rotation alongside minimum alert and does not mutate inventory', { skip }, async t => {
  const s = host(t, { path: '/clinical/stock', clusters: clusterFixture }); t.after(() => s.instance.unmount());
  await settle(); assert.match(s.container.querySelector('tbody').textContent, /Alta Rotación Crítica.*Reponer urgente/);
  assert.equal(s.calls.filter(c => c.method !== 'GET' && c.url.startsWith(MS3)).length, 0);
});
test('ML unavailability leaves appointments and stock usable and explicitly marks missing predictions', { skip }, async t => {
  const s = host(t, { mlDisponible: false, clusterStatus: 503, clusters: { success: false, error: 'Sidecar down', code: 'ML_SERVICE_UNAVAILABLE' },
    citas: [{ id: 'c-one', paciente_id: 'pa-uuid', estado: 'RESERVADA', probabilidadNoShow: null, nivelRiesgo: null }] });
  t.after(() => s.instance.unmount()); await settle();
  assert.match(s.container.textContent, /ML no disponible/);
  assert.match(s.container.querySelector('tbody').textContent, /Sin predicción/);
  assert.match(s.container.querySelector('tbody').textContent, /RESERVADA/);
  assert.equal(s.container.querySelector('.error'), null);
});


// Published MS3 contract: ai-integrity.md L6 (canonical stock, additive feature provenance).
const integrityClusters = withFeatures => ({ success: true, data: {
  pacientes: { distribucion: { 'Frecuente y Puntual': 1 }, asignaciones: [
    { paciente_id: 'pa-uuid', cluster: 'Frecuente y Puntual', featuresImputadas: withFeatures ? ['dias_promedio_entre_citas'] : [], featuresEstimadas: withFeatures ? ['gasto_total_estimado'] : [] },
  ] },
  stock: { distribucion: { 'Alta Rotación Crítica': 1 }, asignaciones: [
    { insumo_id: 'i-1', cluster: 'Alta Rotación Crítica', featuresImputadas: withFeatures ? ['consumo_mensual', 'costo_unitario', 'dias_reabastecimiento'] : [], featuresEstimadas: withFeatures ? ['rotacion_estimada'] : [] },
  ] }, datosEntrenamientoSinteticos: true,
} });
test('S10 marks only imputed appointment predictions Estimated and lists patient cluster provenance', { skip }, async t => {
  const base = { paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00', nivelRiesgo: 'ALTO', probabilidadNoShow: 0.8, accionRecomendada: 'Confirmar', datosEntrenamientoSinteticos: true };
  const s = host(t, { clusters: integrityClusters(true), citas: [
    { ...base, id: 'estimated', featuresImputadas: ['edad', 'anticipacionReserva'] },
    { ...base, id: 'observed-inputs', featuresImputadas: [] },
  ] }); t.after(() => s.instance.unmount()); await settle();
  const risks = s.container.querySelectorAll('[data-risk]'); assert.equal(risks.length, 2);
  assert.equal(risks[0].querySelector('[data-estimated]').textContent, 'Estimated');
  assert.match(risks[0].querySelector('[data-prediction-imputed]').textContent, /edad, anticipacionReserva/);
  assert.equal(risks[1].querySelector('[data-estimated]'), null);
  assert.equal(risks[1].querySelector('[data-prediction-imputed]'), null);
  const row = risks[0].closest('tr');
  assert.match(row.querySelector('[data-cluster-imputed]').textContent, /dias_promedio_entre_citas/);
  assert.match(row.querySelector('[data-cluster-estimated]').textContent, /gasto_total_estimado/);
  assert.match(s.container.textContent, /Datos sintéticos/);
  assert.deepEqual(s.calls.filter(c => c.url.startsWith(MS3)).map(c => c.url).sort(), ['citas', 'horarios', 'stock', 'ml/clusters'].map(path => `${MS3}/${path}`).sort());
  assert.ok(s.calls.every(c => c.method === 'GET' || c.url === ERP), 'display provenance never performs mutations');
});
for (const withFeatures of [true, false]) test(`S10 stock assignments show only returned provenance (features=${withFeatures})`, { skip }, async t => {
  const s = host(t, { path: '/clinical/stock', clusters: integrityClusters(withFeatures) }); t.after(() => s.instance.unmount()); await settle();
  const row = s.container.querySelector('tbody tr'); assert.match(row.textContent, /Alta Rotación Crítica/);
  if (withFeatures) {
    assert.match(row.querySelector('[data-cluster-imputed]').textContent, /consumo_mensual, costo_unitario, dias_reabastecimiento/);
    assert.match(row.querySelector('[data-cluster-estimated]').textContent, /rotacion_estimada/);
  } else {
    assert.equal(row.querySelector('[data-cluster-imputed]'), null);
    assert.equal(row.querySelector('[data-cluster-estimated]'), null);
  }
  assert.match(s.container.textContent, /Datos sintéticos/);
  assert.equal(s.calls.filter(c => c.url === `${MS3}/ml/clusters`).length, 1);
});
test('S10 empty patient provenance arrays preserve the cluster without inventing estimates', { skip }, async t => {
  const s = host(t, { clusters: integrityClusters(false), citas: [{ id: 'empty', paciente_id: 'pa-uuid', estado: 'RESERVADA', nivelRiesgo: 'BAJO', probabilidadNoShow: 0.2, featuresImputadas: [], datosEntrenamientoSinteticos: true }] });
  t.after(() => s.instance.unmount()); await settle();
  const row = s.container.querySelector('tbody tr'); assert.match(row.textContent, /Frecuente y Puntual/);
  for (const selector of ['[data-estimated]', '[data-prediction-imputed]', '[data-cluster-imputed]', '[data-cluster-estimated]']) assert.equal(row.querySelector(selector), null);
});

const spendingClusterPayload = patientOverrides => ({
  success: true,
  data: {
    pacientes: {
      distribucion: { 'Frecuente y Puntual': 1 },
      asignaciones: [{
        paciente_id: 'pa-uuid',
        cluster: 'Frecuente y Puntual',
        ...patientOverrides,
      }],
    },
    insumos: { distribucion: { 'Alta Rotación Crítica': 1 }, asignaciones: [] },
    datosEntrenamientoSinteticos: true,
  },
});

test('S2/S4 patient cluster spending shows verified real amount and estimated alongside real for observed positive', { skip }, async t => {
  const clusters = spendingClusterPayload({
    gasto_total_real: 240,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
    featuresEstimadas: ['gasto_total_estimado'],
    featuresImputadas: [],
  });
  const cita = { id: 'c-pos', paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' };
  const s = host(t, { clusters, citas: [cita] });
  t.after(() => s.instance.unmount());
  await settle();

  const row = s.container.querySelector('tbody tr');
  assert.match(s.container.textContent, /Datos sintéticos/);
  assert.equal(row.querySelector('[data-spending-unavailable]'), null);

  const realEl = row.querySelector('[data-spending-real]');
  assert.ok(realEl, 'must render real spending element');
  assert.equal(realEl.textContent.trim(), 'Gasto real verificado: 240 Bs');

  const estEl = row.querySelector('[data-spending-estimated]');
  assert.ok(estEl, 'must render estimated spending element alongside real');
  assert.equal(estEl.textContent.trim(), 'Gasto estimado (referencia): 180 Bs');

  const clusterEst = row.querySelector('[data-cluster-estimated]');
  assert.ok(clusterEst, 'featuresEstimadas badge preserved');
  assert.match(clusterEst.textContent, /gasto_total_estimado/);

  assert.equal(s.calls.filter(c => c.url === `${MS3}/ml/clusters`).length, 1, 'request count unchanged');
});

test('S2/S4 patient cluster spending shows verified real zero amount and estimated reference for observed zero', { skip }, async t => {
  const clusters = spendingClusterPayload({
    gasto_total_real: 0,
    gasto_total_estimado: 120,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
    featuresEstimadas: ['gasto_total_estimado'],
  });
  const cita = { id: 'c-zero', paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' };
  const s = host(t, { clusters, citas: [cita] });
  t.after(() => s.instance.unmount());
  await settle();

  const row = s.container.querySelector('tbody tr');
  const realEl = row.querySelector('[data-spending-real]');
  assert.ok(realEl, 'must render real spending element for zero');
  assert.equal(realEl.textContent.trim(), 'Gasto real verificado: 0 Bs');

  const estEl = row.querySelector('[data-spending-estimated]');
  assert.ok(estEl, 'must render estimated spending element');
  assert.equal(estEl.textContent.trim(), 'Gasto estimado (referencia): 120 Bs');
  assert.equal(row.querySelector('[data-spending-unavailable]'), null);
});

test('S2/S4 patient cluster spending falls back to estimated reference without nominal real when unobserved', { skip }, async t => {
  const clusters = spendingClusterPayload({
    gasto_total_real: null,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'estimado_fallback',
    gasto_real_observado: false,
    featuresEstimadas: ['gasto_total_estimado'],
  });
  const cita = { id: 'c-fb', paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' };
  const s = host(t, { clusters, citas: [cita] });
  t.after(() => s.instance.unmount());
  await settle();

  const row = s.container.querySelector('tbody tr');
  assert.equal(row.querySelector('[data-spending-real]'), null, 'never nominal as real');

  const estEl = row.querySelector('[data-spending-estimated]');
  assert.ok(estEl, 'must render estimated reference amount');
  assert.equal(estEl.textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
  assert.equal(row.querySelector('[data-spending-unavailable]'), null);
});

test('S2/S4 legacy cluster payload without spending fields safely renders explicit unavailable without invented zero', { skip }, async t => {
  const clusters = {
    success: true,
    data: {
      pacientes: {
        distribucion: { 'Frecuente y Puntual': 1 },
        asignaciones: [{
          paciente_id: 'pa-uuid',
          cluster: 'Frecuente y Puntual',
        }],
      },
      insumos: { distribucion: {}, asignaciones: [] },
      datosSinteticos: true,
    },
  };
  const cita = { id: 'c-leg', paciente_id: 'pa-uuid', odontologo_id: 'od-uuid', consultorio_id: 'co-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' };
  const s = host(t, { clusters, citas: [cita] });
  t.after(() => s.instance.unmount());
  await settle();

  const row = s.container.querySelector('tbody tr');
  assert.equal(row.querySelector('[data-spending-real]'), null);
  assert.equal(row.querySelector('[data-spending-estimated]'), null);

  const unavailEl = row.querySelector('[data-spending-unavailable]');
  assert.ok(unavailEl, 'must render explicit unavailable element');
  assert.equal(unavailEl.textContent.trim(), 'Gasto no disponible');
  assert.doesNotMatch(row.textContent, /0\s*Bs/, 'never invented zero');
});

test('S2/S4 corrupted/invalid spending payloads safely fall back without string coercion or currency forgery', { skip }, async t => {
  // Case A: negative real amount falls back to estimated
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: -50,
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-neg', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    s.instance.unmount();
  }

  // Case B: non-finite real amount (Infinity) falls back to estimated
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: Infinity,
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-inf', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    s.instance.unmount();
  }

  // Case C: string real amount is not coerced; falls back to estimated
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: '240',
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-str', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    s.instance.unmount();
  }

  // Case D: string observed flag ("true") is not coerced; falls back to estimated
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: 240,
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: 'true',
      }),
      citas: [{ id: 'c-strobs', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    s.instance.unmount();
  }

  // Case E: mismatched currency ('USD') -> no currency forgery, rejected -> unavailable
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: 240,
        gasto_total_estimado: 180,
        gasto_moneda: 'USD',
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-curr', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]'), null);
    assert.equal(row.querySelector('[data-spending-unavailable]').textContent.trim(), 'Gasto no disponible');
    assert.doesNotMatch(row.textContent, /Bs/, 'no currency forgery');
    s.instance.unmount();
  }

  // Case F: mismatched origin ('estimado_fallback' with real_observado: true) -> falls back to estimated
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: 240,
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_origen: 'estimado_fallback',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-orig', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    s.instance.unmount();
  }

  // Case G: invalid estimate (negative -100, real unobserved) -> explicit unavailable, no invented zero
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: null,
        gasto_total_estimado: -100,
        gasto_moneda: 'BOB',
        gasto_origen: 'estimado_fallback',
        gasto_real_observado: false,
      }),
      citas: [{ id: 'c-innest', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null);
    assert.equal(row.querySelector('[data-spending-estimated]'), null);
    assert.equal(row.querySelector('[data-spending-unavailable]').textContent.trim(), 'Gasto no disponible');
    assert.doesNotMatch(row.textContent, /0\s*Bs/, 'never invented zero');
    s.instance.unmount();
  }
});

test('S2/S4 incomplete metadata with observed true falls back safely to exact estimated output (never nominal real)', { skip }, async t => {
  // Subcase 1: Missing gasto_origen with observed=true and valid real/estimate
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: 240,
        gasto_total_estimado: 180,
        gasto_moneda: 'BOB',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-incomp-orig', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null, 'no real element when origin missing');
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    assert.equal(row.querySelector('[data-spending-unavailable]'), null);
    s.instance.unmount();
  }

  // Subcase 2: Missing gasto_moneda with observed=true and valid real/estimate
  {
    const s = host(t, {
      clusters: spendingClusterPayload({
        gasto_total_real: 240,
        gasto_total_estimado: 180,
        gasto_origen: 'real_ms1_pagado',
        gasto_real_observado: true,
      }),
      citas: [{ id: 'c-incomp-curr', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
    });
    await settle();
    const row = s.container.querySelector('tbody tr');
    assert.equal(row.querySelector('[data-spending-real]'), null, 'no real element when currency missing');
    assert.equal(row.querySelector('[data-spending-estimated]').textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
    assert.equal(row.querySelector('[data-spending-unavailable]'), null);
    s.instance.unmount();
  }
});

test('S2/S4 legacy payload with only numeric gasto_total_estimado renders exact estimated output, never real', { skip }, async t => {
  const legacyClusters = {
    success: true,
    data: {
      pacientes: {
        distribucion: { 'Frecuente y Puntual': 1 },
        asignaciones: [{
          paciente_id: 'pa-uuid',
          cluster: 'Frecuente y Puntual',
          gasto_total_estimado: 180,
        }],
      },
      insumos: { distribucion: {}, asignaciones: [] },
      datosSinteticos: true,
    },
  };
  const s = host(t, {
    clusters: legacyClusters,
    citas: [{ id: 'c-legacy-est', paciente_id: 'pa-uuid', estado: 'RESERVADA', fecha_hora: '2030-01-02 09:00:00' }],
  });
  t.after(() => s.instance.unmount());
  await settle();

  const row = s.container.querySelector('tbody tr');
  assert.equal(row.querySelector('[data-spending-real]'), null, 'never nominal as real');
  const estEl = row.querySelector('[data-spending-estimated]');
  assert.ok(estEl, 'must render estimated reference amount');
  assert.equal(estEl.textContent.trim(), 'Gasto estimado (referencia): 180 Bs');
  assert.equal(row.querySelector('[data-spending-unavailable]'), null);
  assert.equal(s.calls.filter(c => c.url === `${MS3}/ml/clusters`).length, 1);
});
