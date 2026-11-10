import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import type { ReporteGenerativoPayload } from '../../core/graphql/models';
import {
  ManualReportService,
} from './manual-report.service';
import {
  type EntidadReporte,
  type ReporteManualInput,
} from './manual-reports.graphql';
import { ReportExportService } from './report-export.service';
import { parseReportRows } from './report-data';
import { validateKpiPeriod } from '../kpis/kpi-period';

/**
 * Manual Report Builder component.
 * Allows ADMIN users to pick an entity, choose columns, filter by status/dates, preview, and export.
 * Conforms to S1, S2, and S4 specs.
 */
@Component({
  selector: 'erp-manual-report-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule],
  providers: [ManualReportService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4 p-4" data-testid="manual-report-builder">
      <header>
        <h1 class="text-xl font-semibold text-slate-800">Constructor manual de reportes</h1>
        <p class="text-sm text-slate-600">
          Seleccione una entidad del catálogo, elija las columnas en el orden deseado y aplique filtros opcionales.
        </p>
      </header>

      @if (!isAdmin()) {
        <p role="alert" class="rounded bg-amber-50 p-3 text-amber-900">
          Solo ADMIN puede consultar entidades y generar reportes manuales.
        </p>
      } @else if (!isOnline()) {
        <p role="alert" class="rounded bg-amber-50 p-3 text-amber-900">
          Sin conexión: el constructor manual requiere internet.
        </p>
      } @else {
        <div class="flex flex-col gap-4">
          <!-- Entity selector -->
          <label class="font-medium text-slate-700">
            Entidad de negocio
            <select
              data-testid="entity-select"
              class="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm"
              [value]="selectedEntityClave()"
              (change)="onEntityChange($any($event.target).value)"
            >
              <option value="">-- Seleccionar entidad --</option>
              @for (entity of entities(); track entity.clave) {
                <option [value]="entity.clave">{{ entity.nombre }}</option>
              }
            </select>
          </label>

          @if (entitiesError(); as err) {
            <p role="alert" class="rounded bg-red-50 p-3 text-sm text-red-800">{{ err }}</p>
          }

          @if (selectedEntity(); as currentEntity) {
            <!-- S1 QR nominal notice for pagos -->
            @if (currentEntity.clave === 'pagos') {
              <div
                data-testid="qr-nominal-note"
                class="rounded border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"
              >
                Nota: Los montos QR corresponden a valores nominales (demo PagoFácil /1000).
              </div>
            }

            <!-- Columns checkbox group (rendered in server metadata order) -->
            <fieldset class="flex flex-col gap-2 rounded border border-slate-200 p-3">
              <legend class="font-medium text-slate-700 px-1">Columnas del reporte</legend>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                @for (col of currentEntity.columnas; track col.clave) {
                  <label class="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      [attr.data-column]="col.clave"
                      [checked]="isColumnSelected(col.clave)"
                      (change)="toggleColumn(col.clave)"
                    />
                    <span>{{ col.etiqueta }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <!-- Status filter (only when filtrosEstado is nonempty) -->
            @if (currentEntity.filtrosEstado.length > 0) {
              <label class="font-medium text-slate-700">
                Estado
                <select
                  data-testid="status-select"
                  class="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm"
                  [value]="selectedEstado()"
                  (change)="onEstadoChange($any($event.target).value)"
                >
                  <option value="">Todos los estados</option>
                  @for (estado of currentEntity.filtrosEstado; track estado) {
                    <option [value]="estado">{{ estado }}</option>
                  }
                </select>
              </label>
            }

            <!-- Date filter controls (only when filtroFecha is true) -->
            @if (currentEntity.filtroFecha) {
              <div data-testid="date-controls" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label class="font-medium text-slate-700">
                  Fecha inicio
                  <input
                    type="date"
                    data-testid="fecha-inicio"
                    class="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm"
                    [value]="fechaInicio()"
                    (input)="onFechaInicioChange($any($event.target).value)"
                  />
                </label>
                <label class="font-medium text-slate-700">
                  Fecha fin
                  <input
                    type="date"
                    data-testid="fecha-fin"
                    class="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm"
                    [value]="fechaFin()"
                    (input)="onFechaFinChange($any($event.target).value)"
                  />
                </label>
              </div>
            }

            <!-- Validation error banner -->
            @if (validationError(); as valErr) {
              <p role="alert" class="rounded bg-amber-50 p-2 text-sm text-amber-800">{{ valErr }}</p>
            }

            <!-- Preview action -->
            <div class="flex items-center gap-3">
              <button
                type="button"
                data-testid="preview-button"
                class="rounded bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                [disabled]="loadingPreview()"
                (click)="preview()"
              >
                {{ loadingPreview() ? 'Cargando...' : 'Previsualizar' }}
              </button>
            </div>

            <!-- Preview error banner -->
            @if (previewError(); as err) {
              <p role="alert" class="rounded bg-red-50 p-3 text-sm text-red-800">{{ err }}</p>
            }

            <!-- Rendered Preview Table & Exports -->
            @if (previewReport(); as report) {
              <!-- Explicit 500-row cap notice -->
              @if (report.filasTruncadas === true) {
                <div
                  data-testid="truncated-cap-notice"
                  role="alert"
                  class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  Límite alcanzado: el reporte fue truncado a 500 filas por el servidor.
                </div>
              }

              <article class="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4">
                @if (report.titulo; as title) {
                  <h2 class="text-lg font-semibold text-slate-800">{{ title }}</h2>
                }
                @if (report.resumenAnalitico; as summary) {
                  <p class="text-sm text-slate-600">{{ summary }}</p>
                }

                <div class="overflow-x-auto">
                  <table data-testid="preview-table" class="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr class="border-b bg-slate-100">
                        @for (col of report.columnas; track $index) {
                          <th class="p-2 font-semibold text-slate-700">{{ col }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of parsedRows().rows; track $index) {
                        <tr class="border-b hover:bg-slate-50">
                          @for (cell of row; track $index) {
                            <td class="p-2 text-slate-800">{{ cell }}</td>
                          }
                        </tr>
                      } @empty {
                        <tr>
                          <td
                            [attr.colspan]="report.columnas.length || 1"
                            class="p-4 text-center text-slate-500"
                          >
                            Sin resultados
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <!-- Export action buttons with exact accessible labels -->
                <div class="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    aria-label="Exportar PDF"
                    class="rounded bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    [disabled]="exporting() !== null || !report.urlDescargaPdf"
                    (click)="exportReport('pdf')"
                  >
                    Exportar PDF
                  </button>
                  <button
                    type="button"
                    aria-label="Exportar Excel (.xlsx)"
                    class="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    [disabled]="exporting() !== null || !report.urlDescargaExcel"
                    (click)="exportReport('xlsx')"
                  >
                    Exportar Excel (.xlsx)
                  </button>
                </div>

                @if (exportError(); as msg) {
                  <p role="alert" class="text-sm text-red-700">{{ msg }}</p>
                }
              </article>
            }
          }
        </div>
      }
    </section>
  `,
})
export class ManualReportBuilderComponent {
  private readonly manualReportService = inject(ManualReportService);
  private readonly exportService = inject(ReportExportService);
  private readonly auth = inject(AuthContextService);
  private readonly network = inject(NetworkStatusService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isAdmin = computed(() => this.auth.roles().includes('ADMIN'));
  // The online signal is the reactive source; isOnline() resyncs (writes) it and must not run while rendering.
  protected readonly isOnline = computed(() => this.network.online());
  // Stable primitive stamp: auth.refresh() republishes equal roles as a new array, which must not
  // reset the form or reload metadata.
  private readonly identity = computed(() =>
    JSON.stringify([this.auth.principalKey(), this.isAdmin(), this.isOnline()]));

  protected readonly entities = signal<EntidadReporte[]>([]);
  protected readonly entitiesError = signal<string | null>(null);

  protected readonly selectedEntityClave = signal<string>('');
  protected readonly selectedEntity = computed(
    () => this.entities().find((e) => e.clave === this.selectedEntityClave()) ?? null,
  );

  protected readonly selectedColumns = signal<string[]>([]);
  protected readonly selectedEstado = signal<string>('');
  protected readonly fechaInicio = signal<string>('');
  protected readonly fechaFin = signal<string>('');

  protected readonly loadingPreview = signal<boolean>(false);
  protected readonly previewError = signal<string | null>(null);
  protected readonly validationError = signal<string | null>(null);
  protected readonly previewReport = signal<ReporteGenerativoPayload | null>(null);

  protected readonly exporting = signal<'pdf' | 'xlsx' | null>(null);
  protected readonly exportError = signal<string | null>(null);

  protected readonly parsedRows = computed(() => {
    const report = this.previewReport();
    if (!report) return { rows: [], error: null };
    return parseReportRows(
      report.columnas,
      report.filas != null ? JSON.stringify(report.filas) : report.filasJson,
    );
  });

  private session = 0;
  /** Bumped on every parameter edit, so a preview for older parameters is discarded. */
  private formVersion = 0;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });

    // React only to real identity, role or connectivity changes.
    effect(() => {
      const [principal, admin, online] = JSON.parse(this.identity()) as [string | null, boolean, boolean];

      untracked(() => {
        this.session++;
        this.resetForm();
        this.entities.set([]);
        this.entitiesError.set(null);

        if (principal && admin && online) {
          void this.loadEntities();
        }
      });
    });
  }

  private resetForm(): void {
    this.formVersion++;
    this.selectedEntityClave.set('');
    this.selectedColumns.set([]);
    this.selectedEstado.set('');
    this.fechaInicio.set('');
    this.fechaFin.set('');
    this.loadingPreview.set(false);
    this.previewError.set(null);
    this.validationError.set(null);
    this.previewReport.set(null);
    this.exporting.set(null);
    this.exportError.set(null);
  }

  private async loadEntities(): Promise<void> {
    const session = this.session;
    try {
      const list = await this.manualReportService.listEntities();
      if (this.destroyed || session !== this.session) return;
      this.entities.set(list);
    } catch (err: unknown) {
      if (this.destroyed || session !== this.session) return;
      this.entitiesError.set(err instanceof Error ? err.message : 'Error al cargar entidades.');
    }
  }

  protected onEntityChange(clave: string): void {
    this.formVersion++;
    this.selectedEntityClave.set(clave);
    this.selectedColumns.set([]);
    this.selectedEstado.set('');
    this.fechaInicio.set('');
    this.fechaFin.set('');
    this.previewReport.set(null);
    this.previewError.set(null);
    this.validationError.set(null);
  }

  protected isColumnSelected(clave: string): boolean {
    return this.selectedColumns().includes(clave);
  }

  protected toggleColumn(clave: string): void {
    const current = this.selectedColumns();
    const next = current.includes(clave) ? current.filter((c) => c !== clave) : [...current, clave];
    this.formVersion++;
    this.selectedColumns.set(next);
    this.previewReport.set(null);
    this.validationError.set(null);
  }

  protected onEstadoChange(estado: string): void {
    this.formVersion++;
    this.selectedEstado.set(estado);
    this.previewReport.set(null);
    this.validationError.set(null);
  }

  protected onFechaInicioChange(date: string): void {
    this.formVersion++;
    this.fechaInicio.set(date);
    this.previewReport.set(null);
    this.validationError.set(null);
  }

  protected onFechaFinChange(date: string): void {
    this.formVersion++;
    this.fechaFin.set(date);
    this.previewReport.set(null);
    this.validationError.set(null);
  }

  protected async preview(): Promise<void> {
    if (this.loadingPreview()) return;

    this.validationError.set(null);
    this.previewError.set(null);

    const entity = this.selectedEntity();
    if (!entity) {
      this.validationError.set('Debe seleccionar una entidad.');
      return;
    }

    const selectedCols = this.selectedColumns();
    if (selectedCols.length === 0) {
      this.validationError.set('Debe seleccionar al menos una columna.');
      return;
    }

    // Preserve server metadata order: filter entity.columnas by selected
    const orderedColumns = entity.columnas
      .filter((col) => selectedCols.includes(col.clave))
      .map((col) => col.clave);

    const input: ReporteManualInput = {
      entidad: entity.clave,
      columnas: orderedColumns,
    };

    // Status filter validation
    const estado = this.selectedEstado().trim();
    if (estado) {
      if (entity.filtrosEstado.length === 0 || !entity.filtrosEstado.includes(estado)) {
        this.validationError.set(`El estado '${estado}' no es válido para esta entidad.`);
        return;
      }
      input.estado = estado;
    }

    // Date filter validation
    const fInicio = this.fechaInicio().trim();
    const fFin = this.fechaFin().trim();
    if (fInicio || fFin) {
      if (!entity.filtroFecha) {
        this.validationError.set('La entidad seleccionada no admite filtros por fecha.');
        return;
      }
      if (!fInicio || !fFin) {
        this.validationError.set('Debe ingresar ambas fechas (inicio y fin) o dejar ambas vacías.');
        return;
      }
      const validation = validateKpiPeriod({ desde: fInicio, hasta: fFin });
      if (!validation.valid) {
        this.validationError.set(validation.error);
        return;
      }
      // Emit explicit clinic La Paz day-boundary DateTime values (-04:00)
      input.fechaInicio = `${fInicio}T00:00:00-04:00`;
      input.fechaFin = `${fFin}T23:59:59.999-04:00`;
    }

    const session = this.session;
    const version = this.formVersion;
    this.loadingPreview.set(true);

    try {
      const report = await this.manualReportService.preview(input);
      if (this.destroyed || session !== this.session || version !== this.formVersion) return;
      this.previewReport.set(report);
    } catch (err: unknown) {
      if (this.destroyed || session !== this.session || version !== this.formVersion) return;
      this.previewReport.set(null);
      this.previewError.set(err instanceof Error ? err.message : 'Error al generar la previsualización.');
    } finally {
      if (!this.destroyed && session === this.session) {
        this.loadingPreview.set(false);
      }
    }
  }

  protected async exportReport(format: 'pdf' | 'xlsx'): Promise<void> {
    const report = this.previewReport();
    if (!report || this.exporting()) return;

    this.exporting.set(format);
    this.exportError.set(null);

    try {
      await this.exportService.download(report, format);
    } catch (err: unknown) {
      this.exportError.set(
        err instanceof Error ? err.message : 'No se pudo descargar el archivo. Verifique sesión y permisos.',
      );
    } finally {
      this.exporting.set(null);
    }
  }
}
