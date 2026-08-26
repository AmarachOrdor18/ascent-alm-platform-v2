/**
 * What-If Builder — screen 33.
 *
 * The previous platform had a genuine parametric what-if engine and told
 * users to reach it with an HTTP request: its Stress Testing screen rendered
 * the literal text "Custom Scenarios: Via API — POST /stress/run". That one
 * string was the clearest symptom of the whole problem.
 *
 * This is that screen. Move a slider, see the answer, save it as a scenario
 * if it is worth keeping.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RatioChart } from '@/components/ui/RatioChart';
import { Amount } from '@/components/ui/Amount';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, useFxRates, usePositions, resolveSingleAffiliate } from '@/lib/hooks';
import { useRuleMutations, newRuleMeta } from '@/lib/ruleHooks';
import { buildFxTable, missingRates } from '@/engine/fx';
import { computeLcr, computeNsfr } from '@/engine/liquidity';
import { computeEveSensitivity, computeNiiSensitivity } from '@/engine/irrbb';
import {
  computeCounterbalancingCapacity,
  computeSurvivalHorizon,
  severeOutflowProfile,
} from '@/engine/stress';
import { computeDepositRunoff, applyDepositBetas } from '@/engine/behavioural';
import { availableAsOfDates } from '@/engine/vintage';
import { formatPct } from '@/lib/format';
import type { ForecastScenarioRule } from '@/engine/ruleTypes';

interface Levers {
  rateShockBps: number;
  runoffMultiplier: number;
  hqlaHaircutPercent: number;
  inflowSuppressionPercent: number;
  depositAttritionPercent: number;
  loanGrowthPercent: number;
  applyDepositBetas: boolean;
}

const BASE: Levers = {
  rateShockBps: 0,
  runoffMultiplier: 1,
  hqlaHaircutPercent: 0,
  inflowSuppressionPercent: 0,
  depositAttritionPercent: 0,
  loanGrowthPercent: 0,
  applyDepositBetas: false,
};

const PRESETS: Array<{ name: string; description: string; levers: Levers }> = [
  {
    name: 'Severe deposit run-off',
    description: 'Three times normal run-off across every deposit type.',
    levers: { ...BASE, runoffMultiplier: 3 },
  },
  {
    name: 'Interbank funding freeze',
    description: 'Wholesale lines cut, with a market-wide haircut on liquid assets.',
    levers: { ...BASE, runoffMultiplier: 1.5, hqlaHaircutPercent: 20, inflowSuppressionPercent: 50 },
  },
  {
    name: 'Rate shock + funding stress',
    description: 'The classic ALCO combined scenario: +200bp alongside a deposit run.',
    levers: { ...BASE, rateShockBps: 200, runoffMultiplier: 2, hqlaHaircutPercent: 10, depositAttritionPercent: 15 },
  },
  {
    name: 'Reverse stress test',
    description: 'Deliberately extreme, to find where the buffer actually breaks.',
    levers: { ...BASE, runoffMultiplier: 5, hqlaHaircutPercent: 40, depositAttritionPercent: 30 },
  },
];

export function WhatIf() {
  const { hasPermission, user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { save } = useRuleMutations<ForecastScenarioRule>('ForecastScenario');
  const canRun = hasPermission('run.execute');

  const affiliate = resolveSingleAffiliate(affiliates, affiliateCode);
  const dates = affiliate ? availableAsOfDates(batches, affiliate.code) : [];
  const asOfDate = dates[0] ?? '2026-07-31';
  const currency = affiliate?.functionalCurrency ?? 'USD';
  const { data: positions = [] } = usePositions(affiliate?.code, asOfDate);
  const { data: fxRates = [] } = useFxRates();

  const [levers, setLevers] = useState<Levers>(BASE);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<Levers>) => {
    setLevers((l) => ({ ...l, ...patch }));
    setSaved(false);
  };

  // The engine throws on a missing rate rather than converting at 1.0, so
  // the gap is detected here and reported instead of crashing the screen.
  const fx = useMemo(() => buildFxTable(currency, fxRates, asOfDate), [currency, fxRates, asOfDate]);
  const missingFx = useMemo(
    () => missingRates(positions.map((p) => p.currency), currency, fx),
    [positions, currency, fx],
  );

  const ctx = useMemo(() => ({ asOfDate, reportingCurrency: currency, fx }), [asOfDate, currency, fx]);
  const irrbbCtx = useMemo(() => ({ ...ctx, tier1Capital: null }), [ctx]);

  const result = useMemo(() => {
    if (positions.length === 0 || missingFx.length > 0) return null;

    // Loan growth scales asset balances, which is a crude proxy for a
    // dynamic run — the real thing lives in the New Business rule and the
    // process run. It is here so a slider can show direction immediately.
    const grown =
      levers.loanGrowthPercent === 0
        ? positions
        : positions.map((p) =>
            p.category === 'Asset' && /^loans/i.test(p.productClass)
              ? { ...p, amount: p.amount * (1 + levers.loanGrowthPercent / 100) }
              : p,
          );

    const baseLcr = computeLcr(grown, ctx);
    const stressedLcr = computeLcr(grown, ctx, {
      hqlaHaircutPercent: levers.hqlaHaircutPercent,
      runoffMultiplier: levers.runoffMultiplier,
      inflowSuppressionPercent: levers.inflowSuppressionPercent,
    });

    const baseNsfr = computeNsfr(grown, ctx);
    const stressedNsfr = computeNsfr(grown, ctx, { depositAttritionPercent: levers.depositAttritionPercent });

    const baseNii = computeNiiSensitivity(grown, irrbbCtx, levers.rateShockBps);
    const adjustedNii = levers.applyDepositBetas
      ? applyDepositBetas(grown, levers.rateShockBps, baseNii.deltaNii)
      : null;

    const eve = computeEveSensitivity(grown, irrbbCtx, levers.rateShockBps);

    const capacity = computeCounterbalancingCapacity(grown, ctx, levers.hqlaHaircutPercent);
    const outflow = stressedLcr.grossOutflows * 2;
    const survival = computeSurvivalHorizon(capacity.total, severeOutflowProfile(outflow), ctx);
    const baseSurvival = computeSurvivalHorizon(
      computeCounterbalancingCapacity(grown, ctx).total,
      severeOutflowProfile(baseLcr.grossOutflows * 2),
      ctx,
    );

    const runoff = computeDepositRunoff(grown, undefined, levers.runoffMultiplier);

    return { baseLcr, stressedLcr, baseNsfr, stressedNsfr, baseNii, adjustedNii, eve, survival, baseSurvival, runoff };
  }, [positions, levers, ctx, irrbbCtx, missingFx]);

  const isBase = JSON.stringify(levers) === JSON.stringify(BASE);

  const handleSaveScenario = async () => {
    if (levers.rateShockBps === 0) return;
    await save({
      ...newRuleMeta('ForecastScenario', `What-if ${levers.rateShockBps > 0 ? '+' : ''}${levers.rateShockBps}bp`, user?.name ?? 'unknown'),
      kind: 'ForecastScenario',
      description: `Saved from the what-if builder. Run-off ×${levers.runoffMultiplier}, HQLA haircut ${levers.hqlaHaircutPercent}%.`,
      shockByBucket: Object.fromEntries(
        ['0-30D', '1-3M', '3-6M', '6-12M', '1-3Y', '3-5Y', '5Y+'].map((b) => [b, levers.rateShockBps]),
      ),
      basedOn: null,
      economicIndicatorCodes: [],
    });
    setSaved(true);
  };

  return (
    <>
      <ModuleHeader
        title="What-If Builder"
        description="Move a lever, see the answer. Every parameter here was previously reachable only by making an HTTP request."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate'}
        currency={currency}
        metrics={[
          {
            label: 'LCR',
            value: formatPct(result?.stressedLcr.lcrPercent ?? null),
            delta:
              result && result.baseLcr.lcrPercent !== null && result.stressedLcr.lcrPercent !== null
                ? `${(result.stressedLcr.lcrPercent - result.baseLcr.lcrPercent).toFixed(1)}pp`
                : undefined,
            tone:
              (result?.stressedLcr.lcrPercent ?? 100) < 100
                ? 'danger'
                : (result?.stressedLcr.lcrPercent ?? 100) < 130
                  ? 'warning'
                  : 'success',
          },
          {
            label: 'NSFR',
            value: formatPct(result?.stressedNsfr.nsfrPercent ?? null),
            tone: (result?.stressedNsfr.nsfrPercent ?? 100) < 100 ? 'danger' : 'success',
          },
          {
            label: 'Survival horizon',
            value: result ? `${result.survival.survivalHorizonDays} days` : '—',
            delta: result ? `${result.survival.survivalHorizonDays - result.baseSurvival.survivalHorizonDays} days` : undefined,
            tone: (result?.survival.survivalHorizonDays ?? 30) < 20 ? 'danger' : 'success',
          },
          {
            label: 'ΔNII',
            value: result ? formatPct(result.baseNii.niiSensitivityPercent) : '—',
            tone: (result?.baseNii.deltaNii ?? 0) < 0 ? 'warning' : 'neutral',
          },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => setLevers(BASE)}
              disabled={isBase}
              className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900 disabled:opacity-30"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => void handleSaveScenario()}
              disabled={!canRun || levers.rateShockBps === 0 || saved}
              title={levers.rateShockBps === 0 ? 'Set a rate shock to save this as a scenario' : undefined}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {saved ? 'Saved as scenario' : 'Save as scenario'}
            </button>
          </>
        }
      />

      {positions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[12px] text-gray-500">
          No committed positions for {affiliate?.name ?? 'this affiliate'}. Load data before running a what-if.
        </p>
      ) : missingFx.length > 0 ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-10 text-center">
          <p className="text-[12px] font-bold text-danger">
            No {currency} rate for {missingFx.join(', ')} as at {asOfDate}.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-gray-600">
            The book holds positions in those currencies. Converting them at 1.0 would produce a figure that looks
            right and is not, so nothing is computed until the rates are loaded on the FX Rates screen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="space-y-6 lg:col-span-1">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Presets</h2>
              <div className="space-y-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setLevers(p.levers);
                      setSaved(false);
                    }}
                    className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-navy-700"
                  >
                    <span className="block text-[12px] font-bold text-navy-900">{p.name}</span>
                    <span className="block text-[11px] leading-relaxed text-gray-500">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Levers</h2>
              <div className="space-y-5">
                <Slider
                  id="shock"
                  label="Rate shock"
                  value={levers.rateShockBps}
                  min={-400}
                  max={400}
                  step={25}
                  format={(v) => `${v > 0 ? '+' : ''}${v}bp`}
                  onChange={(v) => set({ rateShockBps: v })}
                />
                <Slider
                  id="runoff"
                  label="Deposit run-off multiplier"
                  value={levers.runoffMultiplier}
                  min={1}
                  max={5}
                  step={0.25}
                  format={(v) => `×${v}`}
                  onChange={(v) => set({ runoffMultiplier: v })}
                />
                <Slider
                  id="haircut"
                  label="Additional HQLA haircut"
                  value={levers.hqlaHaircutPercent}
                  min={0}
                  max={50}
                  step={5}
                  format={(v) => `${v}%`}
                  onChange={(v) => set({ hqlaHaircutPercent: v })}
                />
                <Slider
                  id="inflow"
                  label="Inflow suppression"
                  value={levers.inflowSuppressionPercent}
                  min={0}
                  max={100}
                  step={10}
                  format={(v) => `${v}%`}
                  onChange={(v) => set({ inflowSuppressionPercent: v })}
                />
                <Slider
                  id="attrition"
                  label="Deposit attrition (NSFR)"
                  value={levers.depositAttritionPercent}
                  min={0}
                  max={50}
                  step={5}
                  format={(v) => `${v}%`}
                  onChange={(v) => set({ depositAttritionPercent: v })}
                />
                <Slider
                  id="growth"
                  label="Loan book growth"
                  value={levers.loanGrowthPercent}
                  min={-30}
                  max={50}
                  step={5}
                  format={(v) => `${v > 0 ? '+' : ''}${v}%`}
                  onChange={(v) => set({ loanGrowthPercent: v })}
                />

                <div className="flex items-start gap-2 border-t border-gray-100 pt-4">
                  <input
                    id="betas"
                    type="checkbox"
                    checked={levers.applyDepositBetas}
                    onChange={(e) => set({ applyDepositBetas: e.target.checked })}
                    className="mt-0.5 accent-gold-500"
                  />
                  <label htmlFor="betas" className="cursor-pointer text-[11px]">
                    <span className="block font-bold text-navy-900">Apply deposit betas</span>
                    <span className="block leading-relaxed text-gray-500">
                      Damps the liability leg. A bank with a negative repricing gap looks less exposed to a rate rise
                      once betas apply — which is the real effect.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 lg:col-span-2">
            {result && (
              <>
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Base versus scenario
                  </h2>
                  <RatioChart
                    data={[
                      {
                        label: 'LCR',
                        value: result.stressedLcr.lcrPercent ?? 0,
                        priorValue: result.baseLcr.lcrPercent ?? 0,
                      },
                      {
                        label: 'NSFR',
                        value: result.stressedNsfr.nsfrPercent ?? 0,
                        priorValue: result.baseNsfr.nsfrPercent ?? 0,
                      },
                    ]}
                    thresholds={[
                      { label: 'Regulatory', value: 100, kind: 'regulatory' },
                      { label: 'Internal', value: 130, kind: 'internal' },
                    ]}
                    variant="bar"
                    seriesName="Scenario"
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <h3 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Survival horizon
                    </h3>
                    <p className="text-[28px] font-bold text-navy-900">
                      {result.survival.survivalHorizonDays}
                      <span className="ml-1 text-[14px] font-normal text-gray-500">days</span>
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      Base case {result.baseSurvival.survivalHorizonDays} days · opening buffer{' '}
                      <Amount value={result.survival.openingBuffer} currency={currency} />
                    </p>
                    {result.survival.survivalHorizonDays < 20 && (
                      <div className="mt-3">
                        <StatusBadge status="Below 20-day floor" tone="danger" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <h3 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Rate sensitivity
                    </h3>
                    <dl className="space-y-2 text-[12px]">
                      <Line label="ΔNII" value={<Amount value={result.baseNii.deltaNii} currency={currency} colorBySign />} />
                      {result.adjustedNii && (
                        <Line
                          label="ΔNII after betas"
                          value={<Amount value={result.adjustedNii.betaAdjustedDeltaNii} currency={currency} colorBySign />}
                        />
                      )}
                      <Line label="ΔEVE" value={<Amount value={result.eve.deltaEve} currency={currency} colorBySign />} />
                      <Line
                        label="EVE as % of equity"
                        value={<span className="font-mono">{formatPct(result.eve.eveSensitivityPercentOfEquity, 2)}</span>}
                      />
                      <Line
                        label="Basel outlier test"
                        value={
                          result.eve.isBaselOutlier === null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <StatusBadge
                              status={result.eve.isBaselOutlier ? 'Outlier' : 'Within 15%'}
                              tone={result.eve.isBaselOutlier ? 'danger' : 'success'}
                            />
                          )
                        }
                      />
                    </dl>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Deposit behaviour under this scenario
                  </h3>
                  <dl className="grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
                    <Stat label="Total deposits" value={<Amount value={result.runoff.totalDeposits} currency={currency} />} />
                    <Stat label="Core" value={<Amount value={result.runoff.totalCore} currency={currency} />} />
                    <Stat label="Volatile" value={<Amount value={result.runoff.totalVolatile} currency={currency} />} />
                    <Stat label="Core share" value={<span className="font-mono">{formatPct(result.runoff.corePercent)}</span>} />
                  </dl>
                  <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
                    {result.runoff.methodology}
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-[11px] font-medium text-gray-600">
          {label}
        </label>
        <span className="font-mono text-[12px] font-bold text-navy-900">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-gold-500"
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
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
