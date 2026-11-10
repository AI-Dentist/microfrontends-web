import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  KPI_DEFINITIONS,
  QR_PAGOFACIL_NOTE,
  INASISTENCIA_OBSERVADA_NOTE,
  type KpiDefinition,
} from './kpi-definitions';
import { KpiDataLoaderService } from './kpi-data-loader.service';
import { KpiFilterComponent } from './kpi-filter.component';

@Component({
  selector: 'erp-kpi-grid',
  standalone: true,
  imports: [RouterLink, KpiFilterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6 p-4">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-800">KPIs ejecutivos</h1>
          <p class="text-sm text-slate-500">Métricas clave financieras y operativas de la clínica.</p>
        </div>
        <erp-kpi-filter />
      </header>

      @if (loader.requiresAdmin()) {
        <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
          <p class="font-medium">Acceso restringido</p>
          <p class="text-sm">Los KPIs ejecutivos requieren el rol ADMIN.</p>
        </div>
      } @else if (loader.isOffline()) {
        <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800" role="alert">
          <p class="font-medium">Modo sin conexión</p>
          <p class="text-sm">Sin conexión: los KPIs están disponibles solo en línea.</p>
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          @for (def of kpis; track def.id) {
            @let vm = loader.getView(def.id);
            <div
              class="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              [attr.data-testid]="'kpi-card-' + def.id"
            >
              <div>
                <div class="flex items-start justify-between gap-2">
                  <h2 class="kpi-card-title text-base font-semibold text-slate-800">
                    {{ def.title }}
                  </h2>
                  <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                    {{ def.source }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-500">{{ def.description }}</p>

                <div class="my-4">
                  @if (vm.status === 'loading') {
                    <div class="animate-pulse space-y-2">
                      <div class="h-8 w-24 rounded bg-slate-200"></div>
                      <div class="h-4 w-32 rounded bg-slate-100"></div>
                    </div>
                  } @else if (vm.status === 'unavailable') {
                    <div class="rounded bg-rose-50 p-3 text-xs text-rose-700">
                      <span class="font-semibold block">No disponible</span>
                      {{ vm.error || 'Fuente no disponible' }}
                    </div>
                  } @else if (vm.status === 'ready' && vm.view; as v) {
                    <div class="text-2xl font-bold tracking-tight text-slate-900">
                      {{ v.headline.primary }}
                    </div>
                    @if (v.headline.secondary) {
                      <div class="mt-1 text-xs font-medium text-slate-600">
                        {{ v.headline.secondary }}
                      </div>
                    }
                  }
                </div>

                @if (def.qrNote) {
                  <p class="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                    {{ qrNote }}
                  </p>
                }
                @if (def.note) {
                  <p class="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                    {{ def.note }}
                  </p>
                }
              </div>

              <div class="mt-4 border-t border-slate-100 pt-3 text-right">
                <a
                  [routerLink]="[def.id]"
                  queryParamsHandling="preserve"
                  class="inline-flex items-center text-xs font-semibold text-teal-600 hover:text-teal-800 hover:underline"
                >
                  Ver detalle &rarr;
                </a>
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class KpiGridComponent {
  protected readonly loader = inject(KpiDataLoaderService);
  protected readonly kpis = KPI_DEFINITIONS;
  protected readonly qrNote = QR_PAGOFACIL_NOTE;
  protected readonly inasistenciaNote = INASISTENCIA_OBSERVADA_NOTE;
}
