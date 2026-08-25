/**
 * The data-access contract.
 *
 * Pages and hooks depend on this interface, never on Dexie directly. That is
 * what makes the later swap to a microservice backend a single new file
 * (`HttpRepository`) rather than a rewrite — see build plan §5, rule 2.
 */

import type {
  Affiliate,
  AuditEvent,
  DataDomain,
  DimensionMember,
  DimensionType,
  EconomicIndicator,
  HolidayCalendar,
  IsoDate,
  LoadBatch,
  Position,
  ProcessRun,
  RuleKind,
  RuleMeta,
  RunResult,
  RunSchedule,
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

  // Dimensions
  listDimensionMembers(dimension: DimensionType): Promise<DimensionMember[]>;
  upsertDimensionMembers(members: DimensionMember[]): Promise<void>;

  // Positions
  queryPositions(query: PositionQuery): Promise<Position[]>;
  insertPositions(positions: Position[]): Promise<void>;

  // Load batches
  listBatches(affiliateCode?: string, domain?: DataDomain): Promise<LoadBatch[]>;
  getBatch(id: string): Promise<LoadBatch | null>;
  upsertBatch(batch: LoadBatch): Promise<void>;

  // Rules
  listRules(query: RuleQuery): Promise<RuleMeta[]>;
  getRule<T extends RuleMeta>(id: string): Promise<T | null>;
  upsertRule(rule: RuleMeta): Promise<void>;
  deleteRule(id: string): Promise<void>;
  /** Empty array means the rule is safe to delete. */
  checkDependencies(id: string): Promise<Dependency[]>;

  // Runs
  listRuns(affiliateCode?: string): Promise<ProcessRun[]>;
  getRun(id: string): Promise<ProcessRun | null>;
  upsertRun(run: ProcessRun): Promise<void>;
  listRunResults(runId: string): Promise<RunResult[]>;
  insertRunResults(results: RunResult[]): Promise<void>;

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

  // Reference data
  listYieldCurves(currency?: string): Promise<StoredYieldCurve[]>;
  getYieldCurve(id: string): Promise<StoredYieldCurve | null>;
  upsertYieldCurve(curve: StoredYieldCurve): Promise<void>;
  deleteYieldCurve(id: string): Promise<void>;

  listCurrencies(): Promise<StoredCurrency[]>;
  upsertCurrency(currency: StoredCurrency): Promise<void>;

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

  // Audit
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  recordAuditEvent(event: AuditEvent): Promise<void>;

  /** Wipe and re-seed. Used by the demo reset control. */
  reset(): Promise<void>;
}
