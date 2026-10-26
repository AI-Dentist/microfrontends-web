// Shared by fixture and live smoke. Read the approved snapshot as data, never evaluate TS.
import { readFileSync } from 'node:fs';
import { buildSchema, getOperationAST, getVariableValues, parse, validate } from 'graphql';

const source = readFileSync(new URL('../src/app/core/graphql/ms1-schema.ts', import.meta.url), 'utf8');
const sdl = source.match(/export const MS1_SCHEMA_SDL = `([\s\S]*?)`;/)?.[1];
if (!sdl) throw new Error('Approved MS1 SDL snapshot not found');
export const schema = buildSchema(sdl);
export const ADMIN_ID = 'a1000000-0000-0000-0000-000000000001';
export const AI_UNAVAILABLE = 'Reportes IA no disponibles: configure el proveedor';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// SDL custom scalars have no coercion by default; enforce their documented wire formats.
for (const [name, accepts] of Object.entries({
  UUID: value => typeof value === 'string' && uuid.test(value),
  Date: value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)),
  DateTime: value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  BigDecimal: value => ['number', 'string'].includes(typeof value) && value !== '' && Number.isFinite(Number(value)),
})) {
  // GraphQL 17 uses coerceInputValue; assigning the legacy parseValue property does not
  // update its coercion function after buildSchema has constructed the scalar.
  schema.getType(name).coerceInputValue = value => {
    if (!accepts(value)) throw new Error(`Invalid ${name} variable`);
    return value;
  };
}
export function validateRequest(query, variables = {}, operationName) {
  const document = parse(query);
  const errors = validate(schema, document);
  const operation = getOperationAST(document, operationName);
  if (!operation) throw new Error('One unambiguous operation is required');
  errors.push(...(getVariableValues(schema, operation.variableDefinitions ?? [], variables).errors ?? []));
  if (errors.length) throw new Error(`MS1 contract validation failed: ${errors.map(e => e.message).join('; ')}`);
  return { document, operation };
}

const patient = 'id ciNit nombres apellidos telefonoWhatsapp email direccion activo';
const cuota = 'id numeroCuota montoCuotaBs fechaVencimiento estado fechaPago';
const receipt = 'id numeroRecibo ciNitCliente razonSocialCliente concepto montoTotalBs pdfUrlS3 enviadoWhatsapp fechaEmision';
const order = `id estado modalidadPago montoSubtotalBs descuentoBs montoTotalBs saldoPendienteBs cantidadCuotas createdAt paciente { ${patient} } cuotas { ${cuota} } items { id cantidad piezaDental precioUnitarioBs subtotalBs servicio { id codigo nombre } }`;
export const operations = {
  catalogs: `query SmokeCatalogs { listarPacientes { ${patient} } listarServiciosOdontologicos { id codigo nombre precioBaseBs activo } listarOdontologos { id matriculaProfesional especialidades { id codigo nombre } } listarEspecialidades { id codigo nombre activo } listarConsultorios { id codigo nombre estado } obtenerConfiguracionEmpresa { id nombreComercial razonSocial nit direccion telefonoContacto emailContacto monedaSimbolo } listarUsuarios { id username activo rol { id codigo nombre permisos } } listarRoles { id codigo nombre permisos } listarAuditLogs(limite: 5) { id accion entidadAfectada entidadId detalleJson createdAt } listarOrdenesCobro { ${order} } }`,
  flow: `query SmokeFlow($fechaInicio: DateTime!, $fechaFin: DateTime!) { obtenerFlujoCaja(fechaInicio: $fechaInicio, fechaFin: $fechaFin) { totalIngresosBs totalEgresosBs saldoNetoBs movimientos { id tipoMovimiento categoria metodoPago montoBs descripcion fechaMovimiento recibo { ${receipt} } } } }`,
  agent: 'mutation SmokeAgent($instruccion: String!, $modoAutonomoMonitoreo: Boolean = false) { ejecutarAgenteErp(instruccion: $instruccion, modoAutonomoMonitoreo: $modoAutonomoMonitoreo) { interaccionId fechaEjecucion instruccionOriginal respuestaNaturalAgente toolsMcpInvocadas accionCrudEjecutada notificacionN8nEnviada reporteGenerado { reporteId columnas filasJson tipoGraficoSugerido consultaSqlEjecutada urlDescargaExcel urlDescargaPdf } } }',
  detail: `query SmokeDetail($id: UUID!) { obtenerOrdenCobroDetalle(id: $id) { ${order} } }`,
  pending: `query SmokePending($pacienteId: UUID!) { listarCuotasPendientesPorPaciente(pacienteId: $pacienteId) { ${cuota} } }`,
  createPatient: `mutation SmokeCreatePatient($input: CrearPacienteInput!) { crearPaciente(input: $input) { ${patient} } }`,
  createOrder: `mutation SmokeCreateOrder($input: CrearOrdenCobroInput!) { crearOrdenCobroManual(input: $input) { ${order} } }`,
  plan: `mutation SmokePlan($input: ConfigurarPlanPagosInput!) { configurarPlanDePagos(input: $input) { ${order} } }`,
  cash: `mutation SmokeCash($input: CobrarEfectivoInput!) { cobrarCuotaEnEfectivo(input: $input) { ${receipt} } }`,
  qr: 'mutation SmokeQr($cuotaId: UUID!, $ciNitCliente: String!, $razonSocialCliente: String!) { generarQrPagoFacil(cuotaId: $cuotaId, ciNitCliente: $ciNitCliente, razonSocialCliente: $razonSocialCliente) { id cuotaId pagofacilTransactionId qrImagenBase64 montoBs estado fechaExpiracion } }',
  confirm: `mutation SmokeConfirm($pagofacilTransactionId: String!) { simularConfirmacionQrDev(pagofacilTransactionId: $pagofacilTransactionId) { ${receipt} } }`,
};
// Validate all constant documents before any caller can dispatch a request.
for (const query of Object.values(operations)) {
  const errors = validate(schema, parse(query));
  if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
}
