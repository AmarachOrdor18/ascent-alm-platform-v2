// Seeds the local database on first run; idempotent, so a page refresh never discards user data.

import type { Repository } from '@/store/repository';
import type { DataDomain, Role, User } from '@/engine/types';
import { ROLES } from '@/context/AuthContext';
import { SEED_CONNECTORS } from './connectors';
import { SEED_LIMITS } from './limits';
import { AFFILIATES, ALL_DIMENSION_MEMBERS, CURRENCIES } from './reference';
import { SEED_DEFAULT_RULES, SEED_FORECAST_SCENARIO_APPROVAL } from './defaultRules';
import { referenceLoadBatch } from '@/lib/referenceBatch';

/** The permission sets a fresh database starts with - editable afterward via Users & Roles. */
const SEED_ROLES: Role[] = Object.values(ROLES);

// SHA-256 of 'Ecobank@2026' - every seed/demo account shares this password (see src/lib/passwordHash.ts).
const SEED_PASSWORD_HASH = '9a3931b8a44194a83d4ca4ebb8275eb4f3566694e43f600f2befc3831fc4c05c';

// Every seed login is Group-scoped, since no affiliate ships pre-onboarded for one to be confined to -
// AFFILIATE_ADMIN is the exception: it's meaningless without a specific affiliate, so it isn't seeded at
// all until a real one exists to assign it to.
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
    affiliateCode: 'GROUP',
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
    affiliateCode: 'GROUP',
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
    affiliateCode: 'GROUP',
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
    affiliateCode: 'GROUP',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
  // Second Group Administrator - segregation of duties means the person who onboards an affiliate
  // (raises its Testing → Live activation) can never also be the one who approves it, even as Admin.
  // Without a second ADMIN, that request would have nobody left who could decide it.
  {
    id: 'U-007',
    name: 'David Adeyemi',
    email: 'david.adeyemi@ecobank.com',
    passwordHash: SEED_PASSWORD_HASH,
    role: 'ADMIN',
    affiliateCode: 'GROUP',
    isActive: true,
    mfaEnrolled: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
  },
];

// Country-specific org units, legal entities, counterparties, GL accounts and product catalogues
// (dimensions.ts, products.ts, affiliateReference.ts) are demo/engine-test fixtures, not written into a
// fresh platform's database - only the Group-owned members (the consolidation root, the Group chart of
// accounts, financial elements) ship, since there's no affiliate yet for the rest to belong to.
const GROUP_DIMENSION_MEMBERS = ALL_DIMENSION_MEMBERS.filter((m) => m.affiliateCode === 'GROUP');

// Currency *definitions* ship (so onboarding's functional-currency dropdown has something to pick from),
// but FX rates, yield curves, holiday calendars and economic indicator series do not - those are what an
// affiliate's own Treasury/Risk team sets up after onboarding, not pre-populated market data. USD carries
// no rate row of its own; buildFxTable() treats the reporting/pivot currency as an implicit 1:1 identity.
//
// CURRENCIES is deliberately the small, curated list - not affiliateReference.ts's AFFILIATE_CURRENCIES,
// which covers all ~30 countries in Ecobank's full footprint regardless of whether anyone has actually
// onboarded them. That's the same "full-footprint filler" the rest of this file avoids (see
// ALL_AFFILIATE_REFERENCE, never imported here). Onboarding a country whose currency isn't listed yet
// registers it from Reference Data - Currency & FX Rates' own "New currency" control, the same manual
// step Kenya's rate already demonstrates.
async function writeSeed(repo: Repository): Promise<void> {
  for (const affiliate of AFFILIATES) await repo.upsertAffiliate(affiliate);
  await repo.upsertDimensionMembers(GROUP_DIMENSION_MEMBERS);
  for (const currency of CURRENCIES) await repo.upsertCurrency(currency);
  for (const role of SEED_ROLES) await repo.upsertRole(role);
  for (const user of SEED_USERS) await repo.upsertUser(user);
  for (const limit of SEED_LIMITS) await repo.upsertLimitConfig(limit);
  for (const connector of SEED_CONNECTORS) await repo.upsertConnector(connector);
  for (const rule of SEED_DEFAULT_RULES) await repo.upsertRule(rule);
  // Without this, the seeded Forecast Scenario ships permanently stuck on "Pending approval" - no
  // request was ever raised for it (it wasn't saved through WhatIf.tsx's own submit-on-save flow), so
  // there is nothing in Approvals for anyone to actually decide. See its own comment in defaultRules.ts.
  await repo.upsertApprovalRequest(SEED_FORECAST_SCENARIO_APPROVAL);
}

const DIMENSION_TYPES = [
  'LegalEntity', 'OrgUnit', 'Product', 'GlAccount', 'CommonCoa', 'FinancialElement', 'Counterparty', 'Country',
] as const;

// Brings an existing database up to date with reference data a later build added. Add-only: a record
// already present - including one a user has since edited - is left alone; only what's missing is inserted.
async function refreshReferenceData(repo: Repository): Promise<void> {
  const existingMemberIds = new Set(
    (await Promise.all(DIMENSION_TYPES.map((d) => repo.listDimensionMembers(d))))
      .flat()
      .map((m) => m.id),
  );
  const missingMembers = GROUP_DIMENSION_MEMBERS.filter((m) => !existingMemberIds.has(m.id));
  if (missingMembers.length > 0) await repo.upsertDimensionMembers(missingMembers);

  const existingCurrencyCodes = new Set((await repo.listCurrencies()).map((c) => c.code));
  for (const currency of CURRENCIES) {
    if (!existingCurrencyCodes.has(currency.code)) await repo.upsertCurrency(currency);
  }

  const existingLimitIds = new Set((await repo.listLimitConfigs()).map((l) => l.id));
  for (const limit of SEED_LIMITS) {
    if (!existingLimitIds.has(limit.id)) await repo.upsertLimitConfig(limit);
  }

  const existingConnectorIds = new Set((await repo.listConnectors()).map((c) => c.id));
  for (const connector of SEED_CONNECTORS) {
    if (!existingConnectorIds.has(connector.id)) await repo.upsertConnector(connector);
  }

  // Also patches (never overwrites other fields on) an existing seed user missing passwordHash -
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

  // Existing databases have zero rows in Roles (it used to be a hardcoded object), so this is a
  // real top-up, not a defensive no-op - it's how a role like Affiliate Administrator reaches them.
  const existingRoleCodes = new Set((await repo.listRoles()).map((r) => r.code));
  for (const seedRole of SEED_ROLES) {
    if (!existingRoleCodes.has(seedRole.code)) await repo.upsertRole(seedRole);
  }

  const existingRuleIds = new Set((await repo.listRules({})).map((r) => r.id));
  for (const seedRule of SEED_DEFAULT_RULES) {
    if (!existingRuleIds.has(seedRule.id)) await repo.upsertRule(seedRule);
  }

  const existingApprovalIds = new Set((await repo.listApprovalRequests()).map((a) => a.id));
  if (!existingApprovalIds.has(SEED_FORECAST_SCENARIO_APPROVAL.id)) {
    await repo.upsertApprovalRequest(SEED_FORECAST_SCENARIO_APPROVAL);
  }

  await backfillReferenceLoadBatches(repo);
}

/**
 * Retroactively closes a gap discovered after FX rates, yield curves, economic indicators and
 * counterparties had already been saved directly into their own tables, before their screens were fixed
 * to also record a LoadBatch on every save (see FxRates.tsx, YieldCurves.tsx, EconomicIndicators.tsx,
 * Counterparties.tsx, DataLoadPanel.tsx's auto-create flow). Data Sources' freshness page only ever reads
 * LoadBatch rows (checkFreshness, engine/vintage.ts), so a database that already had real data in these
 * domains before that fix would otherwise read "Never loaded" forever, since fixing the save path only
 * covers what's saved from here on, not what's already on file. GL trial balances are never backfilled:
 * unlike the others, they're never persisted past the reconciliation session itself, so there is no
 * historical ledger data left anywhere to reconstruct a batch from - only a genuine re-upload starts that
 * domain's freshness tracking.
 */
async function backfillReferenceLoadBatches(repo: Repository): Promise<void> {
  const existingBatches = await repo.listBatches();
  const hasBatch = (domain: DataDomain, affiliateCode: string) =>
    existingBatches.some((b) => b.domain === domain && b.affiliateCode === affiliateCode && b.status === 'Committed');
  const today = new Date().toISOString().slice(0, 10);

  const fxRates = await repo.listFxRates();
  if (fxRates.length > 0 && !hasBatch('FxRates', 'GROUP')) {
    const latest = fxRates.reduce((max, r) => (r.asOfDate > max ? r.asOfDate : max), fxRates[0]!.asOfDate);
    await repo.upsertBatch(
      referenceLoadBatch({
        domain: 'FxRates',
        affiliateCode: 'GROUP',
        asOfDate: latest,
        label: 'Backfilled from existing rates',
        uploadedBy: 'system-backfill',
        rowCount: fxRates.length,
      }),
    );
  }

  const curves = await repo.listYieldCurves();
  if (curves.length > 0 && !hasBatch('MarketRates', 'GROUP')) {
    const latest = curves.reduce((max, c) => (c.asOfDate > max ? c.asOfDate : max), curves[0]!.asOfDate);
    await repo.upsertBatch(
      referenceLoadBatch({
        domain: 'MarketRates',
        affiliateCode: 'GROUP',
        asOfDate: latest,
        label: 'Backfilled from existing curves',
        uploadedBy: 'system-backfill',
        rowCount: curves.length,
      }),
    );
  }

  const indicators = await repo.listEconomicIndicators();
  if (indicators.length > 0 && !hasBatch('EconomicIndicators', 'GROUP')) {
    const allObs = indicators.flatMap((i) => i.observations);
    const latest = allObs.reduce((max, o) => (o.asOfDate > max ? o.asOfDate : max), allObs[0]?.asOfDate ?? today);
    await repo.upsertBatch(
      referenceLoadBatch({
        domain: 'EconomicIndicators',
        affiliateCode: 'GROUP',
        asOfDate: latest,
        label: 'Backfilled from existing series',
        uploadedBy: 'system-backfill',
        rowCount: indicators.length,
      }),
    );
  }

  // Counterparty registers carry no timestamp of their own on a member - "today" is the closest honest
  // stand-in for when a batch would have been recorded, not a reconstruction of the true original date.
  const affiliates = await repo.listAffiliates();
  for (const affiliate of affiliates) {
    if (hasBatch('Counterparties', affiliate.code)) continue;
    const counterparties = await repo.listDimensionMembers('Counterparty', affiliate.code);
    if (counterparties.length === 0) continue;
    await repo.upsertBatch(
      referenceLoadBatch({
        domain: 'Counterparties',
        affiliateCode: affiliate.code,
        asOfDate: today,
        label: 'Backfilled from existing register',
        uploadedBy: 'system-backfill',
        rowCount: counterparties.length,
      }),
    );
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
