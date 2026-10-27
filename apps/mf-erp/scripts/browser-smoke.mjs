// Chromium UI evidence using isolated, schema-validated fixtures, NOT live MS1.
// From apps/mf-erp: node scripts/browser-smoke.mjs (owns port 4201).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { executeSync } from 'graphql';
import { ADMIN_ID, AI_UNAVAILABLE, schema, validateRequest } from './ms1-contract-operations.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= 'node_modules/.cache/playwright';
const { chromium } = await import('playwright');
assert.ok(existsSync(chromium.executablePath()), 'Local Chromium unavailable; no browser download authorized');
const require = createRequire(import.meta.url);
const origin = 'http://localhost:4201';
const cli = join(dirname(require.resolve('@angular/cli/package.json')), 'bin/ng.js');
const portProbe = createServer();
await new Promise((resolve, reject) => portProbe.once('error', reject).listen(4201, 'localhost', resolve));
await new Promise(resolve => portProbe.close(resolve));
const server = spawn(process.execPath, [cli, 'serve'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-16000); });
let browser;
const errors = [];
const diagnostics = [];
const calls = [];
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const instant = '2026-10-22T10:00:00-04:00';
const patient = { id: id(1), ciNit: '1234567', nombres: 'Ana', apellidos: 'Perez', telefonoWhatsapp: '+59171234567', email: null, direccion: 'Dirección ficticia', fechaNacimiento: '2000-02-29', genero: 'Libre', activo: true };
const patients = [patient];
const specialty = { id: id(2), codigo: 'EXO', nombre: 'Cirugía fixture', descripcion: null, activo: true };
const doctor = { id: id(3), ci: 'FIXTURE-OD', nombres: 'Doctor', apellidos: 'Fixture', matriculaProfesional: 'MAT-FIXTURE', telefono: '+59170000001', email: null, porcentajeComision: 30, activo: true, especialidades: [specialty] };
const service = { id: id(4), codigo: 'EXO', nombre: 'Exodoncia de Tercer Molar Retenido', descripcion: 'Servicio fixture', precioBaseBs: 100, activo: true, especialidad: specialty };
const order = { id: id(5), consultaExternaId: null, modalidadPago: 'CONTADO', montoSubtotalBs: 100, descuentoBs: 0, montoTotalBs: 100, saldoPendienteBs: 100, cantidadCuotas: 1, estado: 'PENDIENTE', createdAt: instant, paciente: patient, odontologo: doctor, items: [{ id: id(6), piezaDental: null, cantidad: 1, precioUnitarioBs: 100, subtotalBs: 100, servicio: service }], cuotas: [{ id: id(7), numeroCuota: 1, montoCuotaBs: 100, fechaVencimiento: '2026-11-01', estado: 'PENDIENTE', fechaPago: null }] };
const receipt = { id: id(8), numeroRecibo: 'REC-2026-000001', fechaEmision: instant, montoTotalBs: 100, ciNitCliente: patient.ciNit, razonSocialCliente: 'Ana Perez', concepto: service.nombre, pdfUrlS3: null, enviadoWhatsapp: false };
const role = { id: id(9), codigo: 'ADMIN', nombre: 'Administrador', permisos: [] };
const company = { id: id(10), nombreComercial: 'Clínica fixture', nit: '123', razonSocial: 'Clínica de prueba', direccion: 'Santa Cruz, ficticia', telefonoContacto: '+59170000000', emailContacto: null, monedaSimbolo: 'Bs' };
// BARRAS is controlled renderer evidence only. Actual local backend has no AI provider.
const report = { reporteId: id(11), consultaSqlEjecutada: 'SELECT metodo, monto FROM fixture', columnas: ['Metodo', 'Monto'], filasJson: JSON.stringify([['EFECTIVO', 100], ['QR', 200]]), tipoGraficoSugerido: 'BARRAS', urlDescargaExcel: `http://localhost:8080/api/v1/reports/export/${id(11)}/xlsx`, urlDescargaPdf: `http://localhost:8080/api/v1/reports/export/${id(11)}/pdf` };
let reportUnavailable = false;
const businessError = (message, classification) => ({ errors: [{ message, extensions: { classification } }] });
function response(name, variables) {
  const reads = {
    ObtenerFlujoCaja: { obtenerFlujoCaja: { totalIngresosBs: 1000, totalEgresosBs: 200, saldoNetoBs: 800, movimientos: [] } },
    ObtenerFlujoCajaSinPdf: { obtenerFlujoCaja: { totalIngresosBs: 1000, totalEgresosBs: 200, saldoNetoBs: 800, movimientos: [] } },
    ListarPacientes: { listarPacientes: patients }, ObtenerPacientePorId: { obtenerPacientePorId: patients.find(patient => patient.id === variables.id) ?? null }, ListarOdontologos: { listarOdontologos: [doctor] },
    ListarEspecialidades: { listarEspecialidades: [specialty] }, ListarConsultorios: { listarConsultorios: [{ id: id(12), codigo: 'C01', nombre: 'Consultorio fixture', ubicacion: null, estado: 'DISPONIBLE' }] },
    ListarServiciosOdontologicos: { listarServiciosOdontologicos: [service] }, ObtenerConfiguracionEmpresa: { obtenerConfiguracionEmpresa: company },
    ListarUsuarios: { listarUsuarios: [{ id: ADMIN_ID, username: 'admin-scz', nombreCompleto: 'Administrador fixture', email: 'admin@fixture.invalid', activo: true, rol: role }] },
    ListarRoles: { listarRoles: [role] }, ListarAuditLogs: { listarAuditLogs: [] },
    ListarOrdenesCobro: { listarOrdenesCobro: variables.estado && variables.estado !== order.estado ? [] : [order] },
    ObtenerOrdenCobroDetalle: { obtenerOrdenCobroDetalle: variables.id === order.id ? order : null },
    ListarHistorialAgente: { listarHistorialAgente: [] },
    ObtenerEstadoServidorMcp: { obtenerEstadoServidorMcp: { activo: true, protocolVersion: '2025-03-26', toolsRegistradas: [] } },
  };
  if (reads[name]) return reads[name];
  if (name === 'EjecutarAgenteErp') return { ejecutarAgenteErp: { interaccionId: id(14), fechaEjecucion: instant, instruccionOriginal: variables.instruccion, respuestaNaturalAgente: 'FIXTURE: ingresos por método de pago', toolsMcpInvocadas: ['generarReporteDinamicoSqlTool'], accionCrudEjecutada: null, notificacionN8nEnviada: false, reporteGenerado: report } };
  if (name === 'CrearPaciente') {
    const created = { id: id(13), ...variables.input, activo: true };
    patients.push(created); return { crearPaciente: created };
  }
  if (name === 'ActualizarPaciente') {
    const existing = patients.find(patient => patient.id === variables.id);
    assert.ok(existing, 'Fixture patient must exist');
    Object.assign(existing, variables.input);
    return { actualizarPaciente: existing };
  }
  if (name === 'CobrarCuotaEnEfectivo') {
    assert.deepEqual(variables.input, { cuotaId: order.cuotas[0].id, usuarioCajeroId: ADMIN_ID, ciNitCliente: patient.ciNit, razonSocialCliente: 'Ana Perez' });
    order.cuotas[0].estado = 'PAGADA'; order.cuotas[0].fechaPago = instant;
    order.estado = 'PAGADO'; order.saldoPendienteBs = 0;
    return { cobrarCuotaEnEfectivo: receipt };
  }
  throw new Error(`Unexpected fixture operation: ${name}`);
}
async function fixtureContext(reception = false) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // Only our owned local assets may go to the network. GraphQL is fulfilled below.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  if (reception) {
    // Unsigned, synthetic role claims ONLY for isolated UI fixtures, never sent to MS1.
    const token = `fixture.${Buffer.from(JSON.stringify({ iss: 'fixture', sub: 'reception', exp: Math.floor(Date.now() / 1000) + 3600, preferred_username: 'reception-fixture', realm_access: { roles: ['RECEPCIONISTA'] } })).toString('base64url')}.fixture`;
    await context.addInitScript(value => sessionStorage.setItem('access_token', value), token);
  }
  await context.route(/huggingface\.co|cdn\.jsdelivr\.net/, route => route.abort());
  // Fail closed: no fixture REST financial/export request can reach the backend.
  await context.route('**/api/v1/**', route => route.abort());
  // Installed before creating/navigating a page; NEVER route.continue/fetch to MS1.
  await context.route('**/graphql', async route => {
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    try {
      const body = route.request().postDataJSON();
      const { document, operation } = validateRequest(body.query, body.variables, body.operationName);
      const name = operation.name?.value;
      calls.push({ name, variables: body.variables, headers: route.request().headers(), reception });
      if (reception && (operation.operation === 'mutation' || ['ListarUsuarios', 'ListarAuditLogs'].includes(name))) {
        errors.push(`Reception dispatched forbidden operation: ${name}`);
        return route.fulfill({ json: businessError('Acceso denegado', 'FORBIDDEN'), headers });
      }
      if (name === 'EjecutarAgenteErp' && reportUnavailable) return route.fulfill({ json: businessError(AI_UNAVAILABLE, 'BAD_REQUEST'), headers });
      const result = executeSync({ schema, document, rootValue: response(name, body.variables ?? {}), variableValues: body.variables, operationName: body.operationName });
      if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '));
      await route.fulfill({ json: result, headers });
    } catch (error) {
      errors.push(String(error)); await route.fulfill({ json: businessError('Fixture contract failure', 'BAD_REQUEST'), headers });
    }
  });
  return context;
}
try {
  const deadline = Date.now() + 180000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`Dev server exited ${server.exitCode}: ${serverOutput}`);
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error(`Dev server readiness timeout: ${serverOutput}`);
    await delay(500);
  }
  browser = await chromium.launch({ headless: true });
  const context = await fixtureContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
  const visible = locator => locator.waitFor({ state: 'visible' });
  await page.goto(`${origin}/erp/cash-flow`);
  await visible(page.getByRole('heading', { name: 'Flujo de caja', exact: true }));
  await visible(page.getByTestId('cash-kpis').getByText('Bs 1.000,00', { exact: true }));
  console.log('PASS fixture dashboard raw flujo KPIs');
  assert.equal(await page.locator('erp-layout > div > div > aside').count(), 1);
  await page.getByRole('link', { name: 'Catálogos', exact: true }).click();
  for (const [label, heading] of [['Pacientes', 'Pacientes'], ['Odontólogos', 'Odontólogos, especialidades y consultorios'], ['Consultorios', 'Odontólogos, especialidades y consultorios'], ['Arancel de Servicios', /Arancel|Tarifario/], ['Configuración de Empresa', 'Datos de la Clínica']]) {
    await page.locator('erp-catalogs-page').getByRole('tablist').first().getByRole('tab', { name: label, exact: true }).click();
    await visible(page.getByRole('heading', { name: heading }).first());
    console.log(`PASS fixture route ${label}`);
  }
  await page.getByRole('tab', { name: 'Pacientes', exact: true }).click();
  await visible(page.getByRole('cell', { name: patient.ciNit, exact: true }));
  assert.equal(await page.getByRole('button', { name: 'Editar paciente', exact: true }).isDisabled(), false);
  await page.getByRole('button', { name: 'Editar paciente', exact: true }).click();
  await visible(page.getByRole('dialog'));
  await page.locator('#patient-form input[formcontrolname="genero"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#patient-form input[formcontrolname="genero"]')?.value === 'Libre');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const update = calls.find(call => call.name === 'ActualizarPaciente');
  assert.ok(update?.headers['idempotency-key']);
  assert.equal(update.variables.input.fechaNacimiento, '2000-02-29');
  assert.equal(update.variables.input.genero, 'Libre');
  assert.equal(update.variables.input.telefonoWhatsapp, '+59171234567');
  await page.getByRole('button', { name: 'Nuevo paciente', exact: true }).click();
  for (const [control, value] of Object.entries({ ciNit: '7654321', nombres: 'Luis', apellidos: 'Smoke', telefonoWhatsapp: '71234567' })) await page.locator(`#patient-form input[formcontrolname="${control}"]`).fill(value);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await visible(page.getByRole('cell', { name: '7654321', exact: true }));
  const create = calls.find(call => call.name === 'CrearPaciente');
  assert.ok(create?.headers['idempotency-key']); assert.equal(create.headers['x-dev-user'], 'admin-scz');
  // The existing form normalizes Bolivian mobiles to eight national digits;
  // MS1's contract requires a nonempty string, not a client-invented E.164 policy.
  assert.equal(create.variables.input.telefonoWhatsapp, '71234567');
  console.log('PASS fixture patient create and read-before-edit demographic preservation/auth/idempotency');
  await page.getByRole('link', { name: 'Cobros', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await page.getByRole('button', { name: '[Cobrar en Efectivo]', exact: true }).click();
  await page.locator('p-inputnumber input').fill('100');
  await page.locator('p-inputnumber input').blur();
  await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
  await visible(page.getByTestId('receipt-preview').getByText(receipt.numeroRecibo, { exact: true }));
  await visible(page.getByText('WhatsApp no enviado', { exact: true }));
  await visible(page.getByText('PDF pendiente o no disponible.', { exact: true }));
  const cash = calls.find(call => call.name === 'CobrarCuotaEnEfectivo');
  assert.ok(cash?.headers['idempotency-key']); assert.equal(cash.variables.input.usuarioCajeroId, ADMIN_ID);
  console.log('PASS fixture cash raw input confirmed admin UUID and truthful receipt');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('link', { name: 'Agente ERP', exact: true }).click();
  await page.getByRole('textbox', { name: 'Instrucción para el agente' }).fill('Ingresos por método');
  await page.getByRole('button', { name: 'Enviar instrucción', exact: true }).click();
  await visible(page.getByRole('article').getByText('FIXTURE: ingresos por método de pago', { exact: true }));
  const command = calls.find(call => call.name === 'EjecutarAgenteErp');
  assert.ok(command?.headers['idempotency-key']);
  assert.deepEqual(command.variables, { instruccion: 'Ingresos por método', modoAutonomoMonitoreo: false });
  await visible(page.getByRole('cell', { name: 'EFECTIVO', exact: true }));
  await visible(page.getByRole('cell', { name: '200', exact: true }));
  await visible(page.locator('canvas').first());
  console.log('PASS FIXTURE ONLY BARRAS table/chart; not actual backend AI evidence');
  reportUnavailable = true;
  await page.getByRole('textbox', { name: 'Instrucción para el agente' }).fill('Proveedor no disponible');
  await page.getByRole('button', { name: 'Enviar instrucción', exact: true }).click();
  await visible(page.getByRole('alert').filter({ hasText: AI_UNAVAILABLE }));
  assert.equal(await page.locator('erp-dynamic-report-viewer').count(), 0, 'Unavailable provider must clear previous fabricated success');
  console.log('PASS fixture provider-unavailable error, no stale fabricated report');
  await page.getByRole('link', { name: 'Catálogos', exact: true }).click();
  await visible(page.getByRole('cell', { name: patient.ciNit, exact: true }));
  await context.setOffline(true);
  await visible(page.getByTestId('network-status').getByText('Offline', { exact: true }));
  await page.getByRole('tab', { name: 'Arancel de Servicios', exact: true }).click();
  await visible(page.getByRole('cell', { name: service.nombre, exact: true }));
  console.log('PASS fixture offline network state and cached raw tariff');
  await context.close();
  // Isolated synthetic reception session. Restore an unpaid fixture to exercise guards.
  order.estado = 'PENDIENTE'; order.saldoPendienteBs = 100; order.cuotas[0].estado = 'PENDIENTE'; order.cuotas[0].fechaPago = null;
  const receptionContext = await fixtureContext(true);
  const reception = await receptionContext.newPage();
  reception.setDefaultTimeout(15000);
  reception.on('pageerror', error => errors.push(error.message));
  await reception.goto(`${origin}/erp/billing`);
  // Use the real navigation link rather than relying on an inferred route path.
  await reception.getByRole('link', { name: 'Cobros', exact: true }).click();
  await reception.getByRole('button', { name: 'Abrir', exact: true }).click();
  assert.equal(await reception.getByRole('button', { name: '[Cobrar en Efectivo]', exact: true }).count(), 0);
  assert.equal(await reception.getByRole('button', { name: '[Cobrar con QR PagoFácil]', exact: true }).count(), 0);
  await reception.getByRole('link', { name: 'Catálogos', exact: true }).click();
  await reception.getByRole('tab', { name: 'Configuración de Empresa', exact: true }).click();
  await visible(reception.getByRole('heading', { name: 'Datos de la Clínica', exact: true }));
  assert.equal(await reception.getByRole('heading', { name: 'Usuarios', exact: true }).count(), 0);
  assert.equal(await reception.getByRole('button', { name: 'Guardar datos', exact: true }).isDisabled(), true);
  assert.ok(!calls.some(call => call.reception && ['CobrarCuotaEnEfectivo', 'GenerarQrPagoFacil', 'ListarUsuarios', 'ActualizarUsuario', 'ListarAuditLogs'].includes(call.name)));
  console.log('PASS fixture reception cannot collect/manage users; no protected dispatch');
  await receptionContext.close();
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  console.log('PASS browser fixture smoke complete; zero real charges, no backend forwarding');
} catch (error) {
  console.error(error);
  if (errors.length) console.error('Browser errors:', errors);
  if (diagnostics.length) console.error('Browser diagnostics:', diagnostics.slice(-30));
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } finally {
    if (process.platform === 'win32') await new Promise(resolve => spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }).once('exit', resolve));
    else server.kill('SIGTERM');
  }
}
