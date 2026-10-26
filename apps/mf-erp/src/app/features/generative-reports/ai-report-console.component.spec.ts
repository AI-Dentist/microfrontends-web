import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { AiReportConsole } from './ai-report-console.component';
import { SpeechRecognitionService } from './speech-recognition.service';

const reply = {
  interaccionId: 'one', fechaEjecucion: '2026-01-01T00:00:00Z', instruccionOriginal: 'Ingresos',
  respuestaNaturalAgente: 'DEV/LOCAL: respuesta sin IA <img src=x onerror=alert(1)>',
  toolsMcpInvocadas: ['consultarCaja'], accionCrudEjecutada: null,
  notificacionN8nEnviada: false, reporteGenerado: null,
};

async function setup(roles = ['ADMIN']) {
  const principalKey = signal<string | null>('owner-a');
  const roleSignal = signal(roles);
  const online = signal(true);
  const mutate = vi.fn((_options: any): any => of({ data: { ejecutarAgenteErp: reply } }));
  const query = vi.fn((options: any) => of({ data: options.query.definitions[0].name.value === 'ListarHistorialAgente'
    ? { listarHistorialAgente: [reply] }
    : { obtenerEstadoServidorMcp: { activo: true, protocolVersion: '1', toolsRegistradas: [] } } }));
  const speech = { supported: signal(false), listening: signal(false), transcript: signal(''), error: signal<string | null>(null) };
  await TestBed.configureTestingModule({ imports: [AiReportConsole], providers: [
    { provide: Apollo, useValue: { query, mutate } },
    { provide: AuthContextService, useValue: { roles: roleSignal, principalKey, refresh: () => null } },
    { provide: NetworkStatusService, useValue: { online, isOnline: online } },
    { provide: SpeechRecognitionService, useValue: speech },
  ] }).compileComponents();
  const fixture = TestBed.createComponent(AiReportConsole);
  await fixture.whenStable();
  const text = () => fixture.nativeElement.textContent as string;
  const enter = async (instruction = 'Ingresos') => {
    const input = fixture.nativeElement.querySelector('textarea, input');
    input.value = instruction;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };
  const click = async (label: string) => {
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes(label)) as HTMLButtonElement;
    expect(button, label).toBeTruthy();
    button.click();
    await fixture.whenStable();
  };
  return { fixture, mutate, query, principalKey, roleSignal, online, speech, text, enter, submit, click };
}

it('sends a manual mutation as reception, with exact variables, no cache and stable UUID context', async () => {
  const s = await setup(['RECEPCIONISTA']);
  await s.enter(); await s.submit();
  expect(s.mutate).toHaveBeenCalledOnce();
  expect(s.mutate.mock.calls[0][0]).toMatchObject({ variables: { instruccion: 'Ingresos', modoAutonomoMonitoreo: false }, fetchPolicy: 'no-cache' });
  expect(s.mutate.mock.calls[0][0].context.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(s.text()).toContain(reply.respuestaNaturalAgente);
  expect(s.text()).toContain('consultarCaja');
  expect(s.text()).toContain('n8n: no');
  expect(s.fixture.nativeElement.querySelector('img')).toBeNull();
  expect(s.fixture.nativeElement.querySelector('erp-dynamic-report-viewer')).toBeNull();
});

it('sends the exact autonomous instruction only for authorized roles', async () => {
  const s = await setup(['CAJERO']);
  await s.click('[Auditar Negocio Ahora (Autónomo)]');
  expect(s.mutate.mock.calls[0][0].variables).toEqual({ instruccion: 'Monitorea mi negocio', modoAutonomoMonitoreo: true });
});

it('does not allow autonomous execution as reception or any execution as dentist', async () => {
  const s = await setup(['RECEPCIONISTA']);
  await s.click('[Auditar Negocio Ahora (Autónomo)]');
  expect(s.mutate).not.toHaveBeenCalled();
  s.roleSignal.set(['ODONTOLOGO']); await s.fixture.whenStable();
  await s.enter(); await s.submit();
  expect(s.mutate).not.toHaveBeenCalled();
});

it('loads no-cache history for dentist without calling ADMIN-only MCP status', async () => {
  const s = await setup(['ODONTOLOGO']);
  expect(s.query).toHaveBeenCalledOnce();
  expect(s.query.mock.calls[0][0]).toMatchObject({ variables: { limite: 20 }, fetchPolicy: 'no-cache' });
  expect(s.text()).toContain(reply.respuestaNaturalAgente);
});

it('MCP failure does not prevent an otherwise authorized command', async () => {
  const s = await setup();
  s.query.mockImplementation(() => throwError(() => new Error('Forbidden')));
  await s.click('Actualizar historial');
  await s.enter(); await s.submit();
  expect(s.mutate).toHaveBeenCalledOnce();
  expect(s.text()).toContain('Forbidden');
});

it('prefills live speech but never submits; unsupported and permission errors remain visible', async () => {
  const s = await setup();
  expect(s.text()).toContain('no soporta');
  s.speech.supported.set(true); s.speech.listening.set(true); s.speech.transcript.set('Cobrar cuota');
  await s.fixture.whenStable();
  expect(s.fixture.nativeElement.querySelector('textarea, input').value).toBe('Cobrar cuota');
  expect(s.mutate).not.toHaveBeenCalled();
  s.speech.error.set('Permiso de micrófono denegado.'); await s.fixture.whenStable();
  expect(s.text()).toContain('Permiso de micrófono denegado.');
});

it('keeps an uncertain command immutable across edited text, double-click and explicit technical retry', async () => {
  const s = await setup();
  const pending = new Subject<any>();
  s.mutate.mockReturnValueOnce(pending);
  await s.enter(); await s.submit(); await s.submit();
  expect(s.mutate).toHaveBeenCalledOnce();
  pending.error(new Error('Conexión interrumpida'));
  await s.fixture.whenStable();
  await vi.waitFor(() => expect(s.text()).toContain('Conexión interrumpida'));
  await s.enter('Otro cobro'); await s.submit();
  expect(s.mutate).toHaveBeenCalledOnce();
  await s.click('Reintentar misma acción');
  expect(s.mutate).toHaveBeenCalledTimes(2);
  expect(s.mutate.mock.calls[1][0].variables).toEqual(s.mutate.mock.calls[0][0].variables);
  expect(s.mutate.mock.calls[1][0].context).toEqual(s.mutate.mock.calls[0][0].context);
});

it('never queues or automatically resends commands on reconnect', async () => {
  const s = await setup(); s.online.set(false);
  await s.enter(); await s.submit();
  expect(s.mutate).not.toHaveBeenCalled();
  expect(s.text()).toContain('conexión');
  s.online.set(true); await s.fixture.whenStable();
  expect(s.mutate).not.toHaveBeenCalled();
});

it('discards old-principal mutation/history replies and clears displayed results', async () => {
  const s = await setup();
  const pending = new Subject<any>(); s.mutate.mockReturnValueOnce(pending);
  await s.enter(); await s.submit();
  s.query.mockReturnValue(of({ data: { listarHistorialAgente: [] } }) as any);
  s.principalKey.set('owner-b'); await s.fixture.whenStable();
  pending.next({ data: { ejecutarAgenteErp: reply } }); pending.complete();
  await Promise.resolve(); await s.fixture.whenStable();
  expect(s.text()).not.toContain(reply.respuestaNaturalAgente);
  expect(s.fixture.nativeElement.querySelector('textarea, input').value).toBe('');
});

it('animates the microphone only while listening without executing a command', async () => {
  const s = await setup();
  s.speech.supported.set(true);
  await s.fixture.whenStable();
  const icon = () => ([...s.fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[])
    .find(b => /Dictar instrucción|Detener dictado/.test(b.textContent ?? ''))!.querySelector('svg')!;
  expect(icon().classList.contains('animate-pulse')).toBe(false);
  s.speech.listening.set(true); await s.fixture.whenStable();
  expect(icon().classList.contains('animate-pulse')).toBe(true);
  s.speech.listening.set(false); await s.fixture.whenStable();
  expect(icon().classList.contains('animate-pulse')).toBe(false);
  expect(s.mutate).not.toHaveBeenCalled();
});
