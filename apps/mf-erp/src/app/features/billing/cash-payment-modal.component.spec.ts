import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
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
