import { ServicioOdontologico } from '../../core/graphql/models';

export interface RankedService {
  service: ServicioOdontologico;
  score: number;
}

/** Text embedded for each tariff entry: "nombre + descripcion". */
export function buildTariffSearchItems(services: readonly ServicioOdontologico[]): { id: string; text: string }[] {
  return services.map((service) => ({
    id: service.id,
    text: [service.nombre, service.descripcion].filter(Boolean).join(' '),
  }));
}

/** Joins ranked ids back to services, preserving ranking order. */
export function mapRankedServices(
  ranked: readonly { id: string; score: number }[],
  services: readonly ServicioOdontologico[],
): RankedService[] {
  const byId = new Map(services.map((service) => [service.id, service]));
  return ranked.flatMap(({ id, score }) => {
    const service = byId.get(id);
    return service ? [{ service, score }] : [];
  });
}
