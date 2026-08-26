/**
 * Interest Rate Risk in the Banking Book — screen 39.
 *
 * The earnings view (ΔNII) and the economic-value view (ΔEVE) from the run,
 * with the duration gap that drives the second one shown rather than left
 * implicit.
 *
 * The capital basis is named on the screen. v1 used ten per cent of assets
 * as a proxy for equity, which makes the outlier test meaningless — a bank
 * with thin capital looked identical to one with thick capital.
 */

import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_STROKE, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE } from '@/components/results/chartStyle';
import { useScope } from '@/context/ScopeContext';
import { useFxRates, usePositions, useYieldCurves } from '@/lib/hooks';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { formatPct, formatAmount } from '@/lib/format';
import { buildFxTable } from '@/engine/fx';
import { defaultLadder } from '@/engine/buckets';
import { computeAllShocks, type EveResult, type NiiResult } from '@/engine/irrbb';
import type { RepricingGapResult } from '@/engine/irrbb';

export function Irrbb() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const { data: fxRates = [] } = useFxRates();
  const { data: yieldCurves = [] } = useYieldCurves();
  const { data: runPositions = [] } = usePositions(run?.affiliateCode, run?.asOfDate);

  const nii = payloadOf<NiiResult>(results, 'NiiSensitivity');
  const eve = payloadOf<EveResult>(results, 'EveSensitivity');
  const repricingGap = payloadOf<RepricingGapResult>(results, 'RepricingGap');

  const ladder = defaultLadder('RepricingGap');
  const allShocks =
    run && runPositions.length > 0
      ? computeAllShocks(
          runPositions,
          { asOfDate: run.asOfDate, reportingCurrency: currency, fx: buildFxTable('USD', fxRates, run.asOfDate), tier1Capital: null },
          ladder,
        )
      : null;

  const shockRows = allShocks
    ? Object.entries(allShocks.results).map(([key, r]) => ({
        key,
        label: r.label,
        niiImpactPercent: r.nii.niiSensitivityPercent ?? 0,
        eveImpactPercent: r.eve.eveSensitivityPercentOfEquity ?? 0,
      }))
    : [];

  const curve = yieldCurves
    .filter((c) => c.currency === currency && c.isActive && (!run || c.asOfDate <= run.asOfDate))
    .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0];
  const curvePoints = curve ? curve.terms.map((t) => ({ tenor: t.label, rate: t.ratePercent })) : [];

  return (
    <>
      <ModuleHeader
        title="Interest Rate Risk (IRRBB)"
        description="Earnings and economic value under the run's shock, with the duration gap that produces the second."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: `NII sensitivity (${nii ? `${nii.shockBps > 0 ? '+' : ''}${nii.shockBps}bp` : 'run shock'})`,
            value: formatPct(nii?.niiSensitivityPercent ?? null, 2),
            tone: (nii?.deltaNii ?? 0) < 0 ? 'warning' : 'neutral',
          },
          {
            label: 'EVE sensitivity (% of capital)',
            value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2),
            tone: eve?.isBaselOutlier === true ? 'danger' : 'success',
          },
          { label: 'Prescribed shock scenarios', value: String(shockRows.length) },
          { label: 'Repricing buckets', value: String(repricingGap?.buckets.length ?? ladder.buckets.length) },
        ]}
        actions={
          <div className="flex gap-2">
            <Link
              href="/stress-testing"
              className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              Run all six shocks
            </Link>
            <Link
              href="/rules"
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-bold text-navy-900 hover:bg-gray-50 transition-colors"
            >
              Configure Rules
            </Link>
          </div>
        }
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['NiiSensitivity', 'EveSensitivity']}
        elementLabels={{ NiiSensitivity: 'NII sensitivity', EveSensitivity: 'EVE sensitivity' }}
      >
        {shockRows.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Basel prescribed shock scenarios</h2>
              <p className="mb-4 text-[11px] font-medium text-gray-400">NII and EVE impact, all six standard shocks against this run's book</p>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <BarChart data={shockRows} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={CHART_AXIS_TICK} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} width={140} tick={{ fontSize: 10, fill: '#4B5563' }} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <ReferenceLine x={0} stroke={CHART_COLORS.neutral} />
                    <Bar dataKey="niiImpactPercent" name="NII impact %" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="eveImpactPercent" name="EVE impact %" fill={CHART_COLORS.accent} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Yield curve</h2>
              <p className="mb-4 text-[11px] font-medium text-gray-400">{currency}, most recent curve as at or before the run date</p>
              <div style={{ width: '100%', height: 320 }}>
                {curvePoints.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-8 text-center text-[12px] text-gray-400">
                    No active {currency} yield curve as at or before {run?.asOfDate ?? 'this date'}.
                  </div>
                ) : (
                  <ResponsiveContainer>
                    <LineChart data={curvePoints}>
                      <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="tenor" axisLine={false} tickLine={false} tick={CHART_AXIS_TICK} />
                      <YAxis axisLine={false} tickLine={false} tick={CHART_AXIS_TICK} tickFormatter={(v: number) => `${v}%`} domain={['dataMin - 1', 'dataMax + 1']} />
                      <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="rate" name="Rate" stroke={CHART_COLORS.primary} strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        )}

        {repricingGap && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Repricing gap analysis</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">Rate-sensitive assets vs. liabilities by repricing bucket</p>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={repricingGap.buckets} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bucket" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatAmount(v, currency)} />
                  <Tooltip formatter={(value: number, name: string) => [formatAmount(value, currency), name]} contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.neutral} strokeWidth={1} />
                  <Bar dataKey="assets" name="Rate-sensitive assets" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="liabilities" name="Rate-sensitive liabilities" fill={CHART_COLORS.neutral} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gap" name="Net gap" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {shockRows.length > 0 && (
          <section className="mb-6 table-datagrid-container">
            <div className="border-b border-gray-100 bg-white/50 p-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-navy-900">Scenario detail</h2>
              <p className="text-[11px] font-medium text-gray-400">The six prescribed Basel IRRBB shock scenarios, with NII and EVE impact</p>
            </div>
            <ShockTable rows={shockRows} />
          </section>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {nii && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Earnings view — ΔNII
              </h2>
              <p className="mb-4 text-[11px] text-gray-500">
                What a {nii.shockBps > 0 ? '+' : ''}
                {nii.shockBps}bp move does to net interest income over {nii.horizonDays} days.
              </p>

              <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">
                <Amount value={nii.deltaNii} currency={currency} colorBySign mono={false} />
              </p>

              <dl className="space-y-2 text-[12px]">
                <Row
                  label="Rate-sensitive assets"
                  value={<Amount value={nii.rateSensitiveAssets} currency={currency} />}
                />
                <Row
                  label="Rate-sensitive liabilities"
                  value={<Amount value={nii.rateSensitiveLiabilities} currency={currency} />}
                />
                <Row
                  label="Repricing gap"
                  value={<Amount value={nii.repricingGap} currency={currency} colorBySign />}
                  bold
                />
                <Row label="Base net interest income" value={<Amount value={nii.baseNii} currency={currency} />} />
                <Row
                  label="Sensitivity"
                  value={<span className="font-mono font-bold">{formatPct(nii.niiSensitivityPercent, 2)}</span>}
                  bold
                />
              </dl>

              <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                {nii.repricingGap < 0
                  ? 'The gap is negative — more liabilities reprice inside the horizon than assets, so a rate rise costs earnings before it earns them.'
                  : 'The gap is positive — more assets reprice inside the horizon than liabilities, so a rate rise adds to earnings.'}{' '}
                Deposit betas are not applied here; the What-If Builder applies them and shows the difference.
              </p>

              <Methodology text={methodologyOf(results, 'NiiSensitivity')} />
            </section>
          )}

          {eve && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Economic value view — ΔEVE
                </h2>
                {eve.isBaselOutlier !== null && (
                  <StatusBadge
                    status={eve.isBaselOutlier ? 'Supervisory outlier' : `Within ${eve.outlierThresholdPercent}%`}
                    tone={eve.isBaselOutlier ? 'danger' : 'success'}
                  />
                )}
              </div>
              <p className="mb-4 text-[11px] text-gray-500">
                Present-value change across the whole book, via the duration gap.
              </p>

              <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">
                <Amount value={eve.deltaEve} currency={currency} colorBySign mono={false} />
              </p>

              <dl className="space-y-2 text-[12px]">
                <Row
                  label="Asset duration"
                  value={<span className="font-mono">{eve.assetDuration?.toFixed(2) ?? '—'} yrs</span>}
                />
                <Row
                  label="Liability duration"
                  value={<span className="font-mono">{eve.liabilityDuration?.toFixed(2) ?? '—'} yrs</span>}
                />
                <Row
                  label="Duration gap"
                  value={<span className="font-mono font-bold">{eve.durationGap?.toFixed(2) ?? '—'} yrs</span>}
                  bold
                />
                <Row
                  label="PV01 (per 1bp)"
                  value={eve.pv01 === null ? <span className="font-mono">—</span> : <Amount value={eve.pv01} currency={currency} colorBySign />}
                />
                <Row label="Total assets" value={<Amount value={eve.totalAssets} currency={currency} />} />
                <Row label="Total liabilities" value={<Amount value={eve.totalLiabilities} currency={currency} />} />
                <Row label={eve.capitalBasis} value={<Amount value={eve.equity} currency={currency} />} bold />
                <Row
                  label="ΔEVE as % of capital"
                  value={<span className="font-mono font-bold">{formatPct(eve.eveSensitivityPercentOfEquity, 2)}</span>}
                />
              </dl>

              <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                <span className="font-bold text-navy-900">Capital basis: {eve.capitalBasis.toLowerCase()}.</span>{' '}
                {eve.capitalBasis === 'Balance-sheet equity'
                  ? 'No regulatory Tier 1 figure has been supplied for this affiliate, so the outlier test runs against balance-sheet equity. Loading Tier 1 changes the denominator and can change the verdict.'
                  : 'The supervisory outlier test is running against the regulatory figure, which is what BCBS 368 prescribes.'}
              </p>

              <Methodology text={methodologyOf(results, 'EveSensitivity')} />
            </section>
          )}
        </div>

        {eve?.durationGap !== null && eve !== null && (
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Reading the gap
              <InfoButton label="Why duration is approximated">
                Duration is approximated per position rather than computed from full cash flows — ledger-grain data
                does not carry the schedule a full revaluation needs, which is the same constraint Oracle names when
                it prescribes non-cash-flow methods for this data shape.
              </InfoButton>
            </h2>
            <p className="text-[11px] leading-relaxed text-gray-600">
              A duration gap of <span className="font-mono font-bold text-navy-900">{eve.durationGap!.toFixed(2)}</span>{' '}
              years means assets reprice{' '}
              {eve.durationGap! > 0 ? 'more slowly than' : eve.durationGap! < 0 ? 'faster than' : 'in step with'}{' '}
              liabilities.{' '}
              {eve.durationGap! > 0
                ? 'A rate rise therefore reduces economic value: asset prices fall further than liability values do.'
                : eve.durationGap! < 0
                  ? 'A rate rise therefore adds economic value: liability values fall further than asset prices do.'
                  : 'The book is broadly immunised against a parallel move at this level of approximation.'}
            </p>
          </section>
        )}
      </ResultsFrame>
    </>
  );
}

interface ShockRow {
  key: string;
  label: string;
  niiImpactPercent: number;
  eveImpactPercent: number;
}

function ShockTable({ rows }: { rows: ShockRow[] }) {
  const columns: ResultColumn<ShockRow>[] = [
    { key: 'label', header: 'Scenario', render: (r) => <span className="font-bold text-navy-900">{r.label}</span> },
    {
      key: 'nii',
      header: 'NII impact',
      align: 'right',
      render: (r) => (
        <span className={`font-bold ${r.niiImpactPercent >= 0 ? 'text-success' : 'text-danger'}`}>
          {r.niiImpactPercent >= 0 ? '+' : ''}
          {r.niiImpactPercent.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'eve',
      header: 'EVE impact',
      align: 'right',
      render: (r) => (
        <span className={`font-bold ${r.eveImpactPercent >= 0 ? 'text-success' : 'text-danger'}`}>
          {r.eveImpactPercent >= 0 ? '+' : ''}
          {r.eveImpactPercent.toFixed(1)}%
        </span>
      ),
    },
  ];
  return (
    <div className="p-5">
      <ResultTable rows={rows} columns={columns} rowKey={(r) => r.key} />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${bold ? 'border-t border-gray-100 pt-2 font-bold text-navy-900' : ''}`}
    >
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Methodology({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">{text}</p>;
}
