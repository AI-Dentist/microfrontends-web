import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import type { ReporteGenerativoPayload } from '../../core/graphql/models';
import {
  LISTAR_ENTIDADES_REPORTE,
  GENERAR_REPORTE_MANUAL,
  type EntidadReporte,
  type ReporteManualInput,
  type ListarEntidadesReporteResponse,
  type GenerarReporteManualResponse,
} from './manual-reports.graphql';

function sanitizeListEntitiesError(err: unknown): Error {
  if (err instanceof Error && (err.message === 'La sesión cambió.' || err.message === 'No se recibieron entidades de reporte.')) {
    return err;
  }
  const codes = CombinedGraphQLErrors.is(err)
    ? err.errors.flatMap((e) => [e.extensions?.['code'], e.extensions?.['classification']])
    : [];
  if (codes.includes('SERVICE_UNAVAILABLE')) {
    return new Error('Servicio no disponible al consultar entidades de reporte.');
  }
  if (codes.includes('BAD_REQUEST')) {
    return new Error('Solicitud de entidades inválida.');
  }
  if (codes.includes('FORBIDDEN')) {
    return new Error('Solo ADMIN puede consultar entidades de reporte.');
  }
  return new Error('Error al consultar entidades de reporte.');
}

function sanitizePreviewError(err: unknown): Error {
  if (err instanceof Error && (err.message === 'La sesión cambió.' || err.message === 'No se recibió el reporte generado.')) {
    return err;
  }
  const codes = CombinedGraphQLErrors.is(err)
    ? err.errors.flatMap((e) => [e.extensions?.['code'], e.extensions?.['classification']])
    : [];
  if (codes.includes('BAD_REQUEST')) {
    return new Error('Parámetros del reporte inválidos.');
  }
  if (codes.includes('SERVICE_UNAVAILABLE')) {
    return new Error('Servicio no disponible para generar el reporte.');
  }
  if (codes.includes('FORBIDDEN')) {
    return new Error('Solo ADMIN puede generar reportes manuales.');
  }
  return new Error('Error al generar el reporte manual.');
}

@Injectable()
export class ManualReportService {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  private readonly network = inject(NetworkStatusService);

  async listEntities(): Promise<EntidadReporte[]> {
    this.auth.refresh();
    if (!this.network.isOnline()) {
      throw new Error('Sin conexión: la obtención de entidades requiere internet.');
    }
    const owner = this.auth.principalKey();
    if (!owner || !this.auth.roles().includes('ADMIN')) {
      throw new Error('Solo ADMIN puede consultar entidades de reporte.');
    }

    try {
      const res = await firstValueFrom(
        this.apollo.query<ListarEntidadesReporteResponse>({
          query: LISTAR_ENTIDADES_REPORTE,
          fetchPolicy: 'network-only',
        }),
      );

      this.auth.refresh();
      if (this.auth.principalKey() !== owner || !this.auth.roles().includes('ADMIN')) {
        throw new Error('La sesión cambió.');
      }

      const entidades = res?.data?.listarEntidadesReporte;
      if (!entidades) {
        throw new Error('No se recibieron entidades de reporte.');
      }

      return entidades;
    } catch (err: unknown) {
      throw sanitizeListEntitiesError(err);
    }
  }

  async preview(input: ReporteManualInput): Promise<ReporteGenerativoPayload> {
    this.auth.refresh();
    if (!this.network.isOnline()) {
      throw new Error('Sin conexión: la generación de reportes requiere internet.');
    }
    const owner = this.auth.principalKey();
    if (!owner || !this.auth.roles().includes('ADMIN')) {
      throw new Error('Solo ADMIN puede generar reportes manuales.');
    }

    const preparedInput: ReporteManualInput = {
      entidad: input.entidad,
      columnas: [...input.columnas],
      ...(input.fechaInicio !== undefined ? { fechaInicio: input.fechaInicio } : {}),
      ...(input.fechaFin !== undefined ? { fechaFin: input.fechaFin } : {}),
      ...(input.estado !== undefined ? { estado: input.estado } : {}),
    };

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await firstValueFrom(
        this.apollo.mutate<GenerarReporteManualResponse>({
          mutation: GENERAR_REPORTE_MANUAL,
          variables: { input: preparedInput },
          context: { idempotencyKey, ownerPrincipal: owner },
          fetchPolicy: 'no-cache',
        }),
      );

      this.auth.refresh();
      if (this.auth.principalKey() !== owner || !this.auth.roles().includes('ADMIN')) {
        throw new Error('La sesión cambió.');
      }

      const report = res?.data?.generarReporteManual;
      if (!report) {
        throw new Error('No se recibió el reporte generado.');
      }

      return report;
    } catch (err: unknown) {
      throw sanitizePreviewError(err);
    }
  }
}
