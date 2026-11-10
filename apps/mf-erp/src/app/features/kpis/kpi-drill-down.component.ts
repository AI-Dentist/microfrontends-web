import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgxEchartsDirective } from 'ngx-echarts';
import {
  getKpiDefinition,
  QR_PAGOFACIL_NOTE,
  INASISTENCIA_OBSERVADA_NOTE,
  type KpiId,
} from './kpi-definitions';
import { KpiDataLoaderService } from './kpi-data-loader.service';
import { KpiFilterComponent } from './kpi-filter.component';

@Component({
  selector: 'erp-kpi-drill-down',
  standalone: true,
  imports: [RouterLink, NgxEchartsDirective, KpiFilterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6 p-4">
      <nav class="flex items-center gap-2 text-sm text-slate-500">
        <a
          [routerLink]="['..']"
          queryParamsHandling="preserve"
          data-testid="back-to-kpis"
          class="inline-flex items-center font-medium text-teal-600 hover:text-teal-800 hover:underline"
        >
          &larr; Volver a KPIs
        </a>
      </nav>

      @if (definition(); as def) {
        <header class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-2xl font-bold tracking-tight text-slate-800">
                {{ def.title }}
              </h1>
              <span class="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-slate-600">
                {{ def.source }}
              </span>
            </div>
            <p class="mt-1 text-sm text-slate-500">{{ def.description }}</p>
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
          @let vm = loader.getView(def.id);

          @if (vm.status === 'loading') {
            <div class="animate-pulse space-y-4">
              <div class="h-10 w-48 rounded bg-slate-200"></div>
              <div class="h-80 w-full rounded bg-slate-100"></div>
            </div>
          } @else if (vm.status === 'unavailable') {
            <div class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800" role="alert">
              <p class="font-medium">Fuente no disponible</p>
              <p class="text-sm">{{ vm.error || 'Fuente no disponible' }}</p>
            </div>
          } @else if (vm.status === 'ready' && vm.view; as v) {
            <!-- Headline card -->
            <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Métrica Principal</span>
              <div class="mt-1 text-3xl font-bold text-slate-900">
                {{ v.headline.primary }}
              </div>
              @if (v.headline.secondary) {
                <p class="mt-1 text-sm text-slate-600">{{ v.headline.secondary }}</p>
              }
            </div>

            <!-- Notes -->
            @if (def.qrNote) {
              <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span class="font-semibold block">Nota sobre montos QR:</span>
                {{ qrNote }}
              </div>
            }
            @if (def.note) {
              <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {{ def.note }}
              </div>
            }

            <!-- Chart -->
            <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 class="mb-4 text-base font-semibold text-slate-800">Gráfico</h2>
              <div echarts [options]="v.chartOptions" class="h-80 w-full"></div>
            </div>

            <!-- Backing table -->
            <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 class="mb-4 text-base font-semibold text-slate-800">Datos del período</h2>
              @if (v.table.rows.length === 0) {
                <p class="py-6 text-center text-sm text-slate-500">Sin datos en el período</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="min-w-full divide-y divide-slate-200 text-sm">
                    <thead class="bg-slate-50">
                      <tr>
                        @for (col of v.table.columns; track col.key) {
                          <th class="px-4 py-2.5 text-left font-semibold text-slate-700">
                            {{ col.label }}
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 bg-white">
                      @for (row of v.table.rows; track $index) {
                        <tr class="hover:bg-slate-50">
                          @for (col of v.table.columns; track col.key) {
                            <td class="whitespace-nowrap px-4 py-2.5 text-slate-700">
                              {{ row[col.key] }}
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
        }
      } @else {
        <div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800" role="alert">
          <h1 class="text-xl font-bold">KPI no encontrado</h1>
          <p class="mt-2 text-sm text-red-700">El identificador de KPI solicitado no es válido.</p>
        </div>
      }
    </section>
  `,
})
export class KpiDrillDownComponent {
  protected readonly loader = inject(KpiDataLoaderService);
  private readonly route = inject(ActivatedRoute);

  protected readonly qrNote = QR_PAGOFACIL_NOTE;
  protected readonly inasistenciaNote = INASISTENCIA_OBSERVADA_NOTE;

  protected readonly definition = computed(() => {
    const kpiParam = this.route.snapshot.paramMap.get('kpi');
    return kpiParam ? getKpiDefinition(kpiParam as KpiId) : undefined;
  });
}
