/**
 * Dashboard — screen 35.
 *
 * The one screen that is *meant* to be a dashboard. Everything here comes
 * off a single run, so the headline numbers and the detail screens can never
 * disagree — which they could in v1, where each screen recomputed from a
 * different unscoped query.
 *
 * Redesigned for density over explanation: a nine-tile grid of equally
 * weighted cards, each carrying its own descriptive sentence, read as a
 * wall of text rather than a dashboard. Four headline numbers now carry
 * the eye first; the rest sit in a lighter label-and-value grid a step
 * down, the same weighting a trading-floor dashboard uses.
 */

import type { ComponentType, ReactNode } from 'react';
import { Link } from 'wouter';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_STROKE, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE } from '@/components/results/chartStyle';
import { ShieldCheckIcon, BarChartIcon, ClockIcon, PieChartIcon, ArrowUpIcon, ArrowDownIcon, type IconProps } from '@/components/icons/Icons';
import { useScope } from '@/context/ScopeContext';
import { useFxRates } from '@/lib/hooks';
import { useRuns } from '@/lib/runHooks';
import { useKriSeries } from '@/lib/limitHooks';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
import { formatPct, formatDate } from '@/lib/format';
import type { KriObservation } from '@/engine/kri';
import type { ConcentrationResult, LcrResult, LoanToDepositResult, NsfrResult } from '@/engine/liquidity';
import type { EveResult, NiiResult } from '@/engine/irrbb';
import type { ProfitabilityResult } from '@/engine/profitability';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

interface Trend {
  text: string;
  /** Whether this change is good news for the metric, not just whether the number rose. */
  good: boolean;
}

interface Metric {
  id: string;
  label: string;
  value: string;
  tone: Tone;
  href: string;
  icon?: ComponentType<IconProps>;
  trend?: Trend;
}

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-navy-900',
};

const TONE_ICON_BG: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-navy-100 text-navy-700',
};

/** Change since the previous as-of date for this scope — a gap in history means no trend, not a fabricated one. */
function trendFrom(series: KriObservation[] | undefined, higherIsGood: boolean, decimals = 1): Trend | undefined {
  if (!series || series.length < 2) return undefined;
  const latest = series[series.length - 1]!.value;
  const prior = series[series.length - 2]!.value;
  const diff = latest - prior;
  if (diff === 0) return undefined;
  const rose = diff > 0;
  return {
    text: `${rose ? '+' : ''}${diff.toFixed(decimals)}${decimals === 0 ? 'd' : 'pp'} vs last run`,
    good: rose === higherIsGood,
  };
}

export function Dashboard() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;

  const currency = run?.reportingCurrency ?? 'USD';

  const { data: scopedRuns = [] } = useRuns(affiliateCode);
  const { data: trendSeries } = useKriSeries(scopedRuns, [
    'lcrPercent',
    'nsfrPercent',
    'loanToDepositPercent',
    'survivalHorizonDays',
  ]);
  const { data: fxRates = [] } = useFxRates();

  const trendData = (() => {
    if (!trendSeries) return [];
    const byDate = new Map<string, { asOfDate: string; lcr?: number; nsfr?: number }>();
    for (const obs of trendSeries.get('lcrPercent') ?? []) {
      byDate.set(obs.asOfDate, { ...(byDate.get(obs.asOfDate) ?? { asOfDate: obs.asOfDate }), lcr: obs.value });
    }
    for (const obs of trendSeries.get('nsfrPercent') ?? []) {
      byDate.set(obs.asOfDate, { ...(byDate.get(obs.asOfDate) ?? { asOfDate: obs.asOfDate }), nsfr: obs.value });
    }
    return Array.from(byDate.values()).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  })();

  const rateRows = fxRates
    .filter((r) => r.quote === 'USD' || r.base === 'USD')
    .slice(0, 6);

  const lcr = payloadOf<LcrResult>(results, 'Lcr');
  const nsfr = payloadOf<NsfrResult>(results, 'Nsfr');
  const ldr = payloadOf<LoanToDepositResult>(results, 'LoanToDeposit');
  const nii = payloadOf<NiiResult>(results, 'NiiSensitivity');
  const eve = payloadOf<EveResult>(results, 'EveSensitivity');
  const conc = payloadOf<ConcentrationResult>(results, 'Concentration');
  const prof = payloadOf<ProfitabilityResult>(results, 'ProfitabilityRatios');
  const survival = payloadOf<{ survivalHorizonDays: number; survivesFullHorizon: boolean }>(
    results,
    'SurvivalHorizon',
  );

  const band = (value: number | null, regulatory: number, internal: number): Tone =>
    value === null ? 'neutral' : value < regulatory ? 'danger' : value < internal ? 'warning' : 'success';

  // The four numbers a treasury desk checks first.
  const headline: Metric[] = [
    {
      id: 'lcr',
      label: 'LCR',
      value: formatPct(lcr?.lcrPercent ?? null),
      tone: band(lcr?.lcrPercent ?? null, 100, 130),
      href: '/liquidity-risk',
      icon: ShieldCheckIcon,
      trend: trendFrom(trendSeries?.get('lcrPercent'), true),
    },
    {
      id: 'nsfr',
      label: 'NSFR',
      value: formatPct(nsfr?.nsfrPercent ?? null),
      tone: band(nsfr?.nsfrPercent ?? null, 100, 110),
      href: '/liquidity-risk',
      icon: BarChartIcon,
      trend: trendFrom(trendSeries?.get('nsfrPercent'), true),
    },
    {
      id: 'survival',
      label: 'Survival horizon',
      value: survival ? `${survival.survivalHorizonDays}d` : 'No run',
      tone: survival == null ? 'neutral' : survival.survivalHorizonDays < 20 ? 'danger' : 'success',
      href: '/stress-testing',
      icon: ClockIcon,
      trend: trendFrom(trendSeries?.get('survivalHorizonDays'), true, 0),
    },
    {
      id: 'ldr',
      label: 'Loan-to-Deposit',
      value: formatPct(ldr?.ratioPercent ?? null),
      tone: ldr?.ratioPercent == null ? 'neutral' : ldr.ratioPercent > 90 ? 'danger' : ldr.ratioPercent > 80 ? 'warning' : 'success',
      href: '/liquidity-risk',
      icon: PieChartIcon,
      trend: trendFrom(trendSeries?.get('loanToDepositPercent'), false),
    },
  ];

  // Everything else, read as a label next to a number, not a card.
  const snapshot: Metric[] = [
    { id: 'nii', label: 'NII sensitivity', value: formatPct(nii?.niiSensitivityPercent ?? null, 2), tone: nii == null ? 'neutral' : Math.abs(nii.niiSensitivityPercent ?? 0) > 10 ? 'warning' : 'success', href: '/interest-rate-risk' },
    { id: 'eve', label: 'EVE sensitivity', value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2), tone: eve?.isBaselOutlier === true ? 'danger' : eve == null ? 'neutral' : 'success', href: '/interest-rate-risk' },
    { id: 'concentration', label: 'Largest depositor', value: formatPct(conc?.largestSharePercent ?? null), tone: conc?.largestSharePercent == null ? 'neutral' : conc.largestSharePercent > 10 ? 'danger' : conc.largestSharePercent > 5 ? 'warning' : 'success', href: '/concentration' },
    { id: 'npl', label: 'NPL ratio', value: formatPct(prof?.nplRatioPercent ?? null, 2), tone: prof?.nplRatioPercent == null ? 'neutral' : prof.nplRatioPercent > 5 ? 'danger' : prof.nplRatioPercent > 3 ? 'warning' : 'success', href: '/profitability' },
    { id: 'nim', label: 'Net interest margin', value: formatPct(prof?.netInterestMarginPercent ?? null, 2), tone: 'neutral', href: '/profitability' },
  ];

  const breaches = [...headline, ...snapshot].filter((m) => m.tone === 'danger');

  return (
    <>
      <ModuleHeader
        title="Dashboard"
        description="One run. Every number below reads off it."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={run?.reportingCurrency}
        metrics={[
          { label: 'In breach', value: String(breaches.length), tone: breaches.length > 0 ? 'danger' : 'success' },
          { label: 'Elements computed', value: run ? String(results.length) : '0' },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {headline.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.id}
                href={m.href}
                className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[13px] font-medium text-gray-500">{m.label}</p>
                  {Icon && (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[m.tone]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <p className={`mt-3 font-mono text-[26px] font-bold tracking-tight ${TONE_TEXT[m.tone]}`}>{m.value}</p>
                {m.trend && (
                  <p className={`mt-2 flex items-center gap-1 text-[11px] font-bold ${m.trend.good ? 'text-success' : 'text-danger'}`}>
                    {m.trend.text.startsWith('+') ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                    {m.trend.text}
                  </p>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Liquidity position trend</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">LCR and NSFR across every completed run for this scope</p>
            <div style={{ width: '100%', height: 260 }}>
              {trendData.length < 2 ? (
                <div className="flex h-full items-center justify-center px-8 text-center text-[12px] text-gray-400">
                  Only {trendData.length} as-of date{trendData.length === 1 ? '' : 's'} of history so far. A trend needs
                  more than one run at different dates to plot.
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="asOfDate" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(d: string) => formatDate(d)} />
                    <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} labelFormatter={(d: string) => formatDate(d)} contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <ReferenceLine y={100} stroke={CHART_COLORS.neutral} strokeDasharray="4 4" label={{ value: 'Regulatory minimum', fontSize: 10, fill: '#9AA1AE', position: 'insideTopLeft' }} />
                    <Line type="monotone" dataKey="lcr" name="LCR" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="nsfr" name="NSFR" stroke={CHART_COLORS.accent} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Rates &amp; curves</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">Current FX rates against USD</p>
            {rateRows.length === 0 ? (
              <p className="text-[12px] text-gray-400">No FX rates loaded.</p>
            ) : (
              <div className="space-y-3">
                {rateRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-[12px]">
                    <span className="font-mono font-medium text-gray-600">
                      {r.base}/{r.quote}
                    </span>
                    <span className="font-mono font-bold text-navy-900">{r.rate.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {breaches.length > 0 && (
          <div className="mt-6 rounded-2xl border border-danger/30 bg-danger/5 p-5">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">In breach</p>
            <div className="space-y-2">
              {breaches.map((b) => (
                <Link key={b.id} href={b.href} className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-navy-900 hover:underline">{b.label}</span>
                  <StatusBadge status={b.value} tone="danger" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Risk snapshot</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {snapshot.map((m) => (
              <Link key={m.id} href={m.href} className="block rounded-lg bg-gray-50 p-3 hover:bg-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.label}</p>
                <p className={`mt-1 text-[16px] font-bold ${TONE_TEXT[m.tone]}`}>{m.value}</p>
              </Link>
            ))}
          </div>
        </section>

        {prof && (
          <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Balance sheet shape</h2>
            <dl className="grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
              <Stat label="Total assets" value={<Amount value={prof.totalAssets} currency={currency} />} />
              <Stat label="Interest income" value={<Amount value={prof.interestIncome} currency={currency} />} />
              <Stat label="Interest expense" value={<Amount value={prof.interestExpense} currency={currency} />} />
              <Stat
                label="Net interest income"
                value={<Amount value={prof.netInterestIncome} currency={currency} colorBySign />}
              />
            </dl>
          </section>
        )}
      </ResultsFrame>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
