import { OfflineMutationRecord } from './dexie.db';
import { findPendingDuplicate } from './pending-actions';

function record(key: string, mutationName: string, variables: unknown, status: OfflineMutationRecord['status'] = 'PENDING_SYNC'): OfflineMutationRecord {
  return { ownerPrincipal: 'user:A', idempotencyKey: key, mutationName, variables, createdAt: '2026-10-22T10:00:00Z', status };
}
const cashCharge = (cuotaId: string) => ({ input: { cuotaId, usuarioCajeroId: 'a1000000-0000-0000-0000-000000000001', ciNitCliente: '123', razonSocialCliente: 'X' } });

describe('findPendingDuplicate', () => {
  it('finds a pending cash charge for the same owner and installment even with another key', () => {
    const pending = record('first-key', 'CobrarCuotaEnEfectivo', cashCharge('c1'));
    expect(findPendingDuplicate([pending], 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'user:A')).toBe(pending);
  });
  it('ignores other owners and legacy ownerless records', () => {
    const pending = record('first-key', 'CobrarCuotaEnEfectivo', cashCharge('c1'));
    expect(findPendingDuplicate([pending], 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'user:B')).toBeUndefined();
    expect(findPendingDuplicate([{ ...pending, ownerPrincipal: undefined }], 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'user:A')).toBeUndefined();
  });
  it('ignores charges for other installments', () => {
    const pending = record('first-key', 'CobrarCuotaEnEfectivo', cashCharge('c1'));
    expect(findPendingDuplicate([pending], 'CobrarCuotaEnEfectivo', cashCharge('c2'), 'user:A')).toBeUndefined();
  });
  it('ignores records already synced or failed', () => {
    const records = [record('a', 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'SYNCED'), record('b', 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'FAILED')];
    expect(findPendingDuplicate(records, 'CobrarCuotaEnEfectivo', cashCharge('c1'), 'user:A')).toBeUndefined();
  });
  it('detects a pending patient with the same CI/NIT regardless of spacing and case', () => {
    const pending = record('p', 'CrearPaciente', { input: { ciNit: '1234567 LP' } });
    expect(findPendingDuplicate([pending], 'CrearPaciente', { input: { ciNit: ' 1234567lp' } }, 'user:A')).toBe(pending);
  });
  it('never treats actions without a business identity as duplicates', () => {
    const variables = { input: { usuarioCajeroId: 'a1000000-0000-0000-0000-000000000001', descripcion: 'Luz', montoBs: 100, categoria: 'SERVICIOS', metodoPago: 'EFECTIVO' } };
    expect(findPendingDuplicate([record('e', 'RegistrarEgresoCaja', variables)], 'RegistrarEgresoCaja', variables, 'user:A')).toBeUndefined();
  });
});
