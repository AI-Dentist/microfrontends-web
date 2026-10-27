import { OfflineMutationRecord } from './dexie.db';

/**
 * synced: accepted by MS1. failed: rejected for good. retry: network problem, try later.
 * skipped: no longer pending (another tab already handled it).
 */
export type ReplayOutcome = 'synced' | 'failed' | 'retry' | 'skipped';

export interface ReplayResult {
  idempotencyKey: string;
  outcome: ReplayOutcome;
  error?: string;
}

/**
 * Replays pending offline mutations one by one in creation order. It stops at the first
 * retryable outcome so later charges never overtake an earlier one; the backend
 * deduplicates by Idempotency-Key, so replaying an already applied record is safe.
 */
export async function replayQueue(
  records: readonly OfflineMutationRecord[],
  send: (record: OfflineMutationRecord) => Promise<ReplayOutcome>,
): Promise<ReplayResult[]> {
  const pending = records
    .filter((record) => record.status === 'PENDING_SYNC')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const results: ReplayResult[] = [];
  for (const record of pending) {
    try {
      const outcome = await send(record);
      results.push({ idempotencyKey: record.idempotencyKey, outcome });
      if (outcome === 'retry') {
        break;
      }
    } catch (error) {
      results.push({
        idempotencyKey: record.idempotencyKey,
        outcome: 'retry',
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
  return results;
}
