import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { InfoButton } from '@/components/ui/InfoButton';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, useDimensionMembers, useFxRates, usePositions, useYieldCurves } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { useExecuteRun } from '@/lib/runHooks';
import { approvals } from '@/lib/governanceHooks';
import { ALL_ELEMENTS, draftRun } from '@/engine/run';
import { availableAsOfDates, currentPositionBatches, positionBookReadiness } from '@/engine/vintage';
import { unclassifiedProducts } from '@/engine/classification';
import { buildFxTable, missingRates } from '@/engine/fx';
import { formatDate } from '@/lib/format';
import type { CalculationElement, ProcessRun as Run, ProcessType } from '@/engine/types';
import type {
  AdjustmentRuleDef,
  ForecastScenarioRule,
  FtpRule,
  NewBusinessRule,
  ProductCharacteristicRule,
  TransactionStrategyRule,
} from '@/engine/ruleTypes';

type PresetId = 'daily-liquidity' | 'monthly-irrbb' | 'full-alco' | 'custom';

interface Preset {
  id: PresetId;
  label: string;
  description: string;
  elements: CalculationElement[];
  processType: ProcessType;
  useAllScenarios: boolean;
}

const PRESETS: Preset[] = [
  {
    id: 'daily-liquidity',
    label: 'Daily Liquidity Check',
    description: 'LCR, NSFR, liquidity gap, survival horizon and concentration - the numbers checked every day.',
    elements: ['Lcr', 'Nsfr', 'LiquidityGap', 'SurvivalHorizon', 'Concentration'],
    processType: 'Static',
    useAllScenarios: false,
  },
  {
    id: 'monthly-irrbb',
    label: 'Monthly IRRBB',
    description: 'Repricing gap, NII and EVE sensitivity, run against every defined rate scenario.',
    elements: ['RepricingGap', 'NiiSensitivity', 'EveSensitivity'],
    processType: 'Static',
    useAllScenarios: true,
  },
  {
    id: 'full-alco',
    label: 'Full ALCO Pack',
    description: 'Every calculation element, every rate scenario - the complete monthly pack.',
    elements: ALL_ELEMENTS,
    processType: 'Static',
    useAllScenarios: true,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Configure scope, elements, rules and scenarios yourself.',
    elements: ALL_ELEMENTS,
    processType: 'Static',
    useAllScenarios: false,
  },
];

// What to point at next once a run completes - the first matching row wins, so order this by which
// module a run's elements would most usefully be reviewed in first.
const NEXT_STEP_RULES: Array<{ elements: CalculationElement[]; label: string; path: string }> = [
  { elements: ['Lcr', 'Nsfr', 'LiquidityGap', 'SurvivalHorizon'], label: 'Review Liquidity Risk', path: '/risk/liquidity' },
  { elements: ['NiiSensitivity', 'EveSensitivity', 'RepricingGap'], label: 'Review IRRBB', path: '/risk/irrbb' },
  { elements: ['TransferPricing', 'TpAdjustments'], label: 'Review Transfer Pricing', path: '/treasury/ftp' },
  { elements: ['ProfitabilityRatios', 'FxPosition'], label: 'Review Balance Sheet & Treasury', path: '/treasury/balance-sheet' },
];

function nextStepFor(elements: CalculationElement[]): { label: string; path: string } | null {
  return NEXT_STEP_RULES.find((r) => r.elements.some((e) => elements.includes(e))) ?? null;
}

const ELEMENT_LABELS: Record<CalculationElement, string> = {
  Lcr: 'Liquidity Coverage Ratio',
  Nsfr: 'Net Stable Funding Ratio',
  LoanToDeposit: 'Loan-to-Deposit Ratio',
  Concentration: 'Depositor Concentration',
  LiquidityGap: 'Liquidity Gap (contractual & behavioural)',
  RepricingGap: 'Repricing Gap',
  NiiSensitivity: 'NII Sensitivity',
  EveSensitivity: 'EVE Sensitivity',
  SurvivalHorizon: 'Survival Horizon',
  ProfitabilityRatios: 'Profitability Ratios',
  FxPosition: 'FX Position',
  TransferPricing: 'Funds Transfer Pricing',
  TpAdjustments: 'FTP Adjustments',
};

export function ProcessRun() {
  const [, navigate] = useLocation();
  const { hasPermission, user } = useAuth();
  const { affiliateCode, setRun } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: fxRates = [] } = useFxRates();
  const { data: yieldCurves = [] } = useYieldCurves();
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: products = [] } = useDimensionMembers('Product', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: bucketRules = [] } = useRules('TimeBucket');
  const { data: behaviourRules = [] } = useRules('BehaviourPattern');
  const { data: productRules = [] } = useRules<ProductCharacteristicRule>('ProductCharacteristic');
  const { data: scenarios = [] } = useRules<ForecastScenarioRule>('ForecastScenario');
  const { data: newBusiness = [] } = useRules<NewBusinessRule>('NewBusiness');
  const { data: strategies = [] } = useRules<TransactionStrategyRule>('TransactionStrategy');
  const { data: ftpRules = [] } = useRules<FtpRule>('FtpRule');
  const { data: adjustmentRules = [] } = useRules<AdjustmentRuleDef>('AdjustmentRule');
  // A stress scenario is free to explore in the What-If Builder unapproved, but consuming one in an
  // official, auditable run needs sign-off first - Submit Scenario -> Approval -> Execute, not just
  // Execute. Unfiltered so a Group-scoped or differently-affiliated scenario's approval still counts.
  const { data: approvalRequests = [] } = approvals.useList();
  const approvedScenarioIds = new Set(
    approvalRequests.filter((a) => a.entityType === 'ForecastScenario' && a.status === 'Approved').map((a) => a.entityId),
  );
  const execute = useExecuteRun();
  const canRun = hasPermission('run.execute');

  const affiliate = affiliates.find((a) => a.code === affiliateCode) ?? affiliates.find((a) => a.code !== 'GROUP');
  // Only a Live affiliate's book is considered part of the Group consolidation - one still in
  // Onboarding/Testing, or Suspended, hasn't (or no longer) signed off its data for this to be safe.
  const liveAffiliates = affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');

  // A Group run has no positions of its own; its available dates are the
  // union of what each real affiliate has committed.
  const dates =
    affiliateCode === 'GROUP'
      ? Array.from(new Set(liveAffiliates.flatMap((a) => availableAsOfDates(batches, a.code)))).sort((a, b) =>
          b.localeCompare(a),
        )
      : affiliate
        ? availableAsOfDates(batches, affiliate.code)
        : [];

  const [name, setName] = useState('');
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [processType, setProcessType] = useState<ProcessType>('Static');
  const [orgUnitCodes, setOrgUnitCodes] = useState<string[]>([]);
  const [productCodes, setProductCodes] = useState<string[]>([]);
  const [elements, setElements] = useState<CalculationElement[]>(ALL_ELEMENTS);
  const [bucketRuleId, setBucketRuleId] = useState('');
  const [behaviourRuleId, setBehaviourRuleId] = useState('');
  const [productRuleId, setProductRuleId] = useState('');
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);
  const [newBusinessId, setNewBusinessId] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [ftpRuleId, setFtpRuleId] = useState('');
  const [adjustmentRuleId, setAdjustmentRuleId] = useState('');
  const [outcome, setOutcome] = useState<{ run: Run; count: number } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>(null);
  const [customizing, setCustomizing] = useState(false);

  const applyPreset = (preset: Preset) => {
    setElements(preset.elements);
    setProcessType(preset.processType);
    // Only Approved scenarios - a preset is meant to run cleanly, not surface an approval blocker
    // for some unrelated scenario someone left pending in the What-If Builder.
    setScenarioIds(preset.useAllScenarios ? scenarios.filter((s) => approvedScenarioIds.has(s.id)).map((s) => s.id) : []);
    setSelectedPreset(preset.id);
    setCustomizing(preset.id === 'custom');
  };

  const effectiveDate = asOfDate || dates[0] || '';
  // Every department's current Positions batch for this affiliate/date - the book is whatever combination of
  // Loans/Deposits/Treasury (plus any legacy pre-contributor load) has been committed, not a single file.
  // For a Group run there is no batch filed under the GROUP code itself - the book is the union of every
  // Live affiliate's own current batches, pinned here so the run is reproducible the same way a single
  // affiliate's run already is (a later reload never changes what an already-executed run reports).
  const positionBatches =
    affiliateCode === 'GROUP'
      ? (effectiveDate ? liveAffiliates.flatMap((a) => currentPositionBatches(batches, a.code, effectiveDate)) : [])
      : affiliate && effectiveDate
        ? currentPositionBatches(batches, affiliate.code, effectiveDate)
        : [];
  // Per-department readiness is affiliate-specific and meaningless for the GROUP pseudo-entity itself.
  const readiness = affiliate && effectiveDate && affiliateCode !== 'GROUP' ? positionBookReadiness(affiliate, batches, effectiveDate) : null;
  // Informational only - reconciliation status is visible here, not a run blocker (see `blockers` below).
  const unreconciledBatches = positionBatches.filter((b) => !b.reconciledAt);

  const { data: scopedPositions = [] } = usePositions(affiliate?.code, effectiveDate || undefined);
  const selectedProductRule = productRules.find((r) => r.id === productRuleId);
  const unclassified = selectedProductRule ? unclassifiedProducts(scopedPositions, selectedProductRule.assumptions) : [];

  // A Group run must be able to convert every currency it will encounter.
  const required = useMemo(
    () =>
      affiliateCode === 'GROUP'
        ? Array.from(new Set(affiliates.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies])))
        : affiliate
          ? [affiliate.functionalCurrency, ...affiliate.activeCurrencies]
          : [],
    [affiliateCode, affiliates, affiliate],
  );
  const reportingCurrency = affiliateCode === 'GROUP' ? 'USD' : (affiliate?.functionalCurrency ?? 'USD');
  const missingFx = missingRates(required, reportingCurrency, buildFxTable('USD', fxRates, effectiveDate));

  // Unlike FX, a missing curve degrades gracefully - computeFtp reports the affected positions as
  // unpriced rather than failing the run, so this is a notice, not a blocker. NII/EVE sensitivity use
  // a flat parallel shock (shockBps), not a curve, so they are deliberately not included here.
  const needsCurve = elements.some((e) => (['TransferPricing', 'TpAdjustments'] as CalculationElement[]).includes(e));
  const hasActiveCurve = effectiveDate ? yieldCurves.some((c) => c.isActive && c.asOfDate <= effectiveDate) : false;
  const curveWarning =
    needsCurve && effectiveDate && !hasActiveCurve
      ? 'No active yield curve as at this date - Transfer Pricing/FTP Adjustments will report positions unpriced rather than fail.'
      : null;

  const blockers: string[] = [];
  if (!affiliate) blockers.push('No affiliate selected.');
  if (!effectiveDate) blockers.push('No as-of date with committed data.');
  if (positionBatches.length === 0) {
    blockers.push(
      affiliateCode === 'GROUP'
        ? 'No Live affiliate has committed position data for this date yet.'
        : 'No department has committed position data for this date yet.',
    );
  }
  if (affiliateCode === 'GROUP' && liveAffiliates.length === 0) {
    blockers.push('No affiliate is Live yet - a Group run has nothing to consolidate.');
  }
  if (missingFx.length > 0) blockers.push(`No FX rate for ${missingFx.join(', ')} - the run would fail.`);
  if (elements.length === 0) blockers.push('Select at least one calculation element.');
  if (processType === 'Dynamic' && !newBusinessId) blockers.push('A dynamic run needs a new-business rule.');
  const unapprovedScenarios = scenarioIds
    .filter((id) => !approvedScenarioIds.has(id))
    .map((id) => scenarios.find((s) => s.id === id)?.name ?? id);
  if (unapprovedScenarios.length > 0) {
    blockers.push(`Scenario not yet approved: ${unapprovedScenarios.join(', ')} - see Approvals.`);
  }

  const handleExecute = async () => {
    if (!affiliate || blockers.length > 0) return;
    const run: Run = {
      ...draftRun({
        id: `RUN-${Date.now().toString(36).toUpperCase()}`,
        name: name.trim() || `${affiliate.name} - ${formatDate(effectiveDate)}`,
        asOfDate: effectiveDate,
        affiliateCode: affiliate.code,
        reportingCurrency,
        timeBucketRuleId: bucketRuleId,
        batchIds: positionBatches.map((b) => b.id),
        createdBy: user?.name ?? 'unknown',
        createdAt: new Date().toISOString(),
        elements,
      }),
      processType,
      orgUnitCodes: orgUnitCodes.length > 0 ? orgUnitCodes : null,
      productCodes: productCodes.length > 0 ? productCodes : null,
      productCharacteristicRuleId: productRuleId || null,
      behaviourPatternRuleId: behaviourRuleId || null,
      forecastScenarioIds: scenarioIds,
      newBusinessRuleId: newBusinessId || null,
      transactionStrategyId: strategyId || null,
      ftpRuleId: ftpRuleId || null,
      adjustmentRuleId: adjustmentRuleId || null,
    };

    const result = await execute.mutateAsync(run);
    setOutcome({ run: result.run, count: result.results.length });
    if (result.run.status === 'Completed') setRun(result.run);
  };

  return (
    <>
      <ModuleHeader
        title="Process Run"
        description="Compose a run from a date, a scope, a rule set and a scenario, then execute it. Results are immutable and pinned to the versions consumed."
        asOfDate={effectiveDate || null}
        scope={affiliate?.name ?? 'No affiliate'}
        currency={reportingCurrency}
        metrics={[
          { label: 'Process type', value: processType, about: 'Static models the existing book running off; Dynamic layers a New Business rule’s growth assumptions on top.' },
          { label: 'Elements', value: `${elements.length}/${ALL_ELEMENTS.length}`, about: 'How many of the available calculation elements this run will compute - fewer elements means a lighter, faster run.' },
          {
            label: 'Contributors',
            value: positionBatches.length > 0 ? `${positionBatches.length} batch(es)` : '-',
            about: 'Every department’s current Positions batch this run will pin to, combined - reloading data later never changes what this run reports.',
          },
          {
            label: 'Ready',
            value: blockers.length === 0 ? 'Yes' : `${blockers.length} blocker(s)`,
            tone: blockers.length === 0 ? 'success' : 'danger',
            about: 'Whether every precondition is met - a missing FX rate, an unselected element or an incomplete scope all block execution rather than letting the run fail silently.',
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={!canRun || blockers.length > 0 || execute.isPending}
            title={blockers[0]}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            {execute.isPending ? 'Running…' : 'Execute run'}
          </button>
        }
      />

      {blockers.length > 0 && (
        <div role="alert" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger">
          <span className="font-bold">Cannot run yet.</span>
          <ul className="mt-1 space-y-0.5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {curveWarning && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
          <span className="font-bold">Heads up: </span>
          {curveWarning}
        </p>
      )}

      {outcome && (
        <div
          role="status"
          className={cn(
            'mb-6 rounded-lg px-4 py-3 text-[12px] leading-relaxed',
            outcome.run.status === 'Completed' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
          )}
        >
          {outcome.run.status === 'Completed' ? (
            <>
              <span className="font-bold">{outcome.run.name} completed.</span> {outcome.count} element(s) computed.{' '}
              <button
                type="button"
                onClick={() => navigate('/runs')}
                className="font-bold underline hover:no-underline"
              >
                View in run history
              </button>
              {(() => {
                const next = nextStepFor(outcome.run.elements);
                return next ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => navigate(next.path)}
                      className="font-bold underline hover:no-underline"
                    >
                      {next.label} →
                    </button>
                  </>
                ) : null;
              })()}
            </>
          ) : (
            <>
              <span className="font-bold">Run failed.</span> {outcome.run.errorLog[0]?.message}
            </>
          )}
        </div>
      )}

      {!customizing ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Choose what to run</h2>
            <p className="mb-4 text-[11px] text-gray-500">
              Pick a preset to fill in a full run configuration, or customize everything yourself.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    selectedPreset === p.id
                      ? 'border-navy-700 bg-navy-50'
                      : 'border-gray-200 hover:border-navy-700',
                  )}
                >
                  <p className="text-[13px] font-bold text-navy-900">{p.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedPreset && selectedPreset !== 'custom' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Run summary</h2>
                <button
                  type="button"
                  onClick={() => setCustomizing(true)}
                  className="text-[11px] font-bold text-navy-700 hover:underline"
                >
                  Customize →
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
                <Row label="Affiliate" value={affiliate?.name ?? '-'} />
                <Row label="Elements" value={`${elements.length} selected`} />
                <Row
                  label="Scenarios"
                  value={scenarioIds.length > 0 ? `${scenarioIds.length} selected` : 'Base case only'}
                />
                <Row label="Scope" value="Whole book · engine-default rules" />
              </dl>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <Field label="As-of date" hint="Only dates with committed position data appear.">
                  <select
                    value={effectiveDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className={input}
                    aria-label="As-of date"
                  >
                    {dates.length === 0 && <option value="">- no committed data -</option>}
                    {dates.map((d) => (
                      <option key={d} value={d}>
                        {formatDate(d)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setCustomizing(false)}
            className="mb-4 text-[11px] font-bold text-navy-700 hover:underline"
          >
            ← Back to presets
          </button>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Run definition</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Run name" hint="Defaults to the affiliate and date if left blank.">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={affiliate ? `${affiliate.name} - ${formatDate(effectiveDate)}` : ''}
                  className={input}
                  aria-label="Run name"
                />
              </Field>
              <Field label="As-of date" hint="Only dates with committed position data appear.">
                <select
                  value={effectiveDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className={input}
                  aria-label="As-of date"
                >
                  {dates.length === 0 && <option value="">- no committed data -</option>}
                  {dates.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(d)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Process type"
                hint="Static models the existing book running off. Dynamic layers new business on top."
              >
                <select
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value as ProcessType)}
                  className={input}
                  aria-label="Process type"
                >
                  <option value="Static">Static - existing book only</option>
                  <option value="Dynamic">Dynamic - with new business</option>
                </select>
              </Field>
              <Field label="Reporting currency" hint="Group runs consolidate into USD.">
                <input value={reportingCurrency} readOnly className={`${input} bg-gray-50 font-mono`} aria-label="Reporting currency" />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Scope</h2>
              <InfoButton label="How scope selection works">
                Leave a selection empty for no constraint. Selecting a rollup brings its whole subtree - picking
                Retail Banking captures every region beneath it.
              </InfoButton>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <HierarchyBrowser
                members={orgUnits}
                selectedCodes={orgUnitCodes}
                onChange={setOrgUnitCodes}
                label="Organisational unit"
              />
              <HierarchyBrowser
                members={products}
                selectedCodes={productCodes}
                onChange={setProductCodes}
                label="Product"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Calculation elements
              </h2>
              <InfoButton label="Why choose elements">
                Choose what this run computes, per Oracle's element selection (ALM UG §35.2). Computing only what is
                needed keeps a scheduled daily liquidity run light.
              </InfoButton>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {ALL_ELEMENTS.map((element) => (
                <div key={element} className="flex items-center gap-2">
                  <input
                    id={`el-${element}`}
                    type="checkbox"
                    checked={elements.includes(element)}
                    onChange={(e) =>
                      setElements(
                        e.target.checked ? [...elements, element] : elements.filter((x) => x !== element),
                      )
                    }
                    className="accent-gold-500"
                  />
                  <label htmlFor={`el-${element}`} className="cursor-pointer text-[12px] text-gray-700">
                    {ELEMENT_LABELS[element]}
                  </label>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3 border-t border-gray-50 pt-3">
              <button type="button" onClick={() => setElements(ALL_ELEMENTS)} className="text-[11px] font-bold text-navy-700 hover:text-navy-900">
                Select all
              </button>
              <button type="button" onClick={() => setElements([])} className="text-[11px] font-bold text-gray-500 hover:text-navy-900">
                Clear
              </button>
              <button
                type="button"
                onClick={() => setElements(['Lcr', 'SurvivalHorizon', 'Concentration'])}
                className="text-[11px] font-bold text-navy-700 hover:text-navy-900"
              >
                Daily liquidity only
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Rules</h2>
              <InfoButton label="What happens when a rule is left unselected">
                A rule left unselected falls back to the engine default, and the result says which basis it used.
              </InfoButton>
            </div>
            <div className="space-y-3">
              <Field label="Time bucket rule">
                <select value={bucketRuleId} onChange={(e) => setBucketRuleId(e.target.value)} className={input} aria-label="Time bucket rule">
                  <option value="">- engine default -</option>
                  {bucketRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Product characteristics"
                hint="Overrides HQLA level, haircuts and ASF/RSF factors by product/currency at run time - a department uploading data never has to know these."
              >
                <select value={productRuleId} onChange={(e) => setProductRuleId(e.target.value)} className={input} aria-label="Product characteristics rule">
                  <option value="">- position data as loaded, unclassified -</option>
                  {productRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                {selectedProductRule && unclassified.length > 0 && (
                  <p className="mt-1 text-[10px] leading-relaxed text-warning">
                    {unclassified.reduce((s, u) => s + u.count, 0)} position(s) across {unclassified.length} product/currency
                    combination(s) aren&rsquo;t covered by this rule and will keep whatever classification was loaded -
                    e.g. {unclassified[0]!.productCode} ({unclassified[0]!.currency}).
                  </p>
                )}
              </Field>
              <Field label="Behaviour patterns">
                <select value={behaviourRuleId} onChange={(e) => setBehaviourRuleId(e.target.value)} className={input} aria-label="Behaviour pattern rule">
                  <option value="">- engine default -</option>
                  {behaviourRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="FTP rule"
                hint="Prices the Funds Transfer Pricing and FTP Adjustments elements. Left unselected, every position is reported unpriced rather than assumed zero-margin."
              >
                <select value={ftpRuleId} onChange={(e) => setFtpRuleId(e.target.value)} className={input} aria-label="FTP rule">
                  <option value="">- none, all positions unpriced -</option>
                  {ftpRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Adjustment rule"
                hint="Stacks named add-ons (liquidity premium, basis risk, pricing incentive) onto the FTP rule's base transfer rate. Left unselected, the rate is the base curve alone."
              >
                <select value={adjustmentRuleId} onChange={(e) => setAdjustmentRuleId(e.target.value)} className={input} aria-label="Adjustment rule">
                  <option value="">- none -</option>
                  {adjustmentRules.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              {processType === 'Dynamic' && (
                <Field label="New business" hint="Required for a dynamic run.">
                  <select value={newBusinessId} onChange={(e) => setNewBusinessId(e.target.value)} className={input} aria-label="New business rule">
                    <option value="">- select -</option>
                    {newBusiness.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Transaction strategy" hint="Pinned to the run for record-keeping; does not yet change any calculated element.">
                <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} className={input} aria-label="Transaction strategy">
                  <option value="">- none -</option>
                  {strategies.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Rate scenarios</h2>
            {scenarios.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                No scenarios defined. The run computes the base case only.
              </p>
            ) : (
              <div className="space-y-2">
                {scenarios.map((s) => (
                  <div key={s.id} className="flex items-start gap-2">
                    <input
                      id={`sc-${s.id}`}
                      type="checkbox"
                      checked={scenarioIds.includes(s.id)}
                      onChange={(e) =>
                        setScenarioIds(
                          e.target.checked ? [...scenarioIds, s.id] : scenarioIds.filter((x) => x !== s.id),
                        )
                      }
                      className="mt-0.5 accent-gold-500"
                    />
                    <label htmlFor={`sc-${s.id}`} className="cursor-pointer text-[12px]">
                      <span className="flex items-center gap-1.5">
                        <span className="text-navy-900">{s.name}</span>
                        {!approvedScenarioIds.has(s.id) && (
                          <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning">
                            Pending approval
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] text-gray-500">{s.description || 'No description'}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Position Book - contributors</h2>
              <InfoButton label="Why the run pins every contributor's version">
                The book is assembled from however many departments have submitted for this date - the run pins
                every one of their current versions, combined. Reloading a department's data later creates a new
                version for that department only; this run keeps reporting what it actually computed.
              </InfoButton>
            </div>
            {positionBatches.length > 0 ? (
              <dl className="space-y-3 text-[11px]">
                {positionBatches.map((b) => (
                  <div key={b.id} className="border-b border-gray-50 pb-2 last:border-0">
                    <Row label={b.contributor ?? 'Legacy (pre-department) load'} value={`${b.id} · v${b.version}`} mono />
                    <Row label="Rows" value={String(b.rowsAccepted)} mono />
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[11px] text-gray-500">
                {affiliateCode === 'GROUP'
                  ? 'A Group run reads every Live affiliate’s committed data.'
                  : 'No department has committed data for this date yet.'}
              </p>
            )}
            {readiness && readiness.contributors.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Department completeness</p>
                <ul className="space-y-1">
                  {readiness.contributors.map((c) => (
                    <li key={c.contributor} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-600">{c.contributor}</span>
                      <span className={c.submitted ? 'font-bold text-success' : 'font-bold text-warning'}>
                        {c.submitted ? 'Submitted' : 'Missing'}
                      </span>
                    </li>
                  ))}
                </ul>
                {!readiness.isComplete && (
                  <p className="mt-2 text-[10px] leading-relaxed text-warning">
                    This run will proceed with whatever has been submitted - a missing department is not a blocker,
                    but the result reflects an incomplete book.
                  </p>
                )}
              </div>
            )}
            {unreconciledBatches.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-[10px] leading-relaxed text-warning">
                  {unreconciledBatches.length} of {positionBatches.length} position batch
                  {unreconciledBatches.length === 1 ? '' : 'es'} haven&rsquo;t been reconciled to the GL - results
                  will include them anyway.{' '}
                  <Link href="/data/operations/gl-reconciliation" className="font-bold underline">
                    Reconcile first →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </section>
          </div>
        </>
      )}
    </>
  );
}

const input =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-gray-600">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{hint}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? 'font-mono text-navy-900' : 'text-navy-900'}>{value}</dd>
    </div>
  );
}
