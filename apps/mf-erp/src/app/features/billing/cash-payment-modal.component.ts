import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canCollectPayments } from './finance-permissions';
import { Cuota, OrdenCobro, Recibo } from '../../core/graphql/models';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { errorMessage, fullName } from './billing-labels';
import { buildCashInput, computeChange, isCashPaymentValid } from './cash-payment';

/** Cash payment of one quota: asks CI/NIT + Razón Social and runs the critical mutation. */
@Component({
  selector: 'erp-cash-payment-modal',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, InputNumberModule, BolivianosPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Cobrar en Efectivo"
      [modal]="true"
      [visible]="true"
      (visibleChange)="!$event && close()"
      [style]="{ width: '28rem' }"
    >
      <div class="space-y-3 text-sm">
        <p class="text-slate-600">
          Cuota {{ cuota().numeroCuota }} de {{ orden().id }} ·
          <strong>{{ cuota().montoCuotaBs | bolivianos }}</strong>
        </p>
        <label class="block">
          <span class="mb-1 block text-slate-600">CI/NIT</span>
          <input pInputText class="w-full" [disabled]="pending()" name="ciNit" [(ngModel)]="ciNit" />
        </label>
        <label class="block">
          <span class="mb-1 block text-slate-600">Razón Social</span>
          <input pInputText class="w-full" name="razonSocial" [(ngModel)]="razonSocial" />
        </label>
        <label class="block">
          <span class="mb-1 block text-slate-600">Monto recibido (Bs)</span>
          <p-inputnumber
            class="w-full"
            styleClass="w-full"
            name="recibido"
            [disabled]="pending()"
            mode="decimal"
            [minFractionDigits]="2"
            [maxFractionDigits]="2"
            [min]="0"
            [(ngModel)]="received"
          />
        </label>
        <p class="rounded bg-slate-50 px-3 py-2" data-testid="cash-change">
          Cambio: <strong>{{ change() | bolivianos }}</strong>
        </p>
      </div>
      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="close()" />
        <p-button type="button" label="Confirmar cobro" [loading]="pending()" [disabled]="!valid() || pending()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class CashPaymentModal implements OnInit {
  private disposed = false;
  constructor() { inject(DestroyRef).onDestroy(() => { this.disposed = true; }); }
  protected close(): void {
    if (this.disposed) return;
    this.disposed = true; this.closed.emit();
  }
  readonly orden = input.required<OrdenCobro>();
  readonly cuota = input.required<Cuota>();
  readonly paid = output<Recibo>();
  /** Stored offline: the parent should just close and keep the quota as is. */
  readonly queued = output<void>();
  readonly closed = output<void>();

  private readonly auth = inject(AuthContextService);
  private readonly mutations = inject(CriticalMutationService);
  private readonly messages = inject(MessageService);
  /** One key per user action: a retry after an error reuses it. */
  // One action per open modal: same key for double clicks, new key if the user edits after a rejection.
  private readonly action = new IdempotentAction();

  protected readonly ciNit = signal('');
  protected readonly razonSocial = signal('');
  protected readonly received = signal(0);
  protected readonly pending = signal(false);
  protected readonly change = computed(() => computeChange(this.received(), this.cuota().montoCuotaBs));
  protected readonly valid = computed(() =>
    canCollectPayments(this.auth.roles()) && this.cuota().estado === 'PENDIENTE' && isCashPaymentValid({
      ciNit: this.ciNit(),
      razonSocial: this.razonSocial(),
      received: this.received(),
      due: this.cuota().montoCuotaBs,
    }),
  );

  ngOnInit(): void {
    this.ciNit.set(this.orden().paciente.ciNit);
    this.razonSocial.set(fullName(this.orden().paciente));
    this.received.set(this.cuota().montoCuotaBs);
  }

  protected async submit(): Promise<void> {
    if (this.disposed || this.pending()) return;
    try {
      this.auth.refresh();
      if (!this.valid()) return;
      const owner = this.auth.principalKey();
      if (!owner) throw new Error('Se requiere una sesión vigente.');
      this.pending.set(true);
      const result = await this.mutations.run(
        'CobrarCuotaEnEfectivo',
        {
          input: buildCashInput({
            cuotaId: this.cuota().id,
            usuarioCajeroId: this.auth.requireFinancialUserId(),
            ciNit: this.ciNit(),
            razonSocial: this.razonSocial(),
          }),
        },
        this.action,
      );
      this.auth.refresh();
      if (this.disposed || owner !== this.auth.principalKey() || !canCollectPayments(this.auth.roles())) return;
      if (result.status === 'queued') {
        this.messages.add({
          severity: 'info',
          summary: 'Sin conexión',
          detail: 'Guardado sin conexión: se sincronizará automáticamente',
        });
        this.queued.emit();
        return;
      }
      const receipt = result.data?.cobrarCuotaEnEfectivo;
      if (!receipt?.id) throw new Error('MS1 no confirmó el recibo del cobro.');
      this.paid.emit(receipt);
    } catch (error) {
      if (!this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo registrar el cobro', detail: errorMessage(error) });
    } finally {
      this.pending.set(false);
    }
  }
}
