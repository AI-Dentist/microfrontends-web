import { isManualOrderValid, tariffPreview } from './manual-order';

describe('item based manual order', () => {
  it('requires a patient and at least one service with positive integer quantity', () => {
    expect(isManualOrderValid('p', [])).toBe(false);
    expect(isManualOrderValid('', [{ servicioId: 's', cantidad: 1 }])).toBe(false);
    for (const cantidad of [0, -1, 1.5, NaN]) expect(isManualOrderValid('p', [{ servicioId: 's', cantidad }])).toBe(false);
    expect(isManualOrderValid('p', [{ servicioId: '', cantidad: 1 }])).toBe(false);
    expect(isManualOrderValid('p', [{ servicioId: 's', cantidad: 2, piezaDental: '18' }])).toBe(true);
  });
  it('previews tariffs times quantity without setting a wire price', () => {
    expect(tariffPreview([{ servicioId: 's', cantidad: 2 }], [{ id: 's', precioBaseBs: 280 }])).toBe(560);
  });
});
