/**
 * Profitability Ratios — screen 42.
 *
 * Margin, earning-asset efficiency and asset quality. The NPL block is the
 * [R2] addition: v1 had no credit-quality field at all, so a bank with a
 * five per cent NPL ratio and one with none looked identical on every
 * screen.
 *
 * Ratios that cannot be computed from the data loaded render as an em dash
 * with the reason, rather than as zero.
 */

import type { ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { RatioChart } from '@/components/ui/RatioChart';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import type { ProfitabilityResult } from '@/engine/profitability';

export function Profitability() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const p = payloadOf<ProfitabilityResult>(results, 'ProfitabilityRatios');

  return (
    <>
      <ModuleHeader
        title="Profitability Ratios"
        description="Margin, earning-asset efficiency and asset quality, from the same run as the risk figures."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          { label: 'Net interest margin', value: formatPct(p?.netInterestMarginPercent ?? null, 2) },
          {
            label: 'NPL ratio',
            value: formatPct(p?.nplRatioPercent ?? null, 2),
            tone:
              p?.nplRatioPercent == null
                ? 'neutral'
                : p.nplRatioPercent > 5
                  ? 'danger'
                  : p.nplRatioPercent > 3
                    ? 'warning'
                    : 'success',
          },
          {
            label: 'NPL coverage',
            value: formatPct(p?.nplCoverageRatioPercent ?? null),
            tone:
              p?.nplCoverageRatioPercent == null ? 'neutral' : p.nplCoverageRatioPercent < 100 ? 'warning' : 'success',
          },
          {
            label: 'Non-earning assets',
            value: formatPct(p?.nonEarningAssetRatioPercent ?? null, 2),
            tone: (p?.nonEarningAssetRatioPercent ?? 0) > 15 ? 'warning' : 'neutral',
          },
        ]}
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['ProfitabilityRatios']}
        elementLabels={{ ProfitabilityRatios: 'profitability ratios' }}
      >
        {p && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Earnings</h2>
                <dl className="space-y-2 text-[12px]">
                  <Row label="Total assets" value={<Amount value={p.totalAssets} currency={currency} />} />
                  <Row label="Interest income" value={<Amount value={p.interestIncome} currency={currency} />} />
                  <Row label="Interest expense" value={<Amount value={p.interestExpense} currency={currency} />} />
                  <Row
                    label="Net interest income"
                    value={<Amount value={p.netInterestIncome} currency={currency} colorBySign />}
                    bold
                  />
                  <Row
                    label="Net interest margin"
                    value={<span className="font-mono font-bold">{formatPct(p.netInterestMarginPercent, 2)}</span>}
                    bold
                  />
                  <Row
                    label="Interest income as % of total income"
                    value={<span className="font-mono">{formatPct(p.interestIncomeToTotalIncomePercent, 1)}</span>}
                  />
                  <Row
                    label="Interest-bearing assets to liabilities"
                    value={
                      <span className="font-mono">
                        {p.interestBearingAssetsToLiabilities === null
                          ? '—'
                          : p.interestBearingAssetsToLiabilities.toFixed(2) + '×'}
                      </span>
                    }
                  />
                </dl>
              </section>

              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Asset quality</h2>
                  {p.nplRatioPercent !== null && (
                    <StatusBadge
                      status={p.nplRatioPercent > 5 ? 'Above 5% threshold' : 'Within threshold'}
                      tone={p.nplRatioPercent > 5 ? 'danger' : 'success'}
                    />
                  )}
                </div>

                <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">
                  {formatPct(p.nplRatioPercent, 2)}
                </p>

                <dl className="space-y-2 text-[12px]">
                  <Row
                    label="NPL coverage ratio"
                    value={<span className="font-mono font-bold">{formatPct(p.nplCoverageRatioPercent)}</span>}
                  />
                  <Row
                    label="Non-earning asset ratio"
                    value={<span className="font-mono">{formatPct(p.nonEarningAssetRatioPercent, 2)}</span>}
                  />
                  <Row
                    label="Loan-to-deposit"
                    value={<span className="font-mono">{formatPct(p.loanToDepositPercent)}</span>}
                  />
                </dl>

                <p className="mt-4 rounded bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
                  Anything classified Substandard or worse counts as non-performing, following the CBN classification.
                  Coverage compares provisions held against that balance — below 100% means the provisioning does not
                  yet cover the impaired book.
                </p>
              </section>
            </div>

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Ratios against their thresholds
              </h2>
              <RatioChart
                data={[
                  { label: 'NIM', value: p.netInterestMarginPercent ?? 0 },
                  { label: 'NPL', value: p.nplRatioPercent ?? 0 },
                  { label: 'Non-earning', value: p.nonEarningAssetRatioPercent ?? 0 },
                ]}
                thresholds={[
                  { label: 'NPL regulatory ceiling', value: 5, kind: 'regulatory' },
                  { label: 'Internal watch', value: 3, kind: 'internal' },
                ]}
                variant="bar"
                seriesName="Ratio"
              />
              <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
                The thresholds drawn are the NPL ones — they do not apply to NIM or the non-earning ratio, which have
                no regulatory floor. Shown together because the three move against each other: a book that lends
                aggressively lifts NIM and NPL at once.
              </p>
            </section>

            {p.notes.length > 0 && (
              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  What these figures assume
                </h2>
                <ul className="space-y-2 text-[11px] leading-relaxed text-gray-600">
                  {p.notes.map((note, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden="true" className="text-gray-300">
                        ·
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </ResultsFrame>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${bold ? 'border-t border-gray-100 pt-2 font-bold text-navy-900' : ''}`}
    >
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
