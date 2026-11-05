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

  it('serves the ADMIN atomic crearUsuarioConIdentidad mutation with its exact input', () => {
    const create = schema.getMutationType()!.getFields()['crearUsuarioConIdentidad'];
    expect(create).toBeDefined();
    expect(create!.args.map((arg) => [arg.name, String(arg.type)])).toEqual([['input', 'CrearUsuarioConIdentidadInput!']]);
    expect(String(create!.type)).toBe('Usuario!');
    const fieldsOf = (name: string) => Object.entries((schema.getType(name) as any)?.getFields() ?? {})
      .map(([field, def]: [string, any]) => [field, String(def.type)]).sort();
    expect(fieldsOf('CrearUsuarioConIdentidadInput')).toEqual([
      ['keycloakSubject', 'String!'], ['odontologoId', 'UUID'], ['usuario', 'CrearUsuarioInput!'],
    ]);
    expect(fieldsOf('CrearUsuarioInput')).toEqual([
      ['email', 'String!'], ['nombreCompleto', 'String!'], ['password', 'String!'], ['rolCodigo', 'String!'], ['username', 'String!'],
    ]);
    // The legacy non-atomic mutations stay served.
    expect(schema.getMutationType()!.getFields()).toHaveProperty('crearUsuario');
    expect(schema.getMutationType()!.getFields()).toHaveProperty('vincularIdentidadUsuario');
  });

  it('exports CREAR_USUARIO_CON_IDENTIDAD calling the atomic mutation and selecting the Usuario fields', () => {
    expect(mutations).toHaveProperty('CREAR_USUARIO_CON_IDENTIDAD');
    const document = (mutations as any).CREAR_USUARIO_CON_IDENTIDAD as DocumentNode;
    expect(validate(schema, document).map((error) => error.message)).toEqual([]);
    const printed = print(document);
    expect(printed).toContain('mutation CrearUsuarioConIdentidad($input: CrearUsuarioConIdentidadInput!)');
    expect(printed).toContain('crearUsuarioConIdentidad(input: $input)');
    for (const field of ['id', 'username', 'email', 'nombreCompleto', 'activo', 'rol']) {
      expect(printed).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('keeps the atomic user creation out of the offline replay registry', () => {
    expect(Object.keys(mutations.OFFLINE_REPLAYABLE_MUTATIONS)).not.toContain('CrearUsuarioConIdentidad');
    expect(Object.keys(mutations.OFFLINE_REPLAYABLE_MUTATIONS)).not.toContain('CrearUsuario');
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

  it('exposes the argument-free cashier self query and the ADMIN-only two-field identity link', () => {
    const self = schema.getQueryType()!.getFields()['obtenerMiUsuarioId']!;
    expect(self.args).toEqual([]);
    expect(String(self.type)).toBe('UUID!');
    const link = schema.getMutationType()!.getFields()['vincularIdentidadUsuario']!;
    expect(link.args.map((arg) => [arg.name, String(arg.type)])).toEqual([['input', 'VincularIdentidadUsuarioInput!']]);
    expect(String(link.type)).toBe('UUID!');
    const input = schema.getType('VincularIdentidadUsuarioInput') as any;
    expect(Object.entries(input.getFields()).map(([name, field]: [string, any]) => [name, String(field.type)]).sort())
      .toEqual([['keycloakSubject', 'String!'], ['usuarioId', 'UUID!']]);
    expect(queries).toHaveProperty('OBTENER_MI_USUARIO_ID');
    expect(mutations).toHaveProperty('VINCULAR_IDENTIDAD_USUARIO');
    expect(print((queries as any).OBTENER_MI_USUARIO_ID)).toContain('obtenerMiUsuarioId');
    expect(print((queries as any).OBTENER_MI_USUARIO_ID)).not.toContain('(');
    expect(print((mutations as any).VINCULAR_IDENTIDAD_USUARIO)).toContain('vincularIdentidadUsuario(input: $input)');
  });
});
