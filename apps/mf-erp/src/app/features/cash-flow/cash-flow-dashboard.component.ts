import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canCollectPayments } from '../billing/finance-permissions';
import { OBTENER_FLUJO_CAJA } from '../../core/graphql/queries.graphql';
import { OBTENER_FLUJO_CAJA_SIN_PDF, ReadableCashFlow, ReadableMovement } from './cash-flow.graphql';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ReceiptPdfService } from '../../shared/components/receipt-preview-modal/receipt-pdf.service';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { errorMessage } from '../billing/billing-labels';
import { buildKpiCards, cashFlowBoundaries, currentMonthRange, isValidRange, toIsoDate } from './cash-flow.utils';
import { ExpenseModal } from './expense-modal.component';

/** Cash flow: KPIs (Ingresos, Egresos, Saldo Neto) and movements for a date range. */
@Component({
  selector: 'erp-cash-flow-dashboard',
  imports: [DatePipe, FormsModule, ButtonModule, DatePickerModule, TableModule, TagModule, BolivianosPipe, ExpenseModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 p-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold text-slate-800">Flujo de caja</h1>
          <p class="text-sm text-slate-500">Ingresos y egresos del período.</p>
        </div>
        <div class="flex flex-wrap items-end gap-3 text-sm">
          <label class="block">
            <span class="mb-1 block text-slate-600">Desde</span>
            <p-datepicker name="desde" dateFormat="dd/mm/yy" [(ngModel)]="from" (onSelect)="load()" />
          </label>
          <label class="block">
            <span class="mb-1 block text-slate-600">Hasta</span>
            <p-datepicker name="hasta" dateFormat="dd/mm/yy" [(ngModel)]="to" (onSelect)="load()" />
          </label>
          <p-button label="Actualizar" severity="secondary" [disabled]="!network.online() || loading()" (onClick)="load()" />
          @if (canCollect()) { <p-button label="Registrar egreso" (onClick)="expenseOpen.set(true)" /> }
        </div>
      </header>

      @if (!network.online()) {
        <p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sin conexión: el flujo de caja no está disponible. Aún puede registrar egresos; se sincronizarán automáticamente.
        </p>
      }
      @if (!rangeValid()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">La fecha inicial debe ser anterior o igual a la fecha final.</p>
      }

      <div class="grid gap-3 sm:grid-cols-3" data-testid="cash-kpis">
        @for (card of kpis(); track card.key) {
          <div class="rounded border border-slate-200 bg-white p-4">
            <p class="text-sm text-slate-500">{{ card.label }}</p>
            <p
              class="text-2xl font-semibold"
              [class.text-emerald-700]="card.key === 'ingresos'"
              [class.text-rose-700]="card.key === 'egresos' || card.negative"
              [class.text-slate-800]="card.key === 'saldo' && !card.negative"
            >
              {{ card.value | bolivianos }}
            </p>
          </div>
        }
      </div>

      <p-table [value]="movements()" [loading]="loading()" dataKey="id" size="small" [rowHover]="true">
        <ng-template #header>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Categoría</th>
            <th>Concepto</th>
            <th>Método</th>
            <th class="text-right">Monto</th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr [class.cursor-pointer]="canCollect() && !!row.recibo" [title]="canCollect() && row.recibo ? 'Abrir PDF del recibo (si está disponible)' : ''" (click)="openReceipt(row)">
            <td>{{ row.fechaMovimiento | date: 'dd/MM/yyyy' }}</td>
            <td><p-tag [value]="row.tipoMovimiento" [severity]="row.tipoMovimiento === 'INGRESO' ? 'success' : 'danger'" /></td>
            <td>{{ row.categoria }}</td>
            <td>{{ row.descripcion }}</td>
            <td>{{ methodLabel(row) }}</td>
            <td class="text-right" [class.text-rose-700]="row.tipoMovimiento === 'EGRESO'">{{ row.montoBs | bolivianos }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="6" class="py-6 text-center text-slate-500">No hay movimientos en el período seleccionado.</td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    @if (expenseOpen()) {
      <erp-expense-modal (saved)="load()" (closed)="expenseOpen.set(false)" />
    }
  `,
})
export class CashFlowDashboard implements OnInit {
  protected readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthContextService);
  protected readonly canCollect = computed(() => canCollectPayments(this.auth.roles()));
  private readonly apollo = inject(Apollo);
  private readonly messages = inject(MessageService);
  private readonly pdf = inject(ReceiptPdfService);

  private readonly initialRange = currentMonthRange();
  protected readonly from = signal<Date | null>(this.parseIso(this.initialRange.desde));
  protected readonly to = signal<Date | null>(this.parseIso(this.initialRange.hasta));
  protected readonly summary = signal<ReadableCashFlow>({ totalIngresosBs: 0, totalEgresosBs: 0, saldoNetoBs: 0, movimientos: [] });
  protected readonly movements = signal<ReadableMovement[]>([]);
  protected readonly loading = signal(false);
  protected readonly expenseOpen = signal(false);

  protected readonly range = computed(() => {
    const from = this.from();
    const to = this.to();
    return { desde: from ? toIsoDate(from) : '', hasta: to ? toIsoDate(to) : '' };
  });
  protected readonly rangeValid = computed(() => isValidRange(this.range()));
  protected readonly kpis = computed(() => buildKpiCards(this.summary()));

  ngOnInit(): void {
    void this.load();
  }

  protected methodLabel(movement: ReadableMovement): string {
    switch (movement.metodoPago) {
      case 'EFECTIVO':
        return 'Efectivo';
      case 'QR_PAGOFACIL':
        return 'QR PagoFácil';
      case 'TRANSFERENCIA':
        return 'Transferencia';
      default:
        return movement.metodoPago;
    }
  }

  protected async load(): Promise<void> {
    // The datepicker updates the model after onSelect: read it on the next tick.
    await Promise.resolve();
    const range = this.range();
    if (!isValidRange(range) || !this.network.isOnline()) {
      return;
    }
    this.loading.set(true);
    try {
      this.auth.refresh();
      const variables = cashFlowBoundaries(range);
      // Select the protected PDF field only for ADMIN/CAJERO; never send it then hide FORBIDDEN.
      const query = this.canCollect() ? OBTENER_FLUJO_CAJA : OBTENER_FLUJO_CAJA_SIN_PDF;
      const result = await firstValueFrom(this.apollo.query<{ obtenerFlujoCaja: ReadableCashFlow }>({ query, variables, fetchPolicy: 'network-only' }));
      if (result.data) {
        this.summary.set(result.data.obtenerFlujoCaja);
        this.movements.set(result.data.obtenerFlujoCaja.movimientos);
      }
    } catch (error) {
      this.messages.add({ severity: 'error', summary: 'No se pudo cargar el flujo de caja', detail: errorMessage(error) });
    } finally {
      this.loading.set(false);
    }
  }

  protected async openReceipt(movement: ReadableMovement): Promise<void> {
    if (!this.canCollect() || !movement.recibo) {
      return;
    }
    try {
      if (!movement.recibo.pdfUrlS3) {
        this.messages.add({ severity: 'info', summary: 'Recibo', detail: 'PDF pendiente o no disponible. Actualice el flujo de caja para consultar de nuevo.' });
        return;
      }
      await this.pdf.download(movement.recibo.pdfUrlS3);
    } catch (error) {
      this.messages.add({ severity: 'error', summary: 'No se pudo descargar el recibo', detail: errorMessage(error) });
    }
  }

  private parseIso(isoDate: string): Date {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}
