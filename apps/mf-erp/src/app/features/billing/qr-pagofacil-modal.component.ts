import { ChangeDetectionStrategy, Component, DestroyRef, effect, untracked, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { environment } from '../../../environments/environment';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../../core/graphql/graphql.provider';
import { Cuota, OrdenCobro, Recibo, TransaccionQr } from '../../core/graphql/models';
import { GENERAR_QR_PAGOFACIL, SIMULAR_CONFIRMACION_QR_DEV } from '../../core/graphql/mutations.graphql';
import { OBTENER_ORDEN_COBRO_DETALLE } from '../../core/graphql/queries.graphql';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { errorMessage, fullName } from './billing-labels';
import { canCollectPayments } from './finance-permissions';

/** QR confirmation is observed on the matching quota, not an invented transaction-status endpoint. */
@Component({
  selector: 'erp-qr-pagofacil-modal',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, BolivianosPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog header="Cobrar con QR PagoFácil" [modal]="true" [visible]="true"
      (visibleChange)="!$event && close()" [style]="{ width: '28rem' }">
      <div class="space-y-3 text-sm">
        <p>Cuota {{ cuota().numeroCuota }} · {{ cuota().montoCuotaBs | bolivianos }}</p>
        @if (!qr()) {
          <label class="block">CI/NIT <input pInputText class="w-full" [disabled]="busy()" [(ngModel)]="ciNit" /></label>
          <label class="block">Razón social <input pInputText class="w-full" [disabled]="busy()" [(ngModel)]="razonSocial" /></label>
        }
        @if (!network.online()) { <p data-testid="qr-offline">El QR requiere conexión a internet.</p> }
        @if (qr(); as q) {
          <img class="mx-auto size-56" alt="Código QR de PagoFácil" [src]="qrImageSrc()" />
          <p data-testid="qr-state">Estado: {{ q.estado }}</p>
          @if (!confirmed()) {
            <p data-testid="qr-countdown">{{ countdown() }}</p>
            @if (expired()) { <p role="status">QR vencido. Verifique el estado antes de iniciar otro cobro.</p> }
          }
        }
        @if (confirmed()) {
          <p data-testid="qr-paid">Pago confirmado. Consulte el recibo en el flujo de caja si no está disponible aquí.</p>
        }
      </div>
      <ng-template #footer>
        <p-button type="button" label="Cerrar" severity="secondary" (onClick)="close()" />
        @if (canCollect() && !confirmed()) {
          @if (!qr()) {
            <p-button type="button" label="Generar QR" [loading]="busy()" [disabled]="!canGenerate()" (onClick)="generate()" />
          } @else if (qr()?.estado === 'GENERADO' && pendingQuota()) {
            <p-button type="button" label="Verificar pago" [loading]="checking()" [disabled]="!network.online() || busy()" (onClick)="check(true)" />
            @if (devMode) {
              <p-button type="button" label="[Simular Pago Confirmado (Dev)]" severity="warn"
                [loading]="busy()" [disabled]="!network.online() || busy() || checking() || expired()" (onClick)="simulate()" />
            }
          }
        }
      </ng-template>
    </p-dialog>
  `,
})
export class QrPagofacilModal implements OnInit {
  readonly orden = input.required<OrdenCobro>();
  readonly cuota = input.required<Cuota>();
  readonly paid = output<Recibo | null>();
  readonly closed = output<void>();
  protected readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthContextService);
  private readonly apollo = inject(Apollo);
  private readonly messages = inject(MessageService);
  private readonly generateAction = new IdempotentAction();
  private readonly simulateAction = new IdempotentAction();
  protected readonly devMode = !environment.production;
  protected readonly qr = signal<TransaccionQr | null>(null);
  protected readonly ciNit = signal('');
  protected readonly razonSocial = signal('');
  protected readonly busy = signal(false);
  protected readonly checking = signal(false);
  protected readonly confirmed = signal(false);
  protected readonly pendingQuota = signal(true);
  protected readonly canCollect = computed(() => canCollectPayments(this.auth.roles()));
  protected readonly canGenerate = computed(() => this.canCollect() && this.network.online() && !this.busy() && this.pendingQuota() && !!this.ciNit().trim() && !!this.razonSocial().trim());
  protected readonly qrImageSrc = computed(() => {
    const image = this.qr()?.qrImagenBase64 ?? '';
    return image.startsWith('data:') ? image : `data:image/png;base64,${image}`;
  });
  private readonly now = signal(Date.now());
  protected readonly remainingSeconds = computed(() => {
    const expiry = this.qr()?.fechaExpiracion;
    const deadline = expiry ? Date.parse(expiry) : NaN;
    return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - this.now()) / 1000)) : null;
  });
  protected readonly expired = computed(() => this.remainingSeconds() === 0);
  protected readonly countdown = computed(() => {
    const seconds = this.remainingSeconds();
    return seconds === null ? 'Vencimiento no informado por MS1.' :
      `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  });
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private owner: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.disposed = true; this.stopTimers(); });
    effect(() => {
      const principal = this.auth.principalKey();
      const allowed = this.canCollect();
      if (this.owner && (principal !== this.owner || !allowed)) untracked(() => this.invalidateOwner());
    });
  }
  ngOnInit(): void {
    this.ciNit.set(this.orden().paciente.ciNit);
    this.razonSocial.set(fullName(this.orden().paciente));
    this.pendingQuota.set(this.cuota().estado === 'PENDIENTE');
  }
  protected close(): void {
    this.disposed = true;
    this.stopTimers();
    this.closed.emit();
  }
  private requireOwner(): void {
    this.auth.requireFinancialUserId();
    const owner = this.auth.principalKey();
    if (!owner) throw new Error('Se requiere una sesión vigente.');
    if (this.owner && this.owner !== owner) throw new Error('La sesión cambió; cierre el cobro y vuelva a iniciarlo.');
    this.owner = owner;
  }
  protected async generate(): Promise<void> {
    if (this.disposed) return;
    try {
      this.auth.refresh();
      if (!this.canGenerate()) return;
      this.busy.set(true);
      this.requireOwner();
      const variables = { cuotaId: this.cuota().id, ciNitCliente: this.ciNit().trim(), razonSocialCliente: this.razonSocial().trim() };
      const result = await firstValueFrom(this.apollo.mutate({ mutation: GENERAR_QR_PAGOFACIL, variables,
        context: { [IDEMPOTENCY_CONTEXT_KEY]: this.generateAction.keyFor(variables), [OWNER_CONTEXT_KEY]: this.owner } }));
      if (!this.currentOwner()) return;
      const generated = result.data?.generarQrPagoFacil;
      if (!generated || generated.cuotaId !== this.cuota().id) throw new Error('MS1 no confirmó el QR de esta cuota.');
      this.qr.set(generated);
      if (generated.estado === 'GENERADO') {
        this.startClock();
        if (!this.expired()) this.startPolling();
      } else if (generated.estado === 'CONFIRMADO') await this.check();
    } catch (error) {
      if (!this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo generar el QR', detail: errorMessage(error) });
    } finally { this.busy.set(false); }
  }
  protected async check(manual = false): Promise<void> {
    if (this.disposed || !this.qr() || this.checking() || this.confirmed() || !this.network.isOnline()) return;
    this.checking.set(true);
    try {
      this.requireOwner();
      const result = await firstValueFrom(this.apollo.query({ query: OBTENER_ORDEN_COBRO_DETALLE, variables: { id: this.orden().id }, fetchPolicy: 'network-only', context: { [OWNER_CONTEXT_KEY]: this.owner } }));
      if (!this.currentOwner()) return;
      const quota = result.data?.obtenerOrdenCobroDetalle?.cuotas.find(c => c.id === this.cuota().id);
      // Missing, cancelled, or paid quotas must never leave a poll running.
      this.pendingQuota.set(quota?.estado === 'PENDIENTE');
      if (!this.pendingQuota()) this.stopTimers();
      if (quota?.estado === 'PAGADA') this.confirm(null, quota.fechaPago);
    } catch (error) {
      this.stopPolling();
      if (manual && !this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo verificar el pago', detail: errorMessage(error) });
    } finally { this.checking.set(false); }
  }
  protected async simulate(): Promise<void> {
    if (this.disposed) return;
    try {
      this.auth.refresh();
      const current = this.qr();
      if (!this.devMode || !this.canCollect() || !this.network.isOnline() || !current ||
          current.estado !== 'GENERADO' || !this.pendingQuota() || this.busy() || this.checking() || this.expired()) return;
      this.busy.set(true);
      this.requireOwner();
      const variables = { pagofacilTransactionId: current.pagofacilTransactionId };
      const result = await firstValueFrom(this.apollo.mutate({ mutation: SIMULAR_CONFIRMACION_QR_DEV, variables,
        context: { [IDEMPOTENCY_CONTEXT_KEY]: this.simulateAction.keyFor(variables), [OWNER_CONTEXT_KEY]: this.owner } }));
      if (!this.currentOwner()) return;
      const receipt = result.data?.simularConfirmacionQrDev;
      if (!receipt?.id) throw new Error('MS1 no confirmó el recibo.');
      this.confirm(receipt);
    } catch (error) {
      if (!this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo simular la confirmación', detail: errorMessage(error) });
    } finally { this.busy.set(false); }
  }
  private confirm(receipt: Recibo | null, paidAt?: string | null): void {
    if (this.confirmed() || this.disposed) return;
    this.confirmed.set(true);
    this.pendingQuota.set(false);
    this.stopTimers();
    this.qr.update(q => q ? { ...q, estado: 'CONFIRMADO' } : null);
    this.messages.add({ severity: 'success', summary: 'Pago confirmado', detail: receipt
      ? (receipt.enviadoWhatsapp ? 'Recibo disponible. WhatsApp enviado.' : 'Recibo disponible. WhatsApp no enviado.')
      : `Cuota pagada${paidAt ? ` (${paidAt})` : ''}. Recibo no disponible aquí; consulte el flujo de caja.` });
    // A paid quota is evidence of payment only: never manufacture a receipt.
    this.paid.emit(receipt);
  }
  private currentOwner(): boolean {
    if (this.disposed) return false;
    try {
      this.auth.refresh();
      if (this.owner === this.auth.principalKey() && this.canCollect()) return true;
    } catch { /* An expired/invalid token must not publish prior-session payment data. */ }
    this.invalidateOwner();
    return false;
  }
  private invalidateOwner(): void {
    if (this.disposed) return;
    this.qr.set(null); this.ciNit.set(''); this.razonSocial.set('');
    this.close();
  }
  private startClock(): void {
    this.now.set(Date.now());
    if (this.remainingSeconds() === null || this.expired()) return;
    this.clockTimer = setInterval(() => {
      this.now.set(Date.now());
      if (this.expired()) this.stopTimers();
    }, 1000);
  }
  private stopTimers(): void {
    this.stopPolling();
    if (this.clockTimer !== null) { clearInterval(this.clockTimer); this.clockTimer = null; }
  }
  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.disposed && !this.expired() && this.pendingQuota() && this.qr()?.estado === 'GENERADO') {
        if (!this.busy()) void this.check();
      } else this.stopPolling();
    }, 5000);
  }
  private stopPolling(): void {
    if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }
}
