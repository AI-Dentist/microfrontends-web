import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { AgentConsoleComponent } from './agent-console.component';
import { SpeechRecognitionService } from '../generative-reports/speech-recognition.service';
import { ManualReportService } from '../generative-reports/manual-report.service';
import { MOCK_ENTIDADES } from '../generative-reports/manual-report-fixtures';

const reply = {
  interaccionId: 'one',
  fechaEjecucion: '2026-01-01T00:00:00Z',
  instruccionOriginal: 'Ingresos',
  respuestaNaturalAgente: 'Respuesta del agente',
  toolsMcpInvocadas: [],
  accionCrudEjecutada: null,
  notificacionN8nEnviada: false,
  reporteGenerado: null,
};

async function setup(roles = ['ADMIN']) {
  const principalKey = signal<string | null>('owner-a');
  const roleSignal = signal(roles);
  const online = signal(true);
  const mutate = vi.fn((_options: any): any => of({ data: { ejecutarAgenteErp: reply } }));
  const query = vi.fn((options: any) =>
    of({
      data:
        options.query.definitions[0].name.value === 'ListarHistorialAgente'
          ? { listarHistorialAgente: [reply] }
          : { obtenerEstadoServidorMcp: { activo: true, protocolVersion: '1', toolsRegistradas: [] } },
    }),
  );
  const speech = {
    supported: signal(false),
    listening: signal(false),
    transcript: signal(''),
    error: signal<string | null>(null),
    completed: signal<{ id: number; text: string } | null>(null),
  };

  const mockManualService = {
    listEntities: vi.fn(async () => MOCK_ENTIDADES),
    preview: vi.fn(async () => null),
  };

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AgentConsoleComponent],
    providers: [
      { provide: Apollo, useValue: { query, mutate } },
      {
        provide: AuthContextService,
        useValue: {
          roles: roleSignal,
          principalKey,
          refresh: () => principalKey(),
          devUserHeader: () => null,
        },
      },
      { provide: NetworkStatusService, useValue: { online, isOnline: () => online() } },
      { provide: SpeechRecognitionService, useValue: speech },
    ],
  })
    .overrideComponent(AgentConsoleComponent, {
      set: {
        providers: [{ provide: ManualReportService, useValue: mockManualService }],
      },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(AgentConsoleComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const findButton = (label: string): HTMLButtonElement | null =>
    ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find(
      (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    ) ?? null;

  return { fixture, principalKey, roleSignal, online, findButton };
}

describe('AgentConsoleComponent manual mode toggle', () => {
  it('renders "Constructor manual" button only for ADMIN', async () => {
    const adminSetup = await setup(['ADMIN']);
    expect(adminSetup.findButton('Constructor manual')).not.toBeNull();

    const cajeroSetup = await setup(['CAJERO']);
    expect(cajeroSetup.findButton('Constructor manual')).toBeNull();
  });

  it('switches to manual mode and allows returning to agent mode with state preserved', async () => {
    const s = await setup(['ADMIN']);

    // Type an instruction in agent mode
    const textarea = s.fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Instrucción preliminar';
    textarea.dispatchEvent(new Event('input'));
    s.fixture.detectChanges();

    // Toggle to manual mode
    const manualBtn = s.findButton('Constructor manual');
    expect(manualBtn).not.toBeNull();
    manualBtn!.click();
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    s.fixture.detectChanges();

    // In manual mode: manual builder is displayed, agent form is not
    expect(s.fixture.nativeElement.querySelector('erp-manual-report-builder')).not.toBeNull();
    expect(s.fixture.nativeElement.querySelector('textarea')).toBeNull();

    // "Volver al agente" button is now visible
    const backBtn = s.findButton('Volver al agente');
    expect(backBtn).not.toBeNull();
    backBtn!.click();
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    s.fixture.detectChanges();

    // Back in agent mode: textarea is restored with original typed text preserved
    expect(s.fixture.nativeElement.querySelector('erp-manual-report-builder')).toBeNull();
    const restoredTextarea = s.fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(restoredTextarea).not.toBeNull();
    expect(restoredTextarea.value).toBe('Instrucción preliminar');
  });

  it('disables "Constructor manual" button when agent command is loading or pending', async () => {
    const s = await setup(['ADMIN']);

    // Set command loading via component internals or submitting
    const textarea = s.fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'Consultar ingresos';
    textarea.dispatchEvent(new Event('input'));
    s.fixture.detectChanges();

    const submitBtn = s.findButton('Enviar instrucción');
    expect(submitBtn).not.toBeNull();

    // When loading is true, button is disabled
    (s.fixture.componentInstance as any).loading.set(true);
    s.fixture.detectChanges();

    const manualBtn = s.findButton('Constructor manual');
    expect(manualBtn).not.toBeNull();
    expect(manualBtn!.disabled).toBe(true);

    // When pending is true, button is disabled
    (s.fixture.componentInstance as any).loading.set(false);
    (s.fixture.componentInstance as any).pending.set({
      variables: { instruccion: 'test', modoAutonomoMonitoreo: false },
      context: { idempotencyKey: 'k', ownerPrincipal: 'owner-a' },
    });
    s.fixture.detectChanges();

    expect(s.findButton('Constructor manual')!.disabled).toBe(true);
  });
});
