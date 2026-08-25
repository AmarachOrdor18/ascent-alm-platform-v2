/**
 * Engine tests beyond the workbook gate — the modules that implement
 * capabilities v1 did not have at all.
 */

import { describe, it, expect } from 'vitest';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF, NIGERIA_BATCH_ID } from '@/data/seed/nigeria';
import type { Affiliate, DimensionMember, LoadBatch, Position } from './types';
import { buildFxTable, convert, identityFxTable, MissingFxRateError, missingRates } from './fx';
import { bucketForDate, bucketize, defaultLadder, ladderLabels, NON_RATE_SENSITIVE, UNDATED } from './buckets';
import { addDays, addMonths, daysBetween, days30360, isLeapYear, monthsBetween, yearFraction } from './dates';
import {
  applyBehaviouralMaturity,
  applyDepositBetas,
  computeDepositRunoff,
  computePrepayment,
  DEFAULT_PATTERNS,
  InvalidBehaviourPatternError,
  validateBehaviourPattern,
} from './behavioural';
import { detectTransition, evaluateLimit, expiringSoon, type LimitConfig, type TemporaryLimit } from './limits';
import { evaluateKri, DEFAULT_KRIS } from './kri';
import { validatePositions } from './validation';
import { checkFreshness, currentBatch, planSupersede, priorAsOfDate } from './vintage';
import { reconcile, type LedgerBalance } from './reconciliation';
import { buildHierarchy, descendantCodes, filterByDimension, rollup, unmappedCodes } from './dimensions';
import { ORG_UNITS } from '@/data/seed/dimensions';
import { computeProfitability, computeFxPosition } from './profitability';
import { interpolateCurve, resolveAdjustmentBps, computeFtp, type YieldCurve, type AdjustmentRule } from './ftp';
import { draftRun, executeRun, ALL_ELEMENTS } from './run';

const fx = identityFxTable('NGN', NIGERIA_AS_OF);

describe('fx', () => {
  const table = buildFxTable(
    'USD',
    [
      { base: 'NGN', quote: 'USD', rate: 1 / 1500, asOfDate: NIGERIA_AS_OF },
      { base: 'USD', quote: 'GHS', rate: 15, asOfDate: NIGERIA_AS_OF },
    ],
    NIGERIA_AS_OF,
  );

  it('converts through the pivot in both directions', () => {
    expect(convert(1500, 'NGN', 'USD', table)).toBeCloseTo(1, 8);
    expect(convert(1, 'USD', 'GHS', table)).toBeCloseTo(15, 8);
    expect(convert(1500, 'NGN', 'GHS', table)).toBeCloseTo(15, 8);
  });

  it('is a no-op for same-currency and zero amounts', () => {
    expect(convert(100, 'NGN', 'NGN', table)).toBe(100);
    expect(convert(0, 'ZZZ', 'USD', table)).toBe(0);
  });

  it('throws rather than silently returning an unconverted amount', () => {
    expect(() => convert(100, 'ZMW', 'USD', table)).toThrow(MissingFxRateError);
  });

  it('reports which currencies are missing, so a blocked run can explain itself', () => {
    expect(missingRates(['NGN', 'ZMW', 'KES'], 'USD', table)).toEqual(['ZMW', 'KES']);
  });
});

describe('buckets', () => {
  const ladder = defaultLadder('LiquidityGap');

  it('derives a bucket from a date', () => {
    expect(bucketForDate(ladder, NIGERIA_AS_OF, '2026-08-01')).toBe('Overnight');
    expect(bucketForDate(ladder, NIGERIA_AS_OF, '2026-08-05')).toBe('2-7D');
    expect(bucketForDate(ladder, NIGERIA_AS_OF, '2026-08-20')).toBe('8-30D');
    expect(bucketForDate(ladder, NIGERIA_AS_OF, '2033-07-31')).toBe('5Y+');
  });

  it('treats an already-matured position as immediately due, not as long-dated', () => {
    expect(bucketForDate(ladder, NIGERIA_AS_OF, '2020-01-01')).toBe('Overnight');
  });

  it('marks an undated position rather than dropping it into the terminal bucket', () => {
    expect(bucketForDate(ladder, NIGERIA_AS_OF, null)).toBe(UNDATED);
  });

  it('routes non-rate-sensitive items to their own bucket on a repricing ladder', () => {
    const repricing = defaultLadder('RepricingGap');
    expect(ladderLabels(repricing)).toContain(NON_RATE_SENSITIVE);
    const buckets = bucketize(repricing, NIGERIA_AS_OF, [
      { amount: 100, isAsset: true, date: '2026-08-01', rateSensitive: false },
    ]);
    expect(buckets.find((b) => b.bucket === NON_RATE_SENSITIVE)!.assets).toBe(100);
  });

  it('emits every label even when empty, so a missing row is never read as a zero gap', () => {
    const buckets = bucketize(ladder, NIGERIA_AS_OF, []);
    expect(buckets).toHaveLength(ladder.buckets.length);
    expect(buckets.every((b) => b.gap === 0)).toBe(true);
  });
});

describe('dates', () => {
  it('computes day counts under each accrual basis', () => {
    expect(days30360('2026-01-31', '2026-02-28')).toBe(28);
    expect(yearFraction('2026-01-01', '2026-07-01', '30/360')).toBeCloseTo(0.5, 6);
    expect(yearFraction('2026-01-01', '2027-01-01', 'Actual/365')).toBeCloseTo(1, 6);
    expect(yearFraction('2026-01-01', '2027-01-01', 'Actual/360')).toBeCloseTo(365 / 360, 6);
  });

  it('uses 366 for Actual/Actual across a leap year', () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(yearFraction('2028-01-01', '2029-01-01', 'Actual/Actual')).toBeCloseTo(366 / 366, 6);
  });

  it('clamps month arithmetic to the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('adds days and counts months', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(daysBetween('2026-07-31', '2026-08-30')).toBe(30);
    expect(monthsBetween('2026-01-15', '2026-07-14')).toBe(5);
    expect(monthsBetween('2026-01-15', '2026-07-15')).toBe(6);
  });

  it('covers every accrual basis, including the 30/Actual hybrid', () => {
    expect(yearFraction('2026-01-01', '2026-07-01', '30/365')).toBeCloseTo(180 / 365, 6);
    expect(yearFraction('2026-01-01', '2026-07-01', '30/Actual')).toBeCloseTo(180 / 365, 6);
    expect(yearFraction('2028-01-01', '2028-07-01', '30/Actual')).toBeCloseTo(180 / 366, 6);
    // An unrecognised basis falls back to Actual/365 rather than throwing.
    expect(yearFraction('2026-01-01', '2027-01-01', 'Unknown' as never)).toBeCloseTo(1, 6);
  });

  it('handles the 30/360 end-of-month rule in both directions', () => {
    // Day 31 is treated as day 30 on the from-side, which then pulls the
    // to-side down as well — the standard US convention.
    expect(days30360('2026-01-31', '2026-03-31')).toBe(60);
    expect(days30360('2026-01-15', '2026-03-31')).toBe(76);
    expect(days30360('2026-03-31', '2026-01-31')).toBe(-60);
  });

  it('returns zero for an unparseable date rather than NaN', () => {
    expect(daysBetween('not-a-date', '2026-07-31')).toBe(0);
    expect(daysBetween('2026-07-31', 'not-a-date')).toBe(0);
  });

  it('identifies leap years including the century rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('subtracts months and crosses a year boundary', () => {
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonths('2026-12-31', 1)).toBe('2027-01-31');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('behavioural modelling', () => {
  it('rejects a pattern whose tiers do not total 100%', () => {
    expect(() =>
      validateBehaviourPattern({
        id: 'X',
        name: 'Bad',
        appliesTo: ['Core'],
        tiers: [{ tenorDays: 30, percent: 60, type: 'Core' }],
      }),
    ).toThrow(InvalidBehaviourPatternError);
  });

  it('splits deposits into core and volatile — the RFP Core/Non-Core requirement', () => {
    const result = computeDepositRunoff(NIGERIA_POSITIONS);
    expect(result.totalCore).toBeGreaterThan(0);
    expect(result.totalVolatile).toBeGreaterThan(0);
    expect(result.totalCore + result.totalVolatile).toBeCloseTo(result.totalDeposits, 6);
    // Non-operational corporate money is the least sticky of the four tags.
    const nonOp = result.lines.find((l) => l.behaviouralTag === 'Non-Operational')!;
    const core = result.lines.find((l) => l.behaviouralTag === 'Core')!;
    expect(nonOp.corePercent).toBeLessThan(core.corePercent);
  });

  it('shifts balance from core to volatile under stress', () => {
    const base = computeDepositRunoff(NIGERIA_POSITIONS);
    const stressed = computeDepositRunoff(NIGERIA_POSITIONS, DEFAULT_PATTERNS, 1.5);
    expect(stressed.totalVolatile).toBeGreaterThan(base.totalVolatile);
  });

  it('re-dates non-maturity deposits without changing the total balance', () => {
    const before = NIGERIA_POSITIONS.reduce((s, p) => s + p.amount, 0);
    const after = applyBehaviouralMaturity(NIGERIA_POSITIONS, NIGERIA_AS_OF).reduce((s, p) => s + p.amount, 0);
    expect(after).toBeCloseTo(before, 6);
  });

  it('makes the behavioural gap genuinely differ from the contractual one', () => {
    const contractual = NIGERIA_POSITIONS.filter((p) => p.behaviouralTag !== 'N/A');
    const behavioural = applyBehaviouralMaturity(NIGERIA_POSITIONS, NIGERIA_AS_OF).filter(
      (p) => p.behaviouralTag !== 'N/A',
    );
    // v1 produced identical rows in both modes; here the deposits are spread.
    expect(behavioural.length).toBeGreaterThan(contractual.length);
  });

  it('damps the liability leg for deposit betas, improving ΔNII on a negative gap', () => {
    const adjusted = applyDepositBetas(NIGERIA_POSITIONS, 200, -18_000);
    expect(adjusted.liabilityRepricingReduction).toBeGreaterThan(0);
    expect(adjusted.betaAdjustedDeltaNii).toBeGreaterThan(adjusted.unadjustedDeltaNii);
  });

  it('reports unmodelled assets rather than assuming a prepayment rate', () => {
    const result = computePrepayment(NIGERIA_POSITIONS, [{ commonCoaCode: 'COA-ASSET', cpr: 0.12 }]);
    expect(result.totalProjectedPayoff).toBeCloseTo(result.totalBalance * 0.12, 6);
    const none = computePrepayment(NIGERIA_POSITIONS, []);
    expect(none.unmodelled).toBeGreaterThan(0);
    expect(none.totalProjectedPayoff).toBe(0);
  });
});

describe('limits', () => {
  const config: LimitConfig = {
    id: 'L-LCR',
    metricKey: 'lcrPercent',
    label: 'LCR',
    affiliateCode: 'NG',
    direction: 'higher-is-better',
    greenThreshold: 130,
    amberThreshold: 110,
    redThreshold: 100,
    regulatoryMinimum: 100,
    isActive: true,
    updatedBy: 'test',
    updatedAt: '2026-07-01T00:00:00Z',
  };

  it('grades against three tiers, not two', () => {
    expect(evaluateLimit(config, 168.9, NIGERIA_AS_OF).status).toBe('Green');
    expect(evaluateLimit(config, 105, NIGERIA_AS_OF).status).toBe('Amber');
    expect(evaluateLimit(config, 95, NIGERIA_AS_OF).status).toBe('Red');
  });

  it('reports no-data rather than green for an unmeasured metric', () => {
    const result = evaluateLimit(config, null, NIGERIA_AS_OF);
    expect(result.status).toBe('No data');
    expect(result.severity).toBeNull();
  });

  it('flags a regulatory breach as critical, above an internal red', () => {
    expect(evaluateLimit(config, 95, NIGERIA_AS_OF).breachesRegulatoryMinimum).toBe(true);
    expect(evaluateLimit(config, 95, NIGERIA_AS_OF).severity).toBe('Critical');
  });

  it('applies a temporary limit while effective and ignores it once expired', () => {
    const temp: TemporaryLimit = {
      id: 'T-1',
      limitId: 'L-LCR',
      amberThreshold: 100,
      redThreshold: 90,
      reason: 'Eurobond maturity',
      effectiveFrom: '2026-07-01',
      expiresOn: '2026-08-31',
      approvedBy: 'ALCO',
      approvedAt: '2026-07-01T00:00:00Z',
    };
    expect(evaluateLimit(config, 95, '2026-07-31', [temp]).status).toBe('Amber');
    expect(evaluateLimit(config, 95, '2026-07-31', [temp]).temporaryLimitId).toBe('T-1');
    // Once expired the relaxation stops applying on its own.
    expect(evaluateLimit(config, 95, '2026-09-30', [temp]).status).toBe('Red');
    expect(evaluateLimit(config, 95, '2026-09-30', [temp]).temporaryLimitId).toBeNull();
  });

  it('lists temporary limits expiring soon', () => {
    const temp: TemporaryLimit = {
      id: 'T-1',
      limitId: 'L-LCR',
      amberThreshold: 100,
      redThreshold: 90,
      reason: '',
      effectiveFrom: '2026-07-01',
      expiresOn: '2026-08-05',
      approvedBy: 'ALCO',
      approvedAt: '',
    };
    expect(expiringSoon([temp], NIGERIA_AS_OF, 14)).toHaveLength(1);
    expect(expiringSoon([temp], NIGERIA_AS_OF, 2)).toHaveLength(0);
  });

  it('raises an event only on transition, not on every evaluation', () => {
    const green = evaluateLimit(config, 168, NIGERIA_AS_OF);
    const red = evaluateLimit(config, 95, NIGERIA_AS_OF);
    expect(detectTransition(green, green)).toBeNull();
    expect(detectTransition(green, red)!.isNewBreach).toBe(true);
    expect(detectTransition(red, green)!.isResolved).toBe(true);
  });
});

describe('kri', () => {
  const definition = DEFAULT_KRIS[0]!;

  it('needs at least three observations before calling a trend', () => {
    const result = evaluateKri(definition, [
      { asOfDate: '2026-06-30', value: 170 },
      { asOfDate: '2026-07-31', value: 150 },
    ]);
    expect(result.status).toBe('No data');
    expect(result.narrative).toContain('at least 3');
  });

  it('detects deterioration from the slope, direction-aware', () => {
    const result = evaluateKri(definition, [
      { asOfDate: '2026-03-31', value: 180 },
      { asOfDate: '2026-04-30', value: 172 },
      { asOfDate: '2026-05-31', value: 165 },
      { asOfDate: '2026-06-30', value: 158 },
      { asOfDate: '2026-07-31', value: 150 },
    ]);
    expect(result.trend).toBe('Deteriorating');
    expect(result.slopePerPeriod).toBeLessThan(0);
    expect(result.status).toBe('Red');
    expect(result.projectedValue).toBeLessThan(result.currentValue!);
  });

  it('treats a falling loan-to-deposit ratio as improving', () => {
    const ldr = DEFAULT_KRIS.find((k) => k.metricKey === 'loanToDepositPercent')!;
    const result = evaluateKri(ldr, [
      { asOfDate: '2026-05-31', value: 90 },
      { asOfDate: '2026-06-30', value: 85 },
      { asOfDate: '2026-07-31', value: 78 },
    ]);
    expect(result.trend).toBe('Improving');
    expect(result.status).toBe('Green');
  });

  it('returns no-data with no observations', () => {
    expect(evaluateKri(definition, []).status).toBe('No data');
  });
});

describe('validation', () => {
  const vctx = { asOfDate: NIGERIA_AS_OF, knownAffiliateCodes: ['NG'] };

  it('passes the seed dataset', () => {
    const result = validatePositions(NIGERIA_POSITIONS, vctx);
    expect(result.blocked).toBe(false);
  });

  it('blocks a batch whose balance sheet does not balance', () => {
    const broken = NIGERIA_POSITIONS.filter((p) => p.category !== 'Capital');
    const result = validatePositions(broken, vctx);
    expect(result.blocked).toBe(true);
    expect(result.exceptions.some((e) => e.checkType === 'BalanceSheetIntegrity')).toBe(true);
  });

  it('catches duplicates, unknown affiliates and bad currencies', () => {
    const first = NIGERIA_POSITIONS[0]!;
    const bad: Position[] = [
      first,
      { ...first, id: first.id },
      { ...first, id: 'X-1', affiliateCode: 'ZZ' },
      { ...first, id: 'X-2', currency: 'naira' },
    ];
    const result = validatePositions(bad, vctx);
    const types = result.exceptions.map((e) => e.checkType);
    expect(types).toContain('Duplicate');
    expect(types).toContain('ReferentialIntegrity');
    expect(types).toContain('CrossField');
  });

  it('flags a position classified as HQLA with no HQLA level', () => {
    const first = NIGERIA_POSITIONS[0]!;
    const result = validatePositions([{ ...first, hqlaLevel: 'None' }], vctx);
    expect(result.exceptions.some((e) => e.description.includes('no HQLA level'))).toBe(true);
  });
});

describe('vintage', () => {
  const affiliate: Affiliate = {
    code: 'NG',
    name: 'Ecobank Nigeria',
    country: 'Nigeria',
    region: 'Nigeria',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'NGN',
    activeCurrencies: ['NGN', 'USD'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-NG',
    feeds: [
      { domain: 'Positions', mode: 'File', connectorId: null, slaDays: 30, owner: 'Ops' },
      { domain: 'FxRates', mode: 'Connector', connectorId: 'C-REUTERS', slaDays: 1, owner: 'Treasury' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
  };

  const batch = (over: Partial<LoadBatch>): LoadBatch => ({
    id: 'B-1',
    affiliateCode: 'NG',
    domain: 'Positions',
    asOfDate: NIGERIA_AS_OF,
    version: 1,
    fileName: 'positions.csv',
    fileHash: 'abc',
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
    ...over,
  });

  it('grades freshness against the domain SLA', () => {
    const batches = [batch({})];
    // 30-day SLA: Fresh to day 30, Due through day 45 (the 1.5x grace band),
    // Stale beyond it.
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-08-15').status).toBe('Fresh');
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-08-30').status).toBe('Fresh');
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-09-10').status).toBe('Due');
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-09-14').status).toBe('Due');
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-09-16').status).toBe('Stale');
    expect(checkFreshness(affiliate, 'Positions', batches, '2026-11-15').status).toBe('Stale');
  });

  it('warns explicitly when stale, so a screen can surface it', () => {
    const result = checkFreshness(affiliate, 'Positions', [batch({})], '2026-11-15');
    expect(result.warning).toContain('30-day SLA');
  });

  it('says so when a domain has never been loaded', () => {
    expect(checkFreshness(affiliate, 'FxRates', [], NIGERIA_AS_OF).status).toBe('Never loaded');
  });

  it('picks the highest committed version for an as-of date', () => {
    const batches = [batch({ id: 'B-1', version: 1 }), batch({ id: 'B-2', version: 2 })];
    expect(currentBatch(batches, 'NG', 'Positions', NIGERIA_AS_OF)!.id).toBe('B-2');
  });

  it('plans a supersede with the next version number', () => {
    const plan = planSupersede([batch({})], 'NG', 'Positions', NIGERIA_AS_OF);
    expect(plan.superseded!.id).toBe('B-1');
    expect(plan.nextVersion).toBe(2);
  });

  it('finds the prior as-of date for period comparison', () => {
    const batches = [batch({ id: 'B-JUN', asOfDate: '2026-06-30' }), batch({ id: 'B-JUL' })];
    expect(priorAsOfDate(batches, 'NG', NIGERIA_AS_OF)).toBe('2026-06-30');
    expect(priorAsOfDate(batches, 'NG', '2026-06-30')).toBeNull();
  });
});

describe('reconciliation', () => {
  const rctx = {
    reportingCurrency: 'NGN',
    fx,
    level: 'GlAccount' as const,
    toleranceAmount: 1000,
    tolerancePercent: 0.5,
  };

  /** A ledger agreeing with the book, derived from the positions themselves. */
  function ledgerFromPositions(adjust: Record<string, number> = {}): LedgerBalance[] {
    const byGl = new Map<string, number>();
    for (const p of NIGERIA_POSITIONS) {
      byGl.set(p.glAccountCode, (byGl.get(p.glAccountCode) ?? 0) + p.amount);
    }
    return Array.from(byGl.entries()).map(([glAccountCode, balance]) => ({
      glAccountCode,
      orgUnitCode: null,
      currency: 'NGN',
      endingBalance: balance + (adjust[glAccountCode] ?? 0),
      asOfDate: NIGERIA_AS_OF,
    }));
  }

  it('signs off when instrument data matches the ledger', () => {
    const result = reconcile(NIGERIA_POSITIONS, ledgerFromPositions(), rctx);
    expect(result.canSignOff).toBe(true);
    expect(result.totalVariance).toBeCloseTo(0, 6);
  });

  it('reconciles at the local GL account level, not by category', () => {
    const result = reconcile(NIGERIA_POSITIONS, ledgerFromPositions(), rctx);
    // Six-digit local account codes on the real three-level chart, so far
    // more than one line per category.
    expect(result.lines.length).toBeGreaterThan(3);
    expect(result.lines.every((l) => /^[0-9]{6}$/.test(l.glAccountCode))).toBe(true);
  });

  it('proposes a plug for an immaterial variance but never posts it automatically', () => {
    // Both tolerances must be satisfied: 100 is inside the 1,000 absolute
    // limit and inside 0.5% of the account, so it plugs rather than blocks.
    const result = reconcile(NIGERIA_POSITIONS, ledgerFromPositions({ '200101': -100 }), rctx);
    expect(result.suggestedPlugs).toHaveLength(1);
    expect(result.suggestedPlugs[0]!.amount).toBeCloseTo(-100, 6);
    expect(result.canSignOff).toBe(true);
  });

  it('blocks a variance that is small in absolute terms but large for the account', () => {
    // 500 on a 100,000 account is 0.5% — inside the absolute tolerance but
    // on the percentage limit. Both have to pass.
    const result = reconcile(NIGERIA_POSITIONS, ledgerFromPositions({ '200101': -600 }), rctx);
    expect(result.canSignOff).toBe(false);
  });

  it('blocks sign-off on a material variance', () => {
    const result = reconcile(NIGERIA_POSITIONS, ledgerFromPositions({ '200101': -250_000 }), rctx);
    expect(result.canSignOff).toBe(false);
    expect(result.linesOutOfTolerance).toBeGreaterThan(0);
  });

  it('surfaces an account present on only one side', () => {
    const ledger: LedgerBalance[] = [
      {
        glAccountCode: '999999',
        orgUnitCode: null,
        currency: 'NGN',
        endingBalance: 50_000,
        asOfDate: NIGERIA_AS_OF,
      },
    ];
    const result = reconcile([], ledger, rctx);
    expect(result.lines.find((l) => l.glAccountCode === '999999')!.variance).toBeCloseTo(-50_000, 6);
  });
});

describe('dimensions', () => {
  // The real hierarchy, including the branch and desk level beneath each
  // segment. Selecting a rollup has to bring those along.
  const members = ORG_UNITS.filter((m) => m.code === 'OU-GROUP' || m.code.startsWith('OU-NG'));

  it('expands a rollup node to its whole subtree, three levels deep', () => {
    const all = descendantCodes(members, 'OU-NG');
    expect(all).toContain('OU-NG');
    expect(all).toContain('OU-NG-RET');
    // The branch and desk level beneath must come along too.
    expect(all).toContain('OU-NG-RET-LAGOS');
    expect(all).toContain('OU-NG-COR-LARGE-CORPORATES');
    expect(all.length).toBeGreaterThan(10);
  });

  it('builds a tree with depths', () => {
    const tree = buildHierarchy(members);
    // One root: the Group node the affiliate hangs off.
    expect(tree).toHaveLength(1);
    expect(tree[0]!.code).toBe('OU-GROUP');

    const nigeria = tree[0]!.children.find((c) => c.code === 'OU-NG')!;
    expect(nigeria.depth).toBe(1);
    // Four segments: Retail, Corporate, Treasury, Wealth.
    expect(nigeria.children).toHaveLength(4);

    const retail = nigeria.children.find((c) => c.code === 'OU-NG-RET')!;
    expect(retail.depth).toBe(2);
    // …and the regional network beneath Retail.
    expect(retail.children.length).toBeGreaterThan(0);
    expect(retail.children[0]!.depth).toBe(3);
  });

  it('filters positions by a rollup selection', () => {
    const all = filterByDimension(NIGERIA_POSITIONS, 'OrgUnit', ['OU-NG'], members);
    const retail = filterByDimension(NIGERIA_POSITIONS, 'OrgUnit', ['OU-NG-RET'], members);
    expect(all.length).toBe(NIGERIA_POSITIONS.length);
    expect(retail.length).toBeGreaterThan(0);
    expect(retail.length).toBeLessThan(all.length);
  });

  it('selecting a branch is narrower than selecting its segment', () => {
    const segment = filterByDimension(NIGERIA_POSITIONS, 'OrgUnit', ['OU-NG-RET'], members);
    const branch = filterByDimension(NIGERIA_POSITIONS, 'OrgUnit', ['OU-NG-RET-LAGOS'], members);
    expect(branch.length).toBeLessThanOrEqual(segment.length);
  });

  it('treats an empty selection as no constraint, not an empty result', () => {
    expect(filterByDimension(NIGERIA_POSITIONS, 'OrgUnit', [], members)).toHaveLength(NIGERIA_POSITIONS.length);
  });

  it('rolls balances up the hierarchy', () => {
    const totals = rollup(NIGERIA_POSITIONS, 'OrgUnit', members);
    const root = totals.find((t) => t.code === 'OU-NG')!;
    // Nothing is booked at the rollup itself; everything sits at a leaf.
    expect(root.amount).toBe(0);
    expect(root.rollupAmount).toBeCloseTo(
      NIGERIA_POSITIONS.reduce((s, p) => s + p.amount, 0),
      6,
    );
  });

  it('reports codes referenced by positions but missing from the dimension', () => {
    expect(unmappedCodes(NIGERIA_POSITIONS, 'OrgUnit', members.slice(0, 1)).length).toBeGreaterThan(0);
    // Against the full hierarchy nothing is unmapped.
    expect(unmappedCodes(NIGERIA_POSITIONS, 'OrgUnit', members)).toEqual([]);
  });
});

describe('profitability', () => {
  const pctx = { reportingCurrency: 'NGN', fx };

  it('computes NPL from performing status — the D-10 fix', () => {
    const withNpl = NIGERIA_POSITIONS.map((p) =>
      p.id === 'POS014' ? { ...p, performingStatus: 'Doubtful' as const, provisionAmount: 30_000 } : p,
    );
    const result = computeProfitability(withNpl, pctx);
    expect(result.nplRatioPercent).toBeGreaterThan(0);
    expect(result.nplCoverageRatioPercent).toBeGreaterThan(0);
  });

  it('leaves interest-income share null without a fee feed, and says why', () => {
    const result = computeProfitability(NIGERIA_POSITIONS, pctx);
    expect(result.interestIncomeToTotalIncomePercent).toBeNull();
    expect(result.notes.some((n) => n.includes('left null rather than fabricated'))).toBe(true);
  });

  it('computes it once a fee feed exists', () => {
    const result = computeProfitability(NIGERIA_POSITIONS, { ...pctx, nonInterestIncome: 50_000 });
    expect(result.interestIncomeToTotalIncomePercent).toBeGreaterThan(0);
  });

  it('computes net open FX position, excluding capital', () => {
    const result = computeFxPosition(NIGERIA_POSITIONS, pctx, 300_000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.currency).toBe('NGN');
    // Single-currency book: nothing is open against the reporting currency.
    expect(result.aggregateNetOpenPosition).toBe(0);
  });
});

describe('ftp', () => {
  const curve: YieldCurve = {
    currency: 'NGN',
    indexCode: 'NGN-NIBOR',
    points: [
      { tenorDays: 30, ratePercent: 19 },
      { tenorDays: 365, ratePercent: 21 },
      { tenorDays: 1825, ratePercent: 16 },
    ],
    asOfDate: NIGERIA_AS_OF,
  };

  it('interpolates between curve points and stays flat beyond the ends', () => {
    expect(interpolateCurve(curve, 30)).toBeCloseTo(19, 6);
    expect(interpolateCurve(curve, 197.5)).toBeCloseTo(20, 6);
    expect(interpolateCurve(curve, 1)).toBeCloseTo(19, 6);
    expect(interpolateCurve(curve, 99_999)).toBeCloseTo(16, 6);
    expect(interpolateCurve({ ...curve, points: [] }, 30)).toBeNull();
  });

  it('drives the liquidity premium from live LCR, capped', () => {
    const rule: AdjustmentRule = {
      id: 'A-1',
      type: 'LiquidityPremium',
      commonCoaCode: null,
      method: 'LcrDriven',
      lcrThresholdPercent: 130,
      lcrMultiplier: 1.5,
      lcrCapBps: 150,
    };
    expect(resolveAdjustmentBps(rule, 168.9)).toBe(0);
    expect(resolveAdjustmentBps(rule, 110)).toBeCloseTo(30, 6);
    expect(resolveAdjustmentBps(rule, 0)).toBe(150);
    expect(resolveAdjustmentBps(rule, null)).toBe(0);
  });

  it('stacks named adjustments rather than blending them into one premium', () => {
    const rules: AdjustmentRule[] = [
      { id: 'A-1', type: 'LiquidityPremium', commonCoaCode: null, method: 'FixedRate', fixedBps: 25 },
      { id: 'A-2', type: 'BasisRiskCost', commonCoaCode: null, method: 'FixedRate', fixedBps: 10 },
    ];
    const result = computeFtp(NIGERIA_POSITIONS, [curve], rules, { asOfDate: NIGERIA_AS_OF, currentLcrPercent: 168.9 });
    const line = result.lines.find((l) => l.allInTransferRatePercent !== null)!;
    expect(line.adjustments).toHaveLength(2);
    expect(line.totalAdjustmentBps).toBe(35);
    expect(line.allInTransferRatePercent).toBeCloseTo(line.baseTransferRatePercent! + 0.35, 6);
  });

  it('reports unpriced positions rather than assuming zero margin', () => {
    const result = computeFtp(NIGERIA_POSITIONS, [], [], { asOfDate: NIGERIA_AS_OF, currentLcrPercent: null });
    expect(result.unpriced).toBeGreaterThan(0);
    expect(result.totalMarginContribution).toBe(0);
  });
});

describe('run orchestrator', () => {
  const inputs = {
    positions: NIGERIA_POSITIONS,
    fx,
    liquidityLadder: defaultLadder('LiquidityGap'),
    repricingLadder: defaultLadder('RepricingGap'),
    behaviourPatterns: DEFAULT_PATTERNS,
    orgUnitMembers: [] as DimensionMember[],
    productMembers: [] as DimensionMember[],
    tier1Capital: null,
  };

  const base = draftRun({
    id: 'R-1',
    name: 'July close',
    asOfDate: NIGERIA_AS_OF,
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    timeBucketRuleId: 'TB-1',
    batchIds: [NIGERIA_BATCH_ID],
    createdBy: 'chinwe',
    createdAt: '2026-08-01T09:00:00Z',
  });

  it('produces one immutable result per requested element', () => {
    const outcome = executeRun(base, inputs, '2026-08-01T09:01:00Z');
    expect(outcome.run.status).toBe('Completed');
    expect(outcome.results).toHaveLength(ALL_ELEMENTS.length);
    expect(outcome.results.every((r) => r.methodology.length > 0)).toBe(true);
  });

  it('is scoped by construction — the D-01 fix', () => {
    const withGhana: Position[] = [
      ...NIGERIA_POSITIONS,
      { ...NIGERIA_POSITIONS[0]!, id: 'GH-1', affiliateCode: 'GH', currency: 'GHS', amount: 999_999 },
    ];
    const outcome = executeRun(base, { ...inputs, positions: withGhana }, '2026-08-01T09:01:00Z');
    const lcr = outcome.results.find((r) => r.element === 'Lcr')!.payload as { hqla: number };
    // The Ghanaian row is out of scope, so it cannot leak into Nigeria's figures.
    expect(lcr.hqla).toBeCloseTo(539_500, 6);
  });

  it('pins the data version it consumed', () => {
    const stale = executeRun(
      base,
      {
        ...inputs,
        positions: NIGERIA_POSITIONS.map((p) => ({ ...p, batchId: 'B-OTHER' })),
      },
      '2026-08-01T09:01:00Z',
    );
    expect(stale.run.status).toBe('Failed');
    expect(stale.run.errorLog[0]!.code).toBe('NO_POSITIONS_IN_SCOPE');
  });

  it('fails the run rather than silently omitting a currency it cannot convert', () => {
    const mixed: Position[] = [
      ...NIGERIA_POSITIONS,
      { ...NIGERIA_POSITIONS[0]!, id: 'ZM-1', currency: 'ZMW', amount: 1000 },
    ];
    const outcome = executeRun(base, { ...inputs, positions: mixed }, '2026-08-01T09:01:00Z');
    expect(outcome.run.status).toBe('Failed');
    expect(outcome.run.errorLog[0]!.code).toBe('FX_RATE_MISSING');
    expect(outcome.run.errorLog[0]!.message).toContain('ZMW');
  });

  it('computes only the elements requested', () => {
    const outcome = executeRun({ ...base, elements: ['Lcr', 'Nsfr'] }, inputs, '2026-08-01T09:01:00Z');
    expect(outcome.results.map((r) => r.element).sort()).toEqual(['Lcr', 'Nsfr']);
  });

  it('produces contractual and behavioural gaps side by side', () => {
    const outcome = executeRun({ ...base, elements: ['LiquidityGap'] }, inputs, '2026-08-01T09:01:00Z');
    const payload = outcome.results[0]!.payload as { contractual: unknown; behavioural: unknown };
    expect(payload.contractual).toBeDefined();
    expect(payload.behavioural).toBeDefined();
  });
});
