import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { LucideCloudOff, LucidePencil, LucidePlus, LucideSparkles, LucideTrash2 } from '@lucide/angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { LocalAiService } from '../../core/ai-local/local-ai.service';
import { Especialidad, ServicioOdontologico } from '../../core/graphql/models';
import { ACTUALIZAR_SERVICIO_ODONTOLOGICO, CREAR_SERVICIO_ODONTOLOGICO } from '../../core/graphql/mutations.graphql';
import { LISTAR_ESPECIALIDADES, LISTAR_SERVICIOS_ODONTOLOGICOS } from '../../core/graphql/queries.graphql';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { BolivianosPipe } from '../../shared/pipes/bolivianos.pipe';
import { removeById, upsertById } from './catalog-list';
import { ELIMINAR_SERVICIO_ODONTOLOGICO } from './catalogs.graphql';
import { RankedService, buildTariffSearchItems, mapRankedServices } from './tariff-search';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 8;

/** Arancel de Servicios Odontológicos (Bs) with local semantic search. */
@Component({
  selector: 'erp-services-tariff',
  imports: [
    ReactiveFormsModule,
    BolivianosPipe,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule,
    LucideCloudOff,
    LucidePencil,
    LucidePlus,
    LucideSparkles,
    LucideTrash2,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-slate-800">Arancel de Servicios Odontológicos</h2>
          @if (fromCache()) {
            <p-tag severity="warn" data-testid="offline-cache-badge">
              <span class="inline-flex items-center gap-1"><svg lucideCloudOff class="size-3.5"></svg> Caché sin conexión</span>
            </p-tag>
          }
        </div>
        <p-button label="Nuevo servicio" [disabled]="!canWrite() || !online()" size="small" (onClick)="openDialog(null)">
          <ng-template #icon><svg lucidePlus class="size-4"></svg></ng-template>
        </p-button>
      </header>

      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <label class="flex flex-col gap-1 text-sm text-slate-700">
          <span class="inline-flex items-center gap-1 font-medium"><svg lucideSparkles class="size-4"></svg> Búsqueda inteligente</span>
          <input
            pInputText
            type="search"
            placeholder='Describa el tratamiento, por ejemplo "sacar muela del juicio"'
            [value]="query()"
            (input)="onQuery($any($event.target).value)"
          />
        </label>
        @if (query().trim()) {
          <p class="mt-2 text-xs text-slate-500" data-testid="search-mode">
            @if (searchMode() === 'local-ai') {
              Resultados con IA local (similitud semántica)
            } @else if (searchMode() === 'loading') {
              Procesando IA local…
            } @else {
              Búsqueda semántica no disponible. Consulte el arancel manualmente.
            }
          </p>
          @if (searchError(); as message) { <p role="alert" data-testid="search-error">{{ message }}</p> }
          <ul class="mt-2 divide-y divide-slate-100">
            @for (match of matches(); track match.service.id) {
              <li class="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span>
                  <strong>{{ match.service.nombre }}</strong>
                  <span class="ml-2 text-xs text-slate-500">{{ match.service.codigo }}</span>
                </span>
                <span class="flex items-center gap-3">
                  <span>{{ match.service.precioBaseBs | bolivianos }}</span>
                  <p-tag severity="info" [value]="'Score ' + match.score.toFixed(2)" />
                </span>
              </li>
            } @empty {
              <li class="py-2 text-sm text-slate-500">Sin coincidencias.</li>
            }
          </ul>
        }
      </div>

      <p-table [value]="services()" [loading]="loading()" [paginator]="services().length > 10" [rows]="10" size="small" stripedRows>
        <ng-template #header>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Descripción / Especialidad</th>
            <th class="text-right">Precio</th>
            <th>Estado</th>
            <th class="w-28"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ row.codigo }}</td>
            <td>{{ row.nombre }}</td>
            <td>{{ row.descripcion }} <span class="text-slate-500">{{ row.especialidad?.nombre }}</span></td>
            <td class="text-right">{{ row.precioBaseBs | bolivianos }}</td>
            <td><p-tag [severity]="row.activo ? 'success' : 'secondary'" [value]="row.activo ? 'Activo' : 'Inactivo'" /></td>
            <td class="whitespace-nowrap">
              <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                <p-button text rounded size="small" ariaLabel="Editar servicio" [disabled]="!online() || !canWrite()" (onClick)="openDialog(row)">
                  <ng-template #icon><svg lucidePencil class="size-4"></svg></ng-template>
                </p-button>
              </span>
              <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                <p-button text rounded size="small" severity="danger" ariaLabel="Desactivar servicio" [disabled]="!online() || !canWrite()" (onClick)="confirmDelete(row)">
                  <ng-template #icon><svg lucideTrash2 class="size-4"></svg></ng-template>
                </p-button>
              </span>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6" class="py-6 text-center text-slate-500">No hay servicios en el arancel.</td></tr>
        </ng-template>
      </p-table>

      <p-dialog
        [header]="editing() ? 'Editar servicio' : 'Nuevo servicio'"
        [modal]="true"
        [(visible)]="dialogOpen"
        [style]="{ width: '34rem' }"
      >
        <form [formGroup]="form" (ngSubmit)="save()" id="service-form" class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">Código *<input pInputText formControlName="codigo" /></label>
          <label class="flex flex-col gap-1 text-sm">
            Precio (Bs) *
            <p-inputnumber formControlName="precioBaseBs" mode="decimal" [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" />
          </label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">Nombre *<input pInputText formControlName="nombre" /></label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            Descripción
            <textarea pTextarea rows="3" formControlName="descripcion"></textarea>
          </label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">Especialidad (opcional)<p-select formControlName="especialidadId" [options]="specialties()" optionLabel="nombre" optionValue="id" [showClear]="true" appendTo="body" /></label>
        </form>
        <ng-template #footer>
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
          <p-button label="Guardar" type="button" (onClick)="save()" [loading]="saving()" [disabled]="saving() || form.invalid" />
        </ng-template>
      </p-dialog>
      <p-confirmdialog />
    </section>
  `,
})
export class ServicesTariff implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  readonly canWrite = computed(() => this.auth.roles().includes('ADMIN'));
  readonly specialties = signal<Especialidad[]>([]);
  private readonly network = inject(NetworkStatusService);
  private readonly ai = inject(LocalAiService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly online = this.network.online;
  readonly services = signal<ServicioOdontologico[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly saving = signal(false);
  readonly dialogOpen = signal(false);
  readonly editing = signal<ServicioOdontologico | null>(null);

  readonly query = signal('');
  readonly matches = signal<RankedService[]>([]);
  readonly searchMode = signal<'idle' | 'loading' | 'local-ai' | 'unavailable'>('idle');
  readonly searchError = signal<string | null>(null);

  readonly form = this.fb.group({
    codigo: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    nombre: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    descripcion: '',
    precioBaseBs: [0, (c: { value: number | null }) => (c.value !== null && c.value >= 0 ? null : { min: true })],
    especialidadId: '' as string | null,
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;
  private disposed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.disposed = true; this.searchSeq++; clearTimeout(this.searchTimer); });
  }

  ngOnInit(): void {
    void this.load();
    void this.loadSpecialties();
  }

  onQuery(value: string): void {
    if (this.disposed) return;
    const seq = ++this.searchSeq;
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.matches.set([]); this.searchError.set(null);
    this.searchMode.set(value.trim() ? 'loading' : 'idle');
    if (!value.trim()) return;
    this.searchTimer = setTimeout(() => void this.runSearch(value, seq), SEARCH_DEBOUNCE_MS);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      if (!this.network.isOnline()) {
        throw new Error('offline');
      }
      const result = await firstValueFrom(
        this.apollo.query({ query: LISTAR_SERVICIOS_ODONTOLOGICOS, variables: {}, fetchPolicy: 'network-only' }),
      );
      const rows = [...(result.data?.listarServiciosOdontologicos ?? [])];
      await erpLocalDb().serviciosOdontologicos.bulkPut(rows.map((row) => ({ ...row })));
      this.services.set(rows);
      if (this.query().trim()) this.onQuery(this.query());
      this.fromCache.set(false);
    } catch {
      this.services.set(await erpLocalDb().serviciosOdontologicos.toArray());
      if (this.query().trim()) this.onQuery(this.query());
      this.fromCache.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSpecialties(): Promise<void> {
    if (!this.online()) return;
    try {
      const result = await firstValueFrom(this.apollo.query({ query: LISTAR_ESPECIALIDADES, variables: {}, fetchPolicy: 'network-only' }));
      this.specialties.set([...(result.data?.listarEspecialidades ?? [])]);
    } catch (error) {
      this.messages.add({ severity: 'warn', summary: 'No se pudieron cargar las especialidades', detail: error instanceof Error ? error.message : 'Error desconocido' });
    }
  }

  openDialog(service: ServicioOdontologico | null): void {
    if (!this.canWrite() || !this.online()) return;
    this.editing.set(service);
    this.form.reset({
      codigo: service?.codigo ?? '',
      nombre: service?.nombre ?? '',
      descripcion: service?.descripcion ?? '',
      precioBaseBs: service?.precioBaseBs ?? 0,
      especialidadId: service?.especialidad?.id ?? null,
    });
    this.dialogOpen.set(true);
  }

  async save(): Promise<void> {
    if (!this.canWrite() || !this.online() || this.saving() || this.form.invalid) return;
    const value = this.form.getRawValue();
    const input = {
      codigo: value.codigo.trim(),
      nombre: value.nombre.trim(),
      descripcion: value.descripcion.trim() || null,
      precioBaseBs: value.precioBaseBs,
      especialidadId: value.especialidadId || null,
    };
    this.saving.set(true);
    try {
      const current = this.editing();
      const saved = current
        ? (await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_SERVICIO_ODONTOLOGICO, variables: { id: current.id, input } }))).data
            ?.actualizarServicioOdontologico
        : (await firstValueFrom(this.apollo.mutate({ mutation: CREAR_SERVICIO_ODONTOLOGICO, variables: { input } }))).data
            ?.crearServicioOdontologico;
      if (!saved) throw new Error('El backend no confirmó el servicio guardado');
      {
        await erpLocalDb().serviciosOdontologicos.put({ ...saved });
        this.services.update((rows) => upsertById(rows, saved));
        if (this.query().trim()) this.onQuery(this.query());
      }
      this.messages.add({ severity: 'success', summary: current ? 'Servicio actualizado' : 'Servicio creado', detail: input.nombre });
      this.dialogOpen.set(false);
    } catch (error) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo guardar el servicio',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(service: ServicioOdontologico): void {
    if (!this.canWrite() || !this.online()) return;
    this.confirmation.confirm({
      header: 'Desactivar servicio',
      message: `¿Dar de baja lógica al servicio "${service.nombre}"? Se conservarán sus datos. No hay reactivación disponible.`,
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      accept: () => void this.remove(service),
    });
  }

  private async remove(service: ServicioOdontologico): Promise<void> {
    try {
      if (!this.canWrite() || !this.online()) return;
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ELIMINAR_SERVICIO_ODONTOLOGICO, variables: { id: service.id } }));
      if (result.data?.eliminarServicioOdontologico !== true) throw new Error('El backend no confirmó la baja lógica');
      await erpLocalDb().serviciosOdontologicos.delete(service.id);
      this.services.update((rows) => removeById(rows, service.id));
      this.onQuery(this.query());
      this.messages.add({ severity: 'success', summary: 'Servicio desactivado', detail: service.nombre });
    } catch (error) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo desactivar el servicio',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  private async runSearch(value: string, seq: number): Promise<void> {
    const owner = this.auth.principalKey();
    const current = () => !this.disposed && seq === this.searchSeq && owner === this.auth.principalKey();
    if (!current()) return;
    const services = this.services();
    try {
      const ranked = await this.ai.semanticSearch(value, buildTariffSearchItems(services), SEARCH_LIMIT);
      if (!current()) return;
      this.searchMode.set('local-ai'); // A successful lazy start is still genuine inference.
      this.matches.set(mapRankedServices(ranked, this.services()));
    } catch {
      if (!current()) return;
      this.matches.set([]);
      this.searchMode.set('unavailable');
      this.searchError.set('IA local no disponible. El arancel sigue disponible para consulta manual.');
    }
  }
}
