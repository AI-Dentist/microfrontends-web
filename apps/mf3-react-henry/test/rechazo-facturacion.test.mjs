import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from '../../mf-erp/node_modules/jsdom/lib/api.js';
import React, { act } from 'react';
import { mountRemote } from '../src/remote-session.js';

// Cached dependencies only. No server, real patient, storage or new API endpoint.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
register('./helpers/jsx-loader.mjs', import.meta.url);
const { ClinicalServicesContext } = await import('../src/context/ClinicalServices.jsx');
const { DevAuthContext } = await import('../src/context/dev-auth-context-def.js');
const { ConsultaCard } = await import('../src/components/consultas-odontologicas/ConsultaCard.jsx');
const { DetalleConsultaPage } = await import('../src/pages/DetalleConsultaPage.jsx');
const { CompletarConsultaModal } = await import('../src/components/consultas-odontologicas/CompletarConsultaModal.jsx');

const A = 'cons_10000000-0000-4000-8000-000000000001';
const B = 'cons_10000000-0000-4000-8000-000000000002';
const ISO = '2026-02-03T14:05:06.000Z';
const base = 'https://ms2.invalid/api/expediente';
const endpoint = id => `${base}/consultas-odontologicas/${id}`;
const catalogo = [
  { id: 'srv-fiction-old', codigo: 'FIC-1', nombre: 'Servicio anterior ficticio', precioBaseBs: '10.00' },
  { id: 'srv-fiction-new', codigo: 'FIC-2', nombre: 'Servicio corregido ficticio', precioBaseBs: '25.50' },
];
const rechazo = (motivoCodigo = 'SERVICIO_INACTIVO', motivo = 'Motivo sintético recibido de MS2') => ({ motivoCodigo, motivo, rechazadaEn: ISO });
function consulta(rechazoFacturacion = rechazo(), id = A) {
  return {
    id, historiaClinicaId: 'hc-fiction', pacienteId: '10000000-0000-4000-8000-000000000003',
    odontologoId: 'doctor-fiction', citaId: null, estado: 'EN_CURSO', cerradaEn: null,
    version: 7, fechaAtencion: '2026-02-02T10:00:00.000Z', motivoConsulta: 'Control clínico ficticio',
    exploracionFisica: { inspeccionIntraoral: 'Inspección ficticia documentada' },
    diagnosticos: [{ codigoCIE10: 'K02', descripcion: 'Diagnóstico ficticio', tipo: 'PRESUNTIVO' }],
    procedimientosRealizados: [], serviciosFacturables: [], rechazoFacturacion,
  };
}
function compatible(missing = false, id = A) {
  const value = consulta(null, id);
  if (missing) delete value.rechazoFacturacion;
  return value;
}
const completed = () => ({ ...consulta(null), estado: 'COMPLETADA', cerradaEn: ISO, version: 8,
  serviciosFacturables: [{ servicioId: 'srv-fiction-new', cantidad: 2 }], totalFacturableBs: '51.00' });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function scripted(t, handler) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const call = { url, ...options, payload: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    if (url === `${base}/consultas-odontologicas/catalogo-servicios`) return json(catalogo);
    return handler(call);
  });
  return calls;
}
function lease(t) {
  let current;
  const mounted = mountRemote({}, {
    contractVersion: 1, basePath: '/clinical', path: '/clinical/detalle-consulta',
    apiBaseUrl: base, serviceBaseUrls: {}, getAccessToken: () => 'synthetic-token', onNavigate() {},
  }, () => ({ render(value) { current = value; }, unmount() {} }));
  t.after(() => mounted.unmount());
  return { mounted, get services() { return current.clinicalServices; } };
}
async function view(t, Component, services, props = {}) {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const render = nextProps => act(async () => root.render(
    React.createElement(DevAuthContext.Provider, { value: { isRemote: true } },
      React.createElement(ClinicalServicesContext.Provider, { value: services }, React.createElement(Component, nextProps)))));
  await render(props);
  t.after(async () => { await act(async () => root.unmount()); node.remove(); });
  return { node, render };
}
function button(node, name) {
  const found = [...node.querySelectorAll('button')].find(item => name.test(item.textContent));
  assert.ok(found, `visible button matching ${name}`);
  return found;
}
async function click(node, name) { await act(async () => button(node, name).click()); }
async function change(node, selector, value) {
  const input = node.querySelector(selector);
  assert.ok(input, selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function reread(node) {
  await act(async () => node.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
}
function notice(node, reason = rechazo()) {
  const alert = [...node.querySelectorAll('[role="alert"]')].find(item => item.textContent.includes(reason.motivo));
  assert.ok(alert, `billing rejection must remain visible in role alert: ${reason.motivo}`);
  return alert;
}
function readableDate(alert) {
  const time = alert.querySelector('time');
  assert.ok(time, 'rejection date has a machine-readable time element');
  assert.equal(time.getAttribute('datetime'), ISO);
  assert.ok(time.textContent.trim().length > 0, 'rejection date also has readable display text');
  assert.doesNotMatch(time.textContent, /Invalid Date/);
  assert.match(time.textContent, /2026/);
}
function noMutations(calls) { assert.equal(calls.filter(call => call.method !== 'GET').length, 0); }
// A reverted-to-in-progress message must never share the screen with a closed consultation.
function noContradiction(node) {
  const reverted = [...node.querySelectorAll('[role="alert"]')].some(item => /volvi[oó] a estar en curso/i.test(item.textContent));
  const closed = /Cobro gestionado por el ERP/.test(node.textContent);
  assert.ok(!(reverted && closed), 'reverted notice shown alongside a COMPLETADA consultation');
}

// Spanish wording is semantic, not an invented exact copy requirement. Each code
// must explain its own cause, in addition to displaying the distinct server text.
const codes = [
  ['PACIENTE_INEXISTENTE', /paciente[\s\S]*(?:no existe|inexistente|no se encontr)/i],
  ['ODONTOLOGO_INEXISTENTE', /odont[oó]logo[\s\S]*(?:no existe|inexistente|no se encontr)/i],
  ['SERVICIO_INEXISTENTE', /servicio[\s\S]*(?:no existe|inexistente|no se encontr)/i],
  ['SERVICIO_INACTIVO', /servicio[\s\S]*(?:inactivo|no est[aá] activo)/i],
  ['MONTO_INVALIDO', /monto[\s\S]*(?:inv[aá]lido|no es v[aá]lido)/i],
  ['PAYLOAD_INVALIDO', /(?:datos|solicitud|informaci[oó]n)[\s\S]*(?:inv[aá]lid|no (?:son|es) v[aá]lid)/i],
  ['REINTENTOS_AGOTADOS', /(?:reintentos[\s\S]*agotad|agotad[\s\S]*reintentos)/i],
];
for (const [code, spanish] of codes) {
  for (const surface of ['list card', 'detail page']) test(`S3-S5 ${surface}: ${code} explains rejection, server reason, date and correction action`, async t => {
    const reason = rechazo(code);
    const s = lease(t);
    const calls = scripted(t, call => {
      assert.equal(call.url, endpoint(A)); assert.equal(call.method, 'GET');
      return json(consulta(reason));
    });
    const { node } = await view(t, surface === 'list card' ? ConsultaCard : DetalleConsultaPage, s.services,
      surface === 'list card' ? { consulta: consulta(reason), onVerDetalle() {} } : { initialConsultaId: A });
    const alert = notice(node, reason);
    assert.match(alert.textContent, spanish);
    readableDate(alert);
    button(alert, /corregir[\s\S]*(?:servicios|cerrar)/i);
    noMutations(calls);
  });
}

for (const missing of [false, true]) test(`S5 compatibility: ${missing ? 'absent' : 'null'} rejection preserves card navigation and detail completion`, async t => {
  const s = lease(t); const navigated = [];
  const calls = scripted(t, call => {
    assert.equal(call.url, endpoint(A)); return json(compatible(missing));
  });
  const card = await view(t, ConsultaCard, s.services, { consulta: compatible(missing), onVerDetalle: id => navigated.push(id) });
  assert.ok(card.node.querySelector('[role="alert"]') === null);
  await click(card.node, /Ver Detalle Clínico/);
  assert.deepEqual(navigated, [A]); assert.equal(calls.length, 0);
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  assert.ok(page.node.querySelector('[role="alert"]') === null);
  await click(page.node, /Completar Consulta/);
  assert.ok(page.node.querySelector('[role="dialog"]'));
  assert.ok(page.node.querySelector('input[type="number"]'));
  await click(page.node.querySelector('[role="dialog"]'), /^Volver$/);
  assert.ok(page.node.querySelector('[role="dialog"]') === null);
  assert.deepEqual(calls.map(call => call.url), [endpoint(A), `${base}/consultas-odontologicas/catalogo-servicios`]);
  noMutations(calls);
});

for (const surface of ['card', 'page']) test(`S5 ${surface}: hostile server reason is literal text, never HTML`, async t => {
  const malicious = '<img src=x onerror="window.__billingInjected=1"><script>window.__billingInjected=2</script>';
  const reason = rechazo('PAYLOAD_INVALIDO', malicious);
  const s = lease(t); const calls = scripted(t, () => json(consulta(reason)));
  const { node } = await view(t, surface === 'card' ? ConsultaCard : DetalleConsultaPage, s.services,
    surface === 'card' ? { consulta: consulta(reason) } : { initialConsultaId: A });
  assert.ok(notice(node, reason).textContent.includes(malicious));
  assert.ok(node.querySelector('img, script, [onerror]') === null);
  assert.equal(window.__billingInjected, undefined);
  noMutations(calls);
});

test('S5 correction: list action navigates through onVerDetalle, detail action opens existing selector and posts existing DTO', async t => {
  const s = lease(t); const navigated = [];
  const calls = scripted(t, call => {
    if (call.method === 'POST') { assert.equal(call.url, `${endpoint(A)}/completar`); return json(completed()); }
    assert.equal(call.url, endpoint(A)); return json(consulta());
  });
  const card = await view(t, ConsultaCard, s.services, { consulta: consulta(), onVerDetalle: id => navigated.push(id) });
  await click(notice(card.node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  assert.deepEqual(navigated, [A]);
  const { node } = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: navigated[0] });
  await click(notice(node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  const dialog = node.querySelector('[role="dialog"]'); assert.ok(dialog);
  assert.match(dialog.textContent, /Sellar y Completar Consulta/);
  assert.match(dialog.textContent, /nuevo cierre tras rechazo de facturación/);
  assert.doesNotMatch(dialog.textContent, /Irreversible|irrevocable/);
  await change(dialog, '[aria-label="Cantidad de Servicio anterior ficticio"]', '1');
  await change(dialog, '[aria-label="Cantidad de Servicio anterior ficticio"]', '0');
  await change(dialog, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  assert.match(dialog.textContent, /51\.00/);
  assert.equal(calls.filter(call => call.method === 'POST').length, 0, 'no automatic reclose or frontend rollback');
  await click(dialog, /Confirmar y Sellar/);
  const mutations = calls.filter(call => call.method !== 'GET');
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].url, `${endpoint(A)}/completar`);
  assert.deepEqual(mutations[0].payload, { versionEsperada: 7, serviciosFacturables: [{ servicioId: 'srv-fiction-new', cantidad: 2 }] });
  assert.ok(node.querySelector('[role="dialog"]') === null);
  const postIndex = calls.findIndex(call => call.method === 'POST');
  assert.ok(calls.slice(postIndex + 1).some(call => call.method === 'GET' && call.url === endpoint(A)),
    'successful reclose re-reads the same consultation automatically');
  notice(node); // MS2 still reports the rejection on that re-read.
  noContradiction(node);
});

// Reach lifecycle stages using the already-existing completion button. This keeps
// missing correction-action UI from masking the independent snapshot assertions.
for (const stage of ['modal close', 'POST pending', 'GET pending', 'GET failed', 'GET retains rejection', 'GET clears null', 'GET clears absent', 'GET clears completed']) {
  test(`S5 reclose lifecycle: ${stage}`, async t => {
    const s = lease(t); const post = deferred(); const read = deferred(); let reads = 0;
    const calls = scripted(t, call => {
      if (call.method === 'POST') { assert.equal(call.url, `${endpoint(A)}/completar`); return post.promise; }
      assert.equal(call.url, endpoint(A));
      return ++reads === 1 ? json(consulta()) : read.promise;
    });
    const { node } = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
    await click(node, /Completar Consulta/);
    if (stage === 'modal close') {
      await click(node.querySelector('[role="dialog"]'), /^Volver$/);
      assert.ok(node.querySelector('[role="dialog"]') === null); notice(node); noMutations(calls); return;
    }
    await change(node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
    await click(node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    assert.deepEqual(calls.find(call => call.method === 'POST').payload,
      { versionEsperada: 7, serviciosFacturables: [{ servicioId: 'srv-fiction-new', cantidad: 2 }] });
    if (stage === 'POST pending') {
      // Always release controlled promises even if the assertion is RED.
      try { notice(node); } finally { await act(async () => post.resolve(json(completed()))); }
      return;
    }
    await act(async () => post.resolve(json(completed())));
    assert.ok(node.querySelector('[role="dialog"]') === null);
    // The acknowledged POST triggers exactly one re-read; only that GET can clear the notice.
    assert.equal(reads, 2, 'successful reclose automatically re-reads the consultation');
    noContradiction(node);
    if (stage === 'GET pending') {
      try { notice(node); } finally { await act(async () => read.resolve(json(completed()))); }
      return;
    }
    if (stage === 'GET failed') {
      await act(async () => read.resolve(json({ title: 'Lectura fallida ficticia', detail: 'Reintente lectura ficticia', status: 503 }, 503)));
      assert.match(node.textContent, /Reintente lectura ficticia/); notice(node);
    } else if (stage === 'GET retains rejection') {
      await act(async () => read.resolve(json({ ...consulta(), version: 8 })));
      notice(node);
    } else if (stage === 'GET clears completed') {
      await act(async () => read.resolve(json(completed())));
      assert.ok(node.querySelector('[role="alert"]') === null);
      assert.match(node.textContent, /Cobro gestionado por el ERP/);
    } else {
      await act(async () => read.resolve(json(compatible(stage === 'GET clears absent'))));
      assert.ok(node.querySelector('[role="alert"]') === null);
      assert.ok(!node.textContent.includes(rechazo().motivo));
      await click(node, /Completar Consulta/);
      assert.ok(node.querySelector('[role="dialog"]'), 'successful read restores normal existing workflow');
    }
    noContradiction(node);
    assert.equal(reads, 2, 'no extra automatic reads');
    assert.equal(calls.filter(call => call.method !== 'GET').length, 1, 'no new mutation endpoints');
  });
}

test('S5 reclose: switching consultation while POST is pending does not re-read the previous one', async t => {
  const s = lease(t); const post = deferred(); let readsA = 0;
  const calls = scripted(t, call => {
    if (call.method === 'POST') return post.promise;
    if (call.url === endpoint(B)) return json(compatible(false, B));
    assert.equal(call.url, endpoint(A)); readsA++; return json(consulta());
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await click(notice(page.node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  await change(page.node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(page.node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
  await page.render({ initialConsultaId: B });
  await act(async () => post.resolve(json(completed())));
  assert.equal(readsA, 1, 'late acknowledgement must not re-read or reactivate the previous consultation');
  assert.match(page.node.textContent, new RegExp(B), 'late acknowledgement must not replace the current consultation');
  assert.doesNotMatch(page.node.textContent, new RegExp(A), 'previous consultation must not reappear');
  assert.ok(page.node.querySelector('[role="alert"]') === null);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
});

test('S5 reclose: late POST error after switching consultation does not leak into the current one', async t => {
  const s = lease(t); const post = deferred();
  scripted(t, call => {
    if (call.method === 'POST') return post.promise;
    if (call.url === endpoint(B)) return json(compatible(false, B));
    return json(consulta());
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await click(notice(page.node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  await change(page.node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(page.node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
  await page.render({ initialConsultaId: B });
  await act(async () => post.resolve(json({ title: 'Error tardío ficticio', detail: 'Detalle tardío ficticio', status: 422 }, 422)));
  assert.match(page.node.textContent, new RegExp(B));
  assert.doesNotMatch(page.node.textContent, /Detalle tardío ficticio/, 'late error belongs to the previous consultation');
});

test('S5 reclose: current consultation still applies its own POST response', async t => {
  const s = lease(t); const post = deferred(); const reread = deferred(); let reads = 0;
  scripted(t, call => {
    if (call.method === 'POST') return post.promise;
    return ++reads === 1 ? json(consulta()) : reread.promise;
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await click(notice(page.node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  await change(page.node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(page.node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
  await act(async () => post.resolve(json(completed())));
  await act(async () => reread.resolve(json(completed())));
  assert.match(page.node.textContent, /COMPLETADA/);
  assert.match(page.node.textContent, /Cobro gestionado por el ERP/);
});

test('S5 reclose: retired session ignores a late acknowledgement without re-reading', async t => {
  const s = lease(t); const post = deferred(); let reads = 0;
  scripted(t, call => {
    if (call.method === 'POST') return post.promise;
    reads++; return json(consulta());
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await click(notice(page.node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  await change(page.node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(page.node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
  s.mounted.unmount();
  await act(async () => post.resolve(json(completed())));
  assert.equal(reads, 1);
});

const GENERIC = 'El ERP rechazó la facturación de esta consulta.';
for (const surface of ['card', 'page']) test(`S5 ${surface}: unknown motivoCodigo shows generic Spanish text plus received reason`, async t => {
  const reason = rechazo('CODIGO_FUTURO_DESCONOCIDO', 'Motivo nuevo ficticio de MS2');
  const s = lease(t); const calls = scripted(t, () => json(consulta(reason)));
  const { node } = await view(t, surface === 'card' ? ConsultaCard : DetalleConsultaPage, s.services,
    surface === 'card' ? { consulta: consulta(reason) } : { initialConsultaId: A });
  const alert = notice(node, reason);
  assert.ok(alert.textContent.includes(GENERIC), 'generic explanation for unknown codes');
  readableDate(alert);
  noMutations(calls);
});

test('S5 known codes do not fall back to the generic explanation', async t => {
  const s = lease(t); scripted(t, () => json(consulta()));
  const { node } = await view(t, ConsultaCard, s.services, { consulta: consulta() });
  assert.ok(!notice(node).textContent.includes(GENERIC));
});

for (const [label, value] of [['malformed', 'no-es-una-fecha'], ['empty', ''], ['null', null], ['absent', undefined], ['number', 1770127506000]]) {
  for (const surface of ['card', 'page']) test(`S5 ${surface}: ${label} rechazadaEn omits the date without Invalid Date`, async t => {
    const reason = { ...rechazo('SERVICIO_INACTIVO', 'Motivo con fecha inválida ficticia'), rechazadaEn: value };
    if (value === undefined) delete reason.rechazadaEn;
    const s = lease(t); scripted(t, () => json(consulta(reason)));
    const { node } = await view(t, surface === 'card' ? ConsultaCard : DetalleConsultaPage, s.services,
      surface === 'card' ? { consulta: consulta(reason) } : { initialConsultaId: A });
    const alert = notice(node, reason);
    // Compare a boolean: a failing assert.equal on a JSDOM node makes node:assert inspect the whole DOM and hang.
    assert.ok(alert.querySelector('time') === null, 'invalid rechazadaEn must not render a <time> element');
    assert.doesNotMatch(alert.textContent, /Invalid Date|NaN|1970|Fecha del rechazo/);
    assert.match(alert.textContent, /servicio[\s\S]*inactivo/i);
  });
}

test('S5 scope: switching consultation IDs cannot show previous rejection while next GET is pending or resolved', async t => {
  const s = lease(t); const wait = deferred();
  const calls = scripted(t, call => {
    if (call.url === endpoint(A)) return json(consulta());
    assert.equal(call.url, endpoint(B)); return wait.promise;
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  // The dedicated display cases above assert initial presence; this case isolates leakage.
  await page.render({ initialConsultaId: B });
  const pendingText = page.node.textContent;
  await act(async () => wait.resolve(json(compatible(false, B))));
  assert.ok(!pendingText.includes(rechazo().motivo));
  assert.ok(!page.node.textContent.includes(rechazo().motivo));
  // A late POST overwriting the view is a pre-existing hook behavior outside this change.
  assert.ok(page.node.querySelector('[role="alert"]') === null); noMutations(calls);
});

for (const outcome of ['success', 'error']) test(`S5 retired scope: late GET ${outcome} cannot publish rejection into another consultation`, async t => {
  const old = lease(t); const wait = deferred();
  const calls = scripted(t, call => {
    if (call.url === endpoint(A)) return wait.promise;
    assert.equal(call.url, endpoint(B)); return json(compatible(false, B));
  });
  const prior = await view(t, DetalleConsultaPage, old.services, { initialConsultaId: A });
  old.mounted.unmount(); // Public session retirement, not a parallel fake activity guard.
  const current = lease(t);
  const next = await view(t, DetalleConsultaPage, current.services, { initialConsultaId: B });
  const before = prior.node.textContent;
  await act(async () => wait.resolve(outcome === 'success' ? json(consulta()) : json({ title: 'Error anterior ficticio', status: 503 }, 503)));
  assert.equal(prior.node.textContent, before);
  assert.match(next.node.textContent, new RegExp(B));
  assert.ok(!next.node.textContent.includes(rechazo().motivo));
  assert.ok(next.node.querySelector('[role="alert"]') === null); noMutations(calls);
});

test('S5 failed reclose keeps rejection and existing validation response without a second mutation', async t => {
  const s = lease(t);
  const calls = scripted(t, call => call.method === 'POST'
    ? json({ title: 'Validación de cierre ficticia', detail: 'Servicio rechazado ficticio', status: 422 }, 422)
    : json(consulta()));
  const { node } = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await click(notice(node), /corregir[\s\S]*(?:servicios|cerrar)/i);
  await change(node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(node.querySelector('[role="dialog"]'), /Confirmar y Sellar/);
  notice(node);
  assert.match(node.textContent, /Servicio rechazado ficticio/);
  assert.ok(node.querySelector('[role="dialog"]'), 'failed confirmation does not dismiss the modal');
  const mutations = calls.filter(call => call.method !== 'GET');
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].url, `${endpoint(A)}/completar`);
  assert.deepEqual(mutations[0].payload, { versionEsperada: 7, serviciosFacturables: [{ servicioId: 'srv-fiction-new', cantidad: 2 }] });
});

// Re-enter A while an older A read is outstanding. The synthetic transport
// deliberately ignores AbortSignal, so request identity, not cancellation, wins.
for (const outcome of ['null', 'rejection', 'error']) test(`S5 latest same-ID read wins over late ${outcome}`, async t => {
  const s = lease(t); const older = deferred(); const other = deferred(); let readsA = 0;
  const latest = rechazo('MONTO_INVALIDO', 'Motivo de la lectura más reciente ficticia');
  const calls = scripted(t, call => {
    if (call.url === endpoint(B)) return other.promise;
    assert.equal(call.url, endpoint(A));
    readsA++;
    if (readsA === 1) return json(consulta());
    if (readsA === 2) return older.promise;
    return json(consulta(latest));
  });
  const page = await view(t, DetalleConsultaPage, s.services, { initialConsultaId: A });
  await reread(page.node);
  await page.render({ initialConsultaId: B });
  await page.render({ initialConsultaId: A });
  assert.equal(readsA, 3);
  await act(async () => {
    other.resolve(json(compatible(false, B)));
    older.resolve(outcome === 'error' ? json({ title: 'Error obsoleto ficticio', status: 503 }, 503)
      : json(outcome === 'null' ? compatible() : consulta()));
  });
  notice(page.node, latest);
  assert.ok(!page.node.textContent.includes(rechazo().motivo));
  noMutations(calls);
});

// PRESERVE: direct public modal callback and quantity validation, with no rejection.
for (const missing of [false, true]) test(`PRESERVE modal ${missing ? 'absent' : 'null'} rejection: quantity correction, version callback and close`, async t => {
  const s = lease(t); const payloads = []; let closes = 0;
  const calls = scripted(t, () => { throw Error('direct modal must not issue HTTP'); });
  const { node } = await view(t, CompletarConsultaModal, s.services, {
    isOpen: true, consulta: compatible(missing), catalogo,
    onClose() { closes++; }, onConfirmar: async payload => { payloads.push(payload); return completed(); },
  });
  assert.ok(node.querySelector('[role="alert"]') === null);
  assert.match(node.textContent, /Confirmación de Cierre Irreversible/);
  await change(node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '1.5');
  assert.equal(button(node, /Confirmar y Sellar/).disabled, true);
  await click(node, /Confirmar y Sellar/);
  assert.deepEqual(payloads, []); assert.equal(closes, 0);
  await change(node, '[aria-label="Cantidad de Servicio corregido ficticio"]', '2');
  await click(node, /Confirmar y Sellar/);
  assert.deepEqual(payloads, [{ versionEsperada: 7, serviciosFacturables: [{ servicioId: 'srv-fiction-new', cantidad: 2 }] }]);
  assert.equal(closes, 1); assert.equal(calls.length, 0);
});

test.after(() => { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
