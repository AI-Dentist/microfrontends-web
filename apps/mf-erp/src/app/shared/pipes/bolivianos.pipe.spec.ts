import { BolivianosPipe, formatBolivianos } from './bolivianos.pipe';

describe('formatBolivianos', () => {
  it('formats thousands with dots and decimals with comma', () => {
    expect(formatBolivianos(1250)).toBe('Bs 1.250,00');
  });

  it('formats zero', () => {
    expect(formatBolivianos(0)).toBe('Bs 0,00');
  });

  it('rounds to two decimals and groups millions', () => {
    expect(formatBolivianos(1234567.891)).toBe('Bs 1.234.567,89');
  });

  it('keeps the sign for negative amounts', () => {
    expect(formatBolivianos(-45.5)).toBe('Bs -45,50');
  });

  it('accepts numeric strings', () => {
    expect(formatBolivianos('980.5')).toBe('Bs 980,50');
  });

  it('returns an empty string for missing or non numeric values', () => {
    expect(formatBolivianos(null)).toBe('');
    expect(formatBolivianos(undefined)).toBe('');
    expect(formatBolivianos('abc')).toBe('');
  });

  it('is exposed as the bolivianos pipe', () => {
    expect(new BolivianosPipe().transform(1250)).toBe('Bs 1.250,00');
  });
});
