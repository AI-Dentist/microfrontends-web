import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LucideFileSpreadsheet, LucideFileText } from '@lucide/angular';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { NgxEchartsDirective } from 'ngx-echarts';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { ReporteGenerativoPayload } from '../../core/graphql/models';
import { ReportExportService } from './report-export.service';
import { buildChartOptions, parseReportRows } from './report-data';

type ExportKind = 'excel' | 'pdf';

/** Renders an agent report payload: SQL accordion, table, safe chart and authenticated exports. */
@Component({
  selector: 'erp-dynamic-report-viewer',
  imports: [AccordionModule, ButtonModule, TableModule, NgxEchartsDirective, LucideFileSpreadsheet, LucideFileText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4" data-testid="report-viewer">
      @if (downloadError(); as message) { <p role="alert">{{ message }}</p> }

      @if (report().consultaSqlEjecutada) {
        <p-accordion>
          <p-accordion-panel value="sql">
            <p-accordion-header>Ver consulta SQL ejecutada</p-accordion-header>
            <p-accordion-content>
              <pre class="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{{ report().consultaSqlEjecutada }}</pre>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      }

      @if (parsed().error; as parseError) {
        <p class="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert" data-testid="report-parse-error">{{ parseError }}</p>
      }

      <p-table [value]="parsed().rows" [scrollable]="true" styleClass="text-sm">
        <ng-template #header>
          <tr>
            @for (column of report().columnas; track $index) {
              <th>{{ column }}</th>
            }
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            @for (cell of row; track $index) {
              <td>{{ cell }}</td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td [attr.colspan]="report().columnas.length || 1" class="text-center text-slate-500">Sin resultados</td>
          </tr>
        </ng-template>
      </p-table>

      @if (chartOptions(); as options) {
        <div echarts [options]="options" class="h-80"></div>
      }

      <div class="flex flex-wrap gap-3">
        <p-button
          type="button"
          size="large"
          label="[Exportar a Excel (.xlsx)]"
          severity="success"
          [disabled]="!canExport() || !report().urlDescargaExcel || exporting() !== null"
          [loading]="exporting() === 'excel'"
          (onClick)="download('excel')"
        >
          <ng-template #icon><svg lucideFileSpreadsheet class="size-5"></svg></ng-template>
        </p-button>
        <p-button
          type="button"
          size="large"
          label="[Exportar a PDF]"
          severity="danger"
          [disabled]="!canExport() || !report().urlDescargaPdf || exporting() !== null"
          [loading]="exporting() === 'pdf'"
          (onClick)="download('pdf')"
        >
          <ng-template #icon><svg lucideFileText class="size-5"></svg></ng-template>
        </p-button>
      </div>
    </section>
  `,
})
export class DynamicReportViewer {
  private readonly exports = inject(ReportExportService);
  private readonly auth = inject(AuthContextService);
  private readonly messages = inject(MessageService, { optional: true });
  readonly report = input.required<ReporteGenerativoPayload>();
  protected readonly canExport = computed(() => this.auth.roles().includes('ADMIN'));
  protected readonly exporting = signal<ExportKind | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly parsed = computed(() => parseReportRows(this.report().columnas, this.report().filasJson));
  protected readonly chartOptions = computed(() =>
    buildChartOptions(this.report().tipoGraficoSugerido, this.report().columnas, this.parsed().rows));
  protected async download(kind: ExportKind): Promise<void> {
    if (this.exporting() || !this.canExport()) return;
    this.exporting.set(kind);
    this.downloadError.set(null);
    try { await this.exports.download(this.report(), kind === 'excel' ? 'xlsx' : 'pdf'); }
    catch {
      const detail = 'No se pudo descargar el archivo. Verifique sesión, permisos y conexión.';
      this.downloadError.set(detail);
      this.messages?.add({ severity: 'error', summary: 'Exportación fallida', detail });
    } finally { this.exporting.set(null); }
  }
}
