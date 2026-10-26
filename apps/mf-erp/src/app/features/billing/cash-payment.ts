import { CobrarEfectivoInput } from '../../core/graphql/models';

/** Explicit adapter: cash received and change belong only to the UI. */
export function buildCashInput(input: { cuotaId: string; usuarioCajeroId: string; ciNit: string; razonSocial: string }): CobrarEfectivoInput {
  return { cuotaId: input.cuotaId, usuarioCajeroId: input.usuarioCajeroId, ciNitCliente: input.ciNit.trim(), razonSocialCliente: input.razonSocial.trim() };
}

const toCents = (amount: number) => Math.round((amount || 0) * 100);

/** Change to hand back: received minus due, never negative. */
export function computeChange(received: number, due: number): number {
  return Math.max(0, toCents(received) - toCents(due)) / 100;
}

export function isCashPaymentValid(input: { ciNit: string; razonSocial: string; received: number; due: number }): boolean {
  return !!input.ciNit.trim() && !!input.razonSocial.trim() && toCents(input.received) >= toCents(input.due);
}
