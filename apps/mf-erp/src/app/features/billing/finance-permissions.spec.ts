import { canCollectPayments, canManageOrders } from './finance-permissions';

describe('financial roles', () => {
  it('permits reception to create orders and plans but never collect cash or QR', () => {
    expect(canManageOrders(['RECEPCIONISTA'])).toBe(true);
    expect(canCollectPayments(['RECEPCIONISTA'])).toBe(false);
  });
  it('preserves ADMIN and CAJERO capabilities and denies missing/clinical roles', () => {
    for (const role of ['ADMIN', 'CAJERO']) {
      expect(canManageOrders([role])).toBe(true);
      expect(canCollectPayments([role])).toBe(true);
    }
    for (const roles of [[], ['ODONTOLOGO']]) {
      expect(canManageOrders(roles)).toBe(false);
      expect(canCollectPayments(roles)).toBe(false);
    }
  });
});
