import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { By } from '@angular/platform-browser';
import { describe, expect, it, beforeEach } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { KPI_DEFINITIONS, QR_PAGOFACIL_NOTE, INASISTENCIA_OBSERVADA_NOTE } from './kpi-definitions';
import {
  FULL_KPIS_AGENDA_ENVELOPE_FIXTURE,
  FULL_KPIS_FINANCIEROS_FIXTURE,
  EMPTY_KPIS_FINANCIEROS_FIXTURE,
} from './kpi-fixtures';
import { KpiDataLoaderService, SourceState } from './kpi-data-loader.service';
import { KpiGridComponent } from './kpi-grid.component';
import type { KpisFinancieros } from './kpis.graphql';
import type { KpisAgenda } from './kpi-agenda.service';

describe('KpiGridComponent', () => {
  let fixture: ComponentFixture<KpiGridComponent>;
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

  const periodErrorSignal = signal<string | null>(null);

  beforeEach(async () => {
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
    periodErrorSignal.set(null);

    await TestBed.configureTestingModule({
      imports: [KpiGridComponent],
      providers: [
        provideRouter([]),
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
            periodError: periodErrorSignal,
            requiresAdmin: signal(false),
            adminNotice: signal(null),
            isOffline: signal(false),
            offlineNotice: signal(null),
            load: vi.fn(),
            getView: (id: string) => {
              const def = KPI_DEFINITIONS.find((k) => k.id === id);
              if (!def) return { status: 'unavailable', error: 'KPI no encontrado' };
              if (!rolesSignal().includes('ADMIN')) {
                return { status: 'unavailable', error: 'Los KPIs ejecutivos requieren el rol ADMIN.' };
              }
              if (!onlineSignal()) {
                return { status: 'unavailable', error: 'Sin conexión: los KPIs están disponibles solo en línea.' };
              }
              const st = def.source === 'ms1' ? ms1StateSignal() : ms3StateSignal();
              if (st.status === 'ready' && st.data) {
                // Return a lightweight mock view matching definitions
                if (id === 'ingresos') {
                  const data = st.data as KpisFinancieros;
                  return { status: 'ready', view: { headline: { primary: `Bs ${data.ingresos.totalBs.toFixed(2).replace('.', ',')}`, secondary: `${data.ingresos.cantidadMovimientos} movimientos` } } };
                }
                if (id === 'morosidad') {
                  const data = st.data as KpisFinancieros;
                  return { status: 'ready', view: { headline: { primary: `${data.morosidad.porcentaje}%`, secondary: 'mora' } } };
                }
                if (id === 'inasistencia') {
                  const data = st.data as KpisAgenda;
                  return { status: 'ready', view: { headline: { primary: `${data.inasistencia.porcentaje}%`, secondary: 'inasistencia' } } };
                }
                if (id === 'flujo-caja') {
                  const data = st.data as KpisFinancieros;
                  return { status: 'ready', view: { headline: { primary: `Bs ${data.flujoCaja.saldoNetoBs.toFixed(2).replace('.', ',')}`, secondary: 'saldo neto' } } };
                }
                return { status: 'ready', view: { headline: { primary: 'OK', secondary: 'detalle' } } };
              }
              return { status: st.status, error: st.error };
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KpiGridComponent);
    fixture.detectChanges();
  });

  it('renders heading "KPIs ejecutivos" and period filter inputs', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('KPIs ejecutivos');
    expect(el.querySelector('input[aria-label="Desde"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Hasta"]')).not.toBeNull();
    expect(el.textContent).toContain('Aplicar');
  });

  it('renders all ten cards in exact S1 order with exact S1 titles', () => {
    const cards = fixture.debugElement.queryAll(By.css('[data-testid^="kpi-card-"]'));
    expect(cards.length).toBe(10);

    const titles = cards.map((c) => c.query(By.css('.kpi-card-title')).nativeElement.textContent.trim());
    expect(titles).toEqual(KPI_DEFINITIONS.map((d) => d.title));
  });

  it('renders headlines from full fixtures', () => {
    const el = fixture.nativeElement as HTMLElement;
    const ingresosCard = el.querySelector('[data-testid="kpi-card-ingresos"]');
    expect(ingresosCard?.textContent).toContain('Bs 25400,50');

    const morosidadCard = el.querySelector('[data-testid="kpi-card-morosidad"]');
    expect(morosidadCard?.textContent).toContain('20%');

    const inasistenciaCard = el.querySelector('[data-testid="kpi-card-inasistencia"]');
    expect(inasistenciaCard?.textContent).toContain('20%');
  });

  it('renders headlines with zeros/empty for empty fixtures', () => {
    const emptyAgendaData: KpisAgenda = {
      periodo: { desde: '2026-11-01', hasta: '2026-11-30' },
      pacientesFrecuentes: [],
      inasistencia: { citasEvaluadas: 0, noAsistio: 0, porcentaje: 0, detalle: [] },
      horariosPico: { porDiaHora: [], top: [] },
      insumosCriticos: [],
      productividadOdontologos: [],
    };
    ms1StateSignal.set({ status: 'ready', data: EMPTY_KPIS_FINANCIEROS_FIXTURE, error: null });
    ms3StateSignal.set({ status: 'ready', data: emptyAgendaData, error: null });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const ingresosCard = el.querySelector('[data-testid="kpi-card-ingresos"]');
    expect(ingresosCard?.textContent).toContain('Bs 0,00');

    const morosidadCard = el.querySelector('[data-testid="kpi-card-morosidad"]');
    expect(morosidadCard?.textContent).toContain('0%');

    const inasistenciaCard = el.querySelector('[data-testid="kpi-card-inasistencia"]');
    expect(inasistenciaCard?.textContent).toContain('0%');
  });

  it('displays the QR PagoFacil note on KPIs 1 and 9 only', () => {
    const el = fixture.nativeElement as HTMLElement;
    const card1 = el.querySelector('[data-testid="kpi-card-ingresos"]');
    const card9 = el.querySelector('[data-testid="kpi-card-cobranza-metodo"]');
    const card2 = el.querySelector('[data-testid="kpi-card-morosidad"]');
    const card3 = el.querySelector('[data-testid="kpi-card-pacientes-frecuentes"]');

    expect(card1?.textContent).toContain(QR_PAGOFACIL_NOTE);
    expect(card9?.textContent).toContain(QR_PAGOFACIL_NOTE);
    expect(card2?.textContent).not.toContain(QR_PAGOFACIL_NOTE);
    expect(card3?.textContent).not.toContain(QR_PAGOFACIL_NOTE);
  });

  it('displays the observed inasistencia note on KPI 5 only', () => {
    const el = fixture.nativeElement as HTMLElement;
    const card5 = el.querySelector('[data-testid="kpi-card-inasistencia"]');
    const card1 = el.querySelector('[data-testid="kpi-card-ingresos"]');

    expect(card5?.textContent).toContain(INASISTENCIA_OBSERVADA_NOTE);
    expect(card1?.textContent).not.toContain(INASISTENCIA_OBSERVADA_NOTE);
  });

  it('each card is a link to kpis/<id> preserving query params', () => {
    const cards = fixture.debugElement.queryAll(By.css('[data-testid^="kpi-card-"] a'));
    expect(cards.length).toBe(10);
    for (const link of cards) {
      const rl = link.injector.get(RouterLink);
      expect(rl).toBeTruthy();
      expect(rl.queryParamsHandling).toBe('preserve');
    }
  });

  it('renders explicit unavailable state on MS1 cards when MS1 fails, while MS3 cards render', () => {
    ms1StateSignal.set({ status: 'unavailable', data: null, error: 'Fuente no disponible' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const card1 = el.querySelector('[data-testid="kpi-card-ingresos"]');
    const card3 = el.querySelector('[data-testid="kpi-card-pacientes-frecuentes"]');

    expect(card1?.textContent).toContain('Fuente no disponible');
    expect(card3?.textContent).not.toContain('Fuente no disponible');
  });

  it('renders explicit unavailable state on MS3 cards when MS3 fails, while MS1 cards render', () => {
    ms3StateSignal.set({ status: 'unavailable', data: null, error: 'Fuente no disponible' });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const card1 = el.querySelector('[data-testid="kpi-card-ingresos"]');
    const card3 = el.querySelector('[data-testid="kpi-card-pacientes-frecuentes"]');

    expect(card1?.textContent).not.toContain('Fuente no disponible');
    expect(card3?.textContent).toContain('Fuente no disponible');
  });

  it('shows required ADMIN role notice when user lacks ADMIN role', () => {
    rolesSignal.set(['RECEPCIONISTA']);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Los KPIs ejecutivos requieren el rol ADMIN.');
  });

  it('shows online-only notice when network is offline', () => {
    onlineSignal.set(false);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Sin conexión: los KPIs están disponibles solo en línea.');
  });
});
