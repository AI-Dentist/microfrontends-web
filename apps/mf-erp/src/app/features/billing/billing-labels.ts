import { EstadoCuota, EstadoOrdenCobro } from '../../core/graphql/models';

export type TagSeverity = 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast';

export const ORDER_STATUS_SEVERITY: Record<EstadoOrdenCobro | (string & {}), TagSeverity> = {
  PENDIENTE: 'warn',
  PARCIAL: 'info',
  PAGADO: 'success',
  ANULADO: 'danger',
};

export const CUOTA_STATUS_SEVERITY: Record<EstadoCuota | (string & {}), TagSeverity> = {
  PENDIENTE: 'warn',
  PAGADA: 'success',
  VENCIDA: 'danger',
  ANULADA: 'secondary',
};

export function fullName(patient: { nombres: string; apellidos: string }): string {
  return `${patient.nombres} ${patient.apellidos}`.trim();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Ocurrió un error inesperado.';
}
