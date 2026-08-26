/**
 * Liquidity Risk Map — screen 49.
 *
 * Colour-coded risk positioning per affiliate. This used to plot a fixed
 * five-affiliate array with invented LCR/NSFR/concentration figures baked
 * into the component. It now reads each Live affiliate's latest completed
 * run for the same three metrics the Liquidity Risk and Concentration
 * screens already show, and classifies risk from those real figures
 * against the thresholds stated in the legend below, rather than a number
 * typed in alongside the mock array.
 */

import { useQueries } from '@tanstack/react-query';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { useAffiliates } from '@/lib/hooks';
import { useRuns, runKeys } from '@/lib/runHooks';
import { repository } from '@/store/localRepository';
import { metricValue } from '@/lib/metrics';
import type { RunResult } from '@/engine/types';

type RiskLevel = 'High' | 'Medium' | 'Low' | 'No run';

const RISK_DOT: Record<RiskLevel, string> = {
  High: 'bg-danger',
  Medium: 'bg-warning',
  Low: 'bg-success',
  'No run': 'bg-gray-300',
};

const RISK_TEXT: Record<RiskLevel, string> = {
  High: 'text-danger',
  Medium: 'text-warning',
  Low: 'text-success',
  'No run': 'text-gray-400',
};

function classify(lcr: number | null, concentration: number | null): RiskLevel {
  if (lcr === null || concentration === null) return 'No run';
  if (lcr < 100 || concentration > 35) return 'High';
  if (lcr <= 110 || concentration >= 25) return 'Medium';
  return 'Low';
}

interface AffiliatePoint {
  code: string;
  name: string;
  lcr: number | null;
  nsfr: number | null;
  concentration: number | null;
  risk: RiskLevel;
}

export function RiskMap() {
  const { data: affiliates = [] } = useAffiliates();
  const { data: runs = [] } = useRuns();

  const liveAffiliates = affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');

  const latestRunByAffiliate = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.status !== 'Completed') continue;
    const held = latestRunByAffiliate.get(run.affiliateCode);
    if (!held || run.createdAt > held.createdAt) latestRunByAffiliate.set(run.affiliateCode, run);
  }

  const resultQueries = useQueries({
    queries: liveAffiliates.map((a) => {
      const runId = latestRunByAffiliate.get(a.code)?.id ?? null;
      return {
        queryKey: runKeys.results(runId ?? 'none'),
        queryFn: (): Promise<RunResult[]> => (runId ? repository.listRunResults(runId) : Promise.resolve([])),
        enabled: runId !== null,
      };
    }),
  });

  const points: AffiliatePoint[] = liveAffiliates.map((a, i) => {
    const results = resultQueries[i]?.data ?? [];
    const lcr = metricValue(results, 'lcrPercent');
    const nsfr = metricValue(results, 'nsfrPercent');
    const concentration = metricValue(results, 'largestDepositorSharePercent');
    return { code: a.code, name: a.name, lcr, nsfr, concentration, risk: classify(lcr, concentration) };
  });

  const highCount = points.filter((p) => p.risk === 'High').length;
  const mediumCount = points.filter((p) => p.risk === 'Medium').length;
  const lowCount = points.filter((p) => p.risk === 'Low').length;
  const noRunCount = points.filter((p) => p.risk === 'No run').length;

  return (
    <>
      <ModuleHeader
        title="Liquidity Risk Map"
        description="Every Live affiliate's latest completed run, plotted by LCR against depositor concentration."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'High risk', value: String(highCount), tone: highCount > 0 ? 'danger' : 'neutral' },
          { label: 'Medium risk', value: String(mediumCount), tone: mediumCount > 0 ? 'warning' : 'neutral' },
          { label: 'Low risk', value: String(lowCount), tone: 'success' },
          { label: 'Live affiliates', value: String(liveAffiliates.length) },
        ]}
      />

      {liveAffiliates.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No affiliates are Live yet. This map plots the Group's Live affiliates once at least one is promoted.
        </div>
      )}

      {liveAffiliates.length > 0 && (
        <>
          {noRunCount > 0 && (
            <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
              {noRunCount} of {liveAffiliates.length} Live affiliate(s) have no completed run yet and plot as gray, not a fabricated risk level.
            </p>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Affiliate risk matrix</h3>
                <p className="mt-1 text-[11px] font-medium text-gray-400">LCR against depositor concentration</p>
              </div>
              <div className="relative h-80 rounded-lg bg-gray-50 p-4">
                <div className="absolute inset-4 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="absolute left-2 top-2 text-[10px] font-bold text-gray-400">High concentration</div>
                  <div className="absolute right-2 top-2 text-[10px] font-bold text-gray-400">Low concentration</div>
                  <div className="absolute bottom-2 left-2 text-[10px] font-bold text-gray-400">Low LCR</div>
                  <div className="absolute bottom-2 right-2 text-[10px] font-bold text-gray-400">High LCR</div>

                  {points
                    .filter((p) => p.lcr !== null && p.concentration !== null)
                    .map((p) => {
                      const x = 20 + (100 - p.concentration!) * 0.6;
                      const y = 80 - (p.lcr! - 70) * 0.5;
                      return (
                        <div
                          key={p.code}
                          className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 transform rounded-full transition-transform hover:scale-125 ${RISK_DOT[p.risk]}`}
                          style={{ left: `${Math.min(96, Math.max(4, x))}%`, top: `${Math.min(96, Math.max(4, y))}%` }}
                          title={`${p.name}: LCR ${p.lcr!.toFixed(1)}%, concentration ${p.concentration!.toFixed(1)}%`}
                        />
                      );
                    })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Risk summary by affiliate</h3>
                <p className="mt-1 text-[11px] font-medium text-gray-400">From each affiliate's latest completed run</p>
              </div>
              <div className="overflow-x-auto">
                <table className="table-datagrid">
                  <thead>
                    <tr>
                      <th>Affiliate</th>
                      <th>LCR</th>
                      <th>NSFR</th>
                      <th>Concentration</th>
                      <th>Overall risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.code}>
                        <td className="font-bold text-navy-900">{p.name}</td>
                        <td className="font-mono">{p.lcr !== null ? `${p.lcr.toFixed(1)}%` : 'No run'}</td>
                        <td className="font-mono">{p.nsfr !== null ? `${p.nsfr.toFixed(1)}%` : 'No run'}</td>
                        <td className="font-mono">{p.concentration !== null ? `${p.concentration.toFixed(1)}%` : 'No run'}</td>
                        <td>
                          <span className={`rounded px-2 py-0.5 text-xs font-bold ${RISK_TEXT[p.risk]}`}>{p.risk}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Risk assessment criteria</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-danger" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">High risk</p>
              <p className="text-[11px] text-gray-500">LCR below 100% or concentration above 35%</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-warning" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">Medium risk</p>
              <p className="text-[11px] text-gray-500">LCR 100 to 110% or concentration 25 to 35%</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-success" />
            <div>
              <p className="text-[12px] font-bold text-navy-900">Low risk</p>
              <p className="text-[11px] text-gray-500">LCR above 110% and concentration below 25%</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
