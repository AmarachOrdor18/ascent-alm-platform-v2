import type { BehaviouralTag, IsoDate, LcrCashflowRole, RuleMeta, TimeBucketRule } from './types';
import type { BehaviourPattern } from './behavioural';
import type { AdjustmentType, TpMethod } from './ftp';

export type { TimeBucketRule };

// ─────────────────────────────────────────────────────────────────────────
// Product characteristics (screen 17)
// ─────────────────────────────────────────────────────────────────────────

/** Per-product, per-currency assumptions. */
export interface ProductAssumption {
  productCode: string;
  currency: string;
  /** Which side of the 30-day LCR window this product sits on — computeLcr() keys off this, not hqlaLevel, to decide what counts as HQLA. */
  lcrCashflowRole: LcrCashflowRole;
  lcrRatePct: number | null;
  asfFactorPct: number | null;
  rsfFactorPct: number | null;
  hqlaLevel: 'Level 1' | 'Level 2A' | 'Level 2B' | 'None';
  hqlaHaircutPct: number;
  approxDurationYears: number | null;
  isRateSensitive: boolean;
}

export interface ProductCharacteristicRule extends RuleMeta {
  kind: 'ProductCharacteristic';
  assumptions: ProductAssumption[];
}

// ─────────────────────────────────────────────────────────────────────────
// Behaviour patterns (screen 18)
// ─────────────────────────────────────────────────────────────────────────

export interface BehaviourPatternRule extends RuleMeta {
  kind: 'BehaviourPattern';
  patterns: BehaviourPattern[];
  /** Deposit pass-through by behavioural tag, 0–1. */
  betas: Array<{ behaviouralTag: BehaviouralTag; beta: number }>;
}

// ─────────────────────────────────────────────────────────────────────────
// Payment and repricing patterns (screen 19)
// ─────────────────────────────────────────────────────────────────────────

export type PatternType = 'Absolute' | 'Relative' | 'Split';

export interface PatternPhase {
  /** Absolute: a date. Relative: a count of periods. */
  term: string;
  /** Share of principal repaid, or the repricing proportion. */
  percent: number;
}

export interface PaymentRepricingRule extends RuleMeta {
  kind: 'PaymentPattern' | 'RepricingPattern';
  patternType: PatternType;
  /** 1000–69999 for payment patterns, 70000–99999 for behaviour. */
  amortizationCode: number;
  phases: PatternPhase[];
}

// ─────────────────────────────────────────────────────────────────────────
// Prepayment (screen 20)
// ─────────────────────────────────────────────────────────────────────────

export type PrepaymentMethod = 'ConstantRate' | 'RateDependent' | 'None';

export interface PrepaymentAssumption {
  commonCoaCode: string;
  method: PrepaymentMethod;
  /** Annualised constant prepayment rate, 0–1. */
  cpr: number;
  /** Rate-dependent: extra CPR per 100bp the market sits below the note rate. */
  sensitivityPer100bp?: number;
  /** Early-redemption penalty, which damps the incentive to prepay. */
  earlyRedemptionPenaltyPct?: number;
}

export interface PrepaymentRule extends RuleMeta {
  kind: 'Prepayment';
  assumptions: PrepaymentAssumption[];
}

// ─────────────────────────────────────────────────────────────────────────
// Discount methods (screen 21)
// ─────────────────────────────────────────────────────────────────────────

export type DiscountMethodType = 'SpotInputCurve' | 'ForwardRates' | 'DurationProxy';

export interface DiscountAssignment {
  commonCoaCode: string;
  method: DiscountMethodType;
  curveCode: string | null;
}

export interface DiscountMethodRule extends RuleMeta {
  kind: 'DiscountMethod';
  assignments: DiscountAssignment[];
}

// ─────────────────────────────────────────────────────────────────────────
// Forecast rate scenarios (screen 22)
// ─────────────────────────────────────────────────────────────────────────

export interface ForecastScenarioRule extends RuleMeta {
  kind: 'ForecastScenario';
  /** Basis-point shock per bucket label. */
  shockByBucket: Record<string, number>;
  /** Which BCBS standardised shock this reproduces, where it does. */
  basedOn: string | null;
  /** Macro series this scenario is conditioned on, for narrative. */
  economicIndicatorCodes: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// New business (screen 23)
// ─────────────────────────────────────────────────────────────────────────

export type ForecastMethod =
  | 'NoNewBusiness'
  | 'TargetEndBalance'
  | 'TargetAverageBalance'
  | 'TargetGrowthPercent'
  | 'NewAddBalance'
  | 'Rollover'
  | 'RolloverWithNewAdd'
  | 'RolloverWithGrowth';

export type OriginationTiming = 'Distributed' | 'BucketEnd';

export interface ForecastBalanceLine {
  productCode: string;
  currency: string;
  method: ForecastMethod;
  /** Interpretation depends on the method: a balance, or a growth percentage. */
  value: number;
  timing: OriginationTiming;
  /** Margin over the transfer curve applied to new volume. */
  pricingMarginBps: number;
  /** Tenor mix of new originations, as bucket → share. Must total 100. */
  maturityMix: Record<string, number>;
}

export interface NewBusinessRule extends RuleMeta {
  kind: 'NewBusiness';
  lines: ForecastBalanceLine[];
}

// ─────────────────────────────────────────────────────────────────────────
// Transaction strategies (screen 24)
// ─────────────────────────────────────────────────────────────────────────

export type TransactionAction = 'Add' | 'Sell' | 'Hedge';

/** A balance-sheet action inside a scenario. */
export interface TransactionLine {
  action: TransactionAction;
  productCode: string;
  currency: string;
  amount: number;
  /** When the transaction happens, relative to the as-of date. */
  executionDate: IsoDate | null;
  maturityDate: IsoDate | null;
  ratePercent: number | null;
  isOffBalanceSheet: boolean;
  note: string;
}

export interface TransactionStrategyRule extends RuleMeta {
  kind: 'TransactionStrategy';
  transactions: TransactionLine[];
}

// ─────────────────────────────────────────────────────────────────────────
// Transfer pricing and adjustments (screens 25, 26)
// ─────────────────────────────────────────────────────────────────────────

export interface FtpAssignment {
  commonCoaCode: string;
  method: TpMethod;
  curveCode: string | null;
}

export interface FtpRule extends RuleMeta {
  kind: 'FtpRule';
  assignments: FtpAssignment[];
}

export interface AdjustmentLine {
  id: string;
  type: AdjustmentType;
  commonCoaCode: string | null;
  method: 'FixedRate' | 'LcrDriven';
  fixedBps: number;
  lcrThresholdPercent: number;
  lcrMultiplier: number;
  lcrCapBps: number;
}

export interface AdjustmentRuleDef extends RuleMeta {
  kind: 'AdjustmentRule';
  adjustments: AdjustmentLine[];
}

// ─────────────────────────────────────────────────────────────────────────
// Filters and custom metrics (screens 27, 28)
// ─────────────────────────────────────────────────────────────────────────

export type FilterKind = 'DataElement' | 'Group' | 'Hierarchy' | 'Attribute';
export type FilterOperator = 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'in' | 'contains';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterRule extends RuleMeta {
  kind: 'Filter';
  filterKind: FilterKind;
  /** Conditions combine with AND; a Group filter references other filters. */
  conditions: FilterCondition[];
  referencedFilterIds: string[];
}

/** A derived measure, computed from run outputs. */
export interface CustomMetricRule extends RuleMeta {
  kind: 'CustomMetric';
  /** Expression over named run outputs, e.g. `hqla / netCashOutflows * 100`. */
  expression: string;
  unit: 'Percentage' | 'Amount' | 'Ratio' | 'Days';
  decimals: number;
  /** Which run elements the expression reads. */
  dependsOn: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Validation rules as a stored rule (screen 8 reuses this)
// ─────────────────────────────────────────────────────────────────────────

export interface ValidationRuleSet extends RuleMeta {
  kind: 'ValidationRule';
  ruleIds: string[];
}

/** Every stored rule shape, for narrowing after a `getRule` call. */
export type AnyRule =
  | TimeBucketRule
  | ProductCharacteristicRule
  | BehaviourPatternRule
  | PaymentRepricingRule
  | PrepaymentRule
  | DiscountMethodRule
  | ForecastScenarioRule
  | NewBusinessRule
  | TransactionStrategyRule
  | FtpRule
  | AdjustmentRuleDef
  | FilterRule
  | CustomMetricRule
  | ValidationRuleSet;

/**
 * A maturity-mix or behaviour-pattern allocation must total 100%.
 * Returned rather than thrown so a form can show it while still editing.
 */
export function allocationError(allocation: Record<string, number> | number[]): string | null {
  const values = Array.isArray(allocation) ? allocation : Object.values(allocation);
  if (values.length === 0) return null;
  const total = values.reduce((s, v) => s + v, 0);
  if (Math.abs(total - 100) < 0.0001) return null;
  return `Allocation totals ${total.toFixed(2)}% — it must total 100%`;
}
