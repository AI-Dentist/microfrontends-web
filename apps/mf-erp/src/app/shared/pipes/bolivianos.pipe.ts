import { Pipe, PipeTransform } from '@angular/core';

/** Formats an amount in Bolivian bolivianos, e.g. `1250` -> `Bs 1.250,00`. */
export function formatBolivianos(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) {
    return '';
  }
  const [integerPart, decimalPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = amount < 0 && Number(Math.abs(amount).toFixed(2)) !== 0 ? '-' : '';
  return `Bs ${sign}${grouped},${decimalPart}`;
}

@Pipe({ name: 'bolivianos' })
export class BolivianosPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return formatBolivianos(value);
  }
}
