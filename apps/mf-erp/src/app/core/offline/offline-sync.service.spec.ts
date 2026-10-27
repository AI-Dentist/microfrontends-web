import { TestBed } from '@angular/core/testing';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Apollo } from 'apollo-angular';
import { Observable, defer, of, throwError } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { CriticalMutationService } from './critical-mutation.service';
import { IdempotentAction } from './idempotent-action';
import { erpLocalDb } from './dexie.db';
import { NetworkStatusService } from './network-status.service';
import { OfflineSyncService } from './offline-sync.service';

type MutateOptions = { variables: any; context: { idempotencyKey: string } };

const cashCharge = (cuotaId: string, ciNitCliente = '123') => ({
  input: { cuotaId, usuarioCajeroId: 'a1000000-0000-0000-0000-000000000001', ciNitCliente, razonSocialCliente: 'Perez' },
});

describe('OfflineSyncService (IndexedDB outbox)', () => {
  let sent: MutateOptions[];
  let respond: (options: MutateOptions) => Observable<unknown>;
  let online: boolean;
  let principal: string | null;

  function setup() {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthContextService, useValue: { refresh: () => null, principalKey: () => principal } },
        { provide: Apollo, useValue: { mutate: (options: MutateOptions) => defer(() => { sent.push(options); return respond(options); }) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => online, online: () => online, onReconnect: () => () => undefined } },
      ],
    });
    return { sync: TestBed.inject(OfflineSyncService), critical: TestBed.inject(CriticalMutationService) };
  }

  beforeEach(async () => {
    sent = [];
    online = false;
    principal = 'user:A';
    respond = () => of({ data: {} });
    await erpLocalDb().offlineQueue.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('binds replay to the originator and keeps the same key and payload across login refresh', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    const original = await erpLocalDb().offlineQueue.get('k1');
    expect(original?.ownerPrincipal).toBe('user:A');
    principal = 'user:B';
    online = true;
    await sync.flush();
    expect(sent).toEqual([]);
    expect(await erpLocalDb().offlineQueue.get('k1')).toEqual(original);
    principal = 'user:A';
    await sync.flush();
    await sync.flush();
    expect(sent.map((s) => [s.context.idempotencyKey, s.variables])).toEqual([['k1', original?.variables]]);
    expect(await erpLocalDb().offlineQueue.get('k1')).toMatchObject({ ...original, status: 'SYNCED' });
  });

  it('does not merge the same installment across owners or claim an existing key', async () => {
    const { sync, critical } = setup();
    await critical.run('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    const original = await erpLocalDb().offlineQueue.get('k1');
    principal = 'user:B';
    expect(await critical.run('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k2')).toEqual({ status: 'queued', idempotencyKey: 'k2' });
    await expect(sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1')).rejects.toThrow();
    expect(await erpLocalDb().offlineQueue.get('k1')).toEqual(original);
    expect(await erpLocalDb().offlineQueue.count()).toBe(2);
  });

  it('leaves legacy ownerless records untouched and never sends or retries them', async () => {
    const { sync } = setup();
    const legacy = { idempotencyKey: 'legacy', mutationName: 'CobrarCuotaEnEfectivo', variables: cashCharge('c1'), createdAt: '2026-01-01T00:00:00Z', status: 'PENDING_SYNC' as const };
    await erpLocalDb().offlineQueue.add(legacy);
    online = true;
    await sync.flush();
    await expect(sync.retry('legacy')).rejects.toThrow();
    expect(sent).toEqual([]);
    expect(await erpLocalDb().offlineQueue.get('legacy')).toEqual(legacy);
  });

  it('rechecks the principal after waiting for the Web Lock', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('navigator', { locks: { request: async (_: string, callback: () => Promise<unknown>) => { await waiting; return callback(); } } });
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    online = true;
    const flushing = sync.flush();
    principal = 'user:B';
    release();
    await flushing;
    expect(sent).toEqual([]);
    expect(await erpLocalDb().offlineQueue.get('k1')).toMatchObject({ status: 'PENDING_SYNC', ownerPrincipal: 'user:A' });
  });

  it('does not mark an in-flight record synced or send the next one after the principal changes', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    respond = () => defer(() => { principal = 'user:B'; return of({ data: {} }); });
    online = true;
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1']);
    expect((await erpLocalDb().offlineQueue.toArray()).map((r) => r.status)).toEqual(['PENDING_SYNC', 'PENDING_SYNC']);
  });

  it('never overwrites a queued record that reuses the same key', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1', '123'), 'k1');
    const original = await erpLocalDb().offlineQueue.get('k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1', '999'), 'k1');
    expect(await erpLocalDb().offlineQueue.get('k1')).toEqual(original);
  });

  it('queues the same installment only once even when the modal is reopened with a new key', async () => {
    const { critical } = setup();
    const first = await critical.run('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    const second = await critical.run('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k2');
    expect(first).toEqual({ status: 'queued', idempotencyKey: 'k1' });
    expect(second).toEqual({ status: 'queued', idempotencyKey: 'k1' });
    expect(await erpLocalDb().offlineQueue.count()).toBe(1);
  });

  it('issues a new key when the same action is resubmitted with an edited payload', async () => {
    const { critical } = setup();
    online = true;
    respond = (options) =>
      options.variables.input.razonSocialCliente === 'Perez'
        ? throwError(() => new CombinedGraphQLErrors({ errors: [{ message: 'NIT invalido' }] }))
        : of({ data: { cobrarCuotaEnEfectivo: { id: 'r1' } } });
    const action = new IdempotentAction();
    await expect(critical.run('CobrarCuotaEnEfectivo', cashCharge('c1'), action)).rejects.toThrow('NIT invalido');
    const edited = { input: { ...cashCharge('c1').input, razonSocialCliente: 'Perez SRL' } };
    const result = await critical.run('CobrarCuotaEnEfectivo', edited, action);
    expect(result.status).toBe('completed');
    expect(sent[0].context.idempotencyKey).not.toBe(sent[1].context.idempotencyKey);
  });

  it('replays in order with the original keys and marks records as synced', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    online = true;
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1', 'k2']);
    expect((await erpLocalDb().offlineQueue.toArray()).map((r) => r.status)).toEqual(['SYNCED', 'SYNCED']);
  });

  it.each([401, 409])('keeps HTTP %s pending with immutable payload, key and position until retry', async (status) => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    const original = await erpLocalDb().offlineQueue.toArray();
    online = true;
    respond = () => throwError(() => ({ status }));
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1']);
    expect(await erpLocalDb().offlineQueue.toArray()).toEqual(original);
    respond = () => of({ data: {} });
    await sync.flush();
    expect(sent.map((s) => [s.context.idempotencyKey, s.variables])).toEqual([
      ['k1', original[0].variables], ['k1', original[0].variables], ['k2', original[1].variables],
    ]);
  });

  it('keeps HTTP 422 terminal without changing the stored payload or key', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    const original = await erpLocalDb().offlineQueue.get('k1');
    respond = () => throwError(() => ({ status: 422 }));
    online = true;
    await sync.flush();
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1']);
    expect(await erpLocalDb().offlineQueue.get('k1')).toMatchObject({ ...original, status: 'FAILED' });
  });

  it('marks business rejections as failed and keeps network failures pending', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    online = true;
    respond = (options) =>
      options.context.idempotencyKey === 'k1'
        ? throwError(() => new CombinedGraphQLErrors({ errors: [{ message: 'Cuota ya pagada' }] }))
        : throwError(() => new TypeError('Failed to fetch'));
    await sync.flush();
    expect(await erpLocalDb().offlineQueue.get('k1')).toMatchObject({ status: 'FAILED', lastError: 'Cuota ya pagada' });
    expect(await erpLocalDb().offlineQueue.get('k2')).toMatchObject({ status: 'PENDING_SYNC' });
  });

  it('skips a record another tab synced after this flush started', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    online = true;
    respond = () =>
      defer(async () => {
        await erpLocalDb().offlineQueue.update('k2', { status: 'SYNCED' });
        return { data: {} };
      });
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1']);
  });

  it('waits for the outbox lock held by another tab instead of skipping its pass', async () => {
    let release!: () => void;
    const otherTabDone = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('navigator', {
      onLine: true,
      locks: {
        request: async (_name: string, callback: (lock: object) => Promise<unknown>) => {
          await otherTabDone;
          return callback({});
        },
      },
    });
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    online = true;
    const flushing = sync.flush();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sent).toEqual([]);
    release();
    await flushing;
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1']);
  });

  it('puts a failed record back in the queue when the same action is retried offline', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await erpLocalDb().offlineQueue.update('k1', { status: 'FAILED', lastError: 'x' });
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    const record = await erpLocalDb().offlineQueue.get('k1');
    expect(record?.status).toBe('PENDING_SYNC');
    expect(record?.lastError).toBeUndefined();
  });

  it('runs a flush requested right after the previous one finished', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    online = true;
    const first = sync.flush();
    await first;
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1', 'k2']);
  });

  it('also sends a record retried while a flush was already running', async () => {
    const { sync } = setup();
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c1'), 'k1');
    await sync.enqueue('CobrarCuotaEnEfectivo', cashCharge('c2'), 'k2');
    await erpLocalDb().offlineQueue.update('k2', { status: 'FAILED', lastError: 'x' });
    online = true;
    respond = (options) =>
      defer(async () => {
        if (options.context.idempotencyKey === 'k1') {
          await sync.retry('k2');
        }
        return { data: {} };
      });
    await sync.flush();
    expect(sent.map((s) => s.context.idempotencyKey)).toEqual(['k1', 'k2']);
    expect(await erpLocalDb().offlineQueue.get('k2')).toMatchObject({ status: 'SYNCED' });
  });
});
