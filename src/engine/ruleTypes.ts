import type {
  BehaviouralTag,
  DataDomain,
  DimensionType,
  IsoDate,
  LcrCashflowRole,
  RuleMeta,
  TimeBucketRule,
} from './types';
import type { BehaviourPattern } from './behavioural';
import type { AdjustmentMethod, AdjustmentType, FtpPool, SpreadPoint, TpMethod } from './ftp';
import type { ValidationRule } from './validation';
import type { CapitalConfig, CostPool, CreditLossConfig } from './profitabilityLayers';

export type { TimeBucketRule };

// ─────────────────────────────────────────────────────────────────────────
// Product characteristics (screen 17)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Per-product, per-currency assumptions. A row may instead be keyed by a common account (commonCoaCode set,
 * productCode empty): it then applies to every position on that common account whose product has no row of
 * its own - for that currency, or for any currency when currency is "" or "*".
 */
export interface ProductAssumption {
  productCode: string;
  currency: string;
  /** Which side of the 30-day LCR window this product sits on - computeLcr() keys off this, not hqlaLevel, to decide what counts as HQLA. */
  lcrCashflowRole: LcrCashflowRole;
  lcrRatePct: number | null;
  asfFactorPct: number | null;
  rsfFactorPct: number | null;
  hqlaLevel: 'Level 1' | 'Level 2A' | 'Level 2B' | 'None';
  hqlaHaircutPct: number;
  approxDurationYears: number | null;
  isRateSensitive: boolean;
  /** Common chart-of-accounts code - set on a common-account (fallback) row instead of a product. */
  commonCoaCode?: string;
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
  /**
   * How much harsher than these patterns the severe liquidity run is - see stress.ts deriveSevereRun.
   * Absent on rules saved before it existed, which use DEFAULT_STRESS_SEVERITY.
   */
  stressSeverityMultiplier?: number;
  /** Fitted term-deposit renewal / early-withdrawal rates per product - proposed from the behavioural-model workbench. */
  termDepositBehaviour?: TermDepositBehaviourAssumption[];
  /** Model-register runs (StoredModelRun ids) this rule's fitted content came from - lineage. */
  sourceModelRunIds?: string[];
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
  /** Model-register runs (StoredModelRun ids) this rule's fitted CPRs came from - lineage. */
  sourceModelRunIds?: string[];
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
  /** Method for positions no assignment covers. Absent on rules saved before it existed - priced as repricing term. */
  defaultMethod?: TpMethod;
  /** Funding pools by currency and tenor band, for the Pooled method. */
  pools?: FtpPool[];
}

export interface AdjustmentLine {
  id: string;
  type: AdjustmentType;
  commonCoaCode: string | null;
  /** 'FixedRate' | 'LcrDriven' on every rule saved before currency/basis adjustments; see ftp.ts AdjustmentMethod. */
  method: AdjustmentMethod;
  fixedBps: number;
  lcrThresholdPercent: number;
  lcrMultiplier: number;
  lcrCapBps: number;
  /** CurrencyBasis: the position currency priced against the reporting currency; null = every foreign currency. */
  currency?: string | null;
  /** TenorSpread method: basis points by tenor. */
  spreadCurve?: SpreadPoint[];
  /** BasisSpread: the position rate index this applies to; null = whatever index the position carries. */
  indexCode?: string | null;
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
  /** The full check catalogue with this scope's severity/blocking/active overrides applied - see engine/validation.ts. */
  rules: ValidationRule[];
}

// ─────────────────────────────────────────────────────────────────────────
// Field mapping — source-column rewriting ahead of the canonical importer
// (docs/DATA_MAPPING_PLAN.md §6.1). Code/reference-value lookups are a
// separate, later `CodeMapping` rule kind — out of scope here.
// ─────────────────────────────────────────────────────────────────────────

export interface FieldMappingColumn {
  /** Raw header as it appears in the source extract, e.g. "ACCT_NO". Matched case-insensitively. */
  sourceField: string;
  /** Canonical Position field this maps to, e.g. "accountNumber" — see csvImport.ts's KNOWN_COLUMNS. */
  targetField: string;
  transform: 'Direct' | 'Number' | 'Date' | 'Percent';
}

export interface FieldMappingRule extends RuleMeta {
  kind: 'FieldMapping';
  /** Which upload domain this mapping applies to. */
  domain: DataDomain;
  /** Free-text label for the source system this mapping was built for, e.g. "Flexcube" — organizational, not functional. */
  sourceSystem: string;
  columns: FieldMappingColumn[];
}

// ─────────────────────────────────────────────────────────────────────────
// Code mapping — source-code crosswalks (OrgUnit/GlAccount/CommonCoa) applied to already-parsed
// positions, after field mapping and before unmappedCodes runs (docs/DATA_MAPPING_PLAN.md §6.2).
// Counterparty deliberately excluded — DimensionMember.sourceRefs already covers it (a per-member
// "also known as" alias, edited directly on the Counterparty Register), a better fit for an entity
// identity than a bulk rule table, and having both would mean two places to define the same crosswalk.
// ─────────────────────────────────────────────────────────────────────────

export interface CodeMappingEntry {
  /** Raw code as it appears in the source extract, e.g. "10045". Matched exactly (case-sensitive). */
  sourceValue: string;
  /** An existing DimensionMember's own code to translate into, e.g. "P-CORP-TERM-LOAN". */
  targetCode: string;
}

export interface CodeMappingRule extends RuleMeta {
  kind: 'CodeMapping';
  dimension: Extract<DimensionType, 'OrgUnit' | 'GlAccount' | 'CommonCoa'>;
  /** Free-text label for the source system this mapping was built for, e.g. "Flexcube" — organizational, not functional. */
  sourceSystem: string;
  mappings: CodeMappingEntry[];
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-layer profitability - cost allocation, credit loss and capital (engine/profitabilityLayers.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Operating-expense cost pools, plus the headcount the Headcount driver allocates by. */
export interface CostAllocationRuleDef extends RuleMeta {
  kind: 'CostAllocation';
  /** Currency every pool amount is entered in - must be the reporting currency of a run that uses the rule. */
  currency: string;
  pools: CostPool[];
  /** Staff count per org-unit code - read by any pool whose driver is Headcount. */
  headcountByOrgUnit: Record<string, number>;
}

/** Expected credit loss basis. Prior-period provisions are not stored on the rule. */
export interface CreditLossRuleDef extends RuleMeta, Omit<CreditLossConfig, 'priorProvisionByPositionId'> {
  kind: 'CreditLoss';
}

/** Risk weights, capital ratio, cost of capital and tax rate for the capital charge and RAROC. */
export interface CapitalAllocationRuleDef extends RuleMeta, CapitalConfig {
  kind: 'CapitalAllocation';
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
  | ValidationRuleSet
  | FieldMappingRule
  | CodeMappingRule
  | CostAllocationRuleDef
  | CreditLossRuleDef
  | CapitalAllocationRuleDef;

/**
 * A maturity-mix or behaviour-pattern allocation must total 100%.
 * Returned rather than thrown so a form can show it while still editing.
 */
export function allocationError(allocation: Record<string, number> | number[]): string | null {
  const values = Array.isArray(allocation) ? allocation : Object.values(allocation);
  if (values.length === 0) return null;
  const total = values.reduce((s, v) => s + v, 0);
  if (Math.abs(total - 100) < 0.0001) return null;
  return `Allocation totals ${total.toFixed(2)}% - it must total 100%`;
}

/** A fitted term-deposit behaviour assumption (BehaviourPatternRule.termDepositBehaviour). Rates are 0-1. */
export interface TermDepositBehaviourAssumption {
  productCode: string;
  currency: string;
  renewalRate: number;
  earlyWithdrawalRate: number;
}
