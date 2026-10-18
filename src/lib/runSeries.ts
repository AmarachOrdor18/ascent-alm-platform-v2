/**
 * Run management: a run "series" is one scope (affiliate, or GROUP) at one as-of date. Every execution
 * within a series is a new version - v1, v2, ... - and each version moves through Open (provisional) ->
 * PendingSignOff -> SignedOff, and may later be Reopened (with a reason). Signed-off and reopened
 * versions are frozen; a reopened series' next execution becomes the next version.
 *
 * Pure helpers - shared by the run hooks, the results screens' selection, the Runs page, Approvals and
 * the reporting screens, so "which version is official" is decided in exactly one place.
 */
import type { ProcessRun, RunSignOffStatus } from '@/engine/types';
import { formatDate } from './format';

export function seriesKeyFor(affiliateCode: string, asOfDate: string): string {
  return `${affiliateCode}|${asOfDate}`;
}

export function seriesKeyOf(run: ProcessRun): string {
  return run.seriesKey ?? seriesKeyFor(run.affiliateCode, run.asOfDate);
}

export function signOffStatusOf(run: ProcessRun): RunSignOffStatus {
  return run.signOff?.status ?? 'Open';
}

/** Signed-off and reopened versions are immutable - the figures someone signed stay exactly as signed. */
export function isFrozen(run: ProcessRun): boolean {
  const s = signOffStatusOf(run);
  return s === 'SignedOff' || s === 'Reopened';
}

export const SIGN_OFF_LABEL: Record<RunSignOffStatus, string> = {
  Open: 'Provisional',
  PendingSignOff: 'Pending sign-off',
  SignedOff: 'Signed off',
  Reopened: 'Reopened',
};

export const SIGN_OFF_TONE: Record<RunSignOffStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  Open: 'info',
  PendingSignOff: 'warning',
  SignedOff: 'success',
  Reopened: 'neutral',
};

export interface RunSeries {
  key: string;
  affiliateCode: string;
  asOfDate: string;
  /** Completed versions, newest (highest version) first. */
  versions: ProcessRun[];
  /** Executions that failed - they never became a version. */
  failed: ProcessRun[];
  latest: ProcessRun | null;
  /** The latest signed-off version, if any. */
  signedOff: ProcessRun | null;
}

/** Version number as displayed - stored on new runs; older runs read as their order within the series. */
export function versionOf(run: ProcessRun, allRuns: ProcessRun[]): number {
  if (run.version !== undefined) return run.version;
  const key = seriesKeyOf(run);
  const legacy = allRuns
    .filter((r) => r.status === 'Completed' && r.version === undefined && seriesKeyOf(r) === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const idx = legacy.findIndex((r) => r.id === run.id);
  return idx >= 0 ? idx + 1 : 1;
}

/** Group runs into series, newest as-of date first; versions within a series newest first. */
export function buildSeries(runs: ProcessRun[]): RunSeries[] {
  const map = new Map<string, RunSeries>();
  for (const r of runs) {
    // Draft/queued/running rows (an execution still in flight) belong to no series yet.
    if (r.status !== 'Completed' && r.status !== 'Failed') continue;
    const key = seriesKeyOf(r);
    let s = map.get(key);
    if (!s) {
      s = {
        key,
        affiliateCode: r.affiliateCode,
        asOfDate: r.asOfDate,
        versions: [],
        failed: [],
        latest: null,
        signedOff: null,
      };
      map.set(key, s);
    }
    if (r.status === 'Completed') s.versions.push(r);
    else if (r.status === 'Failed') s.failed.push(r);
  }
  const list = Array.from(map.values());
  for (const s of list) {
    s.versions.sort((a, b) => versionOf(b, runs) - versionOf(a, runs) || b.createdAt.localeCompare(a.createdAt));
    s.failed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    s.latest = s.versions[0] ?? null;
    s.signedOff = s.versions.find((v) => signOffStatusOf(v) === 'SignedOff') ?? null;
  }
  return list.sort(
    (a, b) =>
      b.asOfDate.localeCompare(a.asOfDate) ||
      a.affiliateCode.localeCompare(b.affiliateCode) ||
      (b.latest?.createdAt ?? '').localeCompare(a.latest?.createdAt ?? ''),
  );
}

/** The version number the next execution in this series gets. */
export function nextVersion(seriesRuns: ProcessRun[], allRuns: ProcessRun[]): number {
  const completed = seriesRuns.filter((r) => r.status === 'Completed');
  return completed.reduce((m, r) => Math.max(m, versionOf(r, allRuns)), 0) + 1;
}

/**
 * Why a new version cannot be created in this series right now, or null when it can. A signed-off
 * series must be reopened first (with a reason); a version awaiting sign-off must be decided first.
 */
export function seriesLockReason(series: RunSeries | null | undefined, allRuns: ProcessRun[] = []): string | null {
  const latest = series?.latest;
  if (!series || !latest) return null;
  const status = signOffStatusOf(latest);
  const v = versionOf(latest, allRuns);
  const date = formatDate(series.asOfDate);
  if (status === 'SignedOff') return `${date} is signed off (v${v}) - reopen it first to create a new version.`;
  if (status === 'PendingSignOff') {
    return `${date} v${v} is awaiting sign-off - it must be approved or rejected before a new version can be created.`;
  }
  return null;
}

export type OfficialKind = 'SignedOff' | 'Provisional' | 'PendingSignOff';

export interface OfficialRun {
  run: ProcessRun;
  kind: OfficialKind;
}

/**
 * The run every screen reads by default, for one scope's runs: the latest as-of date's series; within
 * it, its latest signed-off version - or, if nothing is signed off there yet, its latest version
 * (provisional / pending sign-off). A version that has only been reopened is never official while
 * the series has nothing newer - it is still shown, flagged, rather than nothing at all.
 */
export function pickOfficial(runs: ProcessRun[]): OfficialRun | null {
  const series = buildSeries(runs).filter((s) => s.latest);
  const head = series[0];
  if (!head || !head.latest) return null;
  const run = officialVersionOf(head)!;
  const status = signOffStatusOf(run);
  return {
    run,
    kind: status === 'SignedOff' ? 'SignedOff' : status === 'PendingSignOff' ? 'PendingSignOff' : 'Provisional',
  };
}

/** The version of one series that stands for it: signed off, else the latest not-reopened, else the latest. */
export function officialVersionOf(series: RunSeries): ProcessRun | null {
  return series.signedOff ?? series.versions.find((v) => signOffStatusOf(v) !== 'Reopened') ?? series.latest;
}

/**
 * A report or return built from `run` is superseded once a newer version of the same series exists,
 * or the version itself was reopened. Computed from the runs list - nothing is written to the pack.
 */
export function supersededNote(runId: string | null | undefined, runs: ProcessRun[]): string | null {
  if (!runId) return null;
  const run = runs.find((r) => r.id === runId);
  if (!run) return null;
  const v = versionOf(run, runs);
  const key = seriesKeyOf(run);
  const newer = runs.some(
    (r) => r.id !== run.id && r.status === 'Completed' && seriesKeyOf(r) === key && versionOf(r, runs) > v,
  );
  if (newer || run.supersededByRunId) return `Superseded - based on v${v}; a newer version of this run exists`;
  if (signOffStatusOf(run) === 'Reopened') return `Superseded - based on v${v}, which has been reopened`;
  return null;
}

/** "Ecobank Nigeria · 31 Jul 2026 · v2" style label. */
export function runVersionLabel(run: ProcessRun, allRuns: ProcessRun[], affiliateName?: string): string {
  return `${affiliateName ?? run.affiliateCode} · ${formatDate(run.asOfDate)} · v${versionOf(run, allRuns)}`;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
}

function without<T extends object>(obj: T | undefined, keys: string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(obj ?? {}) };
  for (const k of keys) delete copy[k];
  return copy;
}

const REOPEN_FIELDS = ['status', 'reopenedAt', 'reopenedById', 'reopenedBy', 'reopenReason'];

/**
 * Why saving `next` over `previous` must be refused - the same rules the Supabase guard trigger
 * (20261021000000_run_management.sql) enforces, mirrored for the local repository. Only the approval
 * path may sign a run off or decide a pending request (it bypasses this check); a signed-off or reopened
 * version is frozen except for reopening (SignedOff -> Reopened with a reason) and recording its successor.
 */
export function runUpdateRefusal(previous: ProcessRun | null | undefined, next: ProcessRun): string | null {
  const before = previous ? signOffStatusOf(previous) : 'Open';
  const after = signOffStatusOf(next);
  if (!previous) {
    return after === 'SignedOff' || after === 'Reopened'
      ? 'A run can only be signed off through an approved sign-off request.'
      : null;
  }
  if (after === 'SignedOff' && before !== 'SignedOff') {
    return 'A run can only be signed off through an approved sign-off request.';
  }
  if (before === 'PendingSignOff' && after !== 'PendingSignOff') {
    return 'This version is awaiting sign-off - the request must be approved, rejected or withdrawn in Approvals.';
  }
  if (after === 'Reopened' && before !== 'Reopened' && before !== 'SignedOff') {
    return 'Only a signed-off version can be reopened.';
  }
  if (before !== 'SignedOff' && before !== 'Reopened') return null;

  const frozenMsg = `v${previous.version ?? 1} is ${before === 'SignedOff' ? 'signed off' : 'reopened'} and frozen - it cannot be changed.`;
  if (
    stable(without(previous, ['signOff', 'supersededByRunId'])) !==
    stable(without(next, ['signOff', 'supersededByRunId']))
  ) {
    return frozenMsg;
  }
  if ((previous.supersededByRunId ?? null) !== (next.supersededByRunId ?? null) && previous.supersededByRunId) {
    return frozenMsg;
  }
  if (stable(previous.signOff) === stable(next.signOff)) return null;
  if (before === 'SignedOff' && after === 'Reopened') {
    if (!next.signOff?.reopenReason?.trim()) return 'Reopening a signed-off run needs a reason.';
    if (stable(without(previous.signOff, REOPEN_FIELDS)) !== stable(without(next.signOff, REOPEN_FIELDS)))
      return frozenMsg;
    return null;
  }
  return frozenMsg;
}
