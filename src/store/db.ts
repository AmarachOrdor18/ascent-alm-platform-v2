/**
 * Dexie schema.
 *
 * Indexes are declared deliberately — v1 shipped zero indexes across every
 * Postgres schema and filtered `positions` by affiliate, currency and bucket
 * on every call (engineering register §3.3). The compound indexes below are
 * the ones the query patterns in `repository.ts` actually use.
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  Affiliate,
  AuditEvent,
  DimensionMember,
  LoadBatch,
  Position,
  ProcessRun,
  RuleMeta,
  RunResult,
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
  users!: EntityTable<User, 'id'>;
  auditEvents!: EntityTable<AuditEvent, 'id'>;

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
    });
  }
}

export const db = new AscentDb();
