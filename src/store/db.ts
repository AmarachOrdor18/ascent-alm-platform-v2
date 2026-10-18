import Dexie, { type EntityTable } from 'dexie';
import type {
  Connector,
  ApprovalRequest,
  RemediationIssue,
  NotificationRule,
  RiskEntry,
  AlcoMeeting,
  RegulatoryReturn,
  ReportPack,
} from '@/engine/types';
import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
import type { StagedBatch, StoredAccountObservation, StoredBalanceObservation, StoredModelRun } from './repository';
import type {
  Affiliate,
  AppNotification,
  AuditEvent,
  DataSource,
  DimensionMember,
  EconomicIndicator,
  HolidayCalendar,
  LoadBatch,
  OnboardingRecord,
  Position,
  PositionSnapshot,
  ProcessRun,
  Role,
  RuleMeta,
  RuleVersionSnapshot,
  RunResult,
  RunSchedule,
  SettingRecord,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
  User,
} from '@/engine/types';

export class AscentDb extends Dexie {
  affiliates!: EntityTable<Affiliate, 'code'>;
  dimensionMembers!: EntityTable<DimensionMember, 'id'>;
  positions!: EntityTable<Position, 'id'>;
  batches!: EntityTable<LoadBatch, 'id'>;
  stagedBatches!: EntityTable<StagedBatch, 'id'>;
  rules!: EntityTable<RuleMeta, 'id'>;
  runs!: EntityTable<ProcessRun, 'id'>;
  runResults!: EntityTable<RunResult, 'id'>;
  runSchedules!: EntityTable<RunSchedule, 'id'>;
  limitConfigs!: EntityTable<LimitConfig, 'id'>;
  temporaryLimits!: EntityTable<TemporaryLimit, 'id'>;
  breachNotes!: EntityTable<BreachNote, 'id'>;
  connectors!: EntityTable<Connector, 'id'>;
  approvals!: EntityTable<ApprovalRequest, 'id'>;
  remediationIssues!: EntityTable<RemediationIssue, 'id'>;
  notificationRules!: EntityTable<NotificationRule, 'id'>;
  riskEntries!: EntityTable<RiskEntry, 'id'>;
  alcoMeetings!: EntityTable<AlcoMeeting, 'id'>;
  regulatoryReturns!: EntityTable<RegulatoryReturn, 'id'>;
  reportPacks!: EntityTable<ReportPack, 'id'>;
  users!: EntityTable<User, 'id'>;
  auditEvents!: EntityTable<AuditEvent, 'id'>;
  yieldCurves!: EntityTable<StoredYieldCurve, 'id'>;
  currencies!: EntityTable<StoredCurrency, 'code'>;
  fxRates!: EntityTable<StoredFxRate, 'id'>;
  economicIndicators!: EntityTable<EconomicIndicator, 'id'>;
  holidayCalendars!: EntityTable<HolidayCalendar, 'id'>;
  roles!: EntityTable<Role, 'code'>;
  snapshots!: EntityTable<PositionSnapshot, 'id'>;
  ruleHistory!: EntityTable<RuleVersionSnapshot, 'id'>;
  balanceHistory!: EntityTable<StoredBalanceObservation, 'id'>;
  accountHistory!: EntityTable<StoredAccountObservation, 'id'>;
  modelRuns!: EntityTable<StoredModelRun, 'id'>;
  onboarding!: EntityTable<OnboardingRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'id'>;
  dataSources!: EntityTable<DataSource, 'id'>;
  notifications!: EntityTable<AppNotification, 'id'>;

  constructor(name = 'ascent-alm') {
    super(name);
    this.version(1).stores({
      affiliates: 'code, status, region, functionalCurrency',
      dimensionMembers: 'id, dimension, code, parentCode, [dimension+code], [dimension+parentCode]',
      positions:
        'id, affiliateCode, asOfDate, batchId, currency, category, orgUnitCode, productCode, counterpartyId, ' +
        '[affiliateCode+asOfDate], [affiliateCode+category], [asOfDate+currency]',
      batches: 'id, affiliateCode, domain, asOfDate, status, [affiliateCode+domain], [affiliateCode+domain+asOfDate]',
      rules: 'id, kind, folder, affiliateCode, isActive, [kind+affiliateCode], [kind+isActive]',
      runs: 'id, affiliateCode, asOfDate, status, createdAt, [affiliateCode+asOfDate]',
      runResults: 'id, runId, element, [runId+element]',
      users: 'id, email, role, affiliateCode',
      auditEvents: 'id, module, userId, recordedAt',
      yieldCurves: 'id, code, currency, isActive, [currency+isActive]',
      currencies: 'code, role, isActive',
      fxRates: 'id, base, quote, asOfDate, [base+quote], [base+quote+asOfDate]',
      economicIndicators: 'id, code, countryCode, isActive',
      holidayCalendars: 'id, code, countryCode, isActive',
    });

    // Each new version() call (rather than editing an earlier one) preserves
    // existing browsers' data across the upgrade.
    this.version(2).stores({
      runSchedules: 'id, affiliateCode, templateRunId, isActive, [affiliateCode+isActive]',
    });

    this.version(3).stores({
      limitConfigs: 'id, metricKey, affiliateCode, isActive, [affiliateCode+isActive]',
      temporaryLimits: 'id, limitId, expiresOn',
      breachNotes: 'id, breachId, recordedAt',
    });

    this.version(4).stores({
      connectors: 'id, vendor, status, isActive',
    });

    this.version(5).stores({
      approvals: 'id, status, module, affiliateCode, requestedAt',
      remediationIssues: 'id, stage, severity, affiliateCode, raisedAt',
      notificationRules: 'id, event, isActive, affiliateCode',
      riskEntries: 'id, category, affiliateCode',
      alcoMeetings: 'id, status, scheduledFor, affiliateCode',
      regulatoryReturns: 'id, regulator, affiliateCode, status, dueDate',
      reportPacks: 'id, kind, affiliateCode, status',
    });

    this.version(6).stores({
      stagedBatches: 'id, affiliateCode, domain, asOfDate, [affiliateCode+domain+asOfDate]',
    });

    this.version(7).stores({
      roles: 'code',
    });

    this.version(8).stores({
      snapshots: 'id, parentBatchId, parentRunId, affiliateCode, status, [affiliateCode+status]',
    });

    // Dimension members became affiliate-owned (no Group-wide list - see engine/types.ts DimensionMember).
    // Re-declaring the whole store (Dexie requires the full index list on every version, not a delta) adds
    // affiliateCode and the compound indexes the per-affiliate queries need.
    this.version(9).stores({
      dimensionMembers:
        'id, dimension, code, parentCode, affiliateCode, [dimension+code], [dimension+parentCode], ' +
        '[dimension+affiliateCode], [dimension+affiliateCode+code]',
    });

    // Archives a rule's content the instant before an edit overwrites it, so a run pinned to a
    // rule id + version (ProcessRun.ruleVersionsUsed) can still recover what that version actually
    // held even after the live row has since moved on.
    this.version(10).stores({
      ruleHistory: 'id, ruleId, version, [ruleId+version]',
    });

    // Behavioural-model calibration: uploaded balance / account history (each row tagged with the
    // upload it came from, so an upload can be audited and deleted as a unit) and the model register.
    this.version(11).stores({
      balanceHistory: 'id, affiliateCode, uploadId, [affiliateCode+uploadId]',
      accountHistory: 'id, affiliateCode, uploadId, [affiliateCode+uploadId]',
      modelRuns: 'id, affiliateCode, modelType, status, createdAt',
    });

    // Onboarding progress (organisation 'ORG' / 'AFF:<code>') and organisation/affiliate-scoped settings.
    this.version(12).stores({
      onboarding: 'id, affiliateCode, status',
      settings: 'id, affiliateCode, key, [affiliateCode+key]',
    });

    // Data sources (Phase 4): each affiliate's (and GROUP's) named feeds, with their expected fields.
    this.version(13).stores({
      dataSources: 'id, affiliateCode, domain, isActive, [affiliateCode+domain]',
    });

    // In-app notifications (header bell), one row per recipient.
    this.version(14).stores({
      notifications: 'id, userId, read, createdAt',
    });
  }
}

export const db = new AscentDb();
