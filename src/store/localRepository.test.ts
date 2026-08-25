import { describe, it, expect, beforeEach } from 'vitest';
import { AscentDb } from './db';
import { LocalRepository } from './localRepository';
import type { Affiliate, Position, ProcessRun, RuleMeta } from '@/engine/types';

let db: AscentDb;
let repo: LocalRepository;
let dbCounter = 0;

beforeEach(async () => {
  // A fresh database per test, so ordering never matters.
  db = new AscentDb(`ascent-test-${dbCounter++}`);
  await db.open();
  repo = new LocalRepository(db);
});

function affiliate(code: string, overrides: Partial<Affiliate> = {}): Affiliate {
  return {
    code,
    name: `Ecobank ${code}`,
    country: code,
    region: 'West Africa',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'USD',
    activeCurrencies: ['NGN', 'USD'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: `LE-${code}`,
    feeds: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function position(id: string, overrides: Partial<Position> = {}): Position {
  return {
    id,
    affiliateCode: 'NG',
    asOfDate: '2026-07-31',
    batchId: 'B-1',
    category: 'Asset',
    productCode: 'P-LOAN',
    productClass: 'Loans — Corporate',
    currency: 'NGN',
    amount: 1_000_000,
    legalEntityCode: 'LE-NG',
    orgUnitCode: 'OU-COR',
    glAccountCode: 'GL-1000',
    commonCoaCode: 'COA-LOAN',
    counterpartyId: null,
    originationDate: null,
    maturityDate: null,
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Conventional',
    paymentFrequencyMonths: 1,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'Fixed',
    interestRatePct: 24,
    rateIndexCode: null,
    spreadOverIndexBps: null,
    rateCapLifePct: null,
    rateFloorLifePct: null,
    behaviouralTag: 'N/A',
    hqlaLevel: 'None',
    hqlaHaircutPct: 0,
    lcrCashflowRole: 'None',
    lcrRatePct: null,
    asfFactorPct: null,
    rsfFactorPct: 85,
    irrbbRateSensitive: true,
    approxDurationYears: 1.9,
    performingStatus: 'Performing',
    daysPastDue: null,
    provisionAmount: null,
    isEncumbered: false,
    encumbranceReason: null,
    isOffBalanceSheet: false,
    obsType: null,
    notionalAmount: null,
    undrawnAmount: null,
    ccfPct: null,
    notes: null,
    ...overrides,
  };
}

function rule(id: string, overrides: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id,
    kind: 'TimeBucket',
    name: `Rule ${id}`,
    description: '',
    folder: 'Group Default',
    accessType: 'Read-Write',
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    ...overrides,
  };
}

function run(id: string, overrides: Partial<ProcessRun> = {}): ProcessRun {
  return {
    id,
    name: `Run ${id}`,
    processType: 'Static',
    asOfDate: '2026-07-31',
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    orgUnitCodes: null,
    productCodes: null,
    filterId: null,
    timeBucketRuleId: 'TB-1',
    productCharacteristicRuleId: null,
    behaviourPatternRuleId: null,
    forecastScenarioIds: [],
    newBusinessRuleId: null,
    transactionStrategyId: null,
    elements: ['Lcr'],
    positionBatchIds: ['B-1'],
    status: 'Completed',
    createdBy: 'test',
    createdAt: '2026-08-01T09:00:00Z',
    completedAt: '2026-08-01T09:01:00Z',
    errorLog: [],
    ...overrides,
  };
}

describe('position queries', () => {
  it('scopes by affiliate — the D-01 regression guard', async () => {
    await repo.insertPositions([
      position('NG-1', { affiliateCode: 'NG' }),
      position('GH-1', { affiliateCode: 'GH', currency: 'GHS' }),
      position('CI-1', { affiliateCode: 'CI', currency: 'XOF' }),
    ]);

    const ng = await repo.queryPositions({ affiliateCode: 'NG' });
    expect(ng).toHaveLength(1);
    expect(ng[0]!.id).toBe('NG-1');

    // Unscoped is still possible — but it is an explicit choice, not a default.
    expect(await repo.queryPositions({})).toHaveLength(3);
  });

  it('scopes by affiliate and as-of date together', async () => {
    await repo.insertPositions([
      position('P-JUL', { asOfDate: '2026-07-31' }),
      position('P-AUG', { asOfDate: '2026-08-31' }),
    ]);
    const july = await repo.queryPositions({ affiliateCode: 'NG', asOfDate: '2026-07-31' });
    expect(july.map((p) => p.id)).toEqual(['P-JUL']);
  });

  it('filters by batch, so a run reads the exact data version it pinned', async () => {
    await repo.insertPositions([position('V1', { batchId: 'B-1' }), position('V2', { batchId: 'B-2' })]);
    const pinned = await repo.queryPositions({ affiliateCode: 'NG', batchIds: ['B-1'] });
    expect(pinned.map((p) => p.id)).toEqual(['V1']);
  });

  it('filters by org unit and currency', async () => {
    await repo.insertPositions([
      position('RET', { orgUnitCode: 'OU-RET' }),
      position('COR', { orgUnitCode: 'OU-COR' }),
      position('USD', { currency: 'USD' }),
    ]);
    expect(await repo.queryPositions({ orgUnitCodes: ['OU-RET'] })).toHaveLength(1);
    expect(await repo.queryPositions({ currency: 'USD' })).toHaveLength(1);
  });
});

describe('dependency checking', () => {
  it('blocks deleting a rule a process run still references, and names the blocker', async () => {
    await repo.upsertRule(rule('TB-1'));
    await repo.upsertRun(run('R-1', { timeBucketRuleId: 'TB-1' }));

    const deps = await repo.checkDependencies('TB-1');
    expect(deps).toHaveLength(1);
    expect(deps[0]!.relation).toBe('used by process run');

    await expect(repo.deleteRule('TB-1')).rejects.toThrow(/still referenced by 1 rule/);
    expect(await repo.getRule('TB-1')).not.toBeNull();
  });

  it('detects a rule referenced by another rule', async () => {
    await repo.upsertRule(rule('TB-1'));
    await repo.upsertRule({ ...rule('SC-1', { kind: 'ForecastScenario' }), timeBucketRuleId: 'TB-1' } as RuleMeta);

    const deps = await repo.checkDependencies('TB-1');
    expect(deps.some((d) => d.relation === 'referenced by rule')).toBe(true);
  });

  it('allows deleting an unreferenced rule', async () => {
    await repo.upsertRule(rule('TB-ORPHAN'));
    expect(await repo.checkDependencies('TB-ORPHAN')).toEqual([]);
    await repo.deleteRule('TB-ORPHAN');
    expect(await repo.getRule('TB-ORPHAN')).toBeNull();
  });

  it('does not treat a rule as its own dependant', async () => {
    await repo.upsertRule({ ...rule('SELF'), someRuleId: 'SELF' } as RuleMeta);
    expect(await repo.checkDependencies('SELF')).toEqual([]);
  });
});

describe('rules', () => {
  it('filters by kind and active state', async () => {
    await repo.upsertRule(rule('A', { kind: 'TimeBucket', isActive: true }));
    await repo.upsertRule(rule('B', { kind: 'TimeBucket', isActive: false }));
    await repo.upsertRule(rule('C', { kind: 'BehaviourPattern', isActive: true }));

    expect(await repo.listRules({ kind: 'TimeBucket' })).toHaveLength(2);
    expect(await repo.listRules({ kind: 'TimeBucket', activeOnly: true })).toHaveLength(1);
  });

  it('separates Group defaults from affiliate-specific overrides', async () => {
    await repo.upsertRule(rule('GROUP', { affiliateCode: null }));
    await repo.upsertRule(rule('NG', { affiliateCode: 'NG' }));

    expect(await repo.listRules({ affiliateCode: null })).toHaveLength(1);
    expect(await repo.listRules({ affiliateCode: 'NG' })).toHaveLength(1);
  });
});

describe('affiliates and users', () => {
  it('round-trips an affiliate', async () => {
    await repo.upsertAffiliate(affiliate('NG'));
    const found = await repo.getAffiliate('NG');
    expect(found?.functionalCurrency).toBe('NGN');
    expect(await repo.getAffiliate('ZZ')).toBeNull();
  });

  it('looks users up case-insensitively by email', async () => {
    await repo.upsertUser({
      id: 'U-1',
      name: 'Chinwe Okafor',
      email: 'Chinwe.Okafor@ecobank.com',
      role: 'RISK_ANALYST',
      affiliateCode: 'NG',
      isActive: true,
      mfaEnrolled: true,
      createdAt: '2026-01-01T00:00:00Z',
      lastLoginAt: null,
    });
    expect(await repo.getUserByEmail('chinwe.okafor@ecobank.com')).not.toBeNull();
    expect(await repo.getUserByEmail('CHINWE.OKAFOR@ECOBANK.COM')).not.toBeNull();
  });
});

describe('reset', () => {
  it('clears every table atomically', async () => {
    await repo.upsertAffiliate(affiliate('NG'));
    await repo.insertPositions([position('P-1')]);
    await repo.upsertRule(rule('TB-1'));

    await repo.reset();

    expect(await repo.listAffiliates()).toEqual([]);
    expect(await repo.queryPositions({})).toEqual([]);
    expect(await repo.listRules({})).toEqual([]);
  });
});
