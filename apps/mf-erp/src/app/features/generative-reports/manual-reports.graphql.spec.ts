import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { buildSchema, Kind, print, validate, visit, type OperationDefinitionNode, type FieldNode } from 'graphql';
import { MS1_SCHEMA_SDL } from '../../core/graphql/ms1-schema';
import {
  LISTAR_ENTIDADES_REPORTE,
  GENERAR_REPORTE_MANUAL,
} from './manual-reports.graphql';

const schema = buildSchema(MS1_SCHEMA_SDL);

describe('manual-reports.graphql contracts', () => {
  it('LISTAR_ENTIDADES_REPORTE is a Query operation requesting exact S2 metadata fields', () => {
    const op = LISTAR_ENTIDADES_REPORTE.definitions.find(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    expect(op).toBeDefined();
    expect(op?.operation).toBe('query');
    expect(op?.name?.value).toBe('ListarEntidadesReporte');

    const printed = print(LISTAR_ENTIDADES_REPORTE);
    expect(printed).toContain('listarEntidadesReporte');
    for (const field of ['clave', 'nombre', 'origen', 'columnas', 'filtrosEstado', 'filtroFecha']) {
      expect(printed).toMatch(new RegExp(`\\b${field}\\b`));
    }

    // Column subfields
    const subfields = ['clave', 'etiqueta', 'tipo'];
    for (const sub of subfields) {
      expect(printed).toMatch(new RegExp(`\\b${sub}\\b`));
    }

    // Must not use ID scalar
    visit(LISTAR_ENTIDADES_REPORTE, {
      NamedType(node) {
        expect(node.name.value).not.toBe('ID');
      },
    });

    // Validates against approved SDL
    expect(validate(schema, LISTAR_ENTIDADES_REPORTE).map((e) => e.message)).toEqual([]);
  });

  it('GENERAR_REPORTE_MANUAL is a Mutation operation with ReporteManualInput selecting required report fields and filasTruncadas', () => {
    const op = GENERAR_REPORTE_MANUAL.definitions.find(
      (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    expect(op).toBeDefined();
    expect(op?.operation).toBe('mutation');
    expect(op?.name?.value).toBe('GenerarReporteManual');

    // Input variable
    expect(op?.variableDefinitions?.length).toBe(1);
    const varDef = op?.variableDefinitions?.[0];
    expect(varDef?.variable.name.value).toBe('input');

    const printed = print(GENERAR_REPORTE_MANUAL);
    expect(printed).toContain('generarReporteManual(input: $input)');

    // Required ReporteGenerativoPayload fields for preview & export
    const requiredFields = [
      'reporteId',
      'consultaSqlEjecutada',
      'sqlGenerado',
      'titulo',
      'resumenAnalitico',
      'columnas',
      'filas',
      'filasJson',
      'tipoGraficoSugerido',
      'urlDescargaExcel',
      'urlDescargaPdf',
      'filasTruncadas',
    ];
    for (const field of requiredFields) {
      expect(printed).toMatch(new RegExp(`\\b${field}\\b`));
    }

    // Must not use ID scalar
    visit(GENERAR_REPORTE_MANUAL, {
      NamedType(node) {
        expect(node.name.value).not.toBe('ID');
      },
    });

    // Validates against approved SDL
    expect(validate(schema, GENERAR_REPORTE_MANUAL).map((e) => e.message)).toEqual([]);
  });
});
