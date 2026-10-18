import { describe, it, expect } from 'vitest';
import {
  SingularMatrixError,
  StatsInputError,
  autocorrelation,
  bias,
  difference,
  erf,
  errorMetrics,
  fSurvival,
  fitDecayWithFloor,
  fitExponentialDecay,
  linearRegression,
  lnGamma,
  mae,
  mape,
  mean,
  movingAverage,
  normalCdf,
  normalQuantile,
  ols,
  percentile,
  predictOls,
  rmse,
  rollingStd,
  seasonalDecompose,
  standardDeviation,
  studentTCdf,
  studentTQuantile,
  variance,
} from './stats';

/** Deterministic PRNG (mulberry32) so synthetic data is reproducible. */
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
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

describe('distributions', () => {
  it('matches published values for the normal distribution', () => {
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 12);
    expect(normalCdf(0)).toBeCloseTo(0.5, 15);
    expect(normalCdf(-3)).toBeCloseTo(0.0013498980316301, 12);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 10);
    expect(normalQuantile(0.01)).toBeCloseTo(-2.326347874040841, 10);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232306167813, 9);
    expect(erf(1)).toBeCloseTo(0.8427007929497149, 13);
  });

  it('matches published Student t values', () => {
    expect(studentTQuantile(0.975, 3)).toBeCloseTo(3.182446305284263, 8);
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228138851986274, 8);
    expect(studentTQuantile(0.95, 1)).toBeCloseTo(6.313751514675043, 7);
    expect(studentTQuantile(0.025, 20)).toBeCloseTo(-2.085963447265837, 8);
    expect(studentTCdf(2, 5)).toBeCloseTo(0.9490302605850709, 10);
    expect(studentTCdf(0, 7)).toBeCloseTo(0.5, 15);
    // Large df converges to the normal.
    expect(studentTQuantile(0.975, 1e6)).toBeCloseTo(1.96, 2);
  });

  it('computes log-gamma and the F tail', () => {
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 12);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12);
    // F(1, d) is t² with d degrees of freedom.
    const t = 2.5;
    expect(fSurvival(t * t, 1, 8)).toBeCloseTo(2 * (1 - studentTCdf(t, 8)), 10);
  });

  it('rejects probabilities outside (0, 1)', () => {
    expect(() => studentTQuantile(1.2, 5)).toThrow(StatsInputError);
    expect(() => normalQuantile(-0.1)).toThrow(StatsInputError);
  });
});

describe('descriptive statistics', () => {
  it('computes mean, sample variance and percentiles', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7, 12);
    expect(standardDeviation([1, 1, 1])).toBe(0);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 25)).toBe(1.75);
    expect(percentile([5, 1, 3], 100)).toBe(5);
  });
});

describe('OLS regression', () => {
  // x = 1..5, y = 2,4,5,4,5 - computed by hand:
  // b = Sxy/Sxx = 6/10 = 0.6, a = 4 − 0.6·3 = 2.2, SSE = 2.4, SST = 6, R² = 0.6,
  // s² = 2.4/3 = 0.8, se(b) = √(0.8/10), se(a) = √(0.8·(1/5 + 9/10)).
  const x = [1, 2, 3, 4, 5];
  const y = [2, 4, 5, 4, 5];

  it('reproduces a hand-computed simple regression', () => {
    const r = linearRegression(x, y);
    expect(r.slope.estimate).toBeCloseTo(0.6, 12);
    expect(r.intercept.estimate).toBeCloseTo(2.2, 12);
    expect(r.ols.sse).toBeCloseTo(2.4, 12);
    expect(r.ols.sst).toBeCloseTo(6, 12);
    expect(r.rSquared).toBeCloseTo(0.6, 12);
    expect(r.ols.adjustedRSquared).toBeCloseTo(1 - 0.4 * (4 / 3), 12);
    expect(r.slope.standardError).toBeCloseTo(Math.sqrt(0.08), 12);
    expect(r.intercept.standardError).toBeCloseTo(Math.sqrt(0.88), 12);
    expect(r.slope.tStat).toBeCloseTo(0.6 / Math.sqrt(0.08), 10);
    expect(r.slope.pValue).toBeCloseTo(0.124, 3);
    const tCrit = 3.182446305284263;
    expect(r.slope.ciLower).toBeCloseTo(0.6 - tCrit * Math.sqrt(0.08), 8);
    expect(r.slope.ciUpper).toBeCloseTo(0.6 + tCrit * Math.sqrt(0.08), 8);
    expect(r.ols.residualStandardError).toBeCloseTo(Math.sqrt(0.8), 12);
    expect(r.ols.rmse).toBeCloseTo(Math.sqrt(2.4 / 5), 12);
    expect(r.ols.residuals.map((v) => Number(v.toFixed(10)))).toEqual([-0.8, 0.6, 1, -0.6, -0.2]);
    // F = t² for a single regressor.
    expect(r.ols.fStatistic).toBeCloseTo(r.slope.tStat ** 2, 10);
    expect(r.ols.fPValue).toBeCloseTo(r.slope.pValue, 10);
  });

  it('gives confidence and prediction intervals at a new point', () => {
    const r = linearRegression(x, y);
    const p = predictOls(r.ols, [6]);
    // leverage = 1/5 + (6 − 3)²/10 = 1.1
    expect(p.estimate).toBeCloseTo(5.8, 12);
    expect(p.standardErrorMean).toBeCloseTo(Math.sqrt(0.8 * 1.1), 12);
    const tCrit = 3.182446305284263;
    expect(p.upper - p.estimate).toBeCloseTo(tCrit * Math.sqrt(0.8 * 2.1), 8);
    expect(p.meanUpper - p.estimate).toBeCloseTo(tCrit * Math.sqrt(0.8 * 1.1), 8);
  });

  it('matches the normal-equations solution for a multiple regression', () => {
    const X = [
      [1, 2],
      [2, 1],
      [3, 4],
      [4, 3],
      [5, 6],
      [6, 4],
    ];
    const yy = [5.1, 4.9, 10.2, 9.8, 15.1, 12.9];
    const r = ols(X, yy, { names: ['a', 'b'] });
    // Solve (XᵀX)β = Xᵀy by Gaussian elimination as an independent check.
    const D = X.map((row) => [1, ...row]);
    const k = 3;
    const A = Array.from({ length: k }, (_, i) => [
      ...Array.from({ length: k }, (_, j) => D.reduce((s, row) => s + row[i]! * row[j]!, 0)),
      D.reduce((s, row, n) => s + row[i]! * yy[n]!, 0),
    ]);
    for (let c = 0; c < k; c += 1) {
      for (let rr = c + 1; rr < k; rr += 1) {
        const f = A[rr]![c]! / A[c]![c]!;
        for (let j = c; j <= k; j += 1) A[rr]![j]! -= f * A[c]![j]!;
      }
    }
    const beta = new Array<number>(k).fill(0);
    for (let i = k - 1; i >= 0; i -= 1) {
      let s = A[i]![k]!;
      for (let j = i + 1; j < k; j += 1) s -= A[i]![j]! * beta[j]!;
      beta[i] = s / A[i]![i]!;
    }
    r.coefficients.forEach((c, i) => expect(c.estimate).toBeCloseTo(beta[i]!, 10));
    expect(r.coefficients.map((c) => c.name)).toEqual(['(Intercept)', 'a', 'b']);
    expect(r.dfResidual).toBe(3);
  });

  it('recovers known coefficients from noisy synthetic data, with CIs covering the truth', () => {
    const next = rng(42);
    const z = gaussian(next);
    const X: number[][] = [];
    const yy: number[] = [];
    for (let i = 0; i < 500; i += 1) {
      const x1 = next() * 10;
      const x2 = next() * 5 - 2;
      X.push([x1, x2]);
      yy.push(1.5 + 2 * x1 - 3 * x2 + z() * 0.5);
    }
    const r = ols(X, yy);
    const [b0, b1, b2] = r.coefficients;
    expect(b0!.estimate).toBeCloseTo(1.5, 0);
    expect(b1!.estimate).toBeCloseTo(2, 1);
    expect(b2!.estimate).toBeCloseTo(-3, 1);
    for (const [c, truth] of [
      [b0!, 1.5],
      [b1!, 2],
      [b2!, -3],
    ] as const) {
      expect(c.ciLower).toBeLessThan(truth);
      expect(c.ciUpper).toBeGreaterThan(truth);
    }
    expect(r.residualStandardError).toBeCloseTo(0.5, 1);
    expect(r.rSquared).toBeGreaterThan(0.99);
  });

  it('rejects collinear regressors and under-determined systems', () => {
    expect(() =>
      ols(
        [
          [1, 2],
          [2, 4],
          [3, 6],
          [4, 8],
        ],
        [1, 2, 3, 4],
      ),
    ).toThrow(SingularMatrixError);
    expect(() => ols([[1], [2]], [1, 2])).toThrow(StatsInputError);
  });

  it('fits through the origin with an uncentred R²', () => {
    const r = ols([[1], [2], [3]], [2, 4, 6], { intercept: false });
    expect(r.coefficients[0]!.estimate).toBeCloseTo(2, 12);
    expect(r.rSquared).toBeCloseTo(1, 12);
  });
});

describe('exponential decay', () => {
  it('recovers a known λ and half-life under multiplicative noise', () => {
    const z = gaussian(rng(7));
    const t = Array.from({ length: 36 }, (_, i) => i);
    const b = t.map((ti) => 1000 * Math.exp(-0.05 * ti) * Math.exp(z() * 0.01));
    const fit = fitExponentialDecay(t, b);
    expect(fit.lambda).toBeCloseTo(0.05, 2);
    expect(fit.lambdaCiLower).toBeLessThan(0.05);
    expect(fit.lambdaCiUpper).toBeGreaterThan(0.05);
    expect(fit.halfLife!).toBeCloseTo(Math.LN2 / 0.05, 0);
    expect(fit.b0).toBeGreaterThan(980);
    expect(fit.b0).toBeLessThan(1020);
    expect(fit.rSquared).toBeGreaterThan(0.99);
  });

  it('is exact on noise-free data', () => {
    const t = [0, 1, 2, 3, 4];
    const fit = fitExponentialDecay(
      t,
      t.map((ti) => 500 * Math.exp(-0.2 * ti)),
    );
    expect(fit.lambda).toBeCloseTo(0.2, 12);
    expect(fit.b0).toBeCloseTo(500, 9);
  });

  it('rejects non-positive balances', () => {
    expect(() => fitExponentialDecay([0, 1, 2], [10, 0, 5])).toThrow(StatsInputError);
  });

  it('recovers core, B0 and λ for decay toward a floor', () => {
    const z = gaussian(rng(11));
    const t = Array.from({ length: 48 }, (_, i) => i);
    const b = t.map((ti) => 600 + 400 * Math.exp(-0.1 * ti) + z() * 2);
    const fit = fitDecayWithFloor(t, b);
    expect(Math.abs(fit.lambda - 0.1)).toBeLessThan(0.01);
    expect(Math.abs(fit.core - 600)).toBeLessThan(10);
    expect(Math.abs(fit.b0 - 1000)).toBeLessThan(10);
    expect(fit.confidenceIntervals).not.toBeNull();
    expect(fit.confidenceIntervals!.lambda[0]).toBeLessThan(0.1);
    expect(fit.confidenceIntervals!.lambda[1]).toBeGreaterThan(0.1);
    expect(fit.floorClamped).toBe(false);
  });
});

describe('time series', () => {
  it('computes trailing and centred moving averages', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(movingAverage([1, 2, 3, 4, 5], 3, true)).toEqual([null, 2, 3, 4, null]);
    const even = movingAverage([1, 2, 3, 4, 5, 6, 7, 8], 4, true);
    expect(even[2]).toBeCloseTo(3, 12); // ½·1 + 2 + 3 + 4 + ½·5 = 12, / 4
    expect(even[0]).toBeNull();
    expect(even[6]).toBeNull();
  });

  it('recovers additive seasonal indices exactly from a noise-free series', () => {
    const pattern = [5, -3, 1, -3];
    const x = Array.from({ length: 24 }, (_, i) => 100 + 2 * i + pattern[i % 4]!);
    const d = seasonalDecompose(x, 4, 'additive');
    d.seasonalIndices.forEach((v, i) => expect(v).toBeCloseTo(pattern[i]!, 10));
    d.residual.forEach((r) => {
      if (r !== null) expect(r).toBeCloseTo(0, 10);
    });
    expect(d.trend[5]).toBeCloseTo(110, 10);
  });

  it('recovers multiplicative seasonal indices', () => {
    const pattern = [1.1, 0.9, 1.05, 0.95];
    const x = Array.from({ length: 24 }, (_, i) => 200 * pattern[i % 4]!);
    const d = seasonalDecompose(x, 4, 'multiplicative');
    d.seasonalIndices.forEach((v, i) => expect(v).toBeCloseTo(pattern[i]!, 10));
    expect(mean(d.seasonalIndices)).toBeCloseTo(1, 12);
  });

  it('needs two full cycles', () => {
    expect(() => seasonalDecompose([1, 2, 3, 4, 5], 4)).toThrow(StatsInputError);
  });

  it('differences, autocorrelation and rolling std', () => {
    expect(difference([1, 4, 9, 16])).toEqual([3, 5, 7]);
    expect(difference([1, 4, 9, 16], 2)).toEqual([8, 12]);
    const alt = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const acf = autocorrelation(alt, 2);
    expect(acf[0]).toBe(1);
    expect(acf[1]).toBeCloseTo(-19 / 20, 12);
    expect(acf[2]).toBeCloseTo(18 / 20, 12);
    const rs = rollingStd([1, 2, 3, 4], 3);
    expect(rs[0]).toBeNull();
    expect(rs[2]).toBeCloseTo(1, 12);
    expect(rs[3]).toBeCloseTo(1, 12);
  });
});

describe('error metrics', () => {
  it('computes MAE, RMSE, MAPE and bias', () => {
    const actual = [100, 200];
    const predicted = [110, 190];
    expect(mae(actual, predicted)).toBe(10);
    expect(rmse(actual, predicted)).toBe(10);
    expect(mape(actual, predicted)).toBeCloseTo(7.5, 12);
    expect(bias(actual, predicted)).toBe(0);
    expect(bias([1, 1], [2, 2])).toBe(1);
    expect(mape([0, 0], [1, 2])).toBeNull();
    const m = errorMetrics(actual, predicted);
    expect(m).toMatchObject({ n: 2, mae: 10, rmse: 10, bias: 0 });
    expect(m.mape).toBeCloseTo(7.5, 12);
  });
});
