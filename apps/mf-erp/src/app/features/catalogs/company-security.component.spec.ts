import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { IDEMPOTENCY_CONTEXT_KEY } from '../../core/graphql/graphql.provider';
import { CompanySecurity } from './company-security.component';

const USER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
const users = [{ id: USER, username: 'caja1', email: 'c@x.test', nombreCompleto: 'Caja Uno', activo: true, rol: { id: 'r', codigo: 'CAJERO', nombre: 'Cajero', permisos: [] } }];
const DOCTOR = '9a7d6c5b-1111-4222-8333-444455556666';
const doctors = [{ id: DOCTOR, ci: '1', matriculaProfesional: 'M-1', nombres: 'Ana', apellidos: 'Rojas', telefono: '7', email: null, porcentajeComision: '10', especialidades: [], activo: true }];
const company = { id: 'e', nombreComercial: 'Clinica', nit: '1', razonSocial: 'Clinica SRL', direccion: 'Calle', telefonoContacto: '7', emailContacto: null, monedaSimbolo: 'Bs' };

async function setup(roles: string[], mutateReply: () => any = () => of({ data: { vincularIdentidadUsuario: USER } })) {
  const currentRoles = signal(roles);
  const principal = signal<string | null>('owner');
  const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/graphql', getAccessToken: () => null });
  const onRetire = vi.spyOn(runtime, 'onRetire');
  const operations: Record<string, any> = {
    ObtenerConfiguracionEmpresa: { data: { obtenerConfiguracionEmpresa: company } },
    ListarUsuarios: { data: { listarUsuarios: users } },
    ListarAuditLogs: { data: { listarAuditLogs: [] } },
    ListarOdontologos: { data: { listarOdontologos: doctors } },
  };
  const query = vi.fn((options: any) => of(operations[options.query.definitions[0].name.value]));
  const mutate = vi.fn((_options: any) => mutateReply());
  const messages = new MessageService();
  const add = vi.spyOn(messages, 'add');
  await TestBed.configureTestingModule({ imports: [CompanySecurity], providers: [
    // A hosted runtime keeps the catalog cache (IndexedDB) out of this test.
    { provide: ERP_RUNTIME, useValue: runtime },
    { provide: Apollo, useValue: { query, mutate } },
    { provide: MessageService, useValue: messages },
    { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    { provide: AuthContextService, useValue: { roles: currentRoles, refresh: () => null, principalKey: principal } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(CompanySecurity);
  await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
  await fixture.whenStable();
  const subject = () => fixture.nativeElement.querySelector('[data-testid="link-subject"]') as HTMLInputElement | null;
  const type = (value: string) => { const el = subject()!; el.value = value; el.dispatchEvent(new Event('input')); };
  const pick = () => fixture.debugElement.query(By.css('[data-testid="link-user"]')).triggerEventHandler('ngModelChange', USER);
  const submit = async () => {
    await fixture.whenStable();
    ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => b.textContent?.trim() === 'Vincular identidad')!.click();
    await fixture.whenStable();
  };
  return { fixture, mutate, add, query, subject, type, pick, submit, principal, currentRoles, runtime, onRetire };
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

describe('ADMIN identity linking', () => {
  it('rechecks the current hosted ADMIN role before linking after a same-subject downgrade', async () => {
    const token = (roles: string[]) => `e30.${btoa(JSON.stringify({ iss: 'https://issuer', sub: 'subject', realm_access: { roles } }))}.signature`;
    let current = token(['ADMIN']);
    const mutate = vi.fn(() => of({ data: { vincularIdentidadUsuario: USER } }));
    const messages = { add: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: ERP_RUNTIME, useValue: new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/graphql', getAccessToken: () => current }) },
      { provide: Apollo, useValue: { mutate } },
      { provide: MessageService, useValue: messages },
      { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    ] });
    const component = TestBed.runInInjectionContext(() => new CompanySecurity());
    component.linkUserId.set(USER); component.linkSubject.set('opaque-subject');
    expect(component.canLink()).toBe(true);
    current = token(['CAJERO']);
    await component.linkIdentity();
    expect(mutate).not.toHaveBeenCalled();
    expect(messages.add).not.toHaveBeenCalled();
    expect(component.linkUserId()).toBe(USER);
    expect(component.linkSubject()).toBe('opaque-subject');
    expect(component.linking()).toBe(false);
  });
  it.each([['CAJERO'], ['RECEPCIONISTA'], ['ODONTOLOGO']])('is not rendered for %s', async (role) => {
    const s = await setup([role]);
    expect(s.subject()).toBeNull();
    expect(s.fixture.nativeElement.textContent).not.toContain('Vincular identidad');
    expect(s.mutate).not.toHaveBeenCalled();
  });
  it('links the selected ERP user to the opaque subject exactly as typed', async () => {
    const s = await setup(['ADMIN']);
    expect(s.subject()).not.toBeNull();
    s.pick(); s.type('  Sub-ABC/ñ  ');
    await s.submit();
    expect(s.mutate).toHaveBeenCalledOnce();
    const options = s.mutate.mock.calls[0][0];
    expect(options.mutation.definitions[0].name.value).toBe('VincularIdentidadUsuario');
    expect(options.variables).toEqual({ input: { usuarioId: USER, keycloakSubject: '  Sub-ABC/ñ  ' } });
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success', summary: 'Identidad vinculada' }));
  });
  it('sends nothing for a blank subject', async () => {
    const s = await setup(['ADMIN']);
    s.type('   '); s.pick();
    await s.submit();
    expect(s.mutate).not.toHaveBeenCalled();
  });
  it('sends nothing without a selected user', async () => {
    const s = await setup(['ADMIN']);
    s.type('subject');
    await s.submit();
    expect(s.mutate).not.toHaveBeenCalled();
  });
  it('shows the backend conflict message verbatim and keeps the typed subject', async () => {
    const s = await setup(['ADMIN'], () => throwError(() => new Error('La identidad ya está vinculada a otro usuario <b>x</b>')));
    s.pick(); s.type('subject-1');
    await s.submit();
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error', summary: 'No se pudo vincular la identidad', detail: 'La identidad ya está vinculada a otro usuario <b>x</b>',
    }));
    expect(s.subject()!.value).toBe('subject-1');
  });
});

// Selector contract for the "Nuevo usuario" form (Usuarios section, ADMIN only):
// [data-testid="new-user-form"] container titled "Nuevo usuario"; inputs new-user-username, new-user-email,
// new-user-nombre, new-user-password (type=password), new-user-subject; p-select new-user-rol and
// new-user-odontologo (ngModelChange); submit button labelled "Crear usuario".
const VALID = { username: 'nuevo1', email: 'n@x.test', nombre: 'Nuevo Uno', password: 'S3cret-pw!', subject: 'kc-sub-1' };
const SERVER_USER = { id: '5e0a4c1d-7a3b-4f55-9a11-0c2d3e4f5a6b', username: 'nuevo1', email: 'n@x.test', nombreCompleto: 'Nuevo Uno', activo: true, rol: { id: 'r2', codigo: 'CAJERO', nombre: 'Cajero', permisos: [] } };
const CONFLICT = 'BAD_REQUEST: La identidad de usuario ya está vinculada';

describe('ADMIN atomic user provisioning (Nuevo usuario)', () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const form = (s: Setup) => s.fixture.nativeElement.querySelector('[data-testid="new-user-form"]') as HTMLElement | null;
  const input = (s: Setup, id: string) => s.fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
  const write = (s: Setup, id: string, value: string) => { const el = input(s, id); el.value = value; el.dispatchEvent(new Event('input')); };
  const choose = (s: Setup, id: string, value: string | null) =>
    s.fixture.debugElement.query(By.css(`[data-testid="${id}"]`)).triggerEventHandler('ngModelChange', value);
  const button = (s: Setup) => ([...s.fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
    .find((b) => b.textContent?.trim() === 'Crear usuario')!;
  const fill = async (s: Setup, over: Partial<typeof VALID> & { rol?: string | null; odontologo?: string | null } = {}) => {
    const v = { ...VALID, rol: 'CAJERO', odontologo: null, ...over };
    write(s, 'new-user-username', v.username); write(s, 'new-user-email', v.email); write(s, 'new-user-nombre', v.nombre);
    write(s, 'new-user-password', v.password); write(s, 'new-user-subject', v.subject);
    choose(s, 'new-user-rol', v.rol); choose(s, 'new-user-odontologo', v.odontologo);
    await s.fixture.whenStable();
  };
  const click = async (s: Setup) => { await s.fixture.whenStable(); button(s).click(); await s.fixture.whenStable(); };
  const rowsFor = (s: Setup, username: string) =>
    ([...s.fixture.nativeElement.querySelectorAll('td')] as HTMLElement[]).filter((td) => td.textContent?.trim() === username).length;
  const key = (s: Setup, index: number) => s.mutate.mock.calls[index][0].context[IDEMPOTENCY_CONTEXT_KEY];
  const opName = (s: Setup, index: number) => s.mutate.mock.calls[index][0].mutation.definitions[0].name.value;
  const ok = () => of({ data: { crearUsuarioConIdentidad: SERVER_USER } });
  const fail = () => throwError(() => new Error(CONFLICT));

  it.each([['CAJERO'], ['RECEPCIONISTA'], ['ODONTOLOGO']])('does not render the form for %s and sends nothing', async (role) => {
    const s = await setup([role], ok);
    expect(form(s)).toBeNull();
    expect(s.fixture.nativeElement.textContent).not.toContain('Nuevo usuario');
    expect(s.fixture.nativeElement.textContent).not.toContain('Crear usuario');
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it('renders the Nuevo usuario form for ADMIN with a password-type password field', async () => {
    const s = await setup(['ADMIN'], ok);
    expect(form(s)).not.toBeNull();
    expect(form(s)!.textContent).toContain('Nuevo usuario');
    expect(input(s, 'new-user-password').type).toBe('password');
    expect(button(s)).toBeDefined();
  });

  it('loads the doctors from LISTAR_ODONTOLOGOS for the optional doctor selector', async () => {
    const s = await setup(['ADMIN'], ok);
    expect(s.query.mock.calls.some(([o]) => o.query.definitions[0].name.value === 'ListarOdontologos')).toBe(true);
  });

  it('calls crearUsuarioConIdentidad exactly once without odontologoId when no doctor is chosen', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    await click(s);
    expect(s.mutate).toHaveBeenCalledOnce();
    const options = s.mutate.mock.calls[0][0];
    expect(opName(s, 0)).toBe('CrearUsuarioConIdentidad');
    expect(options.variables).toEqual({ input: {
      usuario: { username: 'nuevo1', email: 'n@x.test', nombreCompleto: 'Nuevo Uno', password: 'S3cret-pw!', rolCodigo: 'CAJERO' },
      keycloakSubject: 'kc-sub-1',
    } });
    expect(options.variables.input.odontologoId ?? null).toBeNull();
    expect(Object.keys(options.variables.input).filter((k) => k !== 'odontologoId').sort()).toEqual(['keycloakSubject', 'usuario']);
  });

  it('sends the chosen existing doctor as odontologoId', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s, { odontologo: DOCTOR, rol: 'ODONTOLOGO' });
    await click(s);
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(s.mutate.mock.calls[0][0].variables).toEqual({ input: {
      usuario: { username: 'nuevo1', email: 'n@x.test', nombreCompleto: 'Nuevo Uno', password: 'S3cret-pw!', rolCodigo: 'ODONTOLOGO' },
      keycloakSubject: 'kc-sub-1', odontologoId: DOCTOR,
    } });
  });

  it('never uses CREAR_USUARIO nor VINCULAR_IDENTIDAD_USUARIO in this flow', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    await click(s);
    expect(s.mutate.mock.calls.map((_c, i) => opName(s, i))).toEqual(['CrearUsuarioConIdentidad']);
  });

  it('sends an Idempotency-Key through the shared operation context', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    await click(s);
    expect(s.mutate.mock.calls[0][0].context).toMatchObject({ [IDEMPOTENCY_CONTEXT_KEY]: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it('sends one request on a double click and disables the submit button while in flight', async () => {
    const pending = new Subject<any>();
    const s = await setup(['ADMIN'], () => pending);
    await fill(s);
    await s.fixture.whenStable();
    button(s).click(); button(s).click();
    await s.fixture.whenStable();
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(button(s).disabled).toBe(true);
    pending.next({ data: { crearUsuarioConIdentidad: SERVER_USER } }); pending.complete();
    await s.fixture.whenStable();
    expect(s.mutate).toHaveBeenCalledOnce();
  });

  it('reuses the SAME key when retrying the same payload after an error', async () => {
    const s = await setup(['ADMIN'], fail);
    await fill(s);
    await click(s);
    await click(s);
    expect(s.mutate).toHaveBeenCalledTimes(2);
    expect(key(s, 1)).toBe(key(s, 0));
    expect(s.mutate.mock.calls[1][0].variables).toEqual(s.mutate.mock.calls[0][0].variables);
  });

  it.each([
    ['username', 'new-user-username', 'nuevo2'], ['email', 'new-user-email', 'otro@x.test'],
    ['nombre', 'new-user-nombre', 'Otro Nombre'], ['password', 'new-user-password', 'Other-pw-1!'],
    ['subject', 'new-user-subject', 'kc-sub-2'],
  ])('produces a NEW key after editing %s following an error', async (_label, id, value) => {
    const s = await setup(['ADMIN'], fail);
    await fill(s);
    await click(s);
    write(s, id, value);
    await click(s);
    expect(s.mutate).toHaveBeenCalledTimes(2);
    expect(key(s, 1)).not.toBe(key(s, 0));
  });

  it('produces a NEW key after changing the role or the doctor following an error', async () => {
    const s = await setup(['ADMIN'], fail);
    await fill(s);
    await click(s);
    choose(s, 'new-user-rol', 'ODONTOLOGO');
    await click(s);
    choose(s, 'new-user-odontologo', DOCTOR);
    await click(s);
    expect(key(s, 1)).not.toBe(key(s, 0));
    expect(key(s, 2)).not.toBe(key(s, 1));
  });

  it('on error adds no user, shows the message, keeps the typed values and never echoes the password', async () => {
    const s = await setup(['ADMIN'], fail);
    await fill(s, { odontologo: DOCTOR, rol: 'ODONTOLOGO' });
    await click(s);
    expect(rowsFor(s, 'nuevo1')).toBe(0);
    expect(rowsFor(s, 'caja1')).toBe(1);
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: expect.stringContaining(CONFLICT) }));
    expect(input(s, 'new-user-username').value).toBe('nuevo1');
    expect(input(s, 'new-user-email').value).toBe('n@x.test');
    expect(input(s, 'new-user-nombre').value).toBe('Nuevo Uno');
    expect(input(s, 'new-user-password').value).toBe('S3cret-pw!');
    expect(input(s, 'new-user-subject').value).toBe('kc-sub-1');
    expect(JSON.stringify(s.add.mock.calls)).not.toContain('S3cret-pw!');
    expect(s.fixture.nativeElement.textContent).not.toContain('S3cret-pw!');
  });

  it('uses a generic safe error for unknown backend JSON without leaking credentials or subject to UI, messages or console', async () => {
    const token = 'synthetic-token-sensitive';
    const raw = JSON.stringify({ password: VALID.password, token, subject: VALID.subject });
    const logs = ['log', 'warn', 'error', 'info', 'debug'].map((name) => vi.spyOn(console, name as 'log').mockImplementation(() => {}));
    const s = await setup(['ADMIN'], () => throwError(() => new Error(raw)));
    await fill(s);
    await click(s);
    const message = s.add.mock.calls.map(([m]) => m as any).find((m) => m.severity === 'error');
    expect(message?.detail).toBe('No se pudo crear el usuario. Intente de nuevo.');
    const output = JSON.stringify([s.add.mock.calls, s.fixture.nativeElement.textContent, logs.map((spy) => spy.mock.calls)]);
    for (const secret of [VALID.password, token, VALID.subject, raw]) expect(output.includes(secret)).toBe(false);
    expect(rowsFor(s, 'nuevo1')).toBe(0);
  });

  it('retains the safe Spanish explanation for a known identity conflict', async () => {
    const s = await setup(['ADMIN'], fail);
    await fill(s);
    await click(s);
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: CONFLICT }));
    expect(rowsFor(s, 'nuevo1')).toBe(0);
  });

  it.each(['switch', 'retirement', 'role loss'])('clears an idle provisioning form on %s without writing', async (event) => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    if (event === 'switch') s.principal.set('other-owner');
    if (event === 'retirement') s.principal.set(null);
    if (event === 'role loss') s.currentRoles.set(['CAJERO']);
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    // Public signals remain inspectable even when the ADMIN form is no longer rendered.
    expect(s.fixture.componentInstance.newPassword()).toBe('');
    expect(s.fixture.componentInstance.newSubject()).toBe('');
    expect(s.fixture.componentInstance.newUsername()).toBe('');
    expect(s.mutate).not.toHaveBeenCalled();
    if (event === 'retirement') {
      s.currentRoles.set(['ADMIN']);
      s.fixture.detectChanges();
      await s.fixture.whenStable();
      button(s).click();
      expect(s.mutate).not.toHaveBeenCalled();
    }
  });

  it('immediately clears an idle form on real runtime retirement and permanently blocks submission', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    expect(s.runtime.retired).toBe(false);
    s.runtime.retire();
    expect(s.runtime.retired).toBe(true);
    expect(s.fixture.componentInstance.newPassword()).toBe('');
    expect(s.fixture.componentInstance.newSubject()).toBe('');
    s.runtime.retire();
    expect(s.runtime.retired).toBe(true);
    expect(s.fixture.componentInstance.newPassword()).toBe('');
    expect(s.fixture.componentInstance.newSubject()).toBe('');
    await s.fixture.whenStable();
    const password = s.fixture.nativeElement.querySelector('[data-testid="new-user-password"]') as HTMLInputElement | null;
    const subject = s.fixture.nativeElement.querySelector('[data-testid="new-user-subject"]') as HTMLInputElement | null;
    expect(password?.value ?? '').toBe('');
    expect(subject?.value ?? '').toBe('');
    // Even if the form remains visible and is filled again, a retired scope cannot submit.
    if (form(s)) {
      await fill(s);
      button(s).click();
      await s.fixture.whenStable();
    }
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it.each(['success', 'error'])('ignores a late %s after real runtime retirement', async (outcome) => {
    const pending = new Subject<any>();
    const s = await setup(['ADMIN'], () => pending);
    await fill(s);
    await click(s);
    expect(s.mutate).toHaveBeenCalledOnce();
    s.runtime.retire();
    expect(s.fixture.componentInstance.newPassword()).toBe('');
    expect(s.fixture.componentInstance.newSubject()).toBe('');
    s.add.mockClear();
    if (outcome === 'success') { pending.next({ data: { crearUsuarioConIdentidad: SERVER_USER } }); pending.complete(); }
    else pending.error(new Error('synthetic late failure'));
    await s.fixture.whenStable();
    expect(rowsFor(s, 'nuevo1')).toBe(0);
    expect(s.add).not.toHaveBeenCalled();
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(s.fixture.componentInstance.newPassword()).toBe('');
    expect(s.fixture.componentInstance.newSubject()).toBe('');
  });

  it('clears password and subject when the component is destroyed without a pending request', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    const component = s.fixture.componentInstance;
    s.fixture.destroy();
    expect(component.newPassword()).toBe('');
    expect(component.newSubject()).toBe('');
    expect(component.newUsername()).toBe('');
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it('unsubscribes its runtime retirement listener on destruction', async () => {
    const s = await setup(['ADMIN'], ok);
    expect(s.onRetire).toHaveBeenCalledOnce();
    const unsubscribe = s.onRetire.mock.results[0].value;
    expect(typeof unsubscribe).toBe('function');
    const component = s.fixture.componentInstance;
    s.fixture.destroy();
    component.newPassword.set('post-destroy-marker');
    s.runtime.retire();
    expect(component.newPassword()).toBe('post-destroy-marker');
  });

  it.each(['success', 'error'])('ignores a late %s from the old principal while the new principal has an active request', async (outcome) => {
    const oldRequest = new Subject<any>();
    const newRequest = new Subject<any>();
    let calls = 0;
    const s = await setup(['ADMIN'], () => calls++ === 0 ? oldRequest : newRequest);
    await fill(s);
    await click(s);
    s.principal.set('other-owner');
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    await fill(s, { username: 'other-user', password: 'other-password', subject: 'other-subject' });
    await click(s);
    expect(s.mutate).toHaveBeenCalledTimes(2);
    expect(button(s).disabled).toBe(true);
    s.add.mockClear();
    if (outcome === 'success') { oldRequest.next({ data: { crearUsuarioConIdentidad: SERVER_USER } }); oldRequest.complete(); }
    else oldRequest.error(new Error('old request failure'));
    await s.fixture.whenStable();
    expect(rowsFor(s, 'nuevo1')).toBe(0);
    expect(s.add).not.toHaveBeenCalled();
    expect(input(s, 'new-user-username').value).toBe('other-user');
    expect(input(s, 'new-user-password').value).toBe('other-password');
    expect(input(s, 'new-user-subject').value).toBe('other-subject');
    expect(button(s).disabled).toBe(true);
    newRequest.complete();
  });

  it('on success lists the returned user once, names the username, clears the form and rotates the key', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    await click(s);
    expect(rowsFor(s, 'nuevo1')).toBe(1);
    const success = s.add.mock.calls.map(([m]) => m as any).find((m) => m.severity === 'success');
    expect(JSON.stringify(success)).toContain('nuevo1');
    expect(JSON.stringify(s.add.mock.calls)).not.toContain('S3cret-pw!');
    for (const id of ['new-user-username', 'new-user-email', 'new-user-nombre', 'new-user-password', 'new-user-subject']) {
      expect(input(s, id).value).toBe('');
    }
    await fill(s);
    await click(s);
    expect(s.mutate).toHaveBeenCalledTimes(2);
    expect(key(s, 1)).not.toBe(key(s, 0));
    expect(rowsFor(s, 'nuevo1')).toBe(1);
  });

  it('does not duplicate a user already listed when the server replays it', async () => {
    const s = await setup(['ADMIN'], () => of({ data: { crearUsuarioConIdentidad: users[0] } }));
    expect(rowsFor(s, 'caja1')).toBe(1);
    await fill(s, { username: 'caja1', email: 'c@x.test', nombre: 'Caja Uno' });
    await click(s);
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(rowsFor(s, 'caja1')).toBe(1);
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });

  it('disables submit and sends nothing while every required field is empty', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s, { username: '', email: '', nombre: '', password: '', subject: '', rol: null });
    expect(button(s).disabled).toBe(true);
    button(s).click();
    await s.fixture.whenStable();
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ['username', { username: '' }], ['email', { email: '' }], ['nombre', { nombre: '' }],
    ['password', { password: '' }], ['rol', { rol: null }], ['subject empty', { subject: '' }],
    ['subject blank', { subject: '   ' }],
  ])('disables submit when only %s is missing', async (_label, over) => {
    const s = await setup(['ADMIN'], ok);
    await fill(s, over as any);
    expect(button(s).disabled).toBe(true);
    button(s).click();
    await s.fixture.whenStable();
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it('enables submit when every required field is valid', async () => {
    const s = await setup(['ADMIN'], ok);
    await fill(s);
    expect(button(s).disabled).toBe(false);
  });
});
