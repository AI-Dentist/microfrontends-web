import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createHttpClient } from '../src/api/client.js';
import { createConsultasOdontologicasService } from '../src/api/consultas-odontologicas.service.js';
import { mountRemote } from '../src/remote-session.js';

register('./helpers/jsx-loader.mjs', import.meta.url);
const { ClinicalServicesContext } = await import('../src/context/ClinicalServices.jsx');
const { DevAuthContext } = await import('../src/context/dev-auth-context-def.js');
const { Input } = await import('../src/components/common/Input.jsx');
const abrir = await import('../src/pages/AbrirConsultaPage.jsx');
const { CrearHistoriaPage } = await import('../src/pages/CrearHistoriaPage.jsx');
const detalle = await import('../src/pages/DetalleConsultaPage.jsx');

const clinicalBase = 'https://clinical.example/api/expediente';
const agendaBase = 'https://agenda.example/api/agendamiento?tenant=a%2Fb';
const denied = { name: 'AbortError' };
const context = (getAccessToken, extra = {}) => ({
  contractVersion: 1, basePath: '/clinical', path: '/clinical/abrir-consulta',
  apiBaseUrl: clinicalBase, serviceBaseUrls: { agenda: agendaBase },
  getAccessToken, onNavigate() {}, ...extra,
});
const mount = (ctx) => {
  let rendered;
  const instance = mountRemote({}, ctx, () => ({ render(value) { rendered = value; }, unmount() {} }));
  return { instance, current: () => rendered };
};

// Shaped exactly like MS3 CitaController::index and Cita::toArray.
const cita = (id, estado, extra = {}) => ({
  id, idempotency_key: `key-${id}`, odontologo_id: 'od-uuid-1', consultorio_id: 'con-1',
  paciente_id: 'pac-1', fecha_hora: '2026-11-04T10:00:00-04:00', estado, ...extra,
});
const listBody = (citas) => JSON.stringify({
  success: true, data: { citas, total: citas.length }, citas, total: citas.length,
  timestamp: '2026-11-03T10:00:00+00:00',
});
const allStates = ['RESERVADA', 'CONFIRMADA', 'EN_ATENCION', 'PROGRAMADA', 'PENDIENTE', 'REPROGRAMADA',
  'CANCELADA', 'COMPLETADA', 'NO_ASISTIO'].map((estado, i) => cita(`cita-${i}`, estado));

test('hosted agenda lists appointments from the agenda base with the current token, keeping only MS2-eligible states', async (t) => {
  let token = 'opaque-one';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.headers.Authorization]);
    return new Response(listBody([...allStates, cita('cita-lower', ' reprogramada ')]));
  });
  const { instance, current } = mount(context(() => token));
  const { agendaService } = current().clinicalServices;
  assert.ok(agendaService, 'clinical services expose an agenda service');
  assert.equal(agendaService.configured, true);
  const citas = await agendaService.listarCitas();
  token = 'opaque-two';
  await agendaService.listarCitas();
  assert.deepEqual(citas.map(c => c.estado),
    ['RESERVADA', 'CONFIRMADA', 'EN_ATENCION', 'PROGRAMADA', 'PENDIENTE', 'REPROGRAMADA', 'REPROGRAMADA']);
  assert.deepEqual(citas[5], {
    id: 'cita-5', pacienteId: 'pac-1', odontologoId: 'od-uuid-1', consultorioId: 'con-1',
    fechaHora: '2026-11-04T10:00:00-04:00', estado: 'REPROGRAMADA',
  });
  assert.deepEqual(calls, [
    ['https://agenda.example/api/agendamiento/citas?tenant=a%2Fb', 'GET', 'Bearer opaque-one'],
    ['https://agenda.example/api/agendamiento/citas?tenant=a%2Fb', 'GET', 'Bearer opaque-two'],
  ]);
  instance.unmount();
});

test('hosted without an agenda base fails closed for appointments only', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return new Response('{"id":"cons_1"}'); });
  const { instance, current } = mount(context(() => 'opaque', { serviceBaseUrls: undefined }));
  const { agendaService, consultasOdontologicasService } = current().clinicalServices;
  assert.equal(agendaService.configured, false);
  await assert.rejects(agendaService.listarCitas(), (error) => {
    assert.equal(error.name, 'ProblemDetailsError');
    assert.match(error.detail, /agenda/i);
    return true;
  });
  assert.equal(calls.length, 0);
  await consultasOdontologicasService.getById('cons_1');
  assert.deepEqual(calls, [`${clinicalBase}/consultas-odontologicas/cons_1`]);
  instance.unmount();
});

for (const capability of [() => null, () => { throw Error('retired'); }, () => Promise.resolve('opaque')]) {
  test('agenda client sends zero HTTP without a synchronous token and never revives', async (t) => {
    let token = capability;
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(listBody([])); });
    const { instance, current } = mount(context(() => token()));
    await assert.rejects(current().clinicalServices.agendaService.listarCitas(), denied);
    token = () => 'opaque-later';
    await assert.rejects(current().clinicalServices.agendaService.listarCitas(), denied);
    assert.equal(calls, 0);
    instance.unmount();
  });
}

test('late agenda results are inert after unmount or agenda base replacement', async (t) => {
  for (const retirement of ['unmount', 'agenda-base']) {
    let release;
    const calls = [];
    t.mock.method(globalThis, 'fetch', (url) => {
      calls.push(url);
      return new Promise(resolve => { release = () => resolve(new Response(listBody(allStates))); });
    });
    const getter = () => 'opaque';
    const { instance, current } = mount(context(getter));
    const old = current().clinicalServices;
    const pending = old.agendaService.listarCitas().then(() => 'applied', error => error.name);
    if (retirement === 'unmount') instance.unmount();
    else instance.update(context(getter, { serviceBaseUrls: { agenda: 'https://agenda-two.example/api' } }));
    release();
    assert.equal(await pending, 'AbortError');
    await assert.rejects(old.agendaService.listarCitas(), denied);
    assert.equal(calls.length, 1);
    if (retirement === 'agenda-base') {
      assert.notEqual(current().clinicalServices, old);
      const next = current().clinicalServices.agendaService.listarCitas();
      release();
      await next;
      assert.equal(calls[1], 'https://agenda-two.example/api/citas');
      instance.unmount();
    }
  }
});

test('MS3 error bodies ({success,error,code}) surface as clear errors with their status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(
    JSON.stringify({ success: false, error: 'Token sin rol autorizado.', code: 'FORBIDDEN', timestamp: 'x' }),
    { status: 403 }));
  const { instance, current } = mount(context(() => 'opaque'));
  await assert.rejects(current().clinicalServices.agendaService.listarCitas(), (error) => {
    assert.equal(error.name, 'ProblemDetailsError');
    assert.equal(error.status, 403);
    assert.equal(error.detail, 'Token sin rol autorizado.');
    return true;
  });
  instance.unmount();
});

test('useCitasAgenda loads through the mounted agenda service and exposes eligible appointments', async (t) => {
  const { useCitasAgenda } = await import('../src/hooks/useCitasAgenda.js');
  t.mock.method(globalThis, 'fetch', async () => new Response(listBody(allStates)));
  const { instance, current } = mount(context(() => 'opaque'));
  let hook;
  function Probe() { hook = useCitasAgenda(); return null; }
  renderToStaticMarkup(React.createElement(ClinicalServicesContext.Provider,
    { value: current().clinicalServices }, React.createElement(Probe)));
  assert.equal(hook.configured, true);
  const loaded = await hook.cargar();
  assert.equal(loaded.length, 6);
  assert.equal(loaded.some(c => c.estado === 'REPROGRAMADA'), true);
  instance.unmount();
  assert.equal(await hook.cargar(), null);
});

const service = () => {
  const client = createHttpClient({ apiBaseUrl: clinicalBase, getAccessToken: () => 'opaque' });
  return createConsultasOdontologicasService(client);
};
const recordFetch = (t, calls, body = '{"id":"cons_1","version":2}') =>
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push([url, options.method, JSON.parse(options.body)]); return new Response(body); });

test('MS2 request bodies match the DTOs exactly (open, update, complete, cancel)', async (t) => {
  const calls = [];
  recordFetch(t, calls);
  const s = service(calls);
  const anamnesis = { descripcion: 'dolor', tiempoEvolucion: '2 dias', escalaDolorEVA: 4, extra: 'x' };
  await s.abrirConsulta({
    historiaClinicaId: 'hc_1', pacienteId: 'pac-1', motivoConsulta: 'Dolor', citaId: 'cita-5',
    fechaAtencion: '2026-11-04T14:00:00.000Z', anamnesisActual: anamnesis,
    odontologoId: 'od_henry_principal', estado: 'COMPLETADA', version: 9,
  });
  await s.actualizarAtencion('cons_1', {
    versionEsperada: 2, motivoConsulta: 'm', recomendaciones: null, id: 'cons_1', estado: 'EN_CURSO', odontologoId: 'x',
    diagnosticos: [{ codigoCIE10: null, descripcion: 'caries', tipo: 'PRESUNTIVO' }],
  });
  await s.completarConsulta('cons_1', { versionEsperada: 3, odontologoId: 'x', total: 5 });
  await s.completarConsulta('cons_1', {
    versionEsperada: 3, observacionesCobro: 'NIT 1',
    serviciosFacturables: [{ servicioId: '550e8400-e29b-41d4-a716-446655440001', cantidad: 2, piezaDental: 16, precio: 1 }],
  });
  await s.cancelarConsulta('cons_1', { versionEsperada: 3, motivoCancelacion: 'Paciente se retira', estado: 'CANCELADA' });
  assert.deepEqual(calls, [
    [`${clinicalBase}/consultas-odontologicas`, 'POST', {
      historiaClinicaId: 'hc_1', pacienteId: 'pac-1', motivoConsulta: 'Dolor', citaId: 'cita-5',
      fechaAtencion: '2026-11-04T14:00:00.000Z', anamnesisActual: anamnesis,
    }],
    [`${clinicalBase}/consultas-odontologicas/cons_1/atencion`, 'PUT', {
      versionEsperada: 2, motivoConsulta: 'm', recomendaciones: null,
      diagnosticos: [{ codigoCIE10: null, descripcion: 'caries', tipo: 'PRESUNTIVO' }],
    }],
    [`${clinicalBase}/consultas-odontologicas/cons_1/completar`, 'POST', { versionEsperada: 3 }],
    [`${clinicalBase}/consultas-odontologicas/cons_1/completar`, 'POST', {
      versionEsperada: 3, observacionesCobro: 'NIT 1',
      serviciosFacturables: [{ servicioId: '550e8400-e29b-41d4-a716-446655440001', cantidad: 2, piezaDental: 16 }],
    }],
    [`${clinicalBase}/consultas-odontologicas/cons_1/cancelar`, 'POST', {
      versionEsperada: 3, motivoCancelacion: 'Paciente se retira',
    }],
  ]);
});

test('MS2 problem details (409 version conflict, 422 closure) reach the caller unchanged', async (t) => {
  for (const [status, detail] of [[409, 'La versión esperada 1 no coincide con la actual (2).'], [422, 'Debe registrarse al menos un diagnóstico.']]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
      type: 'https://api.odontoclinic.local/errors/conflict', title: 'Conflicto', status, detail, instance: '/x',
    }), { status, headers: { 'Content-Type': 'application/problem+json' } }));
    await assert.rejects(service().completarConsulta('cons_1', { versionEsperada: 1 }),
      { name: 'ProblemDetailsError', status, detail });
  }
});

test('hosted open-consulta page never shows a guessed doctor and asks the server for identity', () => {
  const { instance, current } = mount(context(() => 'opaque'));
  const html = renderToStaticMarkup(React.createElement(ClinicalServicesContext.Provider, { value: current().clinicalServices },
    React.createElement(DevAuthContext.Provider, { value: { isRemote: true } }, React.createElement(abrir.AbrirConsultaPage))));
  assert.equal(html.includes('od_henry_principal'), false);
  assert.match(html, /el servidor/i);
  instance.unmount();
});

test('standalone open-consulta page keeps its dev doctor and free-text appointment entry', () => {
  const html = renderToStaticMarkup(React.createElement(DevAuthContext.Provider, { value: { token: 't' } },
    React.createElement(abrir.AbrirConsultaPage)));
  assert.equal(html.includes('od_henry_principal'), true);
});

test('appointment picker lists real appointments (REPROGRAMADA included) instead of a free-text id', () => {
  const citas = [
    { id: 'cita-5', pacienteId: 'pac-1', odontologoId: 'od-uuid-1', fechaHora: '2026-11-04T10:00:00-04:00', estado: 'REPROGRAMADA' },
    { id: 'cita-1', pacienteId: 'pac-2', odontologoId: 'od-uuid-1', fechaHora: '2026-11-04T11:00:00-04:00', estado: 'CONFIRMADA' },
  ];
  const html = renderToStaticMarkup(React.createElement(abrir.CitaAgendaPicker,
    { configured: true, citas, value: 'cita-5', onChange() {}, loading: false, error: null, onReload() {} }));
  assert.match(html, /<select/);
  assert.match(html, /value="cita-5"/);
  assert.match(html, /REPROGRAMADA/);
  assert.equal(html.includes('citaIdInput'), false);
  const closed = renderToStaticMarkup(React.createElement(abrir.CitaAgendaPicker,
    { configured: false, citas: [], value: '', onChange() {}, loading: false, error: null, onReload() {} }));
  assert.match(closed, /agenda/i);
  assert.equal(closed.includes('<select'), false);
  assert.equal(closed.includes('<input'), false);
});

test('opening payload carries only DTO fields and the picked appointment', async () => {
  const abrir = await import('../src/pages/apertura-payload.js');
  const payload = abrir.buildAperturaPayload({
    historiaClinicaId: ' hc_1 ', pacienteId: ' pac-1 ', motivoConsulta: ' Dolor ', citaId: 'cita-5',
    fechaAtencion: '2026-11-04T10:00', anamnesis: { descripcion: ' d ', tiempoEvolucion: '', escalaDolorEVA: '3' },
  });
  assert.deepEqual(Object.keys(payload).sort(),
    ['anamnesisActual', 'citaId', 'fechaAtencion', 'historiaClinicaId', 'motivoConsulta', 'pacienteId']);
  assert.equal(payload.citaId, 'cita-5');
  assert.equal(payload.historiaClinicaId, 'hc_1');
  assert.deepEqual(payload.anamnesisActual, { descripcion: 'd', tiempoEvolucion: null, escalaDolorEVA: 3 });
  assert.equal(abrir.buildAperturaPayload({ historiaClinicaId: 'h', pacienteId: 'p', motivoConsulta: 'm', citaId: '' }).citaId, null);
});

test('hosted create-history page lets the server assign the doctor; standalone keeps its dev default', () => {
  const hosted = renderToStaticMarkup(React.createElement(DevAuthContext.Provider, { value: { isRemote: true } },
    React.createElement(CrearHistoriaPage)));
  assert.equal(hosted.includes('od_dev_henry'), false);
  assert.equal(hosted.includes('odontologoResponsableId'), false);
  const standalone = renderToStaticMarkup(React.createElement(DevAuthContext.Provider, { value: { token: 't' } },
    React.createElement(CrearHistoriaPage)));
  assert.equal(standalone.includes('od_dev_henry'), true);
});

test('billing handoff: completed consulta states ERP owns billing, without creating orders', () => {
  const render = (consulta) => renderToStaticMarkup(React.createElement(detalle.BillingHandoffNotice, { consulta }));
  const billed = render({ estado: 'COMPLETADA', totalFacturableBs: '250.00', serviciosFacturables: [{ servicioId: 's', cantidad: 1 }] });
  assert.match(billed, /ERP/);
  assert.match(billed, /orden de cobro/i);
  assert.match(billed, /250\.00/);
  assert.equal(/<button/i.test(billed), false);
  const unbilled = render({ estado: 'COMPLETADA', totalFacturableBs: '0.00', serviciosFacturables: [] });
  assert.match(unbilled, /sin servicios facturables/i);
  assert.match(unbilled, /no se genera/i);
  assert.equal(render({ estado: 'EN_CURSO', serviciosFacturables: [] }), '');
  assert.equal(render(null), '');
});

test('Input passes accessibility attributes through to the field', () => {
  const html = renderToStaticMarkup(React.createElement(Input, {
    id: 'q', value: '', onChange() {}, placeholder: 'ph', 'aria-label': 'Buscar consulta', 'aria-describedby': 'hint', 'aria-required': 'true',
  }));
  assert.match(html, /aria-label="Buscar consulta"/);
  assert.match(html, /aria-describedby="hint"/);
  assert.match(html, /aria-required="true"/);
  assert.match(html, /placeholder="ph"/);
});

// Shaped exactly like MS2 ServicioCatalogoDto (catalogo-servicios.port.ts).
const catalogo = [
  { id: '550e8400-e29b-41d4-a716-446655440001', codigo: 'OBT-01', nombre: 'Obturación', descripcion: null, precioBaseBs: '150.00', activo: true, especialidad: null },
  { id: '550e8400-e29b-41d4-a716-446655440002', codigo: 'LIM-01', nombre: 'Limpieza', precioBaseBs: '80.50', activo: true },
];

test('billable catalog is read from MS2 with the current token and surfaces through the hook', async (t) => {
  const { useConsultasOdontologicas } = await import('../src/hooks/useConsultasOdontologicas.js');
  let token = 'opaque-one';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([url, options.method, options.headers.Authorization, options.body]);
    return new Response(JSON.stringify(catalogo));
  });
  const { instance, current } = mount(context(() => token));
  let hook;
  function Probe() { hook = useConsultasOdontologicas(); return null; }
  renderToStaticMarkup(React.createElement(ClinicalServicesContext.Provider, { value: current().clinicalServices },
    React.createElement(DevAuthContext.Provider, { value: { isRemote: true } }, React.createElement(Probe))));
  assert.deepEqual(await hook.cargarCatalogoServicios(), catalogo);
  token = 'opaque-two';
  await hook.cargarCatalogoServicios();
  assert.deepEqual(calls, [
    [`${clinicalBase}/consultas-odontologicas/catalogo-servicios`, 'GET', 'Bearer opaque-one', undefined],
    [`${clinicalBase}/consultas-odontologicas/catalogo-servicios`, 'GET', 'Bearer opaque-two', undefined],
  ]);
  instance.unmount();
  assert.equal(await hook.cargarCatalogoServicios(), null);
  assert.equal(calls.length, 2);
});

test('catalog read sends zero HTTP on null/revoked token and drops late results', async (t) => {
  let calls = 0;
  let release;
  t.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(resolve => { release = () => resolve(new Response(JSON.stringify(catalogo))); }); });
  let token = null;
  const { instance, current } = mount(context(() => token));
  await assert.rejects(current().clinicalServices.consultasOdontologicasService.listarCatalogoServicios(), denied);
  assert.equal(calls, 0);
  const second = mount(context(() => 'opaque'));
  const old = second.current().clinicalServices.consultasOdontologicasService;
  const pending = old.listarCatalogoServicios().then(() => 'applied', error => error.name);
  second.instance.unmount();
  release();
  assert.equal(await pending, 'AbortError');
  await assert.rejects(old.listarCatalogoServicios(), denied);
  assert.equal(calls, 1);
  instance.unmount();
});

test('completing with services sends the exact DTO body; without services only versionEsperada', async (t) => {
  const { useConsultasOdontologicas } = await import('../src/hooks/useConsultasOdontologicas.js');
  const { buildServiciosFacturables } = await import('../src/api/consultas-odontologicas.service.js');
  const calls = [];
  recordFetch(t, calls);
  const { instance, current } = mount(context(() => 'opaque'));
  let hook;
  function Probe() { hook = useConsultasOdontologicas(); return null; }
  renderToStaticMarkup(React.createElement(ClinicalServicesContext.Provider, { value: current().clinicalServices },
    React.createElement(DevAuthContext.Provider, { value: { isRemote: true } }, React.createElement(Probe))));
  const { items, invalid } = buildServiciosFacturables({ [catalogo[0].id]: '2', [catalogo[1].id]: '0', other: '' });
  assert.deepEqual(items, [{ servicioId: catalogo[0].id, cantidad: 2 }]);
  assert.equal(invalid, false);
  await hook.completarConsulta('cons_1', { versionEsperada: 4, serviciosFacturables: items });
  await hook.completarConsulta('cons_1', { versionEsperada: 4, serviciosFacturables: [] });
  assert.deepEqual(calls.map(c => c[2]), [
    { versionEsperada: 4, serviciosFacturables: [{ servicioId: catalogo[0].id, cantidad: 2 }] },
    { versionEsperada: 4, serviciosFacturables: [] },
  ]);
  for (const bad of ['1.5', '-1', 'abc', '2x']) {
    assert.equal(buildServiciosFacturables({ [catalogo[0].id]: bad }).invalid, true, bad);
  }
  instance.unmount();
});

test('selector lists the catalog and states truthfully whether an ERP order will be created', async () => {
  const modal = await import('../src/components/consultas-odontologicas/CompletarConsultaModal.jsx');
  const render = (selection, extra = {}) => renderToStaticMarkup(React.createElement(modal.ServiciosFacturablesSelector,
    { catalogo, selection, onChange() {}, loading: false, error: null, onReload() {}, ...extra }));
  const none = render({});
  assert.match(none, /Obturación/);
  assert.match(none, /150\.00/);
  assert.match(none, /aria-label="Cantidad de Obturación"/);
  assert.match(none, /no se crear[aá] orden de cobro/i);
  const some = render({ [catalogo[0].id]: '2', [catalogo[1].id]: '1' });
  assert.match(some, /ERP crear[aá] una orden de cobro/i);
  assert.match(some, /380\.50/);
  assert.equal(/no se crear[aá] orden de cobro/i.test(some), false);
  const failed = render({}, { catalogo: [], error: { title: 'Servicio no disponible', detail: 'MS1 caído', status: 503 } });
  assert.match(failed, /MS1 caído/);
});

test('billing notice describes both outcomes after completion', () => {
  const html = renderToStaticMarkup(React.createElement(detalle.BillingHandoffNotice,
    { consulta: { estado: 'COMPLETADA', totalFacturableBs: '380.50', serviciosFacturables: [{ servicioId: 's' }, { servicioId: 't' }] } }));
  assert.match(html, /una orden de cobro/i);
  assert.match(html, /380\.50/);
});

test('apertura payload helper lives outside the page module with identical behavior', async () => {
  const helper = await import('../src/pages/apertura-payload.js');
  const payload = helper.buildAperturaPayload({ historiaClinicaId: ' h ', pacienteId: 'p', motivoConsulta: 'm', citaId: 'c', fechaAtencion: '2026-11-04T10:00' });
  assert.equal(payload.historiaClinicaId, 'h');
  assert.equal(payload.citaId, 'c');
  assert.equal(abrir.buildAperturaPayload, undefined);
});
