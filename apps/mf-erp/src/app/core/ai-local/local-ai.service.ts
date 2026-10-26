import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { NetworkStatusService } from '../offline/network-status.service';
import {
  ClassificationScores, LOCAL_EMBEDDINGS_MODEL, LocalAiRequest, LocalAiResponse, LocalAiStatus, SearchableItem,
} from './local-ai.protocol';
import { EXPENSE_CATEGORIES, ExpenseCategory, RankedItem } from './semantic-math';
import { originSafeWorker } from './local-ai-worker.factory';

export interface ExpenseSuggestion {
  category: ExpenseCategory;
  source: 'local-ai' | 'keywords'; // Retained for existing callers; this bridge never fabricates keywords.
  score?: number;
}
type PendingRequest = {
  type: 'search' | 'classify'; resolve: (value: any) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const REQUEST_TIMEOUT_MS = 120_000;
const LOAD_TIMEOUT_MS = 600_000;

/** Messaging/Signals only. All model imports, sessions and cosine ranking live in the worker. */
@Injectable({ providedIn: 'root' })
export class LocalAiService {
  private readonly network = inject(NetworkStatusService);
  private worker: Worker | null = null;
  private disposeWorker: (() => void) | null = null;
  private starting: Promise<void> | null = null;
  private finishStart: (() => void) | null = null;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingCount = signal(0);

  readonly status = signal<LocalAiStatus>('idle');
  readonly progress = signal(0);
  readonly device = signal<string | null>(null);
  /** null = cache completeness unknown; only successful sessions prove availability now. */
  readonly modelCached = signal<boolean | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly ready = computed(() => this.status() === 'ready');
  readonly processing = computed(() => this.pendingCount() > 0);
  readonly engineState = computed(() => this.ready() ? (this.processing() ? 'PROCESANDO' : 'LISTO_OFFLINE') :
    this.status() === 'loading' || this.status() === 'downloading' ? 'DESCARGANDO_MODELO' :
    this.status() === 'error' ? 'ERROR' : 'NO_DISPONIBLE');

  constructor() {
    this.network.onReconnect(() => {
      if (this.status() === 'unavailable' || this.status() === 'error') void this.start();
    });
    inject(DestroyRef).onDestroy(() => this.fail('El motor de IA local se cerró.', 'unavailable'));
  }

  /** First use downloads artifacts; offline starts try Cache API without assuming completeness. */
  start(): Promise<void> {
    if (this.ready()) return Promise.resolve();
    if (this.starting) return this.starting;
    this.status.set('loading');
    this.progress.set(0);
    this.lastError.set(null);
    this.starting = new Promise<void>((resolve) => { this.finishStart = resolve; });
    const starting = this.starting;
    this.loadTimer = setTimeout(() => this.fail('Tiempo de carga de IA local agotado.'), LOAD_TIMEOUT_MS);
    try {
      if (typeof globalThis.Worker === 'undefined') throw new Error('Worker unavailable');
      this.worker ??= this.createWorker();
      this.worker.postMessage({ type: 'init', model: LOCAL_EMBEDDINGS_MODEL, allowRemote: this.network.isOnline() } satisfies LocalAiRequest);
    } catch {
      this.fail('Este navegador no permite iniciar la IA local.', 'unavailable');
    }
    // start remains safe for existing fire-and-forget shell callers; inference rejects on failure.
    return starting;
  }

  async semanticSearch(query: string, items: SearchableItem[], limit = 10, minScore = 0.35): Promise<RankedItem[]> {
    if (!query.trim()) return [];
    return this.request<RankedItem[]>({ type: 'search', requestId: 0, query, items, limit, minScore });
  }

  async suggestExpenseCategory(description: string): Promise<ExpenseSuggestion> {
    if (!description.trim()) throw new Error('Ingrese una descripción para la IA local.');
    const result = await this.request<ClassificationScores>({ type: 'classify', requestId: 0, text: description });
    return { category: result.category, source: 'local-ai', score: result.score };
  }

  private createWorker(): Worker {
    // Angular 22's worker transformer recognizes exactly new Worker(new URL(literal,
    // import.meta.url)). A LOCAL constructor adapter preserves that syntax so Angular
    // emits the worker, then applies the same-origin boundary to the emitted URL.
    // No global Worker override, computed source URL, or main-thread neural fallback.
    const create = (url: URL, options: WorkerOptions) => {
      const handle = originSafeWorker(url, options);
      this.disposeWorker = handle.dispose;
      return handle.worker;
    };
    const Worker = function (url: URL, options: WorkerOptions) { return create(url, options); } as unknown as typeof globalThis.Worker;
    const worker = new Worker(new URL('./local-ai.worker', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<unknown>) => { if (this.worker === worker) this.handleMessage(data); });
    worker.addEventListener('error', () => { if (this.worker === worker) this.fail('El Worker de IA local dejó de funcionar.'); });
    worker.addEventListener('messageerror', () => { if (this.worker === worker) this.fail('Respuesta ilegible del Worker de IA local.'); });
    return worker;
  }

  private handleMessage(data: unknown): void {
    if (!this.validResponse(data)) { this.fail('Respuesta inválida del Worker de IA local.'); return; }
    const message = data;
    if (message.type === 'status') {
      if (message.status === 'error' || message.status === 'unavailable') {
        this.fail(message.error ?? 'No se pudieron cargar los modelos de IA local.', message.status);
        return;
      }
      this.status.set(message.status);
      if (message.progress !== undefined) this.progress.set(message.progress);
      if (message.device) this.device.set(message.device);
      if (message.status === 'ready') {
        this.modelCached.set(null); // Session readiness does not guarantee durable Cache API writes.
        this.lastError.set(null);
        this.completeStart();
      }
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) return; // Late response after a timeout/teardown, never settle another request.
    if (message.type === 'request-error') {
      this.lastError.set(message.message);
      this.settle(message.requestId, new Error(message.message));
    } else if ((message.type === 'search-result') !== (pending.type === 'search')) {
      this.fail('Tipo de respuesta incorrecto del Worker de IA local.');
    } else {
      this.settle(message.requestId, null, message.type === 'search-result' ? message.results : message.result);
    }
  }

  private validResponse(data: unknown): data is LocalAiResponse {
    if (!data || typeof data !== 'object') return false;
    const m = data as any;
    if (m.type === 'status') return ['loading', 'downloading', 'ready', 'error', 'unavailable'].includes(m.status) &&
      (m.progress === undefined || (Number.isFinite(m.progress) && m.progress >= 0 && m.progress <= 100)) &&
      (m.device === undefined || typeof m.device === 'string') && (m.error === undefined || typeof m.error === 'string');
    if (!Number.isSafeInteger(m.requestId) || m.requestId <= 0) return false;
    if (m.type === 'request-error') return typeof m.message === 'string';
    if (m.type === 'search-result') return Array.isArray(m.results) && m.results.every((r: any) => r && typeof r.id === 'string' && Number.isFinite(r.score));
    if (m.type === 'classify-result') {
      const r = m.result;
      return !!r && EXPENSE_CATEGORIES.includes(r.category) && Number.isFinite(r.score) && r.score >= 0 && r.score <= 1 &&
        !!r.scores && EXPENSE_CATEGORIES.every((c) => Number.isFinite(r.scores[c]) && r.scores[c] >= 0 && r.scores[c] <= 1) && r.scores[r.category] === r.score;
    }
    return false;
  }

  private settle(id: number, error: Error | null, value?: unknown): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    this.pendingCount.set(this.pending.size);
    if (error) pending.reject(error); else pending.resolve(value);
  }

  private completeStart(): void {
    clearTimeout(this.loadTimer);
    this.finishStart?.();
    this.finishStart = null;
    this.starting = null;
  }

  private fail(message: string, status: 'error' | 'unavailable' = 'error'): void {
    this.status.set(status);
    this.lastError.set(message);
    for (const id of this.pending.keys()) this.settle(id, new Error(message));
    this.disposeWorker?.();
    this.disposeWorker = null;
    this.worker = null;
    this.completeStart();
  }

  private request<T>(message: Extract<LocalAiRequest, { requestId: number }>): Promise<T> {
    // Keep ready calls synchronous through postMessage for existing caller ordering.
    if (!this.ready()) return this.start().then(() => {
      if (!this.ready()) throw new Error(this.lastError() ?? 'IA local no disponible.');
      return this.request<T>(message);
    });
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail('Tiempo de inferencia de IA local agotado.'), REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { type: message.type, resolve, reject, timer });
      this.pendingCount.set(this.pending.size);
      try { this.worker!.postMessage({ ...message, requestId }); }
      catch { this.fail('No se pudo enviar la solicitud de IA local.'); }
    });
  }
}
