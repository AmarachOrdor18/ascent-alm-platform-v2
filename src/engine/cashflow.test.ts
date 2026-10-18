import { describe, it, expect } from 'vitest';
import type { Position } from './types';
import type { BehaviourPattern } from './behavioural';
import type { YieldCurve } from './ftp';
import { defaultLadder, NON_RATE_SENSITIVE } from './buckets';
import { addDays, daysBetween } from './dates';
import {
  applyBehaviouralOverlay,
  bucketCashflows,
  cashflowTransferRate,
  cashflowWeightedTenor,
  cprToSmm,
  discountFactor,
  economicValue,
  generateBookCashflows,
  generateContractualCashflows,
  presentValue,
  repricingCashflows,
  repricingWithinHorizon,
  shiftCurve,
  type Cashflow,
} from './cashflow';

const AS_OF = '2026-06-30';

function position(over: Partial<Position>): Position {
  return {
    id: 'P-1',
    affiliateCode: 'NG',
    asOfDate: AS_OF,
    batchId: 'B-1',
    accountNumber: '0001',
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: null,
    category: 'Asset',
    productCode: 'P-LOAN',
    productClass: 'Loans - Corporate',
    currency: 'NGN',
    amount: 1_000_000,
    legalEntityCode: 'LE',
    orgUnitCode: 'OU',
    glAccountCode: 'GL',
    commonCoaCode: 'COA-LOAN',
    counterpartyId: null,
    originationDate: null,
    maturityDate: '2027-06-30',
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: 3,
    repricingFrequencyMonths: null,
    accrualBasis: '30/360',
    rateType: 'Fixed',
    interestRatePct: 12,
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
    control: { maker: 'T', checker: null, status: 'ACTIVE', createdAt: AS_OF, updatedAt: AS_OF },
    notes: null,
    ...over,
  };
}

const sum = (flows: Cashflow[], key: 'principal' | 'interest') => flows.reduce((s, f) => s + f[key], 0);

const PATTERN: BehaviourPattern = {
  id: 'BP-T',
  name: 'Test core',
  appliesTo: ['Core'],
  tiers: [
    { tenorDays: 30, percent: 20, type: 'Volatile' },
    { tenorDays: 365, percent: 30, type: 'Core' },
    { tenorDays: 1095, percent: 50, type: 'Core' },
  ],
};

function flatCurve(ratePercent: number): YieldCurve {
  return {
    currency: 'NGN',
    indexCode: 'TEST',
    asOfDate: AS_OF,
    points: [
      { tenorDays: 1, ratePercent },
      { tenorDays: 3650, ratePercent },
    ],
  };
}

const SLOPED: YieldCurve = {
  currency: 'NGN',
  indexCode: 'TEST',
  asOfDate: AS_OF,
  points: [
    { tenorDays: 0, ratePercent: 5 },
    { tenorDays: 730, ratePercent: 15 },
  ],
};

// ─────────────────────────────────────────────────────────────────────────

describe('contractual schedules', () => {
  it('non-amortising: quarterly interest, principal at maturity', () => {
    const { cashflows, undatedPrincipal } = generateContractualCashflows(position({}), AS_OF);
    expect(undatedPrincipal).toBe(0);
    expect(cashflows.map((f) => f.date)).toEqual(['2026-09-30', '2026-12-30', '2027-03-30', '2027-06-30']);
    // 1,000,000 × 12% × 90/360 every quarter.
    cashflows.forEach((f) => expect(f.interest).toBeCloseTo(30_000, 6));
    expect(cashflows.slice(0, 3).every((f) => f.principal === 0 && f.reason === 'Scheduled')).toBe(true);
    expect(cashflows[3]).toMatchObject({ principal: 1_000_000, reason: 'Maturity', kind: 'Contractual' });
  });

  it('level principal: equal principal, interest on the declining balance', () => {
    const { cashflows } = generateContractualCashflows(position({ amortizationType: 'Level Principal' }), AS_OF);
    cashflows.forEach((f) => expect(f.principal).toBeCloseTo(250_000, 6));
    expect(cashflows.map((f) => f.interest)).toEqual([30_000, 22_500, 15_000, 7_500].map((v) => expect.closeTo(v, 6)));
    expect(sum(cashflows, 'principal')).toBeCloseTo(1_000_000, 6);
  });

  it('conventional: level annuity instalment that sums to principal', () => {
    const p = position({ amortizationType: 'Conventional', paymentFrequencyMonths: 1, amount: 100_000 });
    const { cashflows } = generateContractualCashflows(p, AS_OF);
    expect(cashflows).toHaveLength(12);
    const instalment = (100_000 * 0.01) / (1 - 1.01 ** -12);
    cashflows.forEach((f) => expect(f.principal + f.interest).toBeCloseTo(instalment, 6));
    expect(cashflows[0]!.interest).toBeCloseTo(1_000, 6);
    expect(sum(cashflows, 'principal')).toBeCloseTo(100_000, 6);
    // Principal rises as interest falls.
    expect(cashflows[11]!.principal).toBeGreaterThan(cashflows[0]!.principal);
  });

  it('bullet with no payment frequency pays all interest at maturity from origination', () => {
    const p = position({ paymentFrequencyMonths: null, originationDate: '2025-06-30' });
    const { cashflows } = generateContractualCashflows(p, AS_OF);
    expect(cashflows).toHaveLength(1);
    expect(cashflows[0]).toMatchObject({ date: '2027-06-30', principal: 1_000_000, reason: 'Maturity' });
    expect(cashflows[0]!.interest).toBeCloseTo(240_000, 6); // two years at 12%
  });

  it('non-maturity balances have no contractual principal date', () => {
    const { cashflows, undatedPrincipal, notes } = generateContractualCashflows(
      position({ category: 'Liability', maturityDate: null }),
      AS_OF,
    );
    expect(cashflows).toEqual([]);
    expect(undatedPrincipal).toBe(1_000_000);
    expect(notes.join(' ')).toMatch(/behavioural overlay/);
  });

  it('a past-maturity balance falls due on its maturity date', () => {
    const { cashflows } = generateContractualCashflows(position({ maturityDate: '2026-05-31' }), AS_OF);
    expect(cashflows).toEqual([
      expect.objectContaining({ date: '2026-05-31', principal: 1_000_000, interest: 0, reason: 'Maturity' }),
    ]);
  });

  it('a payment pattern repays its stated shares and the rest at maturity', () => {
    const p = position({ amortizationType: 'Pattern' });
    const { cashflows } = generateContractualCashflows(p, AS_OF, {
      paymentPatternFor: () => [{ term: '2', percent: 40 }],
    });
    expect(cashflows.map((f) => f.principal)).toEqual([0, 400_000, 0, 600_000]);
    const unresolved = generateContractualCashflows(p, AS_OF);
    expect(unresolved.notes.join(' ')).toMatch(/not resolved/);
    expect(sum(unresolved.cashflows, 'principal')).toBe(1_000_000);
  });
});

describe('behavioural overlay - prepayment', () => {
  const loan = position({ maturityDate: '2028-06-30', paymentFrequencyMonths: null });
  const schedule = generateContractualCashflows(loan, AS_OF);
  const overlay = applyBehaviouralOverlay(schedule, loan, { prepaymentCprByClass: { 'COA-LOAN': 0.2 } }, AS_OF);

  it('conserves total principal and moves it earlier', () => {
    expect(overlay.treatment).toBe('Prepayment');
    expect(sum(overlay.cashflows, 'principal')).toBeCloseTo(1_000_000, 6);
    expect(overlay.cashflows.every((f) => f.kind === 'Behavioural')).toBe(true);
    expect(cashflowWeightedTenor(overlay.cashflows, AS_OF)!).toBeLessThan(
      cashflowWeightedTenor(schedule.cashflows, AS_OF)!,
    );
    const atMaturity = overlay.cashflows.find((f) => f.reason === 'Maturity')!;
    // Two years at 20% CPR leave roughly 0.8² of the balance.
    expect(atMaturity.principal).toBeCloseTo(1_000_000 * 0.8 ** (daysBetween(AS_OF, '2028-06-30') / 365), 0);
  });

  it('prepays the first month at the SMM', () => {
    const first = overlay.cashflows[0]!;
    expect(first.reason).toBe('Prepayment');
    const months = (daysBetween(AS_OF, first.date) * 12) / 365;
    expect(first.principal).toBeCloseTo(1_000_000 * (1 - (1 - cprToSmm(0.2)) ** months), 6);
  });

  it('reduces every later scheduled payment on an amortising loan', () => {
    const amortising = position({ amortizationType: 'Level Principal', paymentFrequencyMonths: 3 });
    const s = generateContractualCashflows(amortising, AS_OF);
    const o = applyBehaviouralOverlay(s, amortising, { prepaymentCprByClass: { 'Loans - Corporate': 0.3 } }, AS_OF);
    expect(sum(o.cashflows, 'principal')).toBeCloseTo(1_000_000, 6);
    const scheduled = o.cashflows.filter((f) => f.reason !== 'Prepayment');
    scheduled.forEach((f, i) => expect(f.principal).toBeLessThan(s.cashflows[i]!.principal));
    expect(sum(o.cashflows, 'interest')).toBeLessThan(sum(s.cashflows, 'interest'));
  });

  it('cprToSmm compounds back to the annual rate', () => {
    expect(1 - (1 - cprToSmm(0.2)) ** 12).toBeCloseTo(0.2, 12);
  });
});

describe('behavioural overlay - deposits', () => {
  const nmd = position({ category: 'Liability', maturityDate: null, behaviouralTag: 'Core', amount: 500_000 });

  it('runs a non-maturity deposit off per the pattern tiers', () => {
    const overlay = applyBehaviouralOverlay(
      generateContractualCashflows(nmd, AS_OF),
      nmd,
      { depositPatterns: [PATTERN] },
      AS_OF,
    );
    expect(overlay.treatment).toBe('DepositRunoff');
    expect(overlay.undatedPrincipal).toBe(0);
    expect(overlay.cashflows.map((f) => [f.date, f.principal, f.reason])).toEqual([
      [addDays(AS_OF, 30), 100_000, 'Runoff'],
      [addDays(AS_OF, 365), 150_000, 'Runoff'],
      [addDays(AS_OF, 1095), 250_000, 'Runoff'],
    ]);
  });

  it('leaves an unmatched non-maturity balance undated rather than defaulting it', () => {
    const overlay = applyBehaviouralOverlay(generateContractualCashflows(nmd, AS_OF), nmd, {}, AS_OF);
    expect(overlay.treatment).toBe('Unmodelled');
    expect(overlay.undatedPrincipal).toBe(500_000);
    expect(overlay.cashflows).toEqual([]);
  });

  it('rolls a share of a term deposit for another term and withdraws the rest', () => {
    const td = position({
      category: 'Liability',
      paymentFrequencyMonths: null,
      originationDate: '2026-03-31',
      maturityDate: '2026-09-30',
    });
    const overlay = applyBehaviouralOverlay(generateContractualCashflows(td, AS_OF), td, { renewalRate: 0.6 }, AS_OF);
    expect(overlay.treatment).toBe('TermDeposit');
    const term = daysBetween('2026-03-31', '2026-09-30');
    expect(overlay.cashflows.map((f) => [f.date, f.principal])).toEqual([
      ['2026-09-30', expect.closeTo(400_000, 6)],
      [addDays('2026-09-30', term), expect.closeTo(600_000, 6)],
    ]);
  });

  it('early withdrawal conserves the balance and pulls it forward', () => {
    const td = position({ category: 'Liability', paymentFrequencyMonths: null });
    const s = generateContractualCashflows(td, AS_OF);
    const o = applyBehaviouralOverlay(s, td, { earlyWithdrawalRate: 0.1 }, AS_OF);
    expect(sum(o.cashflows, 'principal')).toBeCloseTo(1_000_000, 6);
    expect(o.cashflows.some((f) => f.reason === 'Runoff')).toBe(true);
    expect(o.cashflows.find((f) => f.reason === 'Maturity')!.principal).toBeLessThan(1_000_000);
  });

  it('passes contractual flows through unchanged when no assumption applies', () => {
    const p = position({});
    const s = generateContractualCashflows(p, AS_OF);
    const o = applyBehaviouralOverlay(s, p, {}, AS_OF);
    expect(o.treatment).toBe('None');
    expect(o.cashflows).toEqual(s.cashflows.map((f) => ({ ...f, kind: 'Behavioural' })));
  });
});

describe('book and bucketing', () => {
  const book = [
    position({ id: 'A-BULLET' }),
    position({
      id: 'A-ANNUITY',
      amortizationType: 'Conventional',
      paymentFrequencyMonths: 1,
      maturityDate: '2031-06-30',
    }),
    position({
      id: 'A-FLOAT',
      rateType: 'Floating',
      nextRepricingDate: '2026-09-30',
      maturityDate: '2029-06-30',
      amortizationType: 'Level Principal',
      paymentFrequencyMonths: 1,
    }),
    position({ id: 'A-NRS', maturityDate: null, irrbbRateSensitive: false, amount: 70_000 }),
    position({ id: 'L-NMD', category: 'Liability', maturityDate: null, behaviouralTag: 'Core', amount: 800_000 }),
    position({ id: 'L-NMD-X', category: 'Liability', maturityDate: null, behaviouralTag: 'Non-Core', amount: 90_000 }),
    position({
      id: 'L-TD',
      category: 'Liability',
      maturityDate: '2027-01-15',
      paymentFrequencyMonths: null,
      amount: 600_000,
    }),
    position({ id: 'K-EQ', category: 'Capital', maturityDate: null, irrbbRateSensitive: false, amount: 300_000 }),
  ];
  const assumptions = {
    prepaymentCprByClass: { 'COA-LOAN': 0.1 },
    depositPatterns: [PATTERN],
    earlyWithdrawalRate: 0.05,
    renewalRate: 0.5,
  };
  const cashflows = generateBookCashflows(book, AS_OF, assumptions);
  const totalAssets = book.filter((p) => p.category === 'Asset').reduce((s, p) => s + p.amount, 0);
  const totalFunding = book.filter((p) => p.category !== 'Asset').reduce((s, p) => s + p.amount, 0);

  it('is deterministic', () => {
    expect(generateBookCashflows(book, AS_OF, assumptions)).toEqual(cashflows);
  });

  it('conserves every position balance under both bases', () => {
    for (const pc of cashflows) {
      expect(sum(pc.contractual, 'principal') + pc.undatedContractual).toBeCloseTo(pc.balance, 6);
      expect(sum(pc.behavioural, 'principal') + pc.undatedBehavioural).toBeCloseTo(pc.balance, 6);
    }
  });

  for (const basis of ['Contractual', 'Behavioural'] as const) {
    for (const kind of ['LiquidityGap', 'RepricingGap'] as const) {
      it(`${basis} ${kind} buckets total to the book`, () => {
        const r = bucketCashflows(cashflows, defaultLadder(kind), AS_OF, basis);
        const assets = r.buckets.reduce((s, b) => s + b.assets, 0) + r.undated.assets;
        const funding = r.buckets.reduce((s, b) => s + b.liabilities, 0) + r.undated.liabilities;
        expect(assets).toBeCloseTo(totalAssets, 4);
        expect(funding).toBeCloseTo(totalFunding, 4);
        expect(r.buckets[r.buckets.length - 1]!.cumulativeGap).toBeCloseTo(
          r.buckets.reduce((s, b) => s + b.gap, 0),
          6,
        );
      });
    }
  }

  it('contractual liquidity leaves non-maturity balances undated; behavioural spreads the modelled ones', () => {
    const ladder = defaultLadder('LiquidityGap');
    const c = bucketCashflows(cashflows, ladder, AS_OF, 'Contractual');
    const b = bucketCashflows(cashflows, ladder, AS_OF, 'Behavioural');
    expect(c.undated.liabilities).toBe(800_000 + 90_000 + 300_000);
    expect(b.undated.liabilities).toBe(90_000 + 300_000);
    const nmdOnly = bucketCashflows(
      cashflows.filter((pc) => pc.positionId === 'L-NMD'),
      ladder,
      AS_OF,
      'Behavioural',
    );
    expect(nmdOnly.buckets.find((x) => x.bucket === '8-30D')!.liabilities).toBeCloseTo(160_000, 6);
    expect(nmdOnly.buckets.find((x) => x.bucket === '6-12M')!.liabilities).toBeCloseTo(240_000, 6);
  });

  it('repricing view lumps a floating balance at its reset and routes non-sensitive balances to their bucket', () => {
    const float = cashflows.find((pc) => pc.positionId === 'A-FLOAT')!;
    const rp = repricingCashflows(float, 'Contractual').cashflows;
    expect(rp.at(-1)).toMatchObject({ date: '2026-09-30', reason: 'Repricing' });
    expect(sum(rp, 'principal')).toBeCloseTo(1_000_000, 6);

    const r = bucketCashflows(cashflows, defaultLadder('RepricingGap'), AS_OF, 'Contractual');
    const nrs = r.buckets.find((x) => x.bucket === NON_RATE_SENSITIVE)!;
    expect(nrs.assets).toBe(70_000);
    expect(nrs.liabilities).toBe(300_000);
  });

  it('applies the currency conversion and the interest measure', () => {
    const ladder = defaultLadder('LiquidityGap');
    const one = cashflows.filter((pc) => pc.positionId === 'A-BULLET');
    const p = bucketCashflows(one, ladder, AS_OF, 'Contractual', { convert: (a) => a * 2 });
    expect(p.buckets.reduce((s, b) => s + b.assets, 0)).toBeCloseTo(2_000_000, 6);
    const pi = bucketCashflows(one, ladder, AS_OF, 'Contractual', { measure: 'PrincipalAndInterest' });
    expect(pi.buckets.reduce((s, b) => s + b.assets, 0)).toBeCloseTo(1_120_000, 6);
  });

  it('repricing within horizon time-weights each repricing', () => {
    const float = cashflows.filter((pc) => pc.positionId === 'A-FLOAT');
    const r = repricingWithinHorizon(float, AS_OF, 365, 'Contractual');
    expect(r.assets).toBeCloseTo(1_000_000, 6);
    expect(r.timeWeightedAssets).toBeLessThan(r.assets);
    expect(r.liabilities).toBe(0);
  });
});

describe('valuation', () => {
  const flow = (days: number, principal: number, interest = 0): Cashflow => ({
    positionId: 'X',
    date: addDays(AS_OF, days),
    principal,
    interest,
    kind: 'Contractual',
  });

  it('discounts against a hand calculation', () => {
    expect(presentValue([flow(365, 1_000_000, 100_000)], flatCurve(10), AS_OF)).toBeCloseTo(1_000_000, 6);
    expect(presentValue([flow(730, 1_210_000)], flatCurve(10), AS_OF)).toBeCloseTo(1_000_000, 6);
    // Interpolated: 365d sits halfway between 5% and 15%.
    expect(presentValue([flow(365, 110)], SLOPED, AS_OF)).toBeCloseTo(100, 9);
    expect(discountFactor(flatCurve(10), AS_OF, addDays(AS_OF, 365), 'Continuous')).toBeCloseTo(Math.exp(-0.1), 12);
    expect(presentValue([flow(-5, 50)], flatCurve(10), AS_OF)).toBe(50);
    expect(presentValue([flow(365, 1_000_000, 100_000)], flatCurve(10), AS_OF, { includeInterest: false })).toBeCloseTo(
      1_000_000 / 1.1,
      6,
    );
  });

  it('returns null for an empty curve', () => {
    expect(presentValue([flow(10, 1)], { ...flatCurve(1), points: [] }, AS_OF)).toBeNull();
  });

  it('cashflow-weighted transfer rates', () => {
    const flows = [flow(365, 100), flow(730, 100)];
    expect(cashflowWeightedTenor(flows, AS_OF)).toBe(547.5);
    // Σ P·t·R / Σ P·t = (100·365·10 + 100·730·15) / (100·365 + 100·730)
    expect(cashflowTransferRate(flows, SLOPED, AS_OF)).toBeCloseTo(40 / 3, 9);
    expect(cashflowTransferRate(flows, SLOPED, AS_OF, 'AverageLife')).toBeCloseTo(12.5, 9);
    expect(cashflowTransferRate([flow(365, 100)], SLOPED, AS_OF, 'Duration')).toBeCloseTo(10, 9);
    expect(cashflowTransferRate([flow(0, 100)], SLOPED, AS_OF)).toBe(5);
    expect(cashflowTransferRate([flow(365, 0, 5)], SLOPED, AS_OF)).toBeNull();
  });

  it('shifts curves and revalues the book', () => {
    expect(shiftCurve(flatCurve(10), 200).points.every((p) => p.ratePercent === 12)).toBe(true);
    const book = generateBookCashflows(
      [
        position({ id: 'A', maturityDate: '2031-06-30' }),
        position({ id: 'L', category: 'Liability', maturityDate: '2026-12-30', paymentFrequencyMonths: null }),
        position({ id: 'N', category: 'Liability', maturityDate: null, amount: 5 }),
      ],
      AS_OF,
    );
    const base = economicValue(book, () => flatCurve(12), AS_OF, 'Contractual');
    const up = economicValue(book, () => shiftCurve(flatCurve(12), 200), AS_OF, 'Contractual');
    expect(base.unvalued).toBe(5);
    // A long fixed asset funded short loses value when rates rise.
    expect(up.net).toBeLessThan(base.net);
    expect(up.assets).toBeLessThan(base.assets);
  });
});
