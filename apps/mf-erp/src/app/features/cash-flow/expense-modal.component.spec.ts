import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { LocalAiService } from '../../core/ai-local/local-ai.service';
import { CriticalMutationService } from '../../core/offline/critical-mutation.service';
import { ExpenseModal } from './expense-modal.component';

function deferred() { let resolve!: (v: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
async function setup(runtime = new ErpRuntimeContext()) {
  const timers: (() => void)[] = [];
  const native = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms: number, ...args: any[]) => {
    if (ms === 400) { timers.push(fn); return -timers.length; }
    return native(fn, ms, ...args);
  }) as any);
  const prediction = deferred();
  const ai = vi.fn(() => prediction.promise);
  const run = vi.fn(async (..._args: any[]): Promise<any> => ({ status: 'completed', data: {} }));
  const messages = { add: vi.fn() };
  const principal = signal('owner');
  await TestBed.configureTestingModule({ imports: [ExpenseModal], providers: [
    { provide: ERP_RUNTIME, useValue: runtime },
    { provide: LocalAiService, useValue: { suggestExpenseCategory: ai } },
    { provide: AuthContextService, useValue: { roles: () => ['ADMIN'], refresh: () => null,
      principalKey: principal, requireFinancialUserId: () => 'cashier' } },
    { provide: CriticalMutationService, useValue: { run } }, { provide: MessageService, useValue: messages },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(ExpenseModal);
  const saved = vi.fn(), closed = vi.fn();
  fixture.componentInstance.saved.subscribe(saved); fixture.componentInstance.closed.subscribe(closed);
  await fixture.whenStable();
  const type = (text: string) => { const el = fixture.nativeElement.querySelector('textarea'); el.value = text; el.dispatchEvent(new Event('input')); };
  const category = (value: string) => fixture.debugElement.query(By.css('p-select')).triggerEventHandler('ngModelChange', value);
  const submit = async () => {
    category('INSUMOS'); type('Guantes');
    fixture.debugElement.query(By.css('p-inputnumber')).triggerEventHandler('ngModelChange', 20);
    await fixture.whenStable();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Registrar egreso')) as HTMLButtonElement;
    button.click(); await fixture.whenStable();
  };
  const hint = () => fixture.nativeElement.querySelector('[data-testid="category-hint"]')?.textContent ?? '';
  return { fixture, type, category, submit, hint, timers, prediction, ai, run, saved, closed, messages, principal };
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

it('ignores stale inference immediately when description is cleared, before the next debounce', async () => {
  const s = await setup(); s.type('Alquiler'); s.timers[0]();
  expect(s.ai).toHaveBeenCalledOnce();
  s.type('');
  s.prediction.resolve({ category: 'ALQUILER', source: 'local-ai' });
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.hint()).not.toContain('Sugerido por IA');
  expect(s.run).not.toHaveBeenCalled();
});
it('preserves an operator category instead of overwriting it with late local inference', async () => {
  const s = await setup(); s.type('Guantes'); s.timers[0]();
  s.category('INSUMOS');
  s.prediction.resolve({ category: 'ALQUILER', source: 'local-ai' });
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.fixture.nativeElement.querySelector('.p-select-label').textContent.trim()).toBe('Insumos');
  expect(s.hint()).toBe('');
});
it('reports unavailable local AI and keeps manual categories usable without heuristic output', async () => {
  const s = await setup(); s.ai.mockRejectedValueOnce(new Error('Model unavailable'));
  s.type('Factura de luz'); s.timers[0]();
  await vi.waitFor(() => expect(s.hint()).toContain('no disponible'));
  s.category('OTROS'); await s.fixture.whenStable();
  expect(s.fixture.nativeElement.querySelector('.p-select-label').textContent.trim()).toBe('Otros');
  expect(s.run).not.toHaveBeenCalled();
});
it('does not announce/save/close an expense without a server acknowledgement', async () => {
  const s = await setup(); await s.submit(); await Promise.resolve(); await s.fixture.whenStable();
  expect(s.run).toHaveBeenCalledOnce();
  expect(s.saved).not.toHaveBeenCalled(); expect(s.closed).not.toHaveBeenCalled();
  expect(s.messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
});
it('ignores a completed expense response after the modal is destroyed', async () => {
  const s = await setup(), result = deferred(); s.run.mockReturnValueOnce(result.promise);
  await s.submit(); s.fixture.destroy();
  result.resolve({ status: 'completed', data: { registrarEgresoCaja: { id: 'expense' } } });
  await Promise.resolve(); await Promise.resolve();
  expect(s.messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
});

describe('hosted cashier identity', () => {
  const CASHIER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
  const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;
  const token = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles: ['ADMIN'] } });
  async function hosted(reply: () => any) {
    let currentToken = token;
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/erp/graphql', getAccessToken: () => currentToken });
    const query = vi.fn((options: any) => options.query.definitions[0].name.value === 'ObtenerMiUsuarioId' ? reply() : of({ data: {} }));
    const run = vi.fn(async (..._args: any[]): Promise<any> => ({ status: 'completed', data: { registrarEgresoCaja: { id: 'expense' } } }));
    const messages = { add: vi.fn() };
    await TestBed.configureTestingModule({ imports: [ExpenseModal], providers: [
      { provide: ERP_RUNTIME, useValue: runtime }, { provide: Apollo, useValue: { query } },
      { provide: LocalAiService, useValue: { suggestExpenseCategory: vi.fn() } },
      { provide: CriticalMutationService, useValue: { run } }, { provide: MessageService, useValue: messages },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(ExpenseModal);
    await fixture.whenStable();
    const area = fixture.nativeElement.querySelector('textarea'); area.value = 'Guantes'; area.dispatchEvent(new Event('input'));
    fixture.debugElement.query(By.css('p-select')).triggerEventHandler('ngModelChange', 'INSUMOS');
    fixture.debugElement.query(By.css('p-inputnumber')).triggerEventHandler('ngModelChange', 20);
    await fixture.whenStable();
    [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Registrar egreso')).click();
    await fixture.whenStable();
    return { query, run, messages, fixture, setRoles: (roles: string[]) => {
      currentToken = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles } });
    } };
  }
  afterEach(() => TestBed.resetTestingModule());

  it.each(['pending', 'resolved'])('sends no expense after a same-subject finance-role downgrade with lookup %s', async (boundary) => {
    const reply = new Subject<any>();
    const s = await hosted(() => reply);
    const saved = vi.fn(), closed = vi.fn();
    s.fixture.componentInstance.saved.subscribe(saved); s.fixture.componentInstance.closed.subscribe(closed);
    if (boundary === 'pending') s.setRoles(['RECEPCIONISTA']);
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    if (boundary === 'resolved') queueMicrotask(() => s.setRoles(['RECEPCIONISTA']));
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.run).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled(); expect(closed).not.toHaveBeenCalled();
    expect(s.messages.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  });
  it('registers the expense with the canonical Usuario id from obtenerMiUsuarioId', async () => {
    const s = await hosted(() => of({ data: { obtenerMiUsuarioId: CASHIER } }));
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.run.mock.calls[0][1].input.usuarioCajeroId).toBe(CASHIER);
  });
  it.each([
    ['forbidden', () => throwError(() => new Error('Acceso denegado'))],
    ['malformed', () => of({ data: { obtenerMiUsuarioId: 'keycloak-subject' } })],
  ])('blocks the expense and sends no mutation when the lookup is %s', async (_name, reply) => {
    const s = await hosted(reply);
    expect(s.run).not.toHaveBeenCalled();
    expect(s.messages.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'No se pudo registrar el egreso' }));
  });
});

it('uses local AI in a hosted scope and keeps manual category entry working', async () => {
  const s = await setup(new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/erp/graphql', getAccessToken: () => 'token' }));
  s.type('Guantes'); s.timers.forEach((run) => run());
  await s.fixture.whenStable();
  expect(s.ai).toHaveBeenCalledWith('Guantes');
  s.prediction.resolve({ category: 'MANTENIMIENTO', source: 'local-ai' });
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.hint()).toContain('Sugerido por IA');
  s.category('INSUMOS');
  s.fixture.debugElement.query(By.css('p-inputnumber')).triggerEventHandler('ngModelChange', 20);
  await s.fixture.whenStable();
  expect(s.fixture.nativeElement.textContent).toContain('Registrar egreso');
});
