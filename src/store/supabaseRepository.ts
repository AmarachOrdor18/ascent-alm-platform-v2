// The Repository against the shared Supabase (Postgres) database.
//
// Every table holds the app's full record in `data jsonb`, keyed by its id (or code), with snake_case
// columns generated from that record for filtering - see supabase/migrations/20261017000000_init.sql.
// Writes send only {pk, data}; reads select `data`. Row-level security decides what the signed-in user
// may see and change, so a denied write surfaces here as a "Not permitted: ..." error.
//
// Semantics deliberately mirror LocalRepository method by method (sorting, filters, archiving).
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { collectRuleReferences } from './localRepository';
import type {
  Dependency,
  Fixer,
  NotificationInput,
  PositionQuery,
  Repository,
  RuleQuery,
  StagedBatch,
  StoredAccountObservation,
  StoredBalanceObservation,
  StoredModelRun,
} from './repository';
import type { BreachNote, LimitConfig, TemporaryLimit } from '@/engine/limits';
import type {
  Affiliate,
  AppNotification,
  AuditEvent,
  DataSource,
  DataDomain,
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

/** Supabase's default max-rows per response; lists page through in steps of this. */
const PAGE = 1000;
/** Rows per insert/upsert request, so a large position book never becomes one giant request body. */
const CHUNK = 500;
/** Above this many values an `in (...)` filter risks an over-long URL; filter those in memory instead. */
const MAX_IN_LIST = 100;

type Pk = 'id' | 'code';
// The query builder's generics don't survive being passed through a helper; filters are typed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = (query: any) => any;

/** Turns a PostgREST error into one that names the table and reads clearly when RLS refused it. */
export function supabaseError(table: string, op: string, error: PostgrestError): Error {
  const message = error.message || 'unknown error';
  const denied = error.code === '42501' || /row-level security|permission denied|not permitted/i.test(message);
  if (denied) {
    const text = /^not permitted/i.test(message) ? message : `Not permitted: ${message}`;
    return new Error(`${text} (${op} ${table})`);
  }
  // Trigger-raised business rules (P0001), e.g. segregation of duties, are already worded for a user.
  if (error.code === 'P0001') return new Error(message);
  const extra = error.details ? ` - ${error.details}` : '';
  return new Error(`Database ${op} on ${table} failed: ${message}${extra}`);
}

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export class SupabaseRepository implements Repository {
  private get db() {
    return supabase();
  }

  // ── Generic table access ──────────────────────────────────────────────
  /** Every matching record, paged so PostgREST's row cap never truncates a list. */
  private async all<T>(table: string, pk: Pk = 'id', filter?: Filter): Promise<T[]> {
    const page = async (from: number, withCount: boolean) => {
      let query = this.db.from(table).select('data', withCount ? { count: 'exact' } : undefined);
      if (filter) query = filter(query);
      const { data, error, count } = await query.order(pk, { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw supabaseError(table, 'read', error);
      return { rows: ((data ?? []) as Array<{ data: T }>).map((r) => r.data), count: count ?? null };
    };
    // The first page also returns the total, so the rest can be fetched side by side instead of one after
    // another - a few thousand history rows otherwise took several round trips in a row.
    const first = await page(0, true);
    if (first.rows.length < PAGE) return first.rows;
    if (first.count === null) {
      const out = [...first.rows];
      for (let from = PAGE; ; from += PAGE) {
        const next = await page(from, false);
        out.push(...next.rows);
        if (next.rows.length < PAGE) return out;
      }
    }
    const starts: number[] = [];
    for (let from = PAGE; from < first.count; from += PAGE) starts.push(from);
    const rest = await Promise.all(starts.map((from) => page(from, false)));
    return [...first.rows, ...rest.flatMap((r) => r.rows)];
  }

  private async one<T>(table: string, pk: Pk, key: string): Promise<T | null> {
    const { data, error } = await this.db.from(table).select('data').eq(pk, key).maybeSingle();
    if (error) throw supabaseError(table, 'read', error);
    return data ? ((data as { data: T }).data ?? null) : null;
  }

  private async put<T extends object>(table: string, pk: Pk, rows: T[]): Promise<void> {
    for (const batch of chunks(rows)) {
      const payload = batch.map((row) => ({ [pk]: (row as Record<string, unknown>)[pk], data: row }));
      const { error } = await this.db.from(table).upsert(payload, { onConflict: pk });
      if (error) throw supabaseError(table, 'write', error);
    }
  }

  /**
   * Update-then-insert for tables whose insert and update policies differ (approvals, app_users): an
   * upsert would be judged against the insert policy even when the row already exists.
   */
  private async save<T extends object>(table: string, pk: Pk, row: T): Promise<void> {
    const key = (row as Record<string, unknown>)[pk] as string;
    const { data, error } = await this.db.from(table).update({ data: row }).eq(pk, key).select(pk);
    if (error) throw supabaseError(table, 'write', error);
    if ((data ?? []).length > 0) return;
    const { error: insertError } = await this.db.from(table).insert({ [pk]: key, data: row });
    if (insertError) throw supabaseError(table, 'write', insertError);
  }

  private async remove(table: string, pk: Pk, key: string): Promise<void> {
    const { error } = await this.db.from(table).delete().eq(pk, key);
    if (error) throw supabaseError(table, 'delete', error);
  }

  private async removeWhere(table: string, filter: Filter): Promise<number> {
    const { count, error } = await filter(this.db.from(table).delete({ count: 'exact' }));
    if (error) throw supabaseError(table, 'delete', error as PostgrestError);
    return (count as number | null) ?? 0;
  }

  // ── Affiliates ────────────────────────────────────────────────────────
  listAffiliates(): Promise<Affiliate[]> {
    return this.all<Affiliate>('affiliates', 'code');
  }

  getAffiliate(code: string): Promise<Affiliate | null> {
    return this.one<Affiliate>('affiliates', 'code', code);
  }

  // Update-then-insert: an Affiliate Administrator may update their own affiliate but never insert one,
  // and an upsert is judged against the insert policy even when the row exists.
  upsertAffiliate(affiliate: Affiliate): Promise<void> {
    return this.save('affiliates', 'code', affiliate);
  }

  deleteAffiliate(code: string): Promise<void> {
    return this.remove('affiliates', 'code', code);
  }

  // ── Dimensions ────────────────────────────────────────────────────────
  listDimensionMembers(dimension: DimensionType, affiliateCode?: string): Promise<DimensionMember[]> {
    return this.all<DimensionMember>('dimension_members', 'id', (q) => {
      const byDimension = q.eq('dimension', dimension);
      return affiliateCode ? byDimension.eq('affiliate_code', affiliateCode) : byDimension;
    });
  }

  upsertDimensionMembers(members: DimensionMember[]): Promise<void> {
    return this.put('dimension_members', 'id', members);
  }

  deleteDimensionMember(id: string): Promise<void> {
    return this.remove('dimension_members', 'id', id);
  }

  // ── Positions ─────────────────────────────────────────────────────────
  async queryPositions(query: PositionQuery): Promise<Position[]> {
    const inList = (values: string[] | undefined) => values && values.length > 0 && values.length <= MAX_IN_LIST;
    let rows = await this.all<Position>('positions', 'id', (q) => {
      let f = q;
      if (query.affiliateCode) f = f.eq('affiliate_code', query.affiliateCode);
      if (query.asOfDate) f = f.eq('as_of_date', query.asOfDate);
      if (query.currency) f = f.eq('currency', query.currency);
      if (inList(query.batchIds)) f = f.in('batch_id', query.batchIds);
      if (inList(query.orgUnitCodes)) f = f.in('org_unit_code', query.orgUnitCodes);
      if (inList(query.productCodes)) f = f.in('product_code', query.productCodes);
      return f;
    });
    // Long lists are applied here instead (and re-applying the short ones is harmless).
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
    return rows;
  }

  // Keyed by batch + position id: the same position id comes back every month-end, and keying by it alone
  // let each new upload overwrite the earlier month's book (and the runs pinned to it).
  async insertPositions(positions: Position[]): Promise<void> {
    for (const batch of chunks(positions)) {
      const payload = batch.map((p) => ({ id: `${p.batchId}:${p.id}`, data: p }));
      const { error } = await this.db.from('positions').upsert(payload, { onConflict: 'id' });
      if (error) throw supabaseError('positions', 'write', error);
    }
  }

  // ── Load batches ──────────────────────────────────────────────────────
  async listBatches(affiliateCode?: string, domain?: DataDomain): Promise<LoadBatch[]> {
    const rows = await this.all<LoadBatch>('batches', 'id', (q) => {
      if (!affiliateCode) return q;
      const byAffiliate = q.eq('affiliate_code', affiliateCode);
      return domain ? byAffiliate.eq('domain', domain) : byAffiliate;
    });
    return rows.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  getBatch(id: string): Promise<LoadBatch | null> {
    return this.one<LoadBatch>('batches', 'id', id);
  }

  upsertBatch(batch: LoadBatch): Promise<void> {
    return this.put('batches', 'id', [batch]);
  }

  // ── Staged (uncommitted) uploads ─────────────────────────────────────
  async listStagedBatches(affiliateCode?: string): Promise<StagedBatch[]> {
    const rows = await this.all<StagedBatch>('staged_batches', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async getStagedBatchFor(
    affiliateCode: string,
    domain: DataDomain,
    asOfDate: IsoDate,
    contributor?: PositionContributor,
  ): Promise<StagedBatch | null> {
    const candidates = await this.all<StagedBatch>('staged_batches', 'id', (q) =>
      q.eq('affiliate_code', affiliateCode).eq('domain', domain).eq('as_of_date', asOfDate),
    );
    return (
      candidates
        .filter((c) => !c.admitted)
        .find((c) => domain !== 'Positions' || c.batch.contributor === (contributor ?? null)) ?? null
    );
  }

  upsertStagedBatch(staged: StagedBatch): Promise<void> {
    return this.put('staged_batches', 'id', [staged]);
  }

  deleteStagedBatch(id: string): Promise<void> {
    return this.remove('staged_batches', 'id', id);
  }

  // ── Rules ─────────────────────────────────────────────────────────────
  async listRules(query: RuleQuery): Promise<RuleMeta[]> {
    let rows = await this.all<RuleMeta>('rules', 'id', (q) => (query.kind ? q.eq('kind', query.kind) : q));
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

  getRule<T extends RuleMeta>(id: string): Promise<T | null> {
    return this.one<T>('rules', 'id', id);
  }

  async upsertRule(rule: RuleMeta): Promise<void> {
    // Archive the row's current content before it's overwritten (see RuleVersionSnapshot).
    const previous = await this.one<RuleMeta>('rules', 'id', rule.id);
    if (previous) {
      const archived: RuleVersionSnapshot = {
        id: `${previous.id}:v${previous.version}`,
        ruleId: previous.id,
        version: previous.version,
        kind: previous.kind,
        snapshot: previous,
        archivedAt: new Date().toISOString(),
      };
      await this.put('rule_history', 'id', [archived]);
    }
    await this.put('rules', 'id', [rule]);
  }

  async getRuleVersion<T extends RuleMeta>(ruleId: string, version: number): Promise<T | null> {
    const row = await this.one<RuleVersionSnapshot>('rule_history', 'id', `${ruleId}:v${version}`);
    if (row) return row.snapshot as T;
    const current = await this.one<RuleMeta>('rules', 'id', ruleId);
    return current && current.version === version ? (current as T) : null;
  }

  async listRuleVersions(ruleId: string): Promise<RuleVersionSnapshot[]> {
    const rows = await this.all<RuleVersionSnapshot>('rule_history', 'id', (q) => q.eq('rule_id', ruleId));
    return rows.sort((a, b) => a.version - b.version);
  }

  async deleteRule(id: string): Promise<void> {
    const dependants = await this.checkDependencies(id);
    if (dependants.length > 0) {
      const names = dependants.map((d) => `${d.ruleName} (${d.relation})`).join(', ');
      throw new Error(`Cannot delete: still referenced by ${dependants.length} rule(s) - ${names}`);
    }
    await this.remove('rules', 'id', id);
  }

  async checkDependencies(id: string): Promise<Dependency[]> {
    const [rules, runs] = await Promise.all([this.all<RuleMeta>('rules'), this.all<ProcessRun>('runs')]);
    const deps: Dependency[] = [];

    for (const rule of rules) {
      if (rule.id === id) continue;
      if (collectRuleReferences(rule).includes(id)) {
        deps.push({ ruleId: rule.id, ruleKind: rule.kind, ruleName: rule.name, relation: 'referenced by rule' });
      }
    }

    for (const run of runs) {
      const referenced =
        run.timeBucketRuleId === id ||
        run.productCharacteristicRuleId === id ||
        run.behaviourPatternRuleId === id ||
        run.prepaymentRuleId === id ||
        run.newBusinessRuleId === id ||
        run.transactionStrategyId === id ||
        run.ftpRuleId === id ||
        run.adjustmentRuleId === id ||
        run.costAllocationRuleId === id ||
        run.creditLossRuleId === id ||
        run.capitalRuleId === id ||
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
    const rows = await this.all<ProcessRun>('runs', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRun(id: string): Promise<ProcessRun | null> {
    return this.one<ProcessRun>('runs', 'id', id);
  }

  upsertRun(run: ProcessRun): Promise<void> {
    return this.put('runs', 'id', [run]);
  }

  listRunResults(runId: string): Promise<RunResult[]> {
    return this.all<RunResult>('run_results', 'id', (q) => q.eq('run_id', runId));
  }

  insertRunResults(results: RunResult[]): Promise<void> {
    return this.put('run_results', 'id', results);
  }

  // ── Editable snapshots ────────────────────────────────────────────────
  async listSnapshots(affiliateCode?: string): Promise<PositionSnapshot[]> {
    const rows = await this.all<PositionSnapshot>('snapshots', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getSnapshot(id: string): Promise<PositionSnapshot | null> {
    return this.one<PositionSnapshot>('snapshots', 'id', id);
  }

  upsertSnapshot(snapshot: PositionSnapshot): Promise<void> {
    return this.put('snapshots', 'id', [snapshot]);
  }

  deleteSnapshot(id: string): Promise<void> {
    return this.remove('snapshots', 'id', id);
  }

  // ── Governance, monitoring and reporting ──────────────────────────────
  // A null affiliateCode means the row is Group-wide and applies everywhere.
  private async scoped<T extends { affiliateCode?: string | null }>(
    table: string,
    affiliateCode?: string,
  ): Promise<T[]> {
    const rows = await this.all<T>(table);
    if (!affiliateCode || affiliateCode === 'GROUP') return rows;
    return rows.filter((r) => r.affiliateCode == null || r.affiliateCode === affiliateCode);
  }

  listApprovalRequests(affiliateCode?: string): Promise<ApprovalRequest[]> {
    return this.scoped<ApprovalRequest>('approvals', affiliateCode);
  }

  upsertApprovalRequest(row: ApprovalRequest): Promise<void> {
    return this.save('approvals', 'id', row);
  }

  deleteApprovalRequest(id: string): Promise<void> {
    return this.remove('approvals', 'id', id);
  }

  listRemediationIssues(affiliateCode?: string): Promise<RemediationIssue[]> {
    return this.scoped<RemediationIssue>('remediation_issues', affiliateCode);
  }

  upsertRemediationIssue(row: RemediationIssue): Promise<void> {
    return this.put('remediation_issues', 'id', [row]);
  }

  deleteRemediationIssue(id: string): Promise<void> {
    return this.remove('remediation_issues', 'id', id);
  }

  listNotificationRules(affiliateCode?: string): Promise<NotificationRule[]> {
    return this.scoped<NotificationRule>('notification_rules', affiliateCode);
  }

  upsertNotificationRule(row: NotificationRule): Promise<void> {
    return this.put('notification_rules', 'id', [row]);
  }

  deleteNotificationRule(id: string): Promise<void> {
    return this.remove('notification_rules', 'id', id);
  }

  listRiskEntrys(affiliateCode?: string): Promise<RiskEntry[]> {
    return this.scoped<RiskEntry>('risk_entries', affiliateCode);
  }

  upsertRiskEntry(row: RiskEntry): Promise<void> {
    return this.put('risk_entries', 'id', [row]);
  }

  deleteRiskEntry(id: string): Promise<void> {
    return this.remove('risk_entries', 'id', id);
  }

  listAlcoMeetings(affiliateCode?: string): Promise<AlcoMeeting[]> {
    return this.scoped<AlcoMeeting>('alco_meetings', affiliateCode);
  }

  upsertAlcoMeeting(row: AlcoMeeting): Promise<void> {
    return this.put('alco_meetings', 'id', [row]);
  }

  deleteAlcoMeeting(id: string): Promise<void> {
    return this.remove('alco_meetings', 'id', id);
  }

  listRegulatoryReturns(affiliateCode?: string): Promise<RegulatoryReturn[]> {
    return this.scoped<RegulatoryReturn>('regulatory_returns', affiliateCode);
  }

  upsertRegulatoryReturn(row: RegulatoryReturn): Promise<void> {
    return this.put('regulatory_returns', 'id', [row]);
  }

  deleteRegulatoryReturn(id: string): Promise<void> {
    return this.remove('regulatory_returns', 'id', id);
  }

  listReportPacks(affiliateCode?: string): Promise<ReportPack[]> {
    return this.scoped<ReportPack>('report_packs', affiliateCode);
  }

  upsertReportPack(row: ReportPack): Promise<void> {
    return this.put('report_packs', 'id', [row]);
  }

  deleteReportPack(id: string): Promise<void> {
    return this.remove('report_packs', 'id', id);
  }

  // ── Data sources ──────────────────────────────────────────────────────
  async listDataSources(affiliateCode?: string): Promise<DataSource[]> {
    const rows = await this.all<DataSource>('data_sources', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => a.affiliateCode.localeCompare(b.affiliateCode) || a.name.localeCompare(b.name));
  }

  getDataSource(id: string): Promise<DataSource | null> {
    return this.one<DataSource>('data_sources', 'id', id);
  }

  upsertDataSource(source: DataSource): Promise<void> {
    return this.save('data_sources', 'id', source);
  }

  deleteDataSource(id: string): Promise<void> {
    return this.remove('data_sources', 'id', id);
  }

  // ── Connectors ────────────────────────────────────────────────────────
  async listConnectors(): Promise<Connector[]> {
    const rows = await this.all<Connector>('connectors');
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  upsertConnector(connector: Connector): Promise<void> {
    return this.put('connectors', 'id', [connector]);
  }

  deleteConnector(id: string): Promise<void> {
    return this.remove('connectors', 'id', id);
  }

  // ── Limits ────────────────────────────────────────────────────────────
  async listLimitConfigs(affiliateCode?: string): Promise<LimitConfig[]> {
    const rows = await this.all<LimitConfig>('limit_configs');
    return rows
      .filter((r) => !affiliateCode || r.affiliateCode === null || r.affiliateCode === affiliateCode)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  upsertLimitConfig(config: LimitConfig): Promise<void> {
    return this.put('limit_configs', 'id', [config]);
  }

  deleteLimitConfig(id: string): Promise<void> {
    return this.remove('limit_configs', 'id', id);
  }

  listTemporaryLimits(): Promise<TemporaryLimit[]> {
    return this.all<TemporaryLimit>('temporary_limits');
  }

  upsertTemporaryLimit(temp: TemporaryLimit): Promise<void> {
    return this.put('temporary_limits', 'id', [temp]);
  }

  deleteTemporaryLimit(id: string): Promise<void> {
    return this.remove('temporary_limits', 'id', id);
  }

  async listBreachNotes(breachId?: string): Promise<BreachNote[]> {
    const rows = await this.all<BreachNote>('breach_notes', 'id', (q) => (breachId ? q.eq('breach_id', breachId) : q));
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  }

  upsertBreachNote(note: BreachNote): Promise<void> {
    return this.put('breach_notes', 'id', [note]);
  }

  // ── Schedules ─────────────────────────────────────────────────────────
  async listSchedules(affiliateCode?: string): Promise<RunSchedule[]> {
    const rows = await this.all<RunSchedule>('run_schedules', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  getSchedule(id: string): Promise<RunSchedule | null> {
    return this.one<RunSchedule>('run_schedules', 'id', id);
  }

  upsertSchedule(schedule: RunSchedule): Promise<void> {
    return this.put('run_schedules', 'id', [schedule]);
  }

  deleteSchedule(id: string): Promise<void> {
    return this.remove('run_schedules', 'id', id);
  }

  // ── Users ─────────────────────────────────────────────────────────────
  // Credentials live in Supabase Auth, never in the app_users record; passwordHash reads back empty.
  async listUsers(): Promise<User[]> {
    const users = await this.all<User>('app_users');
    return users.map(withoutCredential).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const rows = await this.all<User>('app_users', 'id', (q) => q.eq('email', email.toLowerCase()));
    return rows[0] ? withoutCredential(rows[0]) : null;
  }

  /** The app_users record linked to a Supabase Auth user, if one is provisioned. */
  async getUserByAuthId(authUserId: string): Promise<User | null> {
    const rows = await this.all<User>('app_users', 'id', (q) => q.eq('auth_user_id', authUserId));
    return rows[0] ? withoutCredential(rows[0]) : null;
  }

  upsertUser(user: User): Promise<void> {
    const { passwordHash: _discarded, ...record } = { ...user, email: user.email.toLowerCase() };
    void _discarded;
    return this.save('app_users', 'id', record);
  }

  // ── Roles ─────────────────────────────────────────────────────────────
  listRoles(): Promise<Role[]> {
    return this.all<Role>('roles', 'code');
  }

  upsertRole(role: Role): Promise<void> {
    return this.put('roles', 'code', [role]);
  }

  deleteRole(code: string): Promise<void> {
    return this.remove('roles', 'code', code);
  }

  // ── Reference data ────────────────────────────────────────────────────
  listYieldCurves(currency?: string): Promise<StoredYieldCurve[]> {
    return this.all<StoredYieldCurve>('yield_curves', 'id', (q) => (currency ? q.eq('currency', currency) : q));
  }

  getYieldCurve(id: string): Promise<StoredYieldCurve | null> {
    return this.one<StoredYieldCurve>('yield_curves', 'id', id);
  }

  upsertYieldCurve(curve: StoredYieldCurve): Promise<void> {
    return this.put('yield_curves', 'id', [
      { ...curve, terms: [...curve.terms].sort((a, b) => a.tenorDays - b.tenorDays) },
    ]);
  }

  deleteYieldCurve(id: string): Promise<void> {
    return this.remove('yield_curves', 'id', id);
  }

  listCurrencies(): Promise<StoredCurrency[]> {
    return this.all<StoredCurrency>('currencies', 'code');
  }

  upsertCurrency(currency: StoredCurrency): Promise<void> {
    return this.put('currencies', 'code', [currency]);
  }

  deleteCurrency(code: string): Promise<void> {
    return this.remove('currencies', 'code', code);
  }

  async listFxRates(asOfDate?: IsoDate): Promise<StoredFxRate[]> {
    const rows = await this.all<StoredFxRate>('fx_rates', 'id', (q) => (asOfDate ? q.eq('as_of_date', asOfDate) : q));
    return rows.sort((a, b) => b.asOfDate.localeCompare(a.asOfDate) || a.base.localeCompare(b.base));
  }

  upsertFxRate(rate: StoredFxRate): Promise<void> {
    return this.put('fx_rates', 'id', [rate]);
  }

  deleteFxRate(id: string): Promise<void> {
    return this.remove('fx_rates', 'id', id);
  }

  listEconomicIndicators(countryCode?: string): Promise<EconomicIndicator[]> {
    return this.all<EconomicIndicator>('economic_indicators', 'id', (q) =>
      countryCode ? q.eq('country_code', countryCode) : q,
    );
  }

  getEconomicIndicator(id: string): Promise<EconomicIndicator | null> {
    return this.one<EconomicIndicator>('economic_indicators', 'id', id);
  }

  upsertEconomicIndicator(indicator: EconomicIndicator): Promise<void> {
    return this.put('economic_indicators', 'id', [
      { ...indicator, observations: [...indicator.observations].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)) },
    ]);
  }

  deleteEconomicIndicator(id: string): Promise<void> {
    return this.remove('economic_indicators', 'id', id);
  }

  listHolidayCalendars(): Promise<HolidayCalendar[]> {
    return this.all<HolidayCalendar>('holiday_calendars');
  }

  getHolidayCalendar(id: string): Promise<HolidayCalendar | null> {
    return this.one<HolidayCalendar>('holiday_calendars', 'id', id);
  }

  upsertHolidayCalendar(calendar: HolidayCalendar): Promise<void> {
    return this.put('holiday_calendars', 'id', [
      { ...calendar, holidays: [...calendar.holidays].sort((a, b) => a.date.localeCompare(b.date)) },
    ]);
  }

  deleteHolidayCalendar(id: string): Promise<void> {
    return this.remove('holiday_calendars', 'id', id);
  }

  // ── Behavioural-model history and register ────────────────────────────
  insertBalanceHistory(rows: StoredBalanceObservation[]): Promise<void> {
    return this.put('balance_history', 'id', rows);
  }

  listBalanceHistory(affiliateCode: string): Promise<StoredBalanceObservation[]> {
    return this.all<StoredBalanceObservation>('balance_history', 'id', (q) => q.eq('affiliate_code', affiliateCode));
  }

  deleteBalanceHistory(affiliateCode: string, uploadId?: string): Promise<number> {
    return this.removeWhere('balance_history', (q) => {
      const byAffiliate = q.eq('affiliate_code', affiliateCode);
      return uploadId ? byAffiliate.eq('upload_id', uploadId) : byAffiliate;
    });
  }

  insertAccountHistory(rows: StoredAccountObservation[]): Promise<void> {
    return this.put('account_history', 'id', rows);
  }

  listAccountHistory(affiliateCode: string): Promise<StoredAccountObservation[]> {
    return this.all<StoredAccountObservation>('account_history', 'id', (q) => q.eq('affiliate_code', affiliateCode));
  }

  deleteAccountHistory(affiliateCode: string, uploadId?: string): Promise<number> {
    return this.removeWhere('account_history', (q) => {
      const byAffiliate = q.eq('affiliate_code', affiliateCode);
      return uploadId ? byAffiliate.eq('upload_id', uploadId) : byAffiliate;
    });
  }

  async listModelRuns(affiliateCode?: string): Promise<StoredModelRun[]> {
    const rows = await this.all<StoredModelRun>('model_runs', 'id', (q) =>
      affiliateCode ? q.eq('affiliate_code', affiliateCode) : q,
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getModelRun(id: string): Promise<StoredModelRun | null> {
    return this.one<StoredModelRun>('model_runs', 'id', id);
  }

  upsertModelRun(run: StoredModelRun): Promise<void> {
    return this.put('model_runs', 'id', [run]);
  }

  // ── Onboarding state and scoped settings ──────────────────────────────
  getOnboarding(id: string): Promise<OnboardingRecord | null> {
    return this.one<OnboardingRecord>('onboarding', 'id', id);
  }

  listOnboarding(): Promise<OnboardingRecord[]> {
    return this.all<OnboardingRecord>('onboarding');
  }

  upsertOnboarding(record: OnboardingRecord): Promise<void> {
    return this.save('onboarding', 'id', record);
  }

  async listSettings(affiliateCode?: string): Promise<SettingRecord[]> {
    return this.all<SettingRecord>('settings', 'id', (q) => {
      if (!affiliateCode) return q;
      if (affiliateCode === 'GROUP') return q.eq('affiliate_code', 'GROUP');
      return q.in('affiliate_code', ['GROUP', affiliateCode]);
    });
  }

  upsertSetting(setting: SettingRecord): Promise<void> {
    return this.save('settings', 'id', setting);
  }

  deleteSetting(id: string): Promise<void> {
    return this.remove('settings', 'id', id);
  }

  // ── Notifications ─────────────────────────────────────────────────────
  // Row-level security returns only the signed-in user's own rows; the newest 100 are plenty for the bell.
  async listNotifications(_userId: string): Promise<AppNotification[]> {
    void _userId;
    const { data, error } = await this.db
      .from('notifications')
      .select('data')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw supabaseError('notifications', 'read', error);
    return ((data ?? []) as Array<{ data: AppNotification }>).map((r) => r.data);
  }

  async clearNotifications(ids: string[]): Promise<void> {
    // RLS limits the delete to the signed-in user's own rows.
    for (const batch of chunks(ids, MAX_IN_LIST)) {
      const { error } = await this.db.from('notifications').delete().in('id', batch);
      if (error) throw supabaseError('notifications', 'delete', error);
    }
  }

  async markNotificationsRead(ids: string[]): Promise<void> {
    for (const id of ids) {
      const row = await this.one<AppNotification>('notifications', 'id', id);
      if (!row || row.read) continue;
      const { error } = await this.db
        .from('notifications')
        .update({ data: { ...row, read: true } })
        .eq('id', id);
      if (error) throw supabaseError('notifications', 'write', error);
    }
  }

  /** Fan-out happens in the database (app.notify), which also skips the sender. */
  async sendNotification(input: NotificationInput, _sender: { id: string } | null): Promise<void> {
    void _sender;
    const { error } = await this.db.rpc('send_notification', {
      p_affiliate_code: input.affiliateCode,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body,
      p_link: input.link,
      p_group_users: input.groupUsers ?? true,
    });
    if (error) throw supabaseError('notifications', 'write', error);
  }

  async listWhoCanFix(permission: string, affiliateCode: string | null): Promise<Fixer[]> {
    const { data, error } = await this.db.rpc('who_can_fix', {
      p_permission: permission,
      p_affiliate_code: affiliateCode,
    });
    if (error) throw supabaseError('app_users', 'read', error);
    return (data ?? []) as Fixer[];
  }

  // ── Audit ─────────────────────────────────────────────────────────────
  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    const out: AuditEvent[] = [];
    for (let from = 0; from < limit; from += PAGE) {
      const to = Math.min(from + PAGE, limit) - 1;
      const { data, error } = await this.db
        .from('audit_events')
        .select('data')
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);
      if (error) throw supabaseError('audit_events', 'read', error);
      const rows = (data ?? []) as Array<{ data: AuditEvent }>;
      for (const row of rows) out.push(row.data);
      if (rows.length < to - from + 1) break;
    }
    return out;
  }

  /** Append-only: a plain insert (the database refuses updates, so an upsert would be rejected). */
  async recordAuditEvent(event: AuditEvent): Promise<void> {
    const { error } = await this.db.from('audit_events').insert({ id: event.id, data: event });
    if (error?.code === '23505') {
      // Event ids are timestamp-based per screen, so two browsers (or two modules) can collide within a
      // millisecond; the trail can't overwrite, so the later event takes a suffixed id instead.
      const id = `${event.id}-${Math.random().toString(36).slice(2, 8)}`;
      const retry = await this.db.from('audit_events').insert({ id, data: { ...event, id } });
      if (retry.error) throw supabaseError('audit_events', 'write', retry.error);
      return;
    }
    if (error) throw supabaseError('audit_events', 'write', error);
  }

  // ── Maintenance ───────────────────────────────────────────────────────
  async reset(): Promise<void> {
    throw new Error(
      'Resetting is disabled on the shared Supabase database - it cannot be wiped from a browser. ' +
        'Re-seed from a workstation with scripts/seed-supabase.ts instead.',
    );
  }
}

function withoutCredential(user: User): User {
  return { ...user, passwordHash: '' };
}

export const supabaseRepository = new SupabaseRepository();
