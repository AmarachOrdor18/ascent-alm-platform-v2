import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useScope } from '@/context/ScopeContext';
import { useFxRates, usePositions } from '@/lib/hooks';
import { useSelectedRun, frameProps } from '@/lib/resultHooks';
import { useRuleAsUsedBy } from '@/lib/ruleHooks';
import { useRunValuationInputs } from '@/lib/cashflowBookHooks';
import { buildFxTable, missingRates } from '@/engine/fx';
import { computeAllShocks, computeEquity } from '@/engine/irrbb';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_BETAS, DEFAULT_PATTERNS } from '@/engine/behavioural';
import {
  computeCounterbalancingCapacity,
  computeSurvivalHorizon,
  deriveSevereRun,
  solveOutflowForSurvivalTarget,
  type SurvivalDay,
} from '@/engine/stress';
import type { BehaviourPatternRule } from '@/engine/ruleTypes';
import { computeLcr } from '@/engine/liquidity';
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
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run } = selected;
  const currency = run?.reportingCurrency ?? 'USD';
  const effectiveDate = run?.asOfDate ?? null;

  const { data: fxRates = [] } = useFxRates();
  // Pinned to the selected run's own affiliate and as-of date - not the live scope selector - so the
  // battery below is reproducible: the same run always shows the same six shocks and severe-run result,
  // regardless of what has loaded or been superseded since.
  const { data: positions = [] } = usePositions(run?.affiliateCode, run?.asOfDate);
  // The severe run and the deposit betas come from the behaviour pattern rule this run actually used (at
  // the version it used), so this screen and the run's own Survival Horizon element tell the same story.
  // No rule on the run means the engine defaults, exactly as the run itself fell back to.
  const { data: behaviourRule = null } = useRuleAsUsedBy<BehaviourPatternRule>(run?.behaviourPatternRuleId, run);

  const fx = useMemo(
    () => (effectiveDate ? buildFxTable(currency, fxRates, effectiveDate) : null),
    [currency, fxRates, effectiveDate],
  );
  const missingFx = useMemo(
    () =>
      fx
        ? missingRates(
            positions.map((p) => p.currency),
            currency,
            fx,
          )
        : [],
    [positions, currency, fx],
  );

  // The run's own cashflow book (same rules, same versions, same builder), so the shock battery revalues the
  // same cashflows the run's EVE element did and the severe run starts from the same classified book.
  const valuation = useRunValuationInputs(run, positions);

  const analysis = useMemo(() => {
    if (!effectiveDate || !fx || positions.length === 0 || missingFx.length > 0) return null;
    const book = valuation?.book;
    const classified = valuation?.positions ?? positions;

    const ctx = {
      asOfDate: effectiveDate,
      reportingCurrency: currency,
      fx,
      tier1Capital: null,
      depositBetas: behaviourRule?.betas ?? DEFAULT_BETAS,
    };
    const equity = computeEquity(classified, ctx);
    const { results, worstCase } = computeAllShocks(
      classified,
      ctx,
      defaultLadder('RepricingGap'),
      [],
      valuation ? { book: valuation.book, curves: valuation.curves } : undefined,
    );
    const eveMethod = Object.values(results)[0]?.eve.method ?? null;

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
    const lcr = computeLcr(classified, liqCtx, {}, book);
    const severe = deriveSevereRun(classified, behaviourRule?.patterns ?? DEFAULT_PATTERNS, liqCtx, {
      severityMultiplier: behaviourRule?.stressSeverityMultiplier,
    });
    const stressedLcr = computeLcr(
      classified,
      liqCtx,
      {
        runoffMultiplier: severe.severityMultiplier,
        hqlaHaircutPercent: severe.hqlaHaircutPercent,
      },
      book,
    );
    const capacity = computeCounterbalancingCapacity(classified, liqCtx, severe.hqlaHaircutPercent);
    const survival = computeSurvivalHorizon(capacity.total, severe.profile, liqCtx);

    return { rows, worstCase, equity, capacity, survival, severe, lcr, stressedLcr, capitalBasis: results, eveMethod };
  }, [positions, valuation, missingFx, effectiveDate, currency, fx, behaviourRule]);

  const worstRow = analysis?.rows.find((r) => r.name === analysis.worstCase?.name) ?? null;
  const outliers = analysis?.rows.filter((r) => r.isOutlier === true) ?? [];

  const [reverseMode, setReverseMode] = useState(false);
  const [targetDays, setTargetDays] = useState(5);
  const reverseResult = useMemo(() => {
    if (!reverseMode || !analysis || !effectiveDate || !fx) return null;
    const liqCtx = { asOfDate: effectiveDate, reportingCurrency: currency, fx };
    // Same run shape as the forward severe run - only the size is solved for.
    const { horizonDays, frontLoadedPercent, frontLoadedDays } = analysis.severe.profile;
    return solveOutflowForSurvivalTarget(
      analysis.capacity.total,
      { horizonDays, frontLoadedPercent, frontLoadedDays },
      targetDays,
      liqCtx,
    );
  }, [reverseMode, analysis, effectiveDate, fx, currency, targetDays]);

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
            -
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
        description="The six BCBS supervisory shocks and the severe liquidity run."
        about="Computed against the selected run's own book - the prescribed battery, not a sandbox."
        asOfDate={effectiveDate}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Worst shock (EVE)',
            value: worstRow?.label ?? '-',
            tone: outliers.length > 0 ? 'danger' : 'neutral',
            about:
              'Which of the six BCBS-prescribed shocks produces the largest economic-value impact - this is the scenario the supervisory outlier test is judged on.',
          },
          {
            label: 'Worst ΔEVE % of capital',
            value: formatPct(worstRow?.evePercent ?? null, 2),
            tone: worstRow?.isOutlier ? 'danger' : 'success',
            about:
              'The economic-value impact of the worst shock, as a share of capital. Beyond ±15% triggers the Basel supervisory outlier test.',
          },
          {
            label: 'Shocks failing 15% test',
            value: analysis ? `${outliers.length} of ${analysis.rows.length}` : '-',
            tone: outliers.length > 0 ? 'danger' : 'success',
            about: 'How many of the six shocks individually breach the ±15% supervisory outlier threshold.',
          },
          {
            label: 'Survival horizon',
            value: analysis ? `${analysis.survival.survivalHorizonDays} days` : '-',
            tone: (analysis?.survival.survivalHorizonDays ?? 30) < 20 ? 'danger' : 'success',
            about:
              "Days the counterbalancing capacity lasts under the severe run derived from this run's behaviour pattern rule (volatile deposits running off fast, at the rule's severity multiplier) with an additional HQLA haircut, before the buffer runs out.",
          },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        {positions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[13px] text-gray-500">
            No committed positions for {affiliate?.name ?? 'this affiliate'} as at {effectiveDate}.
          </p>
        ) : missingFx.length > 0 ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/5 p-10 text-center">
            <p className="text-[13px] font-bold text-danger">
              No {currency} rate for {missingFx.join(', ')} as at {effectiveDate}.
            </p>
            <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-600">
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
                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">
                      Interest rate - six supervisory shocks
                    </h2>
                    <InfoButton label="Why balance-sheet equity">
                      The capital basis is balance-sheet equity because no Tier 1 figure has been supplied; loading one
                      on the affiliate record changes the denominator and can change the verdict.
                    </InfoButton>
                  </div>
                  <p className="text-[12px] text-gray-500">
                    Capital basis: balance-sheet equity of <Amount value={analysis.equity} currency={currency} />
                  </p>
                </div>

                <ResultTable
                  rows={analysis.rows}
                  columns={columns}
                  rowKey={(r) => r.name}
                  caption={
                    analysis.eveMethod === 'CashflowPv' || analysis.eveMethod === 'Mixed'
                      ? "BCBS 368 standardised interest rate shocks. ΔEVE revalues the run's cashflows (prepayment and deposit run-off applied) on each shocked curve, tenor by tenor" +
                        (analysis.eveMethod === 'Mixed' ? '; balances with no curve fall back to duration' : '') +
                        '. The 15% test compares ΔEVE against the capital basis named above.'
                      : 'BCBS 368 standardised interest rate shocks, by duration gap (no yield curve on file). The 15% test compares ΔEVE against the capital basis named above.'
                  }
                />
              </section>

              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">
                      Liquidity - {reverseMode ? 'reverse stress' : 'severe run'}
                    </h2>
                    <InfoButton label="Methodology">
                      {reverseMode
                        ? (reverseResult?.methodology ?? '')
                        : `${analysis.survival.methodology} ${analysis.severe.methodology}`}
                    </InfoButton>
                  </div>
                  <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setReverseMode(false)}
                      className={`rounded px-3 py-1 text-[12px] font-bold ${
                        !reverseMode ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                      }`}
                    >
                      Forward
                    </button>
                    <button
                      type="button"
                      onClick={() => setReverseMode(true)}
                      className={`rounded px-3 py-1 text-[12px] font-bold ${
                        reverseMode ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                      }`}
                    >
                      Reverse stress
                    </button>
                  </div>
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

                {reverseMode ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
                      <div>
                        <label htmlFor="target-days" className="mb-1 block text-[12px] text-gray-600">
                          Target survival horizon (days)
                        </label>
                        <input
                          id="target-days"
                          type="number"
                          min={1}
                          max={30}
                          value={targetDays}
                          onChange={(e) => setTargetDays(Math.max(1, Math.min(30, Number(e.target.value))))}
                          className="w-32 rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                        />
                      </div>
                      {reverseResult && (
                        <p className="text-[12px] text-gray-500">
                          A stressed outflow of{' '}
                          <span className="font-mono font-bold text-navy-900">
                            <Amount value={reverseResult.solvedTotalOutflow} currency={currency} />
                          </span>{' '}
                          over 30 days would exhaust the buffer within {reverseResult.targetSurvivalDays} day
                          {reverseResult.targetSurvivalDays === 1 ? '' : 's'}
                          {!reverseResult.converged && ' (approximate - outside the search range)'}.
                        </p>
                      )}
                    </div>
                    {reverseResult && <SurvivalTimeline timeline={reverseResult.timeline} currency={currency} />}
                  </>
                ) : (
                  <>
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
                      <span className="text-[12px] text-gray-500">
                        LCR falls from {formatPct(analysis.lcr.lcrPercent)} to{' '}
                        {formatPct(analysis.stressedLcr.lcrPercent)} under run-off ×{analysis.severe.severityMultiplier}{' '}
                        (from the behaviour pattern rule) with a {analysis.severe.hqlaHaircutPercent}% additional
                        haircut; {analysis.severe.profile.frontLoadedPercent.toFixed(0)}% of the stressed outflow lands
                        in the first {analysis.severe.profile.frontLoadedDays} days.
                      </span>
                    </div>
                  </>
                )}
              </section>
            </div>
          )
        )}
      </ResultsFrame>
    </>
  );
}

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

  // Sample every third day, but always include the day the buffer is exhausted.
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
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
