import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { LucideCloudOff, LucidePencil, LucidePlus, LucideSearch, LucideTrash2 } from '@lucide/angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Paciente, PacienteInput } from '../../core/graphql/models';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { LISTAR_PACIENTES, OBTENER_PACIENTE_POR_ID } from '../../core/graphql/queries.graphql';
import { ACTUALIZAR_PACIENTE } from '../../core/graphql/mutations.graphql';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../../core/graphql/graphql.provider';
import { CompletePatient, PatientEditDraft, isCompletePatient, patientEditDraft, patientEditErrors, patientReplacement } from './patient-edit';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { erpLocalDb } from '../../core/offline/dexie.db';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { removeById } from './catalog-list';
import { ELIMINAR_PACIENTE } from './catalogs.graphql';
import { PatientErrors, normalizeBolivianMobile, validatePatientDraft } from './patient-validation';

const SEARCH_DEBOUNCE_MS = 300;

/** Pacientes master catalog: online list cached in Dexie, offline reads from the cache. */
@Component({
  selector: 'erp-patients-catalog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    TableModule,
    TagModule,
    TooltipModule,
    LucideCloudOff,
    LucidePencil,
    LucidePlus,
    LucideSearch,
    LucideTrash2,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-semibold text-slate-800">Pacientes</h2>
          @if (fromCache()) {
            <p-tag severity="warn" data-testid="offline-cache-badge">
              <span class="inline-flex items-center gap-1"><svg lucideCloudOff class="size-3.5"></svg> Caché sin conexión</span>
            </p-tag>
          }
        </div>
        <div class="flex items-center gap-2">
          <span class="relative">
            <svg lucideSearch class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-slate-400"></svg>
            <input
              pInputText
              type="search"
              class="pl-8"
              placeholder="Buscar por CI/NIT o nombre"
              [value]="search()"
              (input)="onSearch($any($event.target).value)"
            />
          </span>
          <p-button label="Nuevo paciente" [disabled]="!canWrite()" size="small" (onClick)="openCreate()">
            <ng-template #icon><svg lucidePlus class="size-4"></svg></ng-template>
          </p-button>
        </div>
      </header>

      <p class="text-sm text-slate-600" role="status">Editar requiere conexión y una lectura completa del paciente.</p>
      <p-table [value]="patients()" [loading]="loading()" [paginator]="patients().length > 10" [rows]="10" size="small" stripedRows>
        <ng-template #header>
          <tr>
            <th>CI/NIT</th>
            <th>Nombres</th>
            <th>Apellidos</th>
            <th>WhatsApp</th>
            <th>Email</th>
            <th>Dirección</th>
            <th class="w-28"></th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ row.ciNit }}</td>
            <td>{{ row.nombres }}</td>
            <td>{{ row.apellidos }}</td>
            <td>{{ row.telefonoWhatsapp }}</td>
            <td>{{ row.email }}</td>
            <td>{{ row.direccion }}</td>
            <td class="whitespace-nowrap">
              <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                <p-button text rounded size="small" ariaLabel="Editar paciente" [disabled]="!online() || !canWrite() || editLoading() || saving()" (onClick)="openEdit(row)">
                  <ng-template #icon><svg lucidePencil class="size-4"></svg></ng-template>
                </p-button>
              </span>
              <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                <p-button text rounded size="small" severity="danger" ariaLabel="Desactivar paciente" [disabled]="!online() || !canWrite()" (onClick)="confirmDelete(row)">
                  <ng-template #icon><svg lucideTrash2 class="size-4"></svg></ng-template>
                </p-button>
              </span>
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="py-6 text-center text-slate-500">No hay pacientes para mostrar.</td></tr>
        </ng-template>
      </p-table>

      <p-dialog
        [header]="editing() ? 'Editar paciente' : 'Nuevo paciente'"
        [modal]="true"
        [visible]="dialogOpen()"
        (visibleChange)="!$event && cancel()"
        [style]="{ width: '34rem' }"
      >
        <form [formGroup]="form" (ngSubmit)="save()" class="grid grid-cols-2 gap-3" id="patient-form">
          @if (editLoading()) { <p class="col-span-2" role="status">Cargando datos del paciente…</p> }
          <fieldset class="col-span-2 grid grid-cols-2 gap-3 border-0 p-0" [disabled]="editLoading() || saving()">
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            CI/NIT *
            <input pInputText formControlName="ciNit" />
            @if (errors().ciNit; as message) { <small class="text-red-600">{{ message }}</small> }
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Nombres *
            <input pInputText formControlName="nombres" />
            @if (errors().nombres; as message) { <small class="text-red-600">{{ message }}</small> }
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Apellidos *
            <input pInputText formControlName="apellidos" />
            @if (errors().apellidos; as message) { <small class="text-red-600">{{ message }}</small> }
          </label>
          <label class="flex flex-col gap-1 text-sm">
            WhatsApp *
            <input pInputText formControlName="telefonoWhatsapp" inputmode="tel" placeholder="71234567" />
            @if (errors().telefonoWhatsapp; as message) { <small class="text-red-600">{{ message }}</small> }
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Fecha de nacimiento
            <input pInputText type="date" formControlName="fechaNacimiento" />
          </label>
          <label class="flex flex-col gap-1 text-sm">Género<input pInputText formControlName="genero" /></label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">Dirección<input pInputText formControlName="direccion" /></label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            Email
            <input pInputText type="email" formControlName="email" />
          </label>
          </fieldset>
        </form>
        <ng-template #footer>
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="cancel()" />
          <p-button label="Guardar" type="button" (onClick)="save()" [loading]="saving()" [disabled]="saving() || editLoading()" />
        </ng-template>
      </p-dialog>
      <p-confirmdialog />
    </section>
  `,
})
export class PatientsCatalog implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  readonly canWrite = computed(() => this.auth.roles().some(role => ['ADMIN', 'RECEPCIONISTA'].includes(role)));
  private readonly critical = inject(CriticalMutationService);
  private readonly network = inject(NetworkStatusService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly online = this.network.online;
  readonly patients = signal<Paciente[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly search = signal('');
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editLoading = signal(false);
  readonly editing = signal<Paciente | null>(null);
  readonly errors = signal<PatientErrors>({});
  readonly isEditing = computed(() => this.editing() !== null);

  readonly form = this.fb.group({
    ciNit: '',
    nombres: '',
    apellidos: '',
    telefonoWhatsapp: '',
    email: '',
    fechaNacimiento: '',
    genero: '',
    direccion: '',
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private createAction = new IdempotentAction();
  private editAction = new IdempotentAction();
  private editVersion = 0;
  private disposed = false;
  private verifiedEdit: { patient: CompletePatient; initial: PatientEditDraft; owner: string; version: number } | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.disposed = true; this.invalidateEdit(); clearTimeout(this.searchTimer); });
  }

  private invalidateEdit(): void {
    this.editVersion++;
    this.verifiedEdit = null;
    this.editLoading.set(false);
  }

  cancel(): void {
    this.invalidateEdit();
    this.dialogOpen.set(false);
  }

  ngOnInit(): void {
    void this.load();
  }

  onSearch(term: string): void {
    this.search.set(term);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), SEARCH_DEBOUNCE_MS);
  }

  async load(): Promise<void> {
    const term = this.search().trim();
    this.loading.set(true);
    try {
      if (!this.network.isOnline()) {
        throw new Error('offline');
      }
      const result = await firstValueFrom(
        this.apollo.query({ query: LISTAR_PACIENTES, variables: { busqueda: term || null }, fetchPolicy: 'network-only' }),
      );
      const rows = [...(result.data?.listarPacientes ?? [])];
      await erpLocalDb().pacientes.bulkPut(rows.map((row) => ({ ...row })));
      this.patients.set(rows);
      this.fromCache.set(false);
    } catch {
      this.patients.set(await this.readCache(term));
      this.fromCache.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    if (this.disposed || !this.canWrite() || this.saving()) return;
    this.invalidateEdit();
    this.editing.set(null);
    this.createAction = new IdempotentAction();
    this.form.reset();
    this.errors.set({});
    this.dialogOpen.set(true);
  }

  async openEdit(patient: Paciente): Promise<void> {
    if (this.disposed || this.saving()) return;
    this.invalidateEdit();
    const version = this.editVersion;
    try {
      this.auth.refresh();
      const owner = this.auth.principalKey();
      if (!owner || !this.canWrite() || !this.online()) return;
      this.editing.set(patient);
      this.form.reset();
      this.errors.set({});
      this.dialogOpen.set(true);
      this.editLoading.set(true);
      const result = await firstValueFrom(this.apollo.query({
        query: OBTENER_PACIENTE_POR_ID, variables: { id: patient.id }, fetchPolicy: 'network-only',
        context: { [OWNER_CONTEXT_KEY]: owner },
      }));
      if (!this.editCurrent(version, owner, patient.id)) return;
      const detail = result.data?.obtenerPacientePorId;
      const hasErrors = result.error || ('errors' in result && Array.isArray(result.errors) && result.errors.length);
      if (hasErrors || !isCompletePatient(detail, patient.id)) {
        throw new Error('No se recibió una lectura completa del paciente. Vuelva a intentar con conexión.');
      }
      const baseline = { ...detail };
      const initial = patientEditDraft(baseline);
      this.verifiedEdit = { patient: baseline, initial, owner, version };
      this.editAction = new IdempotentAction();
      this.editing.set({ ...baseline });
      this.form.reset(initial);
    } catch (error) {
      if (!this.disposed && version === this.editVersion) {
        this.cancel();
        this.messages.add({ severity: 'error', summary: 'No se pudo cargar el paciente', detail: error instanceof Error ? error.message : 'Error desconocido' });
      }
    } finally {
      if (version === this.editVersion) this.editLoading.set(false);
    }
  }

  private editCurrent(version: number, owner: string, id: string): boolean {
    this.auth.refresh();
    return !this.disposed && version === this.editVersion && this.dialogOpen() &&
      this.editing()?.id === id && this.online() && this.canWrite() && owner === this.auth.principalKey();
  }

  private async saveEdit(): Promise<void> {
    const edit = this.verifiedEdit;
    if (!edit || this.saving() || this.editLoading()) return;
    try {
      if (!this.editCurrent(edit.version, edit.owner, edit.patient.id)) return;
      const draft = this.form.getRawValue();
      const errors = patientEditErrors(draft, edit.initial);
      this.errors.set(errors);
      if (Object.keys(errors).length) return;
      const input = patientReplacement(edit.patient, edit.initial, draft);
      const variables = { id: edit.patient.id, input };
      this.saving.set(true);
      const result = await firstValueFrom(this.apollo.mutate({
        mutation: ACTUALIZAR_PACIENTE, variables, fetchPolicy: 'no-cache',
        context: { [IDEMPOTENCY_CONTEXT_KEY]: this.editAction.keyFor(variables), [OWNER_CONTEXT_KEY]: edit.owner },
      }));
      if (!this.editCurrent(edit.version, edit.owner, edit.patient.id)) return;
      const updated = result.data?.actualizarPaciente;
      const hasErrors = result.error || ('errors' in result && Array.isArray(result.errors) && result.errors.length);
      if (hasErrors || !isCompletePatient(updated, edit.patient.id)) {
        throw new Error('El backend no confirmó la actualización completa del paciente.');
      }
      await this.upsertLocal(updated, () => this.editCurrent(edit.version, edit.owner, edit.patient.id));
      if (!this.editCurrent(edit.version, edit.owner, edit.patient.id)) return;
      this.messages.add({ severity: 'success', summary: 'Paciente actualizado', detail: `${updated.nombres} ${updated.apellidos}` });
      this.cancel();
    } catch (error) {
      if (!this.disposed && edit.version === this.editVersion) this.messages.add({ severity: 'error', summary: 'No se pudo guardar el paciente', detail: error instanceof Error ? error.message : 'Error desconocido' });
    } finally {
      this.saving.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.editing()) { await this.saveEdit(); return; }
    if (!this.canWrite() || this.saving()) return;
    const value = this.form.getRawValue();
    const errors = validatePatientDraft(value);
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) return;

    const whatsapp = value.telefonoWhatsapp.trim();
    const input: PacienteInput = {
      ciNit: value.ciNit.trim(),
      nombres: value.nombres.trim(),
      apellidos: value.apellidos.trim(),
      telefonoWhatsapp: normalizeBolivianMobile(whatsapp),
      email: value.email.trim() || null,
      fechaNacimiento: value.fechaNacimiento || null,
      genero: value.genero.trim() || null,
      direccion: value.direccion.trim() || null,
    };

    this.saving.set(true);
    try {
      const result = await this.critical.run('CrearPaciente', { input }, this.createAction);
      if (result.status === 'queued') {
        this.messages.add({
          severity: 'info',
          summary: 'Sin conexión',
          detail: 'Guardado sin conexión: se sincronizará automáticamente',
        });
      } else {
        await this.upsertLocal(result.data.crearPaciente);
        this.messages.add({ severity: 'success', summary: 'Paciente creado', detail: `${input.nombres} ${input.apellidos}` });
      }
      this.dialogOpen.set(false);
    } catch (error) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo guardar el paciente',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(patient: Paciente): void {
    if (!this.canWrite() || !this.online()) return;
    this.confirmation.confirm({
      header: 'Desactivar paciente',
      message: `¿Dar de baja lógica a ${patient.nombres} ${patient.apellidos}? Se conservarán sus datos. No se permite si tiene cobros pendientes.`,
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      accept: () => void this.remove(patient),
    });
  }

  private async remove(patient: Paciente): Promise<void> {
    try {
      if (!this.canWrite() || !this.online()) return;
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ELIMINAR_PACIENTE, variables: { id: patient.id } }));
      if (result.data?.eliminarPaciente !== true) throw new Error('El backend no confirmó la baja lógica');
      await erpLocalDb().pacientes.delete(patient.id);
      this.patients.update((rows) => removeById(rows, patient.id));
      this.messages.add({ severity: 'success', summary: 'Paciente desactivado', detail: `${patient.nombres} ${patient.apellidos}` });
    } catch (error) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo desactivar el paciente',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  private async upsertLocal(patient: Paciente, mayCommit: () => boolean = () => true): Promise<void> {
    if (!mayCommit()) return;
    await erpLocalDb().pacientes.put({ ...patient });
    if (!mayCommit()) return;
    this.patients.update((rows) =>
      rows.some((row) => row.id === patient.id)
        ? rows.map((row) => (row.id === patient.id ? patient : row))
        : [patient, ...rows],
    );
  }

  private async readCache(term: string): Promise<Paciente[]> {
    const all: Paciente[] = await erpLocalDb().pacientes.toArray();
    const needle = term.toLowerCase();
    return needle ? all.filter((p) => `${p.ciNit} ${p.nombres} ${p.apellidos}`.toLowerCase().includes(needle)) : all;
  }
}
