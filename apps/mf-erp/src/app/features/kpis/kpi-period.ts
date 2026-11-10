/**
 * Period model and utilities for executive KPIs.
 * Conforms to canonical specs S4 and D2:
 * - Dates use ISO-8601 YYYY-MM-DD.
 * - MS1 GraphQL queries receive America/La_Paz fixed -04:00 instant boundaries
 *   (e.g. 2026-11-01T00:00:00-04:00 to 2026-11-30T23:59:59.999-04:00).
 *   Sending the explicit -04:00 offset string ensures exact representation of La Paz
 *   calendar boundaries regardless of the client browser's local timezone.
 * - Inclusive period length cannot exceed 366 days; start cannot be after end.
 */

export interface KpiPeriod {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

export type KpiPeriodErrorCode = 'INVALID_FORMAT' | 'START_AFTER_END' | 'EXCEEDS_366_DAYS';

export type KpiPeriodValidationResult =
  | { valid: true; period: KpiPeriod }
  | { valid: false; error: string; code: KpiPeriodErrorCode };

const DATE_REGEX = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function parseUtcDate(value: string): { year: number; month: number; day: number; time: number } | null {
  if (typeof value !== 'string') return null;
  const match = DATE_REGEX.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day, time: date.getTime() };
}

/**
 * Returns the current month (from 1st to last day) using local calendar values.
 */
export function defaultKpiPeriod(now: Date = new Date()): KpiPeriod {
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const lastDay = new Date(year, month + 1, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    desde: `${year}-${pad(month + 1)}-01`,
    hasta: `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  };
}

/**
 * Validates that both dates are valid calendar dates (YYYY-MM-DD),
 * start is not after end, and the inclusive range does not exceed 366 days (S4).
 */
export function validateKpiPeriod(period: { desde?: string; hasta?: string } | null | undefined): KpiPeriodValidationResult {
  if (!period || !period.desde || !period.hasta) {
    return {
      valid: false,
      error: 'Se requieren fechas de inicio (desde) y fin (hasta) válidas (YYYY-MM-DD).',
      code: 'INVALID_FORMAT',
    };
  }

  const start = parseUtcDate(period.desde);
  const end = parseUtcDate(period.hasta);

  if (!start || !end) {
    return {
      valid: false,
      error: 'Formato de fecha inválido. Utilice el formato YYYY-MM-DD con días válidos.',
      code: 'INVALID_FORMAT',
    };
  }

  if (start.time > end.time) {
    return {
      valid: false,
      error: 'La fecha de inicio no puede ser posterior a la fecha de fin.',
      code: 'START_AFTER_END',
    };
  }

  const msPerDay = 86_400_000;
  const inclusiveDays = Math.round((end.time - start.time) / msPerDay) + 1;

  if (inclusiveDays > 366) {
    return {
      valid: false,
      error: `El período no puede exceder 366 días (período solicitado: ${inclusiveDays} días).`,
      code: 'EXCEEDS_366_DAYS',
    };
  }

  return {
    valid: true,
    period: {
      desde: period.desde.trim(),
      hasta: period.hasta.trim(),
    },
  };
}

/**
 * Variables for the MS1 GraphQL query `obtenerKpisFinancieros`.
 * Explicitly sends America/La_Paz (-04:00) ISO-8601 strings to pin midnight and end-of-day.
 */
export function ms1KpiVariables(period: KpiPeriod): { fechaInicio: string; fechaFin: string } {
  return {
    fechaInicio: `${period.desde}T00:00:00-04:00`,
    fechaFin: `${period.hasta}T23:59:59.999-04:00`,
  };
}

/**
 * Query parameters for the MS3 REST endpoint `/api/agendamiento/kpis`.
 */
export function ms3KpiQuery(period: KpiPeriod): { desde: string; hasta: string } {
  return {
    desde: period.desde,
    hasta: period.hasta,
  };
}
