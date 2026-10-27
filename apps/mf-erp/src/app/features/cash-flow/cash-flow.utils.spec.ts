import { buildKpiCards, currentMonthRange, isValidRange, summarizeMovements, toIsoDate, cashFlowBoundaries } from './cash-flow.utils';

describe('cash flow helpers', () => {
  it('formats local dates without UTC date shifts', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('covers the whole selected local calendar days with offset DateTime values', () => {
    const result = cashFlowBoundaries({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(result).toEqual({ fechaInicio: new Date(2026, 1, 1, 0, 0, 0, 0).toISOString(), fechaFin: new Date(2026, 1, 28, 23, 59, 59, 999).toISOString() });
    expect(result.fechaInicio).toMatch(/Z$/);
    expect(result.fechaFin).toMatch(/Z$/);
  });
  it('currentMonthRange covers month and leap-year boundaries', () => {
    expect(currentMonthRange(new Date(2026, 1, 14))).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(currentMonthRange(new Date(2028, 1, 3))).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(currentMonthRange(new Date(2026, 11, 31))).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
  });
  it('requires ordered dates', () => {
    expect(isValidRange({ desde: '2026-02-01', hasta: '2026-02-01' })).toBe(true);
    expect(isValidRange({ desde: '2026-02-02', hasta: '2026-02-01' })).toBe(false);
    expect(isValidRange({ desde: '', hasta: '2026-02-01' })).toBe(false);
  });
  it('maps exact wire totals to KPIs', () => {
    const cards = buildKpiCards({ totalIngresosBs: 1500, totalEgresosBs: 400, saldoNetoBs: 1100 });
    expect(cards.map(c => [c.key, c.label, c.value])).toEqual([['ingresos', 'Ingresos', 1500], ['egresos', 'Egresos', 400], ['saldo', 'Saldo Neto', 1100]]);
    expect(cards[2].negative).toBe(false);
    expect(buildKpiCards({ totalIngresosBs: 0, totalEgresosBs: 5, saldoNetoBs: -5 })[2].negative).toBe(true);
  });
  it('summarizes exact movement fields with cent precision', () => {
    expect(summarizeMovements([{ tipoMovimiento: 'INGRESO', montoBs: 0.1 }, { tipoMovimiento: 'INGRESO', montoBs: 0.2 }, { tipoMovimiento: 'EGRESO', montoBs: 0.05 }])).toEqual({ totalIngresosBs: 0.3, totalEgresosBs: 0.05, saldoNetoBs: 0.25 });
  });
});
