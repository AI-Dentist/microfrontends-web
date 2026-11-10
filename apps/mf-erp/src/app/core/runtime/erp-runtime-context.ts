import { InjectionToken } from '@angular/core';

/**
 * Host contract for a mounted ERP. Without `mode: 'hosted'` the ERP keeps its explicit
 * standalone behavior (browser-stored credential, optional endpoint override).
 */
export interface ErpGraphqlConfig {
  graphqlUrl?: string;
  agendaApiUrl?: string;
  mode?: 'hosted';
  /** Current SYNCHRONOUS host capability; null, empty or a throw means no access. */
  getAccessToken?: () => string | null;
}

const RETIRED = 'La sesión del host ya no autoriza este ERP. Vuelva a abrir la aplicación.';

/**
 * In-memory runtime boundary of one ERP provider scope. A hosted scope binds the endpoint
 * and the first verified principal, reads the host capability on every use, and retires
 * permanently on the first missing/rejected capability, principal switch or backend switch.
 * A retired scope never revives, even when the same actor's getter returns a token again.
 */
export class ErpRuntimeContext {
  readonly hosted: boolean;
  /** Endpoint bound at creation, used verbatim; undefined when the host did not supply one. */
  readonly endpoint: string | undefined;
  /** Optional agenda API URL; undefined when not configured. */
  readonly agendaApiUrl: string | undefined;
  private retiredFlag = false;
  private principal: string | null = null;
  private readonly retirementListeners = new Set<() => void>();

  constructor(private readonly config: ErpGraphqlConfig | null = null) {
    this.hosted = config?.mode === 'hosted';
    this.endpoint = config?.graphqlUrl;
    this.agendaApiUrl = config?.agendaApiUrl;
    if (this.hosted && (typeof this.endpoint !== 'string' || !this.endpoint.trim() || typeof config?.getAccessToken !== 'function')) {
      this.retiredFlag = true;
    }
  }

  get retired(): boolean { return this.retiredFlag; }

  /** `cachedCatalog` mode: hosted scopes never touch the persistent catalog cache. */
  get cacheMode(): 'hosted' | undefined { return this.hosted ? 'hosted' : undefined; }

  /** Current host credential, or a permanent retirement. Never consults browser storage. */
  credential(): string {
    if (!this.hosted) throw new Error('Runtime ERP independiente: no hay capacidad de host.');
    if (this.retiredFlag) throw new Error(RETIRED);
    let token: unknown;
    try {
      token = this.config!.getAccessToken!();
    } catch {
      this.retire();
      throw new Error(RETIRED);
    }
    if (typeof token !== 'string' || !token || this.config!.graphqlUrl !== this.endpoint) {
      this.retire();
      throw new Error(RETIRED);
    }
    return token;
  }

  /** Binds the first verified principal; any later difference retires this scope. */
  bind(principal: string | null): void {
    if (this.retiredFlag) throw new Error(RETIRED);
    if (!principal || (this.principal !== null && this.principal !== principal)) {
      this.retire();
      throw new Error(RETIRED);
    }
    this.principal ??= principal;
  }

  /** Subscribe to permanent retirement; late subscribers are notified synchronously. */
  onRetire(listener: () => void): () => void {
    if (this.retiredFlag) {
      try { listener(); } catch { /* A listener cannot alter retirement. */ }
      return () => {};
    }
    // A wrapper gives each subscription its own identity, even for the same listener.
    const subscription = () => listener();
    this.retirementListeners.add(subscription);
    return () => { this.retirementListeners.delete(subscription); };
  }

  retire(): void {
    if (this.retiredFlag) return;
    this.retiredFlag = true;
    const listeners = [...this.retirementListeners];
    this.retirementListeners.clear();
    for (const listener of listeners) {
      try { listener(); } catch { /* Notify remaining listeners without exposing exceptions. */ }
    }
  }
}

/** Default scope is the explicit standalone ERP; hosted scopes are provided per route injector. */
export const ERP_RUNTIME = new InjectionToken<ErpRuntimeContext>('ERP_RUNTIME', {
  providedIn: 'root',
  factory: () => new ErpRuntimeContext(),
});
