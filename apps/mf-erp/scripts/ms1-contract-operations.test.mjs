// Parent runs only after the concurrent suite finishes: node --test scripts/ms1-contract-operations.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_ID, operations, validateRequest } from './ms1-contract-operations.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const variables = {
  catalogs: {}, flow: { fechaInicio: '2026-10-01T00:00:00-04:00', fechaFin: '2026-10-31T23:59:59Z' },
  agent: { instruccion: 'Ingresos por método', modoAutonomoMonitoreo: false }, detail: { id }, pending: { pacienteId: id },
  createPatient: { input: { ciNit: 'SMK123', nombres: 'Sintético', apellidos: 'Smoke', telefonoWhatsapp: '+59170000000' } },
  createOrder: { input: { pacienteId: id, items: [{ servicioId: id, cantidad: 1 }] } },
  plan: { input: { ordenCobroId: id, modalidadPago: 'CREDITO', cantidadCuotas: 2, fechaPrimeraCuota: '2026-11-01' } },
  cash: { input: { cuotaId: id, usuarioCajeroId: ADMIN_ID, ciNitCliente: 'SMK123', razonSocialCliente: 'Sintético Smoke' } },
  qr: { cuotaId: id, ciNitCliente: 'SMK123', razonSocialCliente: 'Sintético Smoke' },
  confirm: { pagofacilTransactionId: 'MOCK-FIXTURE' },
};
for (const [name, query] of Object.entries(operations)) {
  test(`${name}: documented variables and raw operation validate`, () => {
    const result = validateRequest(query, variables[name]);
    assert.ok(result.document); assert.ok(result.operation.name);
  });
}
test('reject invented field, legacy ID and missing WhatsApp before dispatch', () => {
  assert.throws(() => validateRequest('query { obtenerResumenCaja { saldoNeto } }'), /contract validation failed/);
  assert.throws(() => validateRequest('query Old($id: ID!) { obtenerPacientePorId(id: $id) { id } }', { id }), /contract validation failed/);
  const { telefonoWhatsapp, ...input } = variables.createPatient.input;
  assert.throws(() => validateRequest(operations.createPatient, { input }), /telefonoWhatsapp/);
});
test('reject malformed UUID, offset-free DateTime and obsolete cash field', () => {
  assert.throws(() => validateRequest(operations.detail, { id: 'o1' }), /Invalid UUID/);
  assert.throws(() => validateRequest(operations.flow, { ...variables.flow, fechaInicio: '2026-10-01T00:00:00' }), /Invalid DateTime/);
  assert.throws(() => validateRequest(operations.cash, { input: { ...variables.cash.input, montoRecibido: 100 } }), /montoRecibido/);
});
test('preserve optional catalog filter and offset Z support', () => {
  assert.ok(validateRequest('query List($busqueda: String) { listarPacientes(busqueda: $busqueda) { id telefonoWhatsapp } }', { busqueda: 'Smoke' }));
  assert.ok(validateRequest(operations.flow, variables.flow));
});

test('agent accepts manual/autonomous/default mode without changing its mutation contract', () => {
  for (const modoAutonomoMonitoreo of [false, true]) {
    assert.equal(validateRequest(operations.agent, { instruccion: 'Monitorea mi negocio', modoAutonomoMonitoreo }).operation.operation, 'mutation');
  }
  assert.ok(validateRequest(operations.agent, { instruccion: 'Ingresos' }));
});
test('agent rejects missing/null instruction and nonboolean mode before dispatch', () => {
  for (const input of [{}, { instruccion: null }, { instruccion: 'Ingresos', modoAutonomoMonitoreo: 'true' }]) {
    assert.throws(() => validateRequest(operations.agent, input), /contract validation failed/);
  }
});
test('retired standalone report query remains rejected', () => {
  assert.throws(() => validateRequest('query { generarReporteInteligente(pregunta: "Ingresos") { reporteId } }'), /Cannot query field/);
});
