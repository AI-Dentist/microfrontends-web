import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, Subject } from 'rxjs';
import { MessageService } from 'primeng/api';
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
