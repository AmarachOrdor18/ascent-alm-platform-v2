/**
 * The process-run orchestrator.
 *
 * This is the concept that makes the platform an ALM system rather than a
 * reporting layer (build plan §10). A run is:
 *
 *   as-of date + scope + reporting currency + rule set + scenario
 *     → an immutable, named, timestamped result set
 *
 * Results screens read *from a run*, never from live recomputation. That
 * gives reproducibility, run-to-run comparison, an audit trail, and a real
 * answer to "what assumptions produced this number?".
 *
 * It is also why the v1 affiliate-switcher defect cannot recur: a run is
 * scoped by construction, so there is no unscoped query to write.
 */

import type {
  CalculationElement,
  CurrencyCode,
  DimensionMember,
  IsoDate,
  Position,
  ProcessRun,
  RunError,
  RunResult,
  TimeBucketLadder,
} from './types';
import { missingRates, type FxTable } from './fx';
import { filterByDimension } from './dimensions';
import { applyBehaviouralMaturity, computeDepositRunoff, type BehaviourPattern } from './behavioural';
import {
  computeConcentration,
  computeLcr,
  computeLiquidityGap,
  computeLoanToDeposit,
  computeNsfr,
  type LiquidityContext,
} from './liquidity';
import {
  computeEquity,
  computeEveSensitivity,
  computeNiiSensitivity,
  computeRepricingGap,
  type IrrbbContext,
} from './irrbb';
import {
  computeCounterbalancingCapacity,
  computeSurvivalHorizon,
  severeOutflowProfile,
  type StressContext,
} from './stress';
import { computeFxPosition, computeProfitability, type ProfitabilityContext } from './profitability';

export interface RunInputs {
  positions: Position[];
  fx: FxTable;
  liquidityLadder: TimeBucketLadder;
  repricingLadder: TimeBucketLadder;
  behaviourPatterns: BehaviourPattern[];
  orgUnitMembers: DimensionMember[];
  productMembers: DimensionMember[];
  /** Regulatory Tier 1 where known; null falls back to balance-sheet equity, and the result says so. */
  tier1Capital: number | null;
  /** Total stressed outflow for the survival-horizon scenario. */
  stressedOutflow?: number;
  shockBps?: number;
}

export interface RunOutcome {
  run: ProcessRun;
  results: RunResult[];
  errors: RunError[];
}

let resultCounter = 0;
function resultId(runId: string, element: CalculationElement): string {
  resultCounter += 1;
  return `${runId}-${element}-${resultCounter}`;
}

/**
 * Execute a run.
 *
 * Each element is computed independently and a failure in one is recorded
 * against the run rather than aborting the whole thing — Oracle's processing
 * error log works the same way (ALM UG §7.25), and a single unpriced
 * position should not cost you the entire liquidity report.
 */
export function executeRun(run: ProcessRun, inputs: RunInputs, now: string): RunOutcome {
  const errors: RunError[] = [];
  const results: RunResult[] = [];

  // Scope first. Everything downstream sees only positions in scope.
  let scoped = inputs.positions.filter(
    (p) => p.asOfDate === run.asOfDate && (run.affiliateCode === 'GROUP' || p.affiliateCode === run.affiliateCode),
  );
  if (run.orgUnitCodes?.length) {
    scoped = filterByDimension(scoped, 'OrgUnit', run.orgUnitCodes, inputs.orgUnitMembers);
  }
  if (run.productCodes?.length) {
    scoped = filterByDimension(scoped, 'Product', run.productCodes, inputs.productMembers);
  }
  if (run.positionBatchIds.length > 0) {
    const pinned = new Set(run.positionBatchIds);
    scoped = scoped.filter((p) => pinned.has(p.batchId));
  }

  // A missing FX rate must stop the run. Producing a figure that silently
  // omits a currency is the exact failure this platform exists to avoid.
  const currencies = Array.from(new Set(scoped.map((p) => p.currency)));
  const missing = missingRates(currencies, run.reportingCurrency, inputs.fx);
  if (missing.length > 0) {
    return {
      run: {
        ...run,
        status: 'Failed',
        completedAt: now,
        errorLog: [
          {
            positionId: null,
            code: 'FX_RATE_MISSING',
            message: `No FX rate to convert ${missing.join(', ')} into ${run.reportingCurrency}. Load the missing rates and re-run.`,
          },
        ],
      },
      results: [],
      errors,
    };
  }

  if (scoped.length === 0) {
    return {
      run: {
        ...run,
        status: 'Failed',
        completedAt: now,
        errorLog: [
          {
            positionId: null,
            code: 'NO_POSITIONS_IN_SCOPE',
            message: `No committed positions for ${run.affiliateCode} as at ${run.asOfDate} within the selected scope.`,
          },
        ],
      },
      results: [],
      errors,
    };
  }

  const shockBps = inputs.shockBps ?? 200;
  const liquidityCtx: LiquidityContext = {
    asOfDate: run.asOfDate,
    reportingCurrency: run.reportingCurrency,
    fx: inputs.fx,
  };
  const stressCtx: StressContext = liquidityCtx;
  const profitabilityCtx: ProfitabilityContext = { reportingCurrency: run.reportingCurrency, fx: inputs.fx };
  const irrbbCtx: IrrbbContext = { ...liquidityCtx, tier1Capital: inputs.tier1Capital };

  const record = (element: CalculationElement, compute: () => { payload: unknown; methodology: string }) => {
    if (!run.elements.includes(element)) return;
    try {
      const { payload, methodology } = compute();
      results.push({ id: resultId(run.id, element), runId: run.id, element, payload, methodology, computedAt: now });
    } catch (err) {
      errors.push({
        positionId: null,
        code: `${element}_FAILED`,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  record('Lcr', () => {
    const r = computeLcr(scoped, liquidityCtx);
    return { payload: r, methodology: r.methodology };
  });

  record('Nsfr', () => {
    const r = computeNsfr(scoped, liquidityCtx);
    return { payload: r, methodology: r.methodology };
  });

  record('LoanToDeposit', () => {
    const r = computeLoanToDeposit(scoped, liquidityCtx);
    return { payload: r, methodology: r.methodology };
  });

  record('Concentration', () => {
    const r = computeConcentration(scoped, liquidityCtx);
    return { payload: r, methodology: r.methodology };
  });

  record('LiquidityGap', () => {
    // Both bases are computed so the screen can show them side by side
    // rather than as a toggle — v1's toggle rendered identical data.
    const contractual = computeLiquidityGap(scoped, liquidityCtx, inputs.liquidityLadder, 'Contractual');
    const behavioural = computeLiquidityGap(
      applyBehaviouralMaturity(scoped, run.asOfDate, inputs.behaviourPatterns),
      liquidityCtx,
      inputs.liquidityLadder,
      'Behavioural',
    );
    return {
      payload: { contractual, behavioural, runoff: computeDepositRunoff(scoped, inputs.behaviourPatterns) },
      methodology: `${contractual.methodology} Behavioural basis re-dates non-maturity deposits by their behaviour pattern.`,
    };
  });

  record('RepricingGap', () => {
    const r = computeRepricingGap(scoped, irrbbCtx, inputs.repricingLadder);
    return { payload: r, methodology: r.methodology };
  });

  record('NiiSensitivity', () => {
    const r = computeNiiSensitivity(scoped, irrbbCtx, shockBps);
    return { payload: r, methodology: r.methodology };
  });

  record('EveSensitivity', () => {
    const r = computeEveSensitivity(scoped, irrbbCtx, shockBps);
    return { payload: r, methodology: r.methodology };
  });

  record('SurvivalHorizon', () => {
    const capacity = computeCounterbalancingCapacity(scoped, stressCtx);
    // Default the stressed outflow to total 30-day gross outflows doubled —
    // a severe but derived assumption, stated in the methodology rather than
    // hidden as a magic number.
    const grossOutflows = computeLcr(scoped, liquidityCtx).grossOutflows;
    const totalOutflow = inputs.stressedOutflow ?? grossOutflows * 2;
    const r = computeSurvivalHorizon(capacity.total, severeOutflowProfile(totalOutflow), stressCtx);
    return {
      payload: { ...r, counterbalancingCapacity: capacity },
      methodology: `${r.methodology} Opening buffer is counterbalancing capacity, not HQLA alone. ${
        inputs.stressedOutflow === undefined
          ? 'Stressed outflow defaults to twice gross 30-day LCR outflows.'
          : 'Stressed outflow supplied by the scenario.'
      }`,
    };
  });

  record('ProfitabilityRatios', () => {
    const r = computeProfitability(scoped, profitabilityCtx);
    return { payload: r, methodology: r.notes.join(' ') };
  });

  record('FxPosition', () => {
    const capital = inputs.tier1Capital ?? computeEquity(scoped, irrbbCtx);
    const r = computeFxPosition(scoped, profitabilityCtx, capital);
    return { payload: r, methodology: r.methodology };
  });

  return {
    run: {
      ...run,
      status: errors.length > 0 && results.length === 0 ? 'Failed' : 'Completed',
      completedAt: now,
      errorLog: errors,
    },
    results,
    errors,
  };
}

/** Convenience: a full standard run over every element. */
export const ALL_ELEMENTS: CalculationElement[] = [
  'Lcr',
  'Nsfr',
  'LoanToDeposit',
  'Concentration',
  'LiquidityGap',
  'RepricingGap',
  'NiiSensitivity',
  'EveSensitivity',
  'SurvivalHorizon',
  'ProfitabilityRatios',
  'FxPosition',
];

export function draftRun(params: {
  id: string;
  name: string;
  asOfDate: IsoDate;
  affiliateCode: string;
  reportingCurrency: CurrencyCode;
  timeBucketRuleId: string;
  batchIds: string[];
  createdBy: string;
  createdAt: string;
  elements?: CalculationElement[];
}): ProcessRun {
  return {
    id: params.id,
    name: params.name,
    processType: 'Static',
    asOfDate: params.asOfDate,
    affiliateCode: params.affiliateCode,
    reportingCurrency: params.reportingCurrency,
    orgUnitCodes: null,
    productCodes: null,
    filterId: null,
    timeBucketRuleId: params.timeBucketRuleId,
    productCharacteristicRuleId: null,
    behaviourPatternRuleId: null,
    forecastScenarioIds: [],
    newBusinessRuleId: null,
    transactionStrategyId: null,
    elements: params.elements ?? ALL_ELEMENTS,
    positionBatchIds: params.batchIds,
    status: 'Draft',
    createdBy: params.createdBy,
    createdAt: params.createdAt,
    completedAt: null,
    errorLog: [],
  };
}
