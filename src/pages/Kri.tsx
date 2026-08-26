/**
 * KRI Dashboard — screen 46.
 *
 * A limit is a point-in-time test. A key risk indicator is a *direction of
 * travel*, so this screen reads the same metric from every completed run at
 * successive as-of dates and fits a trend across them.
 *
 * The distinction matters at ALCO: a bank sitting at 118% LCR is within
 * appetite, but if it was at 168% six months ago the interesting fact is the
 * slope, not the level. `engine/kri.ts` fits a least-squares line rather than
 * differencing the endpoints, so a single odd month does not read as a trend.
 *
 * This screen previously rendered a hardcoded array and had no access to run
 * history at all.
 */

import { useMemo } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useRuns } from '@/lib/runHooks';
import { evaluateKris, useKriSeries } from '@/lib/limitHooks';
import { DEFAULT_KRIS, type KriEvaluation } from '@/engine/kri';
import { formatMetric } from '@/lib/metrics';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Green: 'success', Amber: 'warning', Red: 'danger', 'No data': 'neutral',
};
const TREND_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Improving: 'success', Stable: 'neutral', Deteriorating: 'danger',
};

export function Kri() {
  const { affiliateCode } = useScope();
  const { data: runs = [], isLoading } = useRuns(affiliateCode);

  const metricKeys = useMemo(() => DEFAULT_KRIS.filter((k) => k.isActive).map((k) => k.metricKey), []);
  const { data: series } = useKriSeries(runs, metricKeys);

  const evaluations = useMemo(() => evaluateKris(series), [series]);
  const deteriorating = evaluations.filter((e) => e.trend === 'Deteriorating');
  const observationCount = series ? Math.max(0, ...Array.from(series.values()).map((s) => s.length)) : 0;
  const completed = runs.filter((r) => r.status === 'Completed').length;

  const columns: ResultColumn<KriEvaluation>[] = [
    { key: 'label', header: 'Indicator', render: (k) => <span className="font-medium text-navy-900">{k.label}</span> },
    {
      key: 'current',
      header: 'Current',
      align: 'right',
      render: (k) => <span className="font-mono font-bold">{formatMetric(k.currentValue, k.metricKey)}</span>,
      compareValue: (k) => k.currentValue,
    },
    {
      key: 'prior',
      header: 'Window start',
      align: 'right',
      render: (k) => <span className="font-mono text-gray-500">{formatMetric(k.priorValue, k.metricKey)}</span>,
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      render: (k) =>
        k.changeOverWindow === null ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className={`font-mono ${k.trend === 'Deteriorating' ? 'text-danger' : k.trend === 'Improving' ? 'text-success' : ''}`}>
            {k.changeOverWindow > 0 ? '+' : ''}
            {k.changeOverWindow.toFixed(2)}
          </span>
        ),
    },
    {
      key: 'slope',
      header: 'Per period',
      align: 'right',
      render: (k) =>
        k.slopePerPeriod === null ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className="font-mono text-[11px]">
            {k.slopePerPeriod > 0 ? '+' : ''}
            {k.slopePerPeriod.toFixed(2)}
          </span>
        ),
    },
    {
      key: 'projected',
      header: 'If it persists',
      align: 'right',
      render: (k) =>
        k.projectedValue === null ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className="font-mono text-[11px] text-gray-600">{formatMetric(k.projectedValue, k.metricKey)}</span>
        ),
    },
    { key: 'trend', header: 'Trend', render: (k) => <StatusBadge status={k.trend} tone={TREND_TONE[k.trend]} /> },
    { key: 'status', header: 'Status', render: (k) => <StatusBadge status={k.status} tone={TONE[k.status]} /> },
    { key: 'n', header: 'Obs', align: 'right', render: (k) => <span className="font-mono text-[11px]">{k.observationsUsed}</span> },
  ];

  return (
    <>
      <ModuleHeader
        title="KRI Dashboard"
        description="Direction of travel across your run history — the slope, not just today's level."
        asOfDate={null}
        scope={affiliateCode}
        metrics={[
          { label: 'Indicators', value: String(evaluations.length) },
          {
            label: 'Deteriorating',
            value: String(deteriorating.length),
            tone: deteriorating.length > 0 ? 'danger' : 'success',
          },
          { label: 'Runs in history', value: String(completed) },
          { label: 'Longest series', value: `${observationCount} obs` },
        ]}
        actions={
          <Link
            href="/limits"
            className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
          >
            See today's levels
          </Link>
        }
      />

      {isLoading ? (
        <p className="text-[12px] text-gray-500">Loading run history…</p>
      ) : completed === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-[13px] font-bold text-navy-900">No completed runs yet</p>
            <InfoButton label="Why this matters">
              A KRI is a trend, so it needs the same metric at several dates. Execute runs at successive as-of dates
              and the series builds itself — there is no separate KRI data to maintain.
            </InfoButton>
          </div>
          <Link
            href="/runs/new"
            className="mt-4 inline-block rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
          >
            Go to Process Run
          </Link>
        </div>
      ) : (
        <>
          {observationCount < 3 && (
            <p className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-gray-600">
              <span className="font-bold text-navy-900">
                Only {observationCount} observation{observationCount === 1 ? '' : 's'} available.
              </span>{' '}
              Below three points there is no trend worth fitting, so the indicators report their level and say the
              trend is unknown rather than extrapolating from two points. Run more as-of dates — the Batch Scheduler
              backlog will produce them in one pass.
            </p>
          )}

          {deteriorating.length > 0 && (
            <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-5">
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={`${deteriorating.length} deteriorating`} tone="danger" />
                <span className="text-[12px] font-bold text-navy-900">Moving the wrong way</span>
              </div>
              <ul className="space-y-1 text-[11px] text-gray-700">
                {deteriorating.map((k) => (
                  <li key={k.definitionId}>
                    <span className="font-bold text-navy-900">{k.label}</span> — {k.narrative}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Indicators</h2>
              <InfoButton label="Methodology">
                The slope is a least-squares fit over the window, not the difference between the first and last
                observation, so one anomalous month does not read as a trend. &ldquo;If it persists&rdquo; projects
                the current slope forward by another window — an extrapolation, not a forecast.
              </InfoButton>
            </div>
            <ResultTable
              rows={evaluations}
              columns={columns}
              rowKey={(k) => k.definitionId}
              emptyMessage="No indicators configured."
              renderDetail={(k) => <KriDetail evaluation={k} observations={series?.get(k.metricKey) ?? []} />}
            />
          </section>
        </>
      )}
    </>
  );
}

function KriDetail({
  evaluation,
  observations,
}: {
  evaluation: KriEvaluation;
  observations: Array<{ asOfDate: string; value: number }>;
}) {
  if (observations.length === 0) {
    return (
      <p className="text-[11px] text-gray-500">
        No run has produced this metric. Its element was not among the calculation elements selected.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-gray-600">{evaluation.narrative}</p>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <LineChart data={observations} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--gray-200))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="asOfDate" tick={{ fontSize: 10, fill: 'hsl(var(--gray-500))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--gray-500))' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--gray-200))' }}
              formatter={(v: number) => formatMetric(v, evaluation.metricKey)}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={evaluation.label}
              stroke={evaluation.trend === 'Deteriorating' ? 'hsl(var(--danger))' : 'hsl(var(--teal-700))'}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-gray-400">
        {observations.length} observation{observations.length === 1 ? '' : 's'} from{' '}
        {observations[0]!.asOfDate} to {observations[observations.length - 1]!.asOfDate}. One run per as-of date; where
        a date was run more than once, the most recent stands.
      </p>
    </div>
  );
}
