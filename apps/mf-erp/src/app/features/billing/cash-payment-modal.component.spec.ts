import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { CashPaymentModal } from './cash-payment-modal.component';
import { orderFixture, receiptFixture } from './finance-fixtures.spec';

async function setup(confirmed = true) {
  const owner = signal('cashier-owner');
  const run = vi.fn(async (..._args: any[]): Promise<any> => ({ status: 'completed', data: { cobrarCuotaEnEfectivo: receiptFixture } }));
  const messages = new MessageService();
  const add = vi.spyOn(messages, 'add');
  await TestBed.configureTestingModule({ imports: [CashPaymentModal], providers: [
    { provide: MessageService, useValue: messages },
    { provide: AuthContextService, useValue: { refresh: () => null, principalKey: owner, roles: () => ['CAJERO'], requireFinancialUserId: () => { if (!confirmed) throw new Error('No hay un usuario cajero ERP confirmado para esta sesión.'); return 'cashier'; } } },
    { provide: CriticalMutationService, useValue: { run } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(CashPaymentModal);
  fixture.componentRef.setInput('orden', orderFixture);
  fixture.componentRef.setInput('cuota', orderFixture.cuotas[0]);
  const paid = vi.fn(), queued = vi.fn();
  fixture.componentInstance.paid.subscribe(paid); fixture.componentInstance.queued.subscribe(queued);
  await fixture.whenStable();
  return { fixture, run, add, owner, paid, queued };
}
function confirmButton(element: HTMLElement): HTMLButtonElement {
  return Array.from(element.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Confirmar cobro')!;
}
describe('cash collection footer', () => {
  it('clicking the visible native button sends only the exact wire input', async () => {
    const { fixture, run } = await setup();
    const button = confirmButton(fixture.nativeElement);
    expect(button.type).toBe('button');
    button.click();
    await fixture.whenStable();
    expect(run).toHaveBeenCalledWith('CobrarCuotaEnEfectivo', { input: { cuotaId: 'q', usuarioCajeroId: 'cashier', ciNitCliente: 'TEST-1', razonSocialCliente: 'Cliente Prueba' } }, expect.anything());
    fixture.destroy();
  });
  it('rejects unconfirmed cashier identity before sending', async () => {
    const { fixture, run, add } = await setup(false);
    confirmButton(fixture.nativeElement).click();
    await fixture.whenStable();
    expect(run).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', detail: 'No hay un usuario cajero ERP confirmado para esta sesión.' }));
    fixture.destroy();
  });
});

it('does not emit an invented receipt when MS1 returns no cash acknowledgement', async () => {
  const s = await setup();
  s.run.mockResolvedValueOnce({ status: 'completed', data: {} });
  confirmButton(s.fixture.nativeElement).click();
  await s.fixture.whenStable();
  expect(s.run).toHaveBeenCalledOnce();
  expect(s.paid).not.toHaveBeenCalled(); expect(s.queued).not.toHaveBeenCalled();
  expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  s.fixture.destroy();
});
it.each(['owner', 'close'])('ignores a late cash receipt after %s changes', async (change) => {
  const s = await setup();
  let resolve!: (data: any) => void;
  s.run.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  confirmButton(s.fixture.nativeElement).click(); await s.fixture.whenStable();
  if (change === 'owner') s.owner.set('another-cashier');
  else [...s.fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Cancelar')).click();
  resolve({ status: 'completed', data: { cobrarCuotaEnEfectivo: receiptFixture } });
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.paid).not.toHaveBeenCalled(); expect(s.queued).not.toHaveBeenCalled();
  s.fixture.destroy();
});

describe('hosted cashier identity', () => {
  const CASHIER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
  const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;
  const token = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles: ['CAJERO'] } });
  async function hosted(identity: (op: string) => any) {
    let currentToken = token;
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/erp/graphql', getAccessToken: () => currentToken });
    const query = vi.fn((options: any) => identity(options.query.definitions[0].name.value));
    const run = vi.fn(async (..._args: any[]): Promise<any> => ({ status: 'completed', data: { cobrarCuotaEnEfectivo: receiptFixture } }));
    const messages = new MessageService();
    const add = vi.spyOn(messages, 'add');
    await TestBed.configureTestingModule({ imports: [CashPaymentModal], providers: [
      { provide: ERP_RUNTIME, useValue: runtime },
      { provide: Apollo, useValue: { query } },
      { provide: MessageService, useValue: messages },
      { provide: CriticalMutationService, useValue: { run } },
    ] }).compileComponents();
    const open = async () => {
      const fixture = TestBed.createComponent(CashPaymentModal);
      fixture.componentRef.setInput('orden', orderFixture);
      fixture.componentRef.setInput('cuota', orderFixture.cuotas[0]);
      await fixture.whenStable();
      confirmButton(fixture.nativeElement).click();
      await fixture.whenStable();
      return fixture;
    };
    return { query, run, add, open, setRoles: (roles: string[]) => {
      currentToken = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles } });
    } };
  }
  afterEach(() => TestBed.resetTestingModule());

  it.each(['pending', 'resolved'])('sends no payment after a same-subject finance-role downgrade with lookup %s', async (boundary) => {
    const reply = new Subject<any>();
    const s = await hosted(() => reply);
    const fixture = await s.open();
    const paid = vi.fn(), queued = vi.fn();
    fixture.componentInstance.paid.subscribe(paid); fixture.componentInstance.queued.subscribe(queued);
    if (boundary === 'pending') s.setRoles(['RECEPCIONISTA']);
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    if (boundary === 'resolved') queueMicrotask(() => s.setRoles(['RECEPCIONISTA']));
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.run).not.toHaveBeenCalled();
    expect(paid).not.toHaveBeenCalled(); expect(queued).not.toHaveBeenCalled();
    expect(s.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    fixture.destroy();
  });
  it('sends the canonical Usuario id from obtenerMiUsuarioId, never the dev default, and resolves once per lease', async () => {
    const s = await hosted(() => of({ data: { obtenerMiUsuarioId: CASHIER } }));
    (await s.open()).destroy();
    (await s.open()).destroy();
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.query.mock.calls[0][0].variables ?? {}).toEqual({});
    expect(s.run).toHaveBeenCalledTimes(2);
    expect(s.run.mock.calls[0][1].input.usuarioCajeroId).toBe(CASHIER);
  });
  it.each([
    ['forbidden', () => throwError(() => new Error('Acceso denegado'))],
    ['not found', () => throwError(() => new Error('Usuario no encontrado'))],
    ['malformed', () => of({ data: { obtenerMiUsuarioId: 'keycloak-subject' } })],
    ['empty', () => of({ data: null })],
  ])('blocks the payment and sends no financial mutation when the lookup is %s', async (_name, reply) => {
    const s = await hosted(reply);
    (await s.open()).destroy();
    expect(s.query).toHaveBeenCalled();
    expect(s.run).not.toHaveBeenCalled();
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'No se pudo registrar el cobro' }));
  });
});
