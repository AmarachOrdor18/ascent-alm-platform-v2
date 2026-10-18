/**
 * Native statistics for behavioural modelling - regression, curve fitting,
 * time-series decomposition and error metrics, in plain TypeScript.
 *
 * Every function here is pure and deterministic. Regression is solved by
 * Householder QR on the design matrix rather than by inverting XᵀX directly,
 * which keeps the solution stable when regressors are nearly collinear. The
 * distribution functions (Student t, F, normal) are computed from the
 * regularised incomplete beta / gamma functions, not from lookup tables.
 */

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export class StatsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatsInputError';
  }
}

/** Raised when the design matrix is rank-deficient - two regressors carry the same information. */
export class SingularMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Descriptive statistics
// ─────────────────────────────────────────────────────────────────────────

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new StatsInputError('mean of an empty series is undefined');
  return sum(values) / values.length;
}

/** Sample variance (n − 1 denominator). */
export function variance(values: readonly number[]): number {
  if (values.length < 2) throw new StatsInputError('variance needs at least 2 observations');
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) ** 2;
  return ss / (values.length - 1);
}

/** Sample standard deviation (n − 1 denominator). */
export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

/**
 * Percentile by linear interpolation between closest ranks (Excel PERCENTILE.INC / numpy default).
 * `p` is on a 0–100 scale.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new StatsInputError('percentile of an empty series is undefined');
  if (p < 0 || p > 100) throw new StatsInputError(`percentile ${p} is outside 0–100`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const frac = rank - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

// ─────────────────────────────────────────────────────────────────────────
// Special functions and distributions
// ─────────────────────────────────────────────────────────────────────────

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Natural log of the gamma function (Lanczos approximation, g = 7). */
export function lnGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula keeps accuracy for small arguments.
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += LANCZOS[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITER = 500;
  const EPS = 1e-15;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(a, b, x)) / a;
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Regularised lower incomplete gamma function P(a, x). */
export function regularizedLowerGamma(a: number, x: number): number {
  if (x <= 0) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    // Series representation.
    let ap = a;
    let del = 1 / a;
    let s = del;
    for (let n = 0; n < 1000; n += 1) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-16) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
  return 1 - regularizedUpperGammaCf(a, x, gln);
}

function regularizedUpperGammaCf(a: number, x: number, gln: number): number {
  const TINY = 1e-300;
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Error function, accurate to ~1e-15 via the incomplete gamma function. */
export function erf(x: number): number {
  if (x === 0) return 0;
  const v = regularizedLowerGamma(0.5, x * x);
  return x > 0 ? v : -v;
}

/** Standard normal cumulative distribution function Φ(x). */
export function normalCdf(x: number, mu = 0, sigma = 1): number {
  if (sigma <= 0) throw new StatsInputError('sigma must be positive');
  const z = (x - mu) / sigma;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Standard normal probability density. */
export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Inverse standard normal CDF - Acklam's rational approximation, polished with one Halley step. */
export function normalQuantile(p: number, mu = 0, sigma = 1): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new StatsInputError(`probability ${p} is outside (0, 1)`);
  }
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  // Halley refinement against the high-precision CDF.
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  x -= u / (1 + (x * u) / 2);
  return mu + sigma * x;
}

/** Student t cumulative distribution function with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (!(df > 0)) throw new StatsInputError('degrees of freedom must be positive');
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Inverse Student t CDF, by bracketed bisection on the exact CDF. */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) throw new StatsInputError(`probability ${p} is outside (0, 1)`);
  if (!(df > 0)) throw new StatsInputError('degrees of freedom must be positive');
  if (p === 0.5) return 0;
  if (df > 1e7) return normalQuantile(p);
  // The t distribution is wider than the normal, so the normal quantile bounds the root from one side.
  const z = normalQuantile(p);
  let lo = p < 0.5 ? z * 2 - 1 : z;
  let hi = p < 0.5 ? z : z * 2 + 1;
  while (studentTCdf(lo, df) > p) lo *= 2;
  while (studentTCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

/** Two-sided p-value for a t statistic. */
export function twoSidedTPValue(t: number, df: number): number {
  return 2 * (1 - studentTCdf(Math.abs(t), df));
}

/** Upper-tail probability of an F(d1, d2) statistic. */
export function fSurvival(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1;
  return regularizedIncompleteBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

// ─────────────────────────────────────────────────────────────────────────
// Linear algebra - Householder QR least squares
// ─────────────────────────────────────────────────────────────────────────

interface QrLeastSquares {
  beta: number[];
  /** (XᵀX)⁻¹, recovered as R⁻¹R⁻ᵀ without forming XᵀX. */
  xtxInverse: number[][];
}

function qrLeastSquares(
  X: readonly (readonly number[])[],
  y: readonly number[],
  names: readonly string[],
): QrLeastSquares {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const A = X.map((row) => [...row]);
  const b = [...y];

  // Column scale for the rank tolerance.
  const colNorms = Array.from({ length: k }, (_, j) => Math.sqrt(A.reduce((s, row) => s + row[j]! ** 2, 0)));

  for (let j = 0; j < k; j += 1) {
    let norm = 0;
    for (let i = j; i < n; i += 1) norm += A[i]![j]! ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[j]![j]! > 0 ? -norm : norm;
    const v: number[] = [];
    for (let i = j; i < n; i += 1) v.push(A[i]![j]!);
    v[0]! -= alpha;
    const vNorm2 = v.reduce((s, x) => s + x * x, 0);
    if (vNorm2 === 0) continue;
    for (let c = j; c < k; c += 1) {
      let s = 0;
      for (let i = 0; i < v.length; i += 1) s += v[i]! * A[j + i]![c]!;
      const f = (2 * s) / vNorm2;
      for (let i = 0; i < v.length; i += 1) A[j + i]![c]! -= f * v[i]!;
    }
    let s = 0;
    for (let i = 0; i < v.length; i += 1) s += v[i]! * b[j + i]!;
    const f = (2 * s) / vNorm2;
    for (let i = 0; i < v.length; i += 1) b[j + i]! -= f * v[i]!;
  }

  for (let j = 0; j < k; j += 1) {
    const scale = colNorms[j]! || 1;
    if (Math.abs(A[j]![j]!) <= 1e-10 * scale) {
      throw new SingularMatrixError(
        `Regressor "${names[j] ?? j}" is a linear combination of the others (or constant zero) - the design matrix is rank-deficient`,
      );
    }
  }

  // Back-substitution R β = Qᵀy.
  const beta = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i -= 1) {
    let s = b[i]!;
    for (let j = i + 1; j < k; j += 1) s -= A[i]![j]! * beta[j]!;
    beta[i] = s / A[i]![i]!;
  }

  // R⁻¹ (upper triangular).
  const rInv: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = k - 1; i >= 0; i -= 1) {
    rInv[i]![i] = 1 / A[i]![i]!;
    for (let j = i + 1; j < k; j += 1) {
      let s = 0;
      for (let m = i + 1; m <= j; m += 1) s += A[i]![m]! * rInv[m]![j]!;
      rInv[i]![j] = -s / A[i]![i]!;
    }
  }
  const xtxInverse: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      let s = 0;
      for (let m = Math.max(i, j); m < k; m += 1) s += rInv[i]![m]! * rInv[j]![m]!;
      xtxInverse[i]![j] = s;
    }
  }
  return { beta, xtxInverse };
}

// ─────────────────────────────────────────────────────────────────────────
// OLS regression
// ─────────────────────────────────────────────────────────────────────────

export interface RegressionCoefficient {
  name: string;
  estimate: number;
  standardError: number;
  tStat: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
}

export interface OlsResult {
  coefficients: RegressionCoefficient[];
  /** Observations used. */
  n: number;
  /** Estimated parameters, including the intercept when present. */
  p: number;
  dfResidual: number;
  hasIntercept: boolean;
  /** Confidence level used for coefficient intervals, e.g. 0.95. */
  level: number;
  rSquared: number;
  adjustedRSquared: number;
  /** √(SSE / n) - the in-sample root mean squared error. */
  rmse: number;
  /** √(SSE / (n − p)) - the unbiased residual standard error, used for inference. */
  residualStandardError: number;
  sse: number;
  sst: number;
  fStatistic: number | null;
  fPValue: number | null;
  fitted: number[];
  residuals: number[];
  /** Unscaled covariance (XᵀX)⁻¹; multiply by residualStandardError² for Var(β̂). */
  xtxInverse: number[][];
}

export interface OlsOptions {
  /** Prepend a column of ones. Default true. */
  intercept?: boolean;
  /** Names for the regressor columns (excluding the intercept). */
  names?: string[];
  /** Confidence level for coefficient intervals. Default 0.95. */
  level?: number;
}

/**
 * Ordinary least squares multiple regression, y = Xβ + ε.
 *
 * `X` holds one row per observation and one column per regressor. Inference
 * assumes homoskedastic, uncorrelated errors - the classical OLS assumptions.
 */
export function ols(X: readonly (readonly number[])[], y: readonly number[], options: OlsOptions = {}): OlsResult {
  const hasIntercept = options.intercept ?? true;
  const level = options.level ?? 0.95;
  if (!(level > 0 && level < 1)) throw new StatsInputError('confidence level must be in (0, 1)');
  const n = y.length;
  if (X.length !== n) throw new StatsInputError(`X has ${X.length} rows but y has ${n} observations`);
  const width = X[0]?.length ?? 0;
  if (X.some((row) => row.length !== width))
    throw new StatsInputError('every row of X must have the same number of columns');
  if ([...y, ...X.flat()].some((v) => !Number.isFinite(v)))
    throw new StatsInputError('regression inputs contain non-finite values');

  const design = hasIntercept ? X.map((row) => [1, ...row]) : X.map((row) => [...row]);
  const p = design[0]?.length ?? (hasIntercept ? 1 : 0);
  if (p === 0) throw new StatsInputError('regression needs at least one regressor or an intercept');
  const dfResidual = n - p;
  if (dfResidual < 1) {
    throw new StatsInputError(`regression needs more observations (${n}) than parameters (${p})`);
  }

  const names = [
    ...(hasIntercept ? ['(Intercept)'] : []),
    ...Array.from({ length: width }, (_, j) => options.names?.[j] ?? `x${j + 1}`),
  ];
  const { beta, xtxInverse } = qrLeastSquares(design, y, names);

  const fitted = design.map((row) => row.reduce((s, v, j) => s + v * beta[j]!, 0));
  const residuals = y.map((v, i) => v - fitted[i]!);
  const sse = residuals.reduce((s, r) => s + r * r, 0);
  const yBar = mean(y);
  // Without an intercept the null model is ŷ = 0, so R² is uncentred.
  const sst = hasIntercept ? y.reduce((s, v) => s + (v - yBar) ** 2, 0) : y.reduce((s, v) => s + v * v, 0);
  const rSquared = sst > 0 ? 1 - sse / sst : 1;
  const dfModel = hasIntercept ? p - 1 : p;
  const dfTotal = hasIntercept ? n - 1 : n;
  const adjustedRSquared = 1 - (1 - rSquared) * (dfTotal / dfResidual);
  const s2 = sse / dfResidual;
  const residualStandardError = Math.sqrt(s2);
  const tCrit = studentTQuantile(1 - (1 - level) / 2, dfResidual);

  const coefficients: RegressionCoefficient[] = beta.map((estimate, j) => {
    const standardError = Math.sqrt(Math.max(0, s2 * xtxInverse[j]![j]!));
    const tStat = standardError > 0 ? estimate / standardError : estimate === 0 ? 0 : Infinity * Math.sign(estimate);
    return {
      name: names[j]!,
      estimate,
      standardError,
      tStat,
      pValue: standardError > 0 ? twoSidedTPValue(tStat, dfResidual) : 0,
      ciLower: estimate - tCrit * standardError,
      ciUpper: estimate + tCrit * standardError,
    };
  });

  let fStatistic: number | null = null;
  let fPValue: number | null = null;
  if (dfModel > 0 && sse > 0) {
    fStatistic = (sst - sse) / dfModel / s2;
    fPValue = fSurvival(fStatistic, dfModel, dfResidual);
  }

  return {
    coefficients,
    n,
    p,
    dfResidual,
    hasIntercept,
    level,
    rSquared,
    adjustedRSquared,
    rmse: Math.sqrt(sse / n),
    residualStandardError,
    sse,
    sst,
    fStatistic,
    fPValue,
    fitted,
    residuals,
    xtxInverse,
  };
}

export interface RegressionPrediction {
  estimate: number;
  /** Standard error of the fitted mean at x. */
  standardErrorMean: number;
  /** Confidence interval for the mean response. */
  meanLower: number;
  meanUpper: number;
  /** Prediction interval for a new observation - wider, since it includes the residual noise. */
  lower: number;
  upper: number;
  level: number;
}

/** Predict at a new regressor vector (excluding the intercept term), with confidence and prediction intervals. */
export function predictOls(result: OlsResult, x: readonly number[], level = result.level): RegressionPrediction {
  const row = result.hasIntercept ? [1, ...x] : [...x];
  if (row.length !== result.p)
    throw new StatsInputError(`prediction needs ${result.p - (result.hasIntercept ? 1 : 0)} regressor values`);
  const estimate = row.reduce((s, v, j) => s + v * result.coefficients[j]!.estimate, 0);
  let leverage = 0;
  for (let i = 0; i < row.length; i += 1) {
    for (let j = 0; j < row.length; j += 1) leverage += row[i]! * result.xtxInverse[i]![j]! * row[j]!;
  }
  const s2 = result.residualStandardError ** 2;
  const standardErrorMean = Math.sqrt(Math.max(0, s2 * leverage));
  const sePred = Math.sqrt(Math.max(0, s2 * (1 + leverage)));
  const tCrit = studentTQuantile(1 - (1 - level) / 2, result.dfResidual);
  return {
    estimate,
    standardErrorMean,
    meanLower: estimate - tCrit * standardErrorMean,
    meanUpper: estimate + tCrit * standardErrorMean,
    lower: estimate - tCrit * sePred,
    upper: estimate + tCrit * sePred,
    level,
  };
}

export interface SimpleRegressionResult {
  slope: RegressionCoefficient;
  intercept: RegressionCoefficient;
  rSquared: number;
  ols: OlsResult;
}

/** y = a + b·x, a convenience wrapper over `ols`. */
export function linearRegression(x: readonly number[], y: readonly number[], level = 0.95): SimpleRegressionResult {
  const result = ols(
    x.map((v) => [v]),
    y,
    { names: ['x'], level },
  );
  return { intercept: result.coefficients[0]!, slope: result.coefficients[1]!, rSquared: result.rSquared, ols: result };
}

// ─────────────────────────────────────────────────────────────────────────
// Curve fitting - exponential decay
// ─────────────────────────────────────────────────────────────────────────

export interface ExponentialDecayFit {
  /** Fitted balance at t = 0. */
  b0: number;
  /** Decay rate per unit of t. */
  lambda: number;
  lambdaStandardError: number;
  lambdaCiLower: number;
  lambdaCiUpper: number;
  /** ln 2 / λ, in units of t. Null when the series is not decaying (λ ≤ 0). */
  halfLife: number | null;
  level: number;
  n: number;
  /** R² of the log-linear regression. */
  rSquaredLog: number;
  /** R² of the fitted curve in balance (not log) space. */
  rSquared: number;
  rmse: number;
  mape: number | null;
  fitted: number[];
  pValue: number;
}

/**
 * B(t) = B0·e^(−λt), fitted by OLS on ln B(t) = ln B0 − λt.
 *
 * The confidence interval on λ is exact under multiplicative log-normal noise,
 * which is the natural error model for balances that shrink proportionally.
 */
export function fitExponentialDecay(
  t: readonly number[],
  balances: readonly number[],
  level = 0.95,
): ExponentialDecayFit {
  if (t.length !== balances.length) throw new StatsInputError('t and balances must be the same length');
  if (balances.length < 3) throw new StatsInputError('exponential decay fit needs at least 3 observations');
  if (balances.some((b) => !(b > 0)))
    throw new StatsInputError('exponential decay fit needs strictly positive balances');
  const reg = linearRegression(
    t,
    balances.map((b) => Math.log(b)),
    level,
  );
  const lambda = -reg.slope.estimate;
  const b0 = Math.exp(reg.intercept.estimate);
  const fitted = t.map((ti) => b0 * Math.exp(-lambda * ti));
  const fit = curveFitStats(balances, fitted);
  return {
    b0,
    lambda,
    lambdaStandardError: reg.slope.standardError,
    lambdaCiLower: -reg.slope.ciUpper,
    lambdaCiUpper: -reg.slope.ciLower,
    halfLife: lambda > 0 ? Math.LN2 / lambda : null,
    level,
    n: balances.length,
    rSquaredLog: reg.rSquared,
    rSquared: fit.rSquared,
    rmse: fit.rmse,
    mape: fit.mape,
    fitted,
    pValue: reg.slope.pValue,
  };
}

export interface DecayWithFloorFit {
  /** Asymptotic floor - the balance that does not run off. */
  core: number;
  b0: number;
  lambda: number;
  halfLife: number | null;
  /** Standard errors from the Gauss–Newton covariance at the optimum. Null when it cannot be estimated. */
  standardErrors: { core: number; b0: number; lambda: number } | null;
  confidenceIntervals: { core: [number, number]; b0: [number, number]; lambda: [number, number] } | null;
  level: number;
  n: number;
  sse: number;
  rSquared: number;
  rmse: number;
  mape: number | null;
  fitted: number[];
  /** True when the unconstrained optimum put the floor below zero and it was clamped. */
  floorClamped: boolean;
}

export interface DecayWithFloorOptions {
  level?: number;
  /** Search range for λ, per unit of t. Defaults to 1e-4 .. 5. */
  lambdaMin?: number;
  lambdaMax?: number;
  gridSteps?: number;
}

/**
 * B(t) = core + (B0 − core)·e^(−λt), fitted by least squares.
 *
 * For a fixed λ the model is linear in (core, B0 − core), so each λ is solved
 * exactly by OLS; λ itself is located by a log-spaced grid search refined with
 * golden-section search. Standard errors come from the Jacobian at the optimum.
 */
export function fitDecayWithFloor(
  t: readonly number[],
  balances: readonly number[],
  options: DecayWithFloorOptions = {},
): DecayWithFloorFit {
  const level = options.level ?? 0.95;
  const lambdaMin = options.lambdaMin ?? 1e-4;
  const lambdaMax = options.lambdaMax ?? 5;
  const gridSteps = options.gridSteps ?? 200;
  if (t.length !== balances.length) throw new StatsInputError('t and balances must be the same length');
  if (balances.length < 4) throw new StatsInputError('decay-with-floor fit needs at least 4 observations');

  const solveAt = (lambda: number) => {
    const e = t.map((ti) => Math.exp(-lambda * ti));
    // b = core + c·e, solved in closed form (2-parameter OLS).
    const eBar = mean(e);
    const bBar = mean(balances);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < e.length; i += 1) {
      sxy += (e[i]! - eBar) * (balances[i]! - bBar);
      sxx += (e[i]! - eBar) ** 2;
    }
    let c = sxx > 0 ? sxy / sxx : 0;
    let core = bBar - c * eBar;
    let clamped = false;
    if (core < 0) {
      // Floor cannot be negative: refit c through the origin.
      core = 0;
      const see = e.reduce((s, v) => s + v * v, 0);
      c = see > 0 ? e.reduce((s, v, i) => s + v * balances[i]!, 0) / see : 0;
      clamped = true;
    }
    const sse = balances.reduce((s, b, i) => s + (b - core - c * e[i]!) ** 2, 0);
    return { core, c, sse, clamped };
  };

  const logMin = Math.log(lambdaMin);
  const logMax = Math.log(lambdaMax);
  let bestIdx = 0;
  let bestSse = Infinity;
  const grid: number[] = [];
  for (let i = 0; i <= gridSteps; i += 1) {
    const lam = Math.exp(logMin + ((logMax - logMin) * i) / gridSteps);
    grid.push(lam);
    const { sse } = solveAt(lam);
    if (sse < bestSse) {
      bestSse = sse;
      bestIdx = i;
    }
  }
  // Golden-section refinement in log-λ between the neighbouring grid points.
  let a = Math.log(grid[Math.max(0, bestIdx - 1)]!);
  let b = Math.log(grid[Math.min(gridSteps, bestIdx + 1)]!);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = solveAt(Math.exp(x1)).sse;
  let f2 = solveAt(Math.exp(x2)).sse;
  for (let i = 0; i < 100 && b - a > 1e-12; i += 1) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - g * (b - a);
      f1 = solveAt(Math.exp(x1)).sse;
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (b - a);
      f2 = solveAt(Math.exp(x2)).sse;
    }
  }
  const lambda = Math.exp((a + b) / 2);
  const best = solveAt(lambda);
  const core = best.core;
  const b0 = core + best.c;
  const fitted = t.map((ti) => core + best.c * Math.exp(-lambda * ti));
  const fit = curveFitStats(balances, fitted);

  // Gauss–Newton covariance on (core, c, λ), then mapped to (core, B0 = core + c, λ).
  let standardErrors: DecayWithFloorFit['standardErrors'] = null;
  let confidenceIntervals: DecayWithFloorFit['confidenceIntervals'] = null;
  const df = balances.length - 3;
  if (df >= 1 && !best.clamped) {
    try {
      const J = t.map((ti) => {
        const e = Math.exp(-lambda * ti);
        return [1, e, -best.c * ti * e];
      });
      const cov = qrLeastSquares(J, balances, ['core', 'amplitude', 'lambda']).xtxInverse;
      const s2 = best.sse / df;
      const seCore = Math.sqrt(Math.max(0, s2 * cov[0]![0]!));
      const seLambda = Math.sqrt(Math.max(0, s2 * cov[2]![2]!));
      const varB0 = s2 * (cov[0]![0]! + cov[1]![1]! + 2 * cov[0]![1]!);
      const seB0 = Math.sqrt(Math.max(0, varB0));
      const tCrit = studentTQuantile(1 - (1 - level) / 2, df);
      standardErrors = { core: seCore, b0: seB0, lambda: seLambda };
      confidenceIntervals = {
        core: [core - tCrit * seCore, core + tCrit * seCore],
        b0: [b0 - tCrit * seB0, b0 + tCrit * seB0],
        lambda: [lambda - tCrit * seLambda, lambda + tCrit * seLambda],
      };
    } catch (err) {
      if (!(err instanceof SingularMatrixError)) throw err;
    }
  }

  return {
    core,
    b0,
    lambda,
    halfLife: lambda > 0 ? Math.LN2 / lambda : null,
    standardErrors,
    confidenceIntervals,
    level,
    n: balances.length,
    sse: best.sse,
    rSquared: fit.rSquared,
    rmse: fit.rmse,
    mape: fit.mape,
    fitted,
    floorClamped: best.clamped,
  };
}

function curveFitStats(
  actual: readonly number[],
  fitted: readonly number[],
): { rSquared: number; rmse: number; mape: number | null } {
  const yBar = mean(actual);
  const sse = actual.reduce((s, v, i) => s + (v - fitted[i]!) ** 2, 0);
  const sst = actual.reduce((s, v) => s + (v - yBar) ** 2, 0);
  return { rSquared: sst > 0 ? 1 - sse / sst : 1, rmse: Math.sqrt(sse / actual.length), mape: mape(actual, fitted) };
}

// ─────────────────────────────────────────────────────────────────────────
// Time series
// ─────────────────────────────────────────────────────────────────────────

/**
 * Simple moving average. Trailing by default (value at i averages i−window+1..i);
 * `centred` aligns the window on i, using a 2×window average for even windows
 * as classical decomposition does. Positions without a full window are null.
 */
export function movingAverage(values: readonly number[], window: number, centred = false): (number | null)[] {
  if (!Number.isInteger(window) || window < 1) throw new StatsInputError('window must be a positive integer');
  const n = values.length;
  const out: (number | null)[] = new Array<number | null>(n).fill(null);
  if (!centred) {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      s += values[i]!;
      if (i >= window) s -= values[i - window]!;
      if (i >= window - 1) out[i] = s / window;
    }
    return out;
  }
  if (window % 2 === 1) {
    const h = (window - 1) / 2;
    for (let i = h; i < n - h; i += 1) {
      let s = 0;
      for (let j = i - h; j <= i + h; j += 1) s += values[j]!;
      out[i] = s / window;
    }
    return out;
  }
  // Even window: weights ½, 1, …, 1, ½ over window + 1 points.
  const h = window / 2;
  for (let i = h; i < n - h; i += 1) {
    let s = 0.5 * values[i - h]! + 0.5 * values[i + h]!;
    for (let j = i - h + 1; j <= i + h - 1; j += 1) s += values[j]!;
    out[i] = s / window;
  }
  return out;
}

export type DecompositionModel = 'additive' | 'multiplicative';

export interface SeasonalDecomposition {
  model: DecompositionModel;
  period: number;
  trend: (number | null)[];
  seasonal: number[];
  residual: (number | null)[];
  /** One index per position in the cycle; additive indices sum to 0, multiplicative average 1. */
  seasonalIndices: number[];
}

/** Classical seasonal decomposition (centred-moving-average trend, averaged seasonal indices). */
export function seasonalDecompose(
  values: readonly number[],
  period: number,
  model: DecompositionModel = 'additive',
): SeasonalDecomposition {
  if (!Number.isInteger(period) || period < 2) throw new StatsInputError('period must be an integer ≥ 2');
  if (values.length < 2 * period) {
    throw new StatsInputError(
      `seasonal decomposition needs at least two full cycles (${2 * period} points), got ${values.length}`,
    );
  }
  if (model === 'multiplicative' && values.some((v) => !(v > 0))) {
    throw new StatsInputError('multiplicative decomposition needs strictly positive values');
  }
  const trend = movingAverage(values, period, true);
  const buckets: number[][] = Array.from({ length: period }, () => []);
  values.forEach((v, i) => {
    const tr = trend[i];
    if (tr === null || tr === undefined) return;
    buckets[i % period]!.push(model === 'additive' ? v - tr : v / tr);
  });
  let indices = buckets.map((bucket) => (bucket.length > 0 ? mean(bucket) : model === 'additive' ? 0 : 1));
  const centre = mean(indices);
  indices = indices.map((v) => (model === 'additive' ? v - centre : v / centre));
  const seasonal = values.map((_, i) => indices[i % period]!);
  const residual = values.map((v, i) => {
    const tr = trend[i];
    if (tr === null || tr === undefined) return null;
    return model === 'additive' ? v - tr - seasonal[i]! : v / (tr * seasonal[i]!);
  });
  return { model, period, trend, seasonal, residual, seasonalIndices: indices };
}

/** Lag-`lag` differences: out[i] = x[i + lag] − x[i]. */
export function difference(values: readonly number[], lag = 1): number[] {
  if (!Number.isInteger(lag) || lag < 1) throw new StatsInputError('lag must be a positive integer');
  const out: number[] = [];
  for (let i = lag; i < values.length; i += 1) out.push(values[i]! - values[i - lag]!);
  return out;
}

/** Sample autocorrelation function for lags 0..maxLag (biased estimator, as in Box–Jenkins). */
export function autocorrelation(values: readonly number[], maxLag: number): number[] {
  const n = values.length;
  if (n < 2) throw new StatsInputError('autocorrelation needs at least 2 observations');
  if (maxLag >= n) throw new StatsInputError('maxLag must be less than the series length');
  const m = mean(values);
  const c0 = values.reduce((s, v) => s + (v - m) ** 2, 0);
  const out: number[] = [];
  for (let k = 0; k <= maxLag; k += 1) {
    let ck = 0;
    for (let i = 0; i < n - k; i += 1) ck += (values[i]! - m) * (values[i + k]! - m);
    out.push(c0 > 0 ? ck / c0 : k === 0 ? 1 : 0);
  }
  return out;
}

/** Trailing rolling sample standard deviation; null until the window is full. */
export function rollingStd(values: readonly number[], window: number): (number | null)[] {
  if (!Number.isInteger(window) || window < 2) throw new StatsInputError('rolling std window must be an integer ≥ 2');
  return values.map((_, i) => (i < window - 1 ? null : standardDeviation(values.slice(i - window + 1, i + 1))));
}

// ─────────────────────────────────────────────────────────────────────────
// Error metrics
// ─────────────────────────────────────────────────────────────────────────

function checkPairs(actual: readonly number[], predicted: readonly number[]): void {
  if (actual.length !== predicted.length) throw new StatsInputError('actual and predicted must be the same length');
  if (actual.length === 0) throw new StatsInputError('error metrics need at least one observation');
}

export function mae(actual: readonly number[], predicted: readonly number[]): number {
  checkPairs(actual, predicted);
  return mean(actual.map((a, i) => Math.abs(predicted[i]! - a)));
}

export function rmse(actual: readonly number[], predicted: readonly number[]): number {
  checkPairs(actual, predicted);
  return Math.sqrt(mean(actual.map((a, i) => (predicted[i]! - a) ** 2)));
}

/** Mean absolute percentage error, in percent. Observations with a zero actual are skipped; null if none remain. */
export function mape(actual: readonly number[], predicted: readonly number[]): number | null {
  checkPairs(actual, predicted);
  const terms = actual.flatMap((a, i) => (a === 0 ? [] : [Math.abs((predicted[i]! - a) / a)]));
  return terms.length > 0 ? mean(terms) * 100 : null;
}

/** Mean signed error, predicted − actual. Positive means the model over-predicts. */
export function bias(actual: readonly number[], predicted: readonly number[]): number {
  checkPairs(actual, predicted);
  return mean(actual.map((a, i) => predicted[i]! - a));
}

export interface ErrorMetrics {
  n: number;
  mae: number;
  rmse: number;
  /** Percent; null when every actual is zero. */
  mape: number | null;
  bias: number;
}

export function errorMetrics(actual: readonly number[], predicted: readonly number[]): ErrorMetrics {
  return {
    n: actual.length,
    mae: mae(actual, predicted),
    rmse: rmse(actual, predicted),
    mape: mape(actual, predicted),
    bias: bias(actual, predicted),
  };
}
