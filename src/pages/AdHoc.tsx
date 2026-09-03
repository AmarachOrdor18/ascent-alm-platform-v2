import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { useRuns, runKeys } from '@/lib/runHooks';
import { accessibleAffiliates, scopedListCode } from '@/lib/scope';
import { repository } from '@/store/localRepository';
import { METRIC_SPECS, extractMetrics, formatMetric } from '@/lib/metrics';
import type { RunResult } from '@/engine/types';

export function AdHoc() {
  const { user, hasPermission } = useAuth();
  const { data: affiliates = [], isLoading: affiliatesLoading } = useAffiliates();
  // A user confined to one affiliate can only pick and run that affiliate here - reporting.view is
  // broad, so without this every affiliate's figures leaked to everyone who holds it.
  const { data: runs = [], isLoading: runsLoading } = useRuns(scopedListCode(user, hasPermission));

  const [metricKeys, setMetricKeys] = useState<string[]>(['lcrPercent', 'nsfrPercent']);
  const [affiliateCodes, setAffiliateCodes] = useState<string[]>([]);
  const [ran, setRan] = useState(false);

  const liveAffiliates = accessibleAffiliates(
    affiliates.filter((a) => a.code !== 'GROUP'),
    user,
    hasPermission,
  );

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const latestRunByAffiliate = useMemo(() => {
    const map = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (run.status !== 'Completed') continue;
      const held = map.get(run.affiliateCode);
      if (!held || run.createdAt > held.createdAt) map.set(run.affiliateCode, run);
    }
    return map;
  }, [runs]);

  const targets = (ran ? affiliateCodes : []).map((code) => ({
    code,
    name: affiliates.find((a) => a.code === code)?.name ?? code,
    run: latestRunByAffiliate.get(code) ?? null,
  }));

  const resultQueries = useQueries({
    queries: targets.map((t) => ({
      queryKey: runKeys.results(t.run?.id ?? 'none'),
      queryFn: (): Promise<RunResult[]> => (t.run ? repository.listRunResults(t.run.id) : Promise.resolve([])),
      enabled: t.run !== null,
    })),
  });
  const resultsLoading = resultQueries.some((q) => q.isLoading);

  const rows = targets.map((t, i) => ({
    code: t.code,
    name: t.name,
    asOfDate: t.run?.asOfDate ?? null,
    metrics: extractMetrics(resultQueries[i]?.data ?? []),
  }));

  const columns: ResultColumn<(typeof rows)[number]>[] = [
    {
      key: 'affiliate',
      header: 'Affiliate',
      render: (r) => (
        <span>
          <span className="font-medium text-navy-900">{r.name}</span>
          <span className="ml-2 font-mono text-[10px] text-gray-400">{r.asOfDate ?? 'no run'}</span>
        </span>
      ),
    },
    ...metricKeys.map((key): ResultColumn<(typeof rows)[number]> => ({
      key,
      header: METRIC_SPECS.find((m) => m.key === key)?.label ?? key,
      align: 'right',
      render: (r) => <span className="font-mono">{formatMetric(r.metrics.get(key) ?? null, key)}</span>,
    })),
  ];

  return (
    <>
      <ModuleHeader
        title="Ad-Hoc Analysis"
        description="Pick metrics and affiliates from the platform's own catalogue and register - each read from its latest completed run."
        asOfDate={null}
        metrics={[
          {
            label: 'Metrics available',
            value: String(METRIC_SPECS.length),
            about: 'The full metric catalogue this screen can pull from - the same one Limits and KRI use.',
          },
          {
            label: 'Affiliates onboarded',
            value: affiliatesLoading ? '-' : String(liveAffiliates.length),
            about: 'Non-Group affiliates registered in the platform, regardless of onboarding status.',
          },
          {
            label: 'Runs with results',
            value: runsLoading ? '-' : String(latestRunByAffiliate.size),
            about: 'Affiliates that have at least one completed run to read a metric from.',
          },
          {
            label: 'Selected',
            value: `${metricKeys.length} × ${affiliateCodes.length}`,
            about:
              'How many metrics and affiliates are currently chosen - the analysis below is this grid, one cell per pair.',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Metrics</h2>
              <InfoButton label="Why this list">
                The same catalogue Limits and KRI read from - nothing metric-specific to this screen.
              </InfoButton>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {METRIC_SPECS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    toggle(metricKeys, setMetricKeys, m.key);
                    setRan(false);
                  }}
                  className={`rounded-lg border p-3 text-left ${metricKeys.includes(m.key) ? 'border-gold-500 bg-gold-500/5' : 'border-gray-200 hover:border-navy-700'}`}
                >
                  <p className="text-[11px] font-bold text-navy-900">{m.label}</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">{m.element}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Affiliates</h2>
              <InfoButton label="Why this list">
                Analysis, not the Group-consolidated view - any status, not just Live.
              </InfoButton>
            </div>
            {affiliatesLoading ? (
              <p className="text-[11px] text-gray-400">Loading…</p>
            ) : liveAffiliates.length === 0 ? (
              <p className="text-[11px] text-gray-400">No affiliates onboarded yet.</p>
            ) : (
              <MultiSelectDropdown
                className="max-w-sm"
                placeholder="Select affiliates…"
                selected={affiliateCodes}
                onChange={(next) => {
                  setAffiliateCodes(next);
                  setRan(false);
                }}
                options={liveAffiliates.map((a) => ({
                  value: a.code,
                  label: a.name,
                  hint: latestRunByAffiliate.has(a.code) ? undefined : 'no completed run',
                }))}
              />
            )}
          </section>

          <button
            type="button"
            onClick={() => setRan(true)}
            disabled={metricKeys.length === 0 || affiliateCodes.length === 0}
            className="w-full rounded-lg bg-navy-900 py-3 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Run analysis
          </button>
        </div>
      </div>

      {ran && (
        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Results</h2>
          <ResultTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.code}
            emptyMessage={resultsLoading ? 'Loading…' : 'Nothing selected.'}
          />
        </section>
      )}
    </>
  );
}
