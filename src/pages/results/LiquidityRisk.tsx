/**
 * Liquidity Risk — screen 37.
 *
 * LCR, NSFR and loan-to-deposit with their components exposed, plus the
 * contractual and behavioural gap ladders side by side.
 *
 * Side by side, not a toggle. v1 had a Behavioural/Contractual switch that
 * rendered identical data in both positions, because no behavioural model
 * existed behind it (defect D-05). Showing both at once makes the difference
 * the subject rather than something you have to flip back and forth to see.
 */

import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { GapLadderTable } from '@/components/results/GapLadder';
import { CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_STROKE, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE } from '@/components/results/chartStyle';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useFxRates, usePositions } from '@/lib/hooks';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { formatAmount, formatPct } from '@/lib/format';
import { buildFxTable } from '@/engine/fx';
import { computeDepositsByAffiliate, type LcrResult, type LiquidityGapResult, type LoanToDepositResult, type NsfrResult } from '@/engine/liquidity';
import type { FxPositionResult } from '@/engine/profitability';
import type { DepositRunoffResult } from '@/engine/behavioural';

interface GapPayload {
  contractual: LiquidityGapResult;
  behavioural: LiquidityGapResult;
  runoff: DepositRunoffResult;
}

export function LiquidityRisk() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const [gapView, setGapView] = useState<'Behavioural' | 'Contractual'>('Behavioural');

  const { data: fxRates = [] } = useFxRates();
  const { data: runPositions = [] } = usePositions(run?.affiliateCode, run?.asOfDate);

  const lcr = payloadOf<LcrResult>(results, 'Lcr');
  const nsfr = payloadOf<NsfrResult>(results, 'Nsfr');
  const ldr = payloadOf<LoanToDepositResult>(results, 'LoanToDeposit');
  const gap = payloadOf<GapPayload>(results, 'LiquidityGap');
  const fxPosition = payloadOf<FxPositionResult>(results, 'FxPosition');

  const depositsByAffiliate =
    run && runPositions.length > 0
      ? computeDepositsByAffiliate(runPositions, {
          asOfDate: run.asOfDate,
          reportingCurrency: currency,
          fx: buildFxTable('USD', fxRates, run.asOfDate),
        })
      : [];

  const activeGap = gapView === 'Contractual' ? gap?.contractual : gap?.behavioural;
  const priorGap = gapView === 'Contractual' ? gap?.behavioural : gap?.contractual;

  return (
    <>
      <ModuleHeader
        title="Liquidity Risk"
        description="Gap analysis, coverage ratios and funding concentration."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'LCR',
            value: formatPct(lcr?.lcrPercent ?? null),
            tone: (lcr?.lcrPercent ?? 200) < 100 ? 'danger' : (lcr?.lcrPercent ?? 200) < 130 ? 'warning' : 'success',
          },
          {
            label: 'NSFR',
            value: formatPct(nsfr?.nsfrPercent ?? null),
            tone: (nsfr?.nsfrPercent ?? 200) < 100 ? 'danger' : 'success',
          },
          {
            label: 'Loan-to-deposit',
            value: formatPct(ldr?.ratioPercent ?? null),
            tone: (ldr?.ratioPercent ?? 0) > 90 ? 'warning' : 'success',
          },
          {
            label: 'Largest affiliate deposit share',
            value: depositsByAffiliate[0] ? formatPct(depositsByAffiliate[0].sharePercent) : '—',
          },
        ]}
        actions={
          <Link
            href="/rules"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors"
          >
            Configure Rules
          </Link>
        }
      />

      <ResultsFrame {...frameProps(selected)} requires={['Lcr', 'Nsfr']} elementLabels={ELEMENT_LABELS}>
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {activeGap && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Maturity gap analysis</h2>
                  <p className="mt-1 text-[11px] font-medium text-gray-400">Assets vs. liabilities by maturity bucket</p>
                </div>
                <div className="flex rounded-lg border border-gray-200 p-0.5">
                  {(['Behavioural', 'Contractual'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGapView(v)}
                      className={`rounded-md px-3 py-1 text-[11px] font-bold transition-colors ${
                        gapView === v ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={activeGap.buckets} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={CHART_AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatAmount(v, currency)}
                    />
                    <Tooltip formatter={(value: number, name: string) => [formatAmount(value, currency), name]} contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <ReferenceLine y={0} stroke={CHART_COLORS.neutral} strokeWidth={1} />
                    <Bar dataKey="assets" name="Assets" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="liabilities" name="Liabilities" fill={CHART_COLORS.neutral} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="gap" name="Net gap" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Deposit concentration by affiliate</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">Share of Group deposit funding</p>
            {depositsByAffiliate.length === 0 ? (
              <p className="text-[12px] text-gray-400">Only meaningful at Group scope with more than one affiliate's deposits in the run.</p>
            ) : (
              <div className="space-y-4">
                {depositsByAffiliate.slice(0, 6).map((d) => (
                  <div key={d.affiliateCode}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-bold text-navy-900">{d.affiliateCode}</span>
                      <span className="font-mono font-bold text-navy-900">{formatPct(d.sharePercent)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-navy-700"
                        style={{ width: `${Math.min(100, d.sharePercent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {fxPosition && fxPosition.lines.length > 0 && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Cross-currency funding position</h2>
            <p className="mb-4 text-[11px] font-medium text-gray-400">Assets and liabilities by settlement currency</p>
            <FxPositionTable lines={fxPosition.lines} currency={currency} />
          </section>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {lcr && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Liquidity Coverage Ratio
                </h2>
                <StatusBadge
                  status={lcr.lcrPercent === null ? 'Not computable' : lcr.lcrPercent >= 100 ? 'Above 100%' : 'Below 100%'}
                  tone={lcr.lcrPercent === null ? 'neutral' : lcr.lcrPercent >= 100 ? 'success' : 'danger'}
                />
              </div>

              <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">{formatPct(lcr.lcrPercent)}</p>

              <dl className="space-y-2 text-[12px]">
                <Row label="High-quality liquid assets" value={<Amount value={lcr.hqla} currency={currency} />} bold />
                {Object.entries(lcr.hqlaByLevel).map(([level, amount]) => (
                  <Row key={level} label={level} value={<Amount value={amount} currency={currency} />} indent />
                ))}
                <Row label="Gross 30-day outflows" value={<Amount value={lcr.grossOutflows} currency={currency} />} />
                <Row label="Gross inflows" value={<Amount value={lcr.grossInflows} currency={currency} />} indent />
                <Row
                  label="Inflow cap (75% of outflows)"
                  value={<Amount value={lcr.inflowCap} currency={currency} />}
                  indent
                />
                <Row
                  label="Eligible inflows"
                  value={<Amount value={lcr.eligibleInflows} currency={currency} />}
                  indent
                />
                <Row
                  label="Net cash outflows"
                  value={<Amount value={lcr.netCashOutflows} currency={currency} />}
                  bold
                />
                <Row
                  label="Excluded, under lien"
                  value={<Amount value={lcr.excludedEncumbered} currency={currency} />}
                />
              </dl>

              <Methodology text={methodologyOf(results, 'Lcr')} />
            </section>
          )}

          {nsfr && (
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Net Stable Funding Ratio
                </h2>
                <StatusBadge
                  status={nsfr.nsfrPercent === null ? 'Not computable' : nsfr.nsfrPercent >= 100 ? 'Above 100%' : 'Below 100%'}
                  tone={nsfr.nsfrPercent === null ? 'neutral' : nsfr.nsfrPercent >= 100 ? 'success' : 'danger'}
                />
              </div>

              <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">{formatPct(nsfr.nsfrPercent)}</p>

              <dl className="space-y-2 text-[12px]">
                <Row
                  label="Available stable funding"
                  value={<Amount value={nsfr.availableStableFunding} currency={currency} />}
                  bold
                />
                <Row
                  label="Required stable funding"
                  value={<Amount value={nsfr.requiredStableFunding} currency={currency} />}
                  bold
                />
                <Row
                  label="Surplus"
                  value={
                    <Amount
                      value={nsfr.availableStableFunding - nsfr.requiredStableFunding}
                      currency={currency}
                      colorBySign
                    />
                  }
                />
              </dl>

              <Methodology text={methodologyOf(results, 'Nsfr')} />
            </section>
          )}
        </div>

        {activeGap && (
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              {gapView} ladder as numbers
              <InfoButton label="Why this table exists">A chart is not an audit trail.</InfoButton>
            </h2>
            <GapLadderTable buckets={activeGap.buckets} currency={currency} priorBuckets={priorGap?.buckets} />
            <Methodology text={methodologyOf(results, 'LiquidityGap')} />
          </section>
        )}

        {gap?.runoff && <RunoffSummary runoff={gap.runoff} currency={currency} />}
      </ResultsFrame>
    </>
  );
}

function FxPositionTable({ lines, currency }: { lines: FxPositionResult['lines']; currency: string }) {
  const columns: ResultColumn<FxPositionResult['lines'][number]>[] = [
    { key: 'currency', header: 'Currency', render: (l) => <span className="font-mono font-bold text-navy-900">{l.currency}</span> },
    { key: 'assets', header: 'Assets', align: 'right', render: (l) => <Amount value={l.assets} currency={currency} /> },
    { key: 'liabilities', header: 'Liabilities', align: 'right', render: (l) => <Amount value={l.liabilities} currency={currency} /> },
    { key: 'net', header: 'Net position', align: 'right', render: (l) => <Amount value={l.netOpenPosition} currency={currency} colorBySign /> },
  ];
  return <ResultTable rows={lines} columns={columns} rowKey={(l) => l.currency} />;
}

function RunoffSummary({ runoff, currency }: { runoff: DepositRunoffResult; currency: string }) {
  const columns: ResultColumn<DepositRunoffResult['lines'][number]>[] = [
    { key: 'product', header: 'Product', render: (l) => l.productClass },
    { key: 'tag', header: 'Behavioural tag', render: (l) => <StatusBadge status={l.behaviouralTag} tone="neutral" /> },
    { key: 'balance', header: 'Balance', align: 'right', render: (l) => <Amount value={l.balance} currency={currency} /> },
    { key: 'core', header: 'Core', align: 'right', render: (l) => <Amount value={l.coreAmount} currency={currency} /> },
    {
      key: 'volatile',
      header: 'Volatile',
      align: 'right',
      render: (l) => <Amount value={l.volatileAmount} currency={currency} />,
    },
    {
      key: 'corePct',
      header: 'Core %',
      align: 'right',
      render: (l) => <span className="font-mono">{formatPct(l.corePercent)}</span>,
    },
    { key: 'activity', header: 'Activity', render: (l) => <StatusBadge status={l.activity} tone="neutral" /> },
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
        Deposit core and volatile split
      </h2>

      <dl className="mb-4 grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total deposits</dt>
          <dd>
            <Amount value={runoff.totalDeposits} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Core</dt>
          <dd>
            <Amount value={runoff.totalCore} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Volatile</dt>
          <dd>
            <Amount value={runoff.totalVolatile} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Unmodelled</dt>
          <dd>
            <Amount value={runoff.unmodelled} currency={currency} />
          </dd>
        </div>
      </dl>

      {runoff.unmodelled > 0 && (
        <p className="mb-4 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-navy-900">
          <Amount value={runoff.unmodelled} currency={currency} /> of deposits have a behavioural tag with no matching
          pattern, reported here rather than defaulted into core or volatile.
        </p>
      )}

      <ResultTable rows={runoff.lines.slice(0, 40)} columns={columns} rowKey={(l) => l.positionId} />
    </section>
  );
}

const ELEMENT_LABELS = { Lcr: 'the liquidity coverage ratio', Nsfr: 'the net stable funding ratio' } as const;

function Row({
  label,
  value,
  bold,
  indent,
}: {
  label: string;
  value: ReactNode;
  bold?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${bold ? 'border-t border-gray-100 pt-2 font-bold text-navy-900' : ''}`}
    >
      <dt className={indent ? 'pl-4 text-gray-400' : 'text-gray-500'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Methodology({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">{text}</p>;
}
