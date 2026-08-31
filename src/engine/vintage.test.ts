import { describe, it, expect } from 'vitest';
import {
  ALL_CONTRIBUTORS,
  currentBatch,
  currentPositionBatches,
  contributionReadiness,
  positionBookReadiness,
  planSupersede,
} from './vintage';
import { executeRun, draftRun, ALL_ELEMENTS } from './run';
import { buildFxTable } from './fx';
import { defaultLadder } from './buckets';
import { DEFAULT_PATTERNS } from './behavioural';
import type { Affiliate, LoadBatch, Position, PositionContributor } from './types';

// A bank doesn't hand over one ready-made position file — Loans, Deposits
// and Treasury each submit their own slice for the same affiliate/date, and
// the Position Book is whatever combination of those has been committed.
// This file proves two things: (1) the contribution model actually keeps
// departments' submissions independent (one department reloading doesn't
// touch another's), and (2) the specific bug this model was built to fix —
// a run used to pin exactly one batch per affiliate/date, so if two
// departments uploaded separately, only the second uploader's positions
// would silently feed every LCR/NSFR/IRRBB calculation. `currentPositionBatches`
// is what a run must use instead.

function affiliate(overrides: Partial<Affiliate> = {}): Affiliate {
  return {
    code: 'NG',
    name: 'Ecobank Nigeria',
    country: 'NG',
    region: 'West Africa',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'USD',
    activeCurrencies: ['NGN'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-NG',
    feeds: [],
    inheritGroupRules: true,
    internalThresholds: {},
    limitsConfirmed: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function batch(overrides: Partial<LoadBatch> = {}): LoadBatch {
  return {
    id: 'B-1',
    affiliateCode: 'NG',
    domain: 'Positions',
    contributor: null,
    asOfDate: '2026-07-31',
    version: 1,
    fileName: 'f.csv',
    fileHash: 'h',
    rowCount: 10,
    rowsAccepted: 10,
    rowsRejected: 0,
    status: 'Committed',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: 'tester',
    uploadedAt: '2026-07-31T09:00:00Z',
    committedBy: 'tester',
    committedAt: '2026-07-31T09:05:00Z',
    reconciledBy: null,
    reconciledAt: null,
    ...overrides,
  };
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'P-1',
    affiliateCode: 'NG',
    asOfDate: '2026-07-31',
    batchId: 'B-1',
    accountNumber: '20220100001',
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: 'HQ001',
    category: 'Asset',
    productCode: 'P-BOND',
    productClass: 'Government Bonds',
    currency: 'NGN',
    amount: 1_000_000_000,
    legalEntityCode: 'LE-NG',
    orgUnitCode: 'OU-TRY',
    glAccountCode: 'GL-1000',
    commonCoaCode: 'COA-BOND',
    counterpartyId: null,
    originationDate: null,
    maturityDate: '2027-01-01',
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: null,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'Fixed',
    interestRatePct: 12,
    rateIndexCode: null,
    spreadOverIndexBps: null,
    rateCapLifePct: null,
    rateFloorLifePct: null,
    behaviouralTag: 'N/A',
    hqlaLevel: 'Level 1',
    hqlaHaircutPct: 0,
    lcrCashflowRole: 'HQLA',
    lcrRatePct: null,
    asfFactorPct: 100,
    rsfFactorPct: 5,
    irrbbRateSensitive: true,
    approxDurationYears: 1,
    performingStatus: 'Performing',
    daysPastDue: null,
    provisionAmount: null,
    lienAmount: 0,
    lienReason: null,
    isOffBalanceSheet: false,
    obsType: null,
    notionalAmount: null,
    undrawnAmount: null,
    ccfPct: null,
    turnover: null,
    overdraft: null,
    control: { maker: 'TEST', checker: 'SYSTEM', status: 'ACTIVE', createdAt: '2026-07-31T09:00:00Z', updatedAt: '2026-07-31T09:00:00Z' },
    notes: null,
    ...overrides,
  };
}

describe('multi-department Position Book contribution', () => {
  it('keeps departments independent: reloading one contributor supersedes only that contributor', () => {
    const loans = batch({ id: 'B-LOANS-1', contributor: 'Loans' });
    const deposits = batch({ id: 'B-DEPOSITS-1', contributor: 'Deposits' });
    const batches = [loans, deposits];

    // Loans re-uploads (a new version) — planning the supersede for Loans must not touch Deposits.
    const plan = planSupersede(batches, 'NG', 'Positions', '2026-07-31', 'Loans');
    expect(plan.superseded?.id).toBe('B-LOANS-1');
    expect(plan.nextVersion).toBe(2);

    // Deposits' own plan is completely unaffected.
    const depositsPlan = planSupersede(batches, 'NG', 'Positions', '2026-07-31', 'Deposits');
    expect(depositsPlan.superseded?.id).toBe('B-DEPOSITS-1');

    // currentBatch scoped to Loans never returns Deposits' batch, and vice versa.
    expect(currentBatch(batches, 'NG', 'Positions', '2026-07-31', 'Loans')?.id).toBe('B-LOANS-1');
    expect(currentBatch(batches, 'NG', 'Positions', '2026-07-31', 'Deposits')?.id).toBe('B-DEPOSITS-1');
    expect(currentBatch(batches, 'NG', 'Positions', '2026-07-31', 'Treasury')).toBeNull();
  });

  it('the bug this model fixes: a run must pin every current contributor batch, not the single latest one', () => {
    const loans = batch({ id: 'B-LOANS-1', contributor: 'Loans', uploadedAt: '2026-07-31T08:00:00Z' });
    // Treasury uploads after Loans — under the old "one batch per affiliate/domain/date" model, this would
    // have been treated as the sole "current" batch, silently excluding Loans from every calculation.
    const treasury = batch({ id: 'B-TREASURY-1', contributor: 'Treasury', uploadedAt: '2026-07-31T10:00:00Z' });
    const batches = [loans, treasury];

    const combined = currentPositionBatches(batches, 'NG', '2026-07-31');
    const ids = combined.map((b) => b.id).sort();
    expect(ids).toEqual(['B-LOANS-1', 'B-TREASURY-1']);

    // Deposits never submitted — the combined set is exactly what was actually committed, no more.
    expect(combined.find((b) => b.contributor === 'Deposits')).toBeUndefined();
  });

  it('a new department version supersedes only its own predecessor within the combined set', () => {
    const loansV1 = batch({ id: 'B-LOANS-1', contributor: 'Loans', version: 1 });
    const treasuryV1 = batch({ id: 'B-TREASURY-1', contributor: 'Treasury', version: 1 });
    const loansV2 = batch({
      id: 'B-LOANS-2',
      contributor: 'Loans',
      version: 2,
      supersedesBatchId: 'B-LOANS-1',
    });
    // The superseded version stays in the array (never deleted) but must not appear as "current".
    const supersededLoansV1 = { ...loansV1, status: 'Superseded' as const };
    const batches = [supersededLoansV1, treasuryV1, loansV2];

    const combined = currentPositionBatches(batches, 'NG', '2026-07-31');
    expect(combined.map((b) => b.id).sort()).toEqual(['B-LOANS-2', 'B-TREASURY-1']);
  });

  it('legacy pre-department batches (contributor: null) still feed the book, without impersonating a named department', () => {
    const legacy = batch({ id: 'B-LEGACY-1', contributor: null });
    const batches = [legacy];

    const combined = currentPositionBatches(batches, 'NG', '2026-07-31');
    expect(combined.map((b) => b.id)).toEqual(['B-LEGACY-1']);

    const readiness = positionBookReadiness(affiliate(), batches, '2026-07-31');
    expect(readiness.legacyBatch?.id).toBe('B-LEGACY-1');
    // A legacy load doesn't count toward any specific department's completeness.
    expect(readiness.contributors.every((c) => !c.submitted)).toBe(true);
    expect(readiness.isComplete).toBe(false);
  });

  it('contributionReadiness reports per-department status against an affiliate’s required contributors', () => {
    const loans = batch({ id: 'B-LOANS-1', contributor: 'Loans' });
    const batches = [loans];

    const full = contributionReadiness(affiliate(), batches, '2026-07-31');
    expect(full).toHaveLength(ALL_CONTRIBUTORS.length);
    expect(full.find((c) => c.contributor === 'Loans')?.submitted).toBe(true);
    expect(full.find((c) => c.contributor === 'Deposits')?.submitted).toBe(false);

    // An affiliate that only requires a subset (e.g. a branch with no treasury book of its own).
    const restricted = contributionReadiness(
      affiliate({ requiredContributors: ['Loans', 'Deposits'] as PositionContributor[] }),
      batches,
      '2026-07-31',
    );
    expect(restricted).toHaveLength(2);
    expect(restricted.every((c) => c.contributor !== 'Treasury')).toBe(true);

    expect(positionBookReadiness(affiliate(), batches, '2026-07-31').isComplete).toBe(false);
    const allThree = batches.concat([
      batch({ id: 'B-DEPOSITS-1', contributor: 'Deposits' }),
      batch({ id: 'B-TREASURY-1', contributor: 'Treasury' }),
    ]);
    expect(positionBookReadiness(affiliate(), allThree, '2026-07-31').isComplete).toBe(true);
  });

  it('end-to-end: a run pinned to every current contributor batch actually consumes both departments’ positions', () => {
    const loansBatch = batch({ id: 'B-LOANS-1', contributor: 'Loans' });
    const treasuryBatch = batch({ id: 'B-TREASURY-1', contributor: 'Treasury' });
    const batches = [loansBatch, treasuryBatch];

    // Loans contributes a large HQLA asset; Treasury contributes the funding liability that gives it a real
    // net cash outflow to be measured against. Neither department's file balances alone — only together do
    // they represent the bank's book, which is exactly the point of this model.
    const loansPosition = position({ id: 'P-LOANS-1', batchId: 'B-LOANS-1', amount: 1_000_000_000 });
    const treasuryPosition = position({
      id: 'P-TREASURY-1',
      batchId: 'B-TREASURY-1',
      category: 'Liability',
      productClass: 'Wholesale Funding',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 25,
      asfFactorPct: 50,
      rsfFactorPct: null,
      amount: 600_000_000,
    });
    const allPositions = [loansPosition, treasuryPosition];

    const positionBatches = currentPositionBatches(batches, 'NG', '2026-07-31');
    const run = draftRun({
      id: 'RUN-1',
      name: 'Combined book run',
      asOfDate: '2026-07-31',
      affiliateCode: 'NG',
      reportingCurrency: 'NGN',
      timeBucketRuleId: '',
      batchIds: positionBatches.map((b) => b.id),
      createdBy: 'test',
      createdAt: '2026-07-31T00:00:00Z',
      elements: ALL_ELEMENTS,
    });

    const outcome = executeRun(
      run,
      {
        positions: allPositions,
        fx: buildFxTable('USD', [], '2026-07-31'),
        liquidityLadder: defaultLadder('LiquidityGap'),
        repricingLadder: defaultLadder('RepricingGap'),
        behaviourPatterns: DEFAULT_PATTERNS,
        orgUnitMembers: [],
        productMembers: [],
        tier1Capital: 400_000_000,
      },
      '2026-07-31T00:00:00Z',
    );

    expect(outcome.run.status).toBe('Completed');
    const lcr = outcome.results.find((r) => r.element === 'Lcr')?.payload as {
      lcrPercent: number | null;
      hqla: number;
      grossOutflows: number;
    };
    // Both sides of the ratio are non-zero only because both departments' positions were actually consumed —
    // under the old single-batch model, whichever department uploaded second would have been the only one here.
    expect(lcr.hqla).toBeGreaterThan(0);
    expect(lcr.grossOutflows).toBeGreaterThan(0);
    expect(lcr.lcrPercent).not.toBeNull();
  });
});
