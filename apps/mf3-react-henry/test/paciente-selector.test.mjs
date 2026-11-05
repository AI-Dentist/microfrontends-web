import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from '../../mf-erp/node_modules/jsdom/lib/api.js';
import React, { act } from 'react';
import { mountRemote } from '../src/remote-session.js';

// Reuse the installed isolated DOM, never start a server or contact real APIs.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.invalid/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
register('./helpers/jsx-loader.mjs', import.meta.url);
const { ClinicalServicesContext } = await import('../src/context/ClinicalServices.jsx');
const { DevAuthContext } = await import('../src/context/dev-auth-context-def.js');
const { CrearHistoriaPage } = await import('../src/pages/CrearHistoriaPage.jsx');
const { ConsultaHistoriaPage } = await import('../src/pages/ConsultaHistoriaPage.jsx');
const { AbrirConsultaPage } = await import('../src/pages/AbrirConsultaPage.jsx');
const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const patient = (id = A) => ({ id, nombres: 'Persona ficticia', apellidos: id === A ? 'Alfa' : 'Beta', activo: true });
const erp = 'https://erp.invalid/graphql?tenant=a%2Fb&tag=one&tag=two';
const context = (getter, extra = {}) => ({ contractVersion: 1, basePath: '/clinical', path: '/clinical/crear',
  apiBaseUrl: 'https://ms2.invalid/api', serviceBaseUrls: { erp }, getAccessToken: getter, onNavigate() {}, ...extra });
function lease(getter = () => 'opaque', extra = {}) {
  let current;
  const mounted = mountRemote({}, context(getter, extra), () => ({ render(value) { current = value; }, unmount() {} }));
  return { mounted, get current() { return current; } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function scripted(t, handler = () => json({})) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const call = { url, ...options, payload: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    return handler(call);
  });
  return calls;
}
async function view(t, Component, services, props = {}, remote = true) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(React.createElement(DevAuthContext.Provider, { value: { isRemote: remote } },
    React.createElement(ClinicalServicesContext.Provider, { value: services }, React.createElement(Component, props)))));
  t.after(async () => { await act(async () => root.unmount()); node.remove(); });
  return node;
}
async function change(node, selector, value) {
  const input = node.querySelector(selector); assert.ok(input, selector);
  await act(async () => {
    const proto = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function click(node, selector) { await act(async () => node.querySelector(selector).click()); }
async function submit(node) { await act(async () => node.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
async function searchAndSelect(node, id = A) {
  await change(node, '[aria-label="Buscar paciente ERP"]', 'Persona');
  await change(node, '[aria-label="Paciente del catálogo ERP"]', id);
}
function erpReply(call, detail = patient()) {
  return call.payload.query.includes('listarPacientes') ? json({ data: { listarPacientes: [patient(), patient(B)] } }) : json({ data: { obtenerPacientePorId: detail } });
}

test('public session supplies a lazy ERP service, exact URL and live current token', async t => {
  let token = 'opaque-one'; const session = lease(() => token);
  const calls = scripted(t, call => erpReply(call));
  const service = session.current.clinicalServices.erpPacientesService;
  assert.ok(service, 'hosted bundle must expose ERP patients');
  assert.equal(calls.length, 0);
  assert.equal(service.configured, true);
  assert.deepEqual(await service.listarPacientes('Persona'), [patient(), patient(B)]);
  token = 'opaque-two'; assert.deepEqual(await service.validarPaciente(A), patient());
  assert.deepEqual(calls.map(c => c.url), [erp, erp]);
  assert.deepEqual(calls.map(c => c.headers.Authorization), ['Bearer opaque-one', 'Bearer opaque-two']);
  assert.deepEqual(calls[0].payload.variables, { busqueda: 'Persona' });
  assert.deepEqual(calls[1].payload.variables, { id: A });
  assert.match(calls[0].payload.query, /id nombres apellidos activo/);
  assert.doesNotMatch(calls[0].payload.query, /sub|odontologo|cedula|telefono|email/);
  session.mounted.unmount();
});

test('invalid UUID and missing hosted ERP reject without HTTP; null/inactive/mismatched detail reject 422', async t => {
  let detail = null; const calls = scripted(t, call => erpReply(call, detail));
  const s = lease(); const service = s.current.clinicalServices.erpPacientesService;
  assert.ok(service, 'ERP validation must exist before clinical writes');
  for (const invalid of ['', 'pac_dev', 'doctor-sub', '10000000-0000-4000-8000-00000000000z']) {
    await assert.rejects(service.validarPaciente(invalid), { status: 422 });
  }
  assert.equal(calls.length, 0);
  const missing = lease(() => 'opaque', { serviceBaseUrls: {} });
  await assert.rejects(missing.current.clinicalServices.erpPacientesService.listarPacientes('x'), /configuró/);
  assert.equal(calls.length, 0);
  for (detail of [null, { ...patient(), activo: false }, patient(B)]) {
    await assert.rejects(service.validarPaciente(A), { status: 422, title: 'PacienteInexistente' });
  }
  assert.equal(calls.length, 3); s.mounted.unmount(); missing.mounted.unmount();
});

for (const transition of ['unmount', 'erp', 'getter', 'null']) test(`ERP lease ${transition}: late success/error and future calls inert`, async t => {
  for (const status of [200, 403]) {
    let token = 'opaque'; const getter = () => token; const s = lease(getter);
    const wait = deferred(); const calls = scripted(t, () => wait.promise);
    const service = s.current.clinicalServices.erpPacientesService;
    assert.ok(service, 'ERP lease required');
    const pending = service.validarPaciente(A);
    if (transition === 'unmount') s.mounted.unmount();
    if (transition === 'erp') s.mounted.update(context(getter, { serviceBaseUrls: { erp: erp + '&new=1' } }));
    if (transition === 'getter') s.mounted.update(context(() => 'new'));
    if (transition === 'null') token = null;
    wait.resolve(json(status === 200 ? { data: { obtenerPacientePorId: patient() } } : { detail: 'denied' }, status));
    await assert.rejects(pending, { name: 'AbortError' });
    token = 'refreshed'; await assert.rejects(service.listarPacientes('Persona'), { name: 'AbortError' });
    assert.equal(calls.length, 1); s.mounted.unmount();
  }
});

for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage, AbrirConsultaPage]) test(`${Page.name}: hosted missing ERP is visible, no manual patient fallback or submission`, async t => {
  const s = lease(() => 'opaque', { serviceBaseUrls: {} }); const calls = scripted(t);
  const node = await view(t, Page, s.current.clinicalServices);
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  assert.match(node.textContent, /Catálogo de pacientes no disponible/);
  assert.equal(node.querySelector('#pacienteId, #pacIdInput'), null);
  await submit(node); assert.equal(calls.length, 0); s.mounted.unmount();
});

test('mounted selector: last search wins including late error/finally; selection clears immediately and validation races cannot restore it', async t => {
  const waits = []; const calls = scripted(t, () => { const wait = deferred(); waits.push(wait); return wait.promise; });
  const s = lease(); const node = await view(t, CrearHistoriaPage, s.current.clinicalServices);
  assert.ok(node.querySelector('[aria-label="Buscar paciente ERP"]'), 'hosted selector must replace manual ID');
  await change(node, '[aria-label="Buscar paciente ERP"]', 'old');
  await change(node, '[aria-label="Buscar paciente ERP"]', 'new');
  await act(async () => waits[1].resolve(json({ data: { listarPacientes: [patient(B)] } })));
  await act(async () => waits[0].reject(new Error('late network error')));
  assert.match(node.textContent, /Beta/); assert.doesNotMatch(node.textContent, /late network error|Buscando/);
  await change(node, '[aria-label="Paciente del catálogo ERP"]', B);
  await change(node, '[aria-label="Buscar paciente ERP"]', 'third');
  await act(async () => waits[2].resolve(json({ data: { obtenerPacientePorId: patient(B) } })));
  await submit(node);
  assert.equal(calls.filter(c => c.method !== 'POST' || !c.payload.query).length, 0);
  assert.equal(calls.length, 4, 'no submit revalidation or clinical mutation after intent clears selection');
  assert.match(node.textContent, /Seleccione un paciente/); s.mounted.unmount();
});

for (const outcome of ['empty', '403', 'network', 'null', 'inactive']) test(`mounted selector visibly handles ${outcome} and never creates history`, async t => {
  let validating = false;
  const calls = scripted(t, call => {
    if (outcome === '403') return json({ detail: 'Acceso denegado ficticio' }, 403);
    if (outcome === 'network') throw Error('offline');
    if (outcome === 'empty') return json({ data: { listarPacientes: [] } });
    validating = !call.payload.query.includes('listarPacientes');
    return erpReply(call, outcome === 'null' ? null : { ...patient(), activo: false });
  });
  const s = lease(); const node = await view(t, CrearHistoriaPage, s.current.clinicalServices);
  assert.ok(node.querySelector('[aria-label="Buscar paciente ERP"]'), 'hosted selector required');
  await change(node, '[aria-label="Buscar paciente ERP"]', 'Persona');
  if (['null', 'inactive'].includes(outcome)) { await change(node, '[aria-label="Paciente del catálogo ERP"]', A); assert.equal(validating, true); }
  assert.match(node.textContent, outcome === 'empty' ? /No hay pacientes activos/ : outcome === '403' ? /403|Acceso denegado/ : outcome === 'network' ? /conexión/ : /PacienteInexistente/);
  await submit(node); assert.equal(calls.every(c => c.url === erp), true); s.mounted.unmount();
});

for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage, AbrirConsultaPage]) test(`${Page.name}: real submission revalidates active selection and preserves clinical identity DTO`, async t => {
  const calls = scripted(t, call => {
    if (call.url === erp) return erpReply(call);
    if (call.url.endsWith('/historias-clinicas/hc-fiction')) return json({ id: 'hc-fiction', pacienteId: A });
    return json({ id: 'hc-fiction', pacienteId: A });
  });
  const s = lease(); const node = await view(t, Page, s.current.clinicalServices, { initialHistoriaId: 'hc-fiction' });
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  assert.ok(node.querySelector('[aria-label="Buscar paciente ERP"]'), 'hosted selector required');
  await searchAndSelect(node);
  if (Page === AbrirConsultaPage) await change(node, '#motivoInput', 'Motivo ficticio');
  await submit(node);
  const detail = calls.filter(c => c.url === erp && c.payload.query.includes('obtenerPacientePorId'));
  assert.equal(detail.length, 2, 'selection and actual submit each validate');
  const clinical = calls.filter(c => c.url !== erp); assert.ok(clinical.length > 0);
  if (Page === ConsultaHistoriaPage) assert.equal(clinical[0].url, `https://ms2.invalid/api/historias-clinicas?pacienteId=${A}`);
  else {
    const mutation = clinical.find(c => c.method === 'POST'); assert.ok(mutation);
    assert.equal(mutation.payload.pacienteId, A);
    assert.equal(Object.hasOwn(mutation.payload, 'odontologoResponsableId'), false);
    assert.equal(Object.hasOwn(mutation.payload, 'odontologoId'), false);
    if (Page === AbrirConsultaPage) { assert.equal(mutation.payload.historiaClinicaId, 'hc-fiction'); assert.equal(mutation.payload.citaId, null); }
  }
  s.mounted.unmount();
});

for (const rejected of ['inactive', 'history mismatch', 'intent changed', 'retired']) test(`open consulta rejects ${rejected} before mutation/callback`, async t => {
  const wait = deferred(); let details = 0; let callback = 0;
  const calls = scripted(t, call => {
    if (call.url === erp) {
      if (call.payload.query.includes('obtenerPacientePorId') && ++details === 2) {
        if (rejected === 'inactive') return erpReply(call, { ...patient(), activo: false });
        if (['intent changed', 'retired'].includes(rejected)) return wait.promise;
      }
      return erpReply(call);
    }
    return json({ id: 'hc-fiction', pacienteId: B });
  });
  const s = lease(); const node = await view(t, AbrirConsultaPage, s.current.clinicalServices,
    { initialHistoriaId: 'hc-fiction', onConsultaCreada() { callback++; } });
  assert.ok(node.querySelector('[aria-label="Buscar paciente ERP"]'), 'hosted selector required');
  await searchAndSelect(node); await change(node, '#motivoInput', 'Motivo ficticio'); await submit(node);
  if (rejected === 'intent changed') await change(node, '[aria-label="Buscar paciente ERP"]', 'different');
  if (rejected === 'retired') s.mounted.unmount();
  if (['intent changed', 'retired'].includes(rejected)) await act(async () => wait.resolve(json({ data: { obtenerPacientePorId: patient() } })));
  assert.equal(calls.some(c => c.url !== erp && c.method === 'POST'), false);
  assert.equal(callback, 0);
  if (rejected === 'inactive') assert.match(node.textContent, /PacienteInexistente/);
  if (rejected === 'history mismatch') {
    assert.match(node.textContent, /PacienteNoCoincide/);
    assert.match(node.textContent, /HTTP 422/);
    assert.doesNotMatch(node.textContent, /HTTP 400/);
  }
  s.mounted.unmount();
});

// PRESERVE: all three standalone patient entry paths still submit their legacy IDs.
for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage, AbrirConsultaPage]) test(`${Page.name}: standalone manual patient behavior preserved`, async t => {
  const s = lease(); const calls = scripted(t, () => json({ id: 'hc-fiction', pacienteId: 'pac_manual' }));
  const node = await view(t, Page, s.current.clinicalServices, { initialHistoriaId: 'hc-fiction' }, false);
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  await change(node, Page === CrearHistoriaPage ? '#pacienteId' : Page === AbrirConsultaPage ? '#pacIdInput' : '[aria-label="Criterio de búsqueda"]', 'pac_manual');
  if (Page === AbrirConsultaPage) await change(node, '#motivoInput', 'Motivo ficticio');
  await submit(node);
  assert.equal(node.querySelector('[aria-label="Buscar paciente ERP"]'), null);
  assert.equal(calls.length, 1);
  if (Page === ConsultaHistoriaPage) assert.match(calls[0].url, /historias-clinicas\?pacienteId=pac_manual$/);
  else assert.equal(calls[0].payload.pacienteId, 'pac_manual');
  if (Page === CrearHistoriaPage) assert.equal(calls[0].payload.odontologoResponsableId, 'od_dev_henry');
  s.mounted.unmount();
});

test('history ID lookup remains separate from ERP and synthetic patient chips are standalone-only', async t => {
  const s = lease(); const calls = scripted(t, () => json({ id: 'hc-fiction', pacienteId: A }));
  const node = await view(t, ConsultaHistoriaPage, s.current.clinicalServices);
  await change(node, '[aria-label="Criterio de búsqueda"]', 'hc-fiction'); await submit(node);
  assert.deepEqual(calls.map(c => c.url), ['https://ms2.invalid/api/historias-clinicas/hc-fiction']);
  assert.doesNotMatch(node.textContent, /Paciente E2E|tratamiento/i); s.mounted.unmount();
});

for (const [Page, status, detail] of [[CrearHistoriaPage, 409, 'Historia duplicada ficticia'], [ConsultaHistoriaPage, 404, 'Sin historia ficticia']]) test(`${Page.name}: canonical patient preserves MS2 ${status} errors`, async t => {
  const s = lease(); const calls = scripted(t, call => call.url === erp ? erpReply(call) : json({ title: 'Error clínico', detail, status }, status));
  const node = await view(t, Page, s.current.clinicalServices);
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  await searchAndSelect(node); await submit(node);
  assert.match(node.textContent, new RegExp(detail));
  assert.equal(calls.filter(c => c.url !== erp).length, 1); s.mounted.unmount();
});

for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage]) test(`${Page.name}: submit-time inactive detail clears selection and prevents clinical HTTP`, async t => {
  let details = 0;
  const s = lease(); const calls = scripted(t, call => {
    if (call.payload.query.includes('obtenerPacientePorId') && ++details === 2) return erpReply(call, { ...patient(), activo: false });
    return erpReply(call);
  });
  const node = await view(t, Page, s.current.clinicalServices);
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  await searchAndSelect(node); await submit(node);
  assert.equal(node.querySelector('[aria-label="Paciente del catálogo ERP"]').value, '');
  assert.match(node.textContent, /PacienteInexistente/);
  assert.equal(calls.length, 3); assert.equal(calls.every(c => c.url === erp), true); s.mounted.unmount();
});

for (const late of ['success', 'error']) test(`mounted search and selection ${late} stay inert after ERP replacement`, async t => {
  const wait = deferred(); const calls = scripted(t, () => wait.promise);
  const getter = () => 'opaque'; const s = lease(getter);
  const node = await view(t, CrearHistoriaPage, s.current.clinicalServices);
  await change(node, '[aria-label="Buscar paciente ERP"]', 'Persona');
  const before = node.textContent;
  s.mounted.update(context(getter, { serviceBaseUrls: { erp: 'https://erp.invalid/replacement' } }));
  await act(async () => late === 'success' ? wait.resolve(erpReply(calls[0])) : wait.reject(Error('old error')));
  assert.equal(node.textContent, before);
  await submit(node); assert.equal(calls.length, 1); assert.equal(node.textContent, before); s.mounted.unmount();
});

test('appointment patient identity is revalidated and matched to history; mode changes invalidate urgency selection', async t => {
  const getter = () => 'opaque'; const s = lease(getter, { serviceBaseUrls: { erp, agenda: 'https://agenda.invalid/api' } });
  let historyPatient = A;
  const calls = scripted(t, call => {
    if (call.url === erp) return erpReply(call);
    if (call.url.includes('agenda.invalid')) return json({ citas: [{ id: 'cita-fiction', paciente_id: A, odontologo_id: 'doctor-fiction', estado: 'CONFIRMADA' }] });
    if (call.url.endsWith('/historias-clinicas/hc-fiction')) return json({ id: 'hc-fiction', pacienteId: historyPatient });
    return json({ id: 'cons-fiction', historiaClinicaId: 'hc-fiction' });
  });
  const node = await view(t, AbrirConsultaPage, s.current.clinicalServices, { initialHistoriaId: 'hc-fiction' });
  await searchAndSelect(node); await change(node, '#motivoInput', 'Motivo ficticio');
  await click(node, '#tieneCitaCheck');
  await change(node, '#citaAgendaSelect', 'cita-fiction');
  assert.equal(node.querySelector('#pacIdInput'), null);
  await submit(node);
  const mutation = calls.find(c => c.url.includes('ms2.invalid') && c.method === 'POST');
  assert.equal(mutation.payload.pacienteId, A); assert.equal(mutation.payload.citaId, 'cita-fiction');
  assert.equal(Object.hasOwn(mutation.payload, 'odontologoId'), false);
  historyPatient = B; await submit(node);
  assert.equal(calls.filter(c => c.url.includes('ms2.invalid') && c.method === 'POST').length, 1);
  assert.match(node.textContent, /PacienteNoCoincide/);
  await click(node, '#tieneCitaCheck'); await submit(node);
  assert.match(node.textContent, /Seleccione un paciente/);
  assert.equal(calls.filter(c => c.url.includes('ms2.invalid') && c.method === 'POST').length, 1); s.mounted.unmount();
});

test('mounted selector clears a valid selection during next validation and ignores older successful searches', async t => {
  const waits = []; let delay = false;
  const s = lease(); const calls = scripted(t, call => {
    if (!delay) return erpReply(call);
    const wait = deferred(); waits.push(wait); return wait.promise;
  });
  const node = await view(t, CrearHistoriaPage, s.current.clinicalServices);
  await searchAndSelect(node); assert.equal(node.querySelector('select').value, A);
  delay = true;
  await change(node, '[aria-label="Paciente del catálogo ERP"]', B);
  assert.equal(node.querySelector('select').value, ''); assert.match(node.textContent, /Validando paciente/);
  await submit(node); assert.equal(calls.length, 3, 'pending selection cannot submit');
  await act(async () => waits[0].resolve(json({ data: { obtenerPacientePorId: null } })));
  assert.equal(node.querySelector('select').value, ''); assert.match(node.textContent, /PacienteInexistente/);
  await change(node, '[aria-label="Buscar paciente ERP"]', 'old');
  await change(node, '[aria-label="Buscar paciente ERP"]', 'new');
  await act(async () => waits[2].resolve(json({ data: { listarPacientes: [patient(B)] } })));
  await act(async () => waits[1].resolve(json({ data: { listarPacientes: [patient()] } })));
  assert.match(node.querySelector('select').textContent, /Beta/); assert.doesNotMatch(node.querySelector('select').textContent, /Alfa/);
  s.mounted.unmount();
});

for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage]) test(`${Page.name}: changed search intent cancels pending submit revalidation`, async t => {
  const wait = deferred(); let details = 0;
  const s = lease(); const calls = scripted(t, call => {
    if (call.payload.query.includes('obtenerPacientePorId') && ++details === 2) return wait.promise;
    return erpReply(call);
  });
  const node = await view(t, Page, s.current.clinicalServices);
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  await searchAndSelect(node); await submit(node);
  await change(node, '[aria-label="Buscar paciente ERP"]', 'new intention');
  await act(async () => wait.resolve(json({ data: { obtenerPacientePorId: patient() } })));
  assert.equal(calls.every(c => c.url === erp), true);
  assert.equal(node.querySelector('select').value, ''); s.mounted.unmount();
});

for (const Page of [CrearHistoriaPage, ConsultaHistoriaPage, AbrirConsultaPage]) test(`${Page.name}: retired clinical response cannot publish success, error or callback`, async t => {
  const wait = deferred(); let callback = 0;
  const s = lease(); const calls = scripted(t, call => {
    if (call.url === erp) return erpReply(call);
    if (call.url.endsWith('/historias-clinicas/hc-fiction')) return json({ id: 'hc-fiction', pacienteId: A });
    return wait.promise;
  });
  const node = await view(t, Page, s.current.clinicalServices, { initialHistoriaId: 'hc-fiction', onConsultaCreada() { callback++; } });
  if (Page === ConsultaHistoriaPage) await click(node, 'input[value="PACIENTE"]');
  await searchAndSelect(node);
  if (Page === AbrirConsultaPage) await change(node, '#motivoInput', 'Motivo ficticio');
  await submit(node); const before = node.textContent;
  assert.ok(calls.some(c => c.url !== erp)); s.mounted.unmount();
  await act(async () => wait.resolve(json({ id: 'late-fiction', pacienteId: A })));
  assert.equal(callback, 0); assert.equal(node.textContent, before);
});

test('patient listing filters inactive entries and exposes GraphQL failures, never interprets them as empty success', async t => {
  let error = false;
  const s = lease(); scripted(t, () => error ? json({ errors: [{ message: 'Catálogo no autorizado ficticio' }] }) : json({ data: { listarPacientes: [patient(), { ...patient(B), activo: false }] } }));
  const service = s.current.clinicalServices.erpPacientesService;
  assert.deepEqual(await service.listarPacientes(''), [patient()]); error = true;
  await assert.rejects(service.listarPacientes('Persona'), /Catálogo no autorizado ficticio/); s.mounted.unmount();
});

test.after(() => { dom.window.close(); delete globalThis.window; delete globalThis.document; delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
