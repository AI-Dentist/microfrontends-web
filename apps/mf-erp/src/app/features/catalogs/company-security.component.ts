import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { CrearUsuarioConIdentidadInput, LogAuditoria, Odontologo, UsuarioSistema } from '../../core/graphql/models';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../../core/graphql/graphql.provider';
import {
  ACTUALIZAR_CONFIGURACION_EMPRESA, CREAR_USUARIO_CON_IDENTIDAD, VINCULAR_IDENTIDAD_USUARIO,
} from '../../core/graphql/mutations.graphql';
import {
  LISTAR_AUDIT_LOGS,
  LISTAR_ODONTOLOGOS,
  LISTAR_USUARIOS,
  OBTENER_CONFIGURACION_EMPRESA,
} from '../../core/graphql/queries.graphql';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { ERP_RUNTIME } from '../../core/runtime/erp-runtime-context';
import { cachedCatalog } from '../../core/offline/catalog-cache';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { IdempotentAction } from '../../core/offline/idempotent-action';
import { CLINIC_ROLE_OPTIONS, upsertById } from './catalog-list';
import { ACTUALIZAR_USUARIO, ActualizarUsuarioInput } from './catalogs.graphql';

const AUDIT_LOG_LIMIT = 50;
const IDENTITY_CONFLICT = 'BAD_REQUEST: La identidad de usuario ya está vinculada';

/** Datos de la Clínica form, Usuarios (role and active state) and read-only Logs de auditoría table. */
@Component({
  selector: 'erp-company-security',
  imports: [DatePipe, FormsModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, TableModule, TagModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6 p-4">
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="mb-3 text-xl font-semibold text-slate-800">Datos de la Clínica</h2>
        @if (fromCache()) { <p class="mb-3 text-sm text-amber-700" role="status">Caché sin conexión</p> }
        <form [formGroup]="form" (ngSubmit)="save()" class="grid max-w-3xl grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">Nombre comercial *<input pInputText formControlName="nombreComercial" /></label>
          <label class="flex flex-col gap-1 text-sm">NIT *<input pInputText formControlName="nit" /></label>
          <label class="flex flex-col gap-1 text-sm">
            Razón Social para recibos *
            <input pInputText formControlName="razonSocial" />
          </label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">Dirección *<input pInputText formControlName="direccion" /></label>
          <label class="flex flex-col gap-1 text-sm">Teléfono *<input pInputText formControlName="telefonoContacto" inputmode="tel" /></label>
          <label class="flex flex-col gap-1 text-sm">Email<input pInputText type="email" formControlName="emailContacto" /></label>
          <p class="text-sm">Moneda (solo lectura): {{ currencySymbol() }}</p>
          <div class="col-span-2 flex justify-end">
            <p-button label="Guardar datos" type="submit" size="small" [loading]="saving()" [disabled]="!isAdmin() || !online() || saving() || form.invalid" />
          </div>
        </form>
      </div>

      @if (isAdmin()) {
      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="text-xl font-semibold text-slate-800">Usuarios</h2>
        <p class="mb-3 text-sm text-slate-500">
          Administración de roles y bajas lógicas. El servidor impide desactivarse a sí mismo, quitarse el propio rol ADMIN o dejar el sistema sin un ADMIN activo.
        </p>
        <p-table [value]="users()" [loading]="loading()" size="small" stripedRows>
          <ng-template #header>
            <tr><th>Usuario</th><th>Nombre completo</th><th>Rol</th><th>Estado</th><th class="w-32"></th></tr>
          </ng-template>
          <ng-template #body let-row>
            <tr>
              <td>{{ row.username }}</td>
              <td>{{ row.nombreCompleto }}</td>
              <td>
                <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                  <p-select
                    size="small"
                    [options]="roleOptions"
                    optionLabel="label"
                    optionValue="value"
                    [ngModel]="row.rol.codigo"
                    (onChange)="changeRole(row, $event.value)"
                    [disabled]="!online() || updatingUserId() === row.id"
                    [attr.aria-label]="'Rol de ' + row.username"
                    appendTo="body"
                  />
                </span>
              </td>
              <td><p-tag [severity]="row.activo ? 'success' : 'secondary'" [value]="row.activo ? 'Activo' : 'Inactivo'" /></td>
              <td>
                <span class="inline-flex" pTooltip="Requiere conexión" [tooltipDisabled]="online()">
                  <p-button
                    size="small"
                    severity="secondary"
                    [label]="row.activo ? 'Desactivar' : 'Activar'"
                    [disabled]="!online() || updatingUserId() === row.id"
                    (onClick)="toggleActive(row)"
                  />
                </span>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="5" class="py-6 text-center text-slate-500">No hay usuarios para mostrar.</td></tr>
          </ng-template>
        </p-table>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4" data-testid="new-user-form">
        <h2 class="text-xl font-semibold text-slate-800">Nuevo usuario</h2>
        <p class="mb-3 text-sm text-slate-500">
          Crea el usuario ERP y vincula su identidad de Keycloak en una sola operación. Si falla, no se crea ningún usuario.
        </p>
        <form class="grid max-w-3xl grid-cols-2 gap-3" (ngSubmit)="createUser()">
          <label class="flex flex-col gap-1 text-sm">
            Usuario *
            <input pInputText data-testid="new-user-username" name="newUsername" autocomplete="off"
              [ngModel]="newUsername()" (ngModelChange)="newUsername.set($event)" [disabled]="creating()" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Email *
            <input pInputText type="email" data-testid="new-user-email" name="newEmail" autocomplete="off"
              [ngModel]="newEmail()" (ngModelChange)="newEmail.set($event)" [disabled]="creating()" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Nombre completo *
            <input pInputText data-testid="new-user-nombre" name="newNombre" autocomplete="off"
              [ngModel]="newNombre()" (ngModelChange)="newNombre.set($event)" [disabled]="creating()" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Contraseña *
            <input pInputText type="password" data-testid="new-user-password" name="newPassword" autocomplete="new-password"
              [ngModel]="newPassword()" (ngModelChange)="newPassword.set($event)" [disabled]="creating()" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Rol *
            <p-select data-testid="new-user-rol" name="newRol" size="small" [options]="roleOptions" optionLabel="label" optionValue="value"
              [ngModel]="newRol()" (ngModelChange)="newRol.set($event)" [disabled]="creating()" appendTo="body" aria-label="Rol del nuevo usuario" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Odontólogo existente (opcional)
            <p-select data-testid="new-user-odontologo" name="newOdontologo" size="small" [options]="doctorOptions()" optionLabel="label" optionValue="id"
              [showClear]="true" [ngModel]="newOdontologoId()" (ngModelChange)="newOdontologoId.set($event)" [disabled]="creating()" appendTo="body"
              aria-label="Odontólogo existente" />
          </label>
          <label class="col-span-2 flex flex-col gap-1 text-sm">
            Subject de Keycloak *
            <input pInputText data-testid="new-user-subject" name="newSubject" autocomplete="off" spellcheck="false"
              [ngModel]="newSubject()" (ngModelChange)="newSubject.set($event)" [disabled]="creating()" />
          </label>
          <div class="col-span-2 flex justify-end">
            <p-button label="Crear usuario" type="submit" size="small" [loading]="creating()" [disabled]="!canCreate()" />
          </div>
        </form>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="text-xl font-semibold text-slate-800">Vincular identidad</h2>
        <p class="mb-3 text-sm text-slate-500">
          Asocia un usuario ERP activo con su identidad de Keycloak (subject). Es necesario para que un cajero pueda registrar cobros y egresos. El subject se envía tal como se escribe.
        </p>
        <form class="grid max-w-3xl grid-cols-2 gap-3" (ngSubmit)="linkIdentity()">
          <label class="flex flex-col gap-1 text-sm">
            Usuario ERP
            <p-select data-testid="link-user" name="linkUser" size="small" [options]="users()" optionLabel="username" optionValue="id"
              [ngModel]="linkUserId()" (ngModelChange)="linkUserId.set($event)" [disabled]="linking()" appendTo="body" aria-label="Usuario ERP a vincular" />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Subject de Keycloak
            <input pInputText data-testid="link-subject" name="linkSubject" autocomplete="off" spellcheck="false"
              [ngModel]="linkSubject()" (ngModelChange)="linkSubject.set($event)" [disabled]="linking()" />
          </label>
          <div class="col-span-2 flex justify-end">
            <p-button label="Vincular identidad" type="submit" size="small" [loading]="linking()" [disabled]="!canLink()" />
          </div>
        </form>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="mb-3 text-xl font-semibold text-slate-800">Logs de auditoría</h2>
        <p-table [value]="logs()" [loading]="loading()" size="small" stripedRows>
          <ng-template #header>
            <tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>ID de entidad</th><th>Detalle JSON</th></tr>
          </ng-template>
          <ng-template #body let-row>
            <tr>
              <td>{{ row.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ row.accion }}</td>
              <td>{{ row.entidadAfectada }}</td>
              <td>{{ row.entidadId }}</td>
              <td>{{ row.detalleJson }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="5" class="py-6 text-center text-slate-500">No hay registros de auditoría.</td></tr>
          </ng-template>
        </p-table>
      </div>
      }
    </section>
  `,
})
export class CompanySecurity implements OnInit {
  private readonly apollo = inject(Apollo);
  private readonly messages = inject(MessageService);
  private readonly network = inject(NetworkStatusService);
  private readonly auth = inject(AuthContextService);
  private readonly runtime = inject(ERP_RUNTIME);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly online = this.network.online;
  readonly isAdmin = computed(() => this.auth.roles().includes('ADMIN'));
  readonly currencySymbol = signal('');
  readonly roleOptions = CLINIC_ROLE_OPTIONS;
  readonly updatingUserId = signal<string | null>(null);
  readonly users = signal<UsuarioSistema[]>([]);
  readonly logs = signal<LogAuditoria[]>([]);
  readonly loading = signal(false);
  readonly fromCache = signal(false);
  readonly saving = signal(false);
  readonly linkUserId = signal<string | null>(null);
  readonly linkSubject = signal('');
  readonly linking = signal(false);
  readonly doctors = signal<Odontologo[]>([]);
  readonly doctorOptions = computed(() =>
    this.doctors().map((d) => ({ id: d.id, label: `${d.nombres} ${d.apellidos}` })));
  readonly newUsername = signal('');
  readonly newEmail = signal('');
  readonly newNombre = signal('');
  readonly newPassword = signal('');
  readonly newRol = signal<string | null>(null);
  readonly newOdontologoId = signal<string | null>(null);
  readonly newSubject = signal('');
  readonly creating = signal(false);
  /** One Idempotency-Key per user intention: kept on retries of the same payload, rotated when it is edited. */
  private readonly createAction = new IdempotentAction();
  private readonly runtimeRetired = signal(this.runtime.retired);
  private createGeneration = 0;
  private destroyed = false;
  readonly canCreate = computed(() =>
    !this.runtimeRetired() && !!this.auth.principalKey() && this.isAdmin() && this.online() && !this.creating() && !!this.newUsername() && !!this.newEmail() &&
    !!this.newNombre() && !!this.newPassword() && !!this.newRol() && this.newSubject().trim().length > 0);
  /** The subject is opaque: trimming is only used to reject an empty value, never to alter what is sent. */
  readonly canLink = computed(() =>
    this.isAdmin() && this.online() && !this.linking() && !!this.linkUserId() && this.linkSubject().trim().length > 0);

  readonly form = this.fb.group({
    nombreComercial: ['', Validators.required],
    nit: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    razonSocial: ['', (c: { value: string }) => (c.value.trim() ? null : { required: true })],
    direccion: ['', Validators.required],
    telefonoContacto: ['', Validators.required],
    emailContacto: ['', Validators.email],
  });

  constructor() {
    let principal = this.auth.principalKey();
    let admin = this.isAdmin();
    effect(() => {
      const currentPrincipal = this.auth.principalKey();
      const currentAdmin = this.isAdmin();
      if (currentPrincipal !== principal || (admin && !currentAdmin)) {
        untracked(() => this.invalidateCreate());
      }
      principal = currentPrincipal;
      admin = currentAdmin;
    });
    const unsubscribe = this.runtime.onRetire(() => {
      this.runtimeRetired.set(true);
      this.invalidateCreate();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      unsubscribe();
      this.invalidateCreate();
    });
  }

  private clearCreateForm(): void {
    this.newUsername.set(''); this.newEmail.set(''); this.newNombre.set(''); this.newPassword.set('');
    this.newRol.set(null); this.newOdontologoId.set(null); this.newSubject.set('');
    this.createAction.reset();
  }

  private invalidateCreate(): void {
    this.createGeneration++;
    this.clearCreateForm();
    this.creating.set(false);
  }

  ngOnInit(): void {
    void this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.auth.refresh();
    const identity = this.auth.principalKey() ?? undefined;
    const admin = this.isAdmin();
    const access = { online: this.network.isOnline(), identity, mode: this.runtime.cacheMode };
    // Rejection must leave no previous session's protected rows visible.
    this.users.set([]); this.logs.set([]); this.form.reset(); this.currencySymbol.set('');
    this.doctors.set([]);
    const [company, users, logs, doctors] = await Promise.allSettled([
      cachedCatalog('empresa', () => firstValueFrom(this.apollo.query({ query: OBTENER_CONFIGURACION_EMPRESA, variables: {}, fetchPolicy: 'network-only' })), access),
      admin ? cachedCatalog('usuarios', () => firstValueFrom(this.apollo.query({ query: LISTAR_USUARIOS, variables: {}, fetchPolicy: 'network-only' })), access) : Promise.resolve(null),
      admin ? cachedCatalog('logs', () => firstValueFrom(this.apollo.query({ query: LISTAR_AUDIT_LOGS, variables: { limite: AUDIT_LOG_LIMIT }, fetchPolicy: 'network-only' })), access) : Promise.resolve(null),
      admin ? firstValueFrom(this.apollo.query({ query: LISTAR_ODONTOLOGOS, variables: { soloActivos: true }, fetchPolicy: 'network-only' })) : Promise.resolve(null),
    ]);
    this.fromCache.set([company, users, logs].some((result) => result.status === 'fulfilled' && result.value?.fromCache));
    if (company.status === 'fulfilled' && company.value.data.data?.obtenerConfiguracionEmpresa) {
      const data = company.value.data.data.obtenerConfiguracionEmpresa;
      this.currencySymbol.set(data.monedaSimbolo);
      this.form.reset({
        nombreComercial: data.nombreComercial,
        nit: data.nit,
        razonSocial: data.razonSocial,
        direccion: data.direccion,
        telefonoContacto: data.telefonoContacto,
        emailContacto: data.emailContacto ?? '',
      });
      if (!admin) this.form.disable();
      else this.form.enable();
    }
    if (this.auth.principalKey() !== identity) { this.form.reset(); this.currencySymbol.set(''); this.loading.set(false); return; }
    if (this.isAdmin() && users.status === 'fulfilled') this.users.set([...(users.value?.data.data?.listarUsuarios ?? [])]);
    if (this.isAdmin() && logs.status === 'fulfilled') this.logs.set([...(logs.value?.data.data?.listarAuditLogs ?? [])]);
    if (this.isAdmin() && doctors.status === 'fulfilled') this.doctors.set([...(doctors.value?.data?.listarOdontologos ?? [])]);
    if ([company, users, logs, doctors].some((r) => r.status === 'rejected')) {
      this.messages.add({ severity: 'warn', summary: 'Algunos datos no se pudieron cargar', detail: 'Verifique su conexión e intente de nuevo.' });
    }
    this.loading.set(false);
  }

  changeRole(user: UsuarioSistema, rol: string): void {
    if (!this.isAdmin() || rol === user.rol.codigo) return;
    void this.updateUser(user, { rolCodigo: rol, activo: user.activo }, 'Rol actualizado');
  }

  toggleActive(user: UsuarioSistema): void {
    const activo = !user.activo;
    void this.updateUser(user, { rolCodigo: user.rol.codigo, activo }, activo ? 'Usuario activado' : 'Usuario desactivado');
  }

  private async updateUser(user: UsuarioSistema, input: ActualizarUsuarioInput, summary: string): Promise<void> {
    if (!this.isAdmin() || !this.online() || this.updatingUserId()) return;
    const owner = this.auth.principalKey();
    this.updatingUserId.set(user.id);
    try {
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_USUARIO, variables: { id: user.id, input } }));
      const updated = result.data?.actualizarUsuario;
      if (!updated) throw new Error('El backend no confirmó la actualización del usuario');
      if (this.auth.principalKey() !== owner || !this.isAdmin()) return;
      this.users.update((rows) => upsertById(rows, updated));
      await cachedCatalog('usuarios', async () => ({ data: { listarUsuarios: this.users() } }), { online: true, identity: owner ?? undefined, mode: this.runtime.cacheMode });
      this.messages.add({ severity: 'success', summary, detail: user.username });
    } catch (error) {
      // Re-emit the unchanged list so the role select snaps back to the stored value.
      this.users.update((rows) => [...rows]);
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo actualizar el usuario',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      this.updatingUserId.set(null);
    }
  }

  async linkIdentity(): Promise<void> {
    if (this.linking()) return;
    try {
      this.auth.refresh();
      if (!this.canLink()) return;
      const input = { usuarioId: this.linkUserId()!, keycloakSubject: this.linkSubject() };
      const owner = this.auth.principalKey();
      this.linking.set(true);
      const result = await firstValueFrom(this.apollo.mutate({
        mutation: VINCULAR_IDENTIDAD_USUARIO, variables: { input }, context: { [OWNER_CONTEXT_KEY]: owner },
      }));
      this.auth.refresh();
      if (!result.data?.vincularIdentidadUsuario) throw new Error('El backend no confirmó la vinculación de la identidad');
      if (this.auth.principalKey() !== owner || !this.isAdmin()) return;
      this.linkUserId.set(null);
      this.linkSubject.set('');
      this.messages.add({ severity: 'success', summary: 'Identidad vinculada' });
    } catch (error) {
      // The backend message (for example a conflict) is shown as plain text, unchanged.
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo vincular la identidad',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      this.linking.set(false);
    }
  }

  async createUser(): Promise<void> {
    if (this.creating() || this.runtime.retired || this.destroyed) return;
    try { this.auth.refresh(); } catch { return; }
    if (!this.canCreate()) return;
    const odontologoId = this.newOdontologoId();
    const input: CrearUsuarioConIdentidadInput = {
      usuario: {
        username: this.newUsername(), email: this.newEmail(), nombreCompleto: this.newNombre(),
        password: this.newPassword(), rolCodigo: this.newRol()!,
      },
      keycloakSubject: this.newSubject(),
      ...(odontologoId ? { odontologoId } : {}),
    };
    const owner = this.auth.principalKey();
    const generation = ++this.createGeneration;
    const current = () => !this.destroyed && !this.runtime.retired && this.createGeneration === generation &&
      this.auth.principalKey() === owner && !!owner && this.isAdmin();
    this.creating.set(true);
    try {
      const result = await firstValueFrom(this.apollo.mutate({
        mutation: CREAR_USUARIO_CON_IDENTIDAD, variables: { input },
        context: { [IDEMPOTENCY_CONTEXT_KEY]: this.createAction.keyFor(input), [OWNER_CONTEXT_KEY]: owner },
      }));
      if (!current()) return;
      this.auth.refresh();
      if (!current()) return;
      const created = result.data?.crearUsuarioConIdentidad;
      if (!created) throw new Error('El backend no confirmó la creación del usuario');
      // An exact replay returns the existing user: upsert keeps it listed once.
      this.users.update((rows) => upsertById(rows, created as UsuarioSistema));
      this.clearCreateForm();
      this.messages.add({ severity: 'success', summary: 'Usuario creado', detail: created.username });
    } catch (error) {
      if (!current()) return;
      try { this.auth.refresh(); } catch { return; }
      if (!current()) return;
      // Never expose arbitrary backend content. Retain the form and key for an explicit retry.
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo crear el usuario',
        detail: error instanceof Error && error.message === IDENTITY_CONFLICT
          ? IDENTITY_CONFLICT : 'No se pudo crear el usuario. Intente de nuevo.',
      });
    } finally {
      if (current()) this.creating.set(false);
    }
  }

  async save(): Promise<void> {
    if (!this.isAdmin() || !this.online() || this.saving() || this.form.invalid) return;
    const value = this.form.getRawValue();
    const input = {
      nombreComercial: value.nombreComercial.trim(),
      nit: value.nit.trim(),
      razonSocial: value.razonSocial.trim(),
      direccion: value.direccion.trim(),
      telefonoContacto: value.telefonoContacto.trim(),
      emailContacto: value.emailContacto.trim() || null,
    };
    const owner = this.auth.principalKey();
    this.saving.set(true);
    try {
      const result = await firstValueFrom(this.apollo.mutate({ mutation: ACTUALIZAR_CONFIGURACION_EMPRESA, variables: { input } }));
      if (!result.data?.actualizarConfiguracionEmpresa) throw new Error('El backend no confirmó los datos de la clínica');
      const company = result.data.actualizarConfiguracionEmpresa;
      await cachedCatalog('empresa', async () => ({ data: { obtenerConfiguracionEmpresa: company } }), { online: true, identity: owner ?? undefined, mode: this.runtime.cacheMode });
      this.messages.add({ severity: 'success', summary: 'Datos de la clínica actualizados' });
    } catch (error) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudieron guardar los datos',
        detail: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      this.saving.set(false);
    }
  }
}
