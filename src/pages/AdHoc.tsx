import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAffiliates } from '@/lib/hooks';
import { useRuns, useRunResults } from '@/lib/runHooks';
import { METRIC_SPECS, extractMetrics, formatMetric } from '@/lib/metrics';

export function AdHoc() {
  const { data: affiliates = [] } = useAffiliates();
  const { data: runs = [] } = useRuns();

  const [metricKeys, setMetricKeys] = useState<string[]>(['lcrPercent', 'nsfrPercent']);
  const [affiliateCodes, setAffiliateCodes] = useState<string[]>([]);
  const [ran, setRan] = useState(false);

  const liveAffiliates = affiliates.filter((a) => a.code !== 'GROUP');

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

  return (
    <>
      <ModuleHeader
        title="Ad-Hoc Analysis"
        description="Pick metrics and affiliates from the platform's own catalogue and register — each read from its latest completed run."
        asOfDate={null}
        metrics={[
          { label: 'Metrics available', value: String(METRIC_SPECS.length) },
          { label: 'Affiliates onboarded', value: String(liveAffiliates.length) },
          { label: 'Runs with results', value: String(latestRunByAffiliate.size) },
          { label: 'Selected', value: `${metricKeys.length} × ${affiliateCodes.length}` },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Metrics</h2>
              <InfoButton label="Why this list">
                The same catalogue Limits and KRI read from — nothing metric-specific to this screen.
              </InfoButton>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {METRIC_SPECS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { toggle(metricKeys, setMetricKeys, m.key); setRan(false); }}
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
                Analysis, not the Group-consolidated view — any status, not just Live.
              </InfoButton>
            </div>
            {liveAffiliates.length === 0 ? (
              <p className="text-[11px] text-gray-400">No affiliates onboarded yet.</p>
            ) : (
              <MultiSelectDropdown
                className="max-w-sm"
                placeholder="Select affiliates…"
                selected={affiliateCodes}
                onChange={(next) => { setAffiliateCodes(next); setRan(false); }}
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

        <aside className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">How this reads</h2>
            <InfoButton label="Why this matters">
              Each selected affiliate's <em>most recently completed</em> run supplies the figures — the same rule every
              results screen follows. An affiliate with no completed run shows every metric as unmeasured rather than
              zero, and one flagged &ldquo;no run&rdquo; above will read that way here too.
            </InfoButton>
          </div>
        </aside>
      </div>

      {ran && (
        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Results</h2>
          <ResultsTable targets={targets} metricKeys={metricKeys} />
        </section>
      )}
    </>
  );
}

function ResultsTable({
  targets, metricKeys,
}: { targets: Array<{ code: string; name: string; run: { id: string; asOfDate: string } | null }>; metricKeys: string[] }) {
  if (targets.length === 0) return <p className="text-[12px] text-gray-500">Nothing selected.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
            <th className="py-2 px-3 font-bold">Affiliate</th>
            {metricKeys.map((key) => (
              <th key={key} className="py-2 px-3 text-right font-bold">{METRIC_SPECS.find((m) => m.key === key)?.label ?? key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => <AffiliateResultRow key={t.code} target={t} metricKeys={metricKeys} />)}
        </tbody>
      </table>
    </div>
  );
}

/** One row, one hook call — each affiliate's results are fetched by its own component instance. */
function AffiliateResultRow({
  target, metricKeys,
}: { target: { code: string; name: string; run: { id: string; asOfDate: string } | null }; metricKeys: string[] }) {
  const { data: results = [] } = useRunResults(target.run?.id ?? null);
  const metrics = extractMetrics(results);

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 px-3">
        <span className="font-medium text-navy-900">{target.name}</span>
        <span className="ml-2 font-mono text-[10px] text-gray-400">{target.run?.asOfDate ?? 'no run'}</span>
      </td>
      {metricKeys.map((key) => (
        <td key={key} className="py-2 px-3 text-right font-mono">{formatMetric(metrics.get(key) ?? null, key)}</td>
      ))}
    </tr>
  );
}
