/**
 * D-06 — repricing must not be conflated with maturity.
 *
 * The Nigeria seed is generated from the Ecobank mock workbook, and that
 * workbook states its own simplification plainly: "Repricing bucket is
 * assumed equal to contractual maturity bucket." The seed therefore cannot
 * demonstrate this defect being closed — it inherits the assumption, and the
 * phase-1 gate depends on it.
 *
 * These tests use purpose-built fixtures instead, so the mechanism is proven
 * rather than asserted. Without them, D-06 would be "the fields exist"
 * rather than "the distinction changes the answer".
 */

import { describe, it, expect } from 'vitest';
import type { Position } from './types';
import { identityFxTable } from './fx';
import { defaultLadder } from './buckets';
import { computeRepricingGap, computeNiiSensitivity } from './irrbb';
import { computeLiquidityGap } from './liquidity';
import { addMonths } from './dates';

const AS_OF = '2026-07-31';
const fx = identityFxTable('NGN', AS_OF);
const ctx = { asOfDate: AS_OF, reportingCurrency: 'NGN', fx, tier1Capital: null };
const liquidityCtx = { asOfDate: AS_OF, reportingCurrency: 'NGN', fx };

function loan(over: Partial<Position>): Position {
  return {
    id: 'L-1',
    affiliateCode: 'NG',
    asOfDate: AS_OF,
    batchId: 'B-1',
    category: 'Asset',
    productCode: 'P-LOAN',
    productClass: 'Loans — Corporate, Floating',
    currency: 'NGN',
    amount: 365_000,
    legalEntityCode: 'LE-NG',
    orgUnitCode: 'OU-NG-COR',
    glAccountCode: 'GL-NG-1000',
    commonCoaCode: 'COA-ASSET',
    counterpartyId: 'CP-1',
    originationDate: '2025-07-31',
    // A three-year loan…
    maturityDate: '2029-07-31',
    // …that resets quarterly. These are different dates and must stay different.
    nextRepricingDate: addMonths(AS_OF, 3),
    lastRepricingDate: addMonths(AS_OF, -1),
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: 3,
    repricingFrequencyMonths: 3,
    accrualBasis: 'Actual/365',
    rateType: 'Floating',
    interestRatePct: 25,
    rateIndexCode: 'NGN-NIBOR',
    spreadOverIndexBps: 250,
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
    approxDurationYears: 0.25,
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
    ...over,
  };
}

const ladder = defaultLadder('RepricingGap');

describe('D-06 — a floating loan reprices long before it matures', () => {
  const floating = loan({});

  it('buckets on the repricing date, not the maturity date', () => {
    const repricing = computeRepricingGap([floating], ctx, ladder);
    // 31 Jul + 3 months is 31 Oct — 92 days, so just past the 90-day 1-3M
    // boundary and into 3-6M. The point is that it is a near bucket at all.
    const nearBucket = repricing.buckets.find((b) => b.bucket === '3-6M')!;
    const maturityBucket = repricing.buckets.find((b) => b.bucket === '3-5Y')!;

    expect(nearBucket.assets).toBe(365_000);
    expect(maturityBucket.assets).toBe(0);
  });

  it('buckets the same position on maturity for the liquidity gap', () => {
    const liquidity = computeLiquidityGap([floating], liquidityCtx, defaultLadder('LiquidityGap'));
    const long = liquidity.buckets.find((b) => b.bucket === '3-5Y')!;
    const near = liquidity.buckets.find((b) => b.bucket === '3-6M')!;

    // The cash does not come back for three years — that is a different question.
    expect(long.assets).toBe(365_000);
    expect(near.assets).toBe(0);
  });

  it('produces genuinely different allocations for the two ladders', () => {
    const bucketOf = (buckets: Array<{ bucket: string; assets: number }>) =>
      buckets.find((b) => b.assets > 0)?.bucket ?? null;

    const repricingBucket = bucketOf(computeRepricingGap([floating], ctx, ladder).buckets);
    const liquidityBucket = bucketOf(
      computeLiquidityGap([floating], liquidityCtx, defaultLadder('LiquidityGap')).buckets,
    );

    // This is the assertion that would have failed under v1, where both
    // ladders read the same field: one position, two ladders, two answers.
    expect(repricingBucket).toBe('3-6M');
    expect(liquidityBucket).toBe('3-5Y');
    expect(repricingBucket).not.toBe(liquidityBucket);
  });
});

describe('D-06 — the distinction changes NII sensitivity materially', () => {
  it('counts a quarterly-repricing loan as rate-sensitive within one year', () => {
    const floating = loan({});
    const result = computeNiiSensitivity([floating], ctx, 200);
    expect(result.rateSensitiveAssets).toBe(365_000);
    expect(result.deltaNii).toBeCloseTo(365_000 * 0.02, 6);
  });

  it('excludes the same balance once repricing is conflated with maturity', () => {
    // The v1 behaviour: no separate repricing date, so the loan looks like
    // it reprices in three years and drops out of the one-year horizon.
    const conflated = loan({ nextRepricingDate: null });
    const result = computeNiiSensitivity([conflated], ctx, 200);
    expect(result.rateSensitiveAssets).toBe(0);
    expect(result.deltaNii).toBe(0);
  });

  it('understates exposure by the full balance when conflated — the D-06 impact', () => {
    const correct = computeNiiSensitivity([loan({})], ctx, 200);
    const conflated = computeNiiSensitivity([loan({ nextRepricingDate: null })], ctx, 200);
    expect(correct.deltaNii - conflated.deltaNii).toBeCloseTo(7_300, 6);
  });
});

describe('D-06 — administered-rate liabilities reprice faster than they mature', () => {
  it('places a non-maturity deposit in the short repricing bucket', () => {
    // A current account has no contractual maturity but reprices at will —
    // the case the workbook names explicitly as needing separate modelling.
    const currentAccount = loan({
      id: 'D-1',
      category: 'Liability',
      productClass: 'Retail Deposits — Core',
      behaviouralTag: 'Core',
      amount: 560_000,
      maturityDate: null,
      nextRepricingDate: '2026-08-01',
      rateType: 'Floating',
      interestRatePct: 2.5,
      rsfFactorPct: null,
      asfFactorPct: 95,
      approxDurationYears: 0,
    });

    const repricing = computeRepricingGap([currentAccount], ctx, ladder);
    expect(repricing.buckets.find((b) => b.bucket === '0-30D')!.liabilities).toBe(560_000);

    // On the liquidity ladder it has no maturity date at all, so it is
    // reported as Undated rather than silently dropped into a bucket.
    const liquidity = computeLiquidityGap([currentAccount], liquidityCtx, defaultLadder('LiquidityGap'));
    expect(liquidity.buckets.every((b) => b.liabilities === 0)).toBe(true);
  });

  it('flips the sign of the one-year gap when liabilities reprice faster than assets', () => {
    const asset = loan({ id: 'A-1', amount: 100_000, nextRepricingDate: '2029-01-31', maturityDate: '2029-07-31' });
    const liability = loan({
      id: 'L-2',
      category: 'Liability',
      amount: 100_000,
      nextRepricingDate: '2026-08-15',
      maturityDate: '2029-07-31',
      asfFactorPct: 50,
      rsfFactorPct: null,
    });

    const result = computeNiiSensitivity([asset, liability], ctx, 200);
    // Same balances, same maturity — only the repricing dates differ, and
    // that alone makes the bank liability-sensitive.
    expect(result.rateSensitiveAssets).toBe(0);
    expect(result.rateSensitiveLiabilities).toBe(100_000);
    expect(result.repricingGap).toBe(-100_000);
    expect(result.deltaNii).toBeLessThan(0);
  });
});

describe('D-06 — fixed-rate instruments still fall back to maturity', () => {
  it('treats a fixed-rate bond as repricing only when it matures', () => {
    const bond = loan({
      id: 'B-1',
      productClass: 'FGN Bonds (3-5Y)',
      rateType: 'Fixed',
      nextRepricingDate: null,
      repricingFrequencyMonths: null,
      maturityDate: '2030-07-31',
    });
    const repricing = computeRepricingGap([bond], ctx, ladder);
    expect(repricing.buckets.find((b) => b.bucket === '3-5Y')!.assets).toBe(365_000);
    expect(computeNiiSensitivity([bond], ctx, 200).rateSensitiveAssets).toBe(0);
  });
});
