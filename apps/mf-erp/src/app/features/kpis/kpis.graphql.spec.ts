import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import {
  buildSchema,
  FieldNode,
  Kind,
  OperationDefinitionNode,
  validate,
  visit,
} from 'graphql';
import { MS1_SCHEMA_SDL } from '../../core/graphql/ms1-schema';
import { OBTENER_KPIS_FINANCIEROS } from './kpis.graphql';

describe('OBTENER_KPIS_FINANCIEROS wire contract', () => {
  const schema = buildSchema(MS1_SCHEMA_SDL);

  it('validates against MS1 schema with no errors', () => {
    const errors = validate(schema, OBTENER_KPIS_FINANCIEROS);
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it('defines operation ObtenerKpisFinancieros with DateTime variables', () => {
    const op = OBTENER_KPIS_FINANCIEROS.definitions.find(
      (d: any): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION,
    );
    expect(op).toBeDefined();
    expect(op?.name?.value).toBe('ObtenerKpisFinancieros');
    expect(op?.operation).toBe('query');
    expect(op?.variableDefinitions?.map((v: any) => [v.variable.name.value, String(v.type?.type?.name?.value || v.type?.name?.value)])).toEqual(
      expect.arrayContaining([
        ['fechaInicio', 'DateTime'],
        ['fechaFin', 'DateTime'],
      ]),
    );
  });

  it('selects every field of KpisFinancieros and each nested type defined in S5', () => {
    const queryField = schema.getQueryType()!.getFields()['obtenerKpisFinancieros'];
    expect(queryField).toBeDefined();

    // Helper to extract fields selected on a type
    const fieldsOn = (typeName: string) => {
      const type = schema.getType(typeName) as any;
      return Object.keys(type.getFields()).sort();
    };

    // Recursively collect all field selections in the document
    const selectedFieldsByType: Record<string, Set<string>> = {
      KpisFinancieros: new Set(),
      KpiIngresos: new Set(),
      KpiSerieDia: new Set(),
      KpiMorosidad: new Set(),
      KpiCuotaVencida: new Set(),
      KpiServicioRanking: new Set(),
      KpiFlujoCaja: new Set(),
      KpiFlujoDia: new Set(),
      KpiCobranzaMetodo: new Set(),
    };

    let opDef: OperationDefinitionNode | undefined;
    for (const def of OBTENER_KPIS_FINANCIEROS.definitions) {
      if (def.kind === Kind.OPERATION_DEFINITION) {
        opDef = def;
        break;
      }
    }
    expect(opDef).toBeDefined();

    const rootField = opDef!.selectionSet.selections.find(
      (s): s is FieldNode => s.kind === Kind.FIELD && s.name.value === 'obtenerKpisFinancieros',
    );
    expect(rootField).toBeDefined();

    for (const sel of rootField!.selectionSet!.selections) {
      if (sel.kind === Kind.FIELD) {
        selectedFieldsByType['KpisFinancieros'].add(sel.name.value);
        if (sel.name.value === 'ingresos') {
          for (const sub of sel.selectionSet!.selections) {
            if (sub.kind === Kind.FIELD) {
              selectedFieldsByType['KpiIngresos'].add(sub.name.value);
              if (sub.name.value === 'seriePorDia') {
                for (const leaf of sub.selectionSet!.selections) {
                  if (leaf.kind === Kind.FIELD) selectedFieldsByType['KpiSerieDia'].add(leaf.name.value);
                }
              }
            }
          }
        }
        if (sel.name.value === 'morosidad') {
          for (const sub of sel.selectionSet!.selections) {
            if (sub.kind === Kind.FIELD) {
              selectedFieldsByType['KpiMorosidad'].add(sub.name.value);
              if (sub.name.value === 'detalle') {
                for (const leaf of sub.selectionSet!.selections) {
                  if (leaf.kind === Kind.FIELD) selectedFieldsByType['KpiCuotaVencida'].add(leaf.name.value);
                }
              }
            }
          }
        }
        if (sel.name.value === 'serviciosMasSolicitados') {
          for (const sub of sel.selectionSet!.selections) {
            if (sub.kind === Kind.FIELD) selectedFieldsByType['KpiServicioRanking'].add(sub.name.value);
          }
        }
        if (sel.name.value === 'flujoCaja') {
          for (const sub of sel.selectionSet!.selections) {
            if (sub.kind === Kind.FIELD) {
              selectedFieldsByType['KpiFlujoCaja'].add(sub.name.value);
              if (sub.name.value === 'seriePorDia') {
                for (const leaf of sub.selectionSet!.selections) {
                  if (leaf.kind === Kind.FIELD) selectedFieldsByType['KpiFlujoDia'].add(leaf.name.value);
                }
              }
            }
          }
        }
        if (sel.name.value === 'cobranzaPorMetodo') {
          for (const sub of sel.selectionSet!.selections) {
            if (sub.kind === Kind.FIELD) selectedFieldsByType['KpiCobranzaMetodo'].add(sub.name.value);
          }
        }
      }
    }

    for (const [typeName, selected] of Object.entries(selectedFieldsByType)) {
      const expected = fieldsOn(typeName);
      expect(Array.from(selected).sort()).toEqual(expected);
    }
  });
});
