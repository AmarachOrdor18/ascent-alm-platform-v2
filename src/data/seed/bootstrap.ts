/**
 * Seeds the local database on first run.
 *
 * Idempotent: it checks for an existing marker and does nothing if the
 * database already holds data, so a page refresh never discards work the
 * user has done. `reseed` is the explicit reset used by the demo control.
 */

import type { Repository } from '@/store/repository';
import type { LoadBatch, User } from '@/engine/types';
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
  for (const currency of CURRENCIES) await repo.upsertCurrency(currency);
  for (const rate of FX_RATES) await repo.upsertFxRate(rate);
  for (const curve of YIELD_CURVES) await repo.upsertYieldCurve(curve);
  for (const indicator of ECONOMIC_INDICATORS) await repo.upsertEconomicIndicator(indicator);
  for (const calendar of HOLIDAY_CALENDARS) await repo.upsertHolidayCalendar(calendar);
  for (const user of SEED_USERS) await repo.upsertUser(user);
  for (const limit of SEED_LIMITS) await repo.upsertLimitConfig(limit);

  // Phase 9: Seed all three affiliates (Nigeria, Ghana, Côte d'Ivoire) with committed data
  await repo.upsertBatch(NIGERIA_BATCH);
  await repo.insertPositions(NIGERIA_POSITIONS);
  await repo.upsertBatch(GHANA_BATCH);
  await repo.insertPositions(GHANA_POSITIONS);
  await repo.upsertBatch(COTEIVOIRE_BATCH);
  await repo.insertPositions(COTEIVOIRE_POSITIONS);
}

/** Seed only if the database is empty. Safe to call on every app start. */
export async function ensureSeeded(repo: Repository): Promise<boolean> {
  const existing = await repo.listAffiliates();
  if (existing.length > 0) return false;
  await writeSeed(repo);
  return true;
}

/** Wipe and re-seed. The demo reset control. */
export async function reseed(repo: Repository): Promise<void> {
  await repo.reset();
  await writeSeed(repo);
}
