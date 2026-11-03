import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of, Subject, throwError } from 'rxjs';
import Dexie from 'dexie';
import { IDBDatabase, IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { AuthContextService } from '../auth/auth-context.service';
import { provideErp } from '../erp.providers';
import { CriticalMutationService } from './critical-mutation.service';
import { NetworkStatusService } from './network-status.service';
import { OfflineSyncService } from './offline-sync.service';
import { cachedCatalog } from './catalog-cache';

const variables = (cuotaId: string) => ({ input: {
  cuotaId, usuarioCajeroId: '00000000-0000-4000-8000-000000000001',
  ciNitCliente: 'synthetic', razonSocialCliente: 'Synthetic fixture',
} });
const hostToken = `e30.${btoa(JSON.stringify({ iss: 'host', sub: 'actor-A', realm_access: { roles: ['CAJERO'] } }))}.signature`;

describe('hosted online-first critical mutations and persistent outbox suspension', () => {
  let online: boolean;
  let responseError: unknown;
  let currentToken: string | null;
  let mutate: ReturnType<typeof vi.fn>;
  let onReconnect: ReturnType<typeof vi.fn>;
  let standalone: EnvironmentInjector;
  let hosted: EnvironmentInjector;
  let originalPending: unknown;
  let originalFailed: unknown;
  let prefix: string;
  let browserActivity: { opens: unknown[][]; transactions: unknown[][] };
  const isolatedIndexedDB = new IDBFactory();
  const openedConnections = new Set<IDBDatabase>();
  const pendingTransactions = new Set<IDBTransaction>();
  const originalIndexedDB = Dexie.dependencies.indexedDB;
  const originalKeyRange = Dexie.dependencies.IDBKeyRange;
  const drain = async () => { for (let n = 0; n < 30; n++) await Promise.resolve(); };

  beforeAll(() => {
    // A new memory-only factory is used by both browser callers and Dexie's public
    // dependency configuration. No real database or shared test factory is opened.
    vi.stubGlobal('indexedDB', isolatedIndexedDB);
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    Dexie.dependencies.indexedDB = isolatedIndexedDB;
    Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  });

  afterAll(() => {
    for (const connection of openedConnections) connection.close();
    Dexie.dependencies.indexedDB = originalIndexedDB;
    Dexie.dependencies.IDBKeyRange = originalKeyRange;
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    browserActivity = { opens: [], transactions: [] };
    const open = isolatedIndexedDB.open.bind(isolatedIndexedDB);
    vi.spyOn(isolatedIndexedDB, 'open').mockImplementation((...args) => {
      browserActivity.opens.push(args);
      const request = open(...args);
      request.addEventListener('success', () => openedConnections.add(request.result));
      return request;
    });
    const transaction = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
      browserActivity.transactions.push(args);
      const result = transaction.apply(this, args);
      pendingTransactions.add(result);
      const finished = () => pendingTransactions.delete(result);
      result.addEventListener('complete', finished);
      result.addEventListener('abort', finished);
      return result;
    });
    online = false;
    responseError = undefined;
    currentToken = hostToken;
    prefix = crypto.randomUUID();
    mutate = vi.fn((_options: unknown) => responseError
      ? throwError(() => responseError)
      : of({ data: { cobrarCuotaEnEfectivo: { id: 'synthetic-receipt' } } }));
    onReconnect = vi.fn(() => () => undefined);
    TestBed.configureTestingModule({ providers: [
      { provide: NetworkStatusService, useValue: { isOnline: () => online, onReconnect } },
      { provide: AuthContextService, useValue: {
        refresh: () => hostToken, principalKey: () => 'synthetic-original-owner', devUserHeader: () => null,
      } },
    ] });
    const parent = TestBed.inject(EnvironmentInjector);
    standalone = createEnvironmentInjector([
      ...provideErp(), { provide: Apollo, useValue: { mutate } },
      { provide: AuthContextService, useValue: {
        refresh: () => hostToken, principalKey: () => 'synthetic-original-owner', devUserHeader: () => null,
      } },
    ], parent);
    const sync = standalone.get(OfflineSyncService);
    // Seed synthetic previous standalone work through its existing public API.
    await sync.enqueue('CobrarCuotaEnEfectivo', variables(prefix + '-failed'), prefix + '-failed');
    responseError = { status: 422 };
    online = true;
    await sync.flush();
    online = false;
    responseError = undefined;
    await sync.enqueue('CobrarCuotaEnEfectivo', variables(prefix + '-pending'), prefix + '-pending');
    originalPending = await sync.findPendingDuplicate('CobrarCuotaEnEfectivo', variables(prefix + '-pending'));
    originalFailed = (await sync.listFailed()).find(record => record.idempotencyKey === prefix + '-failed');
    expect(originalPending).toMatchObject({ ownerPrincipal: 'synthetic-original-owner', status: 'PENDING_SYNC' });
    expect(originalFailed).toMatchObject({ ownerPrincipal: 'synthetic-original-owner', status: 'FAILED' });
    // Finish standalone seed observations before measuring hosted browser activity.
    // Transaction instrumentation catches reuse of an already open connection too.
    const failed = await sync.listFailed();
    await vi.waitFor(() => {
      expect(sync.pendingCount()).toBe(1);
      expect(sync.failedCount()).toBe(failed.length);
      expect(pendingTransactions.size).toBe(0);
    });
    await drain();
    mutate.mockClear();
    onReconnect.mockClear();
    browserActivity = { opens: [], transactions: [] };
    const config = { mode: 'hosted' as const, graphqlUrl: 'https://host.example/erp-query', getAccessToken: () => currentToken };
    hosted = createEnvironmentInjector([
      ...provideErp(config), { provide: Apollo, useValue: { mutate } },
    ], parent);
  });

  afterEach(() => {
    hosted?.destroy();
    standalone?.destroy();
    vi.restoreAllMocks();
  });

  async function expectLegacyPreserved() {
    const sync = standalone.get(OfflineSyncService);
    expect(await sync.findPendingDuplicate('CobrarCuotaEnEfectivo', variables(prefix + '-pending'))).toEqual(originalPending);
    expect((await sync.listFailed()).find(record => record.idempotencyKey === prefix + '-failed')).toEqual(originalFailed);
  }

  it('does not activate persistent storage, reconnect replay or global queue counters when services resolve', async () => {
    const sync = hosted.get(OfflineSyncService);
    hosted.get(CriticalMutationService);
    await drain();
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(sync.pendingCount()).toBe(0);
    expect(sync.failedCount()).toBe(0);
    expect(sync.syncing()).toBe(false);
    expect(sync.lastSyncAt()).toBeNull();
    await expectLegacyPreserved();
  });

  it('suspends every public queue operation without reading, replaying, claiming or deleting previous records', async () => {
    const sync = hosted.get(OfflineSyncService);
    online = true;
    expect(await sync.flush()).toEqual([]);
    expect(await sync.findPendingDuplicate('CobrarCuotaEnEfectivo', variables(prefix + '-pending'))).toBeUndefined();
    expect(await sync.listFailed()).toEqual([]);
    await expect(sync.enqueue('CobrarCuotaEnEfectivo', variables('new'), prefix + '-new')).rejects.toThrow();
    await expect(sync.retry(prefix + '-failed')).rejects.toThrow();
    await expect(sync.discard(prefix + '-pending')).rejects.toThrow();
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(sync.pendingCount()).toBe(0);
    expect(sync.failedCount()).toBe(0);
    expect(sync.lastSyncAt()).toBeNull();
    await expectLegacyPreserved();
  });

  it('rejects a disconnected action instead of reporting queued success', async () => {
    const critical = hosted.get(CriticalMutationService);
    await expect(critical.run('CobrarCuotaEnEfectivo', variables('new'), prefix + '-new')).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    await expectLegacyPreserved();
  });

  it('surfaces a real network failure instead of enqueueing or returning fake success', async () => {
    online = true;
    const outage = new TypeError('Synthetic network unavailable');
    responseError = outage;
    const critical = hosted.get(CriticalMutationService);
    await expect(critical.run('CobrarCuotaEnEfectivo', variables('new'), prefix + '-new')).rejects.toBe(outage);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    await expectLegacyPreserved();
  });

  it('sends an online action with its original key and payload without consulting previous outbox work', async () => {
    online = true;
    const payload = variables(prefix + '-pending');
    const critical = hosted.get(CriticalMutationService);
    const result = await critical.run('CobrarCuotaEnEfectivo', payload, prefix + '-new');
    expect(result).toEqual({ status: 'completed', idempotencyKey: prefix + '-new', data: {
      cobrarCuotaEnEfectivo: { id: 'synthetic-receipt' },
    } });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ variables: payload, context: { idempotencyKey: prefix + '-new' } });
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    await expectLegacyPreserved();
  });

  it('rejects revoked credentials before an online mutation or persistent outbox access', async () => {
    online = true;
    currentToken = null;
    await expect(hosted.get(CriticalMutationService).run('CobrarCuotaEnEfectivo', variables('new'), prefix + '-new')).rejects.toThrow();
    expect(mutate).not.toHaveBeenCalled();
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    await expectLegacyPreserved();
  });

  it.each(['revocation', 'principal'] as const)('does not publish completed state after late %s while an issued mutation finishes', async boundary => {
    online = true;
    const ack = new Subject<any>();
    mutate.mockReturnValueOnce(ack);
    const done = hosted.get(CriticalMutationService).run('CobrarCuotaEnEfectivo', variables('new'), prefix + '-new')
      .then(value => ({ value }), error => ({ error }));
    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    currentToken = boundary === 'revocation' ? null
      : `e30.${btoa(JSON.stringify({ iss: 'host', sub: 'actor-B' }))}.signature`;
    ack.next({ data: { cobrarCuotaEnEfectivo: { id: 'late-result' } } });
    ack.complete();
    const outcome = await done;
    expect(outcome).toHaveProperty('error');
    expect(outcome).not.toHaveProperty('value');
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(onReconnect).not.toHaveBeenCalled();
    await expectLegacyPreserved();
  });

  it('preserves explicit standalone offline enqueue and duplicate-key behavior', async () => {
    const critical = standalone.get(CriticalMutationService);
    const payload = variables(prefix + '-standalone');
    expect(await critical.run('CobrarCuotaEnEfectivo', payload, prefix + '-standalone')).toEqual({
      status: 'queued', idempotencyKey: prefix + '-standalone',
    });
    expect(await critical.run('CobrarCuotaEnEfectivo', payload, prefix + '-other')).toEqual({
      status: 'queued', idempotencyKey: prefix + '-standalone',
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(await standalone.get(OfflineSyncService).findPendingDuplicate('CobrarCuotaEnEfectivo', payload)).toMatchObject({
      idempotencyKey: prefix + '-standalone', variables: payload, ownerPrincipal: 'synthetic-original-owner',
    });
    await expectLegacyPreserved();
  });

  it('does not open a database for hosted catalog requests and preserves seeded standalone copies', async () => {
    const key = prefix + '-catalog';
    await cachedCatalog(key, async () => ['standalone-original'], { online: true });
    await vi.waitFor(() => expect(pendingTransactions.size).toBe(0));
    browserActivity = { opens: [], transactions: [] };
    const options = { online: true, mode: 'hosted' as const };
    expect(await cachedCatalog(key, async () => ['host-fresh'], options)).toEqual({ data: ['host-fresh'], fromCache: false });
    expect(browserActivity).toEqual({ opens: [], transactions: [] });
    expect(await cachedCatalog(key, async () => [], { online: false })).toEqual({ data: ['standalone-original'], fromCache: true });
    await expectLegacyPreserved();
  });
});
