// Seeds the local database on first run; idempotent, so a page refresh never discards user data.

import type { Repository } from '@/store/repository';
import type { LoadBatch, Role, User } from '@/engine/types';
import { ROLES } from '@/context/AuthContext';
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
import { SEED_DEFAULT_RULES } from './defaultRules';

/** The permission sets a fresh database starts with — editable afterward via Users & Roles. */
const SEED_ROLES: Role[] = Object.values(ROLES);

// SHA-256 of 'Ecobank@2026' — every seed/demo account shares this password (see src/lib/passwordHash.ts).
const SEED_PASSWORD_HASH = '9a3931b8a44194a83d4ca4ebb8275eb4f3566694e43f600f2befc3831fc4c05c';

const SEED_USERS: User[] = [
  {
    id: 'U-001',
    name: 'Adaeze Okonkwo',
    email: 'adaeze.okonkwo@ecobank.com',
    passwordHash: SEED_PASSWORD_HASH,
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
    passwordHash: SEED_PASSWORD_HASH,
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
    passwordHash: SEED_PASSWORD_HASH,
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
    passwordHash: SEED_PASSWORD_HASH,
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
    passwordHash: SEED_PASSWORD_HASH,
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
    passwordHash: SEED_PASSWORD_HASH,
    role: 'REPORTING_USER',
    affiliateCode: 'GH',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-007',
    name: 'Ifeoma Nwachukwu',
    email: 'ifeoma.nwachukwu@ecobank.com',
    passwordHash: SEED_PASSWORD_HASH,
    role: 'AFFILIATE_ADMIN',
    affiliateCode: 'NG',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  {
    id: 'U-008',
    name: 'Tunde Adeyemi',
    email: 'tunde.adeyemi@ecobank.com',
    passwordHash: SEED_PASSWORD_HASH,
    role: 'TREASURY_USER',
    affiliateCode: 'NG',
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
  reconciledBy: null,
  reconciledAt: null,
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
  reconciledBy: null,
  reconciledAt: null,
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
  reconciledBy: null,
  reconciledAt: null,
};

// Zero-row LoadBatch records for domains (GeneralLedger, MarketRates, etc.) whose data lives in its own
// table rather than `positions` — without these, every affiliate would show "Never loaded" on those domains.
function referenceDomainBatch(
  affiliateCode: string,
  domain: LoadBatch['domain'],
  asOfDate: string,
  owner: string,
): LoadBatch {
  return {
    id: `B-${affiliateCode}-${domain}-SEED`,
    affiliateCode,
    domain,
    asOfDate,
    version: 1,
    fileName: `system — ${domain} reference feed`,
    fileHash: `seed-${affiliateCode}-${domain}`,
    rowCount: 0,
    rowsAccepted: 0,
    rowsRejected: 0,
    status: 'Committed',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: owner,
    uploadedAt: `${asOfDate}T06:00:00Z`,
    committedBy: owner,
    committedAt: `${asOfDate}T06:00:00Z`,
    reconciledBy: null,
    reconciledAt: null,
  };
}

const REFERENCE_DOMAIN_BATCHES: LoadBatch[] = [
  ['NG', NIGERIA_AS_OF],
  ['GH', GHANA_AS_OF],
  ['CI', COTEIVOIRE_AS_OF],
].flatMap(([code, asOf]) =>
  (['GeneralLedger', 'MarketRates', 'FxRates', 'Counterparties', 'EconomicIndicators'] as const).map((domain) =>
    referenceDomainBatch(code!, domain, asOf!, 'system-seed'),
  ),
);

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
  for (const role of SEED_ROLES) await repo.upsertRole(role);
  for (const user of SEED_USERS) await repo.upsertUser(user);
  for (const limit of SEED_LIMITS) await repo.upsertLimitConfig(limit);
  for (const connector of SEED_CONNECTORS) await repo.upsertConnector(connector);
  for (const rule of SEED_DEFAULT_RULES) await repo.upsertRule(rule);

  await repo.upsertBatch(NIGERIA_BATCH);
  await repo.insertPositions(NIGERIA_POSITIONS);
  await repo.upsertBatch(GHANA_BATCH);
  await repo.insertPositions(GHANA_POSITIONS);
  await repo.upsertBatch(COTEIVOIRE_BATCH);
  await repo.insertPositions(COTEIVOIRE_POSITIONS);

  for (const batch of REFERENCE_DOMAIN_BATCHES) await repo.upsertBatch(batch);
}

const DIMENSION_TYPES = [
  'LegalEntity', 'OrgUnit', 'Product', 'GlAccount', 'CommonCoa', 'FinancialElement', 'Counterparty', 'Country',
] as const;

// Brings an existing database up to date with reference data a later build added. Add-only: a record
// already present — including one a user has since edited — is left alone; only what's missing is inserted.
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

  // Also patches (never overwrites other fields on) an existing seed user missing passwordHash —
  // added after some databases were already seeded, so a plain "insert if missing" top-up would
  // leave those accounts permanently unable to log in.
  const existingUserById = new Map((await repo.listUsers()).map((u) => [u.id, u]));
  for (const seedUser of SEED_USERS) {
    const existing = existingUserById.get(seedUser.id);
    if (!existing) {
      await repo.upsertUser(seedUser);
    } else if (!existing.passwordHash) {
      await repo.upsertUser({ ...existing, passwordHash: seedUser.passwordHash });
    }
  }

  const existingBatchIds = new Set((await repo.listBatches()).map((b) => b.id));
  for (const batch of REFERENCE_DOMAIN_BATCHES) {
    if (!existingBatchIds.has(batch.id)) await repo.upsertBatch(batch);
  }

  // Existing databases have zero rows in Roles (it used to be a hardcoded object), so this is a
  // real top-up, not a defensive no-op — it's how a role like Affiliate Administrator reaches them.
  const existingRoleCodes = new Set((await repo.listRoles()).map((r) => r.code));
  for (const seedRole of SEED_ROLES) {
    if (!existingRoleCodes.has(seedRole.code)) await repo.upsertRole(seedRole);
  }

  const existingRuleIds = new Set((await repo.listRules({})).map((r) => r.id));
  for (const seedRule of SEED_DEFAULT_RULES) {
    if (!existingRuleIds.has(seedRule.id)) await repo.upsertRule(seedRule);
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
