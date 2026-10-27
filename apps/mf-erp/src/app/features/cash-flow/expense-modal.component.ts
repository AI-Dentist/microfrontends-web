import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { LocalAiService } from '../../core/ai-local/local-ai.service';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canCollectPayments } from '../billing/finance-permissions';
import { CategoriaEgreso, MetodoPago } from '../../core/graphql/models';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { errorMessage } from '../billing/billing-labels';

const SUGGESTION_DEBOUNCE_MS = 400;

const CATEGORY_OPTIONS: { label: string; value: CategoriaEgreso }[] = [
  { label: 'Servicios básicos', value: 'SERVICIOS_BASICOS' },
  { label: 'Insumos', value: 'INSUMOS' },
  { label: 'Alquiler', value: 'ALQUILER' },
  { label: 'Otros', value: 'OTROS' },
];

/** "Registrar egreso": the category is suggested by the local AI while the user types. */
@Component({
  selector: 'erp-expense-modal',
  imports: [FormsModule, DialogModule, ButtonModule, SelectModule, InputNumberModule, TextareaModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Registrar egreso"
      [modal]="true"
      [visible]="true"
      (visibleChange)="!$event && close()"
      [style]="{ width: '30rem' }"
    >
      <div class="space-y-3 text-sm">
        <label class="block">
          <span class="mb-1 block text-slate-600">Concepto / descripción</span>
          <textarea
            pTextarea
            class="w-full"
            rows="3"
            name="concepto"
            [disabled]="pending()"
            [ngModel]="concepto()"
            (ngModelChange)="onConceptChange($event)"
          ></textarea>
        </label>
        <label class="block">
          <span class="mb-1 block text-slate-600">Categoría</span>
          <p-select
            styleClass="w-full"
            class="w-full"
            name="categoria"
            [disabled]="pending()"
            optionLabel="label"
            optionValue="value"
            placeholder="Seleccione una categoría"
            [options]="categories"
            [ngModel]="categoria()"
            (ngModelChange)="onCategoryChange($event)"
          />
          @if (hint(); as text) {
            <small class="mt-1 block text-teal-700" data-testid="category-hint">{{ text }}</small>
          }
        </label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-slate-600">Monto (Bs)</span>
            <p-inputnumber
              styleClass="w-full"
              class="w-full"
              name="monto"
              [disabled]="pending()"
              mode="decimal"
              [minFractionDigits]="2"
              [maxFractionDigits]="2"
              [min]="0"
              [(ngModel)]="monto"
            />
          </label>
          <label class="block">
            <span class="mb-1 block text-slate-600">Método de pago</span>
            <p-select [disabled]="pending()" [options]="methods" [(ngModel)]="method" />
          </label>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="close()" />
        <p-button type="button" label="Registrar egreso" [loading]="pending()" [disabled]="!valid() || pending()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ExpenseModal {
  readonly saved = output<void>();
  readonly closed = output<void>();

  private readonly auth = inject(AuthContextService);
  private readonly ai = inject(LocalAiService);
  private readonly mutations = inject(CriticalMutationService);
  private readonly messages = inject(MessageService);
  /** One key per user action: a retry after an error reuses it. */
  // One action per open modal: same key for double clicks, new key if the user edits after a rejection.
  private readonly action = new IdempotentAction();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestionRequest = 0;
  private disposed = false;

  protected readonly categories = CATEGORY_OPTIONS;
  protected readonly concepto = signal('');
  protected readonly categoria = signal<CategoriaEgreso | null>(null);
  protected readonly monto = signal<number | null>(null);
  protected readonly methods: MetodoPago[] = ['EFECTIVO', 'TRANSFERENCIA', 'QR_PAGOFACIL'];
  protected readonly method = signal<MetodoPago>('EFECTIVO');
  protected readonly pending = signal(false);
  protected readonly hint = signal<string | null>(null);
  /** Once the user picks a category by hand the AI stops overriding it. */
  private readonly manualCategory = signal(false);

  protected readonly valid = computed(
    () => canCollectPayments(this.auth.roles()) && !!this.concepto().trim() && !!this.categoria() && (this.categoria()?.length ?? 0) <= 50 && Number.isFinite(this.monto()) && (this.monto() ?? 0) > 0 && this.methods.includes(this.method()),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true; this.suggestionRequest++;
      if (this.debounceTimer !== null) {
        clearTimeout(this.debounceTimer);
      }
    });
  }

  protected onConceptChange(value: string): void {
    if (this.pending() || this.disposed) return;
    const request = ++this.suggestionRequest;
    this.hint.set(null);
    if (!this.manualCategory()) this.categoria.set(null);
    this.concepto.set(value ?? '');
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    if (this.manualCategory() || !this.concepto().trim()) {
      return;
    }
    this.debounceTimer = setTimeout(() => void this.suggest(request), SUGGESTION_DEBOUNCE_MS);
  }

  protected onCategoryChange(value: CategoriaEgreso | null): void {
    this.suggestionRequest++;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.categoria.set(value);
    this.manualCategory.set(true);
    this.hint.set(null);
  }

  protected close(): void {
    if (this.disposed) return;
    this.disposed = true; this.suggestionRequest++;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.closed.emit();
  }

  private async suggest(request: number): Promise<void> {
    if (this.disposed || this.pending() || this.manualCategory() || request !== this.suggestionRequest) return;
    const owner = this.auth.principalKey();
    const current = () => !this.disposed && !this.pending() && !this.manualCategory() &&
      request === this.suggestionRequest && owner === this.auth.principalKey();
    this.hint.set('Procesando IA local…');
    try {
      const suggestion = await this.ai.suggestExpenseCategory(this.concepto());
      if (!current()) return;
      if (suggestion.source !== 'local-ai') throw new Error('Neural inference unavailable');
      this.categoria.set(suggestion.category);
      this.hint.set('Sugerido por IA local');
    } catch {
      if (current()) this.hint.set('IA local no disponible. Seleccione una categoría manualmente.');
    }
  }

  protected async submit(): Promise<void> {
    if (this.disposed) return;
    this.auth.refresh();
    const categoria = this.categoria();
    if (!this.valid() || this.pending() || !categoria) {
      return;
    }
    const owner = this.auth.principalKey();
    this.pending.set(true);
    this.suggestionRequest++; this.hint.set(null);
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    try {
      const result = await this.mutations.run(
        'RegistrarEgresoCaja',
        { input: { usuarioCajeroId: this.auth.requireFinancialUserId(), descripcion: this.concepto().trim(), categoria, metodoPago: this.method(), montoBs: this.monto() ?? 0 } },
        this.action,
      );
      this.auth.refresh();
      if (this.disposed || owner !== this.auth.principalKey() || !canCollectPayments(this.auth.roles())) return;
      if (result.status === 'completed' && !result.data?.registrarEgresoCaja?.id) throw new Error('MS1 no confirmó el egreso.');
      if (result.status === 'queued') {
        this.messages.add({
          severity: 'info',
          summary: 'Sin conexión',
          detail: 'Guardado sin conexión: se sincronizará automáticamente',
        });
      } else {
        this.messages.add({ severity: 'success', summary: 'Egreso registrado', detail: this.concepto().trim() });
      }
      this.saved.emit();
      this.close();
    } catch (error) {
      if (!this.disposed) this.messages.add({ severity: 'error', summary: 'No se pudo registrar el egreso', detail: errorMessage(error) });
    } finally {
      this.pending.set(false);
    }
  }
}
