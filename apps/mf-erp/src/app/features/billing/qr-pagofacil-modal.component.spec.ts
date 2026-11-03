import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ERP_RUNTIME, ErpRuntimeContext } from '../../core/runtime/erp-runtime-context';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { GENERAR_QR_PAGOFACIL, SIMULAR_CONFIRMACION_QR_DEV } from '../../core/graphql/mutations.graphql';
import { OBTENER_ORDEN_COBRO_DETALLE } from '../../core/graphql/queries.graphql';
import { QrPagofacilModal } from './qr-pagofacil-modal.component';
import { orderFixture, receiptFixture } from './finance-fixtures.spec';

const qr = { id: 'qr', cuotaId: 'q', pagofacilTransactionId: 'MOCK-TEST', qrImagenBase64: 'aW1hZ2U=', montoBs: 50, estado: 'GENERADO', fechaExpiracion: null };
async function setup(roles = ['ADMIN'], expiry: string | null = null) {
  let principal = 'local-cashier';
  const generatedQr = { ...qr, fechaExpiracion: expiry };
  const mutate = vi.fn(({ mutation }: any) => of({ data: mutation === SIMULAR_CONFIRMACION_QR_DEV ? { simularConfirmacionQrDev: receiptFixture } : { generarQrPagoFacil: generatedQr } }));
  const query = vi.fn((_options: any): any => of({ data: { obtenerOrdenCobroDetalle: { ...orderFixture, cuotas: [{ ...orderFixture.cuotas[0], estado: 'PAGADA', fechaPago: '2026-10-22T10:01:00-04:00' }] } } }));
  const messages = new MessageService();
  const add = vi.spyOn(messages, 'add');
  await TestBed.configureTestingModule({ imports: [QrPagofacilModal], providers: [
    { provide: MessageService, useValue: messages },
    { provide: Apollo, useValue: { mutate, query } },
    { provide: AuthContextService, useValue: { refresh: () => null, roles: () => roles, requireFinancialUserId: () => 'cashier', principalKey: () => principal } },
    { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(QrPagofacilModal);
  fixture.componentRef.setInput('orden', orderFixture);
  fixture.componentRef.setInput('cuota', orderFixture.cuotas[0]);
  const paid = vi.fn();
  fixture.componentInstance.paid.subscribe(paid);
  await fixture.whenStable();
  return { fixture, mutate, query, paid, add, setPrincipal: (value: string) => { principal = value; } };
}
function button(element: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(element.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
}
describe('real QR payment flow', () => {
  it('generates with payer details, polls order quota and never invents a receipt or WhatsApp delivery', async () => {
    const { fixture, mutate, query, paid, add } = await setup();
    button(fixture.nativeElement, 'Generar QR')!.click();
    await fixture.whenStable();
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ mutation: GENERAR_QR_PAGOFACIL, variables: { cuotaId: 'q', ciNitCliente: 'TEST-1', razonSocialCliente: 'Cliente Prueba' }, context: expect.anything() }));
    expect(fixture.nativeElement.textContent).toContain('GENERADO');
    expect(fixture.nativeElement.textContent).toContain('Vencimiento no informado');
    button(fixture.nativeElement, 'Verificar pago')!.click();
    await fixture.whenStable();
    expect(query).toHaveBeenCalledWith({ query: OBTENER_ORDEN_COBRO_DETALLE, variables: { id: 'o' }, fetchPolicy: 'network-only', context: { ownerPrincipal: 'local-cashier' } });
    expect(paid).toHaveBeenCalledWith(null);
    expect(fixture.nativeElement.textContent).toContain('Pago confirmado');
    expect(fixture.nativeElement.textContent).not.toContain('enviado por WhatsApp');
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('Recibo no disponible aquí') }));
    fixture.destroy();
  });
  it('consumes the simulator response as a receipt and reports actual WhatsApp state', async () => {
    const { fixture, mutate, paid, add } = await setup();
    button(fixture.nativeElement, 'Generar QR')!.click();
    await fixture.whenStable();
    const simulate = button(fixture.nativeElement, '[Simular Pago Confirmado (Dev)]');
    // Production builds must not expose this operation.
    if (simulate) {
      simulate.click();
      await fixture.whenStable();
      expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({ mutation: SIMULAR_CONFIRMACION_QR_DEV, variables: { pagofacilTransactionId: 'MOCK-TEST' } }));
      expect(paid).toHaveBeenCalledWith(receiptFixture);
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ detail: 'Recibo disponible. WhatsApp no enviado.' }));
    } else {
      expect(mutate).toHaveBeenCalledTimes(1);
    }
    fixture.destroy();
  });
  it('carries the originating principal into both deferred QR mutation contexts', async () => {
    const { fixture, mutate } = await setup();
    button(fixture.nativeElement, 'Generar QR')!.click();
    await fixture.whenStable();
    const simulate = button(fixture.nativeElement, '[Simular Pago Confirmado (Dev)]');
    expect(simulate).toBeDefined();
    simulate!.click();
    await fixture.whenStable();
    expect(mutate).toHaveBeenCalledTimes(2);
    for (const [options] of mutate.mock.calls) {
      expect(options.context).toMatchObject({ ownerPrincipal: 'local-cashier', idempotencyKey: expect.any(String) });
    }
    fixture.destroy();
  });

  it('stops polling immediately on close and on destroy', async () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { fixture } = await setup();
    button(fixture.nativeElement, 'Generar QR')!.click();
    await fixture.whenStable();
    button(fixture.nativeElement, 'Cerrar')!.click();
    expect(clear).toHaveBeenCalled();
    fixture.destroy();
    clear.mockRestore();
  });
  it('hides collection actions from receptionist', async () => {
    const { fixture, mutate } = await setup(['RECEPCIONISTA']);
    expect(button(fixture.nativeElement, 'Generar QR')).toBeUndefined();
    expect(mutate).not.toHaveBeenCalled();
    fixture.destroy();
  });
});

afterEach(() => vi.restoreAllMocks());

it('counts down the actual expiry, stops new simulation at zero and never equates expiry with payment', async () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  const now = vi.spyOn(Date, 'now').mockReturnValue(start);
  const intervals: { callback: () => void; ms: number }[] = [];
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, ms: number) => {
    intervals.push({ callback, ms }); return intervals.length;
  }) as any);
  const { fixture, mutate, paid, query } = await setup(['ADMIN'], new Date(start + 2000).toISOString());
  button(fixture.nativeElement, 'Generar QR')!.click();
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('00:02');
  const clock = intervals.find((entry) => entry.ms === 1000);
  expect(clock).toBeDefined();
  now.mockReturnValue(start + 3000);
  clock!.callback();
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('00:00');
  expect(fixture.nativeElement.textContent).toContain('vencido');
  const simulate = button(fixture.nativeElement, '[Simular Pago Confirmado (Dev)]')!;
  expect(simulate.disabled).toBe(true);
  simulate.click();
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(paid).not.toHaveBeenCalled();
  // A timely bank payment may arrive late; only an explicit server read can confirm.
  button(fixture.nativeElement, 'Verificar pago')!.click();
  await fixture.whenStable();
  expect(query).toHaveBeenCalledOnce();
  expect(paid).toHaveBeenCalledWith(null);
  fixture.destroy();
});

it('does not publish a late paid-quota reply to a different principal', async () => {
  const s = await setup();
  button(s.fixture.nativeElement, 'Generar QR')!.click();
  await s.fixture.whenStable();
  const response = new Subject<any>();
  s.query.mockReturnValueOnce(response);
  button(s.fixture.nativeElement, 'Verificar pago')!.click();
  await s.fixture.whenStable();
  s.setPrincipal('another-cashier');
  response.next({ data: { obtenerOrdenCobroDetalle: { ...orderFixture,
    cuotas: [{ ...orderFixture.cuotas[0], estado: 'PAGADA', fechaPago: '2026-01-01' }] } } });
  response.complete();
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.paid).not.toHaveBeenCalled();
  expect(s.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  expect(s.query.mock.calls[0][0].context).toEqual({ ownerPrincipal: 'local-cashier' });
  s.fixture.destroy();
});

describe('hosted QR flow', () => {
  const CASHIER = '3f2b1c9e-0a54-4d57-9c1e-6d1f7a2b8c10';
  const jwt = (claims: object) => `e30.${btoa(JSON.stringify(claims))}.signature`;
  const token = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles: ['CAJERO'] } });
  async function hosted(lookup: () => any) {
    let currentToken = token;
    const runtime = new ErpRuntimeContext({ mode: 'hosted', graphqlUrl: 'https://api.example/erp/graphql', getAccessToken: () => currentToken });
    const mutate = vi.fn(({ mutation }: any) => of({ data: mutation === SIMULAR_CONFIRMACION_QR_DEV ? { simularConfirmacionQrDev: receiptFixture } : { generarQrPagoFacil: qr } }));
    const query = vi.fn((options: any) => options.query.definitions[0].name.value === 'ObtenerMiUsuarioId' ? lookup() : of({ data: {} }));
    const messages = new MessageService();
    const add = vi.spyOn(messages, 'add');
    await TestBed.configureTestingModule({ imports: [QrPagofacilModal], providers: [
      { provide: ERP_RUNTIME, useValue: runtime }, { provide: MessageService, useValue: messages },
      { provide: Apollo, useValue: { mutate, query } },
      { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(QrPagofacilModal);
    fixture.componentRef.setInput('orden', orderFixture);
    fixture.componentRef.setInput('cuota', orderFixture.cuotas[0]);
    await fixture.whenStable();
    button(fixture.nativeElement, 'Generar QR')!.click();
    await fixture.whenStable();
    return { fixture, mutate, query, add, setRoles: (roles: string[]) => {
      currentToken = jwt({ iss: 'https://issuer', sub: 'keycloak-subject', realm_access: { roles } });
    } };
  }
  afterEach(() => TestBed.resetTestingModule());

  it.each(['close', 'destroy'])('sends no new mutation when lookup completes after %s', async (retirement) => {
    const reply = new Subject<any>();
    const s = await hosted(() => reply);
    const paid = vi.fn(); s.fixture.componentInstance.paid.subscribe(paid);
    if (retirement === 'close') button(s.fixture.nativeElement, 'Cerrar')!.click();
    else s.fixture.destroy();
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(s.query).toHaveBeenCalledOnce();
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.add).not.toHaveBeenCalled();
    expect(paid).not.toHaveBeenCalled();
    if (retirement === 'close') s.fixture.destroy();
  });
  it.each(['pending', 'resolved'])('sends no QR after a same-subject finance-role downgrade with lookup %s', async (boundary) => {
    const reply = new Subject<any>();
    const s = await hosted(() => reply);
    if (boundary === 'pending') s.setRoles(['RECEPCIONISTA']);
    reply.next({ data: { obtenerMiUsuarioId: CASHIER } }); reply.complete();
    if (boundary === 'resolved') queueMicrotask(() => s.setRoles(['RECEPCIONISTA']));
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    s.fixture.destroy();
  });
  it('generates against the real API after resolving the cashier, and neither renders nor calls the dev simulator', async () => {
    const s = await hosted(() => of({ data: { obtenerMiUsuarioId: CASHIER } }));
    expect(s.query.mock.calls.filter(([o]) => o.query.definitions[0].name.value === 'ObtenerMiUsuarioId')).toHaveLength(1);
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(s.mutate.mock.calls[0][0].mutation).toBe(GENERAR_QR_PAGOFACIL);
    expect(button(s.fixture.nativeElement, '[Simular Pago Confirmado (Dev)]')).toBeUndefined();
    await (s.fixture.componentInstance as any).simulate();
    expect(s.mutate).toHaveBeenCalledOnce();
    expect(s.mutate.mock.calls.some(([o]) => o.mutation === SIMULAR_CONFIRMACION_QR_DEV)).toBe(false);
    s.fixture.destroy();
  });
  it.each([
    ['forbidden', () => throwError(() => new Error('Acceso denegado'))],
    ['malformed', () => of({ data: { obtenerMiUsuarioId: 'keycloak-subject' } })],
  ])('generates no QR when the cashier lookup is %s', async (_name, lookup) => {
    const s = await hosted(lookup);
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', summary: 'No se pudo generar el QR' }));
    s.fixture.destroy();
  });
});
