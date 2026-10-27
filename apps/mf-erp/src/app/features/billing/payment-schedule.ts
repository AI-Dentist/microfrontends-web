import { TipoPago } from '../../core/graphql/models';

export interface ScheduleInput {
  total: number;
  discount: number;
  tipoPago: TipoPago;
  installments: number;
  /** ISO date (yyyy-mm-dd) of the first due date. */
  firstDueDate: string;
  intervaloDias?: number;
}

export interface ScheduleLine {
  numeroCuota: number;
  montoCuotaBs: number;
  fechaVencimiento: string;
}

export interface PaymentSchedule {
  net: number;
  cuotas: ScheduleLine[];
}

const toCents = (amount: number) => Math.round(amount * 100);

/** Calendar-day arithmetic in UTC avoids daylight-saving shifts in Date-only values. */
export function addDaysIso(isoDate: string, days: number): string {
  const target = new Date(`${isoDate}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  return target.toISOString().slice(0, 10);
}

/**
 * Local preview of the payment plan: CONTADO = 1 installment for the net amount, CREDITO = N
 * equal installments (in cents) where the remainder goes to the last one, spaced by intervaloDias (MS1 default: 30 days).
 */
export function buildPaymentSchedule(input: ScheduleInput): PaymentSchedule {
  const totalCents = toCents(Math.max(0, input.total));
  const discountCents = Math.min(totalCents, Math.max(0, toCents(input.discount)));
  const netCents = totalCents - discountCents;
  const count = input.tipoPago === 'CONTADO' ? 1 : Math.max(1, Math.floor(input.installments || 1));
  const baseCents = Math.floor(netCents / count);
  const cuotas = Array.from({ length: count }, (_, index): ScheduleLine => {
    const isLast = index === count - 1;
    const cents = isLast ? netCents - baseCents * (count - 1) : baseCents;
    return {
      numeroCuota: index + 1,
      montoCuotaBs: cents / 100,
      fechaVencimiento: addDaysIso(input.firstDueDate, index * (input.intervaloDias ?? 30)),
    };
  });
  return { net: netCents / 100, cuotas };
}
