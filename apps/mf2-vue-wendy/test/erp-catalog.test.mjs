import test from 'node:test';
import assert from 'node:assert/strict';
import * as erp from '../src/api/erpCatalogApi.js';

const URL_ERP = 'https://host.example/erp/graphql?tenant=a%2Fb';
const ok = data => ({ ok: true, status: 200, json: async () => ({ data }) });

function service(t, { respond, token = () => 'tok', url = URL_ERP } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (u, options) => {
    calls.push({ url: u, method: options.method, headers: options.headers, body: JSON.parse(options.body) });
    return respond ? respond(u, options) : ok({});
  });
  return { calls, svc: erp.createErpCatalogService({ hosted: true, erpUrl: url, getAccessToken: token }) };
}

test('catalog queries use the exact SDL names and the verbatim ERP URL with the current token', async (t) => {
  let token = 'one';
  const { svc, calls } = service(t, { token: () => token, respond: (_, o) => {
    const { query } = JSON.parse(o.body);
    if (query.includes('listarOdontologos')) return ok({ listarOdontologos: [{ id: 'o-1', nombres: 'Ana', apellidos: 'Paz', matriculaProfesional: 'M1' }] });
    if (query.includes('listarConsultorios')) return ok({ listarConsultorios: [{ id: 'k-1', codigo: 'C1', nombre: 'Sala 1', estado: 'ACTIVO' }] });
    return ok({ listarPacientes: [{ id: 'p-1', nombres: 'Luis', apellidos: 'Gil', ciNit: '123' }] });
  } });
  assert.deepEqual(await svc.listarOdontologos(), [{ id: 'o-1', label: 'Ana Paz (M1)' }]);
  token = 'two';
  assert.deepEqual(await svc.listarConsultorios(), [{ id: 'k-1', label: 'C1 — Sala 1' }]);
  assert.deepEqual(await svc.listarPacientes('Lu'), [{ id: 'p-1', label: 'Luis Gil (123)' }]);
  assert.deepEqual(calls.map(c => c.url), [URL_ERP, URL_ERP, URL_ERP]);
  assert.deepEqual(calls.map(c => c.headers.Authorization), ['Bearer one', 'Bearer two', 'Bearer two']);
  assert.ok(calls.every(c => c.method === 'POST' && c.headers['Content-Type'] === 'application/json'));
  assert.match(calls[0].body.query, /listarOdontologos\(soloActivos: true\)/);
  assert.match(calls[1].body.query, /listarConsultorios\b/);
  assert.match(calls[2].body.query, /listarPacientes\(busqueda: \$busqueda\)/);
  assert.deepEqual(calls[2].body.variables, { busqueda: 'Lu' });
});

test('hosted without an ERP URL fails closed for catalogs only, with zero HTTP and no guessed IDs', async (t) => {
  for (const url of [null, '']) {
    const { svc, calls } = service(t, { url });
    for (const op of ['listarOdontologos', 'listarConsultorios', 'listarPacientes']) {
      await assert.rejects(svc[op](), (error) => error.name === 'ErpCatalogUnavailableError' &&
        /ERP catalog URL is not configured/.test(error.message));
    }
    assert.deepEqual(calls, []);
    t.mock.restoreAll();
  }
});

test('hosted without a getter is rejected at construction', () => {
  assert.throws(() => erp.createErpCatalogService({ hosted: true, erpUrl: URL_ERP }), { name: 'ErpCatalogUnavailableError' });
});

for (const [label, read] of [['null', () => null], ['empty', () => ''], ['throwing', () => { throw new Error('x'); }]]) {
  test(`${label} token retires the catalog client permanently with zero HTTP`, async (t) => {
    let live = false;
    const { svc, calls } = service(t, { token: () => (live ? 'back' : read()) });
    await assert.rejects(svc.listarOdontologos(), { name: 'ErpCatalogUnavailableError' });
    live = true;
    await assert.rejects(svc.listarConsultorios(), { name: 'ErpCatalogUnavailableError' });
    assert.equal(svc.retired, true);
    assert.deepEqual(calls, []);
  });
}

test('late catalog results are inert after retirement', async (t) => {
  let release;
  const { svc } = service(t, { respond: () => new Promise(resolve => { release = () => resolve(ok({ listarOdontologos: [] })); }) });
  const pending = svc.listarOdontologos();
  await new Promise(setImmediate);
  svc.retire();
  release();
  await assert.rejects(pending, { name: 'ErpCatalogUnavailableError' });
});

test('GraphQL errors and HTTP failures surface their message', async (t) => {
  let respond = () => ({ ok: true, status: 200, json: async () => ({ errors: [{ message: 'Forbidden' }] }) });
  const { svc } = service(t, { respond: (...a) => respond(...a) });
  await assert.rejects(svc.listarOdontologos(), { name: 'ErpCatalogError', message: 'Forbidden' });
  respond = () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(svc.listarConsultorios(), { name: 'ErpCatalogError', message: 'ERP catalog request failed (HTTP 401)' });
});
