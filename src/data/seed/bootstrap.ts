/**
 * Seeds the local database on first run.
 *
 * Idempotent: it checks for an existing marker and does nothing if the
 * database already holds data, so a page refresh never discards work the
 * user has done. `reseed` is the explicit reset used by the demo control.
 */

import type { Repository } from '@/store/repository';
import type { LoadBatch, User } from '@/engine/types';
import {
  AFFILIATE_CURRENCIES,
  AFFILIATE_FX_RATES,
  ALL_AFFILIATE_REFERENCE,
} from './affiliateReference';
import { SEED_CONNECTORS } from './connectors';
import { SEED_LIMITS } from './limits';
import { NIGERIA_AS_OF, NIGERIA_BATCH_ID, NIGERIA_POSITIONS } from './nigeria';
import { GHANA_AS_OF, GHANA_BATCH_ID, GHANA_POSITIONS } from './ghana';
import { COTEIVOIRE_AS_OF, COTEIVOIRE_BATCH_ID, COTEIVOIRE_POSITIONS } from './cotedivoire';
import {
  AFFILIATES,
  ALL_DIMENSION_MEMBERS,
  CURRENCIES,
  ECONOMIC_INDICATORS,
  FX_RATES,
  HOLIDAY_CALENDARS,
  YIELD_CURVES,
} from './reference';

const SEED_USERS: User[] = [
  {
    id: 'U-001',
    name: 'Adaeze Okonkwo',
    email: 'adaeze.okonkwo@ecobank.com',
    role: 'ADMIN',
    affiliateCode: 'GROUP',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-002',
    name: 'Chinwe Okafor',
    email: 'chinwe.okafor@ecobank.com',
    role: 'RISK_ANALYST',
    affiliateCode: 'NG',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-003',
    name: 'Aminata Traoré',
    email: 'aminata.traore@ecobank.com',
    role: 'TREASURY_USER',
    affiliateCode: 'CI',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-004',
    name: 'Yaw Boateng',
    email: 'yaw.boateng@ecobank.com',
    role: 'EXECUTIVE_VIEWER',
    affiliateCode: 'GROUP',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-005',
    name: 'Fatima Bello',
    email: 'fatima.bello@ecobank.com',
    role: 'CONTROL_TESTER',
    affiliateCode: 'NG',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-006',
    name: 'Samuel Owusu',
    email: 'samuel.owusu@ecobank.com',
    role: 'REPORTING_USER',
    affiliateCode: 'GH',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
];

const NIGERIA_BATCH: LoadBatch = {
  id: NIGERIA_BATCH_ID,
  affiliateCode: 'NG',
  domain: 'Positions',
  asOfDate: NIGERIA_AS_OF,
  version: 1,
  fileName: 'ecobank_nigeria_positions_2026-07.csv',
  fileHash: 'seed-nigeria-v1',
  rowCount: NIGERIA_POSITIONS.length,
  rowsAccepted: NIGERIA_POSITIONS.length,
  rowsRejected: 0,
  status: 'Committed',
  supersedesBatchId: null,
  supersededReason: null,
  uploadedBy: 'system-seed',
  uploadedAt: `${NIGERIA_AS_OF}T09:00:00Z`,
  committedBy: 'system-seed',
  committedAt: `${NIGERIA_AS_OF}T09:05:00Z`,
};

const GHANA_BATCH: LoadBatch = {
  id: GHANA_BATCH_ID,
  affiliateCode: 'GH',
  domain: 'Positions',
  asOfDate: GHANA_AS_OF,
  version: 1,
  fileName: 'ecobank_ghana_positions_2026-07.csv',
  fileHash: 'seed-ghana-v1',
  rowCount: GHANA_POSITIONS.length,
  rowsAccepted: GHANA_POSITIONS.length,
  rowsRejected: 0,
  status: 'Committed',
  supersedesBatchId: null,
  supersededReason: null,
  uploadedBy: 'system-seed',
  uploadedAt: `${GHANA_AS_OF}T09:00:00Z`,
  committedBy: 'system-seed',
  committedAt: `${GHANA_AS_OF}T09:05:00Z`,
};

const COTEIVOIRE_BATCH: LoadBatch = {
  id: COTEIVOIRE_BATCH_ID,
  affiliateCode: 'CI',
  domain: 'Positions',
  asOfDate: COTEIVOIRE_AS_OF,
  version: 1,
  fileName: 'ecobank_cotedivoire_positions_2026-07.csv',
  fileHash: 'seed-cotedivoire-v1',
  rowCount: COTEIVOIRE_POSITIONS.length,
  rowsAccepted: COTEIVOIRE_POSITIONS.length,
  rowsRejected: 0,
  status: 'Committed',
  supersedesBatchId: null,
  supersededReason: null,
  uploadedBy: 'system-seed',
  uploadedAt: `${COTEIVOIRE_AS_OF}T09:00:00Z`,
  committedBy: 'system-seed',
  committedAt: `${COTEIVOIRE_AS_OF}T09:05:00Z`,
};

async function writeSeed(repo: Repository): Promise<void> {
  for (const affiliate of AFFILIATES) await repo.upsertAffiliate(affiliate);
  await repo.upsertDimensionMembers(ALL_DIMENSION_MEMBERS);
  // All 33 affiliates' org units, legal entities and the counterparty register.
  await repo.upsertDimensionMembers(ALL_AFFILIATE_REFERENCE);
  for (const currency of CURRENCIES) await repo.upsertCurrency(currency);
  // Every affiliate's functional currency, so onboarding can select it.
  for (const currency of AFFILIATE_CURRENCIES) await repo.upsertCurrency(currency);
  for (const rate of FX_RATES) await repo.upsertFxRate(rate);
  for (const rate of AFFILIATE_FX_RATES) await repo.upsertFxRate(rate);
  for (const curve of YIELD_CURVES) await repo.upsertYieldCurve(curve);
  for (const indicator of ECONOMIC_INDICATORS) await repo.upsertEconomicIndicator(indicator);
  for (const calendar of HOLIDAY_CALENDARS) await repo.upsertHolidayCalendar(calendar);
  for (const user of SEED_USERS) await repo.upsertUser(user);
  for (const limit of SEED_LIMITS) await repo.upsertLimitConfig(limit);
  for (const connector of SEED_CONNECTORS) await repo.upsertConnector(connector);

  // Phase 9: Seed all three affiliates (Nigeria, Ghana, Côte d'Ivoire) with committed data
  await repo.upsertBatch(NIGERIA_BATCH);
  await repo.insertPositions(NIGERIA_POSITIONS);
  await repo.upsertBatch(GHANA_BATCH);
  await repo.insertPositions(GHANA_POSITIONS);
  await repo.upsertBatch(COTEIVOIRE_BATCH);
  await repo.insertPositions(COTEIVOIRE_POSITIONS);
}

const DIMENSION_TYPES = [
  'LegalEntity', 'OrgUnit', 'Product', 'GlAccount', 'CommonCoa', 'FinancialElement', 'Counterparty', 'Country',
] as const;

/**
 * Bring a database that was seeded by an earlier build up to date with
 * anything a later build added — a new affiliate's org units, its currency,
 * its FX rate, a limit the framework has grown since.
 *
 * `ensureSeeded` only runs the full first-time seed once: the very first
 * `existing.length > 0` check short-circuits it forever after, on this
 * browser, for this affiliate register. Thirty affiliates' worth of org
 * units, currencies and FX rates were added in a later change, and without
 * this, nobody who had already opened the app would ever receive them —
 * onboarding a new affiliate would still hit "functional currency not
 * found" or "unmapped org unit" against reference data that exists in the
 * codebase but never reached their database.
 *
 * Every write here is add-only: a record already present — including one a
 * user has since edited on the Limits, Connectors or Currency screens — is
 * left alone. Only what is genuinely missing is inserted.
 */
async function refreshReferenceData(repo: Repository): Promise<void> {
  const existingMemberIds = new Set(
    (await Promise.all(DIMENSION_TYPES.map((d) => repo.listDimensionMembers(d))))
      .flat()
      .map((m) => m.id),
  );
  const missingMembers = [...ALL_DIMENSION_MEMBERS, ...ALL_AFFILIATE_REFERENCE].filter(
    (m) => !existingMemberIds.has(m.id),
  );
  if (missingMembers.length > 0) await repo.upsertDimensionMembers(missingMembers);

  const existingCurrencyCodes = new Set((await repo.listCurrencies()).map((c) => c.code));
  for (const currency of [...CURRENCIES, ...AFFILIATE_CURRENCIES]) {
    if (!existingCurrencyCodes.has(currency.code)) await repo.upsertCurrency(currency);
  }

  const existingRateIds = new Set((await repo.listFxRates()).map((r) => r.id));
  for (const rate of [...FX_RATES, ...AFFILIATE_FX_RATES]) {
    if (!existingRateIds.has(rate.id)) await repo.upsertFxRate(rate);
  }

  const existingLimitIds = new Set((await repo.listLimitConfigs()).map((l) => l.id));
  for (const limit of SEED_LIMITS) {
    if (!existingLimitIds.has(limit.id)) await repo.upsertLimitConfig(limit);
  }

  const existingConnectorIds = new Set((await repo.listConnectors()).map((c) => c.id));
  for (const connector of SEED_CONNECTORS) {
    if (!existingConnectorIds.has(connector.id)) await repo.upsertConnector(connector);
  }

  // Added after Login started reading the real user register instead of its
  // own hardcoded list — a browser seeded before that change has an empty
  // Users table, so sign-in fails with "no active user" even though the
  // rest of the database is fine. Same add-only rule: a user already
  // created or edited here is left untouched.
  const existingUserIds = new Set((await repo.listUsers()).map((u) => u.id));
  for (const seedUser of SEED_USERS) {
    if (!existingUserIds.has(seedUser.id)) await repo.upsertUser(seedUser);
  }
}

/**
 * Seed only if the database is empty; otherwise top up reference data that a
 * later build added. Safe to call on every app start either way.
 */
export async function ensureSeeded(repo: Repository): Promise<boolean> {
  const existing = await repo.listAffiliates();
  if (existing.length === 0) {
    await writeSeed(repo);
    return true;
  }
  await refreshReferenceData(repo);
  return false;
}

/** Wipe and re-seed. The demo reset control. */
export async function reseed(repo: Repository): Promise<void> {
  await repo.reset();
  await writeSeed(repo);
}
