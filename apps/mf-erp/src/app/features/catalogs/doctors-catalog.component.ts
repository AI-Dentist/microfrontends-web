import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { LucidePencil, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Consultorio, Especialidad, Odontologo } from '../../core/graphql/models';
import {
  ACTUALIZAR_ODONTOLOGO,
  CREAR_CONSULTORIO,
  CREAR_ESPECIALIDAD,
  CREAR_ODONTOLOGO,
} from '../../core/graphql/mutations.graphql';
import { LISTAR_CONSULTORIOS, LISTAR_ESPECIALIDADES, LISTAR_ODONTOLOGOS } from '../../core/graphql/queries.graphql';
import { cachedCatalog } from '../../core/offline/catalog-cache';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { removeById } from './catalog-list';
import {
  ACTUALIZAR_CONSULTORIO,
  ACTUALIZAR_ESPECIALIDAD,
  ELIMINAR_CONSULTORIO,
  ELIMINAR_ESPECIALIDAD,
  ELIMINAR_ODONTOLOGO,
} from './catalogs.graphql';

/** Odontólogos, Especialidades and Consultorios master catalogs. */
@Component({
  selector: 'erp-doctors-catalog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TableModule,
    TabsModule,
    TagModule,
    TooltipModule,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 p-4">
      <h2 class="text-xl font-semibold text-slate-800">Odontólogos, especialidades y consultorios</h2>
      @if (fromCache()) { <p class="text-sm text-amber-700" role="status">Caché sin conexión</p> }

      <p-tabs [value]="initialTab()">
        <p-tablist>
          <p-tab value="odontologos">Odontólogos</p-tab>
          <p-tab value="especialidades">Especialidades</p-tab>
          <p-tab value="consultorios">Consultorios</p-tab>
        </p-tablist>
        <p-tabpanels>
          <p-tabpanel value="odontologos">
            <div class="mb-3 flex justify-end">
              <p-button label="Nuevo odontólogo" [disabled]="!canWrite() || !online()" size="small" (onClick)="openDoctor(null)">
                <ng-template #icon><svg lucidePlus class="size-4"></svg></ng-template>
              </p-button>
            </div>
            <p-table [value]="doctors()" [loading]="loading()" size="small" stripedRows>
              <ng-template #header>
                <tr>
                  <th>Nombres</th>
                  <th>Apellidos</th>
                  <th>Matrícula</th>
                  <th>Especialidad</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th class="w-28"></th>
                </tr>
              </ng-template>
              <ng-template #body let-row>
                <tr>
                  <td>{{ row.nombres }}</td>
                  <td>{{ row.apellidos }}</td>
                  <td>{{ row.matriculaProfesional }}</td>
                  <td>@for (specialty of row.especialidades; track specialty.id) { <span class="mr-2">{{ specialty.nombre }}</span> }</td>
                  <td>{{ row.telefono }}</td>
                  <td><p-tag [severity]="row.activo ? 'success' : 'secondary'" [value]="row.activo ? 'Activo' : 'Inactivo'" /></td>
                  <td class="whitespace-nowrap">
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" ariaLabel="Editar odontólogo" [disabled]="!online() || !canWrite()" (onClick)="openDoctor(row)">
                        <ng-template #icon><svg lucidePencil class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" severity="danger" ariaLabel="Desactivar odontólogo" [disabled]="!online() || !canWrite()" (onClick)="confirmDeleteDoctor(row)">
                        <ng-template #icon><svg lucideTrash2 class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                  </td>
                </tr>
              </ng-template>
              <ng-template #emptymessage>
                <tr><td colspan="7" class="py-6 text-center text-slate-500">No hay odontólogos registrados.</td></tr>
              </ng-template>
            </p-table>
          </p-tabpanel>

          <p-tabpanel value="especialidades">
            <div class="mb-3 flex justify-end">
              <p-button label="Nueva especialidad" [disabled]="!canWrite() || !online()" size="small" (onClick)="openSpecialty(null)">
                <ng-template #icon><svg lucidePlus class="size-4"></svg></ng-template>
              </p-button>
            </div>
            <p-table [value]="specialties()" [loading]="loading()" size="small" stripedRows>
              <ng-template #header>
                <tr><th>Nombre</th><th>Descripción</th><th class="w-28"></th></tr>
              </ng-template>
              <ng-template #body let-row>
                <tr>
                  <td>{{ row.nombre }}</td>
                  <td>{{ row.descripcion }}</td>
                  <td class="whitespace-nowrap">
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" ariaLabel="Editar especialidad" [disabled]="!online() || !canWrite()" (onClick)="openSpecialty(row)">
                        <ng-template #icon><svg lucidePencil class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" severity="danger" ariaLabel="Desactivar especialidad" [disabled]="!online() || !canWrite()" (onClick)="confirmDeleteSpecialty(row)">
                        <ng-template #icon><svg lucideTrash2 class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                  </td>
                </tr>
              </ng-template>
              <ng-template #emptymessage>
                <tr><td colspan="3" class="py-6 text-center text-slate-500">No hay especialidades registradas.</td></tr>
              </ng-template>
            </p-table>
          </p-tabpanel>

          <p-tabpanel value="consultorios">
            <div class="mb-3 flex justify-end">
              <p-button label="Nuevo consultorio" [disabled]="!canWrite() || !online()" size="small" (onClick)="openRoom(null)">
                <ng-template #icon><svg lucidePlus class="size-4"></svg></ng-template>
              </p-button>
            </div>
            <p-table [value]="rooms()" [loading]="loading()" size="small" stripedRows>
              <ng-template #header>
                <tr><th>Nombre</th><th>Ubicación</th><th>Estado</th><th class="w-28"></th></tr>
              </ng-template>
              <ng-template #body let-row>
                <tr>
                  <td>{{ row.nombre }}</td>
                  <td>{{ row.ubicacion }}</td>
                  <td><p-tag [severity]="row.estado === 'INACTIVO' ? 'secondary' : 'success'" [value]="row.estado" /></td>
                  <td class="whitespace-nowrap">
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" ariaLabel="Editar consultorio" [disabled]="!online() || !canWrite() || row.estado === 'INACTIVO'" (onClick)="openRoom(row)">
                        <ng-template #icon><svg lucidePencil class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                    <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                      <p-button text rounded size="small" severity="danger" ariaLabel="Desactivar consultorio" [disabled]="!online() || !canWrite() || row.estado === 'INACTIVO'" (onClick)="confirmDeleteRoom(row)">
                        <ng-template #icon><svg lucideTrash2 class="size-4"></svg></ng-template>
                      </p-button>
                    </span>
                  </td>
                </tr>
              </ng-template>
              <ng-template #emptymessage>
                <tr><td colspan="4" class="py-6 text-center text-slate-500">No hay consultorios registrados.</td></tr>
              </ng-template>
            </p-table>
          </p-tabpanel>
        </p-tabpanels>
      </p-tabs>

      <p-dialog
        [header]="editingDoctor() ? 'Editar odontólogo' : 'Nuevo odontólogo'"
        [modal]="true"
        [(visible)]="doctorDialog"
        [style]="{ width: '34rem' }"
      >
        <form [formGroup]="doctorForm" (ngSubmit)="saveDoctor()" id="doctor-form" class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">Nombres *<input pInputText formControlName="nombres" /></label>
          <label class="flex flex-col gap-1 text-sm">Apellidos *<input pInputText formControlName="apellidos" /></label>
          <label class="flex flex-col gap-1 text-sm">CI *<input pInputText formControlName="ci" /></label>
          <label class="flex flex-col gap-1 text-sm">Matrícula *<input pInputText formControlName="matriculaProfesional" /></label>
          <label class="flex flex-col gap-1 text-sm">Teléfono *<input pInputText formControlName="telefono" inputmode="tel" /></label>
          <label class="flex flex-col gap-1 text-sm">Comisión (%) *<input pInputText type="number" formControlName="porcentajeComision" /></label>
          <label class="flex flex-col gap-1 text-sm">Email<input pInputText type="email" formControlName="email" /></label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            Especialidades
            <p-multiselect
              formControlName="especialidadesIds"
              [options]="specialties()"
              optionLabel="nombre"
              optionValue="id"
              placeholder="Seleccione una especialidad"
              [showClear]="true"
              appendTo="body"
            />
          </label>

        </form>
        <ng-template #footer>
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="doctorDialog.set(false)" />
          <p-button label="Guardar" type="button" (onClick)="saveDoctor()" [loading]="saving()" [disabled]="saving() || doctorForm.invalid" />
        </ng-template>
      </p-dialog>

      <p-dialog [header]="editingSpecialty() ? 'Editar especialidad' : 'Nueva especialidad'" [modal]="true" [(visible)]="specialtyDialog" [style]="{ width: '28rem' }">
        <form [formGroup]="specialtyForm" (ngSubmit)="saveSpecialty()" id="specialty-form" class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm">Código *<input pInputText formControlName="codigo" /></label>
          <label class="flex flex-col gap-1 text-sm">Nombre *<input pInputText formControlName="nombre" /></label>
          <label class="flex flex-col gap-1 text-sm">Descripción<input pInputText formControlName="descripcion" /></label>
        </form>
        <ng-template #footer>
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="specialtyDialog.set(false)" />
          <p-button label="Guardar" type="button" (onClick)="saveSpecialty()" [loading]="saving()" [disabled]="saving() || specialtyForm.invalid" />
        </ng-template>
      </p-dialog>

      <p-dialog [header]="editingRoom() ? 'Editar consultorio' : 'Nuevo consultorio'" [modal]="true" [(visible)]="roomDialog" [style]="{ width: '28rem' }">
        <form [formGroup]="roomForm" (ngSubmit)="saveRoom()" id="room-form" class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-sm">Código *<input pInputText formControlName="codigo" /></label>
          <label class="flex flex-col gap-1 text-sm">Nombre *<input pInputText formControlName="nombre" /></label>
          <label class="flex flex-col gap-1 text-sm">Ubicación<input pInputText formControlName="ubicacion" /></label>
          @if (editingRoom()) { <label class="flex flex-col gap-1 text-sm">Estado<p-select formControlName="estado" [options]="roomStates" appendTo="body" /></label> }
        </form>
        <ng-template #footer>
          <p-button label="Cancelar" severity="secondary" [text]="true" (onClick)="roomDialog.set(false)" />
          <p-button label="Guardar" type="button" (onClick)="saveRoom()" [loading]="saving()" [disabled]="saving() || roomForm.invalid" />
        </ng-template>
      </p-dialog>
      <p-confirmdialog />
    </section>
  `,
})
export class DoctorsCatalog implements OnInit {
  readonly initialTab = input<'odontologos' | 'especialidades' | 'consultorios'>('odontologos');
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  readonly canWrite = computed(() => this.auth.roles().includes('ADMIN'));
  readonly roomStates = ['DISPONIBLE', 'MANTENIMIENTO'];
  private readonly network = inject(NetworkStatusService);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly online = this.network.online;
  readonly doctors = signal<Odontologo[]>([]);
  readonly specialties = signal<Especialidad[]>([]);
  readonly rooms = signal<Consultorio[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly saving = signal(false);

  readonly doctorDialog = signal(false);
  readonly specialtyDialog = signal(false);
  readonly roomDialog = signal(false);
  readonly editingDoctor = signal<Odontologo | null>(null);
  readonly editingSpecialty = signal<Especialidad | null>(null);
  readonly editingRoom = signal<Consultorio | null>(null);

  readonly doctorForm = this.fb.group({
    nombres: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    apellidos: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    ci: ['', Validators.required],
    matriculaProfesional: ['', Validators.required],
    telefono: ['', Validators.required],
    email: ['', Validators.email],
    porcentajeComision: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    especialidadesIds: this.fb.control<string[]>([]),
  });
  readonly specialtyForm = this.fb.group({
    codigo: ['', Validators.required],
    nombre: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    descripcion: '',
  });
  readonly roomForm = this.fb.group({
    codigo: ['', Validators.required],
    nombre: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    ubicacion: '',
    estado: 'DISPONIBLE',
  });

  ngOnInit(): void {
    void this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [doctors, specialties, rooms] = await Promise.all([
        cachedCatalog('odontologos', () => firstValueFrom(this.apollo.query({ query: LISTAR_ODONTOLOGOS, variables: {}, fetchPolicy: 'network-only' })), { online: this.network.isOnline() }),
        cachedCatalog('especialidades', () => firstValueFrom(this.apollo.query({ query: LISTAR_ESPECIALIDADES, variables: {}, fetchPolicy: 'network-only' })), { online: this.network.isOnline() }),
        cachedCatalog('consultorios', () => firstValueFrom(this.apollo.query({ query: LISTAR_CONSULTORIOS, variables: {}, fetchPolicy: 'network-only' })), { online: this.network.isOnline() }),
      ]);
      this.doctors.set([...(doctors.data.data?.listarOdontologos ?? [])]);
      this.specialties.set([...(specialties.data.data?.listarEspecialidades ?? [])]);
      this.rooms.set([...(rooms.data.data?.listarConsultorios ?? [])]);
      this.fromCache.set([doctors, specialties, rooms].some((result) => result.fromCache));
    } catch (error) {
      this.fail('No se pudieron cargar los catálogos', error);
    } finally {
      this.loading.set(false);
    }
  }

  openDoctor(doctor: Odontologo | null): void {
    if (!this.canWrite() || !this.online() || doctor?.activo === false) return;
    this.editingDoctor.set(doctor);
    this.doctorForm.reset({
      nombres: doctor?.nombres ?? '',
      apellidos: doctor?.apellidos ?? '',
      ci: doctor?.ci ?? '',
      matriculaProfesional: doctor?.matriculaProfesional ?? '',
      telefono: doctor?.telefono ?? '',
      email: doctor?.email ?? '',
      porcentajeComision: doctor?.porcentajeComision ?? 0,
      especialidadesIds: doctor?.especialidades.map(specialty => specialty.id) ?? [],
    });
    this.doctorDialog.set(true);
  }

  openSpecialty(specialty: Especialidad | null): void {
    if (!this.canWrite() || !this.online() || specialty?.activo === false) return;
    this.editingSpecialty.set(specialty);
    this.specialtyForm.reset({ codigo: specialty?.codigo ?? '', nombre: specialty?.nombre ?? '', descripcion: specialty?.descripcion ?? '' });
    this.specialtyDialog.set(true);
  }

  openRoom(room: Consultorio | null): void {
    if (!this.canWrite() || !this.online() || room?.estado === 'INACTIVO') return;
    this.editingRoom.set(room);
    this.roomForm.reset({ codigo: room?.codigo ?? '', nombre: room?.nombre ?? '', ubicacion: room?.ubicacion ?? '', estado: room?.estado ?? 'DISPONIBLE' });
    this.roomDialog.set(true);
  }

  async saveDoctor(): Promise<void> {
    if (!this.canWrite() || !this.online() || this.saving() || this.doctorForm.invalid) return;
    const value = this.doctorForm.getRawValue();
    const input = {
      nombres: value.nombres.trim(),
      apellidos: value.apellidos.trim(),
      ci: value.ci.trim(),
      matriculaProfesional: value.matriculaProfesional.trim(),
      telefono: value.telefono.trim(),
      email: value.email.trim() || null,
      porcentajeComision: value.porcentajeComision,
      especialidadesIds: value.especialidadesIds,
    };
    const current = this.editingDoctor();
    await this.persist('Odontólogo guardado', this.doctorDialog, async () => {
      if (current) {
        await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_ODONTOLOGO, variables: { id: current.id, input } }));
      } else {
        await firstValueFrom(this.apollo.mutate({ mutation: CREAR_ODONTOLOGO, variables: { input } }));
      }
    });
  }

  async saveSpecialty(): Promise<void> {
    if (!this.canWrite() || !this.online() || this.saving() || this.specialtyForm.invalid) return;
    const value = this.specialtyForm.getRawValue();
    const input = { codigo: value.codigo.trim(), nombre: value.nombre.trim(), descripcion: value.descripcion.trim() || null };
    const current = this.editingSpecialty();
    await this.persist(current ? 'Especialidad actualizada' : 'Especialidad creada', this.specialtyDialog, async () => {
      if (current) {
        await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_ESPECIALIDAD, variables: { id: current.id, input } }));
      } else {
        await firstValueFrom(this.apollo.mutate({ mutation: CREAR_ESPECIALIDAD, variables: input }));
      }
    });
  }

  async saveRoom(): Promise<void> {
    if (!this.canWrite() || !this.online() || this.editingRoom()?.estado === 'INACTIVO' || this.saving() || this.roomForm.invalid) return;
    const value = this.roomForm.getRawValue();
    const input = { codigo: value.codigo.trim(), nombre: value.nombre.trim(), ubicacion: value.ubicacion.trim() || null };
    const current = this.editingRoom();
    await this.persist(current ? 'Consultorio actualizado' : 'Consultorio creado', this.roomDialog, async () => {
      if (current) {
        await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_CONSULTORIO, variables: { id: current.id, input: { ...input, estado: value.estado } } }));
      } else {
        await firstValueFrom(this.apollo.mutate({ mutation: CREAR_CONSULTORIO, variables: { input } }));
      }
    });
  }

  confirmDeleteDoctor(doctor: Odontologo): void {
    this.confirmDelete('odontólogo', `${doctor.nombres} ${doctor.apellidos}`, 'Odontólogo desactivado', async () => {
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ELIMINAR_ODONTOLOGO, variables: { id: doctor.id } }));
      if (result.data?.eliminarOdontologo !== true) throw new Error('El backend no confirmó la baja lógica');
      this.doctors.update((rows) => removeById(rows, doctor.id));
      await cachedCatalog('odontologos', async () => ({ data: { listarOdontologos: this.doctors() } }), { online: true });
    });
  }

  confirmDeleteSpecialty(specialty: Especialidad): void {
    this.confirmDelete('especialidad', specialty.nombre, 'Especialidad desactivada', async () => {
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ELIMINAR_ESPECIALIDAD, variables: { id: specialty.id } }));
      if (result.data?.eliminarEspecialidad !== true) throw new Error('El backend no confirmó la baja lógica');
      this.specialties.update((rows) => removeById(rows, specialty.id));
      await cachedCatalog('especialidades', async () => ({ data: { listarEspecialidades: this.specialties() } }), { online: true });
    });
  }

  confirmDeleteRoom(room: Consultorio): void {
    if (room.estado === 'INACTIVO') return;
    this.confirmDelete('consultorio', room.nombre, 'Consultorio desactivado', async () => {
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ELIMINAR_CONSULTORIO, variables: { id: room.id } }));
      if (result.data?.eliminarConsultorio !== true) throw new Error('El backend no confirmó la baja lógica');
      this.rooms.update((rows) => rows.map(row => row.id === room.id ? { ...row, estado: 'INACTIVO' } : row));
      await cachedCatalog('consultorios', async () => ({ data: { listarConsultorios: this.rooms() } }), { online: true });
    });
  }

  private confirmDelete(entity: string, name: string, done: string, action: () => Promise<void>): void {
    if (!this.canWrite() || !this.online()) return;
    this.confirmation.confirm({
      header: `Desactivar ${entity}`,
      message: `¿Dar de baja lógica a ${entity} "${name}"? Se conservarán sus datos. No hay reactivación disponible.`,
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      accept: () => void this.remove(entity, name, done, action),
    });
  }

  private async remove(entity: string, name: string, done: string, action: () => Promise<void>): Promise<void> {
    try {
      if (!this.canWrite() || !this.online()) return;
      await action();
      await this.loadAll();
      this.messages.add({ severity: 'success', summary: done, detail: name });
    } catch (error) {
      this.fail(`No se pudo desactivar el ${entity}`, error);
    }
  }

  private async persist(summary: string, dialog: { set(open: boolean): void }, action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    try {
      await action();
      this.messages.add({ severity: 'success', summary });
      dialog.set(false);
      await this.loadAll();
    } catch (error) {
      this.fail('No se pudo guardar', error);
    } finally {
      this.saving.set(false);
    }
  }

  private fail(summary: string, error: unknown): void {
    this.messages.add({ severity: 'error', summary, detail: error instanceof Error ? error.message : 'Error desconocido' });
  }
}
