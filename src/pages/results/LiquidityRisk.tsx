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

import type { ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { GapLadderChart, GapLadderTable } from '@/components/results/GapLadder';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import type { LcrResult, LiquidityGapResult, LoanToDepositResult, NsfrResult } from '@/engine/liquidity';
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

  const lcr = payloadOf<LcrResult>(results, 'Lcr');
  const nsfr = payloadOf<NsfrResult>(results, 'Nsfr');
  const ldr = payloadOf<LoanToDepositResult>(results, 'LoanToDeposit');
  const gap = payloadOf<GapPayload>(results, 'LiquidityGap');

  return (
    <>
      <ModuleHeader
        title="Liquidity Risk"
        description="The Basel ratios with their components exposed, and the gap ladder on both a contractual and a behavioural basis."
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
            label: 'Encumbered, excluded',
            value: lcr ? String(Math.round(lcr.excludedEncumbered).toLocaleString()) : '—',
            tone: 'neutral',
          },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={['Lcr', 'Nsfr']} elementLabels={ELEMENT_LABELS}>
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
                  label="Excluded — under lien"
                  value={<Amount value={lcr.excludedEncumbered} currency={currency} />}
                />
              </dl>

              {lcr.excludedEncumbered > 0 && (
                <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                  Liens are applied as amounts, not flags. A bond of 500 carrying a lien of 200 contributes 300 of
                  HQLA — v1 counted it in full.
                </p>
              )}

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

              {ldr && (
                <>
                  <h3 className="mb-2 mt-6 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Loan-to-deposit
                  </h3>
                  <dl className="space-y-2 text-[12px]">
                    <Row label="Customer loans" value={<Amount value={ldr.loans} currency={currency} />} />
                    <Row label="Customer deposits" value={<Amount value={ldr.deposits} currency={currency} />} />
                    <Row
                      label="Ratio"
                      value={<span className="font-mono font-bold">{formatPct(ldr.ratioPercent)}</span>}
                      bold
                    />
                  </dl>
                  <p className="mt-3 rounded bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                    Loans and deposits are identified by their common-COA classification and restricted to customer
                    accounts, so internal, suspense and nostro balances do not inflate either leg.
                  </p>
                </>
              )}

              <Methodology text={methodologyOf(results, 'Nsfr')} />
            </section>
          )}
        </div>

        {gap && (
          <>
            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Gap ladder — contractual
              </h2>
              <p className="mb-4 text-[11px] text-gray-500">Every position on its contractual maturity date.</p>
              <GapLadderChart buckets={gap.contractual.buckets} currency={currency} />
            </section>

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Gap ladder — behavioural
              </h2>
              <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                Non-maturity deposits re-dated by their run-off profile: the core tier moves out along the ladder, the
                volatile tier stays in the front bucket. The two ladders differ because the model behind them differs —
                in v1 the toggle changed nothing.
              </p>
              <GapLadderChart buckets={gap.behavioural.buckets} currency={currency} />

              <div className="mt-6">
                <GapLadderTable
                  buckets={gap.behavioural.buckets}
                  currency={currency}
                  priorBuckets={gap.contractual.buckets}
                />
              </div>

              <Methodology text={methodologyOf(results, 'LiquidityGap')} />
            </section>

            {gap.runoff && <RunoffSummary runoff={gap.runoff} currency={currency} />}
          </>
        )}
      </ResultsFrame>
    </>
  );
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
          pattern. They are reported here rather than defaulted into core or volatile — inventing a split would be
          exactly the plausible-looking figure this platform refuses to produce.
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
