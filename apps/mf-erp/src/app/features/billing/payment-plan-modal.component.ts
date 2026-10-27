import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canManageOrders } from './finance-permissions';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../../core/graphql/graphql.provider';
import { OrdenCobro, TipoPago } from '../../core/graphql/models';
import { CONFIGURAR_PLAN_DE_PAGOS } from '../../core/graphql/mutations.graphql';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { toIsoDate } from '../cash-flow/cash-flow.utils';
import { errorMessage } from './billing-labels';
import { buildPaymentSchedule } from './payment-schedule';

const PAYMENT_TYPES: { label: string; value: TipoPago }[] = [
  { label: 'Al Contado', value: 'CONTADO' },
  { label: 'Al Crédito (Plan de Pagos)', value: 'CREDITO' },
];

/** Payment plan form: CONTADO (1 quota) vs CRÉDITO (N quotas) with a local schedule preview. */
@Component({
  selector: 'erp-payment-plan-modal',
  imports: [DatePipe, FormsModule, DialogModule, ButtonModule, SelectModule, InputNumberModule, DatePickerModule, TableModule, BolivianosPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Configurar plan de pagos"
      [modal]="true"
      [visible]="true"
      (visibleChange)="!$event && close()"
      [style]="{ width: '36rem' }"
    >
      <div class="space-y-4 text-sm">
        <p class="text-slate-600">
          {{ orden().id }} · Subtotal <strong>{{ orden().montoSubtotalBs | bolivianos }}</strong>
        </p>

        @if (!configured()) {
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-slate-600">Tipo de pago</span>
              <p-select [disabled]="pending()"
                styleClass="w-full"
                class="w-full"
                name="tipoPago"
                optionLabel="label"
                optionValue="value"
                [options]="paymentTypes"
                [(ngModel)]="tipoPago"
              />
            </label>
            @if (tipoPago() === 'CREDITO') {
              <label class="block">
                <span class="mb-1 block text-slate-600">Número de cuotas</span>
                <p-inputnumber [disabled]="pending()" styleClass="w-full" class="w-full" name="cuotas" [min]="2" [max]="60" [showButtons]="true" [(ngModel)]="installments" />
              </label>
            }
            <label class="block">
              <span class="mb-1 block text-slate-600">Descuento opcional (Bs)</span>
              <p-inputnumber [disabled]="pending()"
                styleClass="w-full"
                class="w-full"
                name="descuento"
                mode="decimal"
                [minFractionDigits]="2"
                [maxFractionDigits]="2"
                [min]="0"
                [max]="orden().montoSubtotalBs"
                [(ngModel)]="discount"
              />
            </label>
            <label class="block">
              <span class="mb-1 block text-slate-600">Fecha del primer vencimiento</span>
              <p-datepicker [disabled]="pending()" styleClass="w-full" class="w-full" name="primerVencimiento" dateFormat="dd/mm/yy" [(ngModel)]="firstDueDate" />
            </label>
            <label class="block">Intervalo entre cuotas (días)
              <p-inputnumber [disabled]="pending()" [min]="1" [maxFractionDigits]="0" [(ngModel)]="intervalDays" />
            </label>
          </div>
        }

        <div>
          <h3 class="mb-1 font-medium text-slate-700">
            {{ configured() ? 'Cronograma de cuotas' : 'Vista previa del cronograma' }}
          </h3>
          <p-table [value]="rows()" size="small">
            <ng-template #header>
              <tr>
                <th>Cuota</th>
                <th>Vencimiento</th>
                <th class="text-right">Monto</th>
              </tr>
            </ng-template>
            <ng-template #body let-row>
              <tr>
                <td>{{ row.numeroCuota }}</td>
                <td>{{ row.fechaVencimiento | date: 'dd/MM/yyyy' }}</td>
                <td class="text-right">{{ row.montoCuotaBs | bolivianos }}</td>
              </tr>
            </ng-template>
          </p-table>
          @if (!configured()) {
            <p class="mt-2 text-right text-slate-600">
              Monto neto: <strong>{{ preview().net | bolivianos }}</strong>
            </p>
          }
        </div>

        @if (!network.online() && !configured()) {
          <p class="rounded bg-amber-50 px-3 py-2 text-amber-800">Configurar el plan requiere conexión a internet.</p>
        }
      </div>
      <ng-template #footer>
        @if (configured()) {
          <p-button label="Listo" (onClick)="done()" />
        } @else {
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="close()" />
          <p-button type="button" label="Guardar plan" [loading]="pending()" [disabled]="!canSubmit()" (onClick)="submit()" />
        }
      </ng-template>
    </p-dialog>
  `,
})
export class PaymentPlanModal {
  private disposed = false;
  constructor() { inject(DestroyRef).onDestroy(() => { this.disposed = true; }); }
  protected close(): void {
    if (this.disposed) return;
    this.disposed = true; this.closed.emit();
  }
  readonly orden = input.required<OrdenCobro>();
  readonly configuredOrder = output<OrdenCobro>();
  readonly closed = output<void>();

  protected readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthContextService);
  private readonly action = new IdempotentAction();
  private owner: string | null = null;
  private readonly apollo = inject(Apollo);
  private readonly messages = inject(MessageService);

  protected readonly paymentTypes = PAYMENT_TYPES;
  protected readonly tipoPago = signal<TipoPago>('CONTADO');
  protected readonly installments = signal(3);
  protected readonly discount = signal(0);
  protected readonly intervalDays = signal(30);
  protected readonly firstDueDate = signal<Date | null>(new Date());
  protected readonly pending = signal(false);
  /** Order returned by MS1 once the plan is saved; its quotas are the authoritative schedule. */
  protected readonly configured = signal<OrdenCobro | null>(null);

  protected readonly preview = computed(() =>
    buildPaymentSchedule({
      total: this.orden().montoSubtotalBs,
      discount: this.discount() ?? 0,
      tipoPago: this.tipoPago(),
      installments: this.installments() ?? 2,
      firstDueDate: toIsoDate(this.firstDueDate() ?? new Date()),
      intervaloDias: this.intervalDays(),
    }),
  );
  protected readonly rows = computed(() => this.configured()?.cuotas ?? this.preview().cuotas);
  protected readonly canSubmit = computed(
    () => canManageOrders(this.auth.roles()) && this.orden().estado !== 'ANULADO' && !this.orden().cuotas.some(c => c.estado === 'PAGADA') && this.network.online() && !this.pending() && !!this.firstDueDate() && Number.isInteger(this.intervalDays()) && this.intervalDays() > 0 && Number.isFinite(this.discount()) && this.discount() >= 0 && this.discount() <= this.orden().montoSubtotalBs && (this.tipoPago() === 'CONTADO' || (Number.isInteger(this.installments()) && this.installments() >= 2)),
  );

  protected async submit(): Promise<void> {
    if (this.disposed || this.pending()) return;
    try {
      this.auth.refresh();
      const firstDueDate = this.firstDueDate();
      if (!this.canSubmit() || !firstDueDate) return;
      this.pending.set(true);
      const input = {
        ordenCobroId: this.orden().id,
        modalidadPago: this.tipoPago(),
        cantidadCuotas: this.preview().cuotas.length,
        descuentoBs: this.discount() ?? 0,
        fechaPrimeraCuota: toIsoDate(firstDueDate),
        intervaloDias: this.intervalDays(),
      };
      const owner = this.auth.principalKey();
      if (!owner) throw new Error('Se requiere una sesión vigente.');
      if (this.owner && this.owner !== owner) throw new Error('La sesión cambió; cierre el plan y vuelva a iniciarlo.');
      this.owner = owner;
      const result = await firstValueFrom(
        this.apollo.mutate({
          mutation: CONFIGURAR_PLAN_DE_PAGOS,
          variables: { input },
          context: { [IDEMPOTENCY_CONTEXT_KEY]: this.action.keyFor({ input }), [OWNER_CONTEXT_KEY]: owner },
        }),
      );
      this.auth.refresh();
      if (this.disposed || owner !== this.auth.principalKey() || !canManageOrders(this.auth.roles())) return;
      const updated = result.data?.configurarPlanDePagos;
      if (!updated || updated.id !== this.orden().id) throw new Error('MS1 no confirmó el plan de esta orden.');
      this.configured.set(updated);
      this.messages.add({ severity: 'success', summary: 'Plan de pagos', detail: 'El plan de pagos fue configurado.' });
    } catch (error) {
      if (!this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo configurar el plan', detail: errorMessage(error) });
    } finally {
      this.pending.set(false);
    }
  }

  protected done(): void {
    if (this.disposed) return;
    try {
      this.auth.refresh();
      const updated = this.configured();
      if (updated && this.owner === this.auth.principalKey() && canManageOrders(this.auth.roles())) this.configuredOrder.emit(updated);
    } catch { /* Closing never authorizes exposing data from an expired session. */ }
    this.close();
  }
}
