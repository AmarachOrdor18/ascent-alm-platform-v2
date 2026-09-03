import { useQueries } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useBatches, useDeleteAffiliate } from '@/lib/hooks';
import { useRuns, runKeys } from '@/lib/runHooks';
import { repository } from '@/store/localRepository';
import { accessibleAffiliates } from '@/lib/scope';
import { checkAllDomains, worstFreshness as computeWorstFreshness, type FreshnessCheck } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import { metricValue } from '@/lib/metrics';
import type { Affiliate, RunResult } from '@/engine/types';

type RiskSeverity = 'Low' | 'Medium' | 'High' | 'No run';
const RISK_TONE: Record<RiskSeverity, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
  'No run': 'neutral',
};
// A lighter read than the full Risk Map (which also weighs Group deposit-share) - LCR alone,
// since that's the single number this list needs to flag "worth a closer look" at a glance.
function classifyByLcr(lcr: number | null): RiskSeverity {
  if (lcr === null) return 'No run';
  if (lcr < 100) return 'High';
  if (lcr < 130) return 'Medium';
  return 'Low';
}

const TODAY = new Date().toISOString().slice(0, 10);

const FRESHNESS_TONE = {
  Fresh: 'success',
  Due: 'warning',
  Stale: 'danger',
  'Never loaded': 'neutral',
} as const;

export function Affiliates() {
  const [, navigate] = useLocation();
  const { user, hasPermission } = useAuth();
  const canOnboard = hasPermission('group.manage');
  const { data: affiliates = [], isLoading } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: runs = [] } = useRuns();
  const deleteAffiliate = useDeleteAffiliate();

  // An Affiliate Admin (or anyone else without group.manage) sees only their own affiliate here -
  // otherwise this list and the detail screen it links to would leak every other affiliate's profile,
  // feeds and balance sheet to someone who can't act on them anyway.
  const rows = accessibleAffiliates(
    affiliates.filter((a) => a.code !== 'GROUP'),
    user,
    hasPermission,
  );

  const latestRunByAffiliate = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.status !== 'Completed') continue;
    const held = latestRunByAffiliate.get(run.affiliateCode);
    if (!held || run.createdAt > held.createdAt) latestRunByAffiliate.set(run.affiliateCode, run);
  }
  const resultQueries = useQueries({
    queries: rows.map((a) => {
      const runId = latestRunByAffiliate.get(a.code)?.id ?? null;
      return {
        queryKey: runKeys.results(runId ?? 'none'),
        queryFn: (): Promise<RunResult[]> => (runId ? repository.listRunResults(runId) : Promise.resolve([])),
        enabled: runId !== null,
      };
    }),
  });
  const riskFor = (a: Affiliate): RiskSeverity => {
    const i = rows.findIndex((r) => r.code === a.code);
    const results = resultQueries[i]?.data ?? [];
    return classifyByLcr(metricValue(results, 'lcrPercent'));
  };

  const cancelOnboarding = (a: Affiliate) => {
    if (!window.confirm(`Abandon onboarding for ${a.name}? This deletes the record - it cannot be undone.`)) return;
    deleteAffiliate.mutate(a);
  };

  const freshnessFor = (a: Affiliate): FreshnessCheck[] => checkAllDomains(a, batches, TODAY);

  const worstFreshness = (a: Affiliate): FreshnessCheck['status'] => computeWorstFreshness(freshnessFor(a));

  const live = rows.filter((a) => a.status === 'Live');
  const onboarding = rows.filter((a) => a.status === 'Onboarding');

  const columns: ResultColumn<Affiliate>[] = [
    {
      key: 'name',
      header: 'Affiliate',
      render: (a) => <span className="font-medium text-navy-900">{a.name}</span>,
    },
    { key: 'country', header: 'Country', render: (a) => <span className="text-gray-600">{a.country}</span> },
    { key: 'regulator', header: 'Regulator', render: (a) => <span className="text-gray-600">{a.regulator}</span> },
    {
      key: 'currency',
      header: 'Functional',
      render: (a) => <span className="font-mono text-[11px]">{a.functionalCurrency}</span>,
    },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
    {
      key: 'freshness',
      header: 'Data freshness',
      render: (a) => {
        const worst = worstFreshness(a);
        return <StatusBadge status={worst} tone={FRESHNESS_TONE[worst]} />;
      },
    },
    {
      key: 'lastRun',
      header: 'Last Run',
      render: (a) => {
        const run = latestRunByAffiliate.get(a.code);
        return run ? (
          <span className="font-mono text-[11px] text-gray-600">{formatDate(run.asOfDate)}</span>
        ) : (
          <span className="text-gray-300">-</span>
        );
      },
    },
    {
      key: 'risk',
      header: 'Risk Status',
      render: (a) => {
        const risk = riskFor(a);
        return <StatusBadge status={risk} tone={RISK_TONE[risk]} />;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (a) => {
        if (!canOnboard) return null;
        if (a.status === 'Onboarding') {
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate(`/affiliates/onboard/${a.code}`)}
                className="rounded border border-gray-200 px-2 py-1 text-[11px] font-bold text-navy-900 hover:border-navy-700"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => cancelOnboarding(a)}
                className="rounded border border-gray-200 px-2 py-1 text-[11px] font-bold text-danger hover:border-danger"
              >
                Cancel
              </button>
            </div>
          );
        }
        return (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate(`/affiliates/${a.code}/settings`)}
              className="rounded border border-gray-200 px-3 py-1 text-[11px] font-bold text-navy-900 hover:border-navy-700"
            >
              Settings →
            </button>
          </div>
        );
      },
      align: 'right',
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Affiliates"
        description="The Group footprint, with how current each affiliate's data is. Only Live affiliates consolidate into Group figures."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Affiliates', value: String(rows.length), about: 'Every affiliate registered in the platform, at any stage of onboarding.' },
          { label: 'Live', value: String(live.length), tone: 'success', about: 'Affiliates whose data is trusted enough to roll up into Group figures.' },
          {
            label: 'Onboarding',
            value: String(onboarding.length),
            tone: onboarding.length > 0 ? 'warning' : 'neutral',
            about: 'Affiliates still being configured - not yet contributing to Group-consolidated results.',
          },
          {
            label: 'Stale data',
            value: String(rows.filter((a) => worstFreshness(a) === 'Stale').length),
            tone: 'danger',
            about: 'Affiliates where at least one data domain has aged past its refresh SLA.',
          },
        ]}
        actions={
          canOnboard ? (
            <div className="flex gap-2">
              {/* Group-level configuration (connectors, business rules, reference data) lives on the
                  Group row's Settings, not in a sidebar module - surface it here since the list
                  below only shows individual affiliates. */}
              <Link
                href="/affiliates/GROUP/settings"
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
              >
                Group settings
              </Link>
              <Link
                href="/affiliates/bulk-onboard"
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
              >
                Bulk onboard
              </Link>
              <Link
                href="/affiliates/onboard"
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
              >
                Onboard affiliate
              </Link>
            </div>
          ) : null
        }
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable
          rows={rows}
          columns={columns}
          rowKey={(a) => a.code}
          emptyMessage={isLoading ? 'Loading…' : 'No affiliates yet.'}
          renderDetail={(a) => (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Feeds by domain</h3>
              {a.feeds.length === 0 ? (
                <p className="text-[12px] text-gray-500">
                  No feeds configured - this affiliate has not started onboarding.
                </p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-400">
                      <th className="py-1 px-3 font-bold uppercase tracking-wider">Domain</th>
                      <th className="py-1 px-3 font-bold uppercase tracking-wider">Fed by</th>
                      <th className="py-1 px-3 font-bold uppercase tracking-wider">SLA</th>
                      <th className="py-1 px-3 font-bold uppercase tracking-wider">Last loaded</th>
                      <th className="py-1 px-3 font-bold uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freshnessFor(a).map((f) => {
                      const feed = a.feeds.find((x) => x.domain === f.domain)!;
                      return (
                        <tr key={f.domain} className="border-b border-gray-100">
                          <td className="py-1.5 px-3 font-medium text-navy-900">{f.domain}</td>
                          <td className="py-1.5 px-3 text-gray-600">
                            {feed.mode === 'File' ? 'File upload (substitution)' : feed.mode}
                            {feed.owner && <span className="text-gray-400"> · {feed.owner}</span>}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-gray-500">{f.slaDays}d</td>
                          <td className="py-1.5 px-3 font-mono text-gray-500">
                            {f.lastLoadedAt ? formatDate(f.lastLoadedAt.slice(0, 10)) : '-'}
                          </td>
                          <td className="py-1.5 px-3">
                            <StatusBadge status={f.status} tone={FRESHNESS_TONE[f.status]} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        />
      </div>
    </>
  );
}

