import { describe, expect, it } from 'vitest';
import {
  defaultKpiPeriod,
  validateKpiPeriod,
  ms1KpiVariables,
  ms3KpiQuery,
  type KpiPeriod,
} from './kpi-period';

describe('KPI period utilities', () => {
  it('computes the current month as default period from a local calendar date', () => {
    const fixedNow = new Date(2026, 10, 10); // November 10, 2026
    const period = defaultKpiPeriod(fixedNow);
    expect(period).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-30',
    });

    const leapFeb = new Date(2024, 1, 5); // February 5, 2024 (leap year)
    expect(defaultKpiPeriod(leapFeb)).toEqual({
      desde: '2024-02-01',
      hasta: '2024-02-29',
    });
  });

  it('validates correct periods and formats', () => {
    const res = validateKpiPeriod({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.period).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    }
  });

  it('rejects missing or malformed dates', () => {
    expect(validateKpiPeriod(null as any).valid).toBe(false);
    expect(validateKpiPeriod({ desde: '', hasta: '2026-11-30' }).valid).toBe(false);
    expect(validateKpiPeriod({ desde: '2026-11-01', hasta: '' }).valid).toBe(false);
    expect(validateKpiPeriod({ desde: 'not-a-date', hasta: '2026-11-30' }).valid).toBe(false);
    expect(validateKpiPeriod({ desde: '2026-02-30', hasta: '2026-03-01' }).valid).toBe(false);
    const result = validateKpiPeriod({ desde: '2026-13-01', hasta: '2026-13-10' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_FORMAT');
    }
  });

  it('rejects start date strictly after end date', () => {
    const result = validateKpiPeriod({ desde: '2026-11-15', hasta: '2026-11-10' });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('START_AFTER_END');
    }
  });

  it('allows single-day period (1 day inclusive)', () => {
    const res = validateKpiPeriod({ desde: '2026-11-10', hasta: '2026-11-10' });
    expect(res.valid).toBe(true);
  });

  it('handles the 366-day boundary (366 days inclusive ok, 367 days rejected)', () => {
    // 2024 is a leap year (366 days from 2024-01-01 to 2024-12-31 inclusive)
    const leapYear = validateKpiPeriod({ desde: '2024-01-01', hasta: '2024-12-31' });
    expect(leapYear.valid).toBe(true);

    // 367 days inclusive: 2024-01-01 to 2025-01-01
    const exceedsLeap = validateKpiPeriod({ desde: '2024-01-01', hasta: '2025-01-01' });
    expect(exceedsLeap.valid).toBe(false);
    if (!exceedsLeap.valid) {
      expect(exceedsLeap.code).toBe('EXCEEDS_366_DAYS');
    }

    // Non-leap year: 2025-01-01 to 2026-01-01 is 366 days inclusive
    const nonLeap366 = validateKpiPeriod({ desde: '2025-01-01', hasta: '2026-01-01' });
    expect(nonLeap366.valid).toBe(true);

    // 2025-01-01 to 2026-01-02 is 367 days inclusive
    const nonLeap367 = validateKpiPeriod({ desde: '2025-01-01', hasta: '2026-01-02' });
    expect(nonLeap367.valid).toBe(false);
    if (!nonLeap367.valid) {
      expect(nonLeap367.code).toBe('EXCEEDS_366_DAYS');
    }
  });

  it('formats MS1 variables with fixed America/La_Paz (-04:00) boundaries independent of browser TZ', () => {
    const vars = ms1KpiVariables({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(vars).toEqual({
      fechaInicio: '2026-11-01T00:00:00-04:00',
      fechaFin: '2026-11-30T23:59:59.999-04:00',
    });
  });

  it('formats MS3 query parameters as YYYY-MM-DD', () => {
    const query = ms3KpiQuery({ desde: '2026-11-01', hasta: '2026-11-30' });
    expect(query).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-30',
    });
  });
});
