import { MovimientoCaja, ResumenCaja } from '../../core/graphql/models';

export interface DateRange {
  /** ISO date yyyy-mm-dd. */
  desde: string;
  hasta: string;
}

export interface KpiCard {
  key: 'ingresos' | 'egresos' | 'saldo';
  label: string;
  value: number;
  negative: boolean;
}

/** Local-time ISO date (avoids the UTC shift of `toISOString`). */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function currentMonthRange(now: Date = new Date()): DateRange {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { desde: toIsoDate(first), hasta: toIsoDate(last) };
}

/** Inclusive local-day boundaries serialized as ISO-8601 instants with Z offset. */
export function cashFlowBoundaries(range: DateRange): { fechaInicio: string; fechaFin: string } {
  const [sy, sm, sd] = range.desde.split('-').map(Number);
  const [ey, em, ed] = range.hasta.split('-').map(Number);
  return { fechaInicio: new Date(sy, sm - 1, sd, 0, 0, 0, 0).toISOString(), fechaFin: new Date(ey, em - 1, ed, 23, 59, 59, 999).toISOString() };
}

export function isValidRange(range: DateRange): boolean {
  return !!range.desde && !!range.hasta && range.desde <= range.hasta;
}

export function buildKpiCards(summary: Pick<ResumenCaja, 'totalIngresosBs' | 'totalEgresosBs' | 'saldoNetoBs'>): KpiCard[] {
  return [
    { key: 'ingresos', label: 'Ingresos', value: summary.totalIngresosBs, negative: false },
    { key: 'egresos', label: 'Egresos', value: summary.totalEgresosBs, negative: false },
    { key: 'saldo', label: 'Saldo Neto', value: summary.saldoNetoBs, negative: summary.saldoNetoBs < 0 },
  ];
}

/** Totals movements by type in cents to avoid float drift. */
export function summarizeMovements(movements: Pick<MovimientoCaja, 'tipoMovimiento' | 'montoBs'>[]): Pick<ResumenCaja, 'totalIngresosBs' | 'totalEgresosBs' | 'saldoNetoBs'> {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const movement of movements) {
    const cents = Math.round(movement.montoBs * 100);
    if (movement.tipoMovimiento === 'INGRESO') {
      incomeCents += cents;
    } else {
      expenseCents += cents;
    }
  }
  return {
    totalIngresosBs: incomeCents / 100,
    totalEgresosBs: expenseCents / 100,
    saldoNetoBs: (incomeCents - expenseCents) / 100,
  };
}
