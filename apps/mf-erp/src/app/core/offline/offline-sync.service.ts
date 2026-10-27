import { Injectable, inject, signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { liveQuery } from 'dexie';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../graphql/graphql.provider';
import { OFFLINE_REPLAYABLE_MUTATIONS, OfflineMutationName } from '../graphql/mutations.graphql';
import { OfflineMutationRecord, erpLocalDb } from './dexie.db';
import { classifyMutationError, describeError } from './mutation-errors';
import { NetworkStatusService } from './network-status.service';
import { findPendingDuplicate } from './pending-actions';
import { ReplayOutcome, ReplayResult, replayQueue } from './replay-queue';

const OUTBOX_LOCK_NAME = 'dental-erp-offline-outbox';

/**
 * Only one tab replays the outbox at a time (Web Locks API). A tab that finds the lock taken
 * waits for it and then re-reads the queue, so records retried meanwhile are not left behind
 * and records the other tab already sent are skipped by the per-record check.
 */
function withOutboxLock(replay: () => Promise<ReplayResult[]>): Promise<ReplayResult[]> {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) {
    return replay();
  }
  return locks.request(OUTBOX_LOCK_NAME, () => replay());
}

/**
 * Offline outbox: stores critical mutations made without connection and replays them, in
 * order and with their original Idempotency-Key, as soon as the browser is back online.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  private readonly network = inject(NetworkStatusService);
  private readonly db = erpLocalDb();
  private inFlight: Promise<ReplayResult[]> | null = null;
  private rerunRequested = false;

  readonly pendingCount = signal(0);
  readonly failedCount = signal(0);
  readonly syncing = signal(false);
  readonly lastSyncAt = signal<string | null>(null);

  constructor() {
    liveQuery(() => this.db.offlineQueue.where('status').equals('PENDING_SYNC').count()).subscribe({
      next: (count) => this.pendingCount.set(count),
      error: (error) => console.warn('[OfflineSync] queue unavailable', error),
    });
    liveQuery(() => this.db.offlineQueue.where('status').equals('FAILED').count()).subscribe({
      next: (count) => this.failedCount.set(count),
      error: () => undefined,
    });
    this.network.onReconnect(() => void this.flush());
    if (this.network.isOnline()) {
      void this.flush();
    }
  }

  /**
   * Adds a record; a key already in the outbox keeps its original payload and position. The
   * same key means the same action and payload (IdempotentAction), so a FAILED one re-enters
   * the queue.
   */
  async enqueue(mutationName: OfflineMutationName, variables: unknown, idempotencyKey: string, ownerPrincipal = this.requirePrincipal()): Promise<void> {
    this.assertPrincipal(ownerPrincipal);
    const queue = this.db.offlineQueue;
    await this.db.transaction('rw', queue, async () => {
      const existing = await queue.get(idempotencyKey);
      this.assertPrincipal(ownerPrincipal);
      if (existing) {
        if (existing.ownerPrincipal !== ownerPrincipal) throw new Error('La acción pertenece a otra sesión o no tiene propietario confirmado.');
        if (existing.status === 'FAILED') {
          await queue.update(idempotencyKey, { status: 'PENDING_SYNC', lastError: undefined });
        }
        return;
      }
      await queue.add({
        ownerPrincipal,
        idempotencyKey,
        mutationName,
        variables,
        createdAt: new Date().toISOString(),
        status: 'PENDING_SYNC',
      });
    });
  }

  /** A still-pending record for the same business action (same installment, same CI/NIT). */
  async findPendingDuplicate(mutationName: OfflineMutationName, variables: unknown, ownerPrincipal = this.requirePrincipal()): Promise<OfflineMutationRecord | undefined> {
    const pending = await this.db.offlineQueue.where('status').equals('PENDING_SYNC').toArray();
    this.assertPrincipal(ownerPrincipal);
    return findPendingDuplicate(pending, mutationName, variables, ownerPrincipal);
  }

  async listFailed(): Promise<OfflineMutationRecord[]> {
    const owner = this.requirePrincipal();
    const records = await this.db.offlineQueue.where('status').equals('FAILED').sortBy('createdAt');
    this.assertPrincipal(owner);
    return records.filter((record) => record.ownerPrincipal === owner);
  }

  /** Returns a failed record to the queue (same key, so MS1 still deduplicates it). */
  async retry(idempotencyKey: string): Promise<void> {
    await this.db.transaction('rw', this.db.offlineQueue, async () => {
      const record = await this.db.offlineQueue.get(idempotencyKey);
      if (!record?.ownerPrincipal) throw new Error('La acción no tiene propietario confirmado.');
      this.assertPrincipal(record.ownerPrincipal);
      await this.db.offlineQueue.update(idempotencyKey, { status: 'PENDING_SYNC', lastError: undefined });
    });
    void this.flush();
  }

  async discard(idempotencyKey: string): Promise<void> {
    await this.db.transaction('rw', this.db.offlineQueue, async () => {
      const record = await this.db.offlineQueue.get(idempotencyKey);
      if (!record?.ownerPrincipal) throw new Error('La acción no tiene propietario confirmado.');
      this.assertPrincipal(record.ownerPrincipal);
      await this.db.offlineQueue.delete(idempotencyKey);
    });
  }

  /**
   * Single-flight: concurrent calls (online event + manual click) share the same replay, and
   * a call arriving mid-flight (e.g. a retry) schedules one more pass before it resolves.
   */
  flush(): Promise<ReplayResult[]> {
    if (!this.network.isOnline()) {
      return Promise.resolve([]);
    }
    if (this.inFlight) {
      this.rerunRequested = true;
      return this.inFlight;
    }
    this.inFlight = this.runFlush();
    return this.inFlight;
  }

  private async runFlush(): Promise<ReplayResult[]> {
    this.syncing.set(true);
    const results: ReplayResult[] = [];
    try {
      do {
        this.rerunRequested = false;
        results.push(...(await withOutboxLock(() => this.replayPending())));
      } while (this.rerunRequested && this.network.isOnline());
      if (results.some((result) => result.outcome === 'synced')) {
        this.lastSyncAt.set(new Date().toISOString());
      }
      return results;
    } finally {
      // Cleared synchronously after the last rerun check: a later flush() starts a new run
      // instead of joining one that is about to resolve.
      this.inFlight = null;
      this.syncing.set(false);
    }
  }

  private async replayPending(): Promise<ReplayResult[]> {
    const records = await this.db.offlineQueue.where('status').equals('PENDING_SYNC').toArray();
    return replayQueue(records, (record) => this.send(record));
  }

  private async send(snapshot: OfflineMutationRecord): Promise<ReplayOutcome> {
    // Another tab may have replayed or discarded it since the snapshot was read.
    const record = await this.db.offlineQueue.get(snapshot.idempotencyKey);
    if (record?.status !== 'PENDING_SYNC' || !this.owns(record)) {
      return 'skipped';
    }
    const mutation = OFFLINE_REPLAYABLE_MUTATIONS[record.mutationName as OfflineMutationName];
    if (!mutation) {
      await this.markFailed(record, `Unknown offline mutation ${record.mutationName}`);
      return 'failed';
    }
    try {
      // Refresh after all awaited reads and immediately before Apollo captures auth headers.
      if (!this.owns(record)) return 'skipped';
      await firstValueFrom(
        this.apollo.mutate({
          mutation,
          variables: record.variables,
          context: { [IDEMPOTENCY_CONTEXT_KEY]: record.idempotencyKey, [OWNER_CONTEXT_KEY]: record.ownerPrincipal },
        }),
      );
      if (!this.owns(record)) return 'skipped';
      await this.db.offlineQueue.update(record.idempotencyKey, {
        status: 'SYNCED',
        syncedAt: new Date().toISOString(),
        lastError: undefined,
      });
      return 'synced';
    } catch (error) {
      if (!this.owns(record)) return 'skipped';
      if (classifyMutationError(error) === 'retryable') {
        return 'retry';
      }
      await this.markFailed(record, describeError(error));
      return 'failed';
    }
  }

  private owns(record: OfflineMutationRecord): boolean {
    this.auth.refresh();
    return !!record.ownerPrincipal && record.ownerPrincipal === this.auth.principalKey();
  }

  private requirePrincipal(): string {
    this.auth.refresh();
    const principal = this.auth.principalKey();
    if (!principal) throw new Error('Se requiere una sesión vigente con identidad confirmada.');
    return principal;
  }

  private assertPrincipal(expected: string): void {
    if (this.requirePrincipal() !== expected) throw new Error('La sesión cambió; vuelva a iniciar la acción con su usuario original.');
  }

  private markFailed(record: OfflineMutationRecord, lastError: string): Promise<number> {
    return this.db.offlineQueue.update(record.idempotencyKey, { status: 'FAILED', lastError });
  }
}
