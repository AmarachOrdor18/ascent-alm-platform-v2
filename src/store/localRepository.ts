/**
 * IndexedDB-backed implementation of `Repository`.
 *
 * Writes that touch more than one table go through `db.transaction` — v1 had
 * zero transactions, so a mid-file ingestion failure left positions written
 * but exceptions and audit events missing (engineering register §3.3).
 */

import { db, AscentDb } from './db';
import type { Dependency, PositionQuery, Repository, RuleQuery } from './repository';
import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
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
  RuleMeta,
  RunResult,
  RunSchedule,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
  User,
} from '@/engine/types';

export class LocalRepository implements Repository {
  constructor(private readonly database: AscentDb = db) {}

  // ── Affiliates ────────────────────────────────────────────────────────
  listAffiliates(): Promise<Affiliate[]> {
    return this.database.affiliates.orderBy('code').toArray();
  }

  async getAffiliate(code: string): Promise<Affiliate | null> {
    return (await this.database.affiliates.get(code)) ?? null;
  }

  async upsertAffiliate(affiliate: Affiliate): Promise<void> {
    await this.database.affiliates.put(affiliate);
  }

  // ── Dimensions ────────────────────────────────────────────────────────
  listDimensionMembers(dimension: DimensionType): Promise<DimensionMember[]> {
    return this.database.dimensionMembers.where('dimension').equals(dimension).toArray();
  }

  async upsertDimensionMembers(members: DimensionMember[]): Promise<void> {
    await this.database.dimensionMembers.bulkPut(members);
  }

  // ── Positions ─────────────────────────────────────────────────────────
  async queryPositions(query: PositionQuery): Promise<Position[]> {
    let rows: Position[];

    // Use the narrowest available index rather than scanning the table.
    if (query.affiliateCode && query.asOfDate) {
      rows = await this.database.positions
        .where('[affiliateCode+asOfDate]')
        .equals([query.affiliateCode, query.asOfDate])
        .toArray();
    } else if (query.affiliateCode) {
      rows = await this.database.positions.where('affiliateCode').equals(query.affiliateCode).toArray();
    } else if (query.asOfDate) {
      rows = await this.database.positions.where('asOfDate').equals(query.asOfDate).toArray();
    } else {
      rows = await this.database.positions.toArray();
    }

    if (query.batchIds?.length) {
      const ids = new Set(query.batchIds);
      rows = rows.filter((p) => ids.has(p.batchId));
    }
    if (query.orgUnitCodes?.length) {
      const codes = new Set(query.orgUnitCodes);
      rows = rows.filter((p) => codes.has(p.orgUnitCode));
    }
    if (query.productCodes?.length) {
      const codes = new Set(query.productCodes);
      rows = rows.filter((p) => codes.has(p.productCode));
    }
    if (query.currency) {
      rows = rows.filter((p) => p.currency === query.currency);
    }
    return rows;
  }

  async insertPositions(positions: Position[]): Promise<void> {
    await this.database.positions.bulkPut(positions);
  }

  // ── Load batches ──────────────────────────────────────────────────────
  async listBatches(affiliateCode?: string, domain?: DataDomain): Promise<LoadBatch[]> {
    let rows: LoadBatch[];
    if (affiliateCode && domain) {
      rows = await this.database.batches.where('[affiliateCode+domain]').equals([affiliateCode, domain]).toArray();
    } else if (affiliateCode) {
      rows = await this.database.batches.where('affiliateCode').equals(affiliateCode).toArray();
    } else {
      rows = await this.database.batches.toArray();
    }
    return rows.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  async getBatch(id: string): Promise<LoadBatch | null> {
    return (await this.database.batches.get(id)) ?? null;
  }

  async upsertBatch(batch: LoadBatch): Promise<void> {
    await this.database.batches.put(batch);
  }

  // ── Rules ─────────────────────────────────────────────────────────────
  async listRules(query: RuleQuery): Promise<RuleMeta[]> {
    let rows: RuleMeta[];
    if (query.kind) {
      rows = await this.database.rules.where('kind').equals(query.kind).toArray();
    } else {
      rows = await this.database.rules.toArray();
    }
    if (query.affiliateCode !== undefined) {
      rows = rows.filter((r) => r.affiliateCode === query.affiliateCode);
    }
    if (query.folder) {
      rows = rows.filter((r) => r.folder === query.folder);
    }
    if (query.activeOnly) {
      rows = rows.filter((r) => r.isActive);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getRule<T extends RuleMeta>(id: string): Promise<T | null> {
    return ((await this.database.rules.get(id)) as T | undefined) ?? null;
  }

  async upsertRule(rule: RuleMeta): Promise<void> {
    await this.database.rules.put(rule);
  }

  async deleteRule(id: string): Promise<void> {
    const dependants = await this.checkDependencies(id);
    if (dependants.length > 0) {
      const names = dependants.map((d) => `${d.ruleName} (${d.relation})`).join(', ');
      throw new Error(`Cannot delete: still referenced by ${dependants.length} rule(s) — ${names}`);
    }
    await this.database.rules.delete(id);
  }

  /**
   * Dependency checking is real, not decorative — deleting a Time Bucket rule
   * that an active run or scenario references is blocked, and the blockers
   * are named. See build plan §6.
   */
  async checkDependencies(id: string): Promise<Dependency[]> {
    const [rules, runs] = await Promise.all([this.database.rules.toArray(), this.database.runs.toArray()]);
    const deps: Dependency[] = [];

    for (const rule of rules) {
      if (rule.id === id) continue;
      const refs = collectRuleReferences(rule);
      if (refs.includes(id)) {
        deps.push({ ruleId: rule.id, ruleKind: rule.kind, ruleName: rule.name, relation: 'referenced by rule' });
      }
    }

    for (const run of runs) {
      const referenced =
        run.timeBucketRuleId === id ||
        run.productCharacteristicRuleId === id ||
        run.behaviourPatternRuleId === id ||
        run.newBusinessRuleId === id ||
        run.transactionStrategyId === id ||
        run.forecastScenarioIds.includes(id) ||
        run.filterId === id;
      if (referenced) {
        deps.push({
          ruleId: run.id,
          ruleKind: 'ForecastScenario',
          ruleName: run.name,
          relation: 'used by process run',
        });
      }
    }

    return deps;
  }

  // ── Runs ──────────────────────────────────────────────────────────────
  async listRuns(affiliateCode?: string): Promise<ProcessRun[]> {
    const rows = affiliateCode
      ? await this.database.runs.where('affiliateCode').equals(affiliateCode).toArray()
      : await this.database.runs.toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(id: string): Promise<ProcessRun | null> {
    return (await this.database.runs.get(id)) ?? null;
  }

  async upsertRun(run: ProcessRun): Promise<void> {
    await this.database.runs.put(run);
  }

  listRunResults(runId: string): Promise<RunResult[]> {
    return this.database.runResults.where('runId').equals(runId).toArray();
  }

  async insertRunResults(results: RunResult[]): Promise<void> {
    await this.database.runResults.bulkPut(results);
  }

  // ── Limits ────────────────────────────────────────────────────────────
  async listLimitConfigs(affiliateCode?: string): Promise<LimitConfig[]> {
    const rows = await this.database.limitConfigs.toArray();
    // A limit with a null affiliate is a Group-wide default and applies
    // everywhere, so it is returned alongside the affiliate's own.
    return rows
      .filter((r) => !affiliateCode || r.affiliateCode === null || r.affiliateCode === affiliateCode)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async upsertLimitConfig(config: LimitConfig): Promise<void> {
    await this.database.limitConfigs.put(config);
  }

  async deleteLimitConfig(id: string): Promise<void> {
    await this.database.limitConfigs.delete(id);
  }

  listTemporaryLimits(): Promise<TemporaryLimit[]> {
    return this.database.temporaryLimits.toArray();
  }

  async upsertTemporaryLimit(temp: TemporaryLimit): Promise<void> {
    await this.database.temporaryLimits.put(temp);
  }

  async deleteTemporaryLimit(id: string): Promise<void> {
    await this.database.temporaryLimits.delete(id);
  }

  async listBreachNotes(breachId?: string): Promise<BreachNote[]> {
    const rows = breachId
      ? await this.database.breachNotes.where('breachId').equals(breachId).toArray()
      : await this.database.breachNotes.toArray();
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  async upsertBreachNote(note: BreachNote): Promise<void> {
    await this.database.breachNotes.put(note);
  }

  // ── Schedules ─────────────────────────────────────────────────────────
  async listSchedules(affiliateCode?: string): Promise<RunSchedule[]> {
    const rows = affiliateCode
      ? await this.database.runSchedules.where('affiliateCode').equals(affiliateCode).toArray()
      : await this.database.runSchedules.toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSchedule(id: string): Promise<RunSchedule | null> {
    return (await this.database.runSchedules.get(id)) ?? null;
  }

  async upsertSchedule(schedule: RunSchedule): Promise<void> {
    await this.database.runSchedules.put(schedule);
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.database.runSchedules.delete(id);
  }

  // ── Users ─────────────────────────────────────────────────────────────
  listUsers(): Promise<User[]> {
    return this.database.users.orderBy('name').toArray();
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return (await this.database.users.where('email').equals(email.toLowerCase()).first()) ?? null;
  }

  async upsertUser(user: User): Promise<void> {
    await this.database.users.put({ ...user, email: user.email.toLowerCase() });
  }

  // ── Reference data ────────────────────────────────────────────────────
  listYieldCurves(currency?: string): Promise<StoredYieldCurve[]> {
    return currency
      ? this.database.yieldCurves.where('currency').equals(currency).toArray()
      : this.database.yieldCurves.toArray();
  }

  async getYieldCurve(id: string): Promise<StoredYieldCurve | null> {
    return (await this.database.yieldCurves.get(id)) ?? null;
  }

  async upsertYieldCurve(curve: StoredYieldCurve): Promise<void> {
    // Terms are kept sorted on write so every reader — interpolation
    // included — can rely on the ordering.
    await this.database.yieldCurves.put({
      ...curve,
      terms: [...curve.terms].sort((a, b) => a.tenorDays - b.tenorDays),
    });
  }

  async deleteYieldCurve(id: string): Promise<void> {
    await this.database.yieldCurves.delete(id);
  }

  listCurrencies(): Promise<StoredCurrency[]> {
    return this.database.currencies.orderBy('code').toArray();
  }

  async upsertCurrency(currency: StoredCurrency): Promise<void> {
    await this.database.currencies.put(currency);
  }

  async listFxRates(asOfDate?: IsoDate): Promise<StoredFxRate[]> {
    const rows = asOfDate
      ? await this.database.fxRates.where('asOfDate').equals(asOfDate).toArray()
      : await this.database.fxRates.toArray();
    return rows.sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || a.base.localeCompare(b.base));
  }

  async upsertFxRate(rate: StoredFxRate): Promise<void> {
    await this.database.fxRates.put(rate);
  }

  async deleteFxRate(id: string): Promise<void> {
    await this.database.fxRates.delete(id);
  }

  listEconomicIndicators(countryCode?: string): Promise<EconomicIndicator[]> {
    return countryCode
      ? this.database.economicIndicators.where('countryCode').equals(countryCode).toArray()
      : this.database.economicIndicators.toArray();
  }

  async getEconomicIndicator(id: string): Promise<EconomicIndicator | null> {
    return (await this.database.economicIndicators.get(id)) ?? null;
  }

  async upsertEconomicIndicator(indicator: EconomicIndicator): Promise<void> {
    await this.database.economicIndicators.put({
      ...indicator,
      observations: [...indicator.observations].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)),
    });
  }

  async deleteEconomicIndicator(id: string): Promise<void> {
    await this.database.economicIndicators.delete(id);
  }

  listHolidayCalendars(): Promise<HolidayCalendar[]> {
    return this.database.holidayCalendars.toArray();
  }

  async getHolidayCalendar(id: string): Promise<HolidayCalendar | null> {
    return (await this.database.holidayCalendars.get(id)) ?? null;
  }

  async upsertHolidayCalendar(calendar: HolidayCalendar): Promise<void> {
    await this.database.holidayCalendars.put({
      ...calendar,
      holidays: [...calendar.holidays].sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  async deleteHolidayCalendar(id: string): Promise<void> {
    await this.database.holidayCalendars.delete(id);
  }

  // ── Audit ─────────────────────────────────────────────────────────────
  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    return this.database.auditEvents.orderBy('recordedAt').reverse().limit(limit).toArray();
  }

  async recordAuditEvent(event: AuditEvent): Promise<void> {
    await this.database.auditEvents.put(event);
  }

  // ── Maintenance ───────────────────────────────────────────────────────
  async reset(): Promise<void> {
    await this.database.transaction(
      'rw',
      [
        this.database.affiliates,
        this.database.dimensionMembers,
        this.database.positions,
        this.database.batches,
        this.database.rules,
        this.database.runs,
        this.database.runResults,
        this.database.runSchedules,
        this.database.limitConfigs,
        this.database.temporaryLimits,
        this.database.breachNotes,
        this.database.users,
        this.database.auditEvents,
        this.database.yieldCurves,
        this.database.currencies,
        this.database.fxRates,
        this.database.economicIndicators,
        this.database.holidayCalendars,
      ],
      async () => {
        await Promise.all([
          this.database.affiliates.clear(),
          this.database.dimensionMembers.clear(),
          this.database.positions.clear(),
          this.database.batches.clear(),
          this.database.rules.clear(),
          this.database.runs.clear(),
          this.database.runResults.clear(),
          this.database.runSchedules.clear(),
          this.database.limitConfigs.clear(),
          this.database.temporaryLimits.clear(),
          this.database.breachNotes.clear(),
          this.database.users.clear(),
          this.database.auditEvents.clear(),
          this.database.yieldCurves.clear(),
          this.database.currencies.clear(),
          this.database.fxRates.clear(),
          this.database.economicIndicators.clear(),
          this.database.holidayCalendars.clear(),
        ]);
      },
    );
  }
}

/** Rule bodies vary by kind; gather any `*RuleId`/`*Ids` fields generically. */
function collectRuleReferences(rule: RuleMeta): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(rule)) {
    if (!/Id$|Ids$/.test(key)) continue;
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === 'string'));
  }
  return out;
}

export const repository: Repository = new LocalRepository();
