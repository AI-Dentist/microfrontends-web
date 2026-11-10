import { describe, expect, it } from 'vitest';
import {
  KPI_DEFINITIONS,
  getKpiDefinition,
  QR_PAGOFACIL_NOTE,
  INASISTENCIA_OBSERVADA_NOTE,
} from './kpi-definitions';

describe('KPI definitions (S1 canonical order and titles)', () => {
  it('defines exactly ten KPIs in canonical order with stable route IDs', () => {
    expect(KPI_DEFINITIONS).toHaveLength(10);
    expect(KPI_DEFINITIONS.map((k) => k.id)).toEqual([
      'ingresos',
      'morosidad',
      'pacientes-frecuentes',
      'servicios',
      'inasistencia',
      'horarios-pico',
      'insumos-criticos',
      'flujo-caja',
      'cobranza-metodo',
      'productividad',
    ]);
  });

  it('matches canonical S1 titles verbatim including the Unicode minus sign for KPI 8', () => {
    const titles = KPI_DEFINITIONS.map((k) => k.title);
    expect(titles).toEqual([
      'Ingresos del período (Bs)',
      'Morosidad: cuotas vencidas (% y Bs)',
      'Pacientes más frecuentes (ranking)',
      'Servicios más solicitados',
      'Tasa de inasistencia (%)',
      'Horarios pico',
      'Insumos críticos (bajo mínimo y mayor rotación)',
      'Flujo de caja neto (ingresos \u2212 egresos)',
      'Cobranza por método (efectivo vs QR)',
      'Productividad por odontólogo',
    ]);
    expect(titles[7]).toContain('\u2212');
  });

  it('correctly maps data sources between MS1 (financial) and MS3 (agenda/inventory)', () => {
    const ms1 = KPI_DEFINITIONS.filter((k) => k.source === 'ms1').map((k) => k.id);
    const ms3 = KPI_DEFINITIONS.filter((k) => k.source === 'ms3').map((k) => k.id);

    expect(ms1).toEqual(['ingresos', 'morosidad', 'servicios', 'flujo-caja', 'cobranza-metodo']);
    expect(ms3).toEqual(['pacientes-frecuentes', 'inasistencia', 'horarios-pico', 'insumos-criticos', 'productividad']);
  });

  it('sets qrNote: true exclusively on KPIs 1 and 9 with the exported Spanish note', () => {
    const qrKpis = KPI_DEFINITIONS.filter((k) => k.qrNote === true).map((k) => k.id);
    expect(qrKpis).toEqual(['ingresos', 'cobranza-metodo']);

    expect(QR_PAGOFACIL_NOTE).toContain('QR_PAGOFACIL');
    expect(QR_PAGOFACIL_NOTE).toContain('PagoFácil');
    expect(QR_PAGOFACIL_NOTE).toContain('1/1000');
  });

  it('carries an explicit observed note on KPI 5 (inasistencia)', () => {
    const kpi5 = getKpiDefinition('inasistencia');
    expect(kpi5).toBeDefined();
    expect(kpi5?.note).toBe(INASISTENCIA_OBSERVADA_NOTE);
    expect(kpi5?.note).toContain('observado');
    expect(kpi5?.note).toContain('predicción');
  });

  it('retrieves definition by route id and returns undefined for unknown', () => {
    expect(getKpiDefinition('ingresos')?.title).toBe('Ingresos del período (Bs)');
    expect(getKpiDefinition('unknown' as any)).toBeUndefined();
  });
});
