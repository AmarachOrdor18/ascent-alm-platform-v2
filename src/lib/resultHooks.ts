import { useMemo } from 'react';
import { useScope } from '@/context/ScopeContext';
import { useBatches } from './hooks';
import { useRunResults, useScopedRuns } from './runHooks';
import { isRunStale } from './runStaleness';
import { buildSeries, pickOfficial, type OfficialRun } from './runSeries';
import type { CalculationElement, LoadBatch, ProcessRun, RunResult } from '@/engine/types';

export interface RunSelection {
  /** The run being displayed: an explicit (session) choice, else the official run for this scope. */
  run: ProcessRun | null;
  /** Every completed version for the current scope - newest as-of date first, newest version first. */
  available: ProcessRun[];
  /** Every run for the current scope (any status) - what version numbers are computed against. */
  allRuns: ProcessRun[];
  /** The official run for this scope: latest date's signed-off version, else its latest (provisional) one. */
  official: OfficialRun | null;
  /** True when the displayed run is the official one. */
  isOfficial: boolean;
  select: (runId: string) => void;
  /** Drop the session choice and follow the official run again. */
  selectOfficial: () => void;
  isLoading: boolean;
}

/**
 * Which run the results screens (and the header's run pill) read. By default the official run - the
 * latest as-of date's signed-off version, or its latest provisional version when nothing is signed off
 * yet. Choosing another version is a session-only override held in scope context; clearing it (or
 * changing scope) returns to the official run, which keeps tracking new sign-offs automatically.
 */
export function useRunSelection(): RunSelection {
  const { affiliateCode, asOfDate, run, setRun } = useScope();
  const { data: scopeRuns = [], isLoading } = useScopedRuns(affiliateCode);
  // Results follow the working date chosen in the header: the official version for that date (the run pill
  // picks another version within it). With no working date yet, every date is in play.
  const runs = useMemo(
    () => (asOfDate ? scopeRuns.filter((r) => r.asOfDate === asOfDate) : scopeRuns),
    [scopeRuns, asOfDate],
  );

  const available = useMemo(() => buildSeries(runs).flatMap((s) => s.versions), [runs]);
  const official = useMemo(() => pickOfficial(runs), [runs]);

  // Resolve the session choice against the fresh list, so a sign-off/reopen shows up immediately.
  const chosen = run ? (runs.find((r) => r.id === run.id) ?? run) : null;
  const active = chosen ?? official?.run ?? null;

  return {
    run: active,
    available,
    allRuns: runs,
    official,
    isOfficial: !!active && active.id === official?.run.id,
    select: (runId: string) => {
      const next = available.find((r) => r.id === runId);
      if (next) setRun(next.id === official?.run.id ? null : next);
    },
    selectOfficial: () => setRun(null),
    isLoading,
  };
}

export interface SelectedRun extends RunSelection {
  results: RunResult[];
  /** True once the data version the run pinned has been superseded. */
  isStale: boolean;
  /** Elements this run did not compute, so a screen can say why it is empty. */
  missing: (element: CalculationElement) => boolean;
  /** The batches `run.positionBatchIds` actually pins - the lineage a results screen can point back to. */
  sourceBatches: LoadBatch[];
}

export function useSelectedRun(): SelectedRun {
  const selection = useRunSelection();
  const { data: batches = [] } = useBatches();
  const active = selection.run;
  const { data: results = [] } = useRunResults(active?.id ?? null);

  return {
    ...selection,
    results,
    isStale: isRunStale(active, batches),
    missing: (element) => (active ? !active.elements.includes(element) : true),
    sourceBatches: active ? batches.filter((b) => active.positionBatchIds.includes(b.id)) : [],
  };
}

/** The props `<ResultsFrame>` needs. */
export function frameProps(selected: SelectedRun) {
  return {
    run: selected.run,
    available: selected.available,
    allRuns: selected.allRuns,
    official: selected.official,
    isOfficial: selected.isOfficial,
    onSelect: selected.select,
    onSelectOfficial: selected.selectOfficial,
    isLoading: selected.isLoading,
    isStale: selected.isStale,
    sourceBatches: selected.sourceBatches,
  };
}

/** Typed payload accessor, re-exported so screens import one module. */
export { payloadOf, methodologyOf } from './runHooks';
