import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpClient, httpClient } from '../src/api/client.js';
import { historiasClinicasService, createHistoriasClinicasService } from '../src/api/historias-clinicas.service.js';
import { mountRemote, tabFromContext, navigateTab } from '../src/remote-session.js';

const context = (extra = {}) => ({ contractVersion: 1, basePath: '/clinical', path: '/clinical/consulta', apiBaseUrl: 'https://api.example/clinical', getAccessToken: () => null, onNavigate() {}, ...extra });

test('instance requests read current tokens, isolate bases and preserve service payloads', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return new Response('{"id":"hc"}'); });
  let token = 'first';
  const service = createHistoriasClinicasService(createHttpClient({ apiBaseUrl: 'https://api.example/a/', getAccessToken: () => token }));
  await service.getById(' a/b ', 'ignored');
  token = 'second';
  await service.create({ pacienteId: 'p' });
  token = null;
  await service.updateAntecedentes('hc', { versionEsperada: 1 });
  await createHttpClient({ apiBaseUrl: '/api/other', getAccessToken: () => 'other' })('/health');
  assert.deepEqual(calls.map(([url, opts]) => [url, opts.method, opts.headers.Authorization, opts.body]), [
    ['https://api.example/a/historias-clinicas/a%2Fb', 'GET', 'Bearer first', undefined],
    ['https://api.example/a/historias-clinicas', 'POST', 'Bearer second', '{"pacienteId":"p"}'],
    ['https://api.example/a/historias-clinicas/hc/antecedentes', 'PATCH', undefined, '{"versionEsperada":1}'],
    ['/api/other/health', 'GET', 'Bearer other', undefined],
  ]);
  assert.equal(JSON.stringify(calls).includes('getAccessToken'), false);
});

test('legacy client signature/default, service validation and HTTP errors remain', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return new Response(null, { status: 204 }); });
  assert.equal(await httpClient('health', { token: ' legacy ' }), null);
  assert.equal(calls[0][0], '/api/expediente/health');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer legacy');
  const service = createHistoriasClinicasService(httpClient);
  await assert.rejects(service.getById(' '), /ID de la historia/);
  assert.equal(calls.length, 1);
  t.mock.method(globalThis, 'fetch', async () => new Response('{"detail":"denied"}', { status: 403 }));
  await assert.rejects(httpClient('/health'), { name: 'ProblemDetailsError', status: 403, detail: 'denied' });
  await assert.rejects(createHttpClient({ apiBaseUrl: '/api/remote' })('/health'), { status: 403 });
});

test('default clinical service retains health, lookup, create and update signatures', async (t) => {
  const calls = [];
  const signal = new AbortController().signal;
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return new Response('[{"id":"hc"}]');
  });
  await historiasClinicasService.getHealth(signal);
  await historiasClinicasService.getById(' hc ', 'token', signal);
  assert.deepEqual(await historiasClinicasService.getByPacienteId(' p/a ', 'token', signal), { id: 'hc' });
  await historiasClinicasService.create({ pacienteId: 'p' }, 'token', signal);
  await historiasClinicasService.updateAntecedentes(' hc ', { versionEsperada: 1 }, 'token', signal);
  assert.deepEqual(calls.map(([url, options]) => [url, options.method, options.headers.Authorization, options.body, options.signal === signal]), [
    ['/api/expediente/health', 'GET', undefined, undefined, true],
    ['/api/expediente/historias-clinicas/hc', 'GET', 'Bearer token', undefined, true],
    ['/api/expediente/historias-clinicas?pacienteId=p%2Fa', 'GET', 'Bearer token', undefined, true],
    ['/api/expediente/historias-clinicas', 'POST', 'Bearer token', '{"pacienteId":"p"}', true],
    ['/api/expediente/historias-clinicas/hc/antecedentes', 'PATCH', 'Bearer token', '{"versionEsperada":1}', true],
  ]);
});

test('lifecycle renders only supplied container, updates context, cleans once and ignores late updates', () => {
  const container = {};
  const renders = [];
  let cleanups = 0;
  const initial = context();
  const instance = mountRemote(container, initial, (target) => {
    assert.equal(target, container);
    return { render: (value) => renders.push(value), unmount: () => cleanups++ };
  });
  const next = context({ path: '/clinical/crear' });
  instance.update(next);
  assert.deepEqual(renders, [initial, next]);
  assert.equal(renders[1], next);
  assert.throws(() => instance.update(context({ basePath: '/other', path: '/other' })), /basePath/);
  assert.throws(() => instance.update(context({ contractVersion: 2 })), /version/);
  assert.equal(renders.length, 2);
  instance.unmount(); instance.unmount(); instance.update(next);
  assert.equal(cleanups, 1);
  assert.equal(renders.length, 2);
  assert.throws(() => mountRemote(container, context(), () => ({ render() { throw Error('render'); }, unmount() { cleanups++; } })), /render/);
  assert.equal(cleanups, 2);
});

test('all tabs reflect host path without notifying; user actions notify exactly once', () => {
  const events = [];
  for (const tab of ['consulta', 'crear', 'actualizar', 'conectividad']) {
    const value = context({ path: `/clinical/${tab}?q=1`, onNavigate: (path) => events.push(path) });
    assert.equal(tabFromContext(value), tab);
    assert.equal(events.length, ['consulta', 'crear', 'actualizar', 'conectividad'].indexOf(tab));
    navigateTab(value, tab);
  }
  assert.deepEqual(events, ['consulta', 'crear', 'actualizar', 'conectividad'].map(tab => `/clinical/${tab}`));
  assert.equal(tabFromContext(context({ path: '/clinical' })), 'consulta');
  for (const path of ['/clinical-other', '/erp', '//evil.example', '/clinical/%2e%2e/erp', '/clinical/%2fcrear', '/clinical#bad']) {
    assert.throws(() => tabFromContext(context({ path })), /path/);
  }
  assert.throws(() => navigateTab(context(), 'invalid'), /tab/);
});
