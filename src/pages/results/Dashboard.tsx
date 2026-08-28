import type { ComponentType, ReactNode } from 'react';
import { Link } from 'wouter';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_STROKE, CHART_TOOLTIP_STYLE } from '@/components/results/chartStyle';
import { ShieldCheckIcon, BarChartIcon, ClockIcon, PieChartIcon, ArrowUpIcon, ArrowDownIcon, type IconProps } from '@/components/icons/Icons';
import { useScope } from '@/context/ScopeContext';
import { useFxRates, useYieldCurves, useEconomicIndicators, usePositions } from '@/lib/hooks';
import { useRuns } from '@/lib/runHooks';
import { useKriSeries } from '@/lib/limitHooks';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import { buildFxTable } from '@/engine/fx';
import { computeAllShocks } from '@/engine/irrbb';
import { defaultLadder } from '@/engine/buckets';
import type { KriObservation } from '@/engine/kri';
import type { ConcentrationResult, LcrResult, LoanToDepositResult, NsfrResult } from '@/engine/liquidity';
import type { EveResult, NiiResult } from '@/engine/irrbb';
import type { ProfitabilityResult } from '@/engine/profitability';

/** Which curve and policy-rate indicator stand in for "the market" at each scope — Nigeria is the default at Group level since it has the fullest data. */
const MARKET_BY_CURRENCY: Record<string, { curveCode: string; indicatorCode?: string; indicatorLabel?: string }> = {
  NGN: { curveCode: 'NGN-NIBOR', indicatorCode: 'NG-MPR', indicatorLabel: 'CBN MPR' },
  GHS: { curveCode: 'GHS-GHREF', indicatorCode: 'GH-MPR', indicatorLabel: 'BoG MPR' },
  XOF: { curveCode: 'XOF-BCEAO' },
};

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
    'niiSensitivityPercent',
    'eveSensitivityPercentOfEquity',
    'netInterestMarginPercent',
  ]);
  const { data: fxRates = [] } = useFxRates();
  const { data: yieldCurves = [] } = useYieldCurves();
  const { data: indicators = [] } = useEconomicIndicators();

  const marketCurrency = affiliateCode !== 'GROUP' && affiliate ? affiliate.functionalCurrency : 'NGN';
  const market = MARKET_BY_CURRENCY[marketCurrency];
  const localCurve = market ? yieldCurves.find((c) => c.code === market.curveCode) : undefined;
  const sofrCurve = yieldCurves.find((c) => c.code === 'USD-SOFR');
  const policyIndicator = market?.indicatorCode ? indicators.find((i) => i.code === market.indicatorCode) : undefined;

  const policyRateRow = (() => {
    if (!policyIndicator || policyIndicator.observations.length === 0) return null;
    const obs = [...policyIndicator.observations].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
    const latest = obs[obs.length - 1]!;
    const prior = obs.length > 1 ? obs[obs.length - 2] : undefined;
    const delta = prior ? latest.value - prior.value : null;
    return {
      label: 'Policy Rate',
      sublabel: market?.indicatorLabel ?? policyIndicator.name,
      value: `${latest.value.toFixed(2)}%`,
      delta: delta !== null && Math.abs(delta) > 0.001 ? delta : null,
    };
  })();

  const marketRows = [
    policyRateRow,
    localCurve?.terms.find((t) => t.tenorDays <= 1)
      ? {
          label: 'Interbank Rate',
          sublabel: 'Overnight',
          value: `${localCurve.terms.find((t) => t.tenorDays <= 1)!.ratePercent.toFixed(2)}%`,
          delta: null,
        }
      : null,
    localCurve && localCurve.terms.length > 0
      ? {
          label: `${localCurve.currency} Sovereign Yield`,
          sublabel: `${localCurve.terms[localCurve.terms.length - 1]!.label} Benchmark`,
          value: `${localCurve.terms[localCurve.terms.length - 1]!.ratePercent.toFixed(2)}%`,
          delta: null,
        }
      : null,
    sofrCurve?.terms.find((t) => t.tenorDays <= 1)
      ? {
          label: 'SOFR',
          sublabel: 'Overnight',
          value: `${sofrCurve.terms.find((t) => t.tenorDays <= 1)!.ratePercent.toFixed(2)}%`,
          delta: null,
        }
      : null,
  ].filter((r): r is { label: string; sublabel: string; value: string; delta: number | null } => r !== null);

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

  // All six BCBS supervisory rate shocks, recomputed from this scope's own positions at the run's as-of date.
  const shockPositionsScope = run?.affiliateCode ?? affiliateCode;
  const { data: shockPositions = [] } = usePositions(shockPositionsScope, run?.asOfDate ?? undefined);
  const shockRows = useMemo(() => {
    if (!run || shockPositions.length === 0) return [];
    const ctx = { asOfDate: run.asOfDate, reportingCurrency: currency, fx: buildFxTable(currency, fxRates, run.asOfDate), tier1Capital: null };
    const { results: shockResults } = computeAllShocks(shockPositions, ctx, defaultLadder('RepricingGap'));
    return Object.values(shockResults)
      .filter((r) => r.eve.eveSensitivityPercentOfEquity !== null)
      .map((r) => ({ shock: r.label, evePercent: r.eve.eveSensitivityPercentOfEquity! }));
  }, [run, shockPositions, currency, fxRates]);
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
  const baseSnapshot: Metric[] = [
    { id: 'nii', label: 'NII sensitivity', value: formatPct(nii?.niiSensitivityPercent ?? null, 2), tone: nii == null ? 'neutral' : Math.abs(nii.niiSensitivityPercent ?? 0) > 10 ? 'warning' : 'success', href: '/interest-rate-risk' },
    { id: 'eve', label: 'EVE sensitivity', value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2), tone: eve?.isBaselOutlier === true ? 'danger' : eve == null ? 'neutral' : 'success', href: '/interest-rate-risk' },
    { id: 'concentration', label: 'Largest depositor', value: formatPct(conc?.largestSharePercent ?? null), tone: conc?.largestSharePercent == null ? 'neutral' : conc.largestSharePercent > 10 ? 'danger' : conc.largestSharePercent > 5 ? 'warning' : 'success', href: '/concentration' },
    { id: 'npl', label: 'NPL ratio', value: formatPct(prof?.nplRatioPercent ?? null, 2), tone: prof?.nplRatioPercent == null ? 'neutral' : prof.nplRatioPercent > 5 ? 'danger' : prof.nplRatioPercent > 3 ? 'warning' : 'success', href: '/profitability' },
    { id: 'nim', label: 'Net interest margin', value: formatPct(prof?.netInterestMarginPercent ?? null, 2), tone: 'neutral', href: '/profitability' },
  ];

  const breaches = [...headline, ...baseSnapshot].filter((m) => m.tone === 'danger');

  const snapshot: Metric[] = [
    ...baseSnapshot,
    {
      id: 'inbreach',
      label: 'In breach',
      value: String(breaches.length),
      tone: breaches.length > 0 ? 'danger' : 'success',
      href: '/limits',
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Dashboard"
        description="One run. Every number below reads off it."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={run?.reportingCurrency}
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
          <section className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Rate shock sensitivity — ΔEVE by scenario</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">Capital impact under all six BCBS supervisory shocks, this scope's own book — dashed lines mark the ±15% outlier test</p>
            <div className="min-h-[260px] flex-1">
              {shockRows.length === 0 ? (
                <div className="flex h-full items-center justify-center px-8 text-center text-[12px] text-gray-400">
                  No run selected yet.
                </div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={shockRows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="shock" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={CHART_TOOLTIP_STYLE} />
                    <ReferenceLine y={15} stroke={CHART_COLORS.neutral} strokeDasharray="4 4" />
                    <ReferenceLine y={-15} stroke={CHART_COLORS.neutral} strokeDasharray="4 4" />
                    <Bar dataKey="evePercent" name="ΔEVE % of equity" radius={[4, 4, 4, 4]}>
                      {shockRows.map((r) => (
                        <Cell key={r.shock} fill={Math.abs(r.evePercent) > 15 ? 'hsl(0, 72%, 51%)' : CHART_COLORS.primary} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Market &amp; Rate Monitor</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">{marketCurrency} benchmarks, SOFR, and FX against USD</p>
            {marketRows.length === 0 && rateRows.length === 0 ? (
              <p className="text-[12px] text-gray-400">No market data loaded.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {marketRows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-[12px] font-bold text-navy-900">{r.label}</p>
                      <p className="text-[10px] text-gray-400">{r.sublabel}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[13px] font-bold text-navy-900">{r.value}</p>
                      {r.delta !== null && (
                        <p className={`flex items-center justify-end gap-0.5 text-[10px] font-bold ${r.delta > 0 ? 'text-success' : 'text-danger'}`}>
                          {r.delta > 0 ? <ArrowUpIcon className="h-2.5 w-2.5" /> : <ArrowDownIcon className="h-2.5 w-2.5" />}
                          {r.delta > 0 ? '+' : ''}{r.delta.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {rateRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-[12px] font-bold text-navy-900">{r.base}/{r.quote}</p>
                      <p className="text-[10px] text-gray-400">Official rate</p>
                    </div>
                    <span className="font-mono text-[13px] font-bold text-navy-900">{r.rate.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Risk snapshot</h2>
            <div className="grid grid-cols-3 gap-3">
              {snapshot.map((m) => (
                <Link key={m.id} href={m.href} className="block rounded-lg bg-gray-50 p-3 hover:bg-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.label}</p>
                  <p className={`mt-1 text-[16px] font-bold ${TONE_TEXT[m.tone]}`}>{m.value}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Active Breaches</h2>
            {breaches.length === 0 ? (
              <p className="text-[12px] text-gray-400">No active breaches for this scope.</p>
            ) : (
              <div className="space-y-1">
                {breaches.map((b) => (
                  <Link
                    key={b.id}
                    href={b.href}
                    className="flex items-center justify-between rounded-lg px-1 py-2 hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-mono text-[16px] font-bold text-danger">{b.value}</p>
                      <p className="text-[11px] text-gray-500">{b.label}</p>
                    </div>
                    <StatusBadge status="Breach" tone="danger" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

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
