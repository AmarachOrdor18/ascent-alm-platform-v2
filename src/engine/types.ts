/**
 * Domain types for the Ascent ALM Platform.
 *
 * These are shared by `engine/` (pure calculation) and `store/` (persistence).
 * The engine takes these as arguments and returns results; it never fetches
 * them. See the ESLint override in .eslintrc.cjs which enforces that.
 *
 * Field naming follows the Ecobank mock dataset workbook where it overlaps,
 * and the OFSAA dimensional model where it does not — see the build plan
 * §7 (dimensional model) and §8 (what an affiliate carries).
 */

// ─────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────

/** ISO-8601 calendar date, no time component: `2026-07-31`. */
export type IsoDate = string;

/** ISO-4217 currency code: `NGN`, `GHS`, `XOF`, `USD`. */
export type CurrencyCode = string;

/**
 * A monetary amount is always paired with the currency it is denominated in.
 * v1 summed raw numbers across currencies and rendered every one with a `$`
 * (defects D-02 and P-02); making currency inseparable from amount at the
 * type level is what stops that recurring.
 */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';

/** Three-tier limit status. v1 had two tiers; RFP §2.1 asks for a series of escalation points. */
export type LimitStatus = 'Green' | 'Amber' | 'Red';

// ─────────────────────────────────────────────────────────────────────────
// Dimensions (build plan §7)
// ─────────────────────────────────────────────────────────────────────────

export type DimensionType =
  'LegalEntity' | 'OrgUnit' | 'Product' | 'GlAccount' | 'CommonCoa' | 'FinancialElement' | 'Counterparty' | 'Country';

/**
 * GL depth. Real charts of accounts are hierarchical numeric codes where the
 * child embeds its parent — category 20, group 2001, account 200101 — and
 * reconciliation is performed *at a level*, not against a flat list.
 */
export type GlLevel = 'Category' | 'Level1' | 'Level2';

/** A node in a dimension hierarchy. `parentCode: null` marks a root. */
export interface DimensionMember {
  id: string;
  dimension: DimensionType;
  code: string;
  name: string;
  parentCode: string | null;
  /** True for nodes that may be assigned to a position; rollup nodes are false. */
  isLeaf: boolean;
  attributes?: Record<string, string | number | boolean | null>;
}

// ─────────────────────────────────────────────────────────────────────────
// Affiliate
// ─────────────────────────────────────────────────────────────────────────

export type AffiliateStatus = 'Onboarding' | 'Testing' | 'Live' | 'Suspended';

/** Which upstream system feeds a data domain, or `File` where a connector is unavailable. */
export type FeedMode = 'Connector' | 'File' | 'NotConfigured';

export type DataDomain =
  'Positions' | 'GeneralLedger' | 'MarketRates' | 'FxRates' | 'Counterparties' | 'EconomicIndicators';

export interface DomainFeed {
  domain: DataDomain;
  mode: FeedMode;
  connectorId: string | null;
  /** Expected refresh cadence in days. Staleness beyond this raises a freshness warning (build plan §9.1). */
  slaDays: number;
  owner: string | null;
}

export interface Affiliate {
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  /** Exactly one, immutable once set — see OFSAA "functional currency". */
  functionalCurrency: CurrencyCode;
  /** The currency this affiliate consolidates into on its way to Group. */
  reportingCurrency: CurrencyCode;
  /** Every other currency the affiliate transacts in. */
  activeCurrencies: CurrencyCode[];
  status: AffiliateStatus;
  fiscalYearEnd: string;
  holidayCalendarId: string | null;
  legalEntityCode: string;
  feeds: DomainFeed[];
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Positions (build plan §8)
// ─────────────────────────────────────────────────────────────────────────

/** v1 had only Asset and Liability, so the balance sheet could not balance (defect P-04). */
export type PositionCategory = 'Asset' | 'Liability' | 'Capital';

export type BehaviouralTag = 'Core' | 'Non-Core' | 'Operational' | 'Non-Operational' | 'N/A';
export type RateType = 'Fixed' | 'Floating' | 'N/A';
export type HqlaLevel = 'Level 1' | 'Level 2A' | 'Level 2B' | 'None';
export type LcrCashflowRole = 'HQLA' | 'Inflow' | 'Outflow' | 'None';

/** CBN classification; Bank of Ghana and BCEAO mirror it closely. Closes defect D-10. */
export type PerformingStatus = 'Performing' | 'Special Mention' | 'Substandard' | 'Doubtful' | 'Loss';

export type AmortizationType = 'Conventional' | 'Level Principal' | 'Non-Amortising' | 'Pattern';

/** Day-count convention. A seeded dimension in OFSAA, used pervasively. */
export type AccrualBasis = '30/360' | 'Actual/360' | 'Actual/Actual' | '30/365' | 'Actual/365' | '30/Actual';

export type ObsType =
  'Undrawn Commitment' | 'Guarantee' | 'Letter of Credit' | 'IR Swap' | 'FX Forward' | 'Cap' | 'Floor';

/**
 * What kind of account a position sits on.
 *
 * Core banking systems carry this on every account, and it matters here:
 * internal and suspense accounts are not customer money. Without the
 * distinction they are counted as customer deposits, which inflates
 * loan-to-deposit and depositor concentration — the same class of quiet
 * error as counting pledged collateral as HQLA.
 */
export type AccountClass = 'Customer' | 'Internal' | 'Suspense' | 'Nostro' | 'Vostro';

/** Maker-checker state, carried on reference and account data as well as rules. */
export type RecordStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'CLOSED' | 'DORMANT';

/**
 * Four-eyes and lifecycle metadata.
 *
 * Every row in a real core-banking extract carries these — the chart of
 * accounts and the accounts alike, not just business rules.
 */
export interface RecordControl {
  maker: string;
  checker: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Account turnover.
 *
 * This is the behavioural signal the platform previously had no access to.
 * A current account with no movement in three months runs off nothing like
 * an actively-used one, however they are classified by product.
 */
export interface AccountTurnover {
  dailyCredit: number;
  dailyDebit: number;
  monthlyCredit: number;
  monthlyDebit: number;
  totalCredit: number;
  totalDebit: number;
}

/**
 * An overdraft facility attached to an account.
 *
 * The undrawn portion is an LCR outflow, and the expiry decides whether it
 * falls inside the 30-day window. Core systems give the facility its own GL
 * account, which is why the code is carried here.
 */
export interface OverdraftFacility {
  productCode: string;
  limit: number;
  drawnAmount: number;
  expiryDate: IsoDate | null;
  glAccountCode: string | null;
}

export interface Position {
  id: string;
  affiliateCode: string;
  /** The reporting date this position is a snapshot of. Load-bearing: v1 had none (defect P-01). */
  asOfDate: IsoDate;
  /** Which load batch committed this row — the lineage pointer (defect P-19). */
  batchId: string;

  /** The account this position sits on. Core systems embed the GL code in it. */
  accountNumber: string;
  /** Pre-migration account number, where one exists — migration lineage. */
  legacyAccountNumber: string | null;
  /** Internal and suspense accounts are excluded from customer metrics. */
  accountClass: AccountClass;
  /** Branch that owns the account, beneath the organisational unit. */
  branchCode: string | null;

  category: PositionCategory;
  productCode: string;
  productClass: string;
  currency: CurrencyCode;
  amount: number;

  // Dimensional keys
  legalEntityCode: string;
  orgUnitCode: string;
  glAccountCode: string;
  commonCoaCode: string;
  counterpartyId: string | null;

  // Dates — buckets are derived from these against the active ladder,
  // rather than arriving pre-assigned as they did in v1.
  originationDate: IsoDate | null;
  maturityDate: IsoDate | null;
  nextRepricingDate: IsoDate | null;
  lastRepricingDate: IsoDate | null;

  // Contract terms
  amortizationType: AmortizationType;
  paymentFrequencyMonths: number | null;
  repricingFrequencyMonths: number | null;
  accrualBasis: AccrualBasis;

  // Rate structure
  rateType: RateType;
  interestRatePct: number | null;
  rateIndexCode: string | null;
  spreadOverIndexBps: number | null;
  rateCapLifePct: number | null;
  rateFloorLifePct: number | null;

  // Basel / behavioural classification
  behaviouralTag: BehaviouralTag;
  hqlaLevel: HqlaLevel;
  hqlaHaircutPct: number;
  lcrCashflowRole: LcrCashflowRole;
  lcrRatePct: number | null;
  asfFactorPct: number | null;
  rsfFactorPct: number | null;
  irrbbRateSensitive: boolean;
  approxDurationYears: number | null;

  // Credit quality
  performingStatus: PerformingStatus;
  daysPastDue: number | null;
  provisionAmount: number | null;

  /**
   * Amount under lien, in the position's own currency.
   *
   * Basel requires HQLA to be unencumbered. This is an amount rather than a
   * flag because real liens are partial: a bond of 500 with a lien of 200
   * contributes 300 of HQLA, not nothing and not all of it.
   */
  lienAmount: number;
  lienReason: string | null;

  // Off-balance-sheet
  isOffBalanceSheet: boolean;
  obsType: ObsType | null;
  notionalAmount: number | null;
  undrawnAmount: number | null;
  ccfPct: number | null;

  /** Movement on the account. Absent for positions loaded without turnover. */
  turnover: AccountTurnover | null;

  /** Attached overdraft facility, where the account has one. */
  overdraft: OverdraftFacility | null;

  /** Four-eyes and lifecycle metadata from the source system. */
  control: RecordControl;

  /** Free text recording the assumption basis, surfaced on drill-down. */
  notes: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Rules — every configurable rule carries this envelope (build plan §6)
// ─────────────────────────────────────────────────────────────────────────

export type AccessType = 'Read-Only' | 'Read-Write';

export type RuleKind =
  | 'TimeBucket'
  | 'ProductCharacteristic'
  | 'BehaviourPattern'
  | 'PaymentPattern'
  | 'RepricingPattern'
  | 'Prepayment'
  | 'DiscountMethod'
  | 'ForecastScenario'
  | 'NewBusiness'
  | 'TransactionStrategy'
  | 'FtpRule'
  | 'AdjustmentRule'
  | 'Filter'
  | 'CustomMetric'
  | 'ValidationRule';

/**
 * Common envelope for every business rule, mirroring OFSAA's uniform rule
 * management (ALM UG Ch. 8): folder, access type, versioning and
 * dependency checking behave identically for all rule types, which is what
 * makes one `<RuleEditor>` shell serve fourteen screens.
 */
export interface RuleMeta {
  id: string;
  kind: RuleKind;
  name: string;
  description: string;
  folder: string;
  accessType: AccessType;
  /** Affiliate-scoped rules override the Group default of the same kind. */
  affiliateCode: string | null;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Time buckets (build plan §10)
// ─────────────────────────────────────────────────────────────────────────

/** OFSAA keeps three independent ladders; v1 used one hardcoded five-bucket list for all three. */
export type LadderKind = 'IncomeSimulation' | 'RepricingGap' | 'LiquidityGap';

export interface TimeBucket {
  label: string;
  /** Upper bound of the bucket, in days from the as-of date. `null` marks the terminal catch-all. */
  upperBoundDays: number | null;
}

export interface TimeBucketLadder {
  kind: LadderKind;
  buckets: TimeBucket[];
  /** Repricing ladders may carry a bucket for products that do not reprice at all. */
  includeNonRateSensitive: boolean;
}

export interface TimeBucketRule extends RuleMeta {
  kind: 'TimeBucket';
  ladders: TimeBucketLadder[];
}

// ─────────────────────────────────────────────────────────────────────────
// Data lifecycle (build plan §9)
// ─────────────────────────────────────────────────────────────────────────

export type BatchStatus = 'Staged' | 'Validated' | 'Committed' | 'Superseded' | 'Rejected';

export interface LoadBatch {
  id: string;
  affiliateCode: string;
  domain: DataDomain;
  asOfDate: IsoDate;
  version: number;
  fileName: string;
  /** Detects an accidental re-upload of the same file, and a changed file with the same name. */
  fileHash: string;
  rowCount: number;
  rowsAccepted: number;
  rowsRejected: number;
  status: BatchStatus;
  supersedesBatchId: string | null;
  supersededReason: string | null;
  uploadedBy: string;
  uploadedAt: string;
  committedBy: string | null;
  committedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Process runs (build plan §10)
// ─────────────────────────────────────────────────────────────────────────

/** Static models the existing book running off; Dynamic layers new-business assumptions on top. */
export type ProcessType = 'Static' | 'Dynamic';

export type CalculationElement =
  | 'LiquidityGap'
  | 'RepricingGap'
  | 'Lcr'
  | 'Nsfr'
  | 'LoanToDeposit'
  | 'Concentration'
  | 'NiiSensitivity'
  | 'EveSensitivity'
  | 'TransferPricing'
  | 'TpAdjustments'
  | 'SurvivalHorizon'
  | 'ProfitabilityRatios'
  | 'FxPosition';

export type RunStatus = 'Draft' | 'Queued' | 'Running' | 'Completed' | 'Failed';

export interface ProcessRun {
  id: string;
  name: string;
  processType: ProcessType;
  asOfDate: IsoDate;
  /** `GROUP` consolidates every Live affiliate. */
  affiliateCode: string;
  reportingCurrency: CurrencyCode;
  orgUnitCodes: string[] | null;
  productCodes: string[] | null;
  filterId: string | null;

  timeBucketRuleId: string;
  productCharacteristicRuleId: string | null;
  behaviourPatternRuleId: string | null;
  forecastScenarioIds: string[];
  newBusinessRuleId: string | null;
  transactionStrategyId: string | null;
  /** Transfer-pricing method assignments and the adjustment stack layered on top. */
  ftpRuleId: string | null;
  adjustmentRuleId: string | null;

  elements: CalculationElement[];

  /** Pins the exact data version consumed, so a result stays defensible after a reload (build plan §9.3). */
  positionBatchIds: string[];

  status: RunStatus;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  errorLog: RunError[];
}

export interface RunError {
  positionId: string | null;
  code: string;
  message: string;
}

/** Immutable output of a run. Results screens read from these, never from live recomputation. */
export interface RunResult {
  id: string;
  runId: string;
  element: CalculationElement;
  /** Element-specific payload; each engine module declares its own result shape. */
  payload: unknown;
  /** Every calculation states its simplifications inline — carried over from v1's disclosure discipline. */
  methodology: string;
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Users, roles, audit
// ─────────────────────────────────────────────────────────────────────────

export type RoleCode =
  'ADMIN' | 'RISK_ANALYST' | 'TREASURY_USER' | 'EXECUTIVE_VIEWER' | 'CONTROL_TESTER' | 'REPORTING_USER';

export interface Role {
  code: RoleCode;
  name: string;
  description: string;
  permissions: string[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  affiliateCode: string;
  isActive: boolean;
  mfaEnrolled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuditEvent {
  id: string;
  module: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string;
  userName: string;
  role: RoleCode;
  outcome: 'Success' | 'Failure';
  detail: string | null;
  recordedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Reference data (build plan §11, screens 12–15)
// ─────────────────────────────────────────────────────────────────────────

/** Zero-coupon or yield-to-maturity, per OFSAA's Rate Format attribute. */
export type RateFormat = 'Zero Coupon' | 'Yield to Maturity';

export type CompoundingBasis = 'Annual' | 'Semiannual' | 'Monthly' | 'Simple';

export interface CurveTerm {
  /** Term in days from the curve date. */
  tenorDays: number;
  label: string;
  ratePercent: number;
}

/**
 * A yield curve. OFSAA calls this an Interest Rate Code and hangs
 * rate format, compounding and accrual basis off it (ALM UG §5.2.2) —
 * attributes that change what the same quoted rate actually means.
 */
export interface StoredYieldCurve {
  id: string;
  code: string;
  name: string;
  currency: CurrencyCode;
  rateFormat: RateFormat;
  compoundingBasis: CompoundingBasis;
  accrualBasis: AccrualBasis;
  terms: CurveTerm[];
  asOfDate: IsoDate;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

/**
 * OFSAA distinguishes three currency roles (ALM UG §7.6): one functional
 * currency per institution, reporting currencies that intermediate
 * consolidation, and other active currencies it transacts in.
 */
export type CurrencyRole = 'Functional' | 'Reporting' | 'Active';

export interface StoredCurrency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  role: CurrencyRole;
  isActive: boolean;
}

export interface StoredFxRate {
  id: string;
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  asOfDate: IsoDate;
  source: string;
  updatedBy: string;
  updatedAt: string;
}

export type IndicatorFrequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Semi-Annually' | 'Annually';
export type IndicatorValueType = 'Numeric' | 'Percentage' | 'Amount';

export interface IndicatorObservation {
  asOfDate: IsoDate;
  value: number;
}

/**
 * Macroeconomic series feeding behavioural modelling and stress scenarios.
 * For African affiliates the ones that matter are inflation, policy rate,
 * FX reserves and — for Nigeria especially — the oil price.
 */
export interface EconomicIndicator {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  frequency: IndicatorFrequency;
  valueType: IndicatorValueType;
  unit: string;
  observations: IndicatorObservation[];
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

export interface HolidayEntry {
  date: IsoDate;
  name: string;
  /** A one-off exception overrides the recurring pattern for that year. */
  isException: boolean;
}

export interface HolidayCalendar {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  /** Days of the week that are not business days. 0 = Sunday. */
  weekendDays: number[];
  holidays: HolidayEntry[];
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduling (screen 32)
// ─────────────────────────────────────────────────────────────────────────

export type ScheduleFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';

/**
 * A recurring run definition.
 *
 * The platform runs in the browser, so nothing fires while the tab is
 * closed. A schedule therefore records *when a run became due* and the app
 * surfaces the backlog when someone next opens it. That is stated on the
 * screen rather than implied, because a scheduler that silently never fires
 * is worse than no scheduler at all.
 */
export interface RunSchedule {
  id: string;
  name: string;
  /** The run this schedule clones on each occurrence. */
  templateRunId: string;
  affiliateCode: string;
  frequency: ScheduleFrequency;
  /** Day of month for Monthly/Quarterly; `'last'` means the month end. */
  dayOfMonth: number | 'last';
  /** Day of week for Weekly. 0 = Sunday. */
  dayOfWeek: number;
  /** Roll a due date that lands on a non-business day forward to the next one. */
  holidayCalendarId: string | null;
  /** First date the schedule is eligible to fire. */
  startDate: IsoDate;
  endDate: IsoDate | null;
  isActive: boolean;
  /** Last occurrence actually executed, so the backlog can be computed. */
  lastRunDate: IsoDate | null;
  lastRunId: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
}
