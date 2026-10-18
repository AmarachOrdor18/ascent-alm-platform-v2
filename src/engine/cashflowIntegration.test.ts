/**
 * The shared cashflow book wired through every engine: liquidity gap (with undated balances reported), the
 * LCR 30-day window, time-weighted NII, cash-flow EVE under parallel and tenor-dependent shocks, and the FTP
 * methods (matched maturity, duration, average life, repricing term, pooled) plus currency/basis add-ons.
 * Every expected figure is worked by hand in the comment beside it.
 */

import { describe, expect, it } from 'vitest';
import type { Position } from './types';
import { identityFxTable, buildFxTable } from './fx';
import { defaultLadder } from './buckets';
import { addDays, addMonths } from './dates';
import { computeLcr, computeLiquidityGap } from './liquidity';
import { computeAllShocks, computeEveSensitivity, computeNiiSensitivity, computeRepricingGap } from './irrbb';
import { computeCounterbalancingCapacity } from './stress';
import { computeFtp, resolveTpMethod, type AdjustmentRule, type YieldCurve } from './ftp';
import { DEFAULT_BETAS, DEFAULT_PATTERNS } from './behavioural';
import { ALL_ELEMENTS, buildCashflowBook, draftRun, executeRun, type RunInputs } from './run';

const AS_OF = '2026-07-31';
const fx = identityFxTable('NGN', AS_OF);
const ctx = { asOfDate: AS_OF, reportingCurrency: 'NGN', fx, tier1Capital: null };

function pos(over: Partial<Position>): Position {
  return {
    id: 'P',
    affiliateCode: 'NG',
    asOfDate: AS_OF,
    batchId: 'B-1',
    accountNumber: '1',
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: 'HQ',
    category: 'Asset',
    productCode: 'P-LOAN',
    productClass: 'Loans - Corporate',
    currency: 'NGN',
    amount: 1_000,
    legalEntityCode: 'LE',
    orgUnitCode: 'OU-1',
    glAccountCode: 'GL',
    commonCoaCode: 'COA-LOAN',
    counterpartyId: null,
    originationDate: null,
    maturityDate: addDays(AS_OF, 365),
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: null,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'Fixed',
    interestRatePct: 0,
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
    rsfFactorPct: null,
    irrbbRateSensitive: true,
    approxDurationYears: null,
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
    control: { maker: 'T', checker: 'S', status: 'ACTIVE', createdAt: AS_OF, updatedAt: AS_OF },
    notes: null,
    ...over,
  } as Position;
}

const flat = (ratePercent: number, currency = 'NGN', indexCode = `${currency}-FLAT`): YieldCurve => ({
  currency,
  indexCode,
  asOfDate: AS_OF,
  points: [30, 365, 1095, 1825].map((tenorDays) => ({ tenorDays, ratePercent })),
});
/** R(t) = 5 + t/365 percent, exactly linear between 30 and 1825 days. */
const upward = (currency = 'NGN'): YieldCurve => ({
  currency,
  indexCode: `${currency}-UP`,
  asOfDate: AS_OF,
  points: [30, 365, 1095, 1825].map((tenorDays) => ({ tenorDays, ratePercent: 5 + tenorDays / 365 })),
});

const bucket = (buckets: Array<{ bucket: string; assets: number; liabilities: number }>, label: string) =>
  buckets.find((b) => b.bucket === label)!;

// ─────────────────────────────────────────────────────────────────────────

describe('liquidity gap from the cashflow book', () => {
  // 1,200 repaid in 12 equal monthly instalments of 100. Payment dates run back from 31 Jul 2027:
  // 31 Aug (31d) and 30 Sep (61d) fall in 1-3M; 31 Oct (92d), 30 Nov (122d), 31 Dec (153d) in 3-6M;
  // 31 Jan (184d) to 31 Jul 2027 (365d) - seven instalments - in 6-12M.
  const amortising = pos({
    id: 'AMORT',
    amount: 1_200,
    amortizationType: 'Level Principal',
    paymentFrequencyMonths: 1,
    maturityDate: '2027-07-31',
  });
  const unmodelledNmd = pos({
    id: 'NMD',
    category: 'Liability',
    amount: 500,
    maturityDate: null,
    behaviouralTag: 'Core',
  });
  const capital = pos({ id: 'CAP', category: 'Capital', amount: 300, maturityDate: null });
  const book = buildCashflowBook([amortising, unmodelledNmd, capital], AS_OF, {});
  const ladder = defaultLadder('LiquidityGap');

  it('buckets each instalment on its own date rather than the whole balance at maturity', () => {
    const r = computeLiquidityGap([], ctx, ladder, 'Contractual', book);
    expect(r.source).toBe('Cashflows');
    expect(bucket(r.buckets, '1-3M').assets).toBeCloseTo(200, 6);
    expect(bucket(r.buckets, '3-6M').assets).toBeCloseTo(300, 6);
    expect(bucket(r.buckets, '6-12M').assets).toBeCloseTo(700, 6);
    // The balance-based view puts all 1,200 at maturity.
    const old = computeLiquidityGap([amortising], ctx, ladder, 'Contractual');
    expect(bucket(old.buckets, '6-12M').assets).toBe(1_200);
  });

  it('reports balances with no date instead of dropping them', () => {
    // No pattern supplied: the 500 deposit and the 300 of capital have nothing to bucket on.
    const r = computeLiquidityGap([], ctx, ladder, 'Behavioural', book);
    expect(r.undated).toEqual({ assets: 0, liabilities: 800 });
    // The balance-based path reports the same, where it used to drop them silently.
    expect(computeLiquidityGap([amortising, unmodelledNmd, capital], ctx, ladder).undated).toEqual({
      assets: 0,
      liabilities: 800,
    });
  });

  it('dates a patterned deposit on the behavioural basis only', () => {
    const patterned = buildCashflowBook([unmodelledNmd], AS_OF, { behaviourPatterns: DEFAULT_PATTERNS });
    // Core pattern: 5% at 30d, 15% at 365d, 40% at 1095d, 40% at 1825d.
    const beh = computeLiquidityGap([], ctx, ladder, 'Behavioural', patterned);
    expect(beh.undated).toEqual({ assets: 0, liabilities: 0 });
    expect(bucket(beh.buckets, '8-30D').liabilities).toBeCloseTo(25, 6);
    expect(bucket(beh.buckets, '6-12M').liabilities).toBeCloseTo(75, 6);
    expect(bucket(beh.buckets, '1-3Y').liabilities).toBeCloseTo(200, 6);
    expect(bucket(beh.buckets, '3-5Y').liabilities).toBeCloseTo(200, 6);
    const con = computeLiquidityGap([], ctx, ladder, 'Contractual', patterned);
    expect(con.undated?.liabilities).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('LCR 30-day window from contractual cashflows', () => {
  const hqla = pos({ id: 'HQLA', amount: 1_000, lcrCashflowRole: 'HQLA', hqlaLevel: 'Level 1', maturityDate: null });
  // Due in 20 days: 1,000 principal + 1,000 × 12% × 20/365 = 6.5753 interest.
  const loanSoon = pos({
    id: 'IN-20',
    amount: 1_000,
    interestRatePct: 12,
    maturityDate: addDays(AS_OF, 20),
    lcrCashflowRole: 'Inflow',
    lcrRatePct: 50,
  });
  const loanLater = pos({
    id: 'IN-90',
    amount: 1_000,
    interestRatePct: 12,
    maturityDate: addDays(AS_OF, 90),
    lcrCashflowRole: 'Inflow',
    lcrRatePct: 50,
  });
  const takingSoon = pos({
    id: 'OUT-10',
    category: 'Liability',
    productClass: 'Interbank Takings',
    amount: 2_000,
    maturityDate: addDays(AS_OF, 10),
    lcrCashflowRole: 'Outflow',
    lcrRatePct: 100,
  });
  const takingLater = pos({
    id: 'OUT-200',
    category: 'Liability',
    productClass: 'Interbank Takings',
    amount: 2_000,
    maturityDate: addDays(AS_OF, 200),
    lcrCashflowRole: 'Outflow',
    lcrRatePct: 100,
  });
  // A customer term deposit can be broken early - it keeps balance × run-off whatever its maturity.
  const termDeposit = pos({
    id: 'TD',
    category: 'Liability',
    productClass: 'Retail Deposits - Term',
    amount: 1_000,
    interestRatePct: 10,
    maturityDate: addDays(AS_OF, 200),
    lcrCashflowRole: 'Outflow',
    lcrRatePct: 10,
  });
  const book_ = [hqla, loanSoon, loanLater, takingSoon, takingLater, termDeposit];
  const book = buildCashflowBook(book_, AS_OF, {});

  it('counts only flows due inside 30 days for dated inflows and term funding', () => {
    const r = computeLcr(book_, ctx, {}, book);
    const interest = (1_000 * 0.12 * 20) / 365;
    expect(r.grossInflows).toBeCloseTo((1_000 + interest) * 0.5, 6); // 503.29
    expect(r.grossOutflows).toBeCloseTo(2_000 + 100, 6); // the 10-day taking + 10% of the term deposit
    expect(r.netCashOutflows).toBeCloseTo(2_100 - (1_000 + interest) * 0.5, 6);
    expect(r.lcrPercent).toBeCloseTo((1_000 / (2_100 - (1_000 + interest) * 0.5)) * 100, 6); // 62.63%
    expect(r.cashflowWindow?.termFundingDue).toBeCloseTo(2_000, 6);
    expect(r.cashflowWindow?.datedTermFundingBalance).toBeCloseTo(4_000, 6);
  });

  it('is unchanged on the balance basis without a book', () => {
    const r = computeLcr(book_, ctx);
    expect(r.grossInflows).toBeCloseTo(1_000, 6); // 2,000 × 50%
    expect(r.grossOutflows).toBeCloseTo(4_100, 6);
    expect(r.cashflowWindow).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('NII time-weighted on the repricing cashflows', () => {
  // A three-year loan resetting quarterly: the whole 365,000 reprices on 31 Oct, 92 days in.
  const floating = pos({
    id: 'FLT',
    amount: 365_000,
    maturityDate: '2029-07-31',
    nextRepricingDate: addMonths(AS_OF, 3),
    rateType: 'Floating',
    interestRatePct: 25,
    paymentFrequencyMonths: 3,
  });

  it('earns the shock only for the part of the year left after the reset', () => {
    const book = buildCashflowBook([floating], AS_OF, {});
    const r = computeNiiSensitivity([floating], ctx, 200, 365, book);
    // 365,000 × (365 − 92)/365 × 2% = 5,460, against 7,300 for the full-horizon gap.
    expect(r.timeWeighted).toBe(true);
    expect(r.rateSensitiveAssets).toBe(365_000);
    expect(r.deltaNii).toBeCloseTo(5_460, 6);
    expect(computeNiiSensitivity([floating], ctx, 200).deltaNii).toBeCloseTo(7_300, 6);
  });

  it('keeps deposit betas on the liability leg', () => {
    // Asset matures 31 Dec (153 days); a core current account reprices at once to the extent of its 0.35 beta.
    const asset = pos({ id: 'A', amount: 1_000, maturityDate: '2026-12-31' });
    const deposit = pos({ id: 'D', category: 'Liability', amount: 1_000, maturityDate: null, behaviouralTag: 'Core' });
    const book = buildCashflowBook([asset, deposit], AS_OF, { behaviourPatterns: DEFAULT_PATTERNS });
    const r = computeNiiSensitivity([asset, deposit], { ...ctx, depositBetas: DEFAULT_BETAS }, 100, 365, book);
    const twAsset = (1_000 * (365 - 153)) / 365; // 580.82
    expect(r.timeWeightedAssets).toBeCloseTo(twAsset, 6);
    expect(r.timeWeightedLiabilities).toBeCloseTo(1_000, 6);
    expect(r.liabilityRepricingReduction).toBeCloseTo(650, 6);
    // (580.82 − 1,000 + 650) × 1% = 2.3082
    expect(r.deltaNii).toBeCloseTo((twAsset - 1_000 + 650) * 0.01, 6);
  });

  it('places a patterned deposit on its run-off tiers in the repricing gap', () => {
    const deposit = pos({ id: 'D', category: 'Liability', amount: 1_000, maturityDate: null, behaviouralTag: 'Core' });
    const book = buildCashflowBook([deposit], AS_OF, { behaviourPatterns: DEFAULT_PATTERNS });
    const r = computeRepricingGap([deposit], ctx, defaultLadder('RepricingGap'), book);
    expect(bucket(r.buckets, '0-30D').liabilities).toBeCloseTo(50, 6);
    expect(bucket(r.buckets, '6-12M').liabilities).toBeCloseTo(150, 6);
    expect(r.undated).toEqual({ assets: 0, liabilities: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('EVE by discounting the cashflow book', () => {
  // 1,000 due in exactly one year, no coupon, on a flat 10% curve: PV = 1,000 / 1.10 = 909.0909.
  const zero = pos({ id: 'Z', amount: 1_000, maturityDate: addDays(AS_OF, 365) });
  const capital = pos({ id: 'C', category: 'Capital', amount: 100, maturityDate: null, irrbbRateSensitive: false });
  const book = buildCashflowBook([zero, capital], AS_OF, {});
  const curves = [flat(10)];

  it('revalues on the shocked curve', () => {
    const r = computeEveSensitivity([zero, capital], ctx, 200, { book, curves });
    // 1,000/1.12 − 1,000/1.10 = 892.857 − 909.091 = −16.234
    expect(r.method).toBe('CashflowPv');
    expect(r.baseEconomicValue?.assets).toBeCloseTo(1_000 / 1.1, 6);
    expect(r.deltaEve).toBeCloseTo(1_000 / 1.12 - 1_000 / 1.1, 6);
    expect(r.pv01).toBeCloseTo(1_000 / 1.1001 - 1_000 / 1.1, 6);
    expect(r.unvalued).toBe(0);
    expect(r.eveSensitivityPercentOfEquity).toBeCloseTo(((1_000 / 1.12 - 1_000 / 1.1) / 100) * 100, 6);
  });

  it('applies a steepener tenor by tenor rather than as one average', () => {
    // Standard repricing ladder: 0-30D…6-12M take −65bp, 1-3Y and beyond +90bp. The 365-day point drops to
    // 9.35%, so PV rises to 1,000/1.0935 = 914.495: ΔEVE = +5.404.
    const { results } = computeAllShocks([zero, capital], ctx, defaultLadder('RepricingGap'), [], { book, curves });
    expect(results.steepener!.eve.deltaEve).toBeCloseTo(1_000 / 1.0935 - 1_000 / 1.1, 6);
    // The average-shock approximation would have called it a small loss.
    expect(results.steepener!.eve.deltaEve!).toBeGreaterThan(0);
  });

  it('falls back to duration for a currency with no curve, and reports it', () => {
    const usd = pos({ id: 'U', currency: 'USD', amount: 500, approxDurationYears: 2 });
    const fxUsd = buildFxTable('NGN', [{ base: 'NGN', quote: 'USD', rate: 1, asOfDate: AS_OF }], AS_OF);
    const all = [zero, capital, usd];
    const r = computeEveSensitivity(all, { ...ctx, fx: fxUsd }, 200, {
      book: buildCashflowBook(all, AS_OF, {}),
      curves,
    });
    // −2 × 500 × 2% = −20 by duration, on top of the discounted −16.234.
    expect(r.method).toBe('Mixed');
    expect(r.unvalued).toBeCloseTo(500, 6);
    expect(r.deltaEveDurationFallback).toBeCloseTo(-20, 6);
    expect(r.deltaEve).toBeCloseTo(-20 + (1_000 / 1.12 - 1_000 / 1.1), 6);
  });

  it('reflects prepayment: principal returning earlier loses less value', () => {
    const fiveYear = pos({ id: 'M', amount: 1_000, commonCoaCode: 'COA-MORTGAGE', maturityDate: addDays(AS_OF, 1825) });
    const plain = computeEveSensitivity([fiveYear, capital], ctx, 200, {
      book: buildCashflowBook([fiveYear, capital], AS_OF, {}),
      curves,
    });
    const prepaid = computeEveSensitivity([fiveYear, capital], ctx, 200, {
      book: buildCashflowBook([fiveYear, capital], AS_OF, {
        prepaymentRules: [{ commonCoaCode: 'COA-MORTGAGE', cpr: 0.2 }],
      }),
      curves,
    });
    expect(plain.deltaEve!).toBeLessThan(0);
    expect(Math.abs(prepaid.deltaEve!)).toBeLessThan(Math.abs(plain.deltaEve!));
  });

  it('keeps the duration-gap path when no valuation inputs are given', () => {
    const r = computeEveSensitivity([zero, capital], ctx, 200);
    expect(r.method).toBeUndefined();
    expect(r.methodology).toContain('duration gap');
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('FTP methods genuinely differ', () => {
  // 1,000 repaid 250 every six months: 31 Jan 27 (184d), 31 Jul 27 (365d), 31 Jan 28 (549d), 31 Jul 28 (731d).
  // On R(t) = 5 + t/365:
  //  - matched maturity Σ P·t·R / Σ P·t = 5 + Σt²/(365·Σt) = 5 + 1,002,843 / 667,585 = 6.50220
  //  - average life 457.25d → 5 + 457.25/365 = 6.25274
  //  - repricing term at maturity, 731d → 5 + 731/365 = 7.00274
  //  - duration: PV-weighted time, shorter than average life → below 6.25274
  const amortiser = pos({
    id: 'AM',
    amount: 1_000,
    interestRatePct: 0,
    amortizationType: 'Level Principal',
    paymentFrequencyMonths: 6,
    maturityDate: '2028-07-31',
  });
  const run = (method: Parameters<typeof computeFtp>[3]['method'], positions = [amortiser], extra = {}) =>
    computeFtp(positions, [upward()], [], { asOfDate: AS_OF, currentLcrPercent: null, method, ...extra });

  it('prices each method off a different reading of the same cashflows', () => {
    const mm = run('MatchedMaturity').lines[0]!;
    const al = run('AverageLife').lines[0]!;
    const rt = run('RepricingTerm').lines[0]!;
    const dm = run('DurationMatched').lines[0]!;
    expect(mm.baseTransferRatePercent).toBeCloseTo(5 + 1_002_843 / 667_585, 6);
    expect(al.baseTransferRatePercent).toBeCloseTo(5 + 457.25 / 365, 6);
    expect(rt.baseTransferRatePercent).toBeCloseTo(5 + 731 / 365, 6);
    expect(dm.baseTransferRatePercent!).toBeLessThan(al.baseTransferRatePercent!);
    expect(mm.methodApplied).toBe('MatchedMaturity');
    expect(dm.methodApplied).toBe('DurationMatched');
    // Every line carries every method's rate, for the compare-methods view.
    expect(mm.rateByMethod?.AverageLife).toBeCloseTo(al.baseTransferRatePercent!, 9);
    expect(mm.rateByMethod?.RepricingTerm).toBeCloseTo(rt.baseTransferRatePercent!, 9);
  });

  it('funds a floating loan only to its reset date under matched maturity', () => {
    // Reset in 92 days on a 3-year loan: the whole balance reprices then, so it funds at R(92).
    const floating = pos({
      id: 'F',
      amount: 1_000,
      maturityDate: '2029-07-31',
      nextRepricingDate: addMonths(AS_OF, 3),
      rateType: 'Floating',
      interestRatePct: 10,
    });
    const line = run('MatchedMaturity', [floating]).lines[0]!;
    expect(line.baseTransferRatePercent).toBeCloseTo(5 + 92 / 365, 6);
  });

  it('runs legacy method names as repricing term, so saved rules do not move', () => {
    expect(resolveTpMethod('RedemptionCurve')).toBe('RepricingTerm');
    const legacy = run('RedemptionCurve').lines[0]!;
    expect(legacy.method).toBe('RedemptionCurve');
    expect(legacy.methodApplied).toBe('RepricingTerm');
    expect(legacy.baseTransferRatePercent).toBeCloseTo(5 + 731 / 365, 6);
  });

  it('credits a non-maturity deposit across its run-off tiers under matched maturity', () => {
    const nmd = pos({
      id: 'NMD',
      category: 'Liability',
      amount: 1_000,
      maturityDate: null,
      behaviouralTag: 'Core',
      interestRatePct: 1,
    });
    const line = run('MatchedMaturity', [nmd], { behaviourPatterns: DEFAULT_PATTERNS }).lines[0]!;
    // Core tiers 5%@30, 15%@365, 40%@1095, 40%@1825: Σ P·t·R / Σ P·t with R = 5 + t/365.
    const tiers = [
      [50, 30],
      [150, 365],
      [400, 1095],
      [400, 1825],
    ];
    const pt = tiers.reduce((s, [p, t]) => s + p! * t!, 0);
    const ptr = tiers.reduce((s, [p, t]) => s + p! * t! * (5 + t! / 365), 0);
    expect(line.baseTransferRatePercent).toBeCloseTo(ptr / pt, 6);
    expect(line.tenorBasis).toBe('Behavioural');
  });

  it('falls back to repricing term, and says so, when there are no dated cashflows', () => {
    const nmd = pos({
      id: 'NMD',
      category: 'Liability',
      amount: 1_000,
      maturityDate: null,
      behaviouralTag: 'Core',
      interestRatePct: 1,
    });
    const line = run('MatchedMaturity', [nmd]).lines[0]!;
    expect(line.methodApplied).toBe('RepricingTerm');
    expect(line.pricingNote).toMatch(/repricing term/);
    expect(line.baseTransferRatePercent).toBeCloseTo(5 + 30 / 365, 6); // overnight: flat below the 30-day point
  });
});

describe('FTP pooled funding', () => {
  const amortiser = pos({
    id: 'AM',
    amount: 1_000,
    interestRatePct: 0,
    amortizationType: 'Level Principal',
    paymentFrequencyMonths: 6,
    maturityDate: '2028-07-31',
  });
  const bullet = pos({ id: 'BUL', amount: 3_000, interestRatePct: 0, maturityDate: addDays(AS_OF, 365) });
  const pools = [{ id: 'NGN-ST', name: 'NGN up to 2y', currency: 'NGN', tenorFromDays: 0, tenorToDays: 730 }];

  it('charges every member the balance-weighted curve rate of its pool', () => {
    // Members sit at their average lives: 457d (R = 6.25205) and 365d (R = 6.0).
    // Pool rate = (1,000 × 6.25205 + 3,000 × 6.0) / 4,000 = 6.06301.
    const r = computeFtp([amortiser, bullet], [upward()], [], {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      method: 'Pooled',
      pools,
    });
    const expected = (1_000 * (5 + 457 / 365) + 3_000 * 6) / 4_000;
    expect(r.lines.every((l) => l.poolId === 'NGN-ST')).toBe(true);
    for (const l of r.lines) expect(l.baseTransferRatePercent).toBeCloseTo(expected, 6);
    expect(r.pools?.[0]?.appliedRate).toBeCloseTo(expected, 6);
    expect(r.pools?.[0]?.memberBalance).toBe(4_000);
  });

  it('uses a Treasury-set pool rate when one is given', () => {
    const r = computeFtp([bullet], [upward()], [], {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      method: 'Pooled',
      pools: [{ ...pools[0]!, rate: 7 }],
    });
    expect(r.lines[0]!.baseTransferRatePercent).toBe(7);
    expect(r.pools?.[0]?.source).toBe('Override');
  });

  it('leaves a position no pool covers unpriced, with the reason', () => {
    const long = pos({ id: 'L', amount: 1_000, interestRatePct: 10, maturityDate: addDays(AS_OF, 1500) });
    const r = computeFtp([long], [upward()], [], { asOfDate: AS_OF, currentLcrPercent: null, method: 'Pooled', pools });
    expect(r.lines[0]!.baseTransferRatePercent).toBeNull();
    expect(r.lines[0]!.pricingNote).toMatch(/No funding pool covers NGN at 1500 days/);
    expect(r.unpriced).toBe(1_000);
  });
});

describe('FTP currency basis and basis spread add-ons', () => {
  const ngn = pos({ id: 'NGN-L', amount: 1_000, interestRatePct: 12, maturityDate: addDays(AS_OF, 365) });
  const usd = pos({
    id: 'USD-L',
    currency: 'USD',
    amount: 1_000,
    interestRatePct: 8,
    maturityDate: addDays(AS_OF, 365),
  });
  const fxUsd = buildFxTable('NGN', [{ base: 'NGN', quote: 'USD', rate: 1, asOfDate: AS_OF }], AS_OF);

  it('charges currency basis only on positions not in the reporting currency', () => {
    const rules: AdjustmentRule[] = [
      { id: 'CB', type: 'CurrencyBasis', commonCoaCode: null, method: 'FixedRate', fixedBps: 40, currency: 'USD' },
    ];
    const r = computeFtp([ngn, usd], [flat(10), flat(5, 'USD')], rules, {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      reportingCurrency: 'NGN',
      fx: fxUsd,
    });
    expect(r.lines.find((l) => l.positionId === 'USD-L')!.adjustments).toEqual([
      { type: 'CurrencyBasis', ruleId: 'CB', bps: 40, detail: 'USD vs NGN' },
    ]);
    expect(r.lines.find((l) => l.positionId === 'NGN-L')!.adjustments).toEqual([]);
    expect(r.lines.find((l) => l.positionId === 'USD-L')!.allInTransferRatePercent).toBeCloseTo(5.4, 9);
  });

  it('reads a tenor spread curve at the line tenor', () => {
    // 10bp at 0d, 30bp at 365d - a one-year position (tenor 365) pays 30; a half-year one (183d) about 20.
    const rules: AdjustmentRule[] = [
      {
        id: 'CBT',
        type: 'CurrencyBasis',
        commonCoaCode: null,
        method: 'TenorSpread',
        currency: null,
        spreadCurve: [
          { tenorDays: 0, bps: 10 },
          { tenorDays: 365, bps: 30 },
        ],
      },
    ];
    const half = pos({ ...usd, id: 'USD-H', maturityDate: addDays(AS_OF, 183) });
    const r = computeFtp([usd, half], [flat(5, 'USD')], rules, {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      reportingCurrency: 'NGN',
      fx: fxUsd,
      method: 'RepricingTerm',
    });
    expect(r.lines.find((l) => l.positionId === 'USD-L')!.totalAdjustmentBps).toBeCloseTo(30, 9);
    expect(r.lines.find((l) => l.positionId === 'USD-H')!.totalAdjustmentBps).toBeCloseTo(10 + (20 * 183) / 365, 9);
  });

  it('prices basis spread as the index curve less the funding curve at the same tenor', () => {
    // Funded on OIS (flat 10%) by assignment; indexed to NIBOR (flat 12%): 200bp of basis.
    const indexed = pos({ ...ngn, id: 'IDX', rateIndexCode: 'NGN-NIBOR' });
    const rules: AdjustmentRule[] = [
      { id: 'BS', type: 'BasisSpread', commonCoaCode: null, method: 'CurveDifference', indexCode: 'NGN-NIBOR' },
    ];
    const r = computeFtp([indexed, ngn], [flat(10, 'NGN', 'NGN-OIS'), flat(12, 'NGN', 'NGN-NIBOR')], rules, {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      assignments: [{ commonCoaCode: 'COA-LOAN', method: 'RepricingTerm', curveCode: 'NGN-OIS' }],
    });
    const line = r.lines.find((l) => l.positionId === 'IDX')!;
    expect(line.baseTransferRatePercent).toBe(10);
    expect(line.adjustments[0]).toMatchObject({ type: 'BasisSpread', bps: 200 });
    expect(line.adjustments[0]!.detail).toBe('NGN-NIBOR − NGN-OIS at 365d');
    // No rate index, no basis.
    expect(r.lines.find((l) => l.positionId === 'NGN-L')!.adjustments).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────

describe('executeRun - one cashflow book behind every element', () => {
  const loan = pos({
    id: 'MORT',
    amount: 1_000,
    interestRatePct: 15,
    commonCoaCode: 'COA-MORTGAGE',
    maturityDate: addDays(AS_OF, 1825),
    lcrCashflowRole: 'Inflow',
    lcrRatePct: 50,
  });
  const hqla = pos({
    id: 'HQ',
    amount: 2_000,
    lcrCashflowRole: 'HQLA',
    hqlaLevel: 'Level 1',
    maturityDate: null,
    irrbbRateSensitive: false,
  });
  const deposit = pos({
    id: 'DEP',
    category: 'Liability',
    amount: 2_500,
    maturityDate: null,
    behaviouralTag: 'Core',
    interestRatePct: 2,
    lcrCashflowRole: 'Outflow',
    lcrRatePct: 10,
    productClass: 'Retail Deposits',
  });
  const capital = pos({ id: 'CAP', category: 'Capital', amount: 500, maturityDate: null, irrbbRateSensitive: false });
  const inputs: RunInputs = {
    positions: [loan, hqla, deposit, capital],
    fx,
    liquidityLadder: defaultLadder('LiquidityGap'),
    repricingLadder: defaultLadder('RepricingGap'),
    behaviourPatterns: DEFAULT_PATTERNS,
    orgUnitMembers: [],
    productMembers: [],
    tier1Capital: null,
    yieldCurves: [upward()],
    ftpMethod: 'MatchedMaturity',
  };
  const base = draftRun({
    id: 'R-CF',
    name: 'Cashflow book',
    asOfDate: AS_OF,
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    timeBucketRuleId: 'TB',
    batchIds: ['B-1'],
    createdBy: 't',
    createdAt: AS_OF,
    // Multi-layer profitability needs rules this cashflow test does not supply.
    elements: ALL_ELEMENTS.filter((e) => e !== 'ProfitabilityLayers'),
  });
  const payload = <T>(o: ReturnType<typeof executeRun>, el: string) =>
    o.results.find((r) => r.element === el)!.payload as T;

  it('applies the prepayment rule once, and every element sees it', () => {
    const plain = executeRun(base, inputs, 'now');
    const prepaid = executeRun(
      base,
      { ...inputs, prepaymentRules: [{ commonCoaCode: 'COA-MORTGAGE', cpr: 0.2 }] },
      'now',
    );
    expect(plain.errors).toEqual([]);

    type Gap = {
      behavioural: { buckets: Array<{ bucket: string; assets: number }> };
      contractual: { buckets: Array<{ bucket: string; assets: number }> };
    };
    const gapOf = (o: typeof plain) => payload<Gap>(o, 'LiquidityGap');
    // Contractually the 1,000 comes back in five years either way; behaviourally some of it comes back sooner.
    expect(bucket(gapOf(prepaid).contractual.buckets as never, '3-5Y').assets).toBeCloseTo(1_000, 6);
    expect(bucket(gapOf(prepaid).behavioural.buckets as never, '3-5Y').assets).toBeLessThan(1_000);
    // The same earlier principal shortens the FTP matched-maturity tenor and lowers its rate on an upward curve…
    const ftpRate = (o: typeof plain) =>
      payload<{ lines: Array<{ positionId: string; baseTransferRatePercent: number; methodApplied: string }> }>(
        o,
        'TransferPricing',
      ).lines.find((l) => l.positionId === 'MORT')!;
    expect(ftpRate(prepaid).methodApplied).toBe('MatchedMaturity');
    expect(ftpRate(prepaid).baseTransferRatePercent).toBeLessThan(ftpRate(plain).baseTransferRatePercent);
    // …and, the loan's value now falling less under a rate rise, raises net ΔEVE (the deposit leg is unchanged).
    const eve = (o: typeof plain) => payload<{ deltaEve: number; method: string }>(o, 'EveSensitivity');
    expect(eve(plain).method).toBe('CashflowPv');
    expect(eve(prepaid).deltaEve).toBeGreaterThan(eve(plain).deltaEve);
  });

  it('reports the book it ran on, with nothing left undated once the deposit has a pattern', () => {
    const o = executeRun(base, inputs, 'now');
    const gap = payload<{
      behavioural: { undated: { assets: number; liabilities: number } };
      cashflowBook: { positions: number };
    }>(o, 'LiquidityGap');
    expect(gap.cashflowBook.positions).toBe(4);
    // HQLA (2,000, no maturity) is an undated asset; capital (500) an undated liability.
    expect(gap.behavioural.undated).toEqual({ assets: 2_000, liabilities: 500 });
  });

  it('opens the survival horizon on the same haircut capacity Stress Testing shows', () => {
    const o = executeRun(base, inputs, 'now');
    const s = payload<{ openingBuffer: number; hqlaHaircutPercent: number }>(o, 'SurvivalHorizon');
    expect(s.hqlaHaircutPercent).toBe(10);
    expect(s.openingBuffer).toBeCloseTo(
      computeCounterbalancingCapacity([loan, hqla, deposit, capital], ctx, 10).total,
      6,
    );
    expect(s.openingBuffer).toBeCloseTo(1_800, 6); // 2,000 HQLA after a 10% haircut
  });

  it("shapes term deposits with the rule's fitted early withdrawal and roll-over", () => {
    const td = pos({
      id: 'TD',
      category: 'Liability',
      productCode: 'P-TD',
      amount: 1_000,
      interestRatePct: 0,
      maturityDate: addDays(AS_OF, 90),
      originationDate: AS_OF,
    });
    const book = buildCashflowBook([td], AS_OF, {
      termDepositBehaviour: [{ productCode: 'P-TD', currency: 'NGN', renewalRate: 0.6, earlyWithdrawalRate: 0 }],
    });
    // 60% of the 90-day maturity rolls for another 90 days; 40% leaves at maturity.
    expect(book[0]!.behaviouralTreatment).toBe('TermDeposit');
    const r = computeLiquidityGap([], ctx, defaultLadder('LiquidityGap'), 'Behavioural', book);
    expect(bucket(r.buckets, '1-3M').liabilities).toBeCloseTo(400, 6);
    expect(bucket(r.buckets, '3-6M').liabilities).toBeCloseTo(600, 6);
  });
});
