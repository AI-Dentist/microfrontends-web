import { OfflineMutationRecord } from './dexie.db';
import { replayQueue, ReplayOutcome } from './replay-queue';

function record(key: string, createdAt: string, status: OfflineMutationRecord['status'] = 'PENDING_SYNC'): OfflineMutationRecord {
  return { idempotencyKey: key, mutationName: 'CobrarCuotaEnEfectivo', variables: {}, createdAt, status };
}

describe('replayQueue', () => {
  it('replays pending records in creation order', async () => {
    const sent: string[] = [];
    const results = await replayQueue(
      [record('b', '2026-10-22T10:00:02Z'), record('a', '2026-10-22T10:00:01Z')],
      async (r: OfflineMutationRecord) => {
        sent.push(r.idempotencyKey);
        return 'synced';
      },
    );
    expect(sent).toEqual(['a', 'b']);
    expect(results).toEqual([
      { idempotencyKey: 'a', outcome: 'synced' },
      { idempotencyKey: 'b', outcome: 'synced' },
    ]);
  });

  it('skips records that are not pending', async () => {
    const sent: string[] = [];
    await replayQueue([record('a', '1', 'SYNCED'), record('b', '2', 'FAILED'), record('c', '3')], async (r: OfflineMutationRecord) => {
      sent.push(r.idempotencyKey);
      return 'synced';
    });
    expect(sent).toEqual(['c']);
  });

  it('stops at the first retryable outcome to preserve order', async () => {
    const sent: string[] = [];
    const outcomes: Record<string, ReplayOutcome> = { a: 'synced', b: 'retry', c: 'synced' };
    const results = await replayQueue([record('a', '1'), record('b', '2'), record('c', '3')], async (r: OfflineMutationRecord) => {
      sent.push(r.idempotencyKey);
      return outcomes[r.idempotencyKey];
    });
    expect(sent).toEqual(['a', 'b']);
    expect(results).toEqual([
      { idempotencyKey: 'a', outcome: 'synced' },
      { idempotencyKey: 'b', outcome: 'retry' },
    ]);
  });

  it('continues after a permanently failed record', async () => {
    const results = await replayQueue([record('a', '1'), record('b', '2')], async (r: OfflineMutationRecord) =>
      r.idempotencyKey === 'a' ? 'failed' : 'synced',
    );
    expect(results.map((r) => r.outcome)).toEqual(['failed', 'synced']);
  });

  it('treats a thrown error as retryable', async () => {
    const results = await replayQueue([record('a', '1'), record('b', '2')], async () => {
      throw new Error('socket hang up');
    });
    expect(results).toEqual([{ idempotencyKey: 'a', outcome: 'retry', error: 'socket hang up' }]);
  });
});
