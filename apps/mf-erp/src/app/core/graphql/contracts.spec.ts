// Standalone execution needs Angular's JIT compiler before importing apollo-angular.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { buildSchema, Kind, parse, print, validate, visit, type FieldNode, type DocumentNode } from 'graphql';
import * as queries from './queries.graphql';
import * as mutations from './mutations.graphql';
import * as catalogs from '../../features/catalogs/catalogs.graphql';
import { MS1_SCHEMA_SDL } from './ms1-schema';

const schema = buildSchema(MS1_SCHEMA_SDL);
const modules = { queries, mutations, catalogs };
const isDocument = (value: unknown): value is DocumentNode =>
  typeof value === 'object' && value !== null && 'kind' in value && value.kind === Kind.DOCUMENT;

// Namespace imports intentionally include every exported document, including future additions.
const documents = Object.entries(modules).flatMap(([module, exports]) =>
  Object.entries(exports).filter((entry): entry is [string, DocumentNode] => isDocument(entry[1]))
    .map(([name, document]) => ({ name: `${module}.${name}`, document })),
);

describe('approved MS1 wire contract', () => {
  it('discovers documents in each contract module', () => {
    for (const module of Object.keys(modules)) {
      expect(documents.some(({ name }) => name.startsWith(`${module}.`))).toBe(true);
    }
  });

  for (const { name, document } of documents) {
    it(`${name} validates against the approved backend SDL`, () => {
      expect(validate(schema, document).map((error) => error.message)).toEqual([]);
      visit(document, {
        NamedType(node) { expect(node.name.value).not.toBe('ID'); },
      });
    });
  }

  it('exports the real detail, audit and cash-flow queries without invented queries', () => {
    expect(queries).toHaveProperty('OBTENER_ORDEN_COBRO_DETALLE');
    expect(queries).toHaveProperty('LISTAR_AUDIT_LOGS');
    expect(queries).toHaveProperty('OBTENER_FLUJO_CAJA');
    for (const name of [
      'CONSULTAR_ESTADO_QR_PAGOFACIL', 'OBTENER_RESUMEN_CAJA', 'LISTAR_MOVIMIENTOS_CAJA',
      'OBTENER_ORDEN_COBRO', 'LISTAR_LOGS_AUDITORIA',
    ]) expect(queries).not.toHaveProperty(name);
  });

  it('rejects the former fabricated readback fields, endpoints and scalar', () => {
    for (const source of [
      'query { listarAuditLogs { usuario } }',
      'query { obtenerResumenCaja { saldoNeto } }',
      'query { listarMovimientosCaja { id } }',
      'query { consultarEstadoQrPagoFacil(pagofacilTransactionId: "mock") { estado } }',
      'query Old($id: ID!) { obtenerOrdenCobroDetalle(id: $id) { id } }',
      'mutation Old($input: PacienteInput!) { crearPaciente(input: $input) { id } }',
    ]) expect(validate(schema, parse(source)).length).toBeGreaterThan(0);
  });

  it('preserves the offline registry keys and named operations', () => {
    const registry = mutations.OFFLINE_REPLAYABLE_MUTATIONS;
    expect(Object.keys(registry).sort()).toEqual([
      'CobrarCuotaEnEfectivo', 'CrearOrdenCobroManual', 'CrearPaciente', 'RegistrarEgresoCaja',
    ]);
    for (const [name, document] of Object.entries(registry)) {
      expect(validate(schema, document).map((error) => error.message)).toEqual([]);
      expect(document.definitions.some((definition) =>
        definition.kind === Kind.OPERATION_DEFINITION && definition.operation === 'mutation' &&
        definition.name?.value === name)).toBe(true);
    }
  });

  it('uses the unified agent contract and retires the standalone report query', () => {
    expect(queries).not.toHaveProperty('GENERAR_REPORTE_INTELIGENTE');
    expect(schema.getQueryType()?.getFields()).not.toHaveProperty('generarReporteInteligente');
    expect(validate(schema, mutations.EJECUTAR_AGENTE_ERP)).toEqual([]);
    expect(validate(schema, queries.LISTAR_HISTORIAL_AGENTE)).toEqual([]);
    expect(validate(schema, queries.OBTENER_ESTADO_SERVIDOR_MCP)).toEqual([]);
    expect(validate(schema, queries.LISTAR_ESPECIALIDADES)).toEqual([]);
    const calls: FieldNode[] = [];
    visit(mutations.EJECUTAR_AGENTE_ERP, {
      Field(node) { if (node.name.value === 'ejecutarAgenteErp') calls.push(node); },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.arguments?.map((arg) => [
      arg.name.value, arg.value.kind === Kind.VARIABLE ? arg.value.name.value : null,
    ])).toEqual([['instruccion', 'instruccion'], ['modoAutonomoMonitoreo', 'modoAutonomoMonitoreo']]);
    expect(print(queries.LISTAR_ESPECIALIDADES)).toContain('listarEspecialidades');
  });
});
