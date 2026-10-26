import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, Subject } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { PaymentPlanModal } from './payment-plan-modal.component';
import { orderFixture } from './finance-fixtures.spec';

async function setup() {
  const owner = signal('local-admin');
  const mutate = vi.fn((_options: any): any => of({ data: { configurarPlanDePagos: orderFixture } }));
  const add = vi.fn();
  await TestBed.configureTestingModule({ imports: [PaymentPlanModal], providers: [
    { provide: MessageService, useValue: { add } },
    { provide: Apollo, useValue: { mutate } },
    { provide: AuthContextService, useValue: { refresh: () => null, roles: () => ['ADMIN'], principalKey: owner } },
    { provide: NetworkStatusService, useValue: { online: () => true } },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(PaymentPlanModal);
  fixture.componentRef.setInput('orden', orderFixture);
  const configured = vi.fn(); fixture.componentInstance.configuredOrder.subscribe(configured);
  await fixture.whenStable();
  const save = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.trim() === 'Guardar plan') as HTMLButtonElement;
  return { fixture, mutate, owner, add, configured, save };
}
it('carries the originating principal into deferred plan credentials', async () => {
  const { fixture, mutate, save } = await setup();
  expect(save).toBeDefined(); save.click(); await fixture.whenStable();
  expect(mutate).toHaveBeenCalledOnce();
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
    context: expect.objectContaining({ ownerPrincipal: 'local-admin', idempotencyKey: expect.any(String) }),
    variables: { input: expect.objectContaining({ ordenCobroId: orderFixture.id, modalidadPago: 'CONTADO', cantidadCuotas: 1, intervaloDias: 30 }) },
  }));
  fixture.destroy();
});
it('surfaces a missing plan acknowledgement instead of pretending it was saved', async () => {
  const s = await setup(); s.mutate.mockReturnValueOnce(of({ data: {} }));
  s.save.click(); await s.fixture.whenStable();
  expect(s.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  expect(s.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  expect(s.configured).not.toHaveBeenCalled();
  s.fixture.destroy();
});
it.each(['owner', 'destroy'])('ignores late plan responses after %s change', async (change) => {
  const s = await setup(), response = new Subject<any>();
  s.mutate.mockReturnValueOnce(response); s.save.click(); await s.fixture.whenStable();
  if (change === 'owner') s.owner.set('another-admin'); else s.fixture.destroy();
  response.next({ data: { configurarPlanDePagos: orderFixture } }); response.complete();
  await Promise.resolve(); if (change !== 'destroy') await s.fixture.whenStable();
  expect(s.add).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
  expect(s.configured).not.toHaveBeenCalled();
  if (change !== 'destroy') s.fixture.destroy();
});
