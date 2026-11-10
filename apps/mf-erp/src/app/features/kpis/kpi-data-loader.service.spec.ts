import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, throwError, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { LISTAR_ODONTOLOGOS, LISTAR_PACIENTES } from '../../core/graphql/queries.graphql';
import { KpiAgendaError, KpiAgendaService } from './kpi-agenda.service';
import { FULL_KPIS_AGENDA_ENVELOPE_FIXTURE, FULL_KPIS_FINANCIEROS_FIXTURE } from './kpi-fixtures';
import { OBTENER_KPIS_FINANCIEROS } from './kpis.graphql';
import { KpiDataLoaderService } from './kpi-data-loader.service';
import { ms1KpiVariables } from './kpi-period';

describe('KpiDataLoaderService', () => {
  let service: KpiDataLoaderService;
  const rolesSignal = signal<string[]>(['ADMIN']);
  const onlineSignal = signal<boolean>(true);

  let apolloQueryMock: ReturnType<typeof vi.fn>;
  let agendaLoadMock: ReturnType<typeof vi.fn>;
  let reconnectHandlers: Array<() => void>;

  const validPeriod = { desde: '2026-11-01', hasta: '2026-11-30' };

  beforeEach(() => {
    rolesSignal.set(['ADMIN']);
    onlineSignal.set(true);

    apolloQueryMock = vi.fn((options: any) => {
      if (options.query === OBTENER_KPIS_FINANCIEROS) {
        return of({ data: { obtenerKpisFinancieros: FULL_KPIS_FINANCIEROS_FIXTURE } });
      }
      if (options.query === LISTAR_PACIENTES) {
        return of({ data: { listarPacientes: [{ id: 'pac-1', nombres: 'Juan', apellidos: 'Perez' }] } });
      }
      if (options.query === LISTAR_ODONTOLOGOS) {
        return of({ data: { listarOdontologos: [{ id: 'odo-1', nombres: 'Ana', apellidos: 'Gomez' }] } });
      }
      return of({ data: {} });
    });

    agendaLoadMock = vi.fn(async () => FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data);
    reconnectHandlers = [];

    TestBed.configureTestingModule({
      providers: [
        KpiDataLoaderService,
        { provide: AuthContextService, useValue: { roles: rolesSignal } },
        { provide: NetworkStatusService, useValue: { online: onlineSignal, onReconnect: (handler: () => void) => { reconnectHandlers.push(handler); return () => { reconnectHandlers = reconnectHandlers.filter((h) => h !== handler); }; } } },
        { provide: Apollo, useValue: { query: apolloQueryMock } },
        { provide: KpiAgendaService, useValue: { load: agendaLoadMock } },
      ],
    });

    service = TestBed.inject(KpiDataLoaderService);
  });

  it('loads the period that was blocked offline once the connection returns, without user action', async () => {
    onlineSignal.set(false);
    service.load(validPeriod);
    expect(apolloQueryMock).not.toHaveBeenCalled();
    expect(agendaLoadMock).not.toHaveBeenCalled();
    expect(service.ms1State().status).toBe('unavailable');

    onlineSignal.set(true);
    for (const handler of reconnectHandlers) handler();
    await Promise.resolve();

    expect(agendaLoadMock).toHaveBeenCalledWith(validPeriod);
    expect(apolloQueryMock).toHaveBeenCalledWith(expect.objectContaining({ query: OBTENER_KPIS_FINANCIEROS, variables: ms1KpiVariables(validPeriod) }));
  });

  it('does not reload on reconnect when nothing was blocked offline', () => {
    service.load(validPeriod);
    const calls = agendaLoadMock.mock.calls.length;
    for (const handler of reconnectHandlers) handler();
    expect(agendaLoadMock.mock.calls.length).toBe(calls);
  });

  it('rejects non-ADMIN users with explicit notice and sends ZERO network requests', () => {
    rolesSignal.set(['CAJERO']);
    service.load(validPeriod);

    expect(service.requiresAdmin()).toBe(true);
    expect(service.adminNotice()).toContain('Los KPIs ejecutivos requieren el rol ADMIN.');
    expect(apolloQueryMock).not.toHaveBeenCalled();
    expect(agendaLoadMock).not.toHaveBeenCalled();
  });

  it('detects offline state with explicit notice and sends ZERO network requests', () => {
    onlineSignal.set(false);
    service.load(validPeriod);

    expect(service.isOffline()).toBe(true);
    expect(service.offlineNotice()).toContain('Sin conexión: los KPIs están disponibles solo en línea.');
    expect(apolloQueryMock).not.toHaveBeenCalled();
    expect(agendaLoadMock).not.toHaveBeenCalled();
  });

  it('validates period and rejects invalid ranges with error and ZERO requests', () => {
    service.load({ desde: '2026-11-30', hasta: '2026-11-01' });

    expect(service.periodError()).toContain('La fecha de inicio no puede ser posterior');
    expect(apolloQueryMock).not.toHaveBeenCalled();
    expect(agendaLoadMock).not.toHaveBeenCalled();

    // >366 days
    service.load({ desde: '2024-01-01', hasta: '2025-01-02' });
    expect(service.periodError()).toContain('366');
    expect(apolloQueryMock).not.toHaveBeenCalled();
  });

  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 10));

  it('loads MS1, MS3 and catalogs in parallel for valid period and online ADMIN', async () => {
    service.load(validPeriod);

    expect(service.periodError()).toBeNull();
    expect(apolloQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: OBTENER_KPIS_FINANCIEROS,
        variables: ms1KpiVariables(validPeriod),
        fetchPolicy: 'network-only',
      }),
    );
    expect(agendaLoadMock).toHaveBeenCalledWith(validPeriod);

    await flushAsync();

    expect(service.ms1State().status).toBe('ready');
    expect(service.ms1State().data).toEqual(FULL_KPIS_FINANCIEROS_FIXTURE);

    expect(service.ms3State().status).toBe('ready');
    expect(service.ms3State().data).toEqual(FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data);

    const names = service.nameMaps();
    expect((names.pacientes as Map<string, string>)?.get('pac-1')).toBe('Juan Perez');
    expect((names.odontologos as Map<string, string>)?.get('odo-1')).toBe('Ana Gomez');
  });

  it('handles independent MS1 failure while MS3 still renders (D4)', async () => {
    apolloQueryMock.mockImplementation((options: any) => {
      if (options.query === OBTENER_KPIS_FINANCIEROS) {
        return throwError(() => new Error('MS1 downstream 500 error'));
      }
      return of({ data: {} });
    });

    service.load(validPeriod);
    await flushAsync();

    expect(service.ms1State().status).toBe('unavailable');
    expect(service.ms1State().error).toContain('Fuente no disponible');

    expect(service.ms3State().status).toBe('ready');
    expect(service.ms3State().data).toEqual(FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data);
  });

  it('handles independent MS3 failure while MS1 still renders (D4)', async () => {
    agendaLoadMock.mockRejectedValue(new KpiAgendaError('Connection refused', 503, 'NETWORK_ERROR'));

    service.load(validPeriod);
    await flushAsync();

    expect(service.ms3State().status).toBe('unavailable');
    expect(service.ms3State().error).toContain('Fuente no disponible');

    expect(service.ms1State().status).toBe('ready');
    expect(service.ms1State().data).toEqual(FULL_KPIS_FINANCIEROS_FIXTURE);
  });

  it('shows permission denied message on 401/403 status', async () => {
    agendaLoadMock.mockRejectedValue(new KpiAgendaError('Forbidden', 403, 'HTTP_ERROR'));

    service.load(validPeriod);
    await flushAsync();

    expect(service.ms3State().status).toBe('unavailable');
    expect(service.ms3State().error).toContain('Acceso no autorizado');
  });

  it('renders MS3 even if name catalogs fail (name fallback)', async () => {
    apolloQueryMock.mockImplementation((options: any) => {
      if (options.query === OBTENER_KPIS_FINANCIEROS) {
        return of({ data: { obtenerKpisFinancieros: FULL_KPIS_FINANCIEROS_FIXTURE } });
      }
      return throwError(() => new Error('Catalog service failed'));
    });

    service.load(validPeriod);
    await flushAsync();

    expect(service.ms3State().status).toBe('ready');
    expect(service.ms1State().status).toBe('ready');
    // Name maps empty but non-crashing
    expect((names => (names.pacientes as Map<string, string>)?.size ?? 0)(service.nameMaps())).toBe(0);
  });

  it('guards against late responses from an older period overwriting newer period (sequence guard)', async () => {
    const ms1Subject1 = new Subject<any>();
    const ms1Subject2 = new Subject<any>();

    let callCount = 0;
    apolloQueryMock.mockImplementation((options: any) => {
      if (options.query === OBTENER_KPIS_FINANCIEROS) {
        callCount++;
        return callCount === 1 ? ms1Subject1.asObservable() : ms1Subject2.asObservable();
      }
      return of({ data: {} });
    });

    // Load first period
    service.load({ desde: '2026-10-01', hasta: '2026-10-31' });

    // Load second period before first finishes
    service.load({ desde: '2026-11-01', hasta: '2026-11-30' });

    // Period 2 finishes first
    const period2Data = { ...FULL_KPIS_FINANCIEROS_FIXTURE, ingresos: { ...FULL_KPIS_FINANCIEROS_FIXTURE.ingresos, totalBs: 9999 } };
    ms1Subject2.next({ data: { obtenerKpisFinancieros: period2Data } });
    ms1Subject2.complete();
    await flushAsync();

    expect(service.ms1State().data?.ingresos.totalBs).toBe(9999);

    // Now late Period 1 arrives
    const period1Data = { ...FULL_KPIS_FINANCIEROS_FIXTURE, ingresos: { ...FULL_KPIS_FINANCIEROS_FIXTURE.ingresos, totalBs: 1111 } };
    ms1Subject1.next({ data: { obtenerKpisFinancieros: period1Data } });
    ms1Subject1.complete();
    await flushAsync();

    // Must still be period 2!
    expect(service.ms1State().data?.ingresos.totalBs).toBe(9999);
  });
});
