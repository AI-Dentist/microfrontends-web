import { buildCashInput, computeChange, isCashPaymentValid } from './cash-payment';

describe('cash payment helpers', () => {
  it('sends the exact cash DTO, never received/change amounts', () => {
    const form = { cuotaId: 'quota', usuarioCajeroId: 'cashier', ciNit: ' 123 ', razonSocial: ' Juan ', received: 100, due: 50 };
    expect(buildCashInput(form)).toEqual({ cuotaId: 'quota', usuarioCajeroId: 'cashier', ciNitCliente: '123', razonSocialCliente: 'Juan' });
  });
  it('computes the change with cent precision', () => {
    expect(computeChange(100, 33.33)).toBe(66.67);
    expect(computeChange(0.3, 0.1)).toBe(0.2);
  });

  it('returns 0 change when the received amount does not cover the quota', () => {
    expect(computeChange(10, 33.33)).toBe(0);
  });

  it('is valid only with CI/NIT, razón social and enough cash', () => {
    expect(isCashPaymentValid({ ciNit: '123', razonSocial: 'Juan', received: 50, due: 50 })).toBe(true);
    expect(isCashPaymentValid({ ciNit: ' ', razonSocial: 'Juan', received: 50, due: 50 })).toBe(false);
    expect(isCashPaymentValid({ ciNit: '123', razonSocial: '', received: 50, due: 50 })).toBe(false);
    expect(isCashPaymentValid({ ciNit: '123', razonSocial: 'Juan', received: 49.99, due: 50 })).toBe(false);
  });
});
