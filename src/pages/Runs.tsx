import { useMemo, useState, type ReactNode } from 'react';
import { DegradationNotice } from '@/components/results/DegradationNotice';
import { Link, useLocation, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable } from '@/components/ui/ResultTable';
import { Amount } from '@/components/ui/Amount';
import { Drawer } from '@/components/ui/Drawer';
import { LineagePanel } from '@/components/results/ResultsFrame';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import {
  rerunOf,
  runHeadlines,
  useExecuteRun,
  useReopenRun,
  useRequestRunSignOff,
  useRunResults,
  useRuns,
} from '@/lib/runHooks';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { approvals, regulatoryReturns, reportPacks } from '@/lib/governanceHooks';
import { isRunStale, isRunUnreconciled } from '@/lib/runStaleness';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import {
  buildSeries,
  isFrozen,
  officialVersionOf,
  seriesKeyOf,
  seriesLockReason,
  SIGN_OFF_LABEL,
  SIGN_OFF_TONE,
  signOffStatusOf,
  supersededNote,
  versionOf,
  type RunSeries,
} from '@/lib/runSeries';
import { formatDate, formatPct } from '@/lib/format';
import type { ProcessRun } from '@/engine/types';

type PanelTab = 'overview' | 'data' | 'assumptions' | 'approvals' | 'reports';

const PANEL_TABS: Array<{ key: PanelTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'data', label: 'Data used' },
  { key: 'assumptions', label: 'Assumptions used' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'reports', label: 'Reports' },
];

const STAMP = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '-');

function formatComparisonValue(v: number | null, unit: 'percent' | 'amount' | 'days', currency: string) {
  if (v === null) return <span className="text-gray-300">-</span>;
  if (unit === 'percent') return formatPct(v, 2);
  if (unit === 'days') return `${v} days`;
  return <Amount value={v} currency={currency} />;
}

/**
 * Runs - every run series (one scope at one as-of date) with its versions and sign-off state. A
 * series' versions are created by Run now / Re-run; a version is signed off through Approvals and
 * can be reopened (with a reason) to allow the next version. Signed-off and reopened versions are frozen.
 */
export function Runs() {
  const { hasPermission, user } = useAuth();
  const canRun = hasPermission('run.execute');
  const { affiliateCode } = useScope();
  const { data: runs = [], isLoading } = useRuns(affiliateCode);
  const { data: batches = [] } = useBatches();
  const { data: affiliates = [] } = useAffiliates();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const panelRunId = params.get('run');
  const panelTab = (params.get('tab') as PanelTab | null) ?? 'overview';

  const series = useMemo(() => buildSeries(runs), [runs]);
  const affiliateName = (code: string) =>
    code === 'GROUP' ? 'Ecobank Group' : (affiliates.find((a) => a.code === code)?.name ?? code);

  const openPanel = (runId: string, tab: PanelTab = 'overview') =>
    navigate(`/execution/history?run=${encodeURIComponent(runId)}&tab=${tab}`);
  const closePanel = () => navigate('/execution/history');

  const panelRun = panelRunId ? (runs.find((r) => r.id === panelRunId) ?? null) : null;
  const panelSeries = panelRun ? (series.find((s) => s.key === seriesKeyOf(panelRun)) ?? null) : null;

  const latestOf = series.map((s) => s.latest).filter((r): r is ProcessRun => !!r);
  const signedOffCount = series.filter((s) => s.signedOff).length;
  const pendingCount = latestOf.filter((r) => signOffStatusOf(r) === 'PendingSignOff').length;
  const staleCount = latestOf.filter((r) => isRunStale(r, batches)).length;

  return (
    <>
      <ModuleHeader
        title="Runs"
        description="Every run, grouped by scope and as-of date."
        about="Each execution is a new version; a version becomes the official figures once a second person signs it off."
        asOfDate={null}
        scope={affiliateCode === 'GROUP' ? 'All scopes' : affiliateName(affiliateCode)}
        metrics={[
          {
            label: 'Run series',
            value: String(series.length),
            about: 'One series per scope and as-of date. Re-running a date adds a version to its series.',
          },
          {
            label: 'Signed off',
            value: String(signedOffCount),
            tone: 'success',
            about: 'Series with a signed-off version - those figures are the official ones every screen reads.',
          },
          {
            label: 'Awaiting sign-off',
            value: String(pendingCount),
            tone: pendingCount > 0 ? 'warning' : 'neutral',
            about: 'Latest versions with a sign-off request sitting in Approvals.',
          },
          {
            label: 'Data changed since',
            value: String(staleCount),
            tone: staleCount > 0 ? 'warning' : 'neutral',
            about:
              'Latest versions whose pinned data has since been superseded by a newer load - re-run to reflect it.',
          },
        ]}
        actions={
          canRun ? (
            <Link
              href="/execution"
              className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
            >
              Run now
            </Link>
          ) : undefined
        }
      />

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[13px] font-bold uppercase tracking-widest text-navy-900">Runs</h2>
        <div data-tour="table" className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <th className="px-2 py-2 font-bold">As at</th>
                <th className="px-2 py-2 font-bold">Scope</th>
                <th className="px-2 py-2 font-bold">Latest version</th>
                <th className="px-2 py-2 font-bold">Status</th>
                <th className="px-2 py-2 font-bold">Signed off</th>
                <th className="px-2 py-2 font-bold">Data changed since</th>
                <th className="px-2 py-2 font-bold" />
              </tr>
            </thead>
            <tbody>
              {series.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400">
                    {isLoading ? 'Loading…' : 'No runs yet. Execute one from Run now.'}
                  </td>
                </tr>
              )}
              {series.map((s) => {
                const latest = s.latest;
                const head = latest ?? s.failed[0]!;
                const status = latest ? signOffStatusOf(latest) : null;
                return (
                  <tr
                    key={s.key}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    onClick={() => openPanel(head.id)}
                  >
                    <td className="px-2 py-2 font-mono text-[12px]">{formatDate(s.asOfDate)}</td>
                    <td className="px-2 py-2">{affiliateName(s.affiliateCode)}</td>
                    <td className="px-2 py-2">
                      {latest ? (
                        <span className="font-mono font-bold text-navy-900">
                          v{versionOf(latest, runs)}
                          <span className="ml-1 font-sans text-[11px] font-normal text-gray-400">
                            of {s.versions.length}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">no completed version</span>
                      )}
                      {s.failed.length > 0 && (
                        <span className="ml-2 text-[11px] text-danger">{s.failed.length} failed</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {status ? (
                        <StatusBadge status={SIGN_OFF_LABEL[status]} tone={SIGN_OFF_TONE[status]} />
                      ) : (
                        <StatusBadge status="Failed" tone="danger" />
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12px] text-gray-600">
                      {s.signedOff ? (
                        <>
                          v{versionOf(s.signedOff, runs)} · {s.signedOff.signOff?.signedOffBy ?? '-'}
                          <span className="block text-[11px] text-gray-400">
                            {STAMP(s.signedOff.signOff?.signedOffAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {latest && isRunStale(latest, batches) ? (
                        <StatusBadge status="Data changed" tone="warning" />
                      ) : latest ? (
                        <StatusBadge status="Current" tone="success" />
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        data-tour="row-view"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPanel(head.id);
                        }}
                        className="rounded border border-gray-200 px-3 py-1 text-[12px] font-bold text-navy-900 hover:border-navy-700"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {panelRun && panelSeries && (
        <RunPanel
          run={panelRun}
          series={panelSeries}
          allRuns={runs}
          tab={panelTab}
          affiliateName={affiliateName(panelRun.affiliateCode)}
          canRun={canRun}
          canWriteScope={
            !isRestrictedToOwnAffiliate(user, hasPermission) || user?.affiliateCode === panelRun.affiliateCode
          }
          onTab={(t) => openPanel(panelRun.id, t)}
          onSelectVersion={(id) => openPanel(id, panelTab)}
          onClose={closePanel}
        />
      )}
    </>
  );
}

function RunPanel({
  run,
  series,
  allRuns,
  tab,
  affiliateName,
  canRun,
  canWriteScope,
  onTab,
  onSelectVersion,
  onClose,
}: {
  run: ProcessRun;
  series: RunSeries;
  allRuns: ProcessRun[];
  tab: PanelTab;
  affiliateName: string;
  canRun: boolean;
  canWriteScope: boolean;
  onTab: (t: PanelTab) => void;
  onSelectVersion: (runId: string) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { setRun } = useScope();
  const [, navigate] = useLocation();
  const { data: batches = [] } = useBatches();
  const execute = useExecuteRun();
  const requestSignOff = useRequestRunSignOff();
  const reopen = useReopenRun();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [compareId, setCompareId] = useState<string>('');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const completed = run.status === 'Completed';
  const status = signOffStatusOf(run);
  const v = completed ? versionOf(run, allRuns) : null;
  const isLatest = series.latest?.id === run.id;
  const lock = seriesLockReason(series, allRuns);
  const official = officialVersionOf(series);
  const scopeOk = canRun && canWriteScope;

  const fail = (e: unknown) => setMessage({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });

  const doRerun = async () => {
    setMessage(null);
    try {
      const outcome = await execute.mutateAsync(rerunOf(run, user?.name ?? 'unknown'));
      if (outcome.run.status === 'Completed') {
        setMessage({ tone: 'success', text: `v${outcome.run.version} created - provisional until signed off.` });
        onSelectVersion(outcome.run.id);
      } else {
        fail(outcome.run.errorLog[0]?.message ?? 'Run failed.');
      }
    } catch (e) {
      fail(e);
    }
  };

  const doRequest = async () => {
    setMessage(null);
    try {
      await requestSignOff.mutateAsync({ run, allRuns, affiliateName });
      setMessage({ tone: 'success', text: `Sign-off requested for v${v}. A different user approves it in Approvals.` });
    } catch (e) {
      fail(e);
    }
  };

  const doReopen = async () => {
    setMessage(null);
    try {
      await reopen.mutateAsync({ run, reason, allRuns });
      setReopenOpen(false);
      setReason('');
      setMessage({ tone: 'success', text: `v${v} reopened. Re-run to create v${(v ?? 0) + 1}.` });
    } catch (e) {
      fail(e);
    }
  };

  const busy = execute.isPending || requestSignOff.isPending || reopen.isPending;

  return (
    <Drawer
      wide
      title={
        <span className="flex items-center gap-2">
          {affiliateName} · {formatDate(run.asOfDate)}
          {v !== null && <span className="font-mono">· v{v}</span>}
          {completed ? (
            <StatusBadge status={SIGN_OFF_LABEL[status]} tone={SIGN_OFF_TONE[status]} />
          ) : (
            <StatusBadge status={run.status} tone="danger" />
          )}
        </span>
      }
      description={run.name}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void doRerun()}
            disabled={!scopeOk || !!lock || busy}
            title={
              !canRun
                ? 'Your role cannot execute runs'
                : (lock ?? 'Execute again against current data as the next version')
            }
            className="rounded bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            {execute.isPending ? 'Running…' : 'Re-run (new version)'}
          </button>
          {completed && status === 'Open' && (
            <button
              type="button"
              onClick={() => void doRequest()}
              disabled={!scopeOk || !isLatest || busy}
              title={!isLatest ? 'Only the latest version of a series can be signed off' : undefined}
              className="rounded border border-success px-3 py-1.5 text-[12px] font-bold text-success hover:bg-success-bg disabled:opacity-40"
            >
              Request sign-off
            </button>
          )}
          {completed && status === 'SignedOff' && (
            <button
              type="button"
              onClick={() => setReopenOpen(true)}
              disabled={!scopeOk || busy}
              title={!scopeOk ? 'Reopening needs run.execute for this scope' : undefined}
              className="rounded border border-warning px-3 py-1.5 text-[12px] font-bold text-warning hover:bg-warning-bg disabled:opacity-40"
            >
              Reopen
            </button>
          )}
          {completed && (
            <button
              type="button"
              onClick={() => {
                setRun(run);
                navigate('/dashboard');
              }}
              className="rounded border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              View as current
            </button>
          )}
        </div>
      }
    >
      {message && (
        <p
          role="status"
          className={cn(
            'mb-4 rounded-lg px-3 py-2 text-[12px]',
            message.tone === 'success' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
          )}
        >
          {message.text}
        </p>
      )}

      {reopenOpen && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <label htmlFor="reopen-reason" className="mb-1 block text-[12px] font-bold text-navy-900">
            Why reopen v{v}?
          </label>
          <p className="mb-2 text-[11px] text-gray-500">
            v{v} stays frozen as it was signed off, but stops being the official figures. The next run for{' '}
            {formatDate(run.asOfDate)} becomes v{(v ?? 0) + 1}. Recorded in the audit log.
          </p>
          <textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none"
            placeholder="e.g. Late GL adjustment to Treasury balances"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReopenOpen(false)}
              className="rounded border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void doReopen()}
              disabled={!reason.trim() || busy}
              className="rounded bg-warning px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
            >
              Reopen v{v}
            </button>
          </div>
        </div>
      )}

      {series.versions.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Version</span>
          {series.versions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelectVersion(r.id)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[12px] font-bold',
                r.id === run.id
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-gray-200 text-navy-900 hover:border-navy-700',
              )}
            >
              v{versionOf(r, allRuns)}
              {r.id === official?.id && ' ★'}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-gray-100">
        {PANEL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[12px] font-bold',
              tab === t.key ? 'border-navy-900 text-navy-900' : 'border-transparent text-gray-400 hover:text-navy-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          run={run}
          series={series}
          allRuns={allRuns}
          stale={isRunStale(run, batches)}
          unreconciled={isRunUnreconciled(run, batches)}
          lock={isLatest ? lock : null}
          compareId={compareId}
          onCompare={setCompareId}
        />
      )}
      {tab === 'data' && (
        <LineagePanel run={run} batches={batches.filter((b) => run.positionBatchIds.includes(b.id))} />
      )}
      {tab === 'assumptions' && <AssumptionsTab run={run} />}
      {tab === 'approvals' && <ApprovalsTab series={series} allRuns={allRuns} />}
      {tab === 'reports' && <ReportsTab series={series} allRuns={allRuns} />}
    </Drawer>
  );
}

function OverviewTab({
  run,
  series,
  allRuns,
  stale,
  unreconciled,
  lock,
  compareId,
  onCompare,
}: {
  run: ProcessRun;
  series: RunSeries;
  allRuns: ProcessRun[];
  stale: boolean;
  unreconciled: boolean;
  lock: string | null;
  compareId: string;
  onCompare: (id: string) => void;
}) {
  const status = signOffStatusOf(run);
  const { data: results = [] } = useRunResults(run.status === 'Completed' ? run.id : null);
  const { data: otherResults = [] } = useRunResults(compareId || null);
  const other = allRuns.find((r) => r.id === compareId) ?? null;
  const headlines = runHeadlines(results);
  const otherHeadlines = other ? runHeadlines(otherResults) : null;
  const comparable = allRuns.filter((r) => r.status === 'Completed' && r.id !== run.id);

  return (
    <div className="space-y-4 text-[12px]">
      {lock && <p className="rounded bg-navy-50 px-3 py-2 text-navy-900">{lock}</p>}
      {isFrozen(run) && (
        <p className="rounded bg-gray-50 px-3 py-2 text-gray-600">
          This version is {status === 'SignedOff' ? 'signed off' : 'reopened'} and frozen - its figures and results can
          no longer change.
        </p>
      )}
      {run.status === 'Completed' && <DegradationNotice run={run} className="" />}
      {run.status === 'Failed' && (
        <div className="rounded bg-danger-bg px-3 py-2 text-danger">
          <span className="font-bold">This execution failed and never became a version.</span>
          <ul className="mt-1 space-y-0.5">
            {run.errorLog.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.code}</span> - {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stale && (
        <p className="rounded bg-warning-bg px-3 py-2 text-warning">
          Data changed since: a batch this version pinned has been superseded by a newer load. Re-run to reflect it.
        </p>
      )}
      {unreconciled && (
        <p className="rounded bg-warning-bg px-3 py-2 text-warning">
          Some Positions data this version consumed was never reconciled to a GL trial balance.{' '}
          <Link href="/data/operations?domain=GeneralLedger" className="font-bold underline">
            Reconcile it
          </Link>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Detail label="Run ID" value={run.id} mono />
        <Detail label="Executed by" value={run.createdBy} />
        <Detail label="Executed at" value={STAMP(run.createdAt)} />
        <Detail label="Reporting currency" value={run.reportingCurrency} mono />
        <Detail label="Process type" value={run.processType} />
        <Detail label="Elements" value={String(run.elements.length)} mono />
      </dl>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Version timeline</h3>
        <ol className="space-y-2 border-l border-gray-200 pl-4">
          {series.versions.map((r) => (
            <VersionEvents key={r.id} run={r} allRuns={allRuns} current={r.id === run.id} />
          ))}
          {series.failed.map((r) => (
            <li key={r.id} className="text-gray-500">
              <span className="font-bold text-danger">Failed attempt</span> · {STAMP(r.createdAt)} by {r.createdBy} -{' '}
              {r.errorLog[0]?.message ?? 'no detail'}
            </li>
          ))}
        </ol>
      </div>

      {run.status === 'Completed' && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Key figures</h3>
            <label className="flex items-center gap-2 text-[12px] text-gray-500">
              Compare with
              <select
                value={compareId}
                onChange={(e) => onCompare(e.target.value)}
                className="rounded border border-gray-200 px-2 py-1 text-[12px]"
              >
                <option value="">-</option>
                {comparable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.affiliateCode} · {formatDate(r.asOfDate)} · v{versionOf(r, allRuns)} ·{' '}
                    {SIGN_OFF_LABEL[signOffStatusOf(r)]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ResultTable
            rows={headlines.map((m, i) => {
              const o = otherHeadlines?.[i]?.value ?? null;
              return { ...m, other: o, delta: o !== null && m.value !== null ? m.value - o : null };
            })}
            rowKey={(m) => m.label}
            columns={[
              {
                key: 'metric',
                header: 'Metric',
                render: (m) => <span className="font-medium text-navy-900">{m.label}</span>,
              },
              {
                key: 'this',
                header: `This (v${versionOf(run, allRuns)})`,
                align: 'right',
                render: (m) => (
                  <span className="font-mono">{formatComparisonValue(m.value, m.unit, run.reportingCurrency)}</span>
                ),
              },
              ...(other
                ? [
                    {
                      key: 'other',
                      header: `v${versionOf(other, allRuns)}${other.asOfDate !== run.asOfDate ? ` (${formatDate(other.asOfDate)})` : ''}`,
                      align: 'right' as const,
                      render: (m: { other: number | null; unit: 'percent' | 'amount' | 'days' }) => (
                        <span className="font-mono">
                          {formatComparisonValue(m.other, m.unit, other.reportingCurrency)}
                        </span>
                      ),
                    },
                    {
                      key: 'change',
                      header: 'Change',
                      align: 'right' as const,
                      render: (m: {
                        delta: number | null;
                        higherIsBetter: boolean;
                        unit: 'percent' | 'amount' | 'days';
                      }) => {
                        const improving = m.delta === null ? null : m.higherIsBetter ? m.delta > 0 : m.delta < 0;
                        return (
                          <span
                            className={cn(
                              'font-mono',
                              m.delta === null ? 'text-gray-300' : improving ? 'text-success' : 'text-danger',
                            )}
                          >
                            {m.delta === null
                              ? '-'
                              : `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}${m.unit === 'percent' ? 'pp' : ''}`}
                          </span>
                        );
                      },
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}
    </div>
  );
}

function VersionEvents({ run, allRuns, current }: { run: ProcessRun; allRuns: ProcessRun[]; current: boolean }) {
  const so = run.signOff;
  const events: Array<{ at: string; text: ReactNode }> = [
    { at: run.createdAt, text: <>Executed by {run.createdBy}</> },
  ];
  if (so?.requestedAt) events.push({ at: so.requestedAt, text: <>Sign-off requested by {so.requestedBy ?? '-'}</> });
  if (so?.rejectedAt) {
    events.push({
      at: so.rejectedAt,
      text: (
        <>
          Sign-off not granted by {so.rejectedBy ?? '-'}
          {so.rejectReason ? ` - ${so.rejectReason}` : ''}
        </>
      ),
    });
  }
  if (so?.signedOffAt) events.push({ at: so.signedOffAt, text: <>Signed off by {so.signedOffBy ?? '-'}</> });
  if (so?.reopenedAt) {
    events.push({
      at: so.reopenedAt,
      text: (
        <>
          Reopened by {so.reopenedBy ?? '-'} - <span className="italic">{so.reopenReason}</span>
        </>
      ),
    });
  }
  events.sort((a, b) => a.at.localeCompare(b.at));
  const status = signOffStatusOf(run);
  return (
    <li className={cn('relative', current && 'font-medium')}>
      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-navy-700" aria-hidden="true" />
      <p className="text-navy-900">
        <span className="font-mono font-bold">v{versionOf(run, allRuns)}</span>{' '}
        <StatusBadge status={SIGN_OFF_LABEL[status]} tone={SIGN_OFF_TONE[status]} />
        {current && <span className="ml-1 text-[11px] text-gray-400">(viewing)</span>}
      </p>
      <ul className="mt-0.5 space-y-0.5 text-gray-500">
        {events.map((e, i) => (
          <li key={i}>
            <span className="font-mono text-[11px]">{STAMP(e.at)}</span> · {e.text}
          </li>
        ))}
      </ul>
    </li>
  );
}

function AssumptionsTab({ run }: { run: ProcessRun }) {
  const rows: Array<[string, string | null | undefined, string]> = [
    ['Time buckets', run.timeBucketRuleId || null, 'engine default'],
    ['Product characteristics', run.productCharacteristicRuleId, 'as loaded'],
    ['Behaviour patterns', run.behaviourPatternRuleId, 'engine default'],
    ['Prepayment', run.prepaymentRuleId, 'none (contractual)'],
    ['New business', run.newBusinessRuleId, 'none (static)'],
    ['Transaction strategy', run.transactionStrategyId, 'none'],
    ['FTP rule', run.ftpRuleId, 'none'],
    ['FTP adjustments', run.adjustmentRuleId, 'none'],
    ['Cost allocation', run.costAllocationRuleId, 'none'],
    ['Credit loss', run.creditLossRuleId, 'none'],
    ['Capital', run.capitalRuleId, 'none'],
  ];
  return (
    <div className="space-y-3 text-[12px]">
      <p className="text-gray-500">
        The rule versions this run actually consumed - recorded at execution, so a later edit to a rule never changes
        what this version computed.
      </p>
      <table className="w-full">
        <tbody>
          {rows.map(([label, id, fallback]) => (
            <tr key={label} className="border-b border-gray-100">
              <td className="py-1.5 pr-3 text-gray-500">{label}</td>
              <td className="py-1.5 font-mono text-navy-900">
                {id ? (
                  <>
                    {id}
                    {run.ruleVersionsUsed?.[id] !== undefined && (
                      <span className="ml-1 rounded bg-navy-50 px-1.5 text-[11px]">v{run.ruleVersionsUsed[id]}</span>
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">{fallback}</span>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-b border-gray-100">
            <td className="py-1.5 pr-3 text-gray-500">Rate scenarios</td>
            <td className="py-1.5 font-mono text-navy-900">
              {run.forecastScenarioIds.length === 0 ? (
                <span className="text-gray-400">base case only</span>
              ) : (
                run.forecastScenarioIds
                  .map(
                    (id) => `${id}${run.ruleVersionsUsed?.[id] !== undefined ? ` v${run.ruleVersionsUsed[id]}` : ''}`,
                  )
                  .join(', ')
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ApprovalsTab({ series, allRuns }: { series: RunSeries; allRuns: ProcessRun[] }) {
  const { data: requests = [] } = approvals.useList();
  const ids = new Set(series.versions.map((r) => r.id));
  const rows = requests
    .filter((r) => r.module === 'Runs' && ids.has(r.entityId))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  if (rows.length === 0) {
    return <p className="text-[12px] text-gray-500">No sign-off has been requested for any version of this run yet.</p>;
  }
  return (
    <ul className="space-y-2 text-[12px]">
      {rows.map((r) => {
        const run = allRuns.find((x) => x.id === r.entityId);
        return (
          <li key={r.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-navy-900">
                v{run ? versionOf(run, allRuns) : (r.entityVersion ?? '?')} sign-off
              </span>
              <StatusBadge
                status={r.status}
                tone={
                  r.status === 'Approved'
                    ? 'success'
                    : r.status === 'Pending'
                      ? 'warning'
                      : r.status === 'Rejected'
                        ? 'danger'
                        : 'neutral'
                }
              />
            </div>
            <p className="mt-1 text-gray-500">
              Requested by {r.requestedBy} · {STAMP(r.requestedAt)}
              {r.decidedBy && (
                <>
                  {' '}
                  · decided by {r.decidedBy} · {STAMP(r.decidedAt)}
                </>
              )}
            </p>
            {r.decisionNote && <p className="mt-1 italic text-gray-600">{r.decisionNote}</p>}
          </li>
        );
      })}
      <li>
        <Link href="/controls" className="text-[12px] font-bold text-navy-700 hover:underline">
          Open Approvals →
        </Link>
      </li>
    </ul>
  );
}

function ReportsTab({ series, allRuns }: { series: RunSeries; allRuns: ProcessRun[] }) {
  const { data: packs = [] } = reportPacks.useList();
  const { data: returns = [] } = regulatoryReturns.useList();
  const ids = new Set(series.versions.map((r) => r.id));
  const items = [
    ...packs
      .filter((p) => p.runId && ids.has(p.runId))
      .map((p) => ({
        id: p.id,
        kind: `${p.kind} pack`,
        name: p.name,
        status: p.status,
        runId: p.runId!,
        href: '/reporting',
      })),
    ...returns
      .filter((r) => r.runId && ids.has(r.runId))
      .map((r) => ({
        id: r.id,
        kind: `${r.regulator} return`,
        name: r.name,
        status: r.status,
        runId: r.runId!,
        href: '/reporting/regulatory',
      })),
  ];
  if (items.length === 0) {
    return (
      <p className="text-[12px] text-gray-500">No report pack or regulatory return has been built from this run yet.</p>
    );
  }
  return (
    <ul className="space-y-2 text-[12px]">
      {items.map((it) => {
        const run = allRuns.find((r) => r.id === it.runId);
        const note = supersededNote(it.runId, allRuns);
        return (
          <li key={it.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={it.href} className="font-bold text-navy-900 hover:underline">
                {it.name}
              </Link>
              <StatusBadge status={it.status} tone="neutral" />
            </div>
            <p className="mt-1 text-gray-500">
              {it.kind} · built from v{run ? versionOf(run, allRuns) : '?'}
            </p>
            {note && <p className="mt-1 font-bold text-warning">⚠ {note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-gray-700' : 'text-gray-700'}>{value}</dd>
    </div>
  );
}
