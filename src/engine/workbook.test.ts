/**
 * PHASE 1 ACCEPTANCE GATE.
 *
 * The Ecobank mock workbook (`ecobank_ALM/Ecobank_ALM_Mock_Dataset (1).xlsx`)
 * is the specification for the engine. Its formulas were read directly and
 * the seed data in `src/data/seed/nigeria.ts` is generated from its
 * positions sheet, so these assertions compare the engine against an
 * independently-computed source rather than against itself.
 *
 * If the engine disagrees with the workbook, the engine is wrong.
 */

import { describe, it, expect } from 'vitest';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF } from '@/data/seed/nigeria';
import { identityFxTable } from './fx';
import { computeLcr, computeNsfr, computeLoanToDeposit, computeConcentration, computeLiquidityGap } from './liquidity';
import { computeNiiSensitivity, computeEveSensitivity, computeEquity } from './irrbb';
import { computeSurvivalHorizon, severeOutflowProfile, computeCounterbalancingCapacity } from './stress';
import { defaultLadder } from './buckets';

const fx = identityFxTable('NGN', NIGERIA_AS_OF);
const ctx = { asOfDate: NIGERIA_AS_OF, reportingCurrency: 'NGN', fx };
const irrbbCtx = { ...ctx, tier1Capital: null };

/** Figures from the workbook's own computed cells. */
const WORKBOOK = {
  hqla: 539_500,
  grossOutflows: 436_000,
  grossInflows: 116_500,
  netCashOutflows: 319_500,
  lcrPercent: 168.857589984351,
  nsfrPercent: 103.631467869878,
  ldrPercent: 78.5714285714286,
  rateSensitiveAssets: 650_000,
  rateSensitiveLiabilities: 1_550_000,
  repricingGap: -900_000,
  interestIncome: 356_615,
  interestExpense: 133_370,
  baseNii: 223_245,
  deltaNii: -18_000,
  niiSensitivityPercent: -8.06289054626083,
  assetDuration: 1.48410526315789,
  liabilityDuration: 0.662828282828283,
  totalAssets: 2_280_000,
  totalLiabilities: 1_980_000,
  equity: 300_000,
  durationGap: 0.908491228070176,
  deltaEve: -41_427.2,
  eveSensitivityPercent: -13.8090666666667,
  survivalHorizonDays: 17,
};

describe('phase-1 gate - Liquidity Coverage Ratio', () => {
  const result = computeLcr(NIGERIA_POSITIONS, ctx);

  it('reproduces HQLA net of per-position haircuts', () => {
    expect(result.hqla).toBeCloseTo(WORKBOOK.hqla, 6);
  });

  it('applies the Level 2A haircut rather than counting Level 1 only', () => {
    // POS005, state government bonds: 70,000 at a 15% haircut = 59,500.
    expect(result.hqlaByLevel['Level 1']).toBeCloseTo(480_000, 6);
    expect(result.hqlaByLevel['Level 2A']).toBeCloseTo(59_500, 6);
  });

  it('reproduces gross outflows and inflows', () => {
    expect(result.grossOutflows).toBeCloseTo(WORKBOOK.grossOutflows, 6);
    expect(result.grossInflows).toBeCloseTo(WORKBOOK.grossInflows, 6);
  });

  it('caps inflows at 75% of outflows, per Basel', () => {
    expect(result.inflowCap).toBeCloseTo(0.75 * WORKBOOK.grossOutflows, 6);
    // Inflows sit below the cap here, so the cap does not bind.
    expect(result.eligibleInflows).toBeCloseTo(WORKBOOK.grossInflows, 6);
  });

  it('reproduces net cash outflows and the ratio', () => {
    expect(result.netCashOutflows).toBeCloseTo(WORKBOOK.netCashOutflows, 6);
    expect(result.lcrPercent).toBeCloseTo(WORKBOOK.lcrPercent, 6);
  });
});

describe('phase-1 gate - Net Stable Funding Ratio', () => {
  it('reproduces the ratio, with capital contributing to ASF', () => {
    const result = computeNsfr(NIGERIA_POSITIONS, ctx);
    expect(result.nsfrPercent).toBeCloseTo(WORKBOOK.nsfrPercent, 6);
  });
});

describe('phase-1 gate - Loan-to-Deposit Ratio', () => {
  it('reproduces the ratio', () => {
    const result = computeLoanToDeposit(NIGERIA_POSITIONS, ctx);
    expect(result.ratioPercent).toBeCloseTo(WORKBOOK.ldrPercent, 6);
  });
});

describe('phase-1 gate - NII sensitivity', () => {
  const result = computeNiiSensitivity(NIGERIA_POSITIONS, irrbbCtx, 200);

  it('reproduces the one-year repricing gap', () => {
    expect(result.rateSensitiveAssets).toBeCloseTo(WORKBOOK.rateSensitiveAssets, 6);
    expect(result.rateSensitiveLiabilities).toBeCloseTo(WORKBOOK.rateSensitiveLiabilities, 6);
    expect(result.repricingGap).toBeCloseTo(WORKBOOK.repricingGap, 6);
  });

  it('reproduces base net interest income', () => {
    expect(result.interestIncome).toBeCloseTo(WORKBOOK.interestIncome, 4);
    expect(result.interestExpense).toBeCloseTo(WORKBOOK.interestExpense, 4);
    expect(result.baseNii).toBeCloseTo(WORKBOOK.baseNii, 4);
  });

  it('reproduces the sensitivity to +200bp', () => {
    expect(result.deltaNii).toBeCloseTo(WORKBOOK.deltaNii, 6);
    expect(result.niiSensitivityPercent).toBeCloseTo(WORKBOOK.niiSensitivityPercent, 6);
  });
});

describe('phase-1 gate - EVE sensitivity', () => {
  const result = computeEveSensitivity(NIGERIA_POSITIONS, irrbbCtx, 200);

  it('uses real equity rather than a proxy', () => {
    expect(computeEquity(NIGERIA_POSITIONS, irrbbCtx)).toBeCloseTo(WORKBOOK.equity, 6);
    // v1 used 10% of total assets - 228,000 here - which is 24% adrift.
    expect(result.equity).not.toBeCloseTo(WORKBOOK.totalAssets * 0.1, 0);
  });

  it('reproduces balance-weighted durations', () => {
    expect(result.assetDuration).toBeCloseTo(WORKBOOK.assetDuration, 8);
    expect(result.liabilityDuration).toBeCloseTo(WORKBOOK.liabilityDuration, 8);
  });

  it('reproduces the duration gap', () => {
    expect(result.durationGap).toBeCloseTo(WORKBOOK.durationGap, 8);
  });

  it('reproduces ΔEVE and sensitivity as a share of equity', () => {
    expect(result.deltaEve).toBeCloseTo(WORKBOOK.deltaEve, 4);
    expect(result.eveSensitivityPercentOfEquity).toBeCloseTo(WORKBOOK.eveSensitivityPercent, 6);
  });

  it('reports the Basel outlier test against the capital basis actually used', () => {
    // No Tier 1 supplied, so the test falls back to balance-sheet equity and says so.
    expect(result.capitalBasis).toBe('Balance-sheet equity');
    expect(result.eveSensitivityPercentOfTier1).toBeNull();
    // |−13.81%| is inside the 15% threshold.
    expect(result.isBaselOutlier).toBe(false);
  });

  it('flags an outlier once real Tier 1 capital makes it one', () => {
    const thin = computeEveSensitivity(NIGERIA_POSITIONS, { ...irrbbCtx, tier1Capital: 250_000 }, 200);
    expect(thin.capitalBasis).toBe('Tier 1 capital');
    expect(thin.eveSensitivityPercentOfTier1).toBeCloseTo(-16.57088, 4);
    expect(thin.isBaselOutlier).toBe(true);
  });
});

describe('phase-1 gate - survival horizon', () => {
  const openingBuffer = computeLcr(NIGERIA_POSITIONS, ctx).hqla;
  const result = computeSurvivalHorizon(openingBuffer, severeOutflowProfile(750_000), ctx);

  it('opens with the HQLA buffer', () => {
    expect(result.openingBuffer).toBeCloseTo(WORKBOOK.hqla, 6);
  });

  it('reproduces the two-phase daily outflow', () => {
    expect(result.timeline[0]!.dailyOutflow).toBeCloseTo(41_250, 6);
    expect(result.timeline[10]!.dailyOutflow).toBeCloseTo(16_875, 6);
  });

  it('reproduces the 17-day survival horizon', () => {
    expect(result.survivalHorizonDays).toBe(WORKBOOK.survivalHorizonDays);
    expect(result.survivesFullHorizon).toBe(false);
  });

  it('exhausts on day 18, matching the workbook', () => {
    expect(result.timeline[16]!.remainingBuffer).toBeCloseTo(8_875, 6);
    expect(result.timeline[16]!.isExhausted).toBe(false);
    expect(result.timeline[17]!.remainingBuffer).toBeCloseTo(-8_000, 6);
    expect(result.timeline[17]!.isExhausted).toBe(true);
  });

  it('survives when the buffer covers the whole outflow', () => {
    const strong = computeSurvivalHorizon(1_000_000, severeOutflowProfile(750_000), ctx);
    expect(strong.survivesFullHorizon).toBe(true);
    expect(strong.survivalHorizonDays).toBe(30);
  });
});

describe('beyond the workbook - capabilities v1 lacked', () => {
  it('excludes a fully pledged asset from HQLA and reports the amount', () => {
    // POS004 is 150,000 of FGN bonds. Pledge the lot.
    const pledged = NIGERIA_POSITIONS.map((p) =>
      p.id === 'POS004' ? { ...p, lienAmount: p.amount, lienReason: 'Repo collateral' } : p,
    );
    const result = computeLcr(pledged, ctx);

    expect(result.excludedEncumbered).toBeCloseTo(150_000, 6);
    expect(result.hqla).toBeCloseTo(WORKBOOK.hqla - 150_000, 6);
    // v1 counted pledged bills in full, overstating the ratio here.
    expect(result.lcrPercent!).toBeLessThan(WORKBOOK.lcrPercent);
  });

  it('nets a PARTIAL lien rather than excluding the whole position', () => {
    // Real liens are partial: 60,000 pledged out of 150,000 leaves 90,000
    // eligible. A boolean flag has to choose between 0 and 150,000, and both
    // answers are wrong.
    const partial = NIGERIA_POSITIONS.map((p) =>
      p.id === 'POS004' ? { ...p, lienAmount: 60_000, lienReason: 'Partial repo pledge' } : p,
    );
    const result = computeLcr(partial, ctx);

    expect(result.excludedEncumbered).toBeCloseTo(60_000, 6);
    expect(result.hqla).toBeCloseTo(WORKBOOK.hqla - 60_000, 6);
  });

  it('excludes internal and suspense accounts from customer ratios', () => {
    // An internal suspense account holding loan-recovery entries is not a
    // customer loan, however its product is described. Counting it would
    // inflate loan-to-deposit.
    const suspense = {
      ...NIGERIA_POSITIONS.find((p) => p.id === 'POS011')!,
      id: 'INTERNAL-1',
      accountClass: 'Internal' as const,
      amount: 500_000,
    };
    const result = computeLoanToDeposit([...NIGERIA_POSITIONS, suspense], ctx);
    expect(result.ratioPercent).toBeCloseTo(WORKBOOK.ldrPercent, 6);
  });

  it('groups concentration by counterparty, not by affiliate', () => {
    const result = computeConcentration(NIGERIA_POSITIONS, ctx);
    expect(result.totalDeposits).toBeCloseTo(1_400_000, 6);
    expect(result.byCounterparty.length).toBeGreaterThan(1);
    expect(result.largestSharePercent).toBeGreaterThan(0);
    expect(result.topFiveSharePercent).toBeGreaterThanOrEqual(result.largestSharePercent!);
    expect(result.unattributedAmount).toBe(0);
  });

  it('computes counterbalancing capacity, which v1 had no concept of', () => {
    const capacity = computeCounterbalancingCapacity(NIGERIA_POSITIONS, ctx);
    expect(capacity.unencumberedHqla).toBeCloseTo(WORKBOOK.hqla, 6);
    expect(capacity.total).toBeGreaterThanOrEqual(capacity.unencumberedHqla);
  });

  it('buckets the liquidity gap from real dates and balances to zero overall', () => {
    const gap = computeLiquidityGap(NIGERIA_POSITIONS, ctx, defaultLadder('LiquidityGap'));
    const finalCumulative = gap.buckets[gap.buckets.length - 1]!.cumulativeGap;
    // Assets = Liabilities + Capital, so the cumulative gap closes at zero.
    expect(finalCumulative).toBeCloseTo(0, 6);
  });

  it('carries a methodology statement on every result', () => {
    expect(computeLcr(NIGERIA_POSITIONS, ctx).methodology).toContain('unencumbered');
    expect(computeNsfr(NIGERIA_POSITIONS, ctx).methodology).toContain('Capital contributes');
    expect(computeEveSensitivity(NIGERIA_POSITIONS, irrbbCtx, 200).methodology).toContain('convexity');
  });
});
