import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHttpClient } from '../src/api/client.js';
import { createHistoriasClinicasService } from '../src/api/historias-clinicas.service.js';
import { createConsultasOdontologicasService, consultasOdontologicasService } from '../src/api/consultas-odontologicas.service.js';
import { createOdontogramasService, odontogramasService } from '../src/api/odontogramas.service.js';
import { createEstudiosService, estudiosService } from '../src/api/estudios.service.js';
import { mountRemote, navigateTab } from '../src/remote-session.js';

const base = 'https://clinical.example/nondefault/?tenant=a%2Fb&tag=one&tag=two';
const context = (getAccessToken, extra = {}) => ({
  contractVersion: 1, basePath: '/clinical', path: '/clinical/consulta',
  apiBaseUrl: base, getAccessToken, onNavigate() {}, ...extra,
});
const denied = { name: 'AbortError' };

register('./helpers/jsx-loader.mjs', import.meta.url);
const { ClinicalServicesContext } = await import('../src/context/ClinicalServices.jsx');
const { DevAuthContext } = await import('../src/context/dev-auth-context-def.js');
const { useHistoriaClinica } = await import('../src/hooks/useHistoriaClinica.js');
const { useHealthCheck } = await import('../src/hooks/useHealthCheck.js');
const { useConsultasOdontologicas } = await import('../src/hooks/useConsultasOdontologicas.js');
const { useOdontograma } = await import('../src/hooks/useOdontograma.js');

for (const capability of [() => null, () => { throw Error('retired'); }, () => Promise.resolve('opaque')]) {
  test('host capability must synchronously authorize before any HTTP', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{}'); });
    const service = createHistoriasClinicasService(createHttpClient({ apiBaseUrl: base, getAccessToken: capability }));
    await assert.rejects(service.create({ pacienteId: 'synthetic' }, 'caller-stale'), denied);
    assert.equal(calls, 0);
  });
}

test('host pins base and bearer, retaining encoded ordered queries and refresh', async (t) => {
  let token = 'opaque-one';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.headers]); return new Response('{}');
  });
  const client = createHttpClient({ apiBaseUrl: base, getAccessToken: () => token });
  await client('/health?tag=end%2Fvalue', {
    apiBaseUrl: 'https://override.invalid', baseUrl: '/prototype', token: 'caller-stale',
    headers: { authorization: 'caller-stale', Authorization: 'caller-stale', 'X-Trace': 'synthetic' },
  });
  token = 'opaque-two';
  await client('/health');
  assert.equal(calls[0][0], 'https://clinical.example/nondefault/health?tenant=a%2Fb&tag=one&tag=two&tag=end%2Fvalue');
  assert.equal(calls[0][1].authorization, undefined);
  assert.equal(calls[0][1].Authorization === 'Bearer opaque-one', true);
  assert.equal(new Headers(calls[0][1]).get('X-Trace'), 'synthetic');
  assert.equal(calls[1][1].Authorization === 'Bearer opaque-two', true);
});

test('observed capability retirement cannot revive on same-person login', async (t) => {
  let token = 'opaque-one';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('{}'); });
  const client = createHttpClient({ apiBaseUrl: base, getAccessToken: () => token });
  await client('/health');
  token = null;
  await assert.rejects(client('/health'), denied);
  token = 'opaque-two';
  await assert.rejects(client('/health'), denied);
  assert.equal(calls, 1);
});

for (const retirement of ['unmount', 'backend', 'capability']) {
  test(`mount ${retirement} permanently retires old client/navigation and late results`, async (t) => {
    let complete;
    let calls = 0;
    let navigations = 0;
    let current;
    const getter = () => 'opaque';
    t.mock.method(globalThis, 'fetch', () => {
      calls++;
      return new Promise(resolve => { complete = () => resolve(new Response('{"id":"old"}')); });
    });
    const initial = context(getter, { onNavigate() { navigations++; } });
    const instance = mountRemote({}, initial, () => ({ render(value) { current = value; }, unmount() {} }));
    const old = current;
    const client = createHttpClient({ apiBaseUrl: old.apiBaseUrl, getAccessToken: old.getAccessToken });
    const pending = client('/health').then(() => 'applied', error => error.name);
    if (retirement === 'unmount') instance.unmount();
    else instance.update(context(retirement === 'capability' ? () => 'opaque-new' : getter,
      { apiBaseUrl: retirement === 'backend' ? '/different' : base }));
    complete();
    assert.equal(await pending, 'AbortError');
    assert.equal(old.getAccessToken(), null);
    navigateTab(old, 'crear');
    assert.equal(navigations, 0);
    await assert.rejects(client('/health'), denied);
    assert.equal(calls, 1);
    instance.unmount();
  });
}

const serviceCases = [
  ['history', createHistoriasClinicasService,
    s => s.getByPacienteId('synthetic/a', 'caller-stale'),
    s => s.create({ pacienteId: 'synthetic' }, 'caller-stale'),
    '/historias-clinicas?pacienteId=synthetic%2Fa'],
  ['consultation', createConsultasOdontologicasService,
    s => s.listarPorHistoria('synthetic/a', { limite: 3, offset: 2 }, 'caller-stale'),
    s => s.abrirConsulta({ historiaClinicaId: 'synthetic', pacienteId: 'synthetic', motivoConsulta: 'synthetic' }, 'caller-stale'),
    '/consultas-odontologicas/historia/synthetic%2Fa?limite=3&offset=2'],
  ['odontogram', createOdontogramasService,
    s => s.listarHistorialOdontograma('synthetic/a', { limite: 3, offset: 2 }, 'caller-stale'),
    s => s.inicializarOdontograma('synthetic', 'caller-stale'),
    '/odontogramas/synthetic%2Fa/historial?limite=3&offset=2'],
  ['studies', createEstudiosService,
    s => s.listarTiposEstudio({ categoria: 'IMAGENOLOGIA', soloActivos: true }, 'caller-stale'),
    s => s.crearSolicitud({ consultaId: 'synthetic', motivo: 'synthetic' }, 'caller-stale'),
    '/tipos-estudios?categoria=IMAGENOLOGIA&soloActivos=true'],
];

for (const [name, factory, read, write, endpoint] of serviceCases) {
  test(`${name} actual factory uses host transport for reads/writes/refresh/zero-call rejection`, async (t) => {
    let token = 'opaque-one';
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls.push([url, options]); return new Response('{"id":"synthetic"}');
    });
    // Any prototype override read is a failure, including odontogram's old helper.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, get() { throw Error('prototype access'); } });
    t.after(() => descriptor ? Object.defineProperty(globalThis, 'window', descriptor) : delete globalThis.window);
    const client = createHttpClient({ apiBaseUrl: base, getAccessToken: () => token });
    const service = factory(client);
    assert.equal((await read(service)).id, 'synthetic');
    token = 'opaque-two';
    assert.equal((await write(service)).id, 'synthetic');
    const [path, query] = endpoint.split('?');
    assert.equal(calls[0][0], `https://clinical.example/nondefault${path}?tenant=a%2Fb&tag=one&tag=two${query ? '&' + query : ''}`);
    assert.equal(calls[0][1].headers.Authorization === 'Bearer opaque-one', true);
    assert.equal(calls[1][1].headers.Authorization === 'Bearer opaque-two', true);
    assert.equal(calls[1][1].method, 'POST');
    assert.equal(typeof calls[1][1].body, 'string');
    token = null;
    await assert.rejects(write(service), denied);
    token = 'opaque-three';
    await assert.rejects(read(service), denied);
    assert.equal(calls.length, 2);
  });

  test(`${name} drops late success and errors after backend replacement`, async (t) => {
    for (const status of [200, 403]) {
      let finish;
      let rendered;
      let calls = 0;
      const getter = () => 'opaque';
      t.mock.method(globalThis, 'fetch', () => {
        calls++;
        return new Promise(resolve => { finish = () => resolve(new Response('{"id":"old","detail":"old"}', { status })); });
      });
      const mounted = mountRemote({}, context(getter), () => ({ render(value) { rendered = value; }, unmount() {} }));
      const service = factory(createHttpClient({ apiBaseUrl: rendered.apiBaseUrl, getAccessToken: rendered.getAccessToken }));
      let applied = 0;
      const pending = read(service).then(() => { applied++; }, error => assert.equal(error.name, 'AbortError'));
      mounted.update(context(getter, { apiBaseUrl: '/replacement' }));
      finish();
      await pending;
      assert.equal(applied, 0);
      await assert.rejects(write(service), denied);
      assert.equal(calls, 1);
      mounted.unmount();
    }
  });
}

for (const [name, singleton, read, path] of [
  ['consultation', consultasOdontologicasService, s => s.getById('synthetic', 'opaque'), '/consultas-odontologicas/synthetic'],
  ['odontogram', odontogramasService, s => s.obtenerOdontogramaActual('synthetic', 'opaque'), '/odontogramas/historia/synthetic'],
  ['studies', estudiosService, s => s.listarLaboratorios({}, 'opaque'), '/laboratorios'],
]) {
  test(`${name} standalone singleton keeps existing default and signature`, async (t) => {
    let call;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      call = [url, options]; return new Response('{}');
    });
    await read(singleton);
    assert.equal(call[0], `/api/expediente${path}`);
    assert.equal(call[1].headers.Authorization === 'Bearer opaque', true);
  });
}

test('actual public hooks consume the mounted provider, not standalone singletons/render bearer', async (t) => {
  let rendered;
  let token = 'opaque-one';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options]); return new Response('{"id":"synthetic"}');
  });
  const mounted = mountRemote({}, context(() => token), () => ({ render(value) { rendered = value; }, unmount() {} }));
  let hooks;
  function Probe() {
    hooks = { history: useHistoriaClinica(), health: useHealthCheck(false), consultation: useConsultasOdontologicas(), odontogram: useOdontograma() };
    return null;
  }
  renderToStaticMarkup(React.createElement(ClinicalServicesContext.Provider, { value: rendered.clinicalServices },
    React.createElement(DevAuthContext.Provider, { value: { isRemote: true, token: 'caller-stale' } }, React.createElement(Probe))));
  await hooks.history.buscarPorId('synthetic');
  await hooks.health.checkHealth();
  await hooks.consultation.obtenerPorId('synthetic');
  await hooks.odontogram.cargarOdontogramaActual('synthetic');
  token = 'opaque-two';
  await hooks.consultation.completarConsulta('synthetic', { versionEsperada: 1 });
  assert.equal(calls.length, 5);
  assert.equal(calls.every(([url]) => url.startsWith('https://clinical.example/nondefault/')), true);
  assert.equal(calls.slice(0, 4).every(([, options]) => options.headers.Authorization === 'Bearer opaque-one'), true);
  assert.equal(calls[4][1].headers.Authorization === 'Bearer opaque-two', true);
  assert.deepEqual(JSON.parse(calls[4][1].body), { versionEsperada: 1 });
  mounted.unmount();
  await hooks.history.buscarPorId('synthetic');
  await hooks.health.checkHealth();
  await hooks.consultation.obtenerPorId('synthetic');
  await hooks.odontogram.cargarOdontogramaActual('synthetic');
  assert.equal(calls.length, 5);
});

test('all named consumers pin provider/state wiring (business payload assertions stay in regression suite)', async () => {
  const consumers = [
    'hooks/useHistoriaClinica.js', 'hooks/useHealthCheck.js', 'hooks/useConsultasOdontologicas.js', 'hooks/useOdontograma.js',
    'pages/CrearHistoriaPage.jsx', 'pages/ActualizarAntecedentesPage.jsx', 'pages/GestionClinicaPage.jsx', 'pages/OdontogramaPage.jsx', 'pages/EstudiosPage.jsx',
    'components/historia-clinica/AlergiasManager.jsx', 'components/historia-clinica/EstadoManager.jsx', 'components/historia-clinica/MedicamentosManager.jsx',
    'components/consultas-odontologicas/AtencionConsultaForm.jsx',
    'components/estudios/SolicitarEstudioModal.jsx', 'components/estudios/RegistrarResultadoModal.jsx', 'components/estudios/CambiarEstadoSolicitudModal.jsx',
  ];
  for (const path of consumers) {
    const source = await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
    assert.match(source, /useClinicalServices/, path);
    assert.match(source, /useClinicalState as useState/, path);
    assert.doesNotMatch(source, /import\s*\{\s*\w+Service\s*\}\s*from\s*['"][^'"]+\.service\.js/, path);
  }
});

test('hosted odontogram page renders without accessing prototype URL/storage controls', async () => {
  const { OdontogramaPage } = await import('../src/pages/OdontogramaPage.jsx');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, get() { throw Error('prototype access'); } });
  try {
    const html = renderToStaticMarkup(React.createElement(DevAuthContext.Provider,
      { value: { isRemote: true } }, React.createElement(OdontogramaPage)));
    assert.equal(html.includes('Conexión online al servicio clínico configurado por el host'), true);
    assert.equal(html.includes('Conectar a Backend Aislado'), false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
});

test('navigation-only updates keep the same lease and allow current synchronous refresh', async (t) => {
  let rendered;
  let token = 'opaque-one';
  let nav = 0;
  const getter = () => token;
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const mounted = mountRemote({}, context(getter), () => ({ render(value) { rendered = value; }, unmount() {} }));
  const original = rendered;
  token = 'opaque-two';
  mounted.update(context(getter, { path: '/clinical/estudios', onNavigate() { nav++; } }));
  assert.equal(rendered.sessionKey, original.sessionKey);
  assert.equal(rendered.clinicalServices, original.clinicalServices);
  assert.equal(original.getAccessToken() === 'opaque-two', true);
  navigateTab(original, 'crear');
  assert.equal(nav, 1);
  await original.clinicalServices.estudiosService.listarLaboratorios();
  mounted.unmount();
  token = 'opaque-three';
  assert.equal(original.getAccessToken(), null);
});

test('ERP base replacement retires the whole clinical lease; navigation and stable-getter refresh preserve it', async (t) => {
  let token = 'opaque-one'; let rendered;
  const getter = () => token;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.headers.Authorization]); return new Response('{}');
  });
  const configured = context(getter, { serviceBaseUrls: { erp: '/api/erp/graphql?tenant=one' } });
  const mounted = mountRemote({}, configured, () => ({ render(value) { rendered = value; }, unmount() {} }));
  const first = rendered;
  token = 'opaque-two';
  mounted.update({ ...configured, path: '/clinical/crear' });
  assert.equal(rendered.sessionKey, first.sessionKey);
  assert.equal(rendered.clinicalServices.erpPacientesService, first.clinicalServices.erpPacientesService);
  await first.clinicalServices.historiasClinicasService.getById('synthetic');
  assert.equal(calls[0][1], 'Bearer opaque-two');
  mounted.update({ ...configured, serviceBaseUrls: { erp: '/api/erp/graphql?tenant=two' } });
  assert.notEqual(rendered.sessionKey, first.sessionKey);
  assert.equal(first.getAccessToken(), null);
  await assert.rejects(first.clinicalServices.historiasClinicasService.getById('synthetic'), denied);
  assert.equal(calls.length, 1);
  await rendered.clinicalServices.historiasClinicasService.getById('synthetic');
  assert.equal(calls.length, 2); mounted.unmount();
});

test('explicit standalone client preserves caller bearer/base and unauthenticated health', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.headers.Authorization]); return new Response('{}');
  });
  const client = createHttpClient({ apiBaseUrl: '/standalone' });
  await client('/health');
  await client('/health', { baseUrl: '/legacy', token: 'opaque' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], '/standalone/health');
  assert.equal(calls[0][1], undefined);
  assert.equal(calls[1][0], '/legacy/health');
  assert.equal(calls[1][1] === 'Bearer opaque', true);
});
