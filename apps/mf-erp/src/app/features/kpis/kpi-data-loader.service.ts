import { Injectable, computed, inject, signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { LISTAR_ODONTOLOGOS, LISTAR_PACIENTES } from '../../core/graphql/queries.graphql';
import type { Odontologo, Paciente } from '../../core/graphql/models';
import { KpiAgendaError, KpiAgendaService, type KpisAgenda } from './kpi-agenda.service';
import { getKpiDefinition, type KpiId } from './kpi-definitions';
import {
  KpiPeriod,
  ms1KpiVariables,
  validateKpiPeriod,
} from './kpi-period';
import {
  buildKpiView,
  type KpiViewResult,
  type NameMaps,
} from './kpi-views';
import {
  OBTENER_KPIS_FINANCIEROS,
  type KpisFinancieros,
  type ObtenerKpisFinancierosResponse,
} from './kpis.graphql';

export type SourceStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface SourceState<T> {
  status: SourceStatus;
  data: T | null;
  error: string | null;
}

export interface KpiCardViewModel {
  status: SourceStatus;
  view?: KpiViewResult;
  error?: string | null;
}

@Injectable({ providedIn: 'root' })
export class KpiDataLoaderService {
  private readonly apollo = inject(Apollo);
  private readonly kpiAgendaService = inject(KpiAgendaService);
  private readonly authContext = inject(AuthContextService);
  private readonly networkStatus = inject(NetworkStatusService);

  private requestSequence = 0;

  readonly period = signal<KpiPeriod | null>(null);
  readonly periodError = signal<string | null>(null);

  readonly requiresAdmin = computed(() => !this.authContext.roles().includes('ADMIN'));
  readonly adminNotice = computed(() =>
    this.requiresAdmin() ? 'Los KPIs ejecutivos requieren el rol ADMIN.' : null,
  );

  readonly isOffline = computed(() => !this.networkStatus.online());
  readonly offlineNotice = computed(() =>
    this.isOffline() ? 'Sin conexión: los KPIs están disponibles solo en línea.' : null,
  );

  readonly ms1State = signal<SourceState<KpisFinancieros>>({
    status: 'idle',
    data: null,
    error: null,
  });

  readonly ms3State = signal<SourceState<KpisAgenda>>({
    status: 'idle',
    data: null,
    error: null,
  });

  readonly nameMaps = signal<NameMaps>({
    pacientes: new Map<string, string>(),
    odontologos: new Map<string, string>(),
  });

  readonly loading = computed(
    () => this.ms1State().status === 'loading' || this.ms3State().status === 'loading',
  );

  load(periodCandidate: { desde?: string; hasta?: string } | KpiPeriod): void {
    if (this.requiresAdmin()) {
      this.periodError.set(null);
      this.ms1State.set({
        status: 'unavailable',
        data: null,
        error: this.adminNotice(),
      });
      this.ms3State.set({
        status: 'unavailable',
        data: null,
        error: this.adminNotice(),
      });
      return;
    }

    if (this.isOffline()) {
      this.periodError.set(null);
      this.ms1State.set({
        status: 'unavailable',
        data: null,
        error: this.offlineNotice(),
      });
      this.ms3State.set({
        status: 'unavailable',
        data: null,
        error: this.offlineNotice(),
      });
      return;
    }

    const validation = validateKpiPeriod(periodCandidate);
    if (!validation.valid) {
      this.periodError.set(validation.error);
      return;
    }

    this.periodError.set(null);
    const validPeriod = validation.period;
    this.period.set(validPeriod);

    const seq = ++this.requestSequence;

    this.ms1State.set({ status: 'loading', data: null, error: null });
    this.ms3State.set({ status: 'loading', data: null, error: null });

    // MS1 GraphQL query
    firstValueFrom(
      this.apollo.query<ObtenerKpisFinancierosResponse>({
        query: OBTENER_KPIS_FINANCIEROS,
        variables: ms1KpiVariables(validPeriod),
        fetchPolicy: 'network-only',
      }),
    )
      .then((res) => {
        if (this.requestSequence !== seq) return;
        if (!res?.data?.obtenerKpisFinancieros) {
          throw new Error('Respuesta financiera vacía');
        }
        this.ms1State.set({
          status: 'ready',
          data: res.data.obtenerKpisFinancieros,
          error: null,
        });
      })
      .catch((err) => {
        if (this.requestSequence !== seq) return;
        const msg = String(err?.message || err);
        const isAuth =
          err?.status === 401 ||
          err?.status === 403 ||
          /401|403|unauthorized|forbidden|permiso/i.test(msg);
        this.ms1State.set({
          status: 'unavailable',
          data: null,
          error: isAuth ? 'Acceso no autorizado' : 'Fuente no disponible',
        });
      });

    // MS3 REST request (Promise)
    this.kpiAgendaService
      .load(validPeriod)
      .then((data: KpisAgenda) => {
        if (this.requestSequence !== seq) return;
        this.ms3State.set({
          status: 'ready',
          data,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (this.requestSequence !== seq) return;
        const status = err instanceof KpiAgendaError ? err.status : (err as any)?.status;
        const msg = String((err as any)?.message || err);
        const isAuth =
          status === 401 ||
          status === 403 ||
          /401|403|unauthorized|forbidden|permiso/i.test(msg);
        this.ms3State.set({
          status: 'unavailable',
          data: null,
          error: isAuth ? 'Acceso no autorizado' : 'Fuente no disponible',
        });
      });

    // MS1 Name catalogs (parallel, failure-tolerant)
    this.loadNameCatalogs(seq);
  }

  private loadNameCatalogs(seq: number): void {
    Promise.allSettled([
      firstValueFrom(
        this.apollo.query<{ listarPacientes: Paciente[] }>({
          query: LISTAR_PACIENTES,
          variables: { busqueda: null },
          fetchPolicy: 'network-only',
        }),
      ),
      firstValueFrom(
        this.apollo.query<{ listarOdontologos: Odontologo[] }>({
          query: LISTAR_ODONTOLOGOS,
          variables: { soloActivos: false },
          fetchPolicy: 'network-only',
        }),
      ),
    ]).then(([pacientesRes, odontologosRes]) => {
      if (this.requestSequence !== seq) return;

      const pacientesMap = new Map<string, string>();
      if (pacientesRes.status === 'fulfilled' && pacientesRes.value?.data?.listarPacientes) {
        for (const p of pacientesRes.value.data.listarPacientes) {
          const fullName = `${p.nombres ?? ''} ${p.apellidos ?? ''}`.trim();
          pacientesMap.set(p.id, fullName || 'Paciente sin nombre');
        }
      }

      const odontologosMap = new Map<string, string>();
      if (odontologosRes.status === 'fulfilled' && odontologosRes.value?.data?.listarOdontologos) {
        for (const o of odontologosRes.value.data.listarOdontologos) {
          const fullName = `${o.nombres ?? ''} ${o.apellidos ?? ''}`.trim();
          odontologosMap.set(o.id, fullName || 'Odontólogo sin nombre');
        }
      }

      this.nameMaps.set({
        pacientes: pacientesMap,
        odontologos: odontologosMap,
      });
    });
  }

  getView(kpiId: KpiId): KpiCardViewModel {
    const def = getKpiDefinition(kpiId);
    if (!def) {
      return { status: 'unavailable', error: 'KPI no encontrado' };
    }

    if (this.requiresAdmin()) {
      return { status: 'unavailable', error: this.adminNotice() };
    }

    if (this.isOffline()) {
      return { status: 'unavailable', error: this.offlineNotice() };
    }

    const state = def.source === 'ms1' ? this.ms1State() : this.ms3State();

    if (state.status === 'loading') {
      return { status: 'loading' };
    }

    if (state.status === 'ready' && state.data) {
      try {
        const view = buildKpiView(kpiId, state.data, this.nameMaps());
        return { status: 'ready', view };
      } catch (err: any) {
        return { status: 'unavailable', error: err?.message || 'Error visualizando KPI' };
      }
    }

    return {
      status: state.status,
      error: state.error || (state.status === 'unavailable' ? 'Fuente no disponible' : null),
    };
  }
}
