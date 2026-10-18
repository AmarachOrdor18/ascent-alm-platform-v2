import { describe, it, expect } from 'vitest';
import type { IndicatorObservation, Position } from './types';
import { addMonths } from './dates';
import { computeDepositRunoff, computePrepayment, DEFAULT_BETAS, validateBehaviourPattern } from './behavioural';
import {
  InsufficientHistoryError,
  ModelFitError,
  backtest,
  buildRunoffProfile,
  calibrate,
  decayWithFloorModel,
  estimateCoreDeposits,
  estimateDecay,
  estimatePrepayment,
  estimateRepricingBeta,
  estimateTermDepositBehaviour,
  linearTrendModel,
  segmentHistory,
  smmToCpr,
  toBehaviourPattern,
  toDepositBetas,
  toPrepaymentAssumptions,
  type AccountObservation,
  type BalanceObservation,
  type SegmentSeries,
} from './behaviouralModels';
import {
  importAccountHistory,
  importBalanceHistory,
  BALANCE_HISTORY_TEMPLATE,
  ACCOUNT_HISTORY_TEMPLATE,
} from '@/lib/historyImport';

// ─────────────────────────────────────────────────────────────────────────
// Synthetic data helpers - all generated here with known parameters
// ─────────────────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(next: () => number): () => number {
  return () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
}

const START = '2023-01-31';
const monthEnd = (i: number) => addMonths(START, i);

function balanceSeries(
  values: number[],
  over: Partial<BalanceObservation> = {},
  rates?: number[],
): BalanceObservation[] {
  return values.map((balance, i) => ({
    affiliateCode: 'NG',
    asOfDate: monthEnd(i),
    productCode: 'SAV',
    currency: 'NGN',
    balance,
    ...(rates ? { ratePercent: rates[i]! } : {}),
    ...over,
  }));
}

function oneSeries(obs: BalanceObservation[]): SegmentSeries {
  const [s] = segmentHistory(obs, { by: ['productCode', 'currency'] });
  return s!;
}

/** Non-core runs off at λ toward a floor of 600, with small multiplicative noise. */
function decayingDeposits(n = 36, lambda = 0.08, seed = 3): number[] {
  const z = gaussian(rng(seed));
  return Array.from({ length: n }, (_, t) => 600 + 400 * Math.exp(-lambda * t) * Math.exp(z() * 0.01));
}

// ─────────────────────────────────────────────────────────────────────────

describe('segmentHistory', () => {
  it('aggregates to month-end per segment and reports gaps', () => {
    const obs: BalanceObservation[] = [
      { affiliateCode: 'NG', asOfDate: '2024-01-15', productCode: 'SAV', currency: 'NGN', balance: 50, ratePercent: 2 },
      {
        affiliateCode: 'NG',
        asOfDate: '2024-01-31',
        productCode: 'SAV',
        currency: 'NGN',
        balance: 100,
        ratePercent: 2,
        customerType: 'Retail',
      },
      {
        affiliateCode: 'NG',
        asOfDate: '2024-01-31',
        productCode: 'SAV',
        currency: 'NGN',
        balance: 300,
        ratePercent: 4,
        customerType: 'SME',
      },
      { affiliateCode: 'NG', asOfDate: '2024-03-31', productCode: 'SAV', currency: 'NGN', balance: 410 },
      { affiliateCode: 'NG', asOfDate: '2024-01-31', productCode: 'CUR', currency: 'NGN', balance: 7 },
    ];
    const series = segmentHistory(obs, { by: ['productCode'] });
    expect(series.map((s) => s.segmentId)).toEqual(['productCode=CUR', 'productCode=SAV']);
    const sav = series[1]!;
    expect(sav.points[0]).toMatchObject({ month: '2024-01', asOfDate: '2024-01-31', balance: 400 });
    expect(sav.points[0]!.ratePercent).toBeCloseTo(3.5, 12); // (100·2 + 300·4) / 400
    expect(sav.points[1]!.ratePercent).toBeNull();
    expect(sav.missingMonths).toEqual(['2024-02']);

    const byType = segmentHistory(obs, { by: ['productCode', 'customerType'] });
    expect(byType.map((s) => s.segmentId)).toContain('productCode=SAV|customerType=SME');
  });

  it('refuses to sum across currencies', () => {
    const obs = [...balanceSeries([1, 2]), ...balanceSeries([1, 2], { currency: 'USD' })];
    expect(() => segmentHistory(obs, { by: ['productCode'] })).toThrow(ModelFitError);
    expect(segmentHistory(obs, { by: ['productCode', 'currency'] })).toHaveLength(2);
  });
});

describe('insufficient history', () => {
  it('raises a clear error instead of fabricating output', () => {
    const s = oneSeries(balanceSeries(decayingDeposits(8)));
    expect(() => estimateCoreDeposits(s, { method: 'MinimumBalance' })).toThrow(InsufficientHistoryError);
    expect(() => estimateDecay(s, { method: 'FloorFit' })).toThrow(/at least 12 required/);
  });
});

describe('core / non-core', () => {
  it('minimum-balance method takes the window low', () => {
    const values = [1000, 1100, 950, 1200, 1050, 1150, 1080, 990, 1010, 1060, 1120, 1100];
    const est = estimateCoreDeposits(oneSeries(balanceSeries(values)), { method: 'MinimumBalance' });
    expect(est.coreAmount).toBe(950);
    expect(est.currentBalance).toBe(1100);
    expect(est.coreShare).toBeCloseTo(950 / 1100, 12);
    expect(est.volatileShare + est.coreShare).toBeCloseTo(1, 12);
  });

  it('volatility method sets core at mean − z·σ', () => {
    const z = gaussian(rng(5));
    const values = Array.from({ length: 24 }, () => 1000 + 50 * z());
    const est = estimateCoreDeposits(oneSeries(balanceSeries(values)), {
      method: 'Volatility',
      windowMonths: 24,
      confidence: 0.99,
    });
    const m = values.reduce((s, v) => s + v, 0) / 24;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / 23);
    expect(est.parameters.z).toBeCloseTo(2.326347874, 8);
    expect(est.coreAmount).toBeCloseTo(Math.min(values[23]!, m - 2.326347874 * sd), 6);
    expect(est.stability.coefficientOfVariation).toBeCloseTo(sd / m, 10);
    expect(est.stability.maxDrawdown).toBeGreaterThan(0);
  });
});

describe('decay and run-off', () => {
  it('recovers a known λ from the non-core balance (DecayFit)', () => {
    const s = oneSeries(balanceSeries(decayingDeposits(36, 0.08)));
    const d = estimateDecay(s, { method: 'DecayFit', coreAmount: 600 });
    expect(Math.abs(d.lambdaMonthly - 0.08)).toBeLessThan(0.005);
    expect(d.lambdaCi![0]).toBeLessThan(0.08);
    expect(d.lambdaCi![1]).toBeGreaterThan(0.08);
    expect(d.halfLifeMonths!).toBeCloseTo(Math.LN2 / d.lambdaMonthly, 12);
  });

  it('recovers core and λ jointly (FloorFit)', () => {
    const s = oneSeries(balanceSeries(decayingDeposits(48, 0.1, 9)));
    const d = estimateDecay(s, { method: 'FloorFit' });
    expect(Math.abs(d.lambdaMonthly - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(d.coreAmount - 600)).toBeLessThan(10);
  });

  it('refuses to fit decay to a growing book but allows the outflow-percentile method', () => {
    const z = gaussian(rng(13));
    const growing = Array.from({ length: 24 }, (_, t) => 1000 * Math.exp(0.01 * t + 0.02 * z()));
    const s = oneSeries(balanceSeries(growing));
    expect(() => estimateDecay(s, { method: 'DecayFit', coreAmount: 500 })).toThrow(ModelFitError);
    const d = estimateDecay(s, { method: 'OutflowPercentile', confidence: 0.95, coreAmount: 800 });
    expect(d.lambdaMonthly).toBeGreaterThan(0);
    expect(d.lambdaMonthly).toBeLessThan(0.1);
  });

  it('builds a run-off profile that drops straight into BehaviourPattern and computeDepositRunoff', () => {
    const profile = buildRunoffProfile({ currentBalance: 1000, coreAmount: 600 }, 0.08);
    const total = profile.buckets.reduce((s, b) => s + b.percent, 0);
    expect(total).toBeCloseTo(100, 10);
    const vol = profile.buckets.filter((b) => b.type === 'Volatile').reduce((s, b) => s + b.amount, 0);
    expect(vol).toBeCloseTo(400, 8);
    // 1M bucket: 1 − e^(−0.08 · 30/30.4375) of the volatile 40%.
    const first = profile.buckets.find((b) => b.tenorDays === 30 && b.type === 'Volatile')!;
    expect(first.percent).toBeCloseTo(40 * (1 - Math.exp((-0.08 * 30) / (365.25 / 12))), 8);
    // Core never runs off inside one year under the default policy.
    expect(profile.buckets.filter((b) => b.type === 'Core' && b.tenorDays <= 365)).toHaveLength(0);

    const pattern = toBehaviourPattern(profile, {
      id: 'BP-FIT-SAV',
      name: 'Fitted - savings',
      appliesTo: ['Non-Core'],
    });
    expect(() => validateBehaviourPattern(pattern)).not.toThrow();
    expect(pattern.tiers.reduce((s, t) => s + t.percent, 0)).toBeCloseTo(100, 8);

    const deposit = {
      id: 'D-1',
      category: 'Liability',
      behaviouralTag: 'Non-Core',
      amount: 1000,
      productClass: 'Savings',
      turnover: null,
    } as unknown as Position;
    const runoff = computeDepositRunoff([deposit], [pattern]);
    expect(runoff.corePercent!).toBeCloseTo(60, 1);
  });
});

describe('repricing beta', () => {
  function policyAndDeposits(beta: number, lag: number, months = 48, seed = 21) {
    const next = rng(seed);
    const z = gaussian(next);
    const policy: IndicatorObservation[] = [];
    let p = 18;
    for (let i = -6; i < months; i += 1) {
      const u = next();
      p += u < 0.2 ? -0.5 : u > 0.8 ? 0.5 : 0;
      policy.push({ asOfDate: monthEnd(i), value: p });
    }
    const polAt = (i: number) => policy[i + 6]!.value;
    const rates: number[] = [];
    let r = 6;
    for (let i = 0; i < months; i += 1) {
      if (i > 0) r += beta * (polAt(i - lag) - polAt(i - lag - 1)) + 0.02 * z();
      rates.push(r);
    }
    return { policy, rates };
  }

  it('recovers a known beta and lag', () => {
    const { policy, rates } = policyAndDeposits(0.4, 2);
    const s = oneSeries(balanceSeries(new Array(48).fill(1000), {}, rates));
    const est = estimateRepricingBeta(s, policy, { maxLagMonths: 4 });
    expect(est.lagMonths).toBe(2);
    expect(Math.abs(est.beta - 0.4)).toBeLessThan(0.03);
    expect(est.ciLower).toBeLessThan(0.4);
    expect(est.ciUpper).toBeGreaterThan(0.4);
    expect(est.rSquared).toBeGreaterThan(0.8);
    expect(est.lagSearch).toHaveLength(5);
  });

  it('accepts an EconomicIndicator record and maps into the DEFAULT_BETAS shape', () => {
    const { policy, rates } = policyAndDeposits(0.6, 0);
    const indicator = {
      id: 'EI-MPR',
      code: 'MPR',
      name: 'Monetary policy rate',
      countryCode: 'NG',
      frequency: 'Monthly' as const,
      valueType: 'Percentage' as const,
      unit: '%',
      observations: policy,
      isActive: true,
      updatedBy: 'test',
      updatedAt: '2026-01-01',
    };
    const est = estimateRepricingBeta(oneSeries(balanceSeries(new Array(48).fill(1), {}, rates)), indicator);
    expect(Math.abs(est.beta - 0.6)).toBeLessThan(0.03);
    const betas = toDepositBetas([{ behaviouralTag: 'Non-Core', beta: est.beta }]);
    expect(betas).toHaveLength(DEFAULT_BETAS.length);
    expect(betas.find((b) => b.behaviouralTag === 'Non-Core')!.beta).toBeCloseTo(est.beta, 12);
    expect(betas.find((b) => b.behaviouralTag === 'Core')!.beta).toBe(0.35);
    expect(toDepositBetas([{ behaviouralTag: 'Core', beta: 1.3 }])[0]!.beta).toBe(1);
  });

  it('cannot identify a beta when the policy rate never moved', () => {
    const flat = Array.from({ length: 24 }, (_, i) => ({ asOfDate: monthEnd(i), value: 10 }));
    const s = oneSeries(
      balanceSeries(
        new Array(24).fill(1),
        {},
        Array.from({ length: 24 }, (_, i) => 5 + i * 0.01),
      ),
    );
    expect(() => estimateRepricingBeta(s, flat)).toThrow(ModelFitError);
  });
});

describe('prepayment', () => {
  /** Level-principal 60-month loans; each month a loan pays off fully with probability `full`, else curtails `partial`. */
  function loanBook(nLoans: number, months: number, full: number, partial: number, seed = 31): AccountObservation[] {
    const next = rng(seed);
    const out: AccountObservation[] = [];
    for (let a = 0; a < nLoans; a += 1) {
      const orig = 5000 + next() * 10000;
      const principal = orig / 60;
      let bal = orig;
      out.push({
        affiliateCode: 'NG',
        accountNumber: `L${a}`,
        asOfDate: monthEnd(0),
        productCode: 'MORT',
        currency: 'NGN',
        balance: bal,
        maturityDate: monthEnd(60),
      });
      for (let m = 1; m < months; m += 1) {
        if (next() < full) break; // paid off - vanishes from later snapshots
        const scheduled = Math.max(0, bal - principal);
        bal = scheduled * (1 - partial);
        out.push({
          affiliateCode: 'NG',
          accountNumber: `L${a}`,
          asOfDate: monthEnd(m),
          productCode: 'MORT',
          currency: 'NGN',
          balance: bal,
          scheduledBalance: scheduled,
          maturityDate: monthEnd(60),
        });
      }
    }
    return out;
  }

  it('recovers a known CPR from account snapshots', () => {
    const accounts = loanBook(1000, 24, 0.006, 0.004);
    const [est] = estimatePrepayment(accounts);
    const trueSmm = 0.006 + 0.994 * 0.004;
    expect(Math.abs(est!.cpr - smmToCpr(trueSmm))).toBeLessThan(0.015);
    expect(est!.cprCi[0]).toBeLessThan(est!.cpr);
    expect(est!.cprCi[1]).toBeGreaterThan(est!.cpr);
    expect(est!.monthly).toHaveLength(23);
  });

  it('maps CPRs onto PrepaymentRule assumptions that computePrepayment consumes', () => {
    const [est] = estimatePrepayment(loanBook(300, 14, 0.01, 0));
    const { assumptions, unmapped } = toPrepaymentAssumptions([est!], { MORT: 'CCOA-MORTGAGE' });
    expect(unmapped).toEqual([]);
    expect(assumptions).toEqual([{ commonCoaCode: 'CCOA-MORTGAGE', method: 'ConstantRate', cpr: expect.any(Number) }]);
    const loan = {
      id: 'L',
      category: 'Asset',
      isOffBalanceSheet: false,
      commonCoaCode: 'CCOA-MORTGAGE',
      amount: 1000,
      productClass: 'Mortgage',
    } as unknown as Position;
    const result = computePrepayment([loan], assumptions);
    expect(result.totalProjectedPayoff).toBeCloseTo(1000 * assumptions[0]!.cpr, 8);
    expect(toPrepaymentAssumptions([est!], {}).unmapped).toEqual(['MORT']);
  });

  it('needs at least 12 snapshots', () => {
    expect(() => estimatePrepayment(loanBook(50, 6, 0.01, 0))).toThrow(InsufficientHistoryError);
  });
});

describe('term deposits', () => {
  it('measures renewal and early-withdrawal rates, inferring outcomes when flags are absent', () => {
    // 200 deposits opened Jan, maturing 30 Jun. i%5==0 → withdrawn early (Apr);
    // of the rest, residues {1,2,3,4,6,7} of 10 roll over → 6/8 = 75% renewal.
    const accounts: AccountObservation[] = [];
    const dates = [
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
      '2024-05-31',
      '2024-06-30',
      '2024-07-31',
      '2024-08-31',
      '2024-09-30',
    ];
    for (let i = 0; i < 200; i += 1) {
      const early = i % 5 === 0;
      const rolls = [1, 2, 3, 4, 6, 7].includes(i % 10);
      for (const d of dates) {
        if (early && d >= '2024-04-30') break;
        if (!early && !rolls && d > '2024-06-30') break;
        const after = d > '2024-06-30';
        accounts.push({
          affiliateCode: 'NG',
          accountNumber: `TD${i}`,
          asOfDate: d,
          productCode: 'TD3M',
          currency: 'NGN',
          balance: 1000,
          maturityDate: after ? '2024-12-31' : '2024-06-30',
          // Half the roll-overs carry an explicit flag, half must be inferred.
          ...(after && i % 2 === 0 ? { rolledOver: true } : {}),
        });
      }
    }
    const [est] = estimateTermDepositBehaviour(accounts, { periodFrom: '2024-01-01', periodTo: '2024-09-30' });
    expect(est!.maturingCount).toBe(160);
    expect(est!.renewalRate).toBeCloseTo(0.75, 12);
    expect(est!.exposedCount).toBe(200);
    expect(est!.earlyWithdrawalRate).toBeCloseTo(0.2, 12);
    expect(est!.earlyWithdrawalRateAnnualised!).toBeGreaterThan(0.2);
    expect(est!.undeterminedCount).toBe(0);
  });
});

describe('back-testing and calibration', () => {
  it('passes a correctly specified model and fails a misspecified one on the hold-out', () => {
    const s = oneSeries(balanceSeries(decayingDeposits(36, 0.08)));
    const good = backtest(decayWithFloorModel, s, { trainEnd: monthEnd(23) });
    expect(good.train.observations).toBe(24);
    expect(good.test.observations).toBe(12);
    expect(good.metrics.mape!).toBeLessThan(2);
    expect(good.passed).toBe(true);
    const bad = backtest(linearTrendModel, s, { trainEnd: monthEnd(23), tolerance: { metric: 'MAPE', threshold: 2 } });
    expect(bad.passed).toBe(false);
    expect(bad.metrics.bias).toBeLessThan(0); // a straight line keeps falling past the floor
  });

  it('produces a serialisable ModelRun for deposit run-off', () => {
    const s = oneSeries(balanceSeries(decayingDeposits(36, 0.08)));
    const run = calibrate({
      modelType: 'DepositRunoff',
      series: s,
      core: { method: 'MinimumBalance', windowMonths: 36 },
      decay: { method: 'FloorFit' },
      pattern: { id: 'BP-FIT', name: 'Fitted', appliesTo: ['Non-Core'] },
      backtest: { trainEnd: monthEnd(23) },
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(run.id).toBe('DepositRunoff:productCode=SAV|currency=NGN:2025-12:2026-10-17T00:00:00.000Z');
    expect(run.window).toEqual({ from: '2023-01', to: '2025-12', observations: 36 });
    expect(Math.abs((run.params.lambdaMonthly as number) - 0.08)).toBeLessThan(0.01);
    expect(run.confidenceIntervals.lambdaMonthly).toBeDefined();
    expect(run.backtest!.passed).toBe(true);
    expect(() => validateBehaviourPattern(run.outputs.behaviourPattern!)).not.toThrow();
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });

  it('calibrates and back-tests a repricing beta', () => {
    const next = rng(77);
    const z = gaussian(next);
    const policy: IndicatorObservation[] = [];
    let p = 12;
    for (let i = -3; i < 36; i += 1) {
      const u = next();
      p += u < 0.25 ? -0.5 : u > 0.75 ? 0.5 : 0;
      policy.push({ asOfDate: monthEnd(i), value: p });
    }
    const rates: number[] = [4];
    for (let i = 1; i < 36; i += 1)
      rates.push(rates[i - 1]! + 0.5 * (policy[i + 3]!.value - policy[i + 2]!.value) + 0.01 * z());
    const s = oneSeries(balanceSeries(new Array(36).fill(1), {}, rates));
    const run = calibrate({
      modelType: 'RepricingBeta',
      series: s,
      policy,
      behaviouralTag: 'Core',
      beta: { maxLagMonths: 2 },
      backtest: { trainEnd: monthEnd(23) },
      now: '2026-10-17T00:00:00.000Z',
    });
    expect(Math.abs((run.params.beta as number) - 0.5)).toBeLessThan(0.03);
    expect(run.params.lagMonths).toBe(0);
    expect(run.outputs.depositBeta).toEqual({ behaviouralTag: 'Core', beta: run.params.beta });
    expect(run.backtest!.test.observations).toBe(12);
    expect(run.backtest!.passed).toBe(true);
  });
});

describe('history CSV import', () => {
  it('parses balance history from the template header', () => {
    const csv = [
      BALANCE_HISTORY_TEMPLATE,
      'NG,2024-01-31,SAV,Retail,ngn,,"-1,250,000.50",3.5,120',
      'NG,2024-02-29,SAV,Retail,NGN,,1300000,,',
    ].join('\n');
    const r = importBalanceHistory(csv);
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toEqual({
      affiliateCode: 'NG',
      asOfDate: '2024-01-31',
      productCode: 'SAV',
      customerType: 'Retail',
      currency: 'NGN',
      balance: 1250000.5,
      ratePercent: 3.5,
      accountCount: 120,
    });
    expect(r.rows[1]!.ratePercent).toBeUndefined();
  });

  it('reports missing columns and drops bad rows with line-level errors', () => {
    expect(importBalanceHistory('asOfDate,balance\n2024-01-31,1').errors[0]!.message).toMatch(
      /productCode, currency, affiliateCode/,
    );
    const csv = [
      'asOfDate,productCode,currency,balance,extra',
      '2024-13-45,SAV,NGN,1',
      '2024-01-31,SAV,NGN,abc',
      '2024-01-31,,NGN,5',
      '2024-01-31,SAV,NGN,10',
      '2024-01-31,SAV,NGN,11',
    ].join('\n');
    const r = importBalanceHistory(csv, { defaultAffiliateCode: 'GH' });
    expect(r.ignoredColumns).toEqual(['extra']);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.affiliateCode).toBe('GH');
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 6]);
    expect(r.errors.find((e) => e.line === 6)!.message).toMatch(/Duplicate of line 5/);
  });

  it('parses account history with flags', () => {
    const csv = [
      ACCOUNT_HISTORY_TEMPLATE,
      'NG,TD1,2024-06-30,TD3M,NGN,1000,2024-06-30,,yes,no',
      'NG,TD2,2024-06-30,TD3M,NGN,1000,2024-06-30,,maybe,',
      'NG,TD3,2024-06-30,TD3M,NGN,1000,,,yes,yes',
    ].join('\n');
    const r = importAccountHistory(csv);
    expect(r.rows).toEqual([
      {
        affiliateCode: 'NG',
        accountNumber: 'TD1',
        asOfDate: '2024-06-30',
        productCode: 'TD3M',
        currency: 'NGN',
        balance: 1000,
        maturityDate: '2024-06-30',
        rolledOver: true,
        withdrawnEarly: false,
      },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});
