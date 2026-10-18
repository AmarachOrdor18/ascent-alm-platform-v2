/**
 * Behavioural models fitted to uploaded history - core/non-core deposits,
 * decay and run-off, repricing betas, loan prepayment and term-deposit
 * rollover / early withdrawal - with back-testing and a serialisable
 * calibration record for a versioned model registry.
 *
 * All statistics come from ./stats (native TypeScript). Every estimator
 * refuses to produce output from too little history instead of falling
 * back to an assumption: a fitted number must always be a fitted number.
 *
 * Outputs are shaped to drop into the existing rule bodies:
 *   - toBehaviourPatterns()   → BehaviourPattern[]   (BehaviourPatternRule.patterns)
 *   - toDepositBetas()        → DepositBeta[]        (BehaviourPatternRule.betas)
 *   - toPrepaymentAssumptions() → PrepaymentAssumption[] (PrepaymentRule.assumptions,
 *                                 and a superset of behavioural.ts PrepaymentRule)
 */

import type { BehaviouralTag, EconomicIndicator, IndicatorObservation, IsoDate } from './types';
import type { PrepaymentAssumption } from './ruleTypes';
import {
  DEFAULT_BETAS,
  validateBehaviourPattern,
  type BehaviourPattern,
  type DepositBeta,
  type RunoffTier,
} from './behavioural';
import { daysBetween } from './dates';
import {
  errorMetrics,
  fitDecayWithFloor,
  fitExponentialDecay,
  linearRegression,
  mean,
  normalQuantile,
  ols,
  percentile,
  standardDeviation,
  studentTQuantile,
  type ErrorMetrics,
} from './stats';

// ─────────────────────────────────────────────────────────────────────────
// Input records
// ─────────────────────────────────────────────────────────────────────────

/** One aggregate balance observation - a product/segment balance at a date. */
export interface BalanceObservation {
  affiliateCode: string;
  asOfDate: IsoDate;
  productCode: string;
  customerType?: string;
  currency: string;
  tenorBand?: string;
  balance: number;
  /** Balance-weighted customer rate, in percent. */
  ratePercent?: number;
  accountCount?: number;
}

/** One account snapshot - repeated across dates to give account-level history. */
export interface AccountObservation {
  affiliateCode: string;
  accountNumber: string;
  asOfDate: IsoDate;
  productCode: string;
  currency: string;
  balance: number;
  maturityDate?: IsoDate;
  /** Contractual balance expected at this date with no prepayment - from the amortisation schedule. */
  scheduledBalance?: number;
  /** Term deposits: rolled over at its most recent maturity. */
  rolledOver?: boolean;
  /** Term deposits: closed before contractual maturity. */
  withdrawnEarly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export const MIN_MONTHLY_POINTS = 12;

/** Raised instead of producing a number from too little data. */
export class InsufficientHistoryError extends Error {
  constructor(
    public readonly context: string,
    public readonly required: number,
    public readonly actual: number,
    detail = '',
  ) {
    super(
      `${context}: insufficient history - ${actual} usable observation(s), at least ${required} required${detail ? `. ${detail}` : ''}`,
    );
    this.name = 'InsufficientHistoryError';
  }
}

/** Raised when the data is sufficient but the model cannot be fitted meaningfully. */
export class ModelFitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelFitError';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Months
// ─────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM'. */
export type MonthKey = string;

export const DAYS_PER_MONTH = 365.25 / 12;

export function monthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

function monthIndex(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

function monthFromIndex(index: number): MonthKey {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Segmentation
// ─────────────────────────────────────────────────────────────────────────

export type SegmentDimension = 'productCode' | 'customerType' | 'currency' | 'tenorBand' | 'affiliateCode';

export interface Segmentation {
  /** Dimensions to segment by, in key order. Empty = one segment for everything. */
  by: SegmentDimension[];
}

export type SegmentKey = Partial<Record<SegmentDimension, string>>;

export interface MonthlyPoint {
  month: MonthKey;
  /** The observation date used for the month - the latest date observed in it. */
  asOfDate: IsoDate;
  balance: number;
  /** Balance-weighted rate across the segment's rows on that date; null if no row carried a rate. */
  ratePercent: number | null;
  accountCount: number | null;
}

export interface SegmentSeries {
  segmentId: string;
  key: SegmentKey;
  currency: string;
  points: MonthlyPoint[];
  /** Calendar months between the first and last point with no observation - never interpolated. */
  missingMonths: MonthKey[];
}

const NONE = '(none)';

export function segmentIdOf(key: SegmentKey, by: readonly SegmentDimension[]): string {
  return by.length === 0 ? 'ALL' : by.map((d) => `${d}=${key[d] ?? NONE}`).join('|');
}

/**
 * Aggregate observations into one month-end series per segment.
 *
 * Within a month the latest observation date wins (month-end balance); rows
 * at that date are summed. A segment that mixes currencies is rejected -
 * summing NGN with USD is meaningless, so either add 'currency' to the
 * segmentation or convert to one currency before calling.
 */
export function segmentHistory(
  observations: readonly BalanceObservation[],
  segmentation: Segmentation,
): SegmentSeries[] {
  const by = segmentation.by;
  const groups = new Map<string, { key: SegmentKey; rows: BalanceObservation[] }>();
  for (const o of observations) {
    const key: SegmentKey = {};
    for (const d of by) key[d] = (o[d] ?? NONE) || NONE;
    const id = segmentIdOf(key, by);
    const g = groups.get(id) ?? { key, rows: [] };
    g.rows.push(o);
    groups.set(id, g);
  }

  const out: SegmentSeries[] = [];
  for (const [segmentId, { key, rows }] of groups) {
    const currencies = [...new Set(rows.map((r) => r.currency.toUpperCase()))];
    if (currencies.length > 1) {
      throw new ModelFitError(
        `Segment "${segmentId}" mixes currencies (${currencies.join(', ')}) - segment by currency or convert to one currency first`,
      );
    }
    const latestDateByMonth = new Map<MonthKey, IsoDate>();
    for (const r of rows) {
      const m = monthKey(r.asOfDate);
      const cur = latestDateByMonth.get(m);
      if (!cur || r.asOfDate > cur) latestDateByMonth.set(m, r.asOfDate);
    }
    const points: MonthlyPoint[] = [...latestDateByMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, asOfDate]) => {
        const atDate = rows.filter((r) => r.asOfDate === asOfDate);
        const balance = atDate.reduce((s, r) => s + r.balance, 0);
        const rated = atDate.filter((r) => r.ratePercent !== undefined && r.ratePercent !== null);
        const ratedBalance = rated.reduce((s, r) => s + Math.abs(r.balance), 0);
        const ratePercent =
          rated.length === 0
            ? null
            : ratedBalance > 0
              ? rated.reduce((s, r) => s + Math.abs(r.balance) * r.ratePercent!, 0) / ratedBalance
              : mean(rated.map((r) => r.ratePercent!));
        const counted = atDate.filter((r) => r.accountCount !== undefined && r.accountCount !== null);
        return {
          month,
          asOfDate,
          balance,
          ratePercent,
          accountCount: counted.length > 0 ? counted.reduce((s, r) => s + r.accountCount!, 0) : null,
        };
      });
    const missingMonths: MonthKey[] = [];
    if (points.length > 0) {
      const have = new Set(points.map((p) => p.month));
      for (let i = monthIndex(points[0]!.month); i <= monthIndex(points[points.length - 1]!.month); i += 1) {
        const m = monthFromIndex(i);
        if (!have.has(m)) missingMonths.push(m);
      }
    }
    out.push({ segmentId, key, currency: currencies[0] ?? '', points, missingMonths });
  }
  return out.sort((a, b) => (a.segmentId < b.segmentId ? -1 : 1));
}

function requirePoints(context: string, points: readonly MonthlyPoint[], required = MIN_MONTHLY_POINTS): void {
  if (points.length < required) {
    throw new InsufficientHistoryError(
      context,
      required,
      points.length,
      'Upload at least 12 month-end balances for this segment',
    );
  }
}

/** Months since the first point, from calendar months (so gaps keep their true spacing). */
function monthOffsets(points: readonly MonthlyPoint[]): number[] {
  const first = monthIndex(points[0]!.month);
  return points.map((p) => monthIndex(p.month) - first);
}

export interface DataWindow {
  from: MonthKey;
  to: MonthKey;
  observations: number;
}

function windowOf(points: readonly MonthlyPoint[]): DataWindow {
  return { from: points[0]?.month ?? '', to: points[points.length - 1]?.month ?? '', observations: points.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Core / non-core deposits
// ─────────────────────────────────────────────────────────────────────────

export type CoreMethod = 'MinimumBalance' | 'Volatility';

export interface CoreEstimateOptions {
  method: CoreMethod;
  /** Look-back window in months (most recent). Default 12. */
  windowMonths?: number;
  /** Volatility method: one-sided confidence for core = mean − z·σ. Default 0.99. */
  confidence?: number;
}

export interface StabilityMetrics {
  /** σ / mean of the balance over the window. */
  coefficientOfVariation: number;
  /** Largest peak-to-trough fall, as a fraction of the peak. */
  maxDrawdown: number;
  /** Share of months (0–1) whose balance sits below the fitted linear trend. */
  shareMonthsBelowTrend: number;
  /** Monthly linear trend slope over the window, as a fraction of mean balance. */
  trendGrowthPerMonth: number;
}

export interface CoreEstimate {
  method: CoreMethod;
  window: DataWindow;
  currentBalance: number;
  coreAmount: number;
  /** 0–1. */
  coreShare: number;
  volatileAmount: number;
  volatileShare: number;
  stability: StabilityMetrics;
  parameters: {
    windowMonths: number;
    confidence: number | null;
    z: number | null;
    meanBalance: number;
    stdBalance: number;
  };
}

export function stabilityMetrics(balances: readonly number[]): StabilityMetrics {
  if (balances.length < 3) throw new InsufficientHistoryError('Stability metrics', 3, balances.length);
  const m = mean(balances);
  const sd = standardDeviation(balances);
  let peak = balances[0]!;
  let maxDrawdown = 0;
  for (const b of balances) {
    peak = Math.max(peak, b);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - b) / peak);
  }
  const t = balances.map((_, i) => i);
  const reg = linearRegression(t, balances);
  const below = balances.filter((b, i) => b < reg.ols.fitted[i]!).length;
  return {
    coefficientOfVariation: m !== 0 ? sd / Math.abs(m) : 0,
    maxDrawdown,
    shareMonthsBelowTrend: below / balances.length,
    trendGrowthPerMonth: m !== 0 ? reg.slope.estimate / m : 0,
  };
}

/**
 * Split the current balance into core (stable) and volatile parts.
 *
 * MinimumBalance: core = lowest month-end balance in the window - money that
 * never left. Volatility: core = mean − z·σ over the window at the chosen
 * one-sided confidence. Both are capped to [0, current balance].
 */
export function estimateCoreDeposits(
  series: SegmentSeries | readonly MonthlyPoint[],
  options: CoreEstimateOptions,
): CoreEstimate {
  const points = Array.isArray(series) ? (series as MonthlyPoint[]) : (series as SegmentSeries).points;
  const windowMonths = options.windowMonths ?? MIN_MONTHLY_POINTS;
  requirePoints('Core deposit estimation', points, Math.max(MIN_MONTHLY_POINTS, windowMonths));
  const windowPoints = points.slice(-windowMonths);
  const balances = windowPoints.map((p) => p.balance);
  const currentBalance = balances[balances.length - 1]!;
  const meanBalance = mean(balances);
  const stdBalance = standardDeviation(balances);

  let rawCore: number;
  let confidence: number | null = null;
  let z: number | null = null;
  if (options.method === 'MinimumBalance') {
    rawCore = Math.min(...balances);
  } else {
    confidence = options.confidence ?? 0.99;
    if (!(confidence > 0.5 && confidence < 1))
      throw new ModelFitError('Volatility-method confidence must be in (0.5, 1)');
    z = normalQuantile(confidence);
    rawCore = meanBalance - z * stdBalance;
  }
  const coreAmount = Math.max(0, Math.min(currentBalance, rawCore));
  const volatileAmount = Math.max(0, currentBalance - coreAmount);
  return {
    method: options.method,
    window: windowOf(windowPoints),
    currentBalance,
    coreAmount,
    coreShare: currentBalance > 0 ? coreAmount / currentBalance : 0,
    volatileAmount,
    volatileShare: currentBalance > 0 ? volatileAmount / currentBalance : 0,
    stability: stabilityMetrics(balances),
    parameters: { windowMonths, confidence, z, meanBalance, stdBalance },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Decay and run-off
// ─────────────────────────────────────────────────────────────────────────

/**
 * DecayFit: exponential decay fitted to the non-core balance (balance − core).
 * FloorFit: core and λ estimated jointly, B(t) = core + (B0 − core)·e^(−λt).
 * OutflowPercentile: λ = the stressed monthly outflow rate - the chosen
 *   percentile of monthly log balance changes - usable for growing books,
 *   where aggregate balances show no decay to fit.
 */
export type DecayMethod = 'DecayFit' | 'FloorFit' | 'OutflowPercentile';

export interface DecayOptions {
  method: DecayMethod;
  /** Core amount for DecayFit; required there, ignored by FloorFit (which estimates it). */
  coreAmount?: number;
  /** OutflowPercentile: one-sided confidence, default 0.95 (uses the 5th percentile of monthly changes). */
  confidence?: number;
  level?: number;
}

export interface DecayEstimate {
  method: DecayMethod;
  window: DataWindow;
  /** Monthly decay rate of the non-core balance. */
  lambdaMonthly: number;
  lambdaCi: [number, number] | null;
  /** Half-life of the non-core balance, in months. */
  halfLifeMonths: number | null;
  coreAmount: number;
  currentBalance: number;
  fitStats: { rSquared: number | null; rmse: number | null; mape: number | null; n: number };
  /** Model-implied balance per point (null for OutflowPercentile, which is not a path model). */
  fitted: number[] | null;
}

export function estimateDecay(series: SegmentSeries | readonly MonthlyPoint[], options: DecayOptions): DecayEstimate {
  const points = Array.isArray(series) ? (series as MonthlyPoint[]) : (series as SegmentSeries).points;
  requirePoints('Deposit decay estimation', points);
  const level = options.level ?? 0.95;
  const t = monthOffsets(points);
  const balances = points.map((p) => p.balance);
  const currentBalance = balances[balances.length - 1]!;

  if (options.method === 'FloorFit') {
    const fit = fitDecayWithFloor(t, balances, { level, lambdaMin: 1e-4, lambdaMax: 3 });
    if (fit.lambda <= 1.5e-4) {
      throw new ModelFitError(
        'Balance shows no observable run-off toward a floor - use OutflowPercentile for a growing or flat book',
      );
    }
    return {
      method: 'FloorFit',
      window: windowOf(points),
      lambdaMonthly: fit.lambda,
      lambdaCi: fit.confidenceIntervals
        ? [Math.max(0, fit.confidenceIntervals.lambda[0]), fit.confidenceIntervals.lambda[1]]
        : null,
      halfLifeMonths: fit.halfLife,
      coreAmount: Math.min(fit.core, currentBalance),
      currentBalance,
      fitStats: { rSquared: fit.rSquared, rmse: fit.rmse, mape: fit.mape, n: fit.n },
      fitted: fit.fitted,
    };
  }

  if (options.method === 'OutflowPercentile') {
    const confidence = options.confidence ?? 0.95;
    const changes: number[] = [];
    for (let i = 1; i < points.length; i += 1) {
      if (monthIndex(points[i]!.month) - monthIndex(points[i - 1]!.month) !== 1) continue;
      if (points[i]!.balance > 0 && points[i - 1]!.balance > 0)
        changes.push(Math.log(points[i]!.balance / points[i - 1]!.balance));
    }
    if (changes.length < MIN_MONTHLY_POINTS - 1) {
      throw new InsufficientHistoryError(
        'Outflow percentile',
        MIN_MONTHLY_POINTS - 1,
        changes.length,
        'Needs consecutive monthly balances',
      );
    }
    const stressed = percentile(changes, (1 - confidence) * 100);
    const lambdaMonthly = Math.max(0, -stressed);
    return {
      method: 'OutflowPercentile',
      window: windowOf(points),
      lambdaMonthly,
      lambdaCi: null,
      halfLifeMonths: lambdaMonthly > 0 ? Math.LN2 / lambdaMonthly : null,
      coreAmount: options.coreAmount ?? 0,
      currentBalance,
      fitStats: { rSquared: null, rmse: null, mape: null, n: changes.length },
      fitted: null,
    };
  }

  if (options.coreAmount === undefined)
    throw new ModelFitError('DecayFit needs a core amount - estimate it with estimateCoreDeposits first');
  const core = options.coreAmount;
  const usable = points.map((p, i) => ({ t: t[i]!, nonCore: p.balance - core })).filter((r) => r.nonCore > 0);
  if (usable.length < MIN_MONTHLY_POINTS - 2) {
    throw new InsufficientHistoryError(
      'Non-core decay fit',
      MIN_MONTHLY_POINTS - 2,
      usable.length,
      'Too few months have a balance above the core floor',
    );
  }
  const fit = fitExponentialDecay(
    usable.map((u) => u.t),
    usable.map((u) => u.nonCore),
    level,
  );
  if (!(fit.lambda > 0)) {
    throw new ModelFitError(
      `Non-core balance is not decaying (λ = ${fit.lambda.toFixed(4)}/month) - aggregate balances cannot show run-off for a growing book; use OutflowPercentile or account-level cohorts`,
    );
  }
  return {
    method: 'DecayFit',
    window: windowOf(points),
    lambdaMonthly: fit.lambda,
    lambdaCi: [Math.max(0, fit.lambdaCiLower), fit.lambdaCiUpper],
    halfLifeMonths: fit.halfLife,
    coreAmount: core,
    currentBalance,
    fitStats: { rSquared: fit.rSquared, rmse: fit.rmse, mape: fit.mape, n: fit.n },
    fitted: t.map((ti) => core + fit.b0 * Math.exp(-fit.lambda * ti)),
  };
}

/** Standard run-off bucket end points, in days: 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y. */
export const STANDARD_RUNOFF_TENORS_DAYS = [30, 90, 180, 365, 730, 1095, 1825] as const;

export interface RunoffBucket {
  fromDays: number;
  tenorDays: number;
  type: 'Core' | 'Volatile';
  /** Percent of the total balance, 0–100. */
  percent: number;
  amount: number;
}

export interface RunoffProfile {
  balance: number;
  coreAmount: number;
  volatileAmount: number;
  lambdaMonthly: number;
  buckets: RunoffBucket[];
  assumptions: string;
}

export interface RunoffProfileOptions {
  tenorsDays?: readonly number[];
  /** Core balance amortises straight-line between these tenors. Policy assumptions, not fitted. Defaults 365 / 1825. */
  coreFromDays?: number;
  coreMaxTenorDays?: number;
}

/**
 * Turn a core split and decay rate into a run-off profile over tenor buckets.
 *
 * Volatile balance runs off exponentially at λ: the share gone by day d is
 * 1 − e^(−λ·d/30.44); whatever survives the last bucket falls into it. Core
 * balance is spread straight-line between coreFromDays and coreMaxTenorDays
 * (BCBS 368 caps core NMD average maturity at 5 years) - a policy choice,
 * reported in `assumptions`.
 */
export function buildRunoffProfile(
  core: Pick<CoreEstimate, 'currentBalance' | 'coreAmount'>,
  lambdaMonthly: number,
  options: RunoffProfileOptions = {},
): RunoffProfile {
  const tenors = [...(options.tenorsDays ?? STANDARD_RUNOFF_TENORS_DAYS)].sort((a, b) => a - b);
  if (tenors.length === 0) throw new ModelFitError('Run-off profile needs at least one tenor bucket');
  const coreFrom = options.coreFromDays ?? 365;
  const coreMax = options.coreMaxTenorDays ?? 1825;
  if (!(coreMax > coreFrom)) throw new ModelFitError('coreMaxTenorDays must exceed coreFromDays');
  if (!(lambdaMonthly >= 0)) throw new ModelFitError('Decay rate must be non-negative');

  const balance = core.currentBalance;
  const coreAmount = Math.max(0, Math.min(balance, core.coreAmount));
  const volatileAmount = balance - coreAmount;
  const runoffBy = (d: number) => 1 - Math.exp((-lambdaMonthly * d) / DAYS_PER_MONTH);

  const buckets: RunoffBucket[] = [];
  let prev = 0;
  tenors.forEach((end, i) => {
    const last = i === tenors.length - 1;
    const volShare = last ? 1 - runoffBy(prev) : runoffBy(end) - runoffBy(prev);
    // Core: overlap of (prev, end] with (coreFrom, coreMax]; the final bucket absorbs anything beyond it.
    const hi = last ? Math.max(end, coreMax) : end;
    const overlap = Math.max(0, Math.min(hi, coreMax) - Math.max(prev, coreFrom));
    const coreShare = overlap / (coreMax - coreFrom);
    if (volatileAmount > 0 && volShare > 0) {
      buckets.push({ fromDays: prev, tenorDays: end, type: 'Volatile', amount: volatileAmount * volShare, percent: 0 });
    }
    if (coreAmount > 0 && coreShare > 0) {
      buckets.push({ fromDays: prev, tenorDays: end, type: 'Core', amount: coreAmount * coreShare, percent: 0 });
    }
    prev = end;
  });
  for (const b of buckets) b.percent = balance > 0 ? (b.amount / balance) * 100 : 0;

  return {
    balance,
    coreAmount,
    volatileAmount,
    lambdaMonthly,
    buckets,
    assumptions:
      `Volatile balance runs off at the fitted rate λ = ${lambdaMonthly.toFixed(4)}/month. ` +
      `Core balance is spread straight-line from ${coreFrom}d to ${coreMax}d (policy assumption, not fitted).`,
  };
}

export interface PatternIdentity {
  id: string;
  name: string;
  appliesTo: BehaviouralTag[];
}

/**
 * Convert a run-off profile into the existing BehaviourPattern tier format.
 *
 * Percents are rounded to 2 dp and the rounding residual is put on the
 * largest tier so the tiers total exactly 100 (validateBehaviourPattern).
 * The result's Volatile tiers sum to the fitted volatile share, which is
 * what computeDepositRunoff() reads.
 */
export function toBehaviourPattern(profile: RunoffProfile, identity: PatternIdentity): BehaviourPattern {
  if (profile.balance <= 0) throw new ModelFitError('Cannot build a behaviour pattern from a zero balance');
  const tiers: RunoffTier[] = profile.buckets
    .map((b) => ({ tenorDays: b.tenorDays, percent: Math.round(b.percent * 100) / 100, type: b.type }))
    .filter((t) => t.percent > 0);
  if (tiers.length === 0) throw new ModelFitError('Run-off profile has no non-zero buckets');
  const total = tiers.reduce((s, t) => s + t.percent, 0);
  const largest = tiers.reduce((best, t) => (t.percent > best.percent ? t : best), tiers[0]!);
  largest.percent = Math.round((largest.percent + (100 - total)) * 100) / 100;
  const pattern: BehaviourPattern = { id: identity.id, name: identity.name, appliesTo: identity.appliesTo, tiers };
  validateBehaviourPattern(pattern);
  return pattern;
}

/** Plural convenience: one pattern per profile, in order. */
export function toBehaviourPatterns(
  profiles: ReadonlyArray<{ profile: RunoffProfile; identity: PatternIdentity }>,
): BehaviourPattern[] {
  return profiles.map(({ profile, identity }) => toBehaviourPattern(profile, identity));
}

// ─────────────────────────────────────────────────────────────────────────
// Repricing beta
// ─────────────────────────────────────────────────────────────────────────

export interface BetaOptions {
  /** Search lags 0..maxLagMonths of the policy-rate change. Default 0 (contemporaneous only). */
  maxLagMonths?: number;
  level?: number;
}

export interface BetaLagCandidate {
  lagMonths: number;
  beta: number;
  rSquared: number;
  pValue: number;
}

export interface BetaEstimate {
  beta: number;
  standardError: number;
  ciLower: number;
  ciUpper: number;
  pValue: number;
  /** Monthly drift in the deposit rate unexplained by policy moves, in pp. */
  intercept: number;
  rSquared: number;
  rmse: number;
  lagMonths: number;
  n: number;
  level: number;
  lagSearch: BetaLagCandidate[];
  window: DataWindow;
}

/**
 * Month-end policy rate per month, forward-filled: a policy rate stands until
 * the next decision, so a month with no new observation keeps the last value.
 */
export function monthlyPolicySeries(
  policy: EconomicIndicator | readonly IndicatorObservation[],
): Map<MonthKey, number> {
  const obs = [...('observations' in policy ? policy.observations : policy)].sort((a, b) =>
    a.asOfDate < b.asOfDate ? -1 : 1,
  );
  const out = new Map<MonthKey, number>();
  if (obs.length === 0) return out;
  const lastByMonth = new Map<MonthKey, number>();
  for (const o of obs) lastByMonth.set(monthKey(o.asOfDate), o.value);
  const first = monthIndex(monthKey(obs[0]!.asOfDate));
  const last = monthIndex(monthKey(obs[obs.length - 1]!.asOfDate));
  let current = NaN;
  for (let i = first; i <= last; i += 1) {
    const m = monthFromIndex(i);
    if (lastByMonth.has(m)) current = lastByMonth.get(m)!;
    out.set(m, current);
  }
  return out;
}

/**
 * Deposit beta: OLS of Δ(deposit rate) on Δ(policy rate) lagged k months,
 * Δr_dep(t) = α + β·Δr_pol(t−k) + ε. Every lag is compared on the same sample,
 * and the lag with the highest R² is chosen.
 */
export function estimateRepricingBeta(
  series: SegmentSeries | readonly MonthlyPoint[],
  policy: EconomicIndicator | readonly IndicatorObservation[],
  options: BetaOptions = {},
): BetaEstimate {
  const points = (Array.isArray(series) ? (series as MonthlyPoint[]) : (series as SegmentSeries).points).filter(
    (p) => p.ratePercent !== null,
  );
  requirePoints('Repricing beta', points);
  const maxLag = options.maxLagMonths ?? 0;
  const level = options.level ?? 0.95;
  const pol = monthlyPolicySeries(policy);
  const polAt = (idx: number) => pol.get(monthFromIndex(idx));

  const rows: { dDep: number; dPol: number[] }[] = [];
  const used: MonthlyPoint[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const mi = monthIndex(points[i]!.month);
    if (mi - monthIndex(points[i - 1]!.month) !== 1) continue;
    const dPol: number[] = [];
    let ok = true;
    for (let k = 0; k <= maxLag; k += 1) {
      const a = polAt(mi - k);
      const b = polAt(mi - k - 1);
      if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) {
        ok = false;
        break;
      }
      dPol.push(a - b);
    }
    if (!ok) continue;
    rows.push({ dDep: points[i]!.ratePercent! - points[i - 1]!.ratePercent!, dPol });
    used.push(points[i]!);
  }
  const minRows = MIN_MONTHLY_POINTS - 2;
  if (rows.length < minRows) {
    throw new InsufficientHistoryError(
      'Repricing beta',
      minRows,
      rows.length,
      'Needs consecutive monthly deposit rates overlapping the policy-rate series (plus the lag window)',
    );
  }
  const y = rows.map((r) => r.dDep);
  const lagSearch: BetaLagCandidate[] = [];
  let best: { lag: number; fit: ReturnType<typeof linearRegression> } | null = null;
  for (let k = 0; k <= maxLag; k += 1) {
    const x = rows.map((r) => r.dPol[k]!);
    if (x.every((v) => v === x[0])) continue; // policy rate never moved over this sample
    const fit = linearRegression(x, y, level);
    lagSearch.push({ lagMonths: k, beta: fit.slope.estimate, rSquared: fit.rSquared, pValue: fit.slope.pValue });
    if (!best || fit.rSquared > best.fit.rSquared) best = { lag: k, fit };
  }
  if (!best) throw new ModelFitError('The policy rate did not change over the sample - a beta cannot be identified');
  const s = best.fit.slope;
  return {
    beta: s.estimate,
    standardError: s.standardError,
    ciLower: s.ciLower,
    ciUpper: s.ciUpper,
    pValue: s.pValue,
    intercept: best.fit.intercept.estimate,
    rSquared: best.fit.rSquared,
    rmse: best.fit.ols.rmse,
    lagMonths: best.lag,
    n: rows.length,
    level,
    lagSearch,
    window: windowOf(used),
  };
}

/**
 * Merge fitted betas into the DEFAULT_BETAS shape. Tags without a fitted
 * beta keep the base value; fitted betas are clamped to [0, 1], the range
 * applyDepositBetas() expects.
 */
export function toDepositBetas(
  fitted: ReadonlyArray<{ behaviouralTag: BehaviouralTag; beta: number }>,
  base: readonly DepositBeta[] = DEFAULT_BETAS,
): DepositBeta[] {
  const byTag = new Map(base.map((b) => [b.behaviouralTag, { ...b }]));
  for (const f of fitted)
    byTag.set(f.behaviouralTag, { behaviouralTag: f.behaviouralTag, beta: Math.min(1, Math.max(0, f.beta)) });
  return [...byTag.values()];
}

// ─────────────────────────────────────────────────────────────────────────
// Loan prepayment
// ─────────────────────────────────────────────────────────────────────────

export interface MonthlySmm {
  month: MonthKey;
  smm: number;
  scheduled: number;
  prepaid: number;
  accounts: number;
}

export interface PrepaymentEstimate {
  productCode: string;
  currency: string;
  /** Pool single monthly mortality, Σ prepaid / Σ scheduled. */
  smm: number;
  /** Annualised: 1 − (1 − SMM)^12. */
  cpr: number;
  cprCi: [number, number];
  level: number;
  monthly: MonthlySmm[];
  accountMonths: number;
  window: DataWindow;
}

export interface PrepaymentOptions {
  level?: number;
  /** Minimum distinct snapshot dates per product. Default 12. */
  minSnapshots?: number;
}

export function smmToCpr(smm: number): number {
  return 1 - (1 - smm) ** 12;
}

export function cprToSmm(cpr: number): number {
  return 1 - (1 - cpr) ** (1 / 12);
}

/**
 * Prepayment from consecutive account snapshots.
 *
 * For each account and consecutive pair of snapshots ~1 month apart,
 * prepaid = max(0, scheduledBalance − actual balance). An account that
 * vanishes before its maturity date is a full payoff of its prior balance
 * (prior balance stands in for the unknown scheduled balance - a slight
 * overstatement by one month's contractual amortisation). Snapshots without
 * a scheduledBalance are skipped, since partial prepayment cannot be
 * separated from contractual amortisation without one.
 */
export function estimatePrepayment(
  accounts: readonly AccountObservation[],
  options: PrepaymentOptions = {},
): PrepaymentEstimate[] {
  const level = options.level ?? 0.95;
  const minSnapshots = options.minSnapshots ?? MIN_MONTHLY_POINTS;
  const pools = new Map<string, AccountObservation[]>();
  for (const a of accounts) {
    const k = `${a.productCode}|${a.currency.toUpperCase()}`;
    const list = pools.get(k) ?? [];
    list.push(a);
    pools.set(k, list);
  }

  const out: PrepaymentEstimate[] = [];
  for (const [poolKey, rows] of pools) {
    const [productCode, currency] = poolKey.split('|') as [string, string];
    const dates = [...new Set(rows.map((r) => r.asOfDate))].sort();
    if (dates.length < minSnapshots) {
      throw new InsufficientHistoryError(
        `Prepayment (${productCode} ${currency})`,
        minSnapshots,
        dates.length,
        'Upload monthly account snapshots',
      );
    }
    const byAccount = new Map<string, Map<IsoDate, AccountObservation>>();
    for (const r of rows) {
      const k = `${r.affiliateCode}|${r.accountNumber}`;
      const m = byAccount.get(k) ?? new Map<IsoDate, AccountObservation>();
      m.set(r.asOfDate, r);
      byAccount.set(k, m);
    }

    const monthly: MonthlySmm[] = [];
    for (let i = 1; i < dates.length; i += 1) {
      const prevDate = dates[i - 1]!;
      const curDate = dates[i]!;
      const gap = daysBetween(prevDate, curDate);
      if (gap < 20 || gap > 45) continue; // not a monthly step
      let scheduled = 0;
      let prepaid = 0;
      let n = 0;
      for (const snaps of byAccount.values()) {
        const prev = snaps.get(prevDate);
        if (!prev || prev.balance <= 0) continue;
        const cur = snaps.get(curDate);
        if (!cur) {
          // Gone: a full payoff unless it simply reached maturity.
          if (prev.maturityDate && prev.maturityDate <= curDate) continue;
          scheduled += prev.balance;
          prepaid += prev.balance;
          n += 1;
          continue;
        }
        if (cur.scheduledBalance === undefined || cur.scheduledBalance === null || cur.scheduledBalance <= 0) continue;
        scheduled += cur.scheduledBalance;
        prepaid += Math.max(0, cur.scheduledBalance - Math.max(0, cur.balance));
        n += 1;
      }
      if (scheduled > 0)
        monthly.push({ month: monthKey(curDate), smm: prepaid / scheduled, scheduled, prepaid, accounts: n });
    }
    if (monthly.length < minSnapshots - 1) {
      throw new InsufficientHistoryError(
        `Prepayment (${productCode} ${currency})`,
        minSnapshots - 1,
        monthly.length,
        'Too few monthly snapshot pairs carry a scheduled balance',
      );
    }
    const totalScheduled = monthly.reduce((s, m) => s + m.scheduled, 0);
    const smm = monthly.reduce((s, m) => s + m.prepaid, 0) / totalScheduled;
    const sd = standardDeviation(monthly.map((m) => m.smm));
    const tCrit = studentTQuantile(1 - (1 - level) / 2, monthly.length - 1);
    const half = (tCrit * sd) / Math.sqrt(monthly.length);
    out.push({
      productCode,
      currency,
      smm,
      cpr: smmToCpr(smm),
      cprCi: [smmToCpr(Math.max(0, smm - half)), smmToCpr(Math.min(1, smm + half))],
      level,
      monthly,
      accountMonths: monthly.reduce((s, m) => s + m.accounts, 0),
      window: { from: monthly[0]!.month, to: monthly[monthly.length - 1]!.month, observations: monthly.length },
    });
  }
  return out.sort((a, b) =>
    a.productCode < b.productCode ? -1 : a.productCode > b.productCode ? 1 : a.currency < b.currency ? -1 : 1,
  );
}

export interface PrepaymentAssumptionMapping {
  assumptions: PrepaymentAssumption[];
  /** Products whose estimate could not be keyed - no Common CoA code supplied. */
  unmapped: string[];
}

/**
 * Map fitted CPRs onto PrepaymentRule.assumptions, keyed by Common Chart of
 * Accounts code as computePrepayment() expects. Several products under one
 * CoA code are combined balance-weighted on scheduled balance.
 */
export function toPrepaymentAssumptions(
  estimates: readonly PrepaymentEstimate[],
  commonCoaByProduct: Readonly<Record<string, string>>,
): PrepaymentAssumptionMapping {
  const unmapped: string[] = [];
  const byCoa = new Map<string, { prepaid: number; scheduled: number }>();
  for (const e of estimates) {
    const coa = commonCoaByProduct[e.productCode];
    if (!coa) {
      unmapped.push(e.productCode);
      continue;
    }
    const acc = byCoa.get(coa) ?? { prepaid: 0, scheduled: 0 };
    for (const m of e.monthly) {
      acc.prepaid += m.prepaid;
      acc.scheduled += m.scheduled;
    }
    byCoa.set(coa, acc);
  }
  const assumptions: PrepaymentAssumption[] = [...byCoa.entries()].map(([commonCoaCode, acc]) => ({
    commonCoaCode,
    method: 'ConstantRate',
    cpr: Math.round(smmToCpr(acc.scheduled > 0 ? acc.prepaid / acc.scheduled : 0) * 1e6) / 1e6,
  }));
  return { assumptions, unmapped: [...new Set(unmapped)] };
}

// ─────────────────────────────────────────────────────────────────────────
// Term deposits - rollover and early withdrawal
// ─────────────────────────────────────────────────────────────────────────

export interface TermDepositOptions {
  periodFrom: IsoDate;
  periodTo: IsoDate;
  /** Minimum maturing accounts for a renewal rate. Default 12. */
  minAccounts?: number;
}

export interface TermDepositBehaviour {
  productCode: string;
  currency: string;
  maturingCount: number;
  maturingBalance: number;
  rolledOverCount: number;
  rolledOverBalance: number;
  /** Balance-weighted renewal rate, 0–1; null when too few accounts matured. */
  renewalRate: number | null;
  renewalRateByCount: number | null;
  /** Matured accounts whose outcome cannot be determined (no flag, no later snapshot). */
  undeterminedCount: number;
  exposedCount: number;
  exposedBalance: number;
  earlyWithdrawalCount: number;
  earlyWithdrawalBalance: number;
  /** Share of exposed balance withdrawn before maturity over the period, 0–1. */
  earlyWithdrawalRate: number | null;
  /** Period rate annualised: 1 − (1 − rate)^(365 / days). */
  earlyWithdrawalRateAnnualised: number | null;
  periodFrom: IsoDate;
  periodTo: IsoDate;
}

/**
 * Renewal: of accounts whose maturity falls in the period, the share that
 * rolled over - an explicit rolledOver flag, else inferred from a later
 * snapshot of the same account with a later maturity date. Early
 * withdrawal: of accounts alive in the period, the share closed before
 * maturity - an explicit withdrawnEarly flag, else inferred from the account
 * disappearing from a later snapshot date that precedes its maturity.
 */
export function estimateTermDepositBehaviour(
  accounts: readonly AccountObservation[],
  options: TermDepositOptions,
): TermDepositBehaviour[] {
  const { periodFrom, periodTo } = options;
  const minAccounts = options.minAccounts ?? MIN_MONTHLY_POINTS;
  if (periodTo <= periodFrom) throw new ModelFitError('periodTo must be after periodFrom');
  const pools = new Map<string, AccountObservation[]>();
  for (const a of accounts) {
    const k = `${a.productCode}|${a.currency.toUpperCase()}`;
    const list = pools.get(k) ?? [];
    list.push(a);
    pools.set(k, list);
  }

  const out: TermDepositBehaviour[] = [];
  for (const [poolKey, rows] of pools) {
    const [productCode, currency] = poolKey.split('|') as [string, string];
    const poolDates = [...new Set(rows.map((r) => r.asOfDate))].sort();
    const byAccount = new Map<string, AccountObservation[]>();
    for (const r of rows) {
      const k = `${r.affiliateCode}|${r.accountNumber}`;
      const list = byAccount.get(k) ?? [];
      list.push(r);
      byAccount.set(k, list);
    }

    let maturingCount = 0;
    let maturingBalance = 0;
    let rolledOverCount = 0;
    let rolledOverBalance = 0;
    let undeterminedCount = 0;
    let exposedCount = 0;
    let exposedBalance = 0;
    let earlyCount = 0;
    let earlyBalance = 0;

    for (const snaps of byAccount.values()) {
      snaps.sort((a, b) => (a.asOfDate < b.asOfDate ? -1 : 1));
      const inPeriod = snaps.filter((s) => s.asOfDate >= periodFrom && s.asOfDate <= periodTo);
      const lastBefore = [...snaps].reverse().find((s) => s.asOfDate <= periodTo);

      // ── Renewal: any maturity date seen on the account falling inside the period.
      const maturing = [...snaps]
        .reverse()
        .find(
          (s) =>
            s.maturityDate !== undefined &&
            s.maturityDate >= periodFrom &&
            s.maturityDate <= periodTo &&
            s.asOfDate <= s.maturityDate,
        );
      // An account closed before it reached maturity never faced the renewal decision.
      const lastSnap = snaps[snaps.length - 1]!;
      const closedEarly =
        maturing !== undefined &&
        (snaps.some((s) => s.withdrawnEarly === true) ||
          (lastSnap.asOfDate < maturing.maturityDate! &&
            poolDates.some((d) => d > lastSnap.asOfDate && d < maturing.maturityDate!)));
      if (maturing && maturing.balance > 0 && !closedEarly) {
        const after = snaps.filter((s) => s.asOfDate > maturing.maturityDate!);
        const flagged = snaps.find((s) => s.asOfDate >= maturing.maturityDate! && s.rolledOver !== undefined);
        let rolled: boolean | null = null;
        if (flagged) rolled = flagged.rolledOver!;
        else if (after.length > 0)
          rolled = after.some((s) => s.balance > 0 && (s.maturityDate ?? '') > maturing.maturityDate!);
        else if (maturing.rolledOver !== undefined) rolled = maturing.rolledOver;
        else if (poolDates.some((d) => d > maturing.maturityDate!)) rolled = false; // pool observed later, account absent
        if (rolled === null) undeterminedCount += 1;
        else {
          maturingCount += 1;
          maturingBalance += maturing.balance;
          if (rolled) {
            rolledOverCount += 1;
            rolledOverBalance += maturing.balance;
          }
        }
      }

      // ── Early withdrawal: alive in the period with maturity beyond its first in-period snapshot.
      const first = inPeriod[0];
      if (!first || first.balance <= 0 || !first.maturityDate || first.maturityDate <= first.asOfDate) continue;
      exposedCount += 1;
      exposedBalance += first.balance;
      const flaggedEarly = inPeriod.find((s) => s.withdrawnEarly === true);
      let early = Boolean(flaggedEarly);
      if (!early && lastBefore) {
        const lastMaturity = lastBefore.maturityDate;
        const laterPoolDate = poolDates.find((d) => d > lastBefore.asOfDate && d <= periodTo);
        // Absent from a later in-period pool snapshot while still before maturity → closed early.
        if (
          laterPoolDate &&
          lastMaturity &&
          laterPoolDate < lastMaturity &&
          !snaps.some((s) => s.asOfDate === laterPoolDate)
        )
          early = true;
      }
      if (early) {
        earlyCount += 1;
        earlyBalance += first.balance;
      }
    }

    const periodDays = daysBetween(periodFrom, periodTo);
    const earlyRate = exposedCount >= minAccounts && exposedBalance > 0 ? earlyBalance / exposedBalance : null;
    out.push({
      productCode,
      currency,
      maturingCount,
      maturingBalance,
      rolledOverCount,
      rolledOverBalance,
      renewalRate: maturingCount >= minAccounts && maturingBalance > 0 ? rolledOverBalance / maturingBalance : null,
      renewalRateByCount: maturingCount >= minAccounts ? rolledOverCount / maturingCount : null,
      undeterminedCount,
      exposedCount,
      exposedBalance,
      earlyWithdrawalCount: earlyCount,
      earlyWithdrawalBalance: earlyBalance,
      earlyWithdrawalRate: earlyRate,
      earlyWithdrawalRateAnnualised:
        earlyRate === null || periodDays <= 0 ? null : 1 - (1 - earlyRate) ** (365 / periodDays),
      periodFrom,
      periodTo,
    });
  }
  return out.sort((a, b) =>
    a.productCode < b.productCode ? -1 : a.productCode > b.productCode ? 1 : a.currency < b.currency ? -1 : 1,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Back-testing
// ─────────────────────────────────────────────────────────────────────────

/** A univariate path model over t (months since the series start). */
export interface SeriesModel {
  name: string;
  minTrainPoints: number;
  fit(t: readonly number[], y: readonly number[]): Record<string, number>;
  predict(params: Record<string, number>, t: readonly number[]): number[];
}

export const exponentialDecayModel: SeriesModel = {
  name: 'ExponentialDecay',
  minTrainPoints: 3,
  fit: (t, y) => {
    const f = fitExponentialDecay(t, y);
    return { b0: f.b0, lambda: f.lambda };
  },
  predict: (p, t) => t.map((ti) => p.b0! * Math.exp(-p.lambda! * ti)),
};

export const decayWithFloorModel: SeriesModel = {
  name: 'DecayWithFloor',
  minTrainPoints: 4,
  fit: (t, y) => {
    const f = fitDecayWithFloor(t, y);
    return { core: f.core, b0: f.b0, lambda: f.lambda };
  },
  predict: (p, t) => t.map((ti) => p.core! + (p.b0! - p.core!) * Math.exp(-p.lambda! * ti)),
};

/** Exponential decay of the balance above a fixed core floor. */
export function nonCoreDecayModel(core: number): SeriesModel {
  return {
    name: 'NonCoreDecay',
    minTrainPoints: 3,
    fit: (t, y) => {
      const keep = y.map((v, i) => ({ t: t[i]!, v: v - core })).filter((r) => r.v > 0);
      const f = fitExponentialDecay(
        keep.map((r) => r.t),
        keep.map((r) => r.v),
      );
      return { core, b0: f.b0, lambda: f.lambda };
    },
    predict: (p, t) => t.map((ti) => p.core! + p.b0! * Math.exp(-p.lambda! * ti)),
  };
}

export const linearTrendModel: SeriesModel = {
  name: 'LinearTrend',
  minTrainPoints: 3,
  fit: (t, y) => {
    const f = linearRegression(t, y);
    return { intercept: f.intercept.estimate, slope: f.slope.estimate };
  },
  predict: (p, t) => t.map((ti) => p.intercept! + p.slope! * ti),
};

export type ToleranceMetric = 'MAPE' | 'MAE' | 'RMSE';

export interface BacktestOptions {
  /** Last month (or date - its month is used) of the training window. Later points form the hold-out. */
  trainEnd: MonthKey | IsoDate;
  /** Default MAPE 10 (%). */
  tolerance?: { metric: ToleranceMetric; threshold: number };
}

export interface BacktestPoint {
  month: MonthKey;
  actual: number;
  predicted: number;
  error: number;
}

export interface BacktestResult {
  model: string;
  train: DataWindow;
  test: DataWindow;
  params: Record<string, number>;
  points: BacktestPoint[];
  metrics: ErrorMetrics;
  tolerance: { metric: ToleranceMetric; threshold: number };
  passed: boolean;
}

export function backtestFromPoints(
  model: string,
  train: DataWindow,
  params: Record<string, number>,
  points: BacktestPoint[],
  tolerance: { metric: ToleranceMetric; threshold: number } = { metric: 'MAPE', threshold: 10 },
): BacktestResult {
  if (points.length === 0)
    throw new InsufficientHistoryError(`Back-test (${model})`, 1, 0, 'No hold-out observations after trainEnd');
  const metrics = errorMetrics(
    points.map((p) => p.actual),
    points.map((p) => p.predicted),
  );
  const value = tolerance.metric === 'MAPE' ? metrics.mape : tolerance.metric === 'MAE' ? metrics.mae : metrics.rmse;
  return {
    model,
    train,
    test: { from: points[0]!.month, to: points[points.length - 1]!.month, observations: points.length },
    params,
    points,
    metrics,
    tolerance,
    passed: value !== null && value <= tolerance.threshold,
  };
}

/** Fit `model` on points up to trainEnd, predict the hold-out, and score it. */
export function backtest(
  model: SeriesModel,
  series: SegmentSeries | readonly MonthlyPoint[],
  options: BacktestOptions,
): BacktestResult {
  const points = Array.isArray(series) ? (series as MonthlyPoint[]) : (series as SegmentSeries).points;
  if (points.length === 0) throw new InsufficientHistoryError(`Back-test (${model.name})`, model.minTrainPoints + 1, 0);
  const cut = monthKey(options.trainEnd);
  const t = monthOffsets(points);
  const trainIdx = points.map((p, i) => (p.month <= cut ? i : -1)).filter((i) => i >= 0);
  const testIdx = points.map((p, i) => (p.month > cut ? i : -1)).filter((i) => i >= 0);
  if (trainIdx.length < model.minTrainPoints) {
    throw new InsufficientHistoryError(
      `Back-test training window (${model.name})`,
      model.minTrainPoints,
      trainIdx.length,
    );
  }
  const params = model.fit(
    trainIdx.map((i) => t[i]!),
    trainIdx.map((i) => points[i]!.balance),
  );
  const predicted = model.predict(
    params,
    testIdx.map((i) => t[i]!),
  );
  const out: BacktestPoint[] = testIdx.map((i, j) => ({
    month: points[i]!.month,
    actual: points[i]!.balance,
    predicted: predicted[j]!,
    error: predicted[j]! - points[i]!.balance,
  }));
  return backtestFromPoints(model.name, windowOf(trainIdx.map((i) => points[i]!)), params, out, options.tolerance);
}

// ─────────────────────────────────────────────────────────────────────────
// Calibration → ModelRun (versioned registry record)
// ─────────────────────────────────────────────────────────────────────────

export type BehaviouralModelType = 'DepositRunoff' | 'RepricingBeta' | 'Prepayment' | 'TermDeposit';

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

/** A serialisable calibration record - store one per calibration as an immutable model version. */
export interface ModelRun {
  id: string;
  modelType: BehaviouralModelType;
  segment: { segmentId: string; key: SegmentKey; currency: string };
  window: DataWindow;
  params: Record<string, number | string | null>;
  fitStats: Record<string, number | null>;
  confidenceIntervals: Record<string, ConfidenceInterval>;
  backtest: BacktestResult | null;
  /** Rule-body fragments ready to drop into the existing rule kinds. */
  outputs: {
    behaviourPattern?: BehaviourPattern;
    depositBeta?: { behaviouralTag: BehaviouralTag; beta: number };
    prepaymentCpr?: { productCode: string; currency: string; cpr: number };
    runoffProfile?: RunoffProfile;
  };
  methodology: string;
  createdAt: string;
}

interface CalibrationCommon {
  /** Override for deterministic ids/timestamps (tests, replays). */
  now?: string;
  id?: string;
  backtest?: BacktestOptions;
}

export type CalibrationInput =
  | (CalibrationCommon & {
      modelType: 'DepositRunoff';
      series: SegmentSeries;
      core: CoreEstimateOptions;
      decay: Omit<DecayOptions, 'coreAmount'>;
      pattern: PatternIdentity;
      runoff?: RunoffProfileOptions;
    })
  | (CalibrationCommon & {
      modelType: 'RepricingBeta';
      series: SegmentSeries;
      policy: EconomicIndicator | readonly IndicatorObservation[];
      behaviouralTag: BehaviouralTag;
      beta?: BetaOptions;
    })
  | (CalibrationCommon & {
      modelType: 'Prepayment';
      accounts: readonly AccountObservation[];
      productCode: string;
      currency: string;
      prepayment?: PrepaymentOptions;
    })
  | (CalibrationCommon & {
      modelType: 'TermDeposit';
      accounts: readonly AccountObservation[];
      productCode: string;
      currency: string;
      period: TermDepositOptions;
    });

const ci = (lower: number, upper: number, level: number): ConfidenceInterval => ({ lower, upper, level });

/** Fit one model to one segment and package parameters, fit statistics, CIs and back-test as a ModelRun. */
export function calibrate(input: CalibrationInput): ModelRun {
  const createdAt = input.now ?? new Date().toISOString();
  const makeId = (segmentId: string, window: DataWindow) =>
    input.id ?? `${input.modelType}:${segmentId}:${window.to}:${createdAt}`;

  switch (input.modelType) {
    case 'DepositRunoff': {
      const { series } = input;
      const coreEst = estimateCoreDeposits(series, input.core);
      const decay = estimateDecay(series, { ...input.decay, coreAmount: coreEst.coreAmount });
      const core =
        decay.method === 'FloorFit'
          ? { currentBalance: coreEst.currentBalance, coreAmount: decay.coreAmount }
          : coreEst;
      const profile = buildRunoffProfile(core, decay.lambdaMonthly, input.runoff);
      const pattern = toBehaviourPattern(profile, input.pattern);
      let bt: BacktestResult | null = null;
      if (input.backtest) {
        const model =
          decay.method === 'FloorFit'
            ? decayWithFloorModel
            : decay.method === 'DecayFit'
              ? nonCoreDecayModel(coreEst.coreAmount)
              : null;
        if (model) bt = backtest(model, series, input.backtest);
      }
      const level = input.decay.level ?? 0.95;
      const intervals: Record<string, ConfidenceInterval> = {};
      if (decay.lambdaCi) intervals.lambdaMonthly = ci(decay.lambdaCi[0], decay.lambdaCi[1], level);
      return {
        id: makeId(series.segmentId, decay.window),
        modelType: 'DepositRunoff',
        segment: { segmentId: series.segmentId, key: series.key, currency: series.currency },
        window: decay.window,
        params: {
          coreMethod: coreEst.method,
          decayMethod: decay.method,
          coreAmount: core.coreAmount,
          coreShare: core.currentBalance > 0 ? core.coreAmount / core.currentBalance : 0,
          lambdaMonthly: decay.lambdaMonthly,
          halfLifeMonths: decay.halfLifeMonths,
          currentBalance: core.currentBalance,
        },
        fitStats: {
          ...decay.fitStats,
          coefficientOfVariation: coreEst.stability.coefficientOfVariation,
          maxDrawdown: coreEst.stability.maxDrawdown,
          shareMonthsBelowTrend: coreEst.stability.shareMonthsBelowTrend,
        },
        confidenceIntervals: intervals,
        backtest: bt,
        outputs: { behaviourPattern: pattern, runoffProfile: profile },
        methodology:
          `Core estimated by ${coreEst.method} over ${coreEst.parameters.windowMonths} months; non-core run-off by ${decay.method}. ` +
          profile.assumptions,
        createdAt,
      };
    }

    case 'RepricingBeta': {
      const { series } = input;
      const est = estimateRepricingBeta(series, input.policy, input.beta);
      let bt: BacktestResult | null = null;
      if (input.backtest)
        bt = backtestBeta(series, input.policy, est.lagMonths, input.beta?.level ?? 0.95, input.backtest);
      return {
        id: makeId(series.segmentId, est.window),
        modelType: 'RepricingBeta',
        segment: { segmentId: series.segmentId, key: series.key, currency: series.currency },
        window: est.window,
        params: {
          beta: est.beta,
          intercept: est.intercept,
          lagMonths: est.lagMonths,
          behaviouralTag: input.behaviouralTag,
        },
        fitStats: {
          rSquared: est.rSquared,
          rmse: est.rmse,
          pValue: est.pValue,
          standardError: est.standardError,
          n: est.n,
        },
        confidenceIntervals: { beta: ci(est.ciLower, est.ciUpper, est.level) },
        backtest: bt,
        outputs: { depositBeta: { behaviouralTag: input.behaviouralTag, beta: Math.min(1, Math.max(0, est.beta)) } },
        methodology: `OLS of monthly Δ deposit rate on Δ policy rate lagged ${est.lagMonths} month(s); lag chosen by R² over 0..${input.beta?.maxLagMonths ?? 0}.`,
        createdAt,
      };
    }

    case 'Prepayment': {
      const pool = input.accounts.filter(
        (a) => a.productCode === input.productCode && a.currency.toUpperCase() === input.currency.toUpperCase(),
      );
      const [est] = estimatePrepayment(pool, input.prepayment);
      if (!est) throw new InsufficientHistoryError(`Prepayment (${input.productCode} ${input.currency})`, 1, 0);
      let bt: BacktestResult | null = null;
      if (input.backtest) {
        const cut = monthKey(input.backtest.trainEnd);
        const train = est.monthly.filter((m) => m.month <= cut);
        const test = est.monthly.filter((m) => m.month > cut);
        if (train.length < 3)
          throw new InsufficientHistoryError('Prepayment back-test training window', 3, train.length);
        const trainSmm = train.reduce((s, m) => s + m.prepaid, 0) / train.reduce((s, m) => s + m.scheduled, 0);
        bt = backtestFromPoints(
          'ConstantSmm',
          { from: train[0]!.month, to: train[train.length - 1]!.month, observations: train.length },
          { smm: trainSmm },
          test.map((m) => ({ month: m.month, actual: m.smm, predicted: trainSmm, error: trainSmm - m.smm })),
          input.backtest.tolerance ?? { metric: 'MAE', threshold: 0.005 },
        );
      }
      const segmentKey: SegmentKey = { productCode: est.productCode, currency: est.currency };
      return {
        id: makeId(segmentIdOf(segmentKey, ['productCode', 'currency']), est.window),
        modelType: 'Prepayment',
        segment: {
          segmentId: segmentIdOf(segmentKey, ['productCode', 'currency']),
          key: segmentKey,
          currency: est.currency,
        },
        window: est.window,
        params: { smm: est.smm, cpr: est.cpr },
        fitStats: { accountMonths: est.accountMonths, months: est.monthly.length },
        confidenceIntervals: { cpr: ci(est.cprCi[0], est.cprCi[1], est.level) },
        backtest: bt,
        outputs: { prepaymentCpr: { productCode: est.productCode, currency: est.currency, cpr: est.cpr } },
        methodology:
          'Pool SMM = Σ(scheduled − actual) / Σ scheduled over consecutive monthly snapshots; CPR = 1 − (1 − SMM)^12.',
        createdAt,
      };
    }

    case 'TermDeposit': {
      const pool = input.accounts.filter(
        (a) => a.productCode === input.productCode && a.currency.toUpperCase() === input.currency.toUpperCase(),
      );
      const [est] = estimateTermDepositBehaviour(pool, input.period);
      if (!est || (est.renewalRate === null && est.earlyWithdrawalRate === null)) {
        throw new InsufficientHistoryError(
          `Term deposit behaviour (${input.productCode} ${input.currency})`,
          input.period.minAccounts ?? MIN_MONTHLY_POINTS,
          Math.max(est?.maturingCount ?? 0, est?.exposedCount ?? 0),
        );
      }
      const segmentKey: SegmentKey = { productCode: est.productCode, currency: est.currency };
      const window: DataWindow = {
        from: monthKey(est.periodFrom),
        to: monthKey(est.periodTo),
        observations: est.exposedCount + est.maturingCount,
      };
      const intervals: Record<string, ConfidenceInterval> = {};
      // Wilson score interval on the count-based proportions.
      const wilson = (k: number, n: number, level: number): ConfidenceInterval => {
        const z = normalQuantile(1 - (1 - level) / 2);
        const p = k / n;
        const denom = 1 + (z * z) / n;
        const centre = (p + (z * z) / (2 * n)) / denom;
        const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
        return ci(Math.max(0, centre - half), Math.min(1, centre + half), level);
      };
      if (est.renewalRateByCount !== null)
        intervals.renewalRateByCount = wilson(est.rolledOverCount, est.maturingCount, 0.95);
      if (est.earlyWithdrawalRate !== null)
        intervals.earlyWithdrawalRateByCount = wilson(est.earlyWithdrawalCount, est.exposedCount, 0.95);
      return {
        id: makeId(segmentIdOf(segmentKey, ['productCode', 'currency']), window),
        modelType: 'TermDeposit',
        segment: {
          segmentId: segmentIdOf(segmentKey, ['productCode', 'currency']),
          key: segmentKey,
          currency: est.currency,
        },
        window,
        params: {
          renewalRate: est.renewalRate,
          earlyWithdrawalRate: est.earlyWithdrawalRate,
          earlyWithdrawalRateAnnualised: est.earlyWithdrawalRateAnnualised,
        },
        fitStats: {
          maturingCount: est.maturingCount,
          undeterminedCount: est.undeterminedCount,
          exposedCount: est.exposedCount,
          renewalRateByCount: est.renewalRateByCount,
        },
        confidenceIntervals: intervals,
        backtest: null,
        outputs: {},
        methodology:
          'Renewal = rolled-over balance / maturing balance in the period; early withdrawal = balance closed before maturity / exposed balance. ' +
          'Count-based proportions carry Wilson 95% intervals.',
        createdAt,
      };
    }
  }
}

/** Hold-out test for a beta: predict the deposit-rate path from the fitted beta and actual policy moves. */
function backtestBeta(
  series: SegmentSeries,
  policy: EconomicIndicator | readonly IndicatorObservation[],
  lag: number,
  level: number,
  options: BacktestOptions,
): BacktestResult {
  const cut = monthKey(options.trainEnd);
  const rated = series.points.filter((p) => p.ratePercent !== null);
  const train = rated.filter((p) => p.month <= cut);
  const test = rated.filter((p) => p.month > cut);
  requirePoints('Repricing beta back-test training window', train);
  // Refit on the training sample with the lag fixed at the calibrated choice.
  const pol = monthlyPolicySeries(policy);
  const polAt = (idx: number) => pol.get(monthFromIndex(idx));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 1; i < train.length; i += 1) {
    const mi = monthIndex(train[i]!.month);
    if (mi - monthIndex(train[i - 1]!.month) !== 1) continue;
    const a = polAt(mi - lag);
    const b = polAt(mi - lag - 1);
    if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) continue;
    xs.push(a - b);
    ys.push(train[i]!.ratePercent! - train[i - 1]!.ratePercent!);
  }
  if (xs.length < MIN_MONTHLY_POINTS - 2) {
    throw new InsufficientHistoryError('Repricing beta back-test training window', MIN_MONTHLY_POINTS - 2, xs.length);
  }
  const reg = ols(
    xs.map((x) => [x]),
    ys,
    { level },
  );
  const alpha = reg.coefficients[0]!.estimate;
  const slope = reg.coefficients[1]!.estimate;
  let level0 = train[train.length - 1]?.ratePercent ?? null;
  let prevIdx = train.length > 0 ? monthIndex(train[train.length - 1]!.month) : null;
  const points: BacktestPoint[] = [];
  for (const p of test) {
    const mi = monthIndex(p.month);
    if (level0 === null || prevIdx === null) break;
    // Step month by month from the last known level, applying predicted Δ for each month.
    for (let m = prevIdx + 1; m <= mi; m += 1) {
      const a = polAt(m - lag);
      const b = polAt(m - lag - 1);
      const dPol = a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b) ? 0 : a - b;
      level0 += alpha + slope * dPol;
    }
    prevIdx = mi;
    points.push({ month: p.month, actual: p.ratePercent!, predicted: level0, error: level0 - p.ratePercent! });
  }
  return backtestFromPoints(
    'RepricingBeta',
    windowOf(train),
    { beta: slope, intercept: alpha, lagMonths: lag },
    points,
    options.tolerance ?? { metric: 'MAE', threshold: 0.25 },
  );
}
