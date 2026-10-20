// Pages and hooks depend on this interface, never on Dexie directly.
import type {
  Affiliate,
  AppNotification,
  AuditEvent,
  DataDomain,
  DataSource,
  DataSourceDomain,
  DimensionMember,
  DimensionType,
  EconomicIndicator,
  HolidayCalendar,
  IsoDate,
  LoadBatch,
  OnboardingRecord,
  Position,
  PositionContributor,
  PositionSnapshot,
  ProcessRun,
  Role,
  RuleKind,
  RuleMeta,
  RuleVersionSnapshot,
  RunResult,
  RunSchedule,
  SettingRecord,
  Connector,
  ApprovalRequest,
  RemediationIssue,
  NotificationRule,
  RiskEntry,
  AlcoMeeting,
  RegulatoryReturn,
  ReportPack,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
  User,
} from '@/engine/types';

import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
import type { AccountObservation, BalanceObservation, ModelRun } from '@/engine/behaviouralModels';

/** Who uploaded a history row, from which file, and when - carried on every stored row so an upload is auditable and deletable as a unit. */
export interface HistoryUploadMeta {
  uploadId: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * One stored balance-history observation. `id` is the natural key (affiliate, date, segment), so a
 * later upload of the same segment and date replaces the earlier row rather than double-counting it.
 */
export interface StoredBalanceObservation extends BalanceObservation, HistoryUploadMeta {
  id: string;
}

/** One stored account snapshot - `id` is affiliate + account + date. */
export interface StoredAccountObservation extends AccountObservation, HistoryUploadMeta {
  id: string;
}

export type ModelRunStatus = 'Draft' | 'Proposed' | 'Approved' | 'Retired';

/** One chart point kept with a model run so the register can redraw actual vs fitted without refitting. */
export interface ModelRunChartPoint {
  label: string;
  actual: number | null;
  fitted: number | null;
  /** A third series where the model has one - the policy rate for a beta, the core floor for run-off. */
  reference?: number | null;
}

/** A calibration saved to the model register - the engine's ModelRun plus governance wrapper fields. */
export interface StoredModelRun extends ModelRun {
  /** 1, 2, 3 ... per affiliate + model type + segment. */
  version: number;
  /**
   * Stored lifecycle. 'Approved' is not written by the workbench - it is derived from the linked rule
   * version's approval request (see effectiveModelStatus in lib/modelRegistry.ts), so the two cannot disagree.
   */
  status: ModelRunStatus;
  affiliateCode: string;
  createdBy: string;
  proposedRuleId?: string;
  proposedRuleVersion?: number;
  proposedRuleKind?: 'BehaviourPattern' | 'Prepayment';
  proposedBy?: string;
  proposedAt?: string;
  /** Everything the user chose before fitting - enough to reproduce the run. */
  calibrationOptions: Record<string, string | number | boolean | string[] | null>;
  /** The history uploads whose rows fed the fit. */
  historyUploadIds: string[];
  chart: ModelRunChartPoint[];
  chartUnit: 'amount' | 'percent' | 'ratio' | 'none';
}

/** An uploaded batch that has been staged but not committed. */
export interface StagedBatch {
  id: string;
  affiliateCode: string;
  domain: DataSourceDomain;
  asOfDate: IsoDate;
  batch: LoadBatch;
  positions: Position[];
  savedAt: string;
  /** The data source the file was sent to (Phase 4 lobby). */
  sourceId?: string;
  /** SHA-256 of the file content. */
  checksum?: string;
  /** Parsed records for a non-Positions source (ledger lines, counterparties, rates, history rows ...). */
  rows?: unknown[];
  /** What the checks found when the file was uploaded - shown in the lobby without re-parsing. */
  check?: StagedCheck;
  /**
   * true = this is not a lobby entry but the kept copy of an admitted general-ledger file, which
   * reconciliation reads back later (a trial balance has no store of its own). Never listed in a lobby.
   */
  admitted?: boolean;
}

/** A compact record of an upload's checks, kept with a lobby entry. */
export interface StagedCheck {
  rows: number;
  valid: number;
  invalid: number;
  duplicates: number;
  flagged: number;
  blocking: number;
  /** First few problems, already worded for a person. */
  issues: Array<{ line: number | null; field: string; message: string; blocking: boolean }>;
  ignoredColumns: string[];
}

/** A user who holds the permission to fix a readiness item (see lib/whoCanFix.ts). */
export interface Fixer {
  id: string;
  name: string;
  role: string;
  roleName: string;
  affiliateCode: string;
}

export interface NotificationInput {
  affiliateCode: string | null;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  /** For an affiliate code: also tell Group-level users (default true). */
  groupUsers?: boolean;
}

export interface PositionQuery {
  affiliateCode?: string;
  asOfDate?: IsoDate;
  batchIds?: string[];
  orgUnitCodes?: string[];
  productCodes?: string[];
  currency?: string;
}

export interface RuleQuery {
  kind?: RuleKind;
  affiliateCode?: string | null;
  folder?: string;
  activeOnly?: boolean;
}

/** What a rule's dependants look like when a delete is blocked. */
export interface Dependency {
  ruleId: string;
  ruleKind: RuleKind;
  ruleName: string;
  relation: string;
}

export interface Repository {
  // Affiliates
  listAffiliates(): Promise<Affiliate[]>;
  getAffiliate(code: string): Promise<Affiliate | null>;
  upsertAffiliate(affiliate: Affiliate): Promise<void>;
  deleteAffiliate(code: string): Promise<void>;

  // Dimensions - affiliate-owned; omitting affiliateCode returns every affiliate's members, for maintenance
  // utilities (e.g. the reference-data refresh in data/seed/bootstrap.ts) rather than ordinary screens.
  listDimensionMembers(dimension: DimensionType, affiliateCode?: string): Promise<DimensionMember[]>;
  upsertDimensionMembers(members: DimensionMember[]): Promise<void>;
  deleteDimensionMember(id: string): Promise<void>;

  // Positions
  queryPositions(query: PositionQuery): Promise<Position[]>;
  insertPositions(positions: Position[]): Promise<void>;

  // Load batches
  listBatches(affiliateCode?: string, domain?: DataDomain): Promise<LoadBatch[]>;
  getBatch(id: string): Promise<LoadBatch | null>;
  upsertBatch(batch: LoadBatch): Promise<void>;

  // Staged (uncommitted) uploads
  listStagedBatches(affiliateCode?: string): Promise<StagedBatch[]>;
  /** `contributor` disambiguates concurrent departmental drafts for the Positions domain - omit outside it. */
  getStagedBatchFor(
    affiliateCode: string,
    domain: DataDomain,
    asOfDate: IsoDate,
    contributor?: PositionContributor,
  ): Promise<StagedBatch | null>;
  upsertStagedBatch(staged: StagedBatch): Promise<void>;
  deleteStagedBatch(id: string): Promise<void>;

  // Data sources - omitting affiliateCode returns every source (RLS still limits what a user sees)
  listDataSources(affiliateCode?: string): Promise<DataSource[]>;
  getDataSource(id: string): Promise<DataSource | null>;
  upsertDataSource(source: DataSource): Promise<void>;
  deleteDataSource(id: string): Promise<void>;

  // Rules
  listRules(query: RuleQuery): Promise<RuleMeta[]>;
  getRule<T extends RuleMeta>(id: string): Promise<T | null>;
  /** Archives the row's current content (if any) before overwriting it - see RuleVersionSnapshot. */
  upsertRule(rule: RuleMeta): Promise<void>;
  deleteRule(id: string): Promise<void>;
  /** Empty array means the rule is safe to delete. */
  checkDependencies(id: string): Promise<Dependency[]>;
  /** What a rule's content was at a specific past version, if that edit was archived. */
  getRuleVersion<T extends RuleMeta>(ruleId: string, version: number): Promise<T | null>;
  /** Every archived version of a rule, oldest first. */
  listRuleVersions(ruleId: string): Promise<RuleVersionSnapshot[]>;

  // Runs
  listRuns(affiliateCode?: string): Promise<ProcessRun[]>;
  getRun(id: string): Promise<ProcessRun | null>;
  upsertRun(run: ProcessRun): Promise<void>;
  listRunResults(runId: string): Promise<RunResult[]>;
  insertRunResults(results: RunResult[]): Promise<void>;

  // Editable snapshots
  listSnapshots(affiliateCode?: string): Promise<PositionSnapshot[]>;
  getSnapshot(id: string): Promise<PositionSnapshot | null>;
  upsertSnapshot(snapshot: PositionSnapshot): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;

  // Governance, monitoring and reporting
  listApprovalRequests(affiliateCode?: string): Promise<ApprovalRequest[]>;
  upsertApprovalRequest(row: ApprovalRequest): Promise<void>;
  deleteApprovalRequest(id: string): Promise<void>;
  listRemediationIssues(affiliateCode?: string): Promise<RemediationIssue[]>;
  upsertRemediationIssue(row: RemediationIssue): Promise<void>;
  deleteRemediationIssue(id: string): Promise<void>;
  listNotificationRules(affiliateCode?: string): Promise<NotificationRule[]>;
  upsertNotificationRule(row: NotificationRule): Promise<void>;
  deleteNotificationRule(id: string): Promise<void>;
  listRiskEntrys(affiliateCode?: string): Promise<RiskEntry[]>;
  upsertRiskEntry(row: RiskEntry): Promise<void>;
  deleteRiskEntry(id: string): Promise<void>;
  listAlcoMeetings(affiliateCode?: string): Promise<AlcoMeeting[]>;
  upsertAlcoMeeting(row: AlcoMeeting): Promise<void>;
  deleteAlcoMeeting(id: string): Promise<void>;
  listRegulatoryReturns(affiliateCode?: string): Promise<RegulatoryReturn[]>;
  upsertRegulatoryReturn(row: RegulatoryReturn): Promise<void>;
  deleteRegulatoryReturn(id: string): Promise<void>;
  listReportPacks(affiliateCode?: string): Promise<ReportPack[]>;
  upsertReportPack(row: ReportPack): Promise<void>;
  deleteReportPack(id: string): Promise<void>;

  // Connectors
  listConnectors(): Promise<Connector[]>;
  upsertConnector(connector: Connector): Promise<void>;
  deleteConnector(id: string): Promise<void>;

  // Limits
  listLimitConfigs(affiliateCode?: string): Promise<LimitConfig[]>;
  upsertLimitConfig(config: LimitConfig): Promise<void>;
  deleteLimitConfig(id: string): Promise<void>;

  listTemporaryLimits(): Promise<TemporaryLimit[]>;
  upsertTemporaryLimit(temp: TemporaryLimit): Promise<void>;
  deleteTemporaryLimit(id: string): Promise<void>;

  listBreachNotes(breachId?: string): Promise<BreachNote[]>;
  upsertBreachNote(note: BreachNote): Promise<void>;

  // Schedules
  listSchedules(affiliateCode?: string): Promise<RunSchedule[]>;
  getSchedule(id: string): Promise<RunSchedule | null>;
  upsertSchedule(schedule: RunSchedule): Promise<void>;
  deleteSchedule(id: string): Promise<void>;

  // Users
  listUsers(): Promise<User[]>;
  getUserByEmail(email: string): Promise<User | null>;
  upsertUser(user: User): Promise<void>;

  // Roles
  listRoles(): Promise<Role[]>;
  upsertRole(role: Role): Promise<void>;
  deleteRole(code: string): Promise<void>;

  // Reference data
  listYieldCurves(currency?: string): Promise<StoredYieldCurve[]>;
  getYieldCurve(id: string): Promise<StoredYieldCurve | null>;
  upsertYieldCurve(curve: StoredYieldCurve): Promise<void>;
  deleteYieldCurve(id: string): Promise<void>;

  listCurrencies(): Promise<StoredCurrency[]>;
  upsertCurrency(currency: StoredCurrency): Promise<void>;
  deleteCurrency(code: string): Promise<void>;

  listFxRates(asOfDate?: IsoDate): Promise<StoredFxRate[]>;
  upsertFxRate(rate: StoredFxRate): Promise<void>;
  deleteFxRate(id: string): Promise<void>;

  listEconomicIndicators(countryCode?: string): Promise<EconomicIndicator[]>;
  getEconomicIndicator(id: string): Promise<EconomicIndicator | null>;
  upsertEconomicIndicator(indicator: EconomicIndicator): Promise<void>;
  deleteEconomicIndicator(id: string): Promise<void>;

  listHolidayCalendars(): Promise<HolidayCalendar[]>;
  getHolidayCalendar(id: string): Promise<HolidayCalendar | null>;
  upsertHolidayCalendar(calendar: HolidayCalendar): Promise<void>;
  deleteHolidayCalendar(id: string): Promise<void>;

  // Behavioural-model history and register
  /** Upserts by natural key - see StoredBalanceObservation. */
  insertBalanceHistory(rows: StoredBalanceObservation[]): Promise<void>;
  listBalanceHistory(affiliateCode: string): Promise<StoredBalanceObservation[]>;
  /** Deletes one upload's rows, or every row for the affiliate when uploadId is omitted. Returns the count deleted. */
  deleteBalanceHistory(affiliateCode: string, uploadId?: string): Promise<number>;
  insertAccountHistory(rows: StoredAccountObservation[]): Promise<void>;
  listAccountHistory(affiliateCode: string): Promise<StoredAccountObservation[]>;
  deleteAccountHistory(affiliateCode: string, uploadId?: string): Promise<number>;
  /** Newest first. */
  listModelRuns(affiliateCode?: string): Promise<StoredModelRun[]>;
  getModelRun(id: string): Promise<StoredModelRun | null>;
  upsertModelRun(run: StoredModelRun): Promise<void>;

  // Onboarding state ('ORG' or 'AFF:<code>')
  getOnboarding(id: string): Promise<OnboardingRecord | null>;
  listOnboarding(): Promise<OnboardingRecord[]>;
  upsertOnboarding(record: OnboardingRecord): Promise<void>;

  // Scoped settings ('<GROUP|affiliate>:<key>'); with an affiliate, returns its rows plus the GROUP defaults.
  listSettings(affiliateCode?: string): Promise<SettingRecord[]>;
  upsertSetting(setting: SettingRecord): Promise<void>;
  deleteSetting(id: string): Promise<void>;

  // In-app notifications (the header bell) - the signed-in user's own, newest first.
  listNotifications(userId: string): Promise<AppNotification[]>;
  markNotificationsRead(ids: string[]): Promise<void>;
  /** Removes the signed-in user's own notifications (Clear all in the bell). */
  clearNotifications(ids: string[]): Promise<void>;
  /**
   * Tell the users of a scope that something happened. null = everyone; 'GROUP' = Group-level users; an
   * affiliate code = its users, plus Group-level users unless `groupUsers` is false. The sender is skipped.
   */
  sendNotification(input: NotificationInput, sender: { id: string } | null): Promise<void>;

  /**
   * Active users holding `permission` (or any of "a|b") for a scope: a Group item (null / GROUP) -> Group-level
   * users only; an affiliate -> its users plus Group-level users. Names and roles only.
   */
  listWhoCanFix(permission: string, affiliateCode: string | null): Promise<Fixer[]>;

  // Audit
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  recordAuditEvent(event: AuditEvent): Promise<void>;

  /** Wipe and re-seed. Used by the demo reset control. */
  reset(): Promise<void>;
}
