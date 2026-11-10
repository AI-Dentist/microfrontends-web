import { describe, expect, it } from 'vitest';
import {
  buildKpiView,
  resolveName,
  formatWeekday,
  ISO_WEEKDAYS,
  type NameMaps,
} from './kpi-views';
import {
  FULL_KPIS_FINANCIEROS_FIXTURE,
  EMPTY_KPIS_FINANCIEROS_FIXTURE,
  FULL_KPIS_AGENDA_ENVELOPE_FIXTURE,
  EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE,
} from './kpi-fixtures';

describe('KPI view builders and formatting', () => {
  const patientMap = new Map([
    ['p1000000-0000-0000-0000-000000000001', 'Juan Perez'],
    ['p1000000-0000-0000-0000-000000000002', 'Maria Lopez'],
  ]);

  const dentistMap = new Map([
    ['d1000000-0000-0000-0000-000000000001', 'Dra. Andrea Suarez'],
  ]);

  const nameMaps: NameMaps = {
    pacientes: patientMap,
    odontologos: dentistMap,
  };

  describe('name resolution fallback', () => {
    it('resolves names present in the map', () => {
      expect(resolveName('p1000000-0000-0000-0000-000000000001', nameMaps.pacientes, 'Paciente')).toBe('Juan Perez');
      expect(resolveName('d1000000-0000-0000-0000-000000000001', nameMaps.odontologos, 'Odontólogo')).toBe('Dra. Andrea Suarez');
    });

    it('returns explicit fallback with first 8 characters for unknown IDs without inventing names', () => {
      const fallback = resolveName('p1000000-9999-0000-0000-000000000099', nameMaps.pacientes, 'Paciente');
      expect(fallback).toBe('Paciente no encontrado (p1000000)');

      const dentistFallback = resolveName('d9999999-0000-0000-0000-000000000001', nameMaps.odontologos, 'Odontólogo');
      expect(dentistFallback).toBe('Odontólogo no encontrado (d9999999)');
    });
  });

  describe('weekday formatting', () => {
    it('maps ISO 1..7 to Spanish day names', () => {
      expect(formatWeekday(1)).toBe('Lunes');
      expect(formatWeekday(2)).toBe('Martes');
      expect(formatWeekday(3)).toBe('Miércoles');
      expect(formatWeekday(4)).toBe('Jueves');
      expect(formatWeekday(5)).toBe('Viernes');
      expect(formatWeekday(6)).toBe('Sábado');
      expect(formatWeekday(7)).toBe('Domingo');
      expect(Object.keys(ISO_WEEKDAYS)).toHaveLength(7);
    });
  });

  describe('MS1 views with full fixtures', () => {
    it('builds KPI 1 (ingresos) headline, chart series and backing table', () => {
      const view = buildKpiView('ingresos', FULL_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(view.headline.primary).toContain('25.400,50');
      expect(view.table.columns.map((c: any) => c.key)).toEqual(['fecha', 'montoBs']);
      expect(view.table.rows).toHaveLength(4);
      expect(view.chartOptions['series']).toBeDefined();
    });

    it('builds KPI 2 (morosidad) with overdue details and name resolution', () => {
      const view = buildKpiView('morosidad', FULL_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(view.headline.primary).toContain('20');
      expect(view.table.rows).toHaveLength(3);
      expect(view.table.rows[0]['paciente']).toBe('Juan Perez');
      expect(view.table.rows[2]['paciente']).toBe('Carlos Mendez');
    });

    it('builds KPI 4 (servicios) ranking table', () => {
      const view = buildKpiView('servicios', FULL_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(view.table.rows).toHaveLength(3);
      expect(view.table.rows[0]['nombre']).toBe('Limpieza Dental Ultrasonica');
      expect(view.table.rows[0]['cantidad']).toBe(24);
    });

    it('builds KPI 8 (flujo-caja) net balance and daily series', () => {
      const view = buildKpiView('flujo-caja', FULL_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(view.headline.primary).toContain('17.200,50');
      expect(view.table.rows).toHaveLength(4);
      expect(view.table.rows[0]['ingresosBs']).toBe(1200.0);
      expect(view.table.rows[0]['egresosBs']).toBe(500.0);
    });

    it('builds KPI 9 (cobranza-metodo) payment methods breakdown', () => {
      const view = buildKpiView('cobranza-metodo', FULL_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(view.table.rows).toHaveLength(3);
      expect(view.table.rows.map((r: any) => r['metodoPago'])).toEqual(['EFECTIVO', 'QR_PAGOFACIL', 'TRANSFERENCIA']);
    });
  });

  describe('MS3 views with full fixtures', () => {
    const agendaData = FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data;

    it('builds KPI 3 (pacientes-frecuentes) with resolved patient names', () => {
      const view = buildKpiView('pacientes-frecuentes', agendaData, nameMaps);
      expect(view.table.rows).toHaveLength(3);
      expect(view.table.rows[0]['paciente']).toBe('Juan Perez');
      expect(view.table.rows[1]['paciente']).toBe('Maria Lopez');
      // Patient 3 is not in map -> fallback
      expect(view.table.rows[2]['paciente']).toBe('Paciente no encontrado (p1000000)');
    });

    it('builds KPI 5 (inasistencia) rate and details', () => {
      const view = buildKpiView('inasistencia', agendaData, nameMaps);
      expect(view.headline.primary).toContain('20');
      expect(view.table.rows).toHaveLength(2);
      expect(view.table.rows[0]['odontologo']).toBe('Dra. Andrea Suarez');
      expect(view.table.rows[1]['odontologo']).toBe('Odontólogo no encontrado (d1000000)');
    });

    it('builds KPI 6 (horarios-pico) formatted with ISO weekday names', () => {
      const view = buildKpiView('horarios-pico', agendaData, nameMaps);
      expect(view.table.rows).toHaveLength(4);
      expect(view.table.rows[0]['dia']).toBe('Miércoles');
      expect(view.table.rows[0]['hora']).toBe('10:00');
    });

    it('builds KPI 7 (insumos-criticos) with names straight from MS3 payload', () => {
      const view = buildKpiView('insumos-criticos', agendaData, nameMaps);
      expect(view.table.rows).toHaveLength(3);
      expect(view.table.rows[0]['nombre']).toBe('Anestesia Lidocaina 2% c/epinefrina');
      expect(view.table.rows[0]['bajoMinimo']).toBe(true);
      expect(view.table.rows[2]['bajoMinimo']).toBe(false);
    });

    it('builds KPI 10 (productividad) with dentist names from MS1 map', () => {
      const view = buildKpiView('productividad', agendaData, nameMaps);
      expect(view.table.rows).toHaveLength(2);
      expect(view.table.rows[0]['odontologo']).toBe('Dra. Andrea Suarez');
      expect(view.table.rows[0]['tasaCompletadas']).toBe(83.33);
      expect(view.table.rows[1]['odontologo']).toBe('Odontólogo no encontrado (d1000000)');
    });
  });

  describe('Empty fixtures produce empty rows and zero headlines without fabrication', () => {
    it('produces empty series and rows for empty financial KPIs', () => {
      for (const kpiId of ['ingresos', 'morosidad', 'servicios', 'flujo-caja'] as const) {
        const view = buildKpiView(kpiId, EMPTY_KPIS_FINANCIEROS_FIXTURE, nameMaps);
        expect(view.table.rows).toEqual([]);
      }

      // cobranzaPorMetodo has all enum entries with 0 as required by S5
      const cobranza = buildKpiView('cobranza-metodo', EMPTY_KPIS_FINANCIEROS_FIXTURE, nameMaps);
      expect(cobranza.table.rows).toHaveLength(3);
      expect(cobranza.table.rows.every((r: any) => r['montoBs'] === 0)).toBe(true);
    });

    it('produces empty series and rows for empty agenda KPIs', () => {
      const emptyAgenda = EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE.data;
      for (const kpiId of ['pacientes-frecuentes', 'inasistencia', 'horarios-pico', 'insumos-criticos', 'productividad'] as const) {
        const view = buildKpiView(kpiId, emptyAgenda, nameMaps);
        expect(view.table.rows).toEqual([]);
      }
    });
  });
});
