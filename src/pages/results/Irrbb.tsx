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
import { Link } from 'react-router-dom';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import type { EveResult, NiiResult } from '@/engine/irrbb';

export function Irrbb() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const nii = payloadOf<NiiResult>(results, 'NiiSensitivity');
  const eve = payloadOf<EveResult>(results, 'EveSensitivity');

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
            label: 'Shock applied',
            value: nii ? `${nii.shockBps > 0 ? '+' : ''}${nii.shockBps}bp` : '—',
          },
          {
            label: 'ΔNII',
            value: formatPct(nii?.niiSensitivityPercent ?? null, 2),
            tone: (nii?.deltaNii ?? 0) < 0 ? 'warning' : 'neutral',
          },
          {
            label: 'ΔEVE % of capital',
            value: formatPct(eve?.eveSensitivityPercentOfEquity ?? null, 2),
            tone: eve?.isBaselOutlier === true ? 'danger' : 'success',
          },
          {
            label: 'Duration gap',
            value: eve?.durationGap === null || eve === null ? '—' : `${eve.durationGap!.toFixed(2)} yrs`,
            tone: 'neutral',
          },
        ]}
        actions={
          <div className="flex gap-2">
            <Link
              to="/stress-testing"
              className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              Run all six shocks
            </Link>
            <Link
              to="/rules"
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
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Reading the gap</h2>
            <p className="text-[11px] leading-relaxed text-gray-600">
              A duration gap of <span className="font-mono font-bold text-navy-900">{eve.durationGap!.toFixed(2)}</span>{' '}
              years means assets reprice{' '}
              {eve.durationGap! > 0 ? 'more slowly than' : eve.durationGap! < 0 ? 'faster than' : 'in step with'}{' '}
              liabilities.{' '}
              {eve.durationGap! > 0
                ? 'A rate rise therefore reduces economic value: asset prices fall further than liability values do.'
                : eve.durationGap! < 0
                  ? 'A rate rise therefore adds economic value: liability values fall further than asset prices do.'
                  : 'The book is broadly immunised against a parallel move at this level of approximation.'}{' '}
              Duration is approximated per position rather than computed from full cash flows — ledger-grain data does
              not carry the schedule a full revaluation needs, which is the same constraint Oracle names when it
              prescribes non-cash-flow methods for this data shape.
            </p>
          </section>
        )}
      </ResultsFrame>
    </>
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
