/**
 * IndexedDB-backed implementation of `Repository`.
 *
 * Writes that touch more than one table go through `db.transaction` — v1 had
 * zero transactions, so a mid-file ingestion failure left positions written
 * but exceptions and audit events missing (engineering register §3.3).
 */

import { db, AscentDb } from './db';
import type { Dependency, PositionQuery, Repository, RuleQuery } from './repository';
import type {
  Affiliate,
  AuditEvent,
  DataDomain,
  DimensionMember,
  DimensionType,
  LoadBatch,
  Position,
  ProcessRun,
  RuleMeta,
  RunResult,
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
        this.database.users,
        this.database.auditEvents,
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
          this.database.users.clear(),
          this.database.auditEvents.clear(),
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
