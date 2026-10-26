import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canCollectPayments, canManageOrders } from './finance-permissions';
import { Cuota, OrdenCobro, Recibo } from '../../core/graphql/models';
import { OBTENER_ORDEN_COBRO_DETALLE, LISTAR_ORDENES_COBRO } from '../../core/graphql/queries.graphql';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ReceiptPreviewModal } from '../../shared/components/receipt-preview-modal/receipt-preview-modal.component';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { CUOTA_STATUS_SEVERITY, ORDER_STATUS_SEVERITY, errorMessage, fullName } from './billing-labels';
import { CashPaymentModal } from './cash-payment-modal.component';
import { ManualOrderModal } from './manual-order-modal.component';
import { PaymentPlanModal } from './payment-plan-modal.component';
import { QrPagofacilModal } from './qr-pagofacil-modal.component';

/** Inbox of PENDIENTE charge orders (cached offline) with detail, payment plan and quota collection. */
@Component({
  selector: 'erp-billing-inbox',
  imports: [
    DatePipe,
    ButtonModule,
    TableModule,
    TagModule,
    BolivianosPipe,
    CashPaymentModal,
    QrPagofacilModal,
    PaymentPlanModal,
    ManualOrderModal,
    ReceiptPreviewModal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-xl font-semibold text-slate-800">Órdenes de cobro</h1>
          <p class="text-sm text-slate-500">Órdenes pendientes de pago.</p>
        </div>
        @if (canManage()) { <p-button label="Nueva orden manual" (onClick)="manualOpen.set(true)" /> }
      </header>

      @if (fromCache()) {
        <p class="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="billing-cache-notice">
          Sin conexión: mostrando las órdenes guardadas en este equipo.
        </p>
      }

      <p-table [value]="orders()" [loading]="loading()" dataKey="id" size="small" [rowHover]="true">
        <ng-template #header>
          <tr>
            <th>Paciente</th>
            <th>Concepto</th>
            <th class="text-right">Monto neto</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ patientName(row) }}</td>
            <td>{{ orderDescription(row) }}</td>
            <td class="text-right">{{ row.montoTotalBs | bolivianos }}</td>
            <td><p-tag [value]="row.estado" [severity]="orderSeverity[row.estado]" /></td>
            <td class="text-right">
              <p-button label="Abrir" size="small" [text]="true" (onClick)="open(row)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="5" class="py-6 text-center text-slate-500">No hay órdenes de cobro pendientes.</td>
          </tr>
        </ng-template>
      </p-table>

      @if (selected(); as order) {
        <article class="space-y-3 rounded border border-slate-200 bg-white p-4" data-testid="order-detail">
          <header class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 class="text-lg font-medium text-slate-800">{{ order.id }} · {{ orderDescription(order) }}</h2>
              <p class="text-sm text-slate-500">
                {{ patientName(order) }} · CI/NIT {{ order.paciente.ciNit }} · {{ order.createdAt | date: 'dd/MM/yyyy' }}
              </p>
            </div>
            <div class="flex gap-2">
              @if (canManage()) {
              <p-button
                label="Configurar plan de pagos"
                severity="secondary"
                size="small"
                [disabled]="!network.online() || hasPaidCuota() || order.estado === 'ANULADO'"
                (onClick)="planOpen.set(true)"
              />
              }
              <p-button label="Cerrar detalle" size="small" [text]="true" (onClick)="selected.set(null)" />
            </div>
          </header>

          <dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt class="text-slate-500">Total</dt><dd>{{ order.montoSubtotalBs | bolivianos }}</dd></div>
            <div><dt class="text-slate-500">Descuento</dt><dd>{{ order.descuentoBs | bolivianos }}</dd></div>
            <div><dt class="text-slate-500">Monto neto</dt><dd class="font-semibold">{{ order.montoTotalBs | bolivianos }}</dd></div>
            <div><dt class="text-slate-500">Tipo de pago</dt><dd>{{ order.modalidadPago }}</dd></div>
            <div><dt class="text-slate-500">Saldo pendiente</dt><dd>{{ order.saldoPendienteBs | bolivianos }}</dd></div>
          </dl>

          @if (!network.online()) {
            <p class="text-sm text-amber-700">
              Sin conexión: el cobro en efectivo se guarda y sincroniza después; el QR PagoFácil y el plan de pagos requieren conexión.
            </p>
          }

          <p-table [value]="order.cuotas" size="small">
            <ng-template #header>
              <tr>
                <th>Cuota</th>
                <th>Vencimiento</th>
                <th class="text-right">Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </ng-template>
            <ng-template #body let-cuota>
              <tr>
                <td>{{ cuota.numeroCuota }}</td>
                <td>{{ cuota.fechaVencimiento | date: 'dd/MM/yyyy' }}</td>
                <td class="text-right">{{ cuota.montoCuotaBs | bolivianos }}</td>
                <td><p-tag [value]="cuota.estado" [severity]="cuotaSeverity[cuota.estado]" /></td>
                <td class="space-x-2 text-right">
                  @if (canCollect() && cuota.estado === 'PENDIENTE') {
                    <p-button label="[Cobrar en Efectivo]" size="small" (onClick)="cashCuota.set(cuota)" />
                    <p-button
                      label="[Cobrar con QR PagoFácil]"
                      size="small"
                      severity="secondary"
                      [disabled]="!network.online()"
                      [title]="network.online() ? '' : 'El QR requiere conexión'"
                      (onClick)="qrCuota.set(cuota)"
                    />
                  }
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              <tr>
                <td colspan="5" class="py-4 text-center text-slate-500">
                  Esta orden aún no tiene cuotas. Configure el plan de pagos.
                </td>
              </tr>
            </ng-template>
          </p-table>
        </article>
      }
    </section>

    @if (manualOpen()) {
      <erp-manual-order-modal (created)="onManualCreated()" (queued)="manualOpen.set(false)" (closed)="manualOpen.set(false)" />
    }
    @if (planOpen() && selected(); as order) {
      <erp-payment-plan-modal [orden]="order" (configuredOrder)="onPlanConfigured($event)" (closed)="planOpen.set(false)" />
    }
    @if (selected(); as order) {
      @if (cashCuota(); as cuota) {
        <erp-cash-payment-modal
          [orden]="order"
          [cuota]="cuota"
          (paid)="onCashPaid($event)"
          (queued)="cashCuota.set(null)"
          (closed)="cashCuota.set(null)"
        />
      }
      @if (qrCuota(); as cuota) {
        <erp-qr-pagofacil-modal [orden]="order" [cuota]="cuota" (paid)="onQrPaid($event)" (closed)="qrCuota.set(null)" />
      }
    }
    <erp-receipt-preview-modal [recibo]="receipt()" (closed)="receipt.set(null)" />
  `,
})
export class BillingInbox implements OnInit {
  protected readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthContextService);
  protected readonly canManage = computed(() => canManageOrders(this.auth.roles()));
  protected readonly canCollect = computed(() => canCollectPayments(this.auth.roles()));
  private readonly apollo = inject(Apollo);
  private readonly messages = inject(MessageService);

  protected readonly orderSeverity = ORDER_STATUS_SEVERITY;
  protected readonly cuotaSeverity = CUOTA_STATUS_SEVERITY;

  protected readonly orders = signal<OrdenCobro[]>([]);
  protected readonly loading = signal(false);
  protected readonly fromCache = signal(false);
  protected readonly selected = signal<OrdenCobro | null>(null);
  protected readonly manualOpen = signal(false);
  protected readonly planOpen = signal(false);
  protected readonly cashCuota = signal<Cuota | null>(null);
  protected readonly qrCuota = signal<Cuota | null>(null);
  protected readonly receipt = signal<Recibo | null>(null);
  protected readonly hasPaidCuota = computed(() => this.selected()?.cuotas.some((cuota) => cuota.estado === 'PAGADA') ?? false);

  constructor() {
    this.network.onReconnect(() => void this.load());
  }

  ngOnInit(): void {
    void this.load();
  }

  protected orderDescription(order: OrdenCobro): string {
    return order.items.map(item => `${item.servicio.nombre} × ${item.cantidad}`).join(', ');
  }

  protected patientName(order: OrdenCobro): string {
    return fullName(order.paciente);
  }

  protected open(order: OrdenCobro): void {
    this.selected.set(order);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      if (this.network.isOnline()) {
        try {
          const result = await firstValueFrom(
            this.apollo.query({ query: LISTAR_ORDENES_COBRO, variables: { estado: 'PENDIENTE' }, fetchPolicy: 'network-only' }),
          );
          const orders = result.data?.listarOrdenesCobro ?? [];
          this.orders.set(orders);
          this.fromCache.set(false);
          await this.cacheOrders(orders);
          this.refreshSelected(orders);
          return;
        } catch (error) {
          this.messages.add({ severity: 'warn', summary: 'No se pudo cargar desde el servidor', detail: errorMessage(error) });
        }
      }
      const cached: OrdenCobro[] = await erpLocalDb().ordenesCobro.where('estado').equals('PENDIENTE').toArray();
      this.orders.set(cached);
      this.fromCache.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected onManualCreated(): void {
    void this.load();
  }

  protected onPlanConfigured(order: OrdenCobro): void {
    this.selected.set(order);
    void this.load();
  }

  protected onCashPaid(receipt: Recibo): void {
    this.cashCuota.set(null);
    this.receipt.set(receipt);
    void this.refreshSelectedOrder();
  }

  protected onQrPaid(receipt: Recibo | null): void {
    this.qrCuota.set(null);
    this.receipt.set(receipt);
    void this.refreshSelectedOrder();
  }

  private async cacheOrders(orders: OrdenCobro[]): Promise<void> {
    const db = erpLocalDb();
    try {
      await db.transaction('rw', db.ordenesCobro, async () => {
        await db.ordenesCobro.where('estado').equals('PENDIENTE').delete();
        await db.ordenesCobro.bulkPut(orders.map((order) => ({ ...order, pacienteId: order.paciente.id })));
      });
    } catch {
      // The cache is best effort: a storage failure must not break the online flow.
    }
  }

  /** Keeps the open detail in sync with the freshly loaded list. */
  private refreshSelected(orders: OrdenCobro[]): void {
    const current = this.selected();
    if (current) {
      const fresh = orders.find((order) => order.id === current.id);
      if (fresh) {
        this.selected.set(fresh);
      }
    }
  }

  private async refreshSelectedOrder(): Promise<void> {
    const current = this.selected();
    if (!current || !this.network.isOnline()) {
      return;
    }
    try {
      const result = await firstValueFrom(
        this.apollo.query({ query: OBTENER_ORDEN_COBRO_DETALLE, variables: { id: current.id }, fetchPolicy: 'network-only' }),
      );
      const fresh = result.data?.obtenerOrdenCobroDetalle;
      if (fresh) {
        this.selected.set(fresh);
      }
    } catch (error) {
      this.messages.add({ severity: 'warn', summary: 'No se pudo actualizar la orden', detail: errorMessage(error) });
    }
    await this.load();
  }
}
