import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { LISTAR_ODONTOLOGOS, LISTAR_PACIENTES } from '../../core/graphql/queries.graphql';
import { KpiAgendaService } from './kpi-agenda.service';
import { KpiGridComponent } from './kpi-grid.component';
import { defaultKpiPeriod, ms1KpiVariables, validateKpiPeriod } from './kpi-period';
import { OBTENER_KPIS_FINANCIEROS } from './kpis.graphql';
import { EMPTY_KPIS_FINANCIEROS_FIXTURE, EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE } from './kpi-fixtures';

describe('KPI period query parameters through the rendered route', () => {
  let query: ReturnType<typeof vi.fn>;
  let agenda: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn(({ query: document }) => of({ data: document === OBTENER_KPIS_FINANCIEROS
      ? { obtenerKpisFinancieros: EMPTY_KPIS_FINANCIEROS_FIXTURE }
      : document === LISTAR_PACIENTES ? { listarPacientes: [] } : { listarOdontologos: [] } }));
    agenda = vi.fn(async () => EMPTY_KPIS_AGENDA_ENVELOPE_FIXTURE.data);
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'erp/kpis', component: KpiGridComponent }]),
      { provide: AuthContextService, useValue: { roles: signal(['ADMIN']) } },
      { provide: NetworkStatusService, useValue: { online: signal(true), onReconnect: () => () => {} } },
      { provide: Apollo, useValue: { query } },
      { provide: KpiAgendaService, useValue: { load: agenda } },
    ] });
  });
  afterEach(() => TestBed.resetTestingModule());

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, KpiGridComponent);
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement!;
  }

  it.each([
    '?desde=2026-02-31',
    '?desde=2026-02-01',
    '?hasta=2026-02-28',
    '?desde=',
    '?hasta=',
    '?desde=&hasta=',
    '?desde=&hasta=2026-02-28',
    '?desde=2026-02-01&hasta=',
    '?desde=bad&hasta=2026-02-28',
    '?desde=2026-02-01&hasta=bad',
    '?desde=2026-02-31&hasta=2026-03-01',
    '?desde=2026-02-01&hasta=2026-02-31',
    '?desde=2026-03-01&hasta=2026-02-28',
    '?desde=2025-01-01&hasta=2026-02-01',
  ])('rejects explicit invalid period %s without any KPI or catalog request', async (search) => {
    const params = new URLSearchParams(search);
    const validation = validateKpiPeriod({ desde: params.get('desde') ?? '', hasta: params.get('hasta') ?? '' });
    expect(validation.valid).toBe(false);
    const page = await open('/erp/kpis' + search);
    expect(page.querySelector('[data-testid="kpi-period-error"]')?.textContent?.trim())
      .toBe(validation.valid ? '' : validation.error);
    expect(query).not.toHaveBeenCalled();
    expect(agenda).not.toHaveBeenCalled();
  });

  it.each([
    { url: '/erp/kpis', period: () => defaultKpiPeriod() },
    { url: '/erp/kpis?desde=2026-02-01&hasta=2026-02-28', period: () => ({ desde: '2026-02-01', hasta: '2026-02-28' }) },
  ])('preserves the accepted period and source/catalog requests for $url', async ({ url, period }) => {
    const expected = period();
    const page = await open(url);
    expect(page.querySelector('[data-testid="kpi-period-error"]')).toBeNull();
    expect((page.querySelector('[name="desde"]') as HTMLInputElement).value).toBe(expected.desde);
    expect((page.querySelector('[name="hasta"]') as HTMLInputElement).value).toBe(expected.hasta);
    expect(agenda).toHaveBeenCalledExactlyOnceWith(expected);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: OBTENER_KPIS_FINANCIEROS, variables: ms1KpiVariables(expected) }));
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: LISTAR_PACIENTES }));
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ query: LISTAR_ODONTOLOGOS }));
  });
});
