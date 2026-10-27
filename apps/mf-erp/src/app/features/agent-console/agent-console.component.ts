import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { LucideMic, LucideMicOff, LucideSend } from '@lucide/angular';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { AgenteInteraccionResponse, McpServerStatus } from '../../core/graphql/models';
import { EJECUTAR_AGENTE_ERP } from '../../core/graphql/mutations.graphql';
import { LISTAR_HISTORIAL_AGENTE, OBTENER_ESTADO_SERVIDOR_MCP } from '../../core/graphql/queries.graphql';
import { AuthContextService } from '../../core/auth/auth-context.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { describeError } from '../../core/offline/mutation-errors';
import { DynamicReportViewer } from '../generative-reports/dynamic-report-viewer.component';
import { SpeechRecognitionService } from '../generative-reports/speech-recognition.service';

export const HISTORY_LIMIT = 20;
type Command = Readonly<{
  variables: Readonly<{ instruccion: string; modoAutonomoMonitoreo: boolean }>;
  context: Readonly<{ idempotencyKey: string; ownerPrincipal: string }>;
}>;

/** One backend entry point; no SQL/CRUD interpretation or autonomous loop in the browser. */
@Component({
  selector: 'erp-agent-console',
  imports: [FormsModule, ButtonModule, TextareaModule, DynamicReportViewer, LucideMic, LucideMicOff, LucideSend],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-4 p-4">
      <header>
        <h1 class="text-xl font-semibold text-slate-800">Co-Piloto & Monitor de Negocio ERP</h1>
        <p class="text-sm text-slate-600">Las instrucciones se envían a MS1 con tu identidad y permisos.
          Las instrucciones pueden ejecutar acciones: revisa el texto antes de enviarlo.
          El dictado depende del navegador y puede requerir conexión y su proveedor de voz.</p>
        <p class="text-sm text-slate-600">El monitoreo no ejecuta CRUD, pero puede enviar alertas n8n según la configuración de MS1.</p>
      </header>
      @if (!canExecute()) { <p role="alert">Tu rol permite consultar el historial, no ejecutar instrucciones.</p> }
      <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); submit()">
        <label class="font-medium">Instrucción para el agente
          <textarea pTextarea name="instruccion" aria-label="Instrucción para el agente" rows="3"
            class="mt-1 w-full" placeholder="Escribe o dicta una instrucción..."
            [ngModel]="question()" (ngModelChange)="question.set($event)"></textarea>
        </label>
        <div class="flex flex-wrap gap-2">
          <p-button type="submit" label="Enviar instrucción" [loading]="loading()"
            [disabled]="loading() || !canExecute() || !question().trim()">
            <ng-template #icon><svg lucideSend class="size-4"></svg></ng-template>
          </p-button>
          <p-button type="button" label="[Auditar Negocio Ahora (Autónomo)]" severity="secondary"
            [disabled]="loading() || !canMonitor()" (onClick)="monitor()" />
          <p-button type="button" [label]="speech.listening() ? 'Detener dictado' : 'Dictar instrucción'"
            [disabled]="!speech.supported() || !canExecute()" (onClick)="toggleMic()">
            <ng-template #icon>
              @if (speech.supported()) { <svg lucideMic class="size-4 motion-reduce:animate-none" [class.animate-pulse]="speech.listening()"></svg> }
              @else { <svg lucideMicOff class="size-4"></svg> }
            </ng-template>
          </p-button>
        </div>
      </form>
      @if (!speech.supported()) { <p class="text-sm">Tu navegador no soporta reconocimiento de voz.</p> }
      @if (speech.listening()) { <p role="status">Escuchando… revisa el texto antes de enviarlo.</p> }
      @if (speech.error(); as message) { <p role="alert">{{ message }}</p> }
      @if (!network.online()) { <p role="alert">Sin conexión: el agente requiere internet. Las instrucciones no se encolan.</p> }
      @if (errorMessage(); as message) { <p role="alert" class="rounded bg-red-50 p-3 text-red-800">{{ message }}</p> }
      @if (pending() && !loading()) {
        <div class="rounded border border-amber-300 bg-amber-50 p-3">
          <p>La acción pudo haberse aplicado. Revisa el historial antes de iniciar otra.
            El reintento conserva la instrucción, identidad y clave originales.</p>
          <p-button label="Reintentar misma acción" (onClick)="retry()" />
          <p-button label="Descartar reintento" severity="secondary" (onClick)="discard()" />
        </div>
      }
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <p-button type="button" label="Actualizar historial" severity="secondary" (onClick)="refreshHistory()" />
        @if (mcp(); as status) {
          <span>MCP: {{ status.activo ? 'activo' : 'inactivo' }} · {{ status.protocolVersion }}</span>
          <span>{{ status.toolsRegistradas.length }} herramientas registradas</span>
        } @else { <span>Estado MCP: {{ isAdmin() ? 'no disponible' : 'solo ADMIN' }}</span> }
      </div>
      @if (historyError(); as message) { <p role="alert">{{ message }}</p> }
      @if (mcpError(); as message) { <p role="alert">{{ message }}</p> }
      <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <aside class="flex flex-col gap-2">
          <h2 class="font-semibold">Historial del agente</h2>
          @for (entry of history(); track entry.interaccionId) {
            <button type="button" class="rounded border p-2 text-left text-sm hover:bg-slate-50"
              data-testid="history-entry" (click)="select(entry)">
              <strong>{{ entry.instruccionOriginal }}</strong>
              <span class="block">{{ entry.respuestaNaturalAgente }}</span>
            </button>
          } @empty { <p class="text-sm text-slate-500">Sin interacciones.</p> }
        </aside>
        <main aria-live="polite">
          @if (response(); as current) {
            <article class="flex flex-col gap-3">
              <h2 class="font-semibold">{{ current.instruccionOriginal }}</h2>
              <p class="whitespace-pre-wrap rounded bg-sky-50 p-3">{{ current.respuestaNaturalAgente }}</p>
              <p>Herramientas: {{ current.toolsMcpInvocadas.join(', ') || 'ninguna' }}</p>
              @if (current.accionCrudEjecutada) { <p>Acción: {{ current.accionCrudEjecutada }}</p> }
              <p>n8n: {{ current.notificacionN8nEnviada ? 'sí' : 'no' }}</p>
              @if (current.reporteGenerado; as report) { <erp-dynamic-report-viewer [report]="report" /> }
            </article>
          }
        </main>
      </div>
    </section>
  `,
})
export class AgentConsoleComponent {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  protected readonly network = inject(NetworkStatusService);
  protected readonly speech = inject(SpeechRecognitionService);
  protected readonly question = signal('');
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly historyError = signal<string | null>(null);
  protected readonly mcpError = signal<string | null>(null);
  protected readonly response = signal<AgenteInteraccionResponse | null>(null);
  protected readonly history = signal<AgenteInteraccionResponse[]>([]);
  protected readonly mcp = signal<McpServerStatus | null>(null);
  protected readonly pending = signal<Command | null>(null);
  protected readonly isAdmin = computed(() => this.auth.roles().includes('ADMIN'));
  protected readonly canExecute = computed(() => !!this.auth.principalKey() &&
    this.auth.roles().some((role) => ['ADMIN', 'CAJERO', 'RECEPCIONISTA'].includes(role)));
  protected readonly canMonitor = computed(() => !!this.auth.principalKey() &&
    this.auth.roles().some((role) => ['ADMIN', 'CAJERO'].includes(role)));
  // Stable primitive stamp avoids refresh() object-identity changes causing an effect loop.
  private readonly identity = computed(() => JSON.stringify([this.auth.principalKey(), this.auth.roles()]));
  private session = 0;
  private read = 0;

  constructor() {
    effect(() => {
      this.identity();
      untracked(() => {
        this.session++;
        this.loading.set(false); this.pending.set(null); this.question.set('');
        this.response.set(null); this.history.set([]); this.mcp.set(null);
        this.errorMessage.set(null); this.historyError.set(null); this.mcpError.set(null);
        this.speech.cancel?.();
        this.speech.transcript.set('');
        this.refreshHistory();
      });
    });
    effect(() => {
      const text = this.speech.transcript();
      if (text) this.question.set(text); // Keep final text even if onend already set listening=false.
    });
  }

  protected toggleMic(): void { if (this.speech.listening()) this.speech.stop(); else this.speech.start(); }
  protected submit(): void { void this.run(this.question(), false); }
  protected monitor(): void { void this.run('Monitorea mi negocio', true); }
  protected select(entry: AgenteInteraccionResponse): void { this.response.set(entry); }
  protected retry(): void { const command = this.pending(); if (command) void this.send(command); }
  protected discard(): void {
    if (confirm('La acción pudo haberse aplicado. Descartar el reintento no cancela operaciones en MS1. ¿Revisaste el historial y querés iniciar otra acción?')) {
      this.pending.set(null);
    }
  }

  protected async run(text: string, autonomous: boolean): Promise<void> {
    if (this.loading()) return;
    try {
      this.auth.refresh();
      if (!this.canExecute() || (autonomous && !this.canMonitor())) return;
      if (this.pending()) throw new Error('Resuelva la acción pendiente: reintente con su clave original o revise el historial.');
      if (!text.trim()) return;
      if (!this.network.isOnline()) throw new Error('Sin conexión: el agente requiere internet.');
      const ownerPrincipal = this.auth.principalKey()!;
      const command: Command = Object.freeze({
        variables: Object.freeze({ instruccion: text.trim(), modoAutonomoMonitoreo: autonomous }),
        context: Object.freeze({ idempotencyKey: crypto.randomUUID(), ownerPrincipal }),
      });
      this.pending.set(command);
      await this.send(command);
    } catch (error) { this.errorMessage.set(describeError(error)); }
  }

  private async send(command: Command): Promise<void> {
    if (this.loading()) return;
    const session = this.session;
    const owner = command.context.ownerPrincipal;
    try {
      this.auth.refresh();
      if (!this.canExecute() || (command.variables.modoAutonomoMonitoreo && !this.canMonitor()) ||
          owner !== this.auth.principalKey()) throw new Error('La sesión o los permisos cambiaron.');
      if (!this.network.isOnline()) throw new Error('Sin conexión: el agente requiere internet.');
      this.loading.set(true); this.errorMessage.set(null); this.response.set(null);
      const result = await firstValueFrom(this.apollo.mutate({
        mutation: EJECUTAR_AGENTE_ERP, variables: command.variables, context: command.context, fetchPolicy: 'no-cache',
      }));
      if (!this.current(session, owner)) return;
      const reply = result.data?.ejecutarAgenteErp;
      if (!reply) throw new Error('No se recibió confirmación del agente.');
      this.response.set(reply);
      this.history.update((rows) => [reply, ...rows.filter((row) => row.interaccionId !== reply.interaccionId)].slice(0, HISTORY_LIMIT));
      this.pending.set(null);
    } catch (error) {
      if (this.current(session, owner)) this.errorMessage.set(describeError(error));
    } finally { if (this.current(session, owner)) this.loading.set(false); }
  }

  private current(session: number, owner: string): boolean {
    try { this.auth.refresh(); } catch { return false; }
    return session === this.session && owner === this.auth.principalKey();
  }

  protected refreshHistory(): void {
    const read = ++this.read;
    const session = this.session;
    let owner: string | null;
    try { this.auth.refresh(); owner = this.auth.principalKey(); }
    catch (error) { this.historyError.set(describeError(error)); return; }
    if (!owner || !this.auth.roles().some((r) => ['ADMIN', 'CAJERO', 'RECEPCIONISTA', 'ODONTOLOGO'].includes(r))) return;
    const context = { ownerPrincipal: owner };
    const current = () => this.current(session, owner!) && read === this.read;
    this.historyError.set(null);
    void firstValueFrom(this.apollo.query({
      query: LISTAR_HISTORIAL_AGENTE, variables: { limite: HISTORY_LIMIT }, context, fetchPolicy: 'no-cache',
    })).then((r) => { if (current()) this.history.set(r.data?.listarHistorialAgente ?? []); })
      .catch((e) => { if (current()) this.historyError.set(describeError(e)); });
    if (this.isAdmin()) {
      this.mcpError.set(null);
      void firstValueFrom(this.apollo.query({ query: OBTENER_ESTADO_SERVIDOR_MCP, context, fetchPolicy: 'no-cache' }))
        .then((r) => { if (current()) this.mcp.set(r.data?.obtenerEstadoServidorMcp ?? null); })
        .catch((e) => { if (current()) this.mcpError.set(describeError(e)); });
    }
  }
}
