import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LocalAiService } from './local-ai.service';
import { NetworkStatusService } from '../offline/network-status.service';

// Messaging/Signal contract tests, not browser/model inference proof.
describe('LocalAiService bridge contract', () => {
  let service: LocalAiService;
  let worker: EventTarget & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };
  const send = (data: unknown) => worker.dispatchEvent(new MessageEvent('message', { data }));
  beforeEach(() => {
    worker = Object.assign(new EventTarget(), { postMessage: vi.fn(), terminate: vi.fn() });
    vi.stubGlobal('Worker', vi.fn(function () { return worker; }));
    TestBed.configureTestingModule({ providers: [{ provide: NetworkStatusService, useValue: { isOnline: () => true, onReconnect: vi.fn() } }] });
    service = TestBed.inject(LocalAiService);
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  async function ready() {
    const starting = service.start();
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    send({ type: 'status', status: 'ready', progress: 100, device: 'wasm' });
    await starting;
  }
  it('single-flights start and does not equate a cache entry with a ready session', async () => {
    const a = service.start(); const b = service.start();
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(service.ready()).toBe(false);
    send({ type: 'status', status: 'ready', progress: 100 }); await Promise.all([a, b]);
    expect(service.ready()).toBe(true);
  });
  it('correlates concurrent responses and keeps processing true until every request settles', async () => {
    await ready();
    const a = service.semanticSearch('muela', [{ id: 'a', text: 'extracción' }]);
    const b = service.suggestExpenseCategory('renta');
    expect((service as any).processing?.()).toBe(true);
    expect((service as any).engineState?.()).toBe('PROCESANDO');
    const requests = worker.postMessage.mock.calls.map(([m]) => m).filter((m) => m.requestId);
    send({ type: 'classify-result', requestId: requests[1].requestId, result: { category: 'ALQUILER', score: 0.8, scores: { ALQUILER: 0.8, INSUMOS: 0.1, SERVICIOS_BASICOS: 0.05, OTROS: 0.05 } } });
    expect(await b).toEqual({ category: 'ALQUILER', source: 'local-ai', score: 0.8 });
    expect((service as any).processing()).toBe(true);
    send({ type: 'search-result', requestId: requests[0].requestId, results: [{ id: 'a', score: 0.9 }] });
    expect(await a).toEqual([{ id: 'a', score: 0.9 }]);
    expect((service as any).processing()).toBe(false);
  });
  it('rejects request errors and crashes without keyword or OTROS output; clears every pending promise', async () => {
    await ready();
    const a = service.suggestExpenseCategory('guantes');
    const assertion = expect(a).rejects.toThrow();
    const request = worker.postMessage.mock.calls.at(-1)![0];
    send({ type: 'request-error', requestId: request.requestId, message: 'inference failed' });
    await assertion;
    expect(service.lastError()).toBeTruthy();
    const b = service.semanticSearch('muela', []); const c = service.suggestExpenseCategory('luz');
    const assertions = [expect(b).rejects.toThrow(), expect(c).rejects.toThrow()];
    worker.dispatchEvent(new ErrorEvent('error', { message: 'worker crashed' }));
    await Promise.all(assertions);
    expect((service as any).processing()).toBe(false);
    expect(service.ready()).toBe(false);
  });
  it('rejects malformed responses and unavailable workers rather than hanging or fabricating data', async () => {
    await ready();
    const a = service.suggestExpenseCategory('anything'); const assertion = expect(a).rejects.toThrow();
    send({ type: 'classify-result', requestId: worker.postMessage.mock.calls.at(-1)![0].requestId, result: { category: 'ALIEN', score: 1 } });
    await assertion;
    expect((service as any).processing()).toBe(false);
  });
  it('reports unsupported Worker visibly and rejects inference without changing manual business data', async () => {
    vi.stubGlobal('Worker', undefined);
    await service.start();
    expect(service.status()).toBe('unavailable');
    expect(service.lastError()).toBeTruthy();
    await expect(service.suggestExpenseCategory('guantes')).rejects.toThrow();
    expect((service as any).processing()).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
  it('rejects every pending request on message deserialization failure', async () => {
    await ready();
    const result = service.semanticSearch('muela', []);
    const assertion = expect(result).rejects.toThrow();
    worker.dispatchEvent(new MessageEvent('messageerror'));
    await assertion;
    expect(service.status()).toBe('error');
    expect((service as any).processing()).toBe(false);
  });
  it('bounds a silent worker with deterministic request timeout and rejects late output', async () => {
    await ready();
    vi.useFakeTimers();
    try {
      const result = service.semanticSearch('muela', []);
      const assertion = expect(result).rejects.toThrow('agotado');
      await vi.advanceTimersByTimeAsync(120_000);
      await assertion;
      expect((service as any).processing()).toBe(false);
      expect(service.ready()).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it('tries cached offline sessions without trusting unrelated old model cache entries', async () => {
    TestBed.resetTestingModule();
    const open = vi.fn();
    vi.stubGlobal('caches', { open });
    TestBed.configureTestingModule({ providers: [{ provide: NetworkStatusService, useValue: { isOnline: () => false, onReconnect: vi.fn() } }] });
    service = TestBed.inject(LocalAiService);
    const result = service.start();
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'init', allowRemote: false }));
    expect(service.ready()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    send({ type: 'status', status: 'unavailable', error: 'Missing cached models' });
    await result;
    expect(service.status()).toBe('unavailable');
    expect(service.modelCached()).toBeNull();
  });
  it('retains empty search behavior and public default search parameters', async () => {
    expect(await service.semanticSearch(' ', [])).toEqual([]);
    await ready(); const result = service.semanticSearch('muela', []);
    expect(worker.postMessage.mock.calls.at(-1)![0]).toMatchObject({ limit: 10, minScore: 0.35 });
    send({ type: 'search-result', requestId: worker.postMessage.mock.calls.at(-1)![0].requestId, results: [] });
    expect(await result).toEqual([]);
  });
});
