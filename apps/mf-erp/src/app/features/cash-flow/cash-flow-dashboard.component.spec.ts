import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { OBTENER_FLUJO_CAJA } from '../../core/graphql/queries.graphql';
import { OBTENER_FLUJO_CAJA_SIN_PDF } from './cash-flow.graphql';
import { CashFlowDashboard } from './cash-flow-dashboard.component';

for (const role of ['RECEPCIONISTA', 'CAJERO']) {
  it(`loads caja in one call with offset dates and safe PDF selection for ${role}`, async () => {
    const query = vi.fn(() => of({ data: { obtenerFlujoCaja: { totalIngresosBs: 50, totalEgresosBs: 10, saldoNetoBs: 40, movimientos: [] } } }));
    await TestBed.configureTestingModule({ imports: [CashFlowDashboard], providers: [
      MessageService,
      { provide: Apollo, useValue: { query } },
      { provide: AuthContextService, useValue: { refresh: () => null, roles: () => [role] } },
      { provide: NetworkStatusService, useValue: { online: () => true, isOnline: () => true } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CashFlowDashboard);
    await fixture.whenStable();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({ query: role === 'CAJERO' ? OBTENER_FLUJO_CAJA : OBTENER_FLUJO_CAJA_SIN_PDF,
      variables: { fechaInicio: expect.stringMatching(/T\d{2}:\d{2}:\d{2}\.000Z$/), fechaFin: expect.stringMatching(/T\d{2}:\d{2}:\d{2}\.999Z$/) }, fetchPolicy: 'network-only' });
    const expense = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(b => b.textContent?.trim() === 'Registrar egreso');
    expect(!!expense).toBe(role === 'CAJERO');
    fixture.destroy();
  });
}
