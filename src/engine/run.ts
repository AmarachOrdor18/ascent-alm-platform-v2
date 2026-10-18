// A run is: as-of date + scope + reporting currency + rule set + scenario → an immutable, named, timestamped
// result set. Results screens read from a run, never from live recomputation.

import type {
  CalculationElement,
  CurrencyCode,
  DimensionMember,
  IsoDate,
  Position,
  ProcessRun,
  RunDegradation,
  RunError,
  RunResult,
  TimeBucketLadder,
} from './types';
import { convert, missingRates, type FxTable } from './fx';
import { filterByDimension } from './dimensions';
import { applyProductCharacteristics } from './classification';
import {
  computeDepositRunoff,
  computePrepayment,
  validateBehaviourPattern,
  type BehaviourPattern,
  type DepositBeta,
  type PrepaymentRule,
} from './behavioural';
import type { ProductAssumption, TermDepositBehaviourAssumption } from './ruleTypes';
import {
  generateBookCashflows,
  type BehaviouralTreatment,
  type CashflowAssumptions,
  type PositionCashflows,
} from './cashflow';
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
  shockAtTenor,
  type IrrbbContext,
  type ShockByBucket,
} from './irrbb';
import {
  computeCounterbalancingCapacity,
  computeSurvivalHorizon,
  deriveSevereRun,
  SEVERE_RUN_DEFAULTS,
  severeOutflowProfile,
  type StressContext,
} from './stress';
import { computeFxPosition, computeProfitability, type ProfitabilityContext } from './profitability';
import {
  computeProfitability as computeProfitabilityLayers,
  type CapitalConfig,
  type CostPool,
  type CreditLossConfig,
} from './profitabilityLayers';
import {
  computeFtp,
  type FtpResult,
  type AdjustmentRule,
  type FtpAssignmentInput,
  type FtpPool,
  type TpMethod,
  type YieldCurve,
} from './ftp';

export interface RunInputs {
  positions: Position[];
  fx: FxTable;
  liquidityLadder: TimeBucketLadder;
  repricingLadder: TimeBucketLadder;
  behaviourPatterns: BehaviourPattern[];
  /** Deposit pass-through from the same behaviour pattern rule - damps the liability leg of NII sensitivity. Absent means 100% pass-through. */
  depositBetas?: DepositBeta[];
  /** Severe-run severity from the same rule - see stress.ts deriveSevereRun. Absent uses DEFAULT_STRESS_SEVERITY. */
  stressSeverityMultiplier?: number;
  /** Constant prepayment rates by Common COA, from the run's Prepayment rule. Absent or empty means contractual timing only. */
  prepaymentRules?: PrepaymentRule[];
  /** Term-deposit early withdrawal / roll-over by product and currency, from the same behaviour pattern rule. */
  termDepositBehaviour?: TermDepositBehaviourAssumption[];
  orgUnitMembers: DimensionMember[];
  productMembers: DimensionMember[];
  /** Regulatory Tier 1 where known; null falls back to balance-sheet equity, and the result says so. */
  tier1Capital: number | null;
  /** Per-product/currency HQLA, ASF/RSF and rate-sensitivity assumptions - see engine/classification.ts. Absent means every position's classification is taken as loaded, unchanged. */
  productAssumptions?: ProductAssumption[];
  /** Total stressed outflow for the survival-horizon scenario. */
  stressedOutflow?: number;
  shockBps?: number;
  /** The scenario's shock per repricing bucket, where it has a shape - cash-flow EVE applies it tenor by tenor. */
  shockByBucket?: ShockByBucket;
  /** Transfer-pricing inputs. Absent curves means the FTP element reports everything unpriced. */
  yieldCurves?: YieldCurve[];
  adjustmentRules?: AdjustmentRule[];
  ftpAssignments?: FtpAssignmentInput[];
  ftpMethod?: TpMethod;
  /** Funding pools for the Pooled transfer-pricing method, from the FTP rule. */
  ftpPools?: FtpPool[];
  /**
   * Multi-layer profitability configuration, from the run's Cost Allocation, Credit Loss and Capital rules.
   * The ProfitabilityLayers element needs all three - a missing one fails that element, never a silent default.
   */
  costAllocation?: { currency: string; pools: CostPool[]; headcountByOrgUnit: Record<string, number> } | null;
  creditLoss?: CreditLossConfig | null;
  capital?: CapitalConfig | null;
}

export interface RunOutcome {
  run: ProcessRun;
  results: RunResult[];
  errors: RunError[];
  /** Named gaps the run worked around - also stored on `run.degradations`. */
  degradations?: RunDegradation[];
}

/** Positions with no liquidity classification: no RSF factor on an asset, no ASF factor on funding. */
export function unclassifiedPositions(positions: Position[]): Position[] {
  return positions.filter((p) =>
    p.category === 'Asset'
      ? p.rsfFactorPct === null || p.rsfFactorPct === undefined
      : p.asfFactorPct === null || p.asfFactorPct === undefined,
  );
}

/** The behavioural assumptions a cashflow book is generated under - all from the run's own rules. */
export interface CashflowBookAssumptions {
  prepaymentRules?: PrepaymentRule[];
  behaviourPatterns?: BehaviourPattern[];
  termDepositBehaviour?: TermDepositBehaviourAssumption[];
}

/**
 * The run's single cashflow set: every position's contractual schedule and its behavioural overlay, generated
 * once and read by every element - liquidity gap, LCR, repricing gap, NII, EVE and transfer pricing. Any screen
 * that recomputes on a run's book (the shock battery on IRRBB / Stress Testing) builds it through this too, so
 * the two cannot drift.
 *
 * - Prepayment: the Prepayment rule's CPR by Common COA, on-balance-sheet assets only.
 * - Deposit run-off: the behaviour pattern rule's patterns, matched on behavioural tag.
 * - Term deposits: the rule's fitted early-withdrawal and renewal rates, matched on product and currency.
 */
export function buildCashflowBook(
  positions: Position[],
  asOfDate: IsoDate,
  assumptions: CashflowBookAssumptions = {},
): PositionCashflows[] {
  const patterns = assumptions.behaviourPatterns ?? [];
  patterns.forEach(validateBehaviourPattern);
  const prepayment = assumptions.prepaymentRules ?? [];
  const cprByCoa =
    prepayment.length > 0 ? Object.fromEntries(prepayment.map((r) => [r.commonCoaCode, r.cpr])) : undefined;
  const termDeposits = assumptions.termDepositBehaviour ?? [];

  return positions.map((p) => {
    const td =
      p.category === 'Liability'
        ? termDeposits.find((t) => t.productCode === p.productCode && t.currency === p.currency)
        : undefined;
    const perPosition: CashflowAssumptions = {
      prepaymentCprByClass: p.isOffBalanceSheet ? undefined : cprByCoa,
      depositPatterns: patterns,
      ...(td ? { earlyWithdrawalRate: td.earlyWithdrawalRate, renewalRate: td.renewalRate } : {}),
    };
    return generateBookCashflows([p], asOfDate, perPosition)[0]!;
  });
}

/** Count and balance per behavioural treatment - which assumption shaped how much of the book. */
function summariseBook(book: PositionCashflows[]) {
  const byTreatment: Partial<Record<BehaviouralTreatment, { positions: number; balance: number }>> = {};
  for (const pc of book) {
    const entry = byTreatment[pc.behaviouralTreatment] ?? { positions: 0, balance: 0 };
    entry.positions += 1;
    entry.balance += pc.balance;
    byTreatment[pc.behaviouralTreatment] = entry;
  }
  return { positions: book.length, byTreatment };
}

let resultCounter = 0;
function resultId(runId: string, element: CalculationElement): string {
  resultCounter += 1;
  return `${runId}-${element}-${resultCounter}`;
}

// Each element is computed independently; a failure in one is recorded against the run rather than aborting
// the whole thing.
export function executeRun(run: ProcessRun, inputs: RunInputs, now: string): RunOutcome {
  const errors: RunError[] = [];
  const results: RunResult[] = [];

  // Everything downstream sees only positions in scope.
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

  // Regulatory/behavioural classification is applied once, here, before any calculation reads a position -
  // every element downstream (LCR, NSFR, IRRBB...) sees the ruled classification, never the raw uploaded one.
  if (inputs.productAssumptions?.length) {
    scoped = applyProductCharacteristics(scoped, inputs.productAssumptions);
  }

  // A missing FX rate must stop the run rather than silently omitting a currency from the totals.
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

  // Degrade visibly, block rarely: each input the run is missing is named against the output it affects,
  // with the screen that fixes it. The run itself carries on.
  const degradations: RunDegradation[] = [];
  const wants = (...els: CalculationElement[]) => els.some((e) => run.elements.includes(e));
  if (!run.timeBucketRuleId && wants('LiquidityGap', 'RepricingGap')) {
    degradations.push({
      element: 'Run',
      message: 'No time bucket rule is set - the standard ladder (overnight to 5 years and over) was used.',
      fixHref: '/rules/time-buckets',
    });
  }
  if (wants('Lcr', 'Nsfr')) {
    const unclassified = unclassifiedPositions(scoped);
    if (!run.productCharacteristicRuleId || unclassified.length > 0) {
      const count =
        unclassified.length > 0
          ? ` ${unclassified.length} of ${scoped.length} position(s) carry no liquidity classification and are reported as "Not classified".`
          : '';
      const message = run.productCharacteristicRuleId
        ? `Some products are not covered by the product characteristics rule.${count}`
        : `No product characteristics rule - LCR and NSFR use the liquidity treatment carried in the files.${count}`;
      for (const element of ['Lcr', 'Nsfr'] as const) {
        if (run.elements.includes(element))
          degradations.push({ element, message, fixHref: '/rules/product-characteristics' });
      }
    }
  }
  if (!run.behaviourPatternRuleId && wants('LiquidityGap', 'SurvivalHorizon', 'NiiSensitivity', 'EveSensitivity')) {
    degradations.push({
      element: 'Run',
      message: 'Behavioural assumptions not configured - gaps, stress and rate risk use contractual timing.',
      fixHref: '/assumptions',
    });
  }
  // No FTP rule: transfer pricing is left blank rather than priced on assumptions nobody set.
  const ftpBlank = !run.ftpRuleId;
  if (wants('TransferPricing', 'TpAdjustments')) {
    if (ftpBlank) {
      degradations.push({
        element: 'TransferPricing',
        message: 'No transfer pricing (FTP) rule is set - transfer pricing is blank.',
        fixHref: '/rules/ftp',
      });
    } else if ((inputs.yieldCurves ?? []).length === 0) {
      degradations.push({
        element: 'TransferPricing',
        message: `No yield curve on or before ${run.asOfDate} - positions are unpriced.`,
        fixHref: '/data/market/curves',
      });
    }
  }

  const shockBps = inputs.shockBps ?? 200;
  const liquidityCtx: LiquidityContext = {
    asOfDate: run.asOfDate,
    reportingCurrency: run.reportingCurrency,
    fx: inputs.fx,
  };
  const stressCtx: StressContext = liquidityCtx;
  const profitabilityCtx: ProfitabilityContext = { reportingCurrency: run.reportingCurrency, fx: inputs.fx };
  const irrbbCtx: IrrbbContext = {
    ...liquidityCtx,
    tier1Capital: inputs.tier1Capital,
    depositBetas: inputs.depositBetas,
  };

  // ONE cashflow set per run. Every element that asks *when* cash moves or reprices - liquidity gap, LCR
  // window, repricing gap, NII, EVE, FTP - reads this book, so the prepayment, deposit run-off and
  // term-deposit assumptions are applied once and seen identically everywhere. A book that cannot be built
  // (an invalid behaviour pattern) is recorded against the run, and elements fall back to balance-based
  // calculation rather than the run failing outright.
  const prepaymentRules = inputs.prepaymentRules ?? [];
  let book: PositionCashflows[] | undefined;
  try {
    book = buildCashflowBook(scoped, run.asOfDate, {
      prepaymentRules,
      behaviourPatterns: inputs.behaviourPatterns,
      termDepositBehaviour: inputs.termDepositBehaviour,
    });
  } catch (err) {
    book = undefined;
    errors.push({
      positionId: null,
      code: 'CASHFLOW_BOOK_FAILED',
      message: `Cashflows could not be generated (${err instanceof Error ? err.message : String(err)}); elements fell back to balance-based calculation.`,
    });
  }
  const bookNote = book
    ? " Computed on the run's single cashflow book" +
      (prepaymentRules.length > 0
        ? ', loan principal prepaid per the Prepayment rule (constant prepayment rate by product class)'
        : '') +
      '.'
    : '';

  // A compute that returns null was skipped on purpose (a named degradation says why).
  const record = (element: CalculationElement, compute: () => { payload: unknown; methodology: string } | null) => {
    if (!run.elements.includes(element)) return;
    try {
      const computed = compute();
      if (!computed) return;
      const { payload, methodology } = computed;
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
    const r = computeLcr(scoped, liquidityCtx, {}, book);
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
    // Both bases are computed so the screen can show them side by side rather than as a toggle - from the
    // same book: the contractual stream and its behavioural overlay.
    const contractual = computeLiquidityGap(scoped, liquidityCtx, inputs.liquidityLadder, 'Contractual', book);
    const behavioural = computeLiquidityGap(scoped, liquidityCtx, inputs.liquidityLadder, 'Behavioural', book);
    return {
      payload: {
        contractual,
        behavioural,
        runoff: computeDepositRunoff(scoped, inputs.behaviourPatterns),
        prepayment: prepaymentRules.length > 0 ? computePrepayment(scoped, prepaymentRules) : null,
        cashflowBook: book ? summariseBook(book) : null,
      },
      methodology: `${contractual.methodology} ${behavioural.methodology}${bookNote}`,
    };
  });

  record('RepricingGap', () => {
    const r = computeRepricingGap(scoped, irrbbCtx, inputs.repricingLadder, book);
    return { payload: r, methodology: `${r.methodology}${bookNote}` };
  });

  record('NiiSensitivity', () => {
    const r = computeNiiSensitivity(scoped, irrbbCtx, shockBps, 365, book);
    return { payload: r, methodology: `${r.methodology}${bookNote}` };
  });

  record('EveSensitivity', () => {
    const r = computeEveSensitivity(
      scoped,
      irrbbCtx,
      shockBps,
      book
        ? {
            book,
            curves: inputs.yieldCurves ?? [],
            shockAtTenor: inputs.shockByBucket ? shockAtTenor(inputs.repricingLadder, inputs.shockByBucket) : undefined,
          }
        : undefined,
    );
    return { payload: r, methodology: `${r.methodology}${bookNote}` };
  });

  record('SurvivalHorizon', () => {
    // The severe run's size and shape come from the run's own behaviour pattern rule (its volatile
    // share, at the rule's severity), not from a fixed multiple of LCR outflows - unless the scenario
    // supplies an outflow of its own.
    const severe =
      inputs.stressedOutflow === undefined
        ? deriveSevereRun(scoped, inputs.behaviourPatterns, stressCtx, {
            severityMultiplier: inputs.stressSeverityMultiplier,
          })
        : null;
    // The buffer takes the same market-wide haircut the severe run assumes - the Stress Testing screen does
    // exactly this, so the run's survival horizon and the screen's are the same figure.
    const haircut = severe?.hqlaHaircutPercent ?? SEVERE_RUN_DEFAULTS.hqlaHaircutPercent;
    const capacity = computeCounterbalancingCapacity(scoped, stressCtx, haircut);
    const profile = severe?.profile ?? severeOutflowProfile(inputs.stressedOutflow ?? 0);
    const r = computeSurvivalHorizon(capacity.total, profile, stressCtx);
    return {
      payload: { ...r, counterbalancingCapacity: capacity, severeRun: severe, hqlaHaircutPercent: haircut },
      methodology: `${r.methodology} Opening buffer is counterbalancing capacity, not HQLA alone, after a further ${haircut}% market-wide haircut on liquid assets. ${
        severe ? severe.methodology : 'Stressed outflow supplied by the scenario.'
      }`,
    };
  });

  // Transfer pricing is computed at most once per run and shared: the TransferPricing element reports it, and the
  // ProfitabilityLayers element reads the very same transfer rates for its FTP layer.
  let ftpCache: FtpResult | undefined;
  const ftpOnce = (): FtpResult => {
    if (ftpCache) return ftpCache;
    // The LCR-driven adjustment needs the LCR that this same run computed,
    // not a figure from elsewhere: an add-on priced off last month's buffer
    // is not the cost of funds this run is describing.
    const lcrResult = results.find((r) => r.element === 'Lcr')?.payload as { lcrPercent: number | null } | undefined;
    const currentLcrPercent = lcrResult?.lcrPercent ?? computeLcr(scoped, liquidityCtx, {}, book).lcrPercent;

    ftpCache = computeFtp(scoped, inputs.yieldCurves ?? [], inputs.adjustmentRules ?? [], {
      asOfDate: run.asOfDate,
      currentLcrPercent,
      method: inputs.ftpMethod,
      assignments: inputs.ftpAssignments,
      reportingCurrency: run.reportingCurrency,
      fx: inputs.fx,
      behaviourPatterns: inputs.behaviourPatterns,
      book,
      pools: inputs.ftpPools,
    });
    return ftpCache;
  };

  record('TransferPricing', () => {
    if (ftpBlank) return null;
    const r = ftpOnce();
    return { payload: r, methodology: r.methodology };
  });

  record('TpAdjustments', () => {
    if (ftpBlank) return null;
    // The adjustment stack on its own, so the screen can show what each
    // add-on contributes rather than only the all-in rate.
    const ftp = results.find((r) => r.element === 'TransferPricing')?.payload as
      { lines: Array<{ adjustments: Array<{ type: string; bps: number }>; positionId: string }> } | undefined;
    if (!ftp) {
      throw new Error('FTP adjustments need the Transfer Pricing element in the same run.');
    }

    const byType = new Map<string, { totalBps: number; positions: number }>();
    for (const line of ftp.lines) {
      for (const adjustment of line.adjustments) {
        const entry = byType.get(adjustment.type) ?? { totalBps: 0, positions: 0 };
        entry.totalBps += adjustment.bps;
        entry.positions += 1;
        byType.set(adjustment.type, entry);
      }
    }

    return {
      payload: {
        byType: Array.from(byType.entries()).map(([type, v]) => ({
          type,
          averageBps: v.positions > 0 ? v.totalBps / v.positions : 0,
          positions: v.positions,
        })),
      },
      methodology:
        'Average add-on in basis points per adjustment type, across the positions each rule touched. Averages ' +
        'are over affected positions only, not the whole book, so a rule scoped to one product is not diluted ' +
        'by the products it does not apply to.',
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

  record('ProfitabilityLayers', () => {
    // No silent defaults: an opex budget, a PD/LGD set or a capital ratio the bank never configured would
    // produce a profit figure nobody can defend. Name exactly what is missing.
    const missingRules = [
      !inputs.costAllocation &&
        'a Cost Allocation rule (Rules & scenarios → Profitability → Operating cost allocation)',
      !inputs.creditLoss && 'a Credit Loss rule (Rules & scenarios → Profitability → Expected credit loss)',
      !inputs.capital && 'a Capital rule (Rules & scenarios → Profitability → Capital charge)',
    ].filter((m): m is string => !!m);
    if (missingRules.length > 0) {
      // Not a failure: the layers are left blank and the gap is named - the rest of the run stands.
      degradations.push({
        element: 'ProfitabilityLayers',
        message: `Profitability layers are blank - this run had no ${missingRules.join(', ')}.`,
        fixHref: !inputs.costAllocation
          ? '/rules/cost-allocation'
          : !inputs.creditLoss
            ? '/rules/credit-loss'
            : '/rules/capital',
      });
      return null;
    }
    // Cost pools are entered once (often as a Group default in the Group's currency) but every run reports
    // in its own currency - convert the pool amounts at the run date's rates rather than refusing the run.
    const costCurrency = inputs.costAllocation!.currency;
    const costPools = inputs.costAllocation!.pools.map((pool) =>
      costCurrency === run.reportingCurrency
        ? pool
        : { ...pool, amount: convert(pool.amount, costCurrency, run.reportingCurrency, inputs.fx) },
    );
    const ftp = ftpOnce();
    const r = computeProfitabilityLayers({
      positions: scoped,
      ftpLines: ftp.lines,
      fx: inputs.fx,
      reportingCurrency: run.reportingCurrency,
      asOfDate: run.asOfDate,
      horizon: 'Annualised',
      costRules: { pools: costPools },
      headcountByOrgUnit: inputs.costAllocation!.headcountByOrgUnit,
      creditLoss: inputs.creditLoss!,
      capital: inputs.capital!,
    });
    const notes = [...r.notes];
    if (!run.ftpRuleId) {
      notes.unshift(
        'No FTP rule was selected for this run - transfer rates fall back to the engine default method on the active curves.',
      );
    }
    return { payload: { ...r, notes }, methodology: r.methodology };
  });

  return {
    run: {
      ...run,
      status: errors.length > 0 && results.length === 0 ? 'Failed' : 'Completed',
      completedAt: now,
      errorLog: errors,
      degradations,
    },
    results,
    errors,
    degradations,
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
  'TransferPricing',
  'TpAdjustments',
  'ProfitabilityRatios',
  'FxPosition',
  'ProfitabilityLayers',
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
  ftpRuleId?: string | null;
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
    prepaymentRuleId: null,
    forecastScenarioIds: [],
    newBusinessRuleId: null,
    transactionStrategyId: null,
    ftpRuleId: params.ftpRuleId ?? null,
    adjustmentRuleId: null,
    costAllocationRuleId: null,
    creditLossRuleId: null,
    capitalRuleId: null,
    ruleVersionsUsed: {},
    elements: params.elements ?? ALL_ELEMENTS,
    positionBatchIds: params.batchIds,
    status: 'Draft',
    createdBy: params.createdBy,
    createdAt: params.createdAt,
    completedAt: null,
    errorLog: [],
  };
}
