import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { Subject, of } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { CriticalMutationService } from './critical-mutation.service';
import { erpLocalDb } from './dexie.db';
import { NetworkStatusService } from './network-status.service';
import { OfflineSyncService } from './offline-sync.service';

// No backend calls: the real network service and outbox talk only to this Apollo stub.
describe('financial outbox through browser network events', () => {
  let connected: boolean;
  let principal: string;
  let sent: any[];
  let ack: Subject<any>;
  beforeEach(async () => {
    connected = false;
    principal = 'user:A';
    sent = [];
    ack = new Subject();
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => connected);
    await erpLocalDb().offlineQueue.clear();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthContextService, useValue: { refresh: () => null, principalKey: () => principal } },
      { provide: Apollo, useValue: { mutate: (options: any) => {
        sent.push(options);
        return sent.length === 1 ? ack : of({ data: { registrarEgresoCaja: { id: 'remote-expense' } } });
      } } },
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

  it('queues cash and expense once, reacts to actual events and waits for acknowledgement before FIFO replay completes', async () => {
    const network = TestBed.inject(NetworkStatusService);
    const sync = TestBed.inject(OfflineSyncService);
    const critical = TestBed.inject(CriticalMutationService);
    const cash = { input: { cuotaId: '00000000-0000-4000-8000-000000000010', usuarioCajeroId: '00000000-0000-4000-8000-000000000011', ciNitCliente: '123', razonSocialCliente: 'Ana' } };
    const expense = { input: { montoBs: '12.50', metodoPago: 'EFECTIVO' as const, descripcion: 'Insumos', categoria: 'INSUMOS', usuarioCajeroId: cash.input.usuarioCajeroId } };
    const cashKey = '00000000-0000-4000-8000-000000000001';
    const expenseKey = '00000000-0000-4000-8000-000000000002';
    window.dispatchEvent(new Event('offline'));
    expect(network.online()).toBe(false);
    expect(await critical.run('CobrarCuotaEnEfectivo', cash, cashKey)).toEqual({ status: 'queued', idempotencyKey: cashKey });
    expect(await critical.run('CobrarCuotaEnEfectivo', cash, cashKey)).toEqual({ status: 'queued', idempotencyKey: cashKey });
    expect(await critical.run('RegistrarEgresoCaja', expense, expenseKey)).toEqual({ status: 'queued', idempotencyKey: expenseKey });
    expect(await critical.run('RegistrarEgresoCaja', expense, expenseKey)).toEqual({ status: 'queued', idempotencyKey: expenseKey });
    const original = await erpLocalDb().offlineQueue.toArray();
    expect(original).toHaveLength(2);
    expect(original.map((r) => [r.idempotencyKey, r.mutationName, r.variables, r.ownerPrincipal, r.status])).toEqual([
      [cashKey, 'CobrarCuotaEnEfectivo', cash, 'user:A', 'PENDING_SYNC'],
      [expenseKey, 'RegistrarEgresoCaja', expense, 'user:A', 'PENDING_SYNC'],
    ]);
    expect(sent).toEqual([]);
    await vi.waitFor(() => expect(sync.pendingCount()).toBe(2));
    const generateKey = vi.spyOn(crypto, 'randomUUID');
    principal = 'user:B';
    connected = true;
    window.dispatchEvent(new Event('online'));
    expect(network.online()).toBe(true);
    await sync.flush();
    expect(sent).toEqual([]);
    expect(await erpLocalDb().offlineQueue.toArray()).toEqual(original);
    expect(sync.pendingCount()).toBe(2);
    expect(sync.failedCount()).toBe(0);
    principal = 'user:A';
    window.dispatchEvent(new Event('online'));
    const flushing = sync.flush();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(await erpLocalDb().offlineQueue.toArray()).toEqual(original);
    expect(sync.lastSyncAt()).toBeNull();
    ack.next({ data: { cobrarCuotaEnEfectivo: { id: 'remote-receipt' } } });
    ack.complete();
    await flushing;
    await sync.flush();
    expect(sent.map((s) => [s.context.idempotencyKey, s.variables, s.context.ownerPrincipal])).toEqual([
      [cashKey, cash, 'user:A'], [expenseKey, expense, 'user:A'],
    ]);
    expect(await erpLocalDb().offlineQueue.toArray()).toEqual(original.map((r) => ({ ...r, status: 'SYNCED', syncedAt: expect.any(String), lastError: undefined })));
    await vi.waitFor(() => expect(sync.pendingCount()).toBe(0));
    expect(sync.failedCount()).toBe(0);
    expect(generateKey).not.toHaveBeenCalled();
    connected = false;
    window.dispatchEvent(new Event('offline'));
    expect(network.online()).toBe(false);
  });

  it('refuses unknown persisted instructions without invoking Apollo or altering their payload', async () => {
    const sync = TestBed.inject(OfflineSyncService);
    const record = { ownerPrincipal: principal, idempotencyKey: 'unknown', mutationName: 'mutation ArbitraryAgentInstruction', variables: { instruction: 'do not execute' }, createdAt: '2026-01-01', status: 'PENDING_SYNC' as const };
    await erpLocalDb().offlineQueue.add(record);
    connected = true;
    window.dispatchEvent(new Event('online'));
    await sync.flush();
    expect(sent).toEqual([]);
    expect(await erpLocalDb().offlineQueue.toArray()).toEqual([{ ...record, status: 'FAILED', lastError: `Unknown offline mutation ${record.mutationName}` }]);
  });
});
