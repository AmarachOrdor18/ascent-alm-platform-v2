// Shared by `engine/` (pure calculation) and `store/` (persistence). The engine takes these as arguments and
// returns results; it never fetches them - enforced by an ESLint override in .eslintrc.cjs.

// ─────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────

/** ISO-8601 calendar date, no time component: `2026-07-31`. */
export type IsoDate = string;

/** ISO-4217 currency code: `NGN`, `GHS`, `XOF`, `USD`. */
export type CurrencyCode = string;

/** A monetary amount is always paired with the currency it is denominated in. */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';

export type LimitStatus = 'Green' | 'Amber' | 'Red';

// ─────────────────────────────────────────────────────────────────────────
// Dimensions (build plan §7)
// ─────────────────────────────────────────────────────────────────────────

export type DimensionType =
  'LegalEntity' | 'OrgUnit' | 'Product' | 'GlAccount' | 'CommonCoa' | 'FinancialElement' | 'Counterparty' | 'Country';

// Hierarchical GL codes: the child embeds its parent (category 20, group 2001, account 200101), and
// reconciliation is performed at a level, not against a flat list.
export type GlLevel = 'Category' | 'Level1' | 'Level2';

/** A node in a dimension hierarchy. `parentCode: null` marks a root. */
export interface DimensionMember {
  id: string;
  dimension: DimensionType;
  /**
   * Which affiliate owns this entry - every dimension is affiliate-managed, including Common COA: there is no
   * Group-wide list. Use the literal code `'GROUP'` for a genuinely cross-affiliate construct (e.g. a
   * connected-exposure counterparty group spanning two countries, or a consolidation-tree root) - `'GROUP'` is
   * an ordinary affiliate row like any other, not a bypass, so it's still a real, filterable scope.
   */
  affiliateCode: string;
  code: string;
  name: string;
  parentCode: string | null;
  /** True for nodes that may be assigned to a position; rollup nodes are false. */
  isLeaf: boolean;
  attributes?: Record<string, string | number | boolean | null>;
  /**
   * The same real-world entity as it's identified in other source systems - e.g. a counterparty
   * known as `CP00125` in Calypso and `BANK-007` elsewhere. Without this, the same counterparty
   * appearing under different source-system IDs would register as unrelated members with no way
   * to resolve them to one canonical identity. See engine/dimensions.ts's resolveByCode.
   */
  sourceRefs?: Array<{ system: string; sourceId: string }>;
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
  /** Expected refresh cadence in days. Staleness beyond this raises a freshness warning. */
  slaDays: number;
  owner: string | null;
}

/** Internal risk appetite for one limit metric - always inside the regulatory floor. */
export interface InternalThreshold {
  amberPercent: number;
  redPercent: number;
}

export interface Affiliate {
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  /** Exactly one, immutable once set. */
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
  /** true = use Group's rule set as-is; false = this affiliate's rules can diverge. */
  inheritGroupRules: boolean;
  /** Per-metric internal amber/red on top of the regulatory minimum, keyed by the same metric names as REGULATORY_MINIMA (e.g. 'lcrPercent'). */
  internalThresholds: Record<string, InternalThreshold>;
  /** Governance attestation, distinct from the threshold values themselves. */
  limitsConfirmed: boolean;
  /**
   * Which departments must submit a Positions slice before this affiliate's
   * book is considered complete for a date - see `contributionReadiness` in
   * engine/vintage.ts. Absent (older/seed affiliates) falls back to every
   * `PositionContributor`, so this is additive and never a breaking field.
   */
  requiredContributors?: PositionContributor[];
  /** When this affiliate's onboarding is/was targeted to take effect - distinct from `createdAt`, which is when the record itself was created. */
  effectiveDate?: IsoDate;
  /** IANA zone (e.g. 'Africa/Lagos') - when its as-of dates and SLA clocks are read as local time. */
  reportingTimezone?: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Positions (build plan §8)
// ─────────────────────────────────────────────────────────────────────────

export type PositionCategory = 'Asset' | 'Liability' | 'Capital';

export type BehaviouralTag = 'Core' | 'Non-Core' | 'Operational' | 'Non-Operational' | 'N/A';
export type RateType = 'Fixed' | 'Floating' | 'N/A';
export type HqlaLevel = 'Level 1' | 'Level 2A' | 'Level 2B' | 'None';
export type LcrCashflowRole = 'HQLA' | 'Inflow' | 'Outflow' | 'None';

/** CBN classification; Bank of Ghana and BCEAO mirror it closely. */
export type PerformingStatus = 'Performing' | 'Special Mention' | 'Substandard' | 'Doubtful' | 'Loss';

export type AmortizationType = 'Conventional' | 'Level Principal' | 'Non-Amortising' | 'Pattern';

export type AccrualBasis = '30/360' | 'Actual/360' | 'Actual/Actual' | '30/365' | 'Actual/365' | '30/Actual';

export type ObsType =
  'Undrawn Commitment' | 'Guarantee' | 'Letter of Credit' | 'IR Swap' | 'FX Forward' | 'Cap' | 'Floor';

// Internal and suspense accounts are not customer money; excluding them affects loan-to-deposit and
// depositor-concentration calculations.
export type AccountClass = 'Customer' | 'Internal' | 'Suspense' | 'Nostro' | 'Vostro';

/** Maker-checker state, carried on reference and account data as well as rules. */
export type RecordStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'CLOSED' | 'DORMANT';

/** Four-eyes and lifecycle metadata, carried on reference and account data as well as rules. */
export interface RecordControl {
  maker: string;
  checker: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

// Drives behavioural run-off assumptions independent of product classification: a dormant account runs off
// nothing like an actively-used one, however it's classified.
export interface AccountTurnover {
  dailyCredit: number;
  dailyDebit: number;
  monthlyCredit: number;
  monthlyDebit: number;
  totalCredit: number;
  totalDebit: number;
}

// The undrawn portion is an LCR outflow; the expiry date decides whether it falls inside the 30-day window.
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
  /** The reporting date this position is a snapshot of. */
  asOfDate: IsoDate;
  /** Which load batch committed this row (lineage pointer). */
  batchId: string;

  /** The account this position sits on. Core systems embed the GL code in it. */
  accountNumber: string;
  /** Pre-migration account number, where one exists - migration lineage. */
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

  // Buckets are derived from these dates against the active ladder.
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

  /** Amount under lien, in the position's own currency - an amount rather than a flag, since liens are often partial. */
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
// Rules - every configurable rule carries this envelope (build plan §6)
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
  | 'ValidationRule'
  | 'FieldMapping'
  | 'CodeMapping'
  | 'CostAllocation'
  | 'CreditLoss'
  | 'CapitalAllocation';

// Common envelope for every rule type: folder, access type, versioning and dependency checking behave
// identically, which is what lets one `<RuleEditor>` shell serve fourteen screens.
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

/**
 * A rule row's content as it stood immediately before an edit overwrote it - archived by
 * `upsertRule` so a later edit doesn't destroy the only copy of what an earlier run actually used.
 * `snapshot` carries the full concrete rule (RuleMeta plus whatever kind-specific fields it had),
 * not just the envelope.
 */
export interface RuleVersionSnapshot {
  id: string;
  ruleId: string;
  version: number;
  kind: RuleKind;
  snapshot: RuleMeta;
  archivedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Time buckets (build plan §10)
// ─────────────────────────────────────────────────────────────────────────

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

/**
 * A bank doesn't hand over one ready-made position file - the book has to
 * be assembled from what each department holds. Loans, Deposits and
 * Treasury each contribute their own slice of the Positions domain for the
 * same affiliate/date; General Ledger is not a contributor, it's the
 * independent ground truth the combined book reconciles against (see
 * GlReconciliation.tsx). `null` on non-Positions domains, where there is
 * exactly one submitter per domain/date.
 */
export type PositionContributor = 'Loans' | 'Deposits' | 'Treasury';

export interface LoadBatch {
  id: string;
  affiliateCode: string;
  /** A DataDomain, or BalanceHistory/AccountHistory for a behavioural-model history load. */
  domain: DataSourceDomain;
  /** Which department's slice of the Positions domain this is. Always null outside the Positions domain. */
  contributor: PositionContributor | null;
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
  /** Set when a GeneralLedger batch has been reconciled against positions and signed off - see `reconcile()` in engine/reconciliation.ts. Null for domains reconciliation doesn't apply to. */
  reconciledBy: string | null;
  reconciledAt: string | null;
  /** Set when a staged batch is discarded after failing a blocking validation rule, so the attempt stays on record instead of vanishing. Null otherwise. */
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  /** ruleId -> version, for every FieldMapping/CodeMapping rule actually applied to this batch's file at
   * ingestion - same pattern as ProcessRun.ruleVersionsUsed, completing the lineage chain source -> mapping
   * version -> batch -> run -> report. Absent when no mapping rule was applied (the file was already canonical). */
  mappingRuleVersionsUsed?: Record<string, number>;
  /** The data source the file was uploaded to (Phase 4). Absent on loads made before sources existed. */
  sourceId?: string;
  /** SHA-256 of the file content - blocks the same file being loaded twice. */
  checksum?: string;
  /** Set when an admitted load is withdrawn (status becomes Superseded) - who, when and why. */
  withdrawnBy?: string | null;
  withdrawnAt?: string | null;
  withdrawnReason?: string | null;
  /** Rows the checks flagged (advisory findings) when the file was uploaded. */
  rowsFlagged?: number;
  /** The first problems the upload checks found, worded for a person - kept for the load's history. */
  checkIssues?: Array<{ line: number | null; field: string; message: string; blocking: boolean }>;
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
  | 'FxPosition'
  | 'ProfitabilityLayers';

export type RunStatus = 'Draft' | 'Queued' | 'Running' | 'Completed' | 'Failed';

/**
 * Where one version of a run series stands in the sign-off lifecycle. Open = provisional figures;
 * PendingSignOff = an approval request is with a checker; SignedOff = the official figures, frozen;
 * Reopened = was signed off, then reopened with a reason - stays frozen and read-only, and the next
 * execution for that series becomes a new version.
 */
export type RunSignOffStatus = 'Open' | 'PendingSignOff' | 'SignedOff' | 'Reopened';

export interface RunSignOff {
  status: RunSignOffStatus;
  /** The Runs/SignOff approval request behind the current (or last) sign-off. */
  approvalId?: string | null;
  requestedAt?: string | null;
  requestedById?: string | null;
  requestedBy?: string | null;
  signedOffAt?: string | null;
  signedOffById?: string | null;
  signedOffBy?: string | null;
  /** Last rejection (or withdrawal) of a sign-off request - the run went back to Open. */
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectReason?: string | null;
  reopenedAt?: string | null;
  reopenedById?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
}

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
  /** Constant prepayment rates re-dating loan principal in the behavioural gap, repricing gap and NII. Absent on older runs, which used none. */
  prepaymentRuleId?: string | null;
  forecastScenarioIds: string[];
  newBusinessRuleId: string | null;
  transactionStrategyId: string | null;
  /** Transfer-pricing method assignments and the adjustment stack layered on top. */
  ftpRuleId: string | null;
  adjustmentRuleId: string | null;
  /**
   * Multi-layer profitability (ProfitabilityLayers element): operating-expense cost pools, expected credit
   * loss and capital charge. All three are required for that element; absent on runs created before it existed.
   */
  costAllocationRuleId?: string | null;
  creditLossRuleId?: string | null;
  capitalRuleId?: string | null;

  /**
   * The `version` each referenced rule (by id) actually had at execution time, captured when the
   * run's inputs were assembled. A rule id alone only resolves to whatever that row holds *now* -
   * if it's edited later, this is what lets `getRuleVersion` recover the content this run actually
   * used, from the history `upsertRule` archives on every edit. Absent on runs created before this
   * existed.
   */
  ruleVersionsUsed?: Record<string, number>;

  elements: CalculationElement[];

  /** Pins the exact data version consumed, so a result stays defensible after a reload. */
  positionBatchIds: string[];

  status: RunStatus;
  createdBy: string;
  /** app_users id of whoever executed the run - a checker may not sign off a run they executed. */
  createdById?: string;
  createdAt: string;
  completedAt: string | null;
  errorLog: RunError[];

  /**
   * Run series: one affiliate + one as-of date (`${affiliateCode}|${asOfDate}`). Each execution within
   * a series is a new version (v1, v2, ...). Absent on older runs - those read as their own series' v1.
   */
  seriesKey?: string;
  version?: number;
  /** Sign-off lifecycle. Absent = Open. */
  signOff?: RunSignOff;
  /** The newer version of the same series that replaced this one, once it exists. */
  supersededByRunId?: string | null;
  /**
   * What this run computed with something missing - each named, with the output it affected and where it
   * is fixed. A run is only blocked when it cannot be correct; everything else runs and says what it lacked.
   */
  degradations?: RunDegradation[];
}

/** One named gap a run worked around (a missing rule, curve or classification), shown on its results. */
export interface RunDegradation {
  /** The calculation element (or 'Run' for the whole run) the gap affects. */
  element: CalculationElement | 'Run';
  message: string;
  /** The screen that fixes it. */
  fixHref: string | null;
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
  /** Every calculation states its simplifications inline. */
  methodology: string;
  computedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Editable snapshots (build plan §10a) - investigate, correct or run
// what-if analysis on a committed position batch without touching it.
// ─────────────────────────────────────────────────────────────────────────

export type SnapshotStatus = 'Draft' | 'Recalculated' | 'PendingApproval' | 'Committed' | 'Rejected' | 'Discarded';

/** Fields a snapshot is allowed to change - the same governed subset the skill spec calls out. */
export type SnapshotEditableField =
  | 'amount'
  | 'maturityDate'
  | 'nextRepricingDate'
  | 'behaviouralTag'
  | 'hqlaLevel'
  | 'hqlaHaircutPct'
  | 'lcrCashflowRole'
  | 'lcrRatePct'
  | 'asfFactorPct'
  | 'rsfFactorPct'
  | 'interestRatePct'
  | 'irrbbRateSensitive'
  | 'performingStatus'
  | 'notes';

export interface SnapshotChange {
  positionId: string;
  field: SnapshotEditableField;
  oldValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  changedBy: string;
  changedAt: string;
}

/**
 * An editable copy of a committed batch's positions.
 *
 * The parent batch is never touched - `positions` here starts as a clone
 * and `changes` is the audit trail of every edit made to it. Recalculating
 * runs the same engine over this set and over the parent batch's positions
 * so the two can be compared; committing turns the edited set into a new,
 * superseding batch version via the ordinary commit path (§18).
 */
export interface PositionSnapshot {
  id: string;
  name: string;
  parentBatchId: string;
  /** The run being investigated, where the snapshot was opened from a run rather than a batch directly. */
  parentRunId: string | null;
  affiliateCode: string;
  asOfDate: IsoDate;
  status: SnapshotStatus;
  reason: string;
  positions: Position[];
  changes: SnapshotChange[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Set once Recalculate has produced a comparison, so the workbench can show it without re-running. */
  lastRecalculatedAt: string | null;
  /** Set once approved and committed as a new Position Book version. */
  committedBatchId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Users, roles, audit
// ─────────────────────────────────────────────────────────────────────────

/** The five live roles. */
export type ActiveRoleCode = 'ADMIN' | 'AFFILIATE_ADMIN' | 'RISK_ANALYST' | 'APPROVER' | 'EXECUTIVE_VIEWER';
/**
 * Retired in the 8 → 5 role simplification; kept in the type only so historical records (audit events written
 * before the migration) still type-check. No user holds one and none is selectable - see RETIRED_ROLE_MAP.
 */
export type RetiredRoleCode = 'TREASURY_USER' | 'CONTROL_TESTER' | 'REPORTING_USER';
export type RoleCode = ActiveRoleCode | RetiredRoleCode;

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
  /** SHA-256 hex digest - demo-grade credential storage, not production auth. */
  passwordHash: string;
  role: RoleCode;
  affiliateCode: string;
  isActive: boolean;
  mfaEnrolled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** When the user first saw (or dismissed) their welcome/onboarding screen. Self-editable. */
  onboardingSeenAt?: string;
  /** Guided tours already shown, by tour id → the tour version seen. Self-editable. */
  toursSeen?: Record<string, number>;
  /** The scope and as-of date this user last worked on - restored on sign-in, on any device. Self-editable. */
  workingContext?: WorkingContext;
}

/** Scope (Group or an affiliate) and working as-of date, persisted per user. */
export interface WorkingContext {
  affiliateCode: string;
  asOfDate: IsoDate | null;
  updatedAt: string;
}

/** One in-app notification for one user (bell in the header). */
export interface AppNotification {
  id: string;
  userId: string;
  /** The affiliate the event concerns, or GROUP / null for organisation-wide. */
  affiliateCode: string | null;
  kind: string;
  title: string;
  body: string;
  /** In-app route to open. */
  link: string | null;
  read: boolean;
  createdAt: string;
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

export type RateFormat = 'Zero Coupon' | 'Yield to Maturity';

export type CompoundingBasis = 'Annual' | 'Semiannual' | 'Monthly' | 'Simple';

export interface CurveTerm {
  /** Term in days from the curve date. */
  tenorDays: number;
  label: string;
  ratePercent: number;
}

// Rate format, compounding and accrual basis together determine what a quoted rate actually means.
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

// Functional: one per institution. Reporting: intermediates consolidation. Active: other currencies transacted in.
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
 * FX reserves and - for Nigeria especially - the oil price.
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

// ─────────────────────────────────────────────────────────────────────────
// Connectors (screen 5)
// ─────────────────────────────────────────────────────────────────────────

export type ConnectorProtocol = 'REST' | 'SOAP' | 'SFTP' | 'JDBC' | 'Proprietary' | 'FileDrop';

/**
 * Whether a connector can actually be used.
 *
 * `Blocked` is not a judgement the platform makes on the bank's behalf - it
 * is a field the bank sets, with a reason, because what blocks an
 * integration is a fact about the engagement rather than about the software.
 */
export type ConnectorStatus = 'Available' | 'Blocked' | 'Planned' | 'Retired';

export type AuthMode = 'None' | 'ApiKey' | 'OAuth2' | 'Basic' | 'Certificate' | 'SshKey';

export interface Connector {
  id: string;
  name: string;
  vendor: string;
  protocol: ConnectorProtocol;
  /** Which data domains this source can supply. */
  domains: DataDomain[];
  status: ConnectorStatus;
  /** Required when status is Blocked or Planned - an unexplained block is not actionable. */
  statusReason: string | null;

  endpoint: string;
  authMode: AuthMode;
  /**
   * A pointer into the secret store, never the secret itself.
   *
   * This platform runs in the browser. A credential typed here would sit in
   * IndexedDB in clear text on every machine that opened the page, so the
   * field holds a vault reference and the connector service resolves it
   * server-side.
   */
  credentialRef: string;

  /** Expected refresh cadence in days, and the wall-clock window it lands in. */
  cadenceDays: number;
  scheduleWindow: string;
  timeoutSeconds: number;
  maxRetries: number;

  owner: string;
  notes: string;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Governance, monitoring and reporting entities (screens 47–54)
// ─────────────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';

/**
 * A maker-checker request.
 *
 * The rule the whole queue exists to enforce: `requestedBy` may never equal
 * `decidedBy`. Segregation of duties is not a policy the screen reminds you
 * of - it is a condition the approval action refuses to violate.
 */
export interface ApprovalRequest {
  id: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  /**
   * For a versioned entity (an approval-gated rule), the version this request asks to approve. An
   * approval covers that version only - editing the rule afterwards needs a fresh sign-off.
   */
  entityVersion?: number;
  action: 'Create' | 'Update' | 'Delete' | 'Activate' | 'Override' | 'SignOff';
  summary: string;
  affiliateCode: string | null;
  status: ApprovalStatus;
  requestedBy: string;
  /** app_users id of the requester - what maker-checker compares (absent on older/seed rows). */
  requestedById?: string;
  requestedAt: string;
  decidedBy: string | null;
  /** app_users id of the decider. */
  decidedById?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** Oracle-style six-stage control lifecycle; a closure needs a second pair of eyes. */
export type RemediationStage = 'Identified' | 'Assessed' | 'Planned' | 'In Progress' | 'Verified' | 'Closed';

export interface RemediationUpdate {
  at: string;
  by: string;
  stage: RemediationStage;
  note: string;
}

export interface RemediationIssue {
  id: string;
  title: string;
  description: string;
  /** Where it came from - a limit breach, a validation failure, an audit finding. */
  source: string;
  /** Set when the issue was raised by a limit breach, so the two stay linked. */
  linkedLimitId: string | null;
  /** Set when the issue was raised by a rejected data-upload batch, so the two stay linked. */
  linkedBatchId: string | null;
  severity: Severity;
  stage: RemediationStage;
  owner: string;
  affiliateCode: string | null;
  raisedBy: string;
  raisedAt: string;
  dueDate: IsoDate | null;
  closedAt: string | null;
  /** Closure is maker-checker: whoever verified may not be the owner. */
  closureApprovedBy: string | null;
  updates: RemediationUpdate[];
}

export type NotificationChannel = 'Email' | 'SMS' | 'In-App' | 'Webhook';

export interface NotificationRule {
  id: string;
  name: string;
  /** Which event fires it - a limit status, a run outcome, a data-freshness lapse. */
  event: string;
  channel: NotificationChannel;
  recipients: string[];
  /** Only fire at or above this severity. */
  minimumSeverity: Severity;
  affiliateCode: string | null;
  /** Escalate to a second recipient list if nobody acts within this many hours. */
  escalateAfterHours: number | null;
  escalateTo: string[];
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

/** Likelihood and impact on the conventional 1–5 scale. */
export interface RiskEntry {
  id: string;
  title: string;
  category: string;
  description: string;
  inherentLikelihood: number;
  inherentImpact: number;
  controls: string;
  residualLikelihood: number;
  residualImpact: number;
  owner: string;
  affiliateCode: string | null;
  lastReviewedAt: string;
  nextReviewDue: IsoDate | null;
}

export type MeetingStatus = 'Scheduled' | 'Held' | 'Cancelled';

export interface AlcoAction {
  id: string;
  description: string;
  owner: string;
  dueDate: IsoDate | null;
  status: 'Open' | 'Closed' | 'Carried forward';
}

export interface AlcoMeeting {
  id: string;
  title: string;
  scheduledFor: string;
  status: MeetingStatus;
  chair: string;
  attendees: string[];
  agenda: string[];
  /** The run whose figures the pack was built from - the meeting's evidence. */
  runId: string | null;
  minutes: string;
  decisions: string[];
  actions: AlcoAction[];
  affiliateCode: string | null;
}

export type ReturnStatus = 'Not started' | 'In preparation' | 'Under review' | 'Submitted' | 'Accepted' | 'Rejected';

export interface RegulatoryReturn {
  id: string;
  name: string;
  regulator: string;
  affiliateCode: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual';
  periodEnd: IsoDate;
  dueDate: IsoDate;
  status: ReturnStatus;
  /** Which run supplies the figures. Absent means nothing has been attached yet. */
  runId: string | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  submittedAt: string | null;
  notes: string;
}

export type PackKind = 'ALCO' | 'Management' | 'Board' | 'Ad hoc';

export interface PackSection {
  id: string;
  title: string;
  /** Which calculation element or screen supplies it. */
  source: string;
  included: boolean;
  commentary: string;
}

export interface ReportPack {
  id: string;
  name: string;
  kind: PackKind;
  affiliateCode: string | null;
  runId: string | null;
  sections: PackSection[];
  /** Null for an on-demand pack; set where the pack recurs. */
  scheduleId: string | null;
  status: 'Draft' | 'Generated' | 'Distributed';
  recipients: string[];
  generatedAt: string | null;
  generatedBy: string | null;
  updatedBy: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Onboarding state and scoped settings
// ─────────────────────────────────────────────────────────────────────────

export type OnboardingScope = 'Organisation' | 'Affiliate';
export type OnboardingStatus = 'NotStarted' | 'InProgress' | 'Complete';

export interface OnboardingStepState {
  done: boolean;
  at: string | null;
  by: string | null;
}

/** Progress through organisation ('ORG') or one affiliate's ('AFF:<code>') onboarding. */
export interface OnboardingRecord {
  /** 'ORG' or 'AFF:<affiliateCode>'. */
  id: string;
  scope: OnboardingScope;
  /** GROUP for the organisation record. */
  affiliateCode: string;
  status: OnboardingStatus;
  currentStep: string | null;
  steps: Record<string, OnboardingStepState>;
  startedAt: string | null;
  startedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** One configuration value at organisation (GROUP) or affiliate scope; id is '<scopeCode>:<key>'. */
export interface SettingRecord {
  id: string;
  /** GROUP for an organisation default, else the affiliate the override belongs to. */
  affiliateCode: string;
  key: string;
  value: unknown;
  /** Only meaningful on GROUP rows: whether affiliates may override it. */
  overridable?: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Data sources (Phase 4)
// ─────────────────────────────────────────────────────────────────────────

/**
 * What a data source delivers. The six `DataDomain`s plus the two behavioural-model history feeds, which
 * land in their own stores (balance_history / account_history) rather than as a position batch, and
 * `MarketData` - Group's one combined file of FX rates, yield curves and policy/economic rates.
 */
export type DataSourceDomain = DataDomain | 'BalanceHistory' | 'AccountHistory' | 'MarketData';

/** How files reach a source. Only ManualUpload is driven from the screen; the others name an existing connector. */
export type SourceConnectorType = 'ManualUpload' | 'SFTP' | 'API' | 'Database';

export type SourceFieldType = 'Text' | 'Number' | 'Date' | 'YesNo';

export type SourceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'As needed';

/** One column a source's file is expected to carry - its platform name plus the file headers also accepted for it. */
export interface SourceField {
  name: string;
  type: SourceFieldType;
  required: boolean;
  /** Part of the row's identity - two rows with the same key values are duplicates. */
  key?: boolean;
  /** Other headers that mean this field ("Acct No", "account_number" ...). Matched ignoring case, spaces and punctuation. */
  aliases: string[];
}

/**
 * A named feed of one kind of data for one affiliate (or GROUP, for market data). Uploads are made to a
 * source, never to an affiliate picked on the screen - the source already says whose data it is.
 */
export interface DataSource {
  id: string;
  /** Owner: an affiliate code, or 'GROUP' for organisation-wide market data. */
  affiliateCode: string;
  name: string;
  domain: DataSourceDomain;
  /** Positions only: which department's slice of the book this source carries. */
  contributor?: PositionContributor;
  connectorType: SourceConnectorType;
  /** For SFTP / API / Database: the connectors-table entry that delivers it. */
  connectorId?: string | null;
  /** Person or team accountable for the feed. */
  owner: string;
  frequency: SourceFrequency;
  /** Free text: when files are expected ("by 08:00 on the first business day"). */
  schedule?: string;
  fields: SourceField[];
  /** The field holding the date the data is "as of", read from the file. */
  businessDateField?: string;
  /** When true, a clean file (nothing blocking) is admitted straight away instead of waiting in the lobby. */
  autoAdmit: boolean;
  /**
   * The file headers (normalised) a person confirmed in the column mapping - a later file with the same
   * headers is read with the saved mapping without asking again.
   */
  mappedHeaders?: string[];
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}
