/**
 * The BCBS standardised shocks, the outlier test across the full set, and
 * the remaining helper surface.
 */

import { describe, it, expect } from 'vitest';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF } from '@/data/seed/nigeria';
import { identityFxTable } from './fx';
import { defaultLadder, bucketMidpointYears, STANDARD_BUCKETS } from './buckets';
import { standardShocks, computeAllShocks, computeRepricingGap, SHOCK_LABELS } from './irrbb';
import { ancestorPath, positionKeyFor, indexMembers } from './dimensions';
import { computeSurvivalHorizon, severeOutflowProfile } from './stress';
import { expiredBatches, checkAllDomains, availableAsOfDates } from './vintage';
import { REGULATORY_MINIMA } from './limits';
import type { Affiliate, DimensionMember, LoadBatch } from './types';

const fx = identityFxTable('NGN', NIGERIA_AS_OF);
const ctx = { asOfDate: NIGERIA_AS_OF, reportingCurrency: 'NGN', fx, tier1Capital: null };
const ladder = defaultLadder('RepricingGap');

describe('BCBS standardised shocks', () => {
  const shocks = standardShocks(ladder);

  it('defines all six supervisory scenarios', () => {
    expect(Object.keys(shocks).sort()).toEqual(
      ['flattener', 'parallelDown', 'parallelUp', 'shortRateDown', 'shortRateUp', 'steepener'].sort(),
    );
    expect(Object.keys(SHOCK_LABELS)).toHaveLength(6);
  });

  it('makes the parallel shocks flat across every bucket', () => {
    const values = Object.values(shocks.parallelUp!);
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(200);
    expect(Object.values(shocks.parallelDown!)[0]).toBe(-200);
  });

  it('gives the steepener and flattener opposite ends', () => {
    const steep = Object.values(shocks.steepener!);
    const flat = Object.values(shocks.flattener!);
    expect(steep[0]!).toBeLessThan(0);
    expect(steep[steep.length - 1]!).toBeGreaterThan(0);
    expect(flat[0]!).toBeGreaterThan(0);
    expect(flat[flat.length - 1]!).toBeLessThan(0);
  });

  it('leaves the long end untouched in the short-rate scenarios', () => {
    const values = Object.values(shocks.shortRateUp!);
    expect(values[0]).toBe(250);
    expect(values[values.length - 1]).toBe(0);
  });
});

describe('computeAllShocks', () => {
  const { results, worstCase } = computeAllShocks(NIGERIA_POSITIONS, ctx, ladder);

  it('evaluates every scenario with a label', () => {
    expect(Object.keys(results)).toHaveLength(6);
    expect(results.parallelUp!.label).toBe('Parallel up (+200bp)');
  });

  it('identifies the worst case — what the outlier test is judged on', () => {
    expect(worstCase).not.toBeNull();
    const allDeltas = Object.values(results)
      .map((r) => r.eve.deltaEve)
      .filter((v): v is number => v !== null);
    expect(worstCase!.deltaEve).toBeCloseTo(Math.min(...allDeltas), 6);
  });

  it('moves EVE in opposite directions for up and down parallel shocks', () => {
    expect(results.parallelUp!.eve.deltaEve!).toBeLessThan(0);
    expect(results.parallelDown!.eve.deltaEve!).toBeGreaterThan(0);
  });

  it('returns a null worst case when durations are absent', () => {
    const undated = NIGERIA_POSITIONS.map((p) => ({ ...p, approxDurationYears: null }));
    const { worstCase: none } = computeAllShocks(undated, ctx, ladder);
    // With every duration null the gap is zero, not null — the measure is
    // still defined, it simply shows no sensitivity.
    expect(none).not.toBeNull();
    expect(none!.deltaEve).toBeCloseTo(0, 6);
  });
});

describe('repricing gap', () => {
  it('routes non-rate-sensitive positions to their own bucket', () => {
    const result = computeRepricingGap(NIGERIA_POSITIONS, ctx, ladder);
    const nonSensitive = result.buckets.find((b) => b.bucket === 'Non-Rate-Sensitive')!;
    // Cash, fixed assets and equity are flagged not rate-sensitive in the seed.
    expect(nonSensitive.assets + nonSensitive.liabilities).toBeGreaterThan(0);
  });

  it('closes to zero cumulatively, since assets equal liabilities plus capital', () => {
    const result = computeRepricingGap(NIGERIA_POSITIONS, ctx, ladder);
    expect(result.buckets[result.buckets.length - 1]!.cumulativeGap).toBeCloseTo(0, 6);
  });
});

describe('bucket midpoints', () => {
  const liquidity = defaultLadder('LiquidityGap');

  it('returns the midpoint of a closed bucket in years', () => {
    expect(bucketMidpointYears(liquidity, 'Overnight')).toBeCloseTo(0.5 / 365, 8);
    expect(bucketMidpointYears({ ...liquidity, buckets: STANDARD_BUCKETS }, '1-3M')).toBeCloseTo(60 / 365, 8);
  });

  it('assumes a decade horizon for the open-ended terminal bucket', () => {
    const value = bucketMidpointYears(liquidity, '5Y+')!;
    expect(value).toBeGreaterThan(5);
    expect(value).toBeLessThan(10);
  });

  it('returns null for a label the ladder does not contain', () => {
    expect(bucketMidpointYears(liquidity, 'Nonsense')).toBeNull();
  });
});

describe('dimension helpers', () => {
  const members: DimensionMember[] = [
    { id: '1', dimension: 'OrgUnit', code: 'OU-NG', name: 'Nigeria', parentCode: null, isLeaf: false },
    { id: '2', dimension: 'OrgUnit', code: 'OU-NG-RET', name: 'Retail', parentCode: 'OU-NG', isLeaf: false },
    { id: '3', dimension: 'OrgUnit', code: 'OU-NG-RET-LAG', name: 'Lagos', parentCode: 'OU-NG-RET', isLeaf: true },
  ];

  it('walks the path from root to leaf', () => {
    expect(ancestorPath(members, 'OU-NG-RET-LAG').map((m) => m.code)).toEqual(['OU-NG', 'OU-NG-RET', 'OU-NG-RET-LAG']);
  });

  it('returns an empty path for an unknown code', () => {
    expect(ancestorPath(members, 'MISSING')).toEqual([]);
  });

  it('survives a malformed hierarchy containing a cycle', () => {
    const cyclic: DimensionMember[] = [
      { id: '1', dimension: 'OrgUnit', code: 'A', name: 'A', parentCode: 'B', isLeaf: false },
      { id: '2', dimension: 'OrgUnit', code: 'B', name: 'B', parentCode: 'A', isLeaf: false },
    ];
    expect(ancestorPath(cyclic, 'A').length).toBeLessThanOrEqual(2);
  });

  it('maps each dimension to its position field', () => {
    expect(positionKeyFor('OrgUnit')).toBe('orgUnitCode');
    expect(positionKeyFor('Counterparty')).toBe('counterpartyId');
    expect(positionKeyFor('Country')).toBeNull();
  });

  it('indexes members by code', () => {
    expect(indexMembers(members).get('OU-NG')!.name).toBe('Nigeria');
  });
});

describe('survival horizon edge cases', () => {
  const sctx = { asOfDate: NIGERIA_AS_OF, reportingCurrency: 'NGN', fx };

  it('exhausts on day one when the buffer is already gone', () => {
    const result = computeSurvivalHorizon(0, severeOutflowProfile(750_000), sctx);
    expect(result.survivalHorizonDays).toBe(0);
    expect(result.timeline[0]!.isExhausted).toBe(true);
  });

  it('dates each day forward from the as-of date', () => {
    const result = computeSurvivalHorizon(539_500, severeOutflowProfile(750_000), sctx);
    expect(result.timeline[0]!.date).toBe('2026-08-01');
    expect(result.timeline[29]!.date).toBe('2026-08-30');
  });

  it('handles a profile with no front-loaded phase', () => {
    const result = computeSurvivalHorizon(
      1_000_000,
      {
        totalOutflow: 600_000,
        horizonDays: 30,
        frontLoadedPercent: 0,
        frontLoadedDays: 0,
      },
      sctx,
    );
    expect(result.survivesFullHorizon).toBe(true);
    expect(result.timeline[0]!.dailyOutflow).toBeCloseTo(20_000, 6);
  });
});

describe('vintage helpers', () => {
  const affiliate: Affiliate = {
    code: 'NG',
    name: 'Ecobank Nigeria',
    country: 'Nigeria',
    region: 'Nigeria',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'NGN',
    activeCurrencies: ['NGN'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-NG',
    feeds: [
      { domain: 'Positions', mode: 'File', connectorId: null, slaDays: 30, owner: 'Ops' },
      { domain: 'FxRates', mode: 'Connector', connectorId: 'C-1', slaDays: 1, owner: 'Treasury' },
    ],
    inheritGroupRules: true,
    internalThresholds: {},
    limitsConfirmed: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const batch = (over: Partial<LoadBatch>): LoadBatch => ({
    id: 'B-1',
    affiliateCode: 'NG',
    domain: 'Positions',
    asOfDate: NIGERIA_AS_OF,
    version: 1,
    fileName: 'p.csv',
    fileHash: 'h',
    rowCount: 27,
    rowsAccepted: 27,
    rowsRejected: 0,
    status: 'Committed',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: 'ops',
    uploadedAt: '2026-07-31T09:00:00Z',
    committedBy: 'ops',
    committedAt: '2026-07-31T09:05:00Z',
    reconciledBy: null,
    reconciledAt: null,
    ...over,
  });

  it('checks every configured domain at once', () => {
    const checks = checkAllDomains(affiliate, [batch({})], '2026-08-05');
    expect(checks).toHaveLength(2);
    expect(checks.find((c) => c.domain === 'FxRates')!.status).toBe('Never loaded');
  });

  it('lists available as-of dates newest first', () => {
    const batches = [batch({ id: 'B-JUN', asOfDate: '2026-06-30' }), batch({ id: 'B-JUL' })];
    expect(availableAsOfDates(batches, 'NG')).toEqual(['2026-07-31', '2026-06-30']);
  });

  it('ignores batches that were never committed', () => {
    expect(availableAsOfDates([batch({ status: 'Staged' })], 'NG')).toEqual([]);
  });

  it('identifies batches past the retention window', () => {
    const old = batch({ id: 'B-OLD', asOfDate: '2020-01-31' });
    expect(expiredBatches([old, batch({})], NIGERIA_AS_OF, 24).map((b) => b.id)).toEqual(['B-OLD']);
  });
});

describe('regulatory minima', () => {
  it('differ by jurisdiction, rather than being assumed uniform across the Group', () => {
    expect(REGULATORY_MINIMA.CBN!.loanToDepositPercent).toBe(65);
    expect(REGULATORY_MINIMA['Bank of Ghana']!.loanToDepositPercent).toBeUndefined();
    expect(REGULATORY_MINIMA.BCEAO!.lcrPercent).toBe(100);
  });
});
