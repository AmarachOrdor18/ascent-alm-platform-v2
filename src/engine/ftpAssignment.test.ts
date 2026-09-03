/**
 * Transfer-pricing assignments and attribution.
 *
 * Phase 6 gave `computeFtp` a per-COA method/curve assignment and moved
 * org-unit attribution onto the line itself. These tests hold both, and
 * cover the two new run elements that surface them.
 */

import { describe, expect, it } from 'vitest';
import { computeFtp, type AdjustmentRule, type FtpAssignmentInput, type YieldCurve } from './ftp';
import { executeRun, draftRun } from './run';
import { defaultLadder } from './buckets';
import { DEFAULT_PATTERNS } from './behavioural';
import { identityFxTable } from './fx';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF, NIGERIA_BATCH_ID } from '@/data/seed/nigeria';
import type { DimensionMember, Position } from './types';

const NGN_INTERBANK: YieldCurve = {
  currency: 'NGN',
  indexCode: 'NGN-INTERBANK',
  points: [
    { tenorDays: 30, ratePercent: 12 },
    { tenorDays: 365, ratePercent: 15 },
    { tenorDays: 1825, ratePercent: 18 },
  ],
  asOfDate: NIGERIA_AS_OF,
};

/** A second curve, deliberately far from the first so a mis-pick is obvious. */
const NGN_TBILL: YieldCurve = {
  currency: 'NGN',
  indexCode: 'NGN-TBILL',
  points: [
    { tenorDays: 30, ratePercent: 4 },
    { tenorDays: 365, ratePercent: 5 },
    { tenorDays: 1825, ratePercent: 6 },
  ],
  asOfDate: NIGERIA_AS_OF,
};

function pricedPosition(overrides: Partial<Position> = {}): Position {
  const base = NIGERIA_POSITIONS.find((p) => p.category === 'Asset' && p.interestRatePct !== null)!;
  return { ...base, ...overrides };
}

describe('computeFtp - per-COA assignments', () => {
  it('uses the curve the assignment names, not the position rate index', () => {
    const position = pricedPosition({
      id: 'P-ASSIGN-1',
      commonCoaCode: 'COA-LOAN',
      rateIndexCode: 'NGN-INTERBANK',
      maturityDate: '2027-07-31',
      nextRepricingDate: null,
    });

    const assignments: FtpAssignmentInput[] = [
      { commonCoaCode: 'COA-LOAN', method: 'RedemptionCurve', curveCode: 'NGN-TBILL' },
    ];

    const assigned = computeFtp([position], [NGN_INTERBANK, NGN_TBILL], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
      assignments,
    });
    const unassigned = computeFtp([position], [NGN_INTERBANK, NGN_TBILL], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
    });

    // The T-bill curve sits ten points below interbank at every tenor, so the
    // two cannot be confused for one another.
    expect(assigned.lines[0]!.baseTransferRatePercent).toBeLessThan(
      unassigned.lines[0]!.baseTransferRatePercent!,
    );
    expect(assigned.lines[0]!.method).toBe('RedemptionCurve');
    expect(unassigned.lines[0]!.method).toBe('SpreadFromInterestRateCode');
  });

  it('leaves a position unpriced when its assignment names a curve that is absent', () => {
    const position = pricedPosition({ id: 'P-ASSIGN-2', commonCoaCode: 'COA-LOAN' });
    const result = computeFtp([position], [NGN_INTERBANK], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
      assignments: [{ commonCoaCode: 'COA-LOAN', method: 'MovingAverage', curveCode: 'NGN-MISSING' }],
    });

    // Falling back to whatever other curve happens to be loaded would price
    // the book off a rate nobody chose.
    expect(result.lines[0]!.baseTransferRatePercent).toBeNull();
    expect(result.lines[0]!.marginContribution).toBeNull();
    expect(result.unpriced).toBeGreaterThan(0);
  });

  it('applies different methods to different slices of the book', () => {
    const positions = [
      pricedPosition({ id: 'P-A', commonCoaCode: 'COA-LOAN' }),
      pricedPosition({ id: 'P-B', commonCoaCode: 'COA-BOND' }),
    ];
    const result = computeFtp(positions, [NGN_INTERBANK], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
      assignments: [{ commonCoaCode: 'COA-LOAN', method: 'MovingAverage', curveCode: null }],
    });

    expect(result.lines.find((l) => l.positionId === 'P-A')!.method).toBe('MovingAverage');
    expect(result.lines.find((l) => l.positionId === 'P-B')!.method).toBe('SpreadFromInterestRateCode');
  });
});

describe('computeFtp - org-unit attribution', () => {
  it('attributes margin to the unit on the line, not to an array position', () => {
    const positions = [
      pricedPosition({ id: 'P-1', orgUnitCode: 'OU-RETAIL' }),
      // A capital row sits between them. It is skipped, so any attribution
      // that matched `lines[i]` against a re-filtered `positions[i]` would
      // shift every later row onto the wrong desk.
      { ...NIGERIA_POSITIONS.find((p) => p.category === 'Capital')!, id: 'P-CAP', orgUnitCode: 'OU-TREASURY' },
      pricedPosition({ id: 'P-2', orgUnitCode: 'OU-CORPORATE' }),
    ];

    const result = computeFtp(positions, [NGN_INTERBANK], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
    });

    expect(result.lines.map((l) => l.positionId)).toEqual(['P-1', 'P-2']);
    expect(result.lines.find((l) => l.positionId === 'P-1')!.orgUnitCode).toBe('OU-RETAIL');
    expect(result.lines.find((l) => l.positionId === 'P-2')!.orgUnitCode).toBe('OU-CORPORATE');
    expect(result.byOrgUnit.map((u) => u.orgUnitCode).sort()).toEqual(['OU-CORPORATE', 'OU-RETAIL']);
    // The capital row contributed no margin, so its unit does not appear.
    expect(result.byOrgUnit.some((u) => u.orgUnitCode === 'OU-TREASURY')).toBe(false);
  });

  it('carries the common-COA code that selected the method', () => {
    const result = computeFtp([pricedPosition({ id: 'P-3', commonCoaCode: 'COA-LOAN' })], [NGN_INTERBANK], [], {
      asOfDate: NIGERIA_AS_OF,
      currentLcrPercent: null,
    });
    expect(result.lines[0]!.commonCoaCode).toBe('COA-LOAN');
  });
});

describe('run orchestrator - transfer pricing elements', () => {
  const inputs = {
    positions: NIGERIA_POSITIONS,
    fx: identityFxTable('NGN', NIGERIA_AS_OF),
    liquidityLadder: defaultLadder('LiquidityGap'),
    repricingLadder: defaultLadder('RepricingGap'),
    behaviourPatterns: DEFAULT_PATTERNS,
    orgUnitMembers: [] as DimensionMember[],
    productMembers: [] as DimensionMember[],
    tier1Capital: null,
    yieldCurves: [NGN_INTERBANK],
    adjustmentRules: [
      { id: 'A-1', type: 'LiquidityPremium', commonCoaCode: null, method: 'FixedRate', fixedBps: 25 },
      { id: 'A-2', type: 'BasisRiskCost', commonCoaCode: null, method: 'FixedRate', fixedBps: 10 },
    ] as AdjustmentRule[],
  };

  const base = draftRun({
    id: 'R-FTP',
    name: 'July close',
    asOfDate: NIGERIA_AS_OF,
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    timeBucketRuleId: 'TB-1',
    batchIds: [NIGERIA_BATCH_ID],
    createdBy: 'tester',
    createdAt: '2026-08-01T09:00:00Z',
  });

  it('produces a transfer-pricing result when the element is selected', () => {
    const outcome = executeRun({ ...base, elements: ['Lcr', 'TransferPricing'] }, inputs, '2026-08-01T09:01:00Z');
    const ftp = outcome.results.find((r) => r.element === 'TransferPricing');
    expect(ftp).toBeDefined();
    expect((ftp!.payload as { lines: unknown[] }).lines.length).toBeGreaterThan(0);
  });

  it('prices the adjustment stack off the LCR this same run computed', () => {
    const lcrDriven: AdjustmentRule[] = [
      {
        id: 'A-LCR',
        type: 'LiquidityPremium',
        commonCoaCode: null,
        method: 'LcrDriven',
        lcrThresholdPercent: 300,
        lcrMultiplier: 1,
        lcrCapBps: 500,
      },
    ];
    const outcome = executeRun(
      { ...base, elements: ['Lcr', 'TransferPricing'] },
      { ...inputs, adjustmentRules: lcrDriven },
      '2026-08-01T09:01:00Z',
    );
    const lcr = outcome.results.find((r) => r.element === 'Lcr')!.payload as { lcrPercent: number };
    const ftp = outcome.results.find((r) => r.element === 'TransferPricing')!.payload as {
      lines: Array<{ totalAdjustmentBps: number }>;
    };
    const priced = ftp.lines.find((l) => l.totalAdjustmentBps > 0)!;
    // threshold 300 less the run's own LCR, times a multiplier of one.
    expect(priced.totalAdjustmentBps).toBeCloseTo(300 - lcr.lcrPercent, 6);
  });

  it('summarises adjustments over affected positions only', () => {
    const outcome = executeRun(
      { ...base, elements: ['Lcr', 'TransferPricing', 'TpAdjustments'] },
      inputs,
      '2026-08-01T09:01:00Z',
    );
    const summary = outcome.results.find((r) => r.element === 'TpAdjustments')!.payload as {
      byType: Array<{ type: string; averageBps: number; positions: number }>;
    };

    const liquidity = summary.byType.find((t) => t.type === 'LiquidityPremium')!;
    expect(liquidity.averageBps).toBeCloseTo(25, 6);
    expect(summary.byType.find((t) => t.type === 'BasisRiskCost')!.averageBps).toBeCloseTo(10, 6);
    // Averaging over the whole book instead would dilute a 25bp rule down
    // toward zero as soon as anything was out of its scope.
    expect(liquidity.positions).toBeLessThanOrEqual(NIGERIA_POSITIONS.length);
    expect(liquidity.positions).toBeGreaterThan(0);
  });

  it('records an error rather than a figure when adjustments are asked for without transfer pricing', () => {
    const outcome = executeRun({ ...base, elements: ['TpAdjustments'] }, inputs, '2026-08-01T09:01:00Z');
    expect(outcome.results.find((r) => r.element === 'TpAdjustments')).toBeUndefined();
    expect(outcome.errors[0]!.code).toBe('TpAdjustments_FAILED');
  });

  it('reports everything unpriced when no curve is loaded, rather than zero margin', () => {
    const outcome = executeRun(
      { ...base, elements: ['Lcr', 'TransferPricing'] },
      { ...inputs, yieldCurves: [] },
      '2026-08-01T09:01:00Z',
    );
    const ftp = outcome.results.find((r) => r.element === 'TransferPricing')!.payload as {
      unpriced: number;
      totalMarginContribution: number;
    };
    expect(ftp.unpriced).toBeGreaterThan(0);
    expect(ftp.totalMarginContribution).toBe(0);
  });
});
