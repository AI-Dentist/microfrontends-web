import { buildPaymentSchedule } from './payment-schedule';

describe('MS1 payment schedule preview', () => {
  it('defaults to 30 days, not calendar months', () => {
    const result = buildPaymentSchedule({ total: 100, discount: 0, tipoPago: 'CREDITO', installments: 3, firstDueDate: '2026-01-31' });
    expect(result.cuotas).toEqual([
      { numeroCuota: 1, montoCuotaBs: 33.33, fechaVencimiento: '2026-01-31' },
      { numeroCuota: 2, montoCuotaBs: 33.33, fechaVencimiento: '2026-03-02' },
      { numeroCuota: 3, montoCuotaBs: 33.34, fechaVencimiento: '2026-04-01' },
    ]);
  });
  it('uses the requested day interval across years', () => {
    const result = buildPaymentSchedule({ total: 300, discount: 0, tipoPago: 'CREDITO', installments: 3, firstDueDate: '2026-12-28', intervaloDias: 7 });
    expect(result.cuotas.map(c => c.fechaVencimiento)).toEqual(['2026-12-28', '2027-01-04', '2027-01-11']);
  });
  it('preserves contado and discount/cent remainder behavior', () => {
    expect(buildPaymentSchedule({ total: 500, discount: 100, tipoPago: 'CONTADO', installments: 5, firstDueDate: '2026-03-01' })).toEqual({ net: 400, cuotas: [{ numeroCuota: 1, montoCuotaBs: 400, fechaVencimiento: '2026-03-01' }] });
    const result = buildPaymentSchedule({ total: 1000, discount: 100, tipoPago: 'CREDITO', installments: 4, firstDueDate: '2026-03-10' });
    expect(result.cuotas.map(c => c.montoCuotaBs)).toEqual([225, 225, 225, 225]);
  });
});
