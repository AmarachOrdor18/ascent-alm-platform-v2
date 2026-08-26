/**
 * Stress Testing — screen 34.
 *
 * The regulatory battery, as opposed to the free-form exploration on the
 * What-If Builder: the six BCBS supervisory shocks run together, the outlier
 * test applied to each, and the liquidity survival horizon under a severe
 * run. Nothing here is configurable by design — the shocks are prescribed,
 * and a screen that let you tune them would be answering a different
 * question.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, useFxRates, usePositions, resolveSingleAffiliate } from '@/lib/hooks';
import { buildFxTable, missingRates } from '@/engine/fx';
import { computeAllShocks, computeEquity } from '@/engine/irrbb';
import { defaultLadder } from '@/engine/buckets';
import {
  computeCounterbalancingCapacity,
  computeSurvivalHorizon,
  severeOutflowProfile,
  type SurvivalDay,
} from '@/engine/stress';
import { computeLcr } from '@/engine/liquidity';
import { availableAsOfDates } from '@/engine/vintage';
import { formatPct } from '@/lib/format';

interface ShockRow {
  name: string;
  label: string;
  deltaNii: number;
  niiPercent: number | null;
  deltaEve: number | null;
  evePercent: number | null;
  isOutlier: boolean | null;
}

export function StressTesting() {
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: fxRates = [] } = useFxRates();

  const affiliate = resolveSingleAffiliate(affiliates, affiliateCode);
  const dates = affiliate ? availableAsOfDates(batches, affiliate.code) : [];
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const effectiveDate = asOfDate ?? dates[0] ?? '2026-07-31';
  const currency = affiliate?.functionalCurrency ?? 'USD';
  const { data: positions = [] } = usePositions(affiliate?.code, effectiveDate);

  const fx = useMemo(() => buildFxTable(currency, fxRates, effectiveDate), [currency, fxRates, effectiveDate]);
  const missingFx = useMemo(
    () => missingRates(positions.map((p) => p.currency), currency, fx),
    [positions, currency, fx],
  );

  const analysis = useMemo(() => {
    if (positions.length === 0 || missingFx.length > 0) return null;

    const ctx = { asOfDate: effectiveDate, reportingCurrency: currency, fx, tier1Capital: null };
    const equity = computeEquity(positions, ctx);
    const { results, worstCase } = computeAllShocks(positions, ctx, defaultLadder('RepricingGap'));

    const rows: ShockRow[] = Object.entries(results).map(([name, r]) => ({
      name,
      label: r.label,
      deltaNii: r.nii.deltaNii,
      niiPercent: r.nii.niiSensitivityPercent,
      deltaEve: r.eve.deltaEve,
      evePercent: r.eve.eveSensitivityPercentOfEquity,
      isOutlier: r.eve.isBaselOutlier,
    }));

    const liqCtx = { asOfDate: effectiveDate, reportingCurrency: currency, fx };
    const lcr = computeLcr(positions, liqCtx);
    const stressedLcr = computeLcr(positions, liqCtx, { runoffMultiplier: 2, hqlaHaircutPercent: 10 });
    const capacity = computeCounterbalancingCapacity(positions, liqCtx, 10);
    const survival = computeSurvivalHorizon(
      capacity.total,
      severeOutflowProfile(stressedLcr.grossOutflows * 2),
      liqCtx,
    );

    return { rows, worstCase, equity, capacity, survival, lcr, stressedLcr, capitalBasis: results };
  }, [positions, missingFx, effectiveDate, currency, fx]);

  const worstRow = analysis?.rows.find((r) => r.name === analysis.worstCase?.name) ?? null;
  const outliers = analysis?.rows.filter((r) => r.isOutlier === true) ?? [];

  const columns: ResultColumn<ShockRow>[] = [
    { key: 'label', header: 'Supervisory shock', render: (r) => r.label },
    {
      key: 'deltaNii',
      header: 'ΔNII',
      align: 'right',
      render: (r) => <Amount value={r.deltaNii} currency={currency} colorBySign />,
      compareValue: (r) => r.deltaNii,
    },
    {
      key: 'niiPercent',
      header: 'ΔNII %',
      align: 'right',
      render: (r) => <span className="font-mono">{formatPct(r.niiPercent, 2)}</span>,
    },
    {
      key: 'deltaEve',
      header: 'ΔEVE',
      align: 'right',
      render: (r) => <Amount value={r.deltaEve} currency={currency} colorBySign />,
      compareValue: (r) => r.deltaEve,
    },
    {
      key: 'evePercent',
      header: 'ΔEVE % of capital',
      align: 'right',
      render: (r) => <span className="font-mono">{formatPct(r.evePercent, 2)}</span>,
    },
    {
      key: 'outlier',
      header: '15% test',
      render: (r) =>
        r.isOutlier === null ? (
          <span className="text-gray-400" title="No capital figure available">
            —
          </span>
        ) : (
          <StatusBadge status={r.isOutlier ? 'Outlier' : 'Pass'} tone={r.isOutlier ? 'danger' : 'success'} />
        ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Stress Testing"
        description="The six BCBS supervisory shocks and the severe liquidity run — the prescribed battery, not a sandbox."
        asOfDate={effectiveDate}
        scope={affiliate?.name ?? 'No affiliate'}
        currency={currency}
        metrics={[
          {
            label: 'Worst shock (EVE)',
            value: worstRow?.label ?? '—',
            tone: outliers.length > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Worst ΔEVE % of capital',
            value: formatPct(worstRow?.evePercent ?? null, 2),
            tone: worstRow?.isOutlier ? 'danger' : 'success',
          },
          {
            label: 'Shocks failing 15% test',
            value: analysis ? `${outliers.length} of ${analysis.rows.length}` : '—',
            tone: outliers.length > 0 ? 'danger' : 'success',
          },
          {
            label: 'Survival horizon',
            value: analysis ? `${analysis.survival.survivalHorizonDays} days` : '—',
            tone: (analysis?.survival.survivalHorizonDays ?? 30) < 20 ? 'danger' : 'success',
          },
        ]}
        actions={
          dates.length > 1 && (
            <select
              value={effectiveDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              aria-label="As-at date"
              className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )
        }
      />

      {positions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[12px] text-gray-500">
          No committed positions for {affiliate?.name ?? 'this affiliate'} as at {effectiveDate}.
        </p>
      ) : missingFx.length > 0 ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-10 text-center">
          <p className="text-[12px] font-bold text-danger">
            No {currency} rate for {missingFx.join(', ')} as at {effectiveDate}.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-gray-600">
            A stress result that quietly converted those balances at 1.0 would be indefensible. Load the rates on the
            FX Rates screen and this recomputes.
          </p>
        </div>
      ) : (
        analysis && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-baseline justify-between">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Interest rate — six supervisory shocks
                  </h2>
                  <InfoButton label="Why balance-sheet equity">
                    The capital basis is balance-sheet equity because no Tier 1 figure has been supplied; loading one
                    on the affiliate record changes the denominator and can change the verdict.
                  </InfoButton>
                </div>
                <p className="text-[11px] text-gray-500">
                  Capital basis: balance-sheet equity of{' '}
                  <Amount value={analysis.equity} currency={currency} />
                </p>
              </div>

              <ResultTable
                rows={analysis.rows}
                columns={columns}
                rowKey={(r) => r.name}
                caption="BCBS 368 standardised interest rate shocks. The 15% test compares ΔEVE against the capital basis named above."
              />

              <div
                className={
                  outliers.length > 0
                    ? 'mt-4 rounded-lg border border-warning/30 bg-warning/5 p-4 text-[11px] leading-relaxed text-navy-900'
                    : 'mt-4 rounded-lg bg-gray-50 p-4 text-[11px] leading-relaxed text-gray-600'
                }
              >
                {outliers.length > 0 ? (
                  <>
                    <span className="font-bold">
                      {outliers.length === 1 ? 'One shock' : `${outliers.length} shocks`} breach the 15% outlier
                      threshold
                    </span>{' '}
                    — {outliers.map((o) => o.label).join(', ')}. Under BCBS 368 that makes the bank an outlier and
                    invites supervisory scrutiny of the banking-book position.
                  </>
                ) : (
                  <>
                    No shock moves economic value by more than 15% of capital. The book passes the outlier test on
                    every prescribed scenario.
                  </>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-1.5">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Liquidity — severe run
                </h2>
                <InfoButton label="Methodology">{analysis.survival.methodology}</InfoButton>
              </div>

              <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat
                  label="Unencumbered HQLA"
                  value={<Amount value={analysis.capacity.unencumberedHqla} currency={currency} />}
                />
                <Stat
                  label="Committed lines"
                  value={<Amount value={analysis.capacity.committedLinesAvailable} currency={currency} />}
                />
                <Stat
                  label="Other marketable"
                  value={<Amount value={analysis.capacity.otherMarketableAssets} currency={currency} />}
                />
                <Stat
                  label="Counterbalancing capacity"
                  value={<Amount value={analysis.capacity.total} currency={currency} />}
                />
              </dl>

              <SurvivalTimeline timeline={analysis.survival.timeline} currency={currency} />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusBadge
                  status={
                    analysis.survival.survivesFullHorizon
                      ? 'Survives 30 days'
                      : `Buffer exhausted on day ${analysis.survival.survivalHorizonDays}`
                  }
                  tone={analysis.survival.survivesFullHorizon ? 'success' : 'danger'}
                />
                <span className="text-[11px] text-gray-500">
                  LCR falls from {formatPct(analysis.lcr.lcrPercent)} to {formatPct(analysis.stressedLcr.lcrPercent)}{' '}
                  under a doubled run-off with a 10% additional haircut.
                </span>
              </div>
            </section>
          </div>
        )
      )}
    </>
  );
}

/**
 * The buffer depleting day by day.
 *
 * Rendered as a table rather than a chart because the question an ALCO asks
 * is "which day do we break", and a date is easier to read off a row than
 * off an axis.
 */
function SurvivalTimeline({ timeline, currency }: { timeline: SurvivalDay[]; currency: string }) {
  const columns: ResultColumn<SurvivalDay>[] = [
    { key: 'day', header: 'Day', render: (d) => <span className="font-mono">{d.day}</span> },
    { key: 'date', header: 'Date', render: (d) => <span className="font-mono">{d.date}</span> },
    {
      key: 'dailyOutflow',
      header: 'Outflow',
      align: 'right',
      render: (d) => <Amount value={d.dailyOutflow} currency={currency} />,
    },
    {
      key: 'cumulative',
      header: 'Cumulative',
      align: 'right',
      render: (d) => <Amount value={d.cumulativeOutflow} currency={currency} />,
    },
    {
      key: 'remaining',
      header: 'Buffer remaining',
      align: 'right',
      render: (d) => (
        <span className={d.isExhausted ? 'text-danger' : undefined}>
          <Amount value={d.remainingBuffer} currency={currency} colorBySign={false} />
        </span>
      ),
    },
  ];

  // Every third day plus the breaking point — thirty rows is a scroll, and
  // the day the buffer runs out must never be the one that gets sampled out.
  const firstExhausted = timeline.find((d) => d.isExhausted);
  const sampled = timeline.filter((d) => d.day % 3 === 0 || d.day === 1 || d.day === firstExhausted?.day);

  return (
    <ResultTable
      rows={sampled}
      columns={columns}
      rowKey={(d) => `day-${d.day}`}
      caption="Every third day, plus the day the buffer is exhausted."
    />
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
