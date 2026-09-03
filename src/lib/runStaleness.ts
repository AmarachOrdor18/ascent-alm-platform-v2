import type { LoadBatch, ProcessRun } from '@/engine/types';

/** A run is stale once its pinned data version has been superseded. Shared by every screen that
 * reads from a run - resultHooks.ts, RunHistory.tsx, and the reporting screens - so the predicate
 * lives in exactly one place. */
export function isRunStale(run: ProcessRun | null, batches: LoadBatch[]): boolean {
  if (!run) return false;
  return run.positionBatchIds.some((id) => batches.find((b) => b.id === id)?.status === 'Superseded');
}

/** A run's Positions data was never checked against a GL trial balance - the figures are unverified,
 * not wrong. Informational everywhere it's shown, never a block. */
export function isRunUnreconciled(run: ProcessRun | null, batches: LoadBatch[]): boolean {
  if (!run) return false;
  return run.positionBatchIds.some((id) => {
    const b = batches.find((x) => x.id === id);
    return b?.domain === 'Positions' && !b.reconciledAt;
  });
}
