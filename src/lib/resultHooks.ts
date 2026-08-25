/**
 * Reading results off a run.
 *
 * Every screen in section E answers the same first question — *which run am
 * I looking at?* — so it is answered once, here, rather than ten times.
 *
 * The selected run lives in scope context, which clears it whenever the
 * affiliate or as-of date changes. That is deliberate: a run belongs to one
 * affiliate and one date, and carrying it across a scope change would show
 * the previous affiliate's numbers under the new affiliate's name. That is
 * exactly the v1 defect (D-01) this design exists to make impossible.
 */

import { useEffect, useMemo } from 'react';
import { useScope } from '@/context/ScopeContext';
import { useBatches } from './hooks';
import { useRunResults, useRuns } from './runHooks';
import type { CalculationElement, ProcessRun, RunResult } from '@/engine/types';

export interface SelectedRun {
  /** The run being displayed, or null when none is available. */
  run: ProcessRun | null;
  results: RunResult[];
  /** Completed runs for the current scope, newest first. */
  available: ProcessRun[];
  select: (runId: string) => void;
  isLoading: boolean;
  /** True once the data version the run pinned has been superseded. */
  isStale: boolean;
  /** Elements this run did not compute, so a screen can say why it is empty. */
  missing: (element: CalculationElement) => boolean;
}

export function useSelectedRun(): SelectedRun {
  const { affiliateCode, run, setRun } = useScope();
  const { data: runs = [], isLoading } = useRuns(affiliateCode);
  const { data: batches = [] } = useBatches();

  const available = useMemo(
    () =>
      runs
        .filter((r) => r.status === 'Completed')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runs],
  );

  // Default to the most recent completed run rather than showing an empty
  // screen. An explicit selection always wins — this only fills the gap.
  useEffect(() => {
    if (run === null && available.length > 0) setRun(available[0]!);
  }, [run, available, setRun]);

  const active = run ?? available[0] ?? null;
  const { data: results = [] } = useRunResults(active?.id ?? null);

  return {
    run: active,
    results,
    available,
    select: (runId: string) => {
      const next = available.find((r) => r.id === runId);
      if (next) setRun(next);
    },
    isLoading,
    isStale: active
      ? active.positionBatchIds.some((id) => batches.find((b) => b.id === id)?.status === 'Superseded')
      : false,
    missing: (element) => (active ? !active.elements.includes(element) : true),
  };
}

/**
 * The five props `<ResultsFrame>` always needs, so ten screens do not each
 * spell out the same wiring.
 */
export function frameProps(selected: SelectedRun) {
  return {
    run: selected.run,
    available: selected.available,
    onSelect: selected.select,
    isLoading: selected.isLoading,
    isStale: selected.isStale,
  };
}

/** Typed payload accessor, re-exported so screens import one module. */
export { payloadOf, methodologyOf } from './runHooks';
