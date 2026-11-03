import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Apollo } from 'apollo-angular';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { CompanySecurity } from './company-security.component';

const USER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
const users = [{ id: USER, username: 'caja1', email: 'c@x.test', nombreCompleto: 'Caja Uno', activo: true, rol: { id: 'r', codigo: 'CAJERO', nombre: 'Cajero', permisos: [] } }];
const company = { id: 'e', nombreComercial: 'Clinica', nit: '1', razonSocial: 'Clinica SRL', direccion: 'Calle', telefonoContacto: '7', emailContacto: null, monedaSimbolo: 'Bs' };

async function setup(roles: string[], mutateReply: () => any = () => of({ data: { vincularIdentidadUsuario: USER } })) {
  const operations: Record<string, any> = {
    ObtenerConfiguracionEmpresa: { data: { obtenerConfiguracionEmpresa: company } },
    ListarUsuarios: { data: { listarUsuarios: users } },
    ListarAuditLogs: { data: { listarAuditLogs: [] } },
  };
  const query = vi.fn((options: any) => of(operations[options.query.definitions[0].name.value]));
  const mutate = vi.fn((_options: any) => mutateReply());
  const messages = new MessageService();
  const add = vi.spyOn(messages, 'add');
  await TestBed.configureTestingModule({ imports: [CompanySecurity], providers: [
    // A hosted runtime keeps the catalog cache (IndexedDB) out of this test.
    { provide: ERP_RUNTIME, useValue: new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/graphql', getAccessToken: () => null }) },
    { provide: Apollo, useValue: { query, mutate } },
    { provide: MessageService, useValue: messages },
    { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    { provide: AuthContextService, useValue: { roles: () => roles, refresh: () => null, principalKey: () => 'owner' } },
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
  return { fixture, mutate, add, subject, type, pick, submit };
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
