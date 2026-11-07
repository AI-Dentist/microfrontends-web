import { Component, InjectionToken, inject, signal } from '@angular/core';

export interface OfflineEntryConfig {
  /** Public ERP endpoint used only for explicit online activation. */
  endpoint: string;
  /** Live host session snapshot; null when the shell has no authenticated session. */
  getOnlineContext: () => { token: string; identityIssuer: string; identitySubject: string; epoch: string | number } | null;
}
export const OFFLINE_ENTRY = new InjectionToken<OfflineEntryConfig>('OFFLINE_ENTRY');

type State = { status: string; capabilities: readonly string[]; actorVerified: boolean };
type Workspace = {
  status(): Promise<State>; activate(pin: string): Promise<State>; unlock(pin: string): Promise<State>;
  lock(): State; retire(): Promise<State>; subscribe(fn: (s: State) => void): () => void;
};

/**
 * Private local workspace entry. It never renders hosted ERP routes or calls
 * business APIs; the signed grant authorises local unlock only.
 */
@Component({
  selector: 'erp-offline-workspace',
  standalone: true,
  template: `
    <section class="offline-workspace" aria-labelledby="offline-title">
      <h1 id="offline-title">Jornada offline</h1>
      <p role="status">{{ statusText() }}</p>
      @if (message()) { <p role="alert">{{ message() }}</p> }
      @if (state().status === 'unconfigured') {
        <p>Este dispositivo todavía no tiene una jornada offline habilitada.</p>
        @if (online()) {
          <form (submit)="activate($event)">
            <label for="offline-pin-new">PIN de 6 dígitos</label>
            <input id="offline-pin-new" name="pin" inputmode="numeric" autocomplete="new-password" [value]="pin()" (input)="pin.set(value($event))" />
            <button type="submit" [disabled]="busy()">Habilitar jornada offline</button>
          </form>
        } @else {
          <p>Habilitarla exige iniciar sesión con conexión. Sin sesión solo puede abrirse una jornada ya habilitada.</p>
        }
      }
      @if (state().status === 'locked') {
        <form (submit)="unlock($event)">
          <label for="offline-pin">PIN</label>
          <input id="offline-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" [value]="pin()" (input)="pin.set(value($event))" />
          <button type="submit" [disabled]="busy()">Desbloquear</button>
        </form>
      }
      @if (state().status === 'unlocked') {
        <p>Capacidades locales: {{ state().capabilities.join(', ') || 'ninguna' }}</p>
        <p>Las operaciones pendientes se registran solo en este dispositivo; nada se confirma en el servidor desde esta pantalla.</p>
        <button type="button" (click)="lock()">Bloquear</button>
        <button type="button" (click)="retire()">Cerrar jornada offline</button>
      }
      <p class="offline-limits">
        Un PIN local no sustituye la autenticación del servidor. La revocación remota no se puede comprobar sin conexión;
        el reloj del dispositivo, el software del navegador y el almacenamiento local quedan bajo su control.
      </p>
    </section>
  `,
})
export class OfflineWorkspacePage {
  private readonly config = inject(OFFLINE_ENTRY);
  readonly state = signal<State>({ status: 'locked', capabilities: [], actorVerified: false });
  readonly pin = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly online = signal(this.config.getOnlineContext() !== null);
  private workspace: Workspace | null = null;
  private loading: Promise<Workspace> | null = null;

  private async engine(): Promise<Workspace> {
    if (this.workspace) return this.workspace;
    this.loading ??= (async () => {
      const { createOfflineWorkspace } = await import('../../core/offline-workspace/workspace.mjs' as string) as {
        createOfflineWorkspace(options: Record<string, unknown>): Workspace;
      };
      const workspace = createOfflineWorkspace({ endpoint: this.config.endpoint, getOnlineContext: this.config.getOnlineContext });
      this.workspace = workspace;
      return workspace;
    })();
    return this.loading;
  }
  value(event: Event) { return (event.target as HTMLInputElement).value; }
  statusText() {
    const status = this.state().status;
    if (status === 'unlocked') return 'Jornada offline desbloqueada en este dispositivo.';
    if (status === 'locked') return 'Jornada offline bloqueada.';
    return 'Jornada offline no habilitada.';
  }
  ngAfterViewInit() { void this.engine().then(async workspace => this.state.set(await workspace.status())).catch(() => this.message.set('No se pudo abrir el almacenamiento local.')); }
  private async run(action: (workspace: Workspace) => Promise<State>) {
    this.busy.set(true); this.message.set(''); this.online.set(this.config.getOnlineContext() !== null);
    try { this.state.set(await action(await this.engine())); }
    catch (error) { this.message.set(message(error)); }
    finally { this.busy.set(false); this.pin.set(''); }
  }
  activate(event: Event) {
    event.preventDefault();
    void this.run(async workspace => {
      const value = this.pin(); this.pin.set('');
      if (!/^\d{6}$/u.test(value)) throw Object.assign(Error('PinInvalid'), { code: 'OFFLINE_PIN_INVALID' });
      return workspace.activate(value);
    });
  }
  unlock(event: Event) {
    event.preventDefault();
    void this.run(async workspace => {
      const value = this.pin(); this.pin.set('');
      if (!/^\d{6}$/u.test(value)) throw Object.assign(Error('PinInvalid'), { code: 'OFFLINE_PIN_INVALID' });
      return workspace.unlock(value);
    });
  }
  lock() { const state = this.workspace?.lock(); if (state) this.state.set(state); }
  retire() { void this.run(workspace => workspace.retire()); }
}
function message(error: unknown) {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'OFFLINE_PIN_INVALID') return 'El PIN debe tener exactamente 6 dígitos.';
  if (code === 'OFFLINE_ACTIVATION_REQUIRED') return 'Habilitar la jornada requiere una sesión online activa.';
  if (code === 'OFFLINE_UNCONFIGURED') return 'Este dispositivo no tiene una jornada habilitada.';
  if (code === 'OFFLINE_STORAGE_FAILED') return 'El almacenamiento local no está disponible; no se guardó nada.';
  if (code === 'OFFLINE_LOCKED') return 'La jornada se bloqueó por vencimiento o por un reloj incoherente.';
  return 'No se pudo completar la operación con el PIN indicado.';
}
