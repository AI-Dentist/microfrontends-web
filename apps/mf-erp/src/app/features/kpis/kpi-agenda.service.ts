import { Injectable, inject } from '@angular/core';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { buildRequestHeaders } from '../../core/graphql/request-headers';
import { environment } from '../../../environments/environment';
import { KpiPeriod, ms3KpiQuery } from './kpi-period';

export interface KpisAgendaPacienteFrecuente {
  pacienteId: string;
  totalCitas: number;
  completadas: number;
}

export interface KpisAgendaInasistenciaDetalle {
  citaId: string;
  pacienteId: string;
  odontologoId: string;
  fechaHora: string;
}

export interface KpisAgendaInasistencia {
  citasEvaluadas: number;
  noAsistio: number;
  porcentaje: number;
  detalle: KpisAgendaInasistenciaDetalle[];
}

export interface KpisAgendaDiaHora {
  diaSemana: number; // 1-7 (ISO Lunes=1 .. Domingo=7)
  hora: number; // 0-23
  citas: number;
}

export interface KpisAgendaHorariosPico {
  porDiaHora: KpisAgendaDiaHora[];
  top: KpisAgendaDiaHora[];
}

export interface KpisAgendaInsumoCritico {
  insumoId: string;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  bajoMinimo: boolean;
  salidasPeriodo: number;
}

export interface KpisAgendaProductividadOdontologo {
  odontologoId: string;
  citasTotales: number;
  citasCompletadas: number;
  tasaCompletadas: number;
}

export interface KpisAgenda {
  periodo: {
    desde: string;
    hasta: string;
  };
  pacientesFrecuentes: KpisAgendaPacienteFrecuente[];
  inasistencia: KpisAgendaInasistencia;
  horariosPico: KpisAgendaHorariosPico;
  insumosCriticos: KpisAgendaInsumoCritico[];
  productividadOdontologos: KpisAgendaProductividadOdontologo[];
}

export interface KpisAgendaEnvelope {
  success: boolean;
  data: KpisAgenda;
  timestamp?: string;
}

export class KpiAgendaError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: 'HTTP_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'MALFORMED_RESPONSE',
  ) {
    super(message);
    this.name = 'KpiAgendaError';
  }
}

/**
 * Resolves the base URL for MS3 Agendamiento KPIs according to decision D1:
 * 1. config.agendaApiUrl if explicitly provided.
 * 2. If hosted: origin of bound GraphQL endpoint (resolved against currentOrigin) + '/api/agendamiento'.
 * 3. Otherwise: environment.agendaApiUrl (standalone default '/api/agendamiento').
 */
export function resolveAgendaApiBaseUrl(
  runtime: ErpRuntimeContext,
  defaultUrl: string = environment.agendaApiUrl,
  currentOrigin: string = typeof location !== 'undefined' ? location.origin : 'http://localhost',
): string {
  if (runtime.agendaApiUrl && runtime.agendaApiUrl.trim()) {
    return runtime.agendaApiUrl.trim();
  }
  if (runtime.hosted) {
    const bound = runtime.endpoint;
    if (bound && bound.trim()) {
      try {
        const origin = new URL(bound, currentOrigin).origin;
        return `${origin}/api/agendamiento`;
      } catch {
        return `${currentOrigin}/api/agendamiento`;
      }
    }
  }
  return defaultUrl;
}

function isValidDiaHora(item: unknown): item is KpisAgendaDiaHora {
  if (typeof item !== 'object' || item === null) return false;
  const anyItem = item as Record<string, unknown>;
  return (
    typeof anyItem['diaSemana'] === 'number' &&
    Number.isInteger(anyItem['diaSemana']) &&
    anyItem['diaSemana'] >= 1 &&
    anyItem['diaSemana'] <= 7 &&
    typeof anyItem['hora'] === 'number' &&
    Number.isInteger(anyItem['hora']) &&
    anyItem['hora'] >= 0 &&
    anyItem['hora'] <= 23 &&
    typeof anyItem['citas'] === 'number' &&
    Number.isFinite(anyItem['citas'])
  );
}

function validateKpisAgendaEnvelope(raw: unknown, httpStatus?: number): KpisAgenda {
  if (typeof raw !== 'object' || raw === null) {
    throw new KpiAgendaError('Respuesta de KPIs de agenda con formato inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }

  const envelope = raw as Record<string, unknown>;
  if (envelope['success'] !== true || typeof envelope['data'] !== 'object' || envelope['data'] === null) {
    throw new KpiAgendaError('Respuesta de KPIs de agenda con formato inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }

  const d = envelope['data'] as Record<string, unknown>;

  // periodo
  if (
    typeof d['periodo'] !== 'object' ||
    d['periodo'] === null ||
    typeof (d['periodo'] as Record<string, unknown>)['desde'] !== 'string' ||
    typeof (d['periodo'] as Record<string, unknown>)['hasta'] !== 'string'
  ) {
    throw new KpiAgendaError('Campo periodo inválido en KPIs de agenda.', httpStatus, 'MALFORMED_RESPONSE');
  }

  // pacientesFrecuentes
  if (!Array.isArray(d['pacientesFrecuentes'])) {
    throw new KpiAgendaError('Campo pacientesFrecuentes inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }
  for (const item of d['pacientesFrecuentes']) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof item.pacienteId !== 'string' ||
      typeof item.totalCitas !== 'number' ||
      !Number.isFinite(item.totalCitas) ||
      typeof item.completadas !== 'number' ||
      !Number.isFinite(item.completadas)
    ) {
      throw new KpiAgendaError('Elemento de pacientesFrecuentes inválido.', httpStatus, 'MALFORMED_RESPONSE');
    }
  }

  // inasistencia
  const inas = d['inasistencia'] as Record<string, unknown> | undefined;
  if (
    typeof inas !== 'object' ||
    inas === null ||
    typeof inas['citasEvaluadas'] !== 'number' ||
    !Number.isFinite(inas['citasEvaluadas']) ||
    typeof inas['noAsistio'] !== 'number' ||
    !Number.isFinite(inas['noAsistio']) ||
    typeof inas['porcentaje'] !== 'number' ||
    !Number.isFinite(inas['porcentaje']) ||
    !Array.isArray(inas['detalle'])
  ) {
    throw new KpiAgendaError('Campo inasistencia inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }
  for (const det of inas['detalle']) {
    if (
      typeof det !== 'object' ||
      det === null ||
      typeof det.citaId !== 'string' ||
      typeof det.pacienteId !== 'string' ||
      typeof det.odontologoId !== 'string' ||
      typeof det.fechaHora !== 'string'
    ) {
      throw new KpiAgendaError('Detalle de inasistencia inválido.', httpStatus, 'MALFORMED_RESPONSE');
    }
  }

  // horariosPico
  const pico = d['horariosPico'] as Record<string, unknown> | undefined;
  if (
    typeof pico !== 'object' ||
    pico === null ||
    !Array.isArray(pico['porDiaHora']) ||
    !Array.isArray(pico['top']) ||
    !pico['porDiaHora'].every(isValidDiaHora) ||
    !pico['top'].every(isValidDiaHora)
  ) {
    throw new KpiAgendaError('Campo horariosPico inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }

  // insumosCriticos
  if (!Array.isArray(d['insumosCriticos'])) {
    throw new KpiAgendaError('Campo insumosCriticos inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }
  for (const ins of d['insumosCriticos']) {
    if (
      typeof ins !== 'object' ||
      ins === null ||
      typeof ins.insumoId !== 'string' ||
      typeof ins.nombre !== 'string' ||
      typeof ins.stockActual !== 'number' ||
      !Number.isFinite(ins.stockActual) ||
      typeof ins.stockMinimo !== 'number' ||
      !Number.isFinite(ins.stockMinimo) ||
      typeof ins.bajoMinimo !== 'boolean' ||
      typeof ins.salidasPeriodo !== 'number' ||
      !Number.isFinite(ins.salidasPeriodo)
    ) {
      throw new KpiAgendaError('Elemento de insumosCriticos inválido.', httpStatus, 'MALFORMED_RESPONSE');
    }
  }

  // productividadOdontologos
  if (!Array.isArray(d['productividadOdontologos'])) {
    throw new KpiAgendaError('Campo productividadOdontologos inválido.', httpStatus, 'MALFORMED_RESPONSE');
  }
  for (const prod of d['productividadOdontologos']) {
    if (
      typeof prod !== 'object' ||
      prod === null ||
      typeof prod.odontologoId !== 'string' ||
      typeof prod.citasTotales !== 'number' ||
      !Number.isFinite(prod.citasTotales) ||
      typeof prod.citasCompletadas !== 'number' ||
      !Number.isFinite(prod.citasCompletadas) ||
      typeof prod.tasaCompletadas !== 'number' ||
      !Number.isFinite(prod.tasaCompletadas)
    ) {
      throw new KpiAgendaError('Elemento de productividadOdontologos inválido.', httpStatus, 'MALFORMED_RESPONSE');
    }
  }

  return d as unknown as KpisAgenda;
}

@Injectable({ providedIn: 'root' })
export class KpiAgendaService {
  private readonly runtime = inject(ERP_RUNTIME);
  private readonly auth = inject(AuthContextService);

  async load(period: KpiPeriod): Promise<KpisAgenda> {
    const base = resolveAgendaApiBaseUrl(this.runtime).replace(/\/+$/, '');
    const params = new URLSearchParams(ms3KpiQuery(period));
    const url = `${base}/kpis?${params.toString()}`;

    const token = this.auth.refresh();
    const devUser = this.auth.devUserHeader();
    const headers = buildRequestHeaders({ token, devUser });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new KpiAgendaError(
          `Consulta de KPIs de agenda rechazada (HTTP ${response.status}).`,
          response.status,
          'HTTP_ERROR',
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new KpiAgendaError(
          'Respuesta de KPIs de agenda con cuerpo no analizable.',
          response.status,
          'MALFORMED_RESPONSE',
        );
      }

      return validateKpisAgendaEnvelope(payload, response.status);
    } catch (err: unknown) {
      if (err instanceof KpiAgendaError) {
        throw err;
      }
      if ((err as Record<string, unknown>)?.['name'] === 'AbortError') {
        throw new KpiAgendaError('Tiempo de espera agotado al consultar KPIs de agenda.', undefined, 'TIMEOUT');
      }
      throw new KpiAgendaError('Error de red al consultar KPIs de agenda.', undefined, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}
