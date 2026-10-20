import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { InfoButton } from '@/components/ui/InfoButton';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, useDimensionMembers, usePositions } from '@/lib/hooks';
import { useApprovedRuleIds, useRules } from '@/lib/ruleHooks';
import { useExecuteRun, useReopenRun, useRequestRunSignOff, useRuns } from '@/lib/runHooks';
import {
  buildSeries,
  seriesKeyFor,
  seriesLockReason,
  SIGN_OFF_LABEL,
  SIGN_OFF_TONE,
  signOffStatusOf,
  versionOf,
} from '@/lib/runSeries';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import { approvals } from '@/lib/governanceHooks';
import { pickApprovedRule } from '@/lib/ruleApproval';
import { ALL_ELEMENTS, draftRun } from '@/engine/run';
import { currentPositionBatches, positionBookReadiness } from '@/engine/vintage';
import { unclassifiedProducts } from '@/engine/classification';
import { formatDate } from '@/lib/format';
import { blockerMessages, type RunSelection } from '@/lib/readiness';
import { useReadiness } from '@/lib/readinessHooks';
import { ReadinessChecklist, VerdictBadge } from '@/components/readiness/ReadinessChecklist';
import { DegradationNotice } from '@/components/results/DegradationNotice';
import type { CalculationElement, ProcessRun as Run, ProcessType, RuleMeta } from '@/engine/types';
import type {
  AdjustmentRuleDef,
  BehaviourPatternRule,
  CapitalAllocationRuleDef,
  CostAllocationRuleDef,
  CreditLossRuleDef,
  ForecastScenarioRule,
  FtpRule,
  NewBusinessRule,
  PrepaymentRule,
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
  {
    elements: ['Lcr', 'Nsfr', 'LiquidityGap', 'SurvivalHorizon'],
    label: 'Review Liquidity Risk',
    path: '/risk/liquidity',
  },
  { elements: ['NiiSensitivity', 'EveSensitivity', 'RepricingGap'], label: 'Review IRRBB', path: '/risk/irrbb' },
  { elements: ['TransferPricing', 'TpAdjustments'], label: 'Review Transfer Pricing', path: '/treasury/ftp' },
  { elements: ['ProfitabilityLayers'], label: 'Review Profitability', path: '/treasury/ftp/profitability' },
  {
    elements: ['ProfitabilityRatios', 'FxPosition'],
    label: 'Review Balance Sheet & Treasury',
    path: '/treasury/balance-sheet',
  },
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
  ProfitabilityLayers: 'Multi-layer Profitability (FTP, opex, ECL, capital)',
};

export function ProcessRun() {
  const [, navigate] = useLocation();
  const { hasPermission, user } = useAuth();
  const { affiliateCode, setRun, asOfDate: workingDate } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: products = [] } = useDimensionMembers('Product', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: bucketRules = [] } = useRules('TimeBucket');
  const { data: behaviourRules = [] } = useRules<BehaviourPatternRule>('BehaviourPattern');
  const { data: productRules = [] } = useRules<ProductCharacteristicRule>('ProductCharacteristic');
  const { data: prepaymentRules = [] } = useRules<PrepaymentRule>('Prepayment');
  const { data: scenarios = [] } = useRules<ForecastScenarioRule>('ForecastScenario');
  const { data: newBusiness = [] } = useRules<NewBusinessRule>('NewBusiness');
  const { data: strategies = [] } = useRules<TransactionStrategyRule>('TransactionStrategy');
  const { data: ftpRules = [] } = useRules<FtpRule>('FtpRule');
  const { data: adjustmentRules = [] } = useRules<AdjustmentRuleDef>('AdjustmentRule');
  const { data: costRules = [] } = useRules<CostAllocationRuleDef>('CostAllocation');
  const { data: creditLossRules = [] } = useRules<CreditLossRuleDef>('CreditLoss');
  const { data: capitalRules = [] } = useRules<CapitalAllocationRuleDef>('CapitalAllocation');
  // A stress scenario is free to explore in the What-If Builder unapproved, but consuming one in an
  // official, auditable run needs sign-off first - Submit Scenario -> Approval -> Execute, not just
  // Execute. Unfiltered so a Group-scoped or differently-affiliated scenario's approval still counts.
  const { data: approvalRequests = [] } = approvals.useList();
  const approvedScenarioIds = new Set(
    approvalRequests
      .filter((a) => a.entityType === 'ForecastScenario' && a.status === 'Approved')
      .map((a) => a.entityId),
  );
  // Behaviour patterns, prepayment and product characteristics change how the run calculates, so the
  // same maker-checker applies: a saved rule is only offered here once someone else has approved it.
  const gatedRules = useMemo(
    () => [...behaviourRules, ...productRules, ...prepaymentRules, ...costRules, ...creditLossRules, ...capitalRules],
    [behaviourRules, productRules, prepaymentRules, costRules, creditLossRules, capitalRules],
  );
  const approvedRuleIds = useApprovedRuleIds(gatedRules);
  const approvedOnly = <T extends { id: string }>(rules: T[]) => rules.filter((r) => approvedRuleIds.has(r.id));
  const pendingCount = (rules: Array<{ id: string }>) => rules.length - approvedOnly(rules).length;
  const execute = useExecuteRun();
  const requestSignOff = useRequestRunSignOff();
  const reopen = useReopenRun();
  const canRun = hasPermission('run.execute');
  const [reopenReason, setReopenReason] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [signOffRequested, setSignOffRequested] = useState<string | null>(null);

  const affiliate = affiliates.find((a) => a.code === affiliateCode) ?? affiliates.find((a) => a.code !== 'GROUP');
  // Only a Live affiliate's book is considered part of the Group consolidation - one still in
  // Onboarding/Testing, or Suspended, hasn't (or no longer) signed off its data for this to be safe.
  const liveAffiliates = affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');

  const [name, setName] = useState('');
  const [processType, setProcessType] = useState<ProcessType>('Static');
  const [orgUnitCodes, setOrgUnitCodes] = useState<string[]>([]);
  const [productCodes, setProductCodes] = useState<string[]>([]);
  const [elements, setElements] = useState<CalculationElement[]>(ALL_ELEMENTS);
  // Calculation rules, like the profitability rules below: null = not touched yet, so the rule in force
  // for this scope (the affiliate's own, else the Group default - approved, for a gated kind) is
  // pre-selected. Otherwise a preset run silently ignores the FTP rule, product classification and the
  // behavioural fits someone just took through maker-checker, unless the user knows to open Customize.
  const [bucketRuleChoice, setBucketRuleId] = useState<string | null>(null);
  const [behaviourRuleChoice, setBehaviourRuleId] = useState<string | null>(null);
  const [productRuleChoice, setProductRuleId] = useState<string | null>(null);
  const [prepaymentRuleChoice, setPrepaymentRuleId] = useState<string | null>(null);
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);
  const [newBusinessId, setNewBusinessId] = useState('');
  const [strategyId, setStrategyId] = useState('');
  const [ftpRuleChoice, setFtpRuleId] = useState<string | null>(null);
  const [adjustmentRuleChoice, setAdjustmentRuleId] = useState<string | null>(null);
  // Profitability rules: null = not touched yet, so the approved rule for this scope is pre-selected (the
  // affiliate's own, else the Group default) - a preset run picks them up without opening Customize.
  const [costRuleChoice, setCostRuleChoice] = useState<string | null>(null);
  const [creditLossRuleChoice, setCreditLossRuleChoice] = useState<string | null>(null);
  const [capitalRuleChoice, setCapitalRuleChoice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ run: Run; count: number } | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetId | null>(null);
  const [customizing, setCustomizing] = useState(false);

  // Gated kinds need an approved version; the rest (time buckets, FTP, adjustments) carry no approval, so
  // the latest active rule for the scope is the one in force.
  const autoPickActive = (rules: RuleMeta[]) => {
    const active = rules.filter((r) => r.isActive);
    const latest = (list: RuleMeta[]) =>
      [...list].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0]?.id ?? '';
    const own = affiliateCode !== 'GROUP' ? latest(active.filter((r) => r.affiliateCode === affiliateCode)) : '';
    return own || latest(active.filter((r) => r.affiliateCode === null));
  };
  const autoPickApproved = (rules: RuleMeta[]) => pickApprovedRule(rules, affiliateCode, approvalRequests)?.id ?? '';
  const bucketRuleId = bucketRuleChoice ?? autoPickActive(bucketRules);
  const behaviourRuleId = behaviourRuleChoice ?? autoPickApproved(behaviourRules);
  const productRuleId = productRuleChoice ?? autoPickApproved(productRules);
  const prepaymentRuleId = prepaymentRuleChoice ?? autoPickApproved(prepaymentRules);
  const ftpRuleId = ftpRuleChoice ?? autoPickActive(ftpRules);
  const adjustmentRuleId = adjustmentRuleChoice ?? autoPickActive(adjustmentRules);

  const applyPreset = (preset: Preset) => {
    setElements(preset.elements);
    setProcessType(preset.processType);
    // Only Approved scenarios - a preset is meant to run cleanly, not surface an approval blocker
    // for some unrelated scenario someone left pending in the What-If Builder.
    setScenarioIds(
      preset.useAllScenarios ? scenarios.filter((s) => approvedScenarioIds.has(s.id)).map((s) => s.id) : [],
    );
    setSelectedPreset(preset.id);
    setCustomizing(preset.id === 'custom');
  };

  // The working date from the header - the run inherits it, no per-screen picker.
  const effectiveDate = workingDate ?? '';

  // Run series for this scope and date: each execution is the next version; a signed-off (or pending)
  // series is locked until it is reopened (or the sign-off request is decided).
  const { data: scopeRunsAll = [] } = useRuns(affiliate?.code);
  const scopeRuns = useMemo(
    () => scopeRunsAll.filter((r) => r.affiliateCode === affiliate?.code),
    [scopeRunsAll, affiliate?.code],
  );
  const currentSeries = useMemo(() => {
    if (!affiliate || !effectiveDate) return null;
    const key = seriesKeyFor(affiliate.code, effectiveDate);
    return buildSeries(scopeRuns).find((x) => x.key === key) ?? null;
  }, [scopeRuns, affiliate, effectiveDate]);
  const seriesLock = seriesLockReason(currentSeries, scopeRuns);
  const lockedLatest = seriesLock ? (currentSeries?.latest ?? null) : null;
  const canWriteScope = !isRestrictedToOwnAffiliate(user, hasPermission) || user?.affiliateCode === affiliate?.code;
  const nextVersionNo = currentSeries?.latest ? versionOf(currentSeries.latest, scopeRuns) + 1 : 1;
  // Every department's current Positions batch for this affiliate/date - the book is whatever combination of
  // Loans/Deposits/Treasury (plus any legacy pre-contributor load) has been committed, not a single file.
  // For a Group run there is no batch filed under the GROUP code itself - the book is the union of every
  // Live affiliate's own current batches, pinned here so the run is reproducible the same way a single
  // affiliate's run already is (a later reload never changes what an already-executed run reports).
  const positionBatches =
    affiliateCode === 'GROUP'
      ? effectiveDate
        ? liveAffiliates.flatMap((a) => currentPositionBatches(batches, a.code, effectiveDate))
        : []
      : affiliate && effectiveDate
        ? currentPositionBatches(batches, affiliate.code, effectiveDate)
        : [];
  // Per-department readiness is affiliate-specific and meaningless for the GROUP pseudo-entity itself.
  const bookReadiness =
    affiliate && effectiveDate && affiliateCode !== 'GROUP'
      ? positionBookReadiness(affiliate, batches, effectiveDate)
      : null;
  // Informational only - reconciliation status is visible here, not a run blocker (see `blockers` below).
  const unreconciledBatches = positionBatches.filter((b) => !b.reconciledAt);

  const { data: scopedPositions = [] } = usePositions(affiliate?.code, effectiveDate || undefined);
  const selectedProductRule = productRules.find((r) => r.id === productRuleId);
  const unclassified = selectedProductRule
    ? unclassifiedProducts(scopedPositions, selectedProductRule.assumptions)
    : [];

  const reportingCurrency = affiliateCode === 'GROUP' ? 'USD' : (affiliate?.functionalCurrency ?? 'USD');

  const unapprovedScenarios = scenarioIds
    .filter((id) => !approvedScenarioIds.has(id))
    .map((id) => scenarios.find((s) => s.id === id)?.name ?? id);
  // A rule picked while approved can lose that status (edited to a new version) before Execute.
  const unapprovedRules = [
    productRuleId,
    behaviourRuleId,
    prepaymentRuleId,
    costRuleChoice,
    creditLossRuleChoice,
    capitalRuleChoice,
  ]
    .filter((id) => id && !approvedRuleIds.has(id))
    .map((id) => gatedRules.find((r) => r.id === id)?.name ?? id);

  // Pre-flight: the shared readiness model (lib/readiness.ts) - the same check Home shows - plus what this
  // screen has chosen. Only the six hard blockers stop the run; everything else runs and is labelled.
  const selection = useMemo<RunSelection>(
    () => ({
      elements,
      unapproved: [...unapprovedRules, ...unapprovedScenarios.map((n) => `scenario ${n}`)].filter(
        (x): x is string => !!x,
      ),
      extra: processType === 'Dynamic' && !newBusinessId ? ['A dynamic run needs a new-business rule.'] : [],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed from the chosen ids, not array identity
    [elements, unapprovedRules.join('|'), unapprovedScenarios.join('|'), processType, newBusinessId],
  );
  const { readiness } = useReadiness(affiliate?.code ?? null, effectiveDate || null, selection);
  // The banner above the pre-flight explains a locked date (with Reopen…); the checklist keeps the rest.
  const otherBlockers = (readiness?.blockers ?? []).filter((b) => !(seriesLock && lockedLatest && b.key === 'series'));
  const blockers: string[] = !affiliate
    ? ['No affiliate selected.']
    : readiness
      ? blockerMessages(readiness)
      : ['Checking readiness…'];
  const [showPreflight, setShowPreflight] = useState(false);

  const autoPick = (rules: Array<CostAllocationRuleDef | CreditLossRuleDef | CapitalAllocationRuleDef>) =>
    pickApprovedRule(rules, affiliateCode, approvalRequests)?.id ?? '';
  const costRuleId = costRuleChoice ?? autoPick(costRules);
  const creditLossRuleId = creditLossRuleChoice ?? autoPick(creditLossRules);
  const capitalRuleId = capitalRuleChoice ?? autoPick(capitalRules);

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
      prepaymentRuleId: prepaymentRuleId || null,
      forecastScenarioIds: scenarioIds,
      newBusinessRuleId: newBusinessId || null,
      transactionStrategyId: strategyId || null,
      ftpRuleId: ftpRuleId || null,
      adjustmentRuleId: adjustmentRuleId || null,
      costAllocationRuleId: costRuleId || null,
      creditLossRuleId: creditLossRuleId || null,
      capitalRuleId: capitalRuleId || null,
    };

    setActionError(null);
    setSignOffRequested(null);
    try {
      const result = await execute.mutateAsync(run);
      setOutcome({ run: result.run, count: result.results.length });
      if (result.run.status === 'Completed') setRun(result.run);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRequestSignOff = async (target: Run) => {
    setActionError(null);
    try {
      await requestSignOff.mutateAsync({ run: target, allRuns: scopeRuns, affiliateName: affiliate?.name });
      setSignOffRequested(target.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReopen = async () => {
    if (!lockedLatest) return;
    setActionError(null);
    try {
      await reopen.mutateAsync({ run: lockedLatest, reason: reopenReason, allRuns: scopeRuns });
      setReopenOpen(false);
      setReopenReason('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <ModuleHeader
        title="Run now"
        description="Compose a run from a date, a scope, a rule set and a scenario."
        about="Each execution is a new version of that date's run - provisional until a second person signs it off."
        asOfDate={effectiveDate || null}
        scope={affiliate?.name ?? 'No affiliate'}
        currency={reportingCurrency}
        metrics={[
          {
            label: 'Process type',
            value: processType,
            about:
              'Static models the existing book running off; Dynamic layers a New Business rule’s growth assumptions on top.',
          },
          {
            label: 'Elements',
            value: `${elements.length}/${ALL_ELEMENTS.length}`,
            about:
              'How many of the available calculation elements this run will compute - fewer elements means a lighter, faster run.',
          },
          {
            label: 'Contributors',
            value: positionBatches.length > 0 ? `${positionBatches.length} batch(es)` : '-',
            about:
              'Every department’s current Positions batch this run will pin to, combined - reloading data later never changes what this run reports.',
          },
          {
            label: 'Ready',
            value: blockers.length === 0 ? 'Yes' : `${blockers.length} blocker(s)`,
            tone: blockers.length === 0 ? 'success' : 'danger',
            about:
              'Whether every precondition is met - a missing FX rate, an unselected element or an incomplete scope all block execution rather than letting the run fail silently.',
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={!canRun || blockers.length > 0 || execute.isPending}
            title={blockers[0]}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            {execute.isPending ? 'Running…' : `Execute run (v${nextVersionNo})`}
          </button>
        }
      />

      {actionError && (
        <div role="alert" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[13px] text-danger">
          {actionError}
        </div>
      )}

      {seriesLock && lockedLatest && (
        <div className="mb-6 rounded-lg border border-navy-700/20 bg-navy-50 px-4 py-3 text-[13px] leading-relaxed text-navy-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {signOffStatusOf(lockedLatest) === 'SignedOff' ? (
              <span>
                <span className="font-bold">
                  {formatDate(lockedLatest.asOfDate)} is signed off (v{versionOf(lockedLatest, scopeRuns)}
                  {lockedLatest.signOff?.signedOffBy ? `, by ${lockedLatest.signOff.signedOffBy}` : ''}) - its figures
                  are final.
                </span>{' '}
                To run this date again, reopen it: the signed-off version stays on record and the new run becomes the
                next version.
              </span>
            ) : (
              <span>
                <span className="font-bold">{seriesLock}</span> See Approvals for the pending request.
              </span>
            )}
            <span className="flex gap-2">
              {signOffStatusOf(lockedLatest) === 'SignedOff' && (
                <button
                  type="button"
                  onClick={() => setReopenOpen(true)}
                  disabled={!canRun || !canWriteScope}
                  title={!canRun || !canWriteScope ? 'Reopening needs run.execute for this scope' : undefined}
                  className="rounded border border-warning bg-white px-3 py-1 text-[12px] font-bold text-warning hover:bg-warning-bg disabled:opacity-40"
                >
                  Reopen…
                </button>
              )}
              <Link
                href={`/execution/history?run=${lockedLatest.id}`}
                className="rounded border border-gray-200 bg-white px-3 py-1 text-[12px] font-bold text-navy-900 hover:border-navy-700"
              >
                Open in Runs
              </Link>
            </span>
          </div>
          {reopenOpen && (
            <div className="mt-3 border-t border-navy-700/10 pt-3">
              <label htmlFor="reopen-reason" className="mb-1 block text-[12px] font-bold">
                Reason for reopening
              </label>
              <textarea
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={2}
                className={input}
                placeholder="e.g. Late GL adjustment to Treasury balances"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReopenOpen(false)}
                  className="rounded border border-gray-200 bg-white px-3 py-1 text-[12px] font-bold text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleReopen()}
                  disabled={!reopenReason.trim() || reopen.isPending}
                  className="rounded bg-warning px-3 py-1 text-[12px] font-bold text-white disabled:opacity-40"
                >
                  Reopen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pre-flight: what blocks the run (with who can fix it), and what it would compute without. */}
      <div data-tour="preflight" className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Pre-flight check</h2>
            {readiness && <VerdictBadge verdict={readiness.verdict} />}
            <span className="text-[12px] text-gray-500">
              {affiliate?.name ?? 'No affiliate'} · as of{' '}
              {effectiveDate ? formatDate(effectiveDate) : 'no committed data yet'}
              <span className="text-gray-400"> (change the date in the header)</span>
            </span>
          </div>
          {readiness && readiness.warnings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPreflight((v) => !v)}
              className="text-[12px] font-bold text-navy-700 hover:underline"
            >
              {showPreflight
                ? 'Hide details'
                : `${readiness.warnings.length} item(s) will run with something missing - show`}
            </button>
          )}
        </div>
        {currentSeries?.latest &&
          !(seriesLock && lockedLatest) &&
          (() => {
            // Sign-off status of this date's latest version, linking to its request while it waits.
            const latest = currentSeries.latest;
            const st = signOffStatusOf(latest);
            const req = approvalRequests.find(
              (r) => r.module === 'Runs' && r.entityId === latest.id && r.status === 'Pending',
            );
            return (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
                <span>
                  Latest for this date: <span className="font-bold text-navy-900">v{versionOf(latest, scopeRuns)}</span>
                </span>
                <StatusBadge status={SIGN_OFF_LABEL[st]} tone={SIGN_OFF_TONE[st]} />
                {st === 'SignedOff' && latest.signOff?.signedOffBy && <span>by {latest.signOff.signedOffBy}</span>}
                {st === 'Open' && latest.signOff?.rejectReason && (
                  <span className="text-danger">Last sign-off rejected: {latest.signOff.rejectReason}</span>
                )}
                {req ? (
                  <Link
                    href={`/controls?request=${encodeURIComponent(req.id)}`}
                    className="font-bold text-navy-700 hover:underline"
                  >
                    Open the sign-off request
                  </Link>
                ) : (
                  <Link
                    href={`/execution/history?run=${latest.id}`}
                    className="font-bold text-navy-700 hover:underline"
                  >
                    Open in Runs
                  </Link>
                )}
              </p>
            );
          })()}
        {!readiness && blockers.length > 0 && <p className="mt-2 text-[13px] text-danger">{blockers[0]}</p>}
        {readiness && otherBlockers.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg bg-danger-bg px-4 py-2">
            <p className="text-[13px] font-bold text-danger">Cannot run yet.</p>
            <ReadinessChecklist readiness={{ ...readiness, items: otherBlockers }} />
          </div>
        )}
        {readiness && otherBlockers.length === 0 && seriesLock && lockedLatest && (
          <p className="mt-2 text-[12px] text-gray-600">
            Everything else is ready -{' '}
            {signOffStatusOf(lockedLatest) === 'SignedOff'
              ? 'reopen the date above to run it again.'
              : 'the run can start once the pending sign-off is decided.'}
          </p>
        )}
        {readiness && showPreflight && readiness.warnings.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <p className="mb-2 text-[12px] text-gray-500">
              These do not stop the run - the affected outputs are labelled on the results.
            </p>
            <ReadinessChecklist readiness={{ ...readiness, items: readiness.warnings }} />
          </div>
        )}
      </div>

      {outcome && (
        <div
          role="status"
          className={cn(
            'mb-6 rounded-lg px-4 py-3 text-[13px] leading-relaxed',
            outcome.run.status === 'Completed' ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
          )}
        >
          {outcome.run.status === 'Completed' ? (
            <>
              <span className="font-bold">
                v{outcome.run.version ?? 1} of {affiliate?.name ?? outcome.run.affiliateCode}{' '}
                {formatDate(outcome.run.asOfDate)} created
              </span>{' '}
              - {outcome.count} element(s) computed; provisional until signed off.{' '}
              {signOffRequested === outcome.run.id ? (
                <span className="font-bold">Sign-off requested - a different user approves it in Approvals.</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRequestSignOff(outcome.run)}
                  disabled={!canRun || !canWriteScope || requestSignOff.isPending}
                  className="rounded bg-success px-2.5 py-0.5 font-bold text-white hover:bg-success/80 disabled:opacity-40"
                >
                  Request sign-off
                </button>
              )}
              {' · '}
              <button
                type="button"
                onClick={() => navigate(`/execution/history?run=${outcome.run.id}`)}
                className="font-bold underline hover:no-underline"
              >
                View in Runs
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
      {outcome && outcome.run.status === 'Completed' && <DegradationNotice run={outcome.run} />}

      {!customizing ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-[13px] font-bold uppercase tracking-widest text-navy-900">Choose what to run</h2>
            <p className="mb-4 text-[12px] text-gray-500">
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
                    selectedPreset === p.id ? 'border-navy-700 bg-navy-50' : 'border-gray-200 hover:border-navy-700',
                  )}
                >
                  <p className="text-[14px] font-bold text-navy-900">{p.label}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{p.description}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedPreset && selectedPreset !== 'custom' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Run summary</h2>
                <button
                  type="button"
                  onClick={() => setCustomizing(true)}
                  className="text-[12px] font-bold text-navy-700 hover:underline"
                >
                  Customize →
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-[12px] md:grid-cols-4">
                <Row label="Affiliate" value={affiliate?.name ?? '-'} />
                <Row label="Elements" value={`${elements.length} selected`} />
                <Row
                  label="Scenarios"
                  value={scenarioIds.length > 0 ? `${scenarioIds.length} selected` : 'Base case only'}
                />
                <Row
                  label="Rules"
                  value={
                    [
                      behaviourRuleId && 'behaviour',
                      productRuleId && 'classification',
                      prepaymentRuleId && 'prepayment',
                      ftpRuleId && 'FTP',
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Engine defaults'
                  }
                />
                {elements.includes('ProfitabilityLayers') && (
                  <Row
                    label="Profitability rules"
                    value={
                      [costRuleId, creditLossRuleId, capitalRuleId].filter(Boolean).length === 3
                        ? 'Cost, credit loss & capital (approved)'
                        : `${[costRuleId, creditLossRuleId, capitalRuleId].filter(Boolean).length}/3 selected`
                    }
                  />
                )}
              </dl>
              <p className="mt-4 border-t border-gray-100 pt-3 text-[12px] text-gray-500">
                As of{' '}
                <span className="font-mono font-bold text-navy-900">
                  {effectiveDate ? formatDate(effectiveDate) : '-'}
                </span>{' '}
                - the working date chosen in the header.
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setCustomizing(false)}
            className="mb-4 text-[12px] font-bold text-navy-700 hover:underline"
          >
            ← Back to presets
          </button>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-[13px] font-bold uppercase tracking-widest text-navy-900">Run definition</h2>
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
                  <Field label="As-of date" hint="The working date chosen in the header.">
                    <input
                      value={effectiveDate ? formatDate(effectiveDate) : 'No committed data'}
                      readOnly
                      className={`${input} bg-gray-50 font-mono`}
                      aria-label="As-of date"
                    />
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
                    <input
                      value={reportingCurrency}
                      readOnly
                      className={`${input} bg-gray-50 font-mono`}
                      aria-label="Reporting currency"
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-1.5">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Scope</h2>
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
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">
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
                          setElements(e.target.checked ? [...elements, element] : elements.filter((x) => x !== element))
                        }
                        className="accent-gold-500"
                      />
                      <label htmlFor={`el-${element}`} className="cursor-pointer text-[13px] text-gray-700">
                        {ELEMENT_LABELS[element]}
                      </label>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-3 border-t border-gray-50 pt-3">
                  <button
                    type="button"
                    onClick={() => setElements(ALL_ELEMENTS)}
                    className="text-[12px] font-bold text-navy-700 hover:text-navy-900"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setElements([])}
                    className="text-[12px] font-bold text-gray-500 hover:text-navy-900"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setElements(['Lcr', 'SurvivalHorizon', 'Concentration'])}
                    className="text-[12px] font-bold text-navy-700 hover:text-navy-900"
                  >
                    Daily liquidity only
                  </button>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-1.5">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Rules</h2>
                  <InfoButton label="What happens when a rule is left unselected">
                    A rule left unselected falls back to the engine default, and the result says which basis it used.
                  </InfoButton>
                </div>
                <div className="space-y-3">
                  <Field label="Time bucket rule">
                    <select
                      value={bucketRuleId}
                      onChange={(e) => setBucketRuleId(e.target.value)}
                      className={input}
                      aria-label="Time bucket rule"
                    >
                      <option value="">- standard ladder -</option>
                      {bucketRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Product characteristics"
                    hint="Overrides HQLA level, haircuts and ASF/RSF factors by product/currency at run time - a department uploading data never has to know these."
                  >
                    <select
                      value={productRuleId}
                      onChange={(e) => setProductRuleId(e.target.value)}
                      className={input}
                      aria-label="Product characteristics rule"
                    >
                      <option value="">- position data as loaded, unclassified -</option>
                      {approvedOnly(productRules).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <PendingNote count={pendingCount(productRules)} />
                    {selectedProductRule && unclassified.length > 0 && (
                      <p className="mt-1 text-[11px] leading-relaxed text-warning">
                        {unclassified.reduce((s, u) => s + u.count, 0)} position(s) across {unclassified.length}{' '}
                        product/currency combination(s) aren&rsquo;t covered by this rule and will keep whatever
                        classification was loaded - e.g. {unclassified[0]!.productCode} ({unclassified[0]!.currency}).
                      </p>
                    )}
                  </Field>
                  <Field label="Behaviour patterns">
                    <select
                      value={behaviourRuleId}
                      onChange={(e) => setBehaviourRuleId(e.target.value)}
                      className={input}
                      aria-label="Behaviour pattern rule"
                    >
                      <option value="">- none, contractual timing -</option>
                      {approvedOnly(behaviourRules).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <PendingNote count={pendingCount(behaviourRules)} />
                  </Field>
                  <Field
                    label="Prepayment rule"
                    hint="Re-dates loan principal by a constant prepayment rate in the behavioural gap, repricing gap and NII. Left unselected, loans run off on contractual terms."
                  >
                    <select
                      value={prepaymentRuleId}
                      onChange={(e) => setPrepaymentRuleId(e.target.value)}
                      className={input}
                      aria-label="Prepayment rule"
                    >
                      <option value="">- none, contractual timing -</option>
                      {approvedOnly(prepaymentRules).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <PendingNote count={pendingCount(prepaymentRules)} />
                  </Field>
                  <Field
                    label="FTP rule"
                    hint="Prices the Funds Transfer Pricing and FTP Adjustments elements. Left unselected, transfer pricing is left blank and the run says so."
                  >
                    <select
                      value={ftpRuleId}
                      onChange={(e) => setFtpRuleId(e.target.value)}
                      className={input}
                      aria-label="FTP rule"
                    >
                      <option value="">- none, transfer pricing left blank -</option>
                      {ftpRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Adjustment rule"
                    hint="Stacks named add-ons (liquidity premium, basis risk, pricing incentive) onto the FTP rule's base transfer rate. Left unselected, the rate is the base curve alone."
                  >
                    <select
                      value={adjustmentRuleId}
                      onChange={(e) => setAdjustmentRuleId(e.target.value)}
                      className={input}
                      aria-label="Adjustment rule"
                    >
                      <option value="">- none -</option>
                      {adjustmentRules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Multi-layer profitability
                    </p>
                    <div className="space-y-3">
                      <Field
                        label="Cost allocation rule"
                        hint="Operating-expense pools spread over the book. Amounts must be in the run's reporting currency."
                      >
                        <select
                          value={costRuleId}
                          onChange={(e) => setCostRuleChoice(e.target.value)}
                          className={input}
                          aria-label="Cost allocation rule"
                        >
                          <option value="">- none, profitability layers left blank -</option>
                          {approvedOnly(costRules).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} ({r.currency})
                            </option>
                          ))}
                        </select>
                        <PendingNote count={pendingCount(costRules)} />
                      </Field>
                      <Field label="Credit loss rule" hint="PD x LGD per product, or booked provisions.">
                        <select
                          value={creditLossRuleId}
                          onChange={(e) => setCreditLossRuleChoice(e.target.value)}
                          className={input}
                          aria-label="Credit loss rule"
                        >
                          <option value="">- none, profitability layers left blank -</option>
                          {approvedOnly(creditLossRules).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <PendingNote count={pendingCount(creditLossRules)} />
                      </Field>
                      <Field
                        label="Capital rule"
                        hint="Risk weights, capital ratio and cost of capital - the capital charge and RAROC."
                      >
                        <select
                          value={capitalRuleId}
                          onChange={(e) => setCapitalRuleChoice(e.target.value)}
                          className={input}
                          aria-label="Capital rule"
                        >
                          <option value="">- none, profitability layers left blank -</option>
                          {approvedOnly(capitalRules).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <PendingNote count={pendingCount(capitalRules)} />
                      </Field>
                    </div>
                  </div>
                  {processType === 'Dynamic' && (
                    <Field label="New business" hint="Required for a dynamic run.">
                      <select
                        value={newBusinessId}
                        onChange={(e) => setNewBusinessId(e.target.value)}
                        className={input}
                        aria-label="New business rule"
                      >
                        <option value="">- select -</option>
                        {newBusiness.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field
                    label="Transaction strategy"
                    hint="Pinned to the run for record-keeping; does not yet change any calculated element."
                  >
                    <select
                      value={strategyId}
                      onChange={(e) => setStrategyId(e.target.value)}
                      className={input}
                      aria-label="Transaction strategy"
                    >
                      <option value="">- none -</option>
                      {strategies.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">Rate scenarios</h2>
                {scenarios.length === 0 ? (
                  <p className="text-[12px] text-gray-500">
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
                        <label htmlFor={`sc-${s.id}`} className="cursor-pointer text-[13px]">
                          <span className="flex items-center gap-1.5">
                            <span className="text-navy-900">{s.name}</span>
                            {!approvedScenarioIds.has(s.id) && (
                              <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-bold uppercase text-warning">
                                Pending approval
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] text-gray-500">{s.description || 'No description'}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-3 flex items-center gap-1.5">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">
                    Position Book - contributors
                  </h2>
                  <InfoButton label="Why the run pins every contributor's version">
                    The book is assembled from however many departments have submitted for this date - the run pins
                    every one of their current versions, combined. Reloading a department's data later creates a new
                    version for that department only; this run keeps reporting what it actually computed.
                  </InfoButton>
                </div>
                {positionBatches.length > 0 ? (
                  <dl className="space-y-3 text-[12px]">
                    {positionBatches.map((b) => (
                      <div key={b.id} className="border-b border-gray-50 pb-2 last:border-0">
                        <Row label={b.contributor ?? 'Positions (whole book)'} value={`${b.id} · v${b.version}`} mono />
                        <Row label="Rows" value={String(b.rowsAccepted)} mono />
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-[12px] text-gray-500">
                    {affiliateCode === 'GROUP'
                      ? 'A Group run reads every Live affiliate’s committed data.'
                      : 'No department has committed data for this date yet.'}
                  </p>
                )}
                {bookReadiness && !bookReadiness.legacyBatch && bookReadiness.contributors.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Department completeness
                    </p>
                    <ul className="space-y-1">
                      {bookReadiness.contributors.map((c) => (
                        <li key={c.contributor} className="flex items-center justify-between text-[12px]">
                          <span className="text-gray-600">{c.contributor}</span>
                          <span className={c.submitted ? 'font-bold text-success' : 'font-bold text-warning'}>
                            {c.submitted ? 'Submitted' : 'Missing'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!bookReadiness.isComplete && (
                      <p className="mt-2 text-[11px] leading-relaxed text-warning">
                        This run will proceed with whatever has been submitted - a missing department is not a blocker,
                        but the result reflects an incomplete book.
                      </p>
                    )}
                  </div>
                )}
                {unreconciledBatches.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-[11px] leading-relaxed text-warning">
                      {unreconciledBatches.length} of {positionBatches.length} position batch
                      {unreconciledBatches.length === 1 ? '' : 'es'} haven&rsquo;t been reconciled to the GL - results
                      will include them anyway.{' '}
                      <Link href="/data/operations?domain=GeneralLedger" className="font-bold underline">
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
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[12px] font-medium text-gray-600">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{hint}</p>}
    </div>
  );
}

function PendingNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-warning">
      {count} rule{count === 1 ? '' : 's'} pending approval - not selectable until a second user approves in{' '}
      <Link href="/controls" className="font-bold underline">
        Approvals
      </Link>
      .
    </p>
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
