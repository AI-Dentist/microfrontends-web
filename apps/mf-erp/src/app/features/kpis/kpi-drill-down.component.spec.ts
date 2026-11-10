import { Directive, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { NgxEchartsDirective } from 'ngx-echarts';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { QR_PAGOFACIL_NOTE, INASISTENCIA_OBSERVADA_NOTE } from './kpi-definitions';
import {
  FULL_KPIS_AGENDA_ENVELOPE_FIXTURE,
  FULL_KPIS_FINANCIEROS_FIXTURE,
  EMPTY_KPIS_FINANCIEROS_FIXTURE,
} from './kpi-fixtures';
import { KpiDataLoaderService, SourceState } from './kpi-data-loader.service';
import { KpiDrillDownComponent } from './kpi-drill-down.component';
import { buildKpiView } from './kpi-views';
import type { KpisFinancieros } from './kpis.graphql';
import type { KpisAgenda } from './kpi-agenda.service';

@Directive({ selector: '[echarts]' })
class ChartFixture {
  readonly options = input<any>();
}

describe('KpiDrillDownComponent', () => {
  let fixture: ComponentFixture<KpiDrillDownComponent>;
  const rolesSignal = signal<string[]>(['ADMIN']);
  const onlineSignal = signal<boolean>(true);

  const ms1StateSignal = signal<SourceState<KpisFinancieros>>({
    status: 'ready',
    data: FULL_KPIS_FINANCIEROS_FIXTURE,
    error: null,
  });

  const ms3StateSignal = signal<SourceState<KpisAgenda>>({
    status: 'ready',
    data: FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data,
    error: null,
  });

  const paramMapSignal = signal(convertToParamMap({ kpi: 'ingresos' }));
  const loadSpy = vi.fn();

  async function createComponent(kpiParam: string = 'ingresos') {
    TestBed.resetTestingModule();
    paramMapSignal.set(convertToParamMap({ kpi: kpiParam }));

    await TestBed.configureTestingModule({
      imports: [KpiDrillDownComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ kpi: kpiParam }), queryParamMap: convertToParamMap({}) }, paramMap: paramMapSignal } },
        { provide: AuthContextService, useValue: { roles: rolesSignal } },
        { provide: NetworkStatusService, useValue: { online: onlineSignal } },
        {
          provide: KpiDataLoaderService,
          useValue: {
            ms1State: ms1StateSignal,
            ms3State: ms3StateSignal,
            nameMaps: signal({ pacientes: new Map(), odontologos: new Map() }),
            loading: signal(false),
            period: signal({ desde: '2026-11-01', hasta: '2026-11-30' }),
            periodError: signal(null),
            requiresAdmin: signal(false),
            adminNotice: signal(null),
            isOffline: signal(false),
            offlineNotice: signal(null),
            load: loadSpy,
            getView: (id: any) => {
              if (id === 'unknown-kpi') return { status: 'unavailable', error: 'KPI no encontrado' };
              if (!rolesSignal().includes('ADMIN')) {
                return { status: 'unavailable', error: 'Los KPIs ejecutivos requieren el rol ADMIN.' };
              }
              if (!onlineSignal()) {
                return { status: 'unavailable', error: 'Sin conexión: los KPIs están disponibles solo en línea.' };
              }
              const isMs1 = ['ingresos', 'morosidad', 'servicios', 'flujo-caja', 'cobranza-metodo'].includes(id);
              const st = isMs1 ? ms1StateSignal() : ms3StateSignal();
              if (st.status === 'ready' && st.data) {
                return { status: 'ready', view: buildKpiView(id, st.data) };
              }
              return { status: st.status, error: st.error };
            },
          },
        },
      ],
    })
      .overrideComponent(KpiDrillDownComponent, {
        remove: { imports: [NgxEchartsDirective] },
        add: { imports: [ChartFixture] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(KpiDrillDownComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    rolesSignal.set(['ADMIN']);
    onlineSignal.set(true);
    ms1StateSignal.set({
      status: 'ready',
      data: FULL_KPIS_FINANCIEROS_FIXTURE,
      error: null,
    });
    ms3StateSignal.set({
      status: 'ready',
      data: FULL_KPIS_AGENDA_ENVELOPE_FIXTURE.data,
      error: null,
    });
    loadSpy.mockClear();
  });

  it('renders title, period filter and back link preserving query params for KPI 1 (ingresos)', async () => {
    await createComponent('ingresos');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Ingresos del período (Bs)');
    expect(el.querySelector('input[aria-label="Desde"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Hasta"]')).not.toBeNull();

    const backLink = fixture.debugElement.query(By.css('[data-testid="back-to-kpis"]'));
    expect(backLink).not.toBeNull();
    const rl = backLink.injector.get(RouterLink);
    expect(rl.queryParamsHandling).toBe('preserve');
  });

  it('renders ECharts chart options and backing table for KPI 1 (ingresos)', async () => {
    await createComponent('ingresos');

    const chartEl = fixture.debugElement.query(By.directive(ChartFixture));
    expect(chartEl).not.toBeNull();
    const chart = chartEl.injector.get(ChartFixture);
    expect(chart.options().series[0].type).toBe('bar');
    expect(chart.options().series[0].name).toBe('Ingresos (Bs)');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2026-11-02');
    expect(el.textContent).toContain('1200');
  });

  it('renders chart and backing table for KPI 3 (pacientes-frecuentes)', async () => {
    await createComponent('pacientes-frecuentes');

    const chartEl = fixture.debugElement.query(By.directive(ChartFixture));
    expect(chartEl).not.toBeNull();
    const chart = chartEl.injector.get(ChartFixture);
    expect(chart.options().series.length).toBe(2);
    expect(chart.options().series[0].name).toBe('Total Citas');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pacientes más frecuentes (ranking)');
    expect(el.textContent).toContain('Total Citas');
    expect(el.textContent).toContain('Completadas');
  });

  it('renders chart and backing table for KPI 9 (cobranza-metodo)', async () => {
    await createComponent('cobranza-metodo');

    const chartEl = fixture.debugElement.query(By.directive(ChartFixture));
    expect(chartEl).not.toBeNull();
    const chart = chartEl.injector.get(ChartFixture);
    expect(chart.options().series[0].type).toBe('pie');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Cobranza por método (efectivo vs QR)');
    expect(el.textContent).toContain('EFECTIVO');
    expect(el.textContent).toContain('QR_PAGOFACIL');
  });

  it('shows explicit "Sin datos en el período" when backing table is empty', async () => {
    ms1StateSignal.set({ status: 'ready', data: EMPTY_KPIS_FINANCIEROS_FIXTURE, error: null });
    await createComponent('ingresos');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sin datos en el período');
  });

  it('shows QR note on KPI 1 and 9, and not on KPI 3', async () => {
    await createComponent('ingresos');
    expect(fixture.nativeElement.textContent).toContain(QR_PAGOFACIL_NOTE);

    await createComponent('cobranza-metodo');
    expect(fixture.nativeElement.textContent).toContain(QR_PAGOFACIL_NOTE);

    await createComponent('pacientes-frecuentes');
    expect(fixture.nativeElement.textContent).not.toContain(QR_PAGOFACIL_NOTE);
  });

  it('shows observed note on KPI 5 (inasistencia)', async () => {
    await createComponent('inasistencia');
    expect(fixture.nativeElement.textContent).toContain(INASISTENCIA_OBSERVADA_NOTE);
  });

  it('shows explicit "KPI no encontrado" with link back and sends NO requests for unknown KPI', async () => {
    await createComponent('unknown-kpi');

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('KPI no encontrado');
    const backLink = fixture.debugElement.query(By.css('[data-testid="back-to-kpis"]'));
    expect(backLink).not.toBeNull();
    expect(loadSpy).not.toHaveBeenCalled();
  });

  it('shows required ADMIN role notice when user lacks ADMIN role', async () => {
    rolesSignal.set(['ODONTOLOGO']);
    await createComponent('ingresos');

    expect(fixture.nativeElement.textContent).toContain('Los KPIs ejecutivos requieren el rol ADMIN.');
  });

  it('shows online-only notice when network is offline', async () => {
    onlineSignal.set(false);
    await createComponent('ingresos');

    expect(fixture.nativeElement.textContent).toContain('Sin conexión: los KPIs están disponibles solo en línea.');
  });
});
