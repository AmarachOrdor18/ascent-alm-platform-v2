/**
 * Dexie schema.
 *
 * Indexes are declared deliberately — v1 shipped zero indexes across every
 * Postgres schema and filtered `positions` by affiliate, currency and bucket
 * on every call (engineering register §3.3). The compound indexes below are
 * the ones the query patterns in `repository.ts` actually use.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Connector, ApprovalRequest, RemediationIssue, NotificationRule, RiskEntry, AlcoMeeting, RegulatoryReturn, ReportPack } from '@/engine/types';
import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
import type {
  Affiliate,
  AuditEvent,
  DimensionMember,
  EconomicIndicator,
  HolidayCalendar,
  LoadBatch,
  Position,
  ProcessRun,
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

    // v2 adds recurring run definitions. Declaring a new version rather than
    // editing v1 keeps an existing browser's data intact across the upgrade.
    this.version(2).stores({
      runSchedules: 'id, affiliateCode, templateRunId, isActive, [affiliateCode+isActive]',
    });

    // v3 adds limit monitoring. The engine modules for this existed from
    // phase 1; nothing had ever persisted their configuration.
    this.version(3).stores({
      limitConfigs: 'id, metricKey, affiliateCode, isActive, [affiliateCode+isActive]',
      temporaryLimits: 'id, limitId, expiresOn',
      breachNotes: 'id, breachId, recordedAt',
    });

    // v4 makes connectors configurable. They were a hardcoded array in the
    // screen, so a bank could not add its own source or correct the status
    // this platform had asserted about theirs.
    this.version(4).stores({
      connectors: 'id, vendor, status, isActive',
    });

    // v5 gives the governance, monitoring and reporting screens somewhere to
    // live. They previously rendered hardcoded arrays because there was no
    // entity behind them at all.
    this.version(5).stores({
      approvals: 'id, status, module, affiliateCode, requestedAt',
      remediationIssues: 'id, stage, severity, affiliateCode, raisedAt',
      notificationRules: 'id, event, isActive, affiliateCode',
      riskEntries: 'id, category, affiliateCode',
      alcoMeetings: 'id, status, scheduledFor, affiliateCode',
      regulatoryReturns: 'id, regulator, affiliateCode, status, dueDate',
      reportPacks: 'id, kind, affiliateCode, status',
    });
  }
}

export const db = new AscentDb();
