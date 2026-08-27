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
  // `run` is cleared by scope context whenever the affiliate or as-of date changes.
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

  // Default to the most recent completed run; an explicit selection always wins.
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

/** The props `<ResultsFrame>` needs. */
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
