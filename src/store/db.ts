import Dexie, { type EntityTable } from 'dexie';
import type { Connector, ApprovalRequest, RemediationIssue, NotificationRule, RiskEntry, AlcoMeeting, RegulatoryReturn, ReportPack } from '@/engine/types';
import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
import type { StagedBatch } from './repository';
import type {
  Affiliate,
  AuditEvent,
  DimensionMember,
  EconomicIndicator,
  HolidayCalendar,
  LoadBatch,
  Position,
  ProcessRun,
  Role,
  RuleMeta,
  RunResult,
  RunSchedule,
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
  }
}

export const db = new AscentDb();
