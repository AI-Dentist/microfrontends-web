import { OfflineMutationRecord } from './dexie.db';

const normalize = (value: unknown) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Business identity of an action, used to detect the same action queued twice under
 * different Idempotency-Keys (e.g. the cashier reopens the cash modal while offline).
 * Actions without a natural identity (expenses, manual orders) rely on their key only.
 */
function actionIdentity(mutationName: string, variables: any): string | undefined {
  const input = variables?.input;
  switch (mutationName) {
    case 'CobrarCuotaEnEfectivo':
      return input?.cuotaId ? `cuota:${input.cuotaId}` : undefined;
    case 'CrearPaciente':
      return input?.ciNit ? `paciente:${normalize(input.ciNit)}` : undefined;
    default:
      return undefined;
  }
}

export function findPendingDuplicate(
  records: readonly OfflineMutationRecord[],
  mutationName: string,
  variables: unknown,
  ownerPrincipal: string,
): OfflineMutationRecord | undefined {
  const identity = actionIdentity(mutationName, variables);
  if (!identity) {
    return undefined;
  }
  return records.find(
    (record) =>
      !!ownerPrincipal && record.ownerPrincipal === ownerPrincipal &&
      record.status === 'PENDING_SYNC' &&
      record.mutationName === mutationName &&
      actionIdentity(record.mutationName, record.variables) === identity,
  );
}
