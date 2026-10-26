import { OrdenCobroItemInput, ServicioOdontologico } from '../../core/graphql/models';

export function isManualOrderValid(patientId: string | null, items: OrdenCobroItemInput[]): boolean {
  return !!patientId && items.length > 0 && items.every(item => !!item.servicioId && Number.isInteger(item.cantidad) && item.cantidad > 0);
}

/** Informational tariff preview only. The server calculates and persists prices. */
export function tariffPreview(items: OrdenCobroItemInput[], services: Pick<ServicioOdontologico, 'id' | 'precioBaseBs'>[]): number {
  return items.reduce((sum, item) => sum + Math.round((services.find(s => s.id === item.servicioId)?.precioBaseBs ?? 0) * 100) * item.cantidad, 0) / 100;
}
