import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { canManageOrders } from './finance-permissions';
import { isManualOrderValid, tariffPreview } from './manual-order';
import { Odontologo, OrdenCobro, OrdenCobroItemInput, Paciente, ServicioOdontologico } from '../../core/graphql/models';
import { LISTAR_ODONTOLOGOS, LISTAR_PACIENTES, LISTAR_SERVICIOS_ODONTOLOGICOS } from '../../core/graphql/queries.graphql';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { errorMessage, fullName } from './billing-labels';

/** "Nueva orden manual": creates a charge order through the critical (offline-safe) mutation. */
@Component({
  selector: 'erp-manual-order-modal',
  imports: [FormsModule, DialogModule, ButtonModule, SelectModule, MultiSelectModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      header="Nueva orden manual"
      [modal]="true"
      [visible]="true"
      (visibleChange)="!$event && closed.emit()"
      [style]="{ width: '30rem' }"
    >
      <div class="space-y-3 text-sm">
        <label class="block">
          <span class="mb-1 block text-slate-600">Paciente</span>
          <p-select
            styleClass="w-full"
            class="w-full"
            name="paciente"
            optionLabel="label"
            optionValue="id"
            [filter]="true"
            filterBy="label"
            placeholder="Seleccione un paciente"
            [options]="patientOptions()"
            [(ngModel)]="pacienteId"
          />
        </label>
        <label class="block">
          <span class="mb-1 block text-slate-600">Servicios (obligatorio)</span>
          <p-multiselect
            styleClass="w-full"
            class="w-full"
            name="servicios"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Seleccione servicios"
            [options]="services()"
            [ngModel]="servicioIds()"
            (ngModelChange)="onServicesChange($event)"
          />
        </label>
        @for (item of items(); track item.servicioId) {
          <div class="grid grid-cols-2 gap-2">
            <label>{{ serviceName(item.servicioId) }} · Cantidad
              <p-inputnumber [min]="1" [maxFractionDigits]="0" [ngModel]="item.cantidad" (ngModelChange)="updateItem(item.servicioId, { cantidad: $event })" />
            </label>
            <label>Pieza dental (opcional)
              <input pInputText [ngModel]="item.piezaDental" (ngModelChange)="updateItem(item.servicioId, { piezaDental: $event })" />
            </label>
          </div>
        }
        <label class="block">Odontólogo (opcional)
          <p-select styleClass="w-full" [options]="doctorOptions()" optionLabel="label" optionValue="id" [showClear]="true" [(ngModel)]="odontologoId" />
        </label>
        <label class="block">Observaciones (opcional)
          <input pInputText class="w-full" [(ngModel)]="observaciones" />
        </label>
        <label class="block">Descuento (Bs)
          <p-inputnumber [min]="0" [maxFractionDigits]="2" [(ngModel)]="discount" />
        </label>
        <p>Tarifa estimada: {{ previewTotal() }} Bs. El servidor determina el precio final.</p>
      </div>
      <ng-template #footer>
        <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="closed.emit()" />
        <p-button type="button" label="Crear orden" [loading]="pending()" [disabled]="!valid() || pending()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
})
export class ManualOrderModal implements OnInit {
  readonly created = output<OrdenCobro>();
  readonly queued = output<void>();
  readonly closed = output<void>();

  private readonly auth = inject(AuthContextService);
  private readonly apollo = inject(Apollo);
  private readonly network = inject(NetworkStatusService);
  private readonly mutations = inject(CriticalMutationService);
  private readonly messages = inject(MessageService);
  /** One key per user action: a retry after an error reuses it. */
  // One action per open modal: same key for double clicks, new key if the user edits after a rejection.
  private readonly action = new IdempotentAction();

  protected readonly patients = signal<Paciente[]>([]);
  protected readonly services = signal<ServicioOdontologico[]>([]);
  protected readonly patientOptions = computed(() =>
    this.patients().map((patient) => ({ id: patient.id, label: `${fullName(patient)} · ${patient.ciNit}` })),
  );

  protected readonly pacienteId = signal<string | null>(null);
  protected readonly servicioIds = signal<string[]>([]);
  protected readonly items = signal<OrdenCobroItemInput[]>([]);
  protected readonly doctors = signal<Odontologo[]>([]);
  protected readonly doctorOptions = computed(() => this.doctors().map(doctor => ({ id: doctor.id, label: fullName(doctor) })));
  protected readonly odontologoId = signal<string | null>(null);
  protected readonly observaciones = signal('');
  protected readonly discount = signal(0);
  protected readonly previewTotal = computed(() => Math.max(0, tariffPreview(this.items(), this.services()) - this.discount()));
  protected readonly pending = signal(false);
  protected readonly valid = computed(
    () => canManageOrders(this.auth.roles()) && isManualOrderValid(this.pacienteId(), this.items()) && Number.isFinite(this.discount()) && this.discount() >= 0,
  );

  async ngOnInit(): Promise<void> {
    const db = erpLocalDb();
    const [cachedPatients, cachedServices] = await Promise.all([
      db.pacientes.toArray().catch(() => [] as Paciente[]),
      db.serviciosOdontologicos.toArray().catch(() => [] as ServicioOdontologico[]),
    ]);
    this.patients.set(cachedPatients);
    this.services.set(cachedServices);
    if (!this.network.isOnline()) {
      return;
    }
    try {
      const doctors = await firstValueFrom(this.apollo.query({ query: LISTAR_ODONTOLOGOS, variables: { soloActivos: true } }));
      this.doctors.set(doctors.data?.listarOdontologos ?? []);
      if (cachedPatients.length === 0) {
        const result = await firstValueFrom(this.apollo.query({ query: LISTAR_PACIENTES, variables: {} }));
        this.patients.set(result.data?.listarPacientes ?? []);
      }
      if (cachedServices.length === 0) {
        const result = await firstValueFrom(this.apollo.query({ query: LISTAR_SERVICIOS_ODONTOLOGICOS, variables: {} }));
        this.services.set(result.data?.listarServiciosOdontologicos ?? []);
      }
    } catch (error) {
      this.messages.add({ severity: 'warn', summary: 'Catálogos no disponibles', detail: errorMessage(error) });
    }
  }

  protected onServicesChange(ids: string[]): void {
    this.servicioIds.set(ids ?? []);
    this.items.update(current => this.servicioIds().map(servicioId => current.find(item => item.servicioId === servicioId) ?? { servicioId, cantidad: 1 }));
  }

  protected serviceName(id: string): string {
    return this.services().find(service => service.id === id)?.nombre ?? id;
  }

  protected updateItem(id: string, patch: Partial<OrdenCobroItemInput>): void {
    this.items.update(items => items.map(item => item.servicioId === id ? { ...item, ...patch } : item));
  }

  protected async submit(): Promise<void> {
    this.auth.refresh();
    const pacienteId = this.pacienteId();
    if (!this.valid() || this.pending() || !pacienteId) {
      return;
    }
    this.pending.set(true);
    try {
      const result = await this.mutations.run(
        'CrearOrdenCobroManual',
        {
          input: {
            pacienteId,
            items: this.items(),
            odontologoId: this.odontologoId() || null,
            observaciones: this.observaciones().trim() || null,
            descuentoBs: this.discount(),
          },
        },
        this.action,
      );
      if (result.status === 'queued') {
        this.messages.add({
          severity: 'info',
          summary: 'Sin conexión',
          detail: 'Guardado sin conexión: se sincronizará automáticamente',
        });
        this.queued.emit();
        this.closed.emit();
        return;
      }
      this.messages.add({ severity: 'success', summary: 'Orden creada', detail: result.data.crearOrdenCobroManual.id });
      this.created.emit(result.data.crearOrdenCobroManual);
      this.closed.emit();
    } catch (error) {
      this.messages.add({ severity: 'error', summary: 'No se pudo crear la orden', detail: errorMessage(error) });
    } finally {
      this.pending.set(false);
    }
  }
}
