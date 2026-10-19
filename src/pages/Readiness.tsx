// Readiness (Run & results → Run → Readiness, /execution/readiness): "are we ready to run, and if not, what
// is missing and who can fix it?" - for the scope chosen in the header (teardown §7, §13).
//
// Group scope: market-data status (Group-wide) and one row per affiliate - Data / From Group / Rules /
// verdict / latest run version & sign-off - every cell linking to the screen that fixes it, the affiliate
// name switching the scope to it. Affiliate scope: the full checklist (data per contributor, ledger,
// reconciliation, market data from Group, assumptions & rules, governance) with who can fix each open item,
// the verdict, the latest run and the next actions. Everything is derived (lib/readiness.ts) - nothing is
// ticked by hand, so it moves the moment an upload, approval or market-data load lands.
import { useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ReadinessChecklist, VerdictBadge } from '@/components/readiness/ReadinessChecklist';
import { WhoCanFix } from '@/components/readiness/WhoCanFix';
import { DegradationNotice } from '@/components/results/DegradationNotice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useWorkingContext } from '@/context/ScopeContext';
import { useEconomicIndicators, useFxRates, useYieldCurves } from '@/lib/hooks';
import {
  marketDataStatus,
  type Readiness as ReadinessModel,
  type ReadinessCategory,
  type ReadinessItem,
} from '@/lib/readiness';
import { useGroupReadiness, useMarketDataSlaDays, useReadiness } from '@/lib/readinessHooks';
import { useCanFix } from '@/lib/whoCanFix';
import { runHeadlines, useRunResults, useRuns } from '@/lib/runHooks';
import {
  buildSeries,
  officialVersionOf,
  SIGN_OFF_LABEL,
  SIGN_OFF_TONE,
  signOffStatusOf,
  versionOf,
} from '@/lib/runSeries';
import { formatDate, formatPct } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ProcessRun } from '@/engine/types';

const today = () => new Date().toISOString().slice(0, 10);

/** The run that stands for a scope: its latest date's official version (signed off, else the latest). */
function latestRunFor(runs: ProcessRun[], code: string, date?: string | null): ProcessRun | null {
  const series = buildSeries(runs.filter((r) => r.affiliateCode === code)).filter(
    (s) => s.latest && (!date || s.asOfDate === date),
  );
  const head = series[0];
  return head ? officialVersionOf(head) : null;
}

export function Readiness() {
  const { isGroup } = useWorkingContext();
  return isGroup ? <GroupReadiness /> : <AffiliateReadiness />;
}

// ─── Group scope ─────────────────────────────────────────────────────────────

/** One matrix cell: ✓ when every item in the category is done, else the open items, linking to the first fix. */
function CategoryCell({
  readiness,
  category,
  onOpen,
}: {
  readiness: ReadinessModel;
  category: ReadinessCategory;
  onOpen: (href: string) => void;
}) {
  const items = readiness.items.filter((i) => i.category === category);
  const open = items.filter((i) => i.status !== 'ok' && i.status !== 'default');
  if (items.length === 0) return <span className="text-gray-300">-</span>;
  if (open.length === 0) return <span className="font-bold text-success">✓ All</span>;
  const blocking = open.some((i) => i.blocking);
  const first = open[0]!;
  return (
    <button
      type="button"
      onClick={() => onOpen(first.fixHref)}
      title={open.map((i) => `${i.label}: ${i.detail}`).join('\n')}
      className={cn('text-left font-bold hover:underline', blocking ? 'text-danger' : 'text-warning')}
    >
      {blocking ? '✗' : '!'} {open.map((i) => shortLabel(i)).join(', ')}
    </button>
  );
}

function shortLabel(i: ReadinessItem): string {
  return i.label
    .replace(' positions', '')
    .replace('General ledger uploaded', 'GL')
    .replace('Positions reconciled to the ledger', 'Reconciliation')
    .replace('FX rates for every currency in use', 'FX')
    .replace('Yield curves for functional currencies', 'Curves')
    .replace('Market data within its freshness limit', 'Stale')
    .replace('Transfer pricing (FTP) rule', 'FTP')
    .replace('Combined book balances', 'Book balance');
}

function MarketDataCard({ refDate }: { refDate: string }) {
  const { data: fxRates = [] } = useFxRates();
  const { data: curves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();
  const slaDays = useMarketDataSlaDays();
  const status = useMemo(
    () => marketDataStatus(fxRates, curves, indicators, slaDays, refDate),
    [fxRates, curves, indicators, slaDays, refDate],
  );
  const canUpload = useCanFix()('data.upload', 'Group', 'GROUP');
  const fixItem = {
    fixPermission: 'data.upload',
    fixHref: '/data/market',
    fixLabel: 'Upload market data',
    scope: 'Group' as const,
  };

  return (
    <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Market data (Group-wide)</h2>
        {canUpload && (
          <Link
            href="/data/market"
            className="rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700"
          >
            Upload market data
          </Link>
        )}
      </div>
      <ul className="divide-y divide-gray-50">
        {status.map((s) => {
          const missing = s.count === 0;
          return (
            <li key={s.kind} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-[13px]">
              <span className="w-28 font-bold text-navy-900">{s.kind}</span>
              <span className={cn('font-bold', missing ? 'text-danger' : s.stale ? 'text-warning' : 'text-success')}>
                {missing ? '✗ None loaded' : s.stale ? `! ${s.ageDays} days old (limit ${slaDays})` : '✓'}
              </span>
              <span className="text-gray-600">{s.coverage}</span>
              <span className="text-[12px] text-gray-500">
                {s.lastDate ? `Latest ${formatDate(s.lastDate)}` : ''}
                {s.lastUpdatedBy ? ` · loaded by ${s.lastUpdatedBy}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      {!canUpload && <WhoCanFix item={fixItem} affiliateCode={null} hideAction className="mt-2" />}
    </section>
  );
}

function GroupReadiness() {
  const { asOfDate, asOfDateChosen, setAffiliateCode } = useWorkingContext();
  const [, navigate] = useLocation();
  // A date picked in the header judges every affiliate for it; otherwise each at its own latest date.
  const { rows, isLoading } = useGroupReadiness(asOfDateChosen ? asOfDate : null);
  const { data: runs = [] } = useRuns();

  const openFor = (code: string) => (href: string) => {
    setAffiliateCode(code);
    navigate(href);
  };
  const counts = {
    ready: rows.filter((r) => r.readiness.verdict === 'Ready').length,
    warnings: rows.filter((r) => r.readiness.verdict === 'Ready with warnings').length,
    blocked: rows.filter((r) => r.readiness.verdict === 'Blocked').length,
  };

  return (
    <>
      <ModuleHeader
        title="Readiness"
        description="Across the Group: is market data in, and which affiliates are ready to run."
        about="Computed from live data - uploads, approvals, market data, affiliate status and runs. Click a cell to open the screen that fixes it; click an affiliate to switch to it."
        asOfDate={asOfDateChosen ? asOfDate : null}
        scope="Group"
        metrics={[
          { label: 'Ready', value: String(counts.ready), tone: counts.ready > 0 ? 'success' : 'neutral' },
          { label: 'With warnings', value: String(counts.warnings), tone: counts.warnings > 0 ? 'warning' : 'neutral' },
          { label: 'Blocked', value: String(counts.blocked), tone: counts.blocked > 0 ? 'danger' : 'neutral' },
        ]}
      />

      <MarketDataCard refDate={(asOfDateChosen ? asOfDate : null) ?? today()} />

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Affiliates</h2>
        {isLoading ? (
          <p className="text-[13px] text-gray-400">Checking…</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-gray-500">
            No affiliates yet. Add one in Admin → Organisation setup → Affiliates.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-4">Affiliate</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">From Group</th>
                  <th className="py-2 pr-4">Rules</th>
                  <th className="py-2 pr-4">Verdict</th>
                  <th className="py-2">Latest run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row) => {
                  const run = latestRunFor(runs, row.affiliateCode);
                  const status = run ? signOffStatusOf(run) : null;
                  const open = openFor(row.affiliateCode);
                  return (
                    <tr key={row.affiliateCode} className="align-top">
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => setAffiliateCode(row.affiliateCode)}
                          title={`Switch to ${row.affiliateName}`}
                          className="font-bold text-navy-900 hover:underline"
                        >
                          {row.affiliateName}
                        </button>
                        {row.status !== 'Live' && (
                          <span className="ml-2 text-[11px] font-bold uppercase text-gray-400">{row.status}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-500">
                        {row.readiness.asOfDate ? formatDate(row.readiness.asOfDate) : '-'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <CategoryCell readiness={row.readiness} category="Data" onOpen={open} />
                        {row.readiness.items.some((i) => i.category === 'Setup' && i.status !== 'ok') && (
                          <span className="block text-[11px] text-danger">Not Live</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <CategoryCell readiness={row.readiness} category="From Group" onOpen={open} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <CategoryCell readiness={row.readiness} category="Rules" onOpen={open} />
                      </td>
                      <td className="py-2.5 pr-4">
                        <VerdictBadge verdict={row.readiness.verdict} />
                      </td>
                      <td className="py-2.5">
                        {run && status ? (
                          <button
                            type="button"
                            onClick={() => open(`/execution/history?run=${run.id}`)}
                            className="text-left hover:underline"
                          >
                            <span className="font-bold text-navy-900">
                              v{versionOf(run, runs)} · {formatDate(run.asOfDate)}
                            </span>{' '}
                            <StatusBadge status={SIGN_OFF_LABEL[status]} tone={SIGN_OFF_TONE[status]} />
                          </button>
                        ) : (
                          <span className="text-gray-400">No run yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ─── Affiliate scope ─────────────────────────────────────────────────────────

function LatestRun({ run, runs }: { run: ProcessRun; runs: ProcessRun[] }) {
  const { data: results = [] } = useRunResults(run.id);
  const status = signOffStatusOf(run);
  const headlines = runHeadlines(results)
    .filter((h) => h.unit === 'percent' && h.value !== null)
    .slice(0, 4);
  return (
    <div>
      <p className="text-[13px] text-navy-900">
        <span className="font-bold">
          {run.name} · v{versionOf(run, runs)} · {formatDate(run.asOfDate)}
        </span>{' '}
        <StatusBadge status={SIGN_OFF_LABEL[status]} tone={SIGN_OFF_TONE[status]} />
      </p>
      {headlines.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-gray-600">
          {headlines.map((h) => (
            <span key={h.label}>
              {h.label} <span className="font-bold text-navy-900">{formatPct(h.value)}</span>
            </span>
          ))}
        </p>
      )}
      <DegradationNotice run={run} className="mt-3" />
      <Link
        href={`/execution/history?run=${run.id}`}
        className="mt-2 inline-block text-[12px] font-bold text-navy-700 hover:underline"
      >
        Open in Runs →
      </Link>
    </div>
  );
}

function AffiliateReadiness() {
  const { affiliateCode, affiliate, asOfDate } = useWorkingContext();
  const { readiness, isLoading } = useReadiness(affiliateCode, asOfDate);
  const { data: runs = [] } = useRuns(affiliateCode);
  const canFix = useCanFix();
  const canUpload = canFix('data.upload', 'Affiliate', affiliateCode);
  const canRun = canFix('run.execute', 'Affiliate', affiliateCode);
  const run = latestRunFor(runs, affiliateCode, asOfDate) ?? latestRunFor(runs, affiliateCode);
  const name = affiliate?.name ?? affiliateCode;

  return (
    <>
      <ModuleHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Readiness {readiness && <VerdictBadge verdict={readiness.verdict} />}
          </span>
        }
        description={`Is ${name} ready to run for this date - and if not, what is missing and who can fix it.`}
        about="Computed from live data. Only six things stop a run (no committed positions, affiliate not Live, a missing FX rate, no calculation selected, an unapproved rule selected, a locked series); everything else runs and is labelled with what it affects."
        asOfDate={asOfDate}
        scope={name}
        metrics={
          readiness
            ? [
                {
                  label: 'Blocking',
                  value: String(readiness.blockers.length),
                  tone: readiness.blockers.length > 0 ? 'danger' : 'success',
                },
                {
                  label: 'Warnings',
                  value: String(readiness.warnings.length),
                  tone: readiness.warnings.length > 0 ? 'warning' : 'success',
                },
              ]
            : []
        }
        actions={
          <span className="flex flex-wrap gap-2">
            {canUpload && (
              <Link
                href="/data/operations?upload=1"
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700"
              >
                Upload data
              </Link>
            )}
            {canRun && (
              <Link
                href="/execution"
                className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
              >
                Run now
              </Link>
            )}
          </span>
        }
      />

      {readiness && readiness.verdict === 'Blocked' && (
        <div role="alert" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[13px] text-danger">
          <span className="font-bold">Blocked:</span>{' '}
          {readiness.blockers
            .filter((b) => !b.signedOff)
            .map((b) => b.label)
            .join(', ')}
          .
        </div>
      )}
      {readiness && readiness.verdict === 'Signed off' && (
        <div role="status" className="mb-6 rounded-lg bg-navy-50 px-4 py-3 text-[13px] text-navy-900">
          <span className="font-bold">Signed off:</span> this date&rsquo;s figures are final. Reopen it in Run &amp;
          results → Runs to run it again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Checklist</h2>
          {isLoading || !readiness ? (
            <p className="text-[13px] text-gray-400">Checking…</p>
          ) : (
            <ReadinessChecklist readiness={readiness} />
          )}
        </section>
        <section className="h-fit rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Latest run</h2>
          {run ? (
            <LatestRun run={run} runs={runs} />
          ) : (
            <p className="text-[13px] text-gray-500">No run yet for {name}.</p>
          )}
        </section>
      </div>
    </>
  );
}
