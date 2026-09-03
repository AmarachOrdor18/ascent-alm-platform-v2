import type { CurrencyCode, IsoDate, Position, TimeBucketLadder } from './types';
import { bucketize, type BucketedTotal } from './buckets';
import { convert, type FxTable } from './fx';

export interface IrrbbContext {
  asOfDate: IsoDate;
  reportingCurrency: CurrencyCode;
  fx: FxTable;
  /**
   * Tier 1 capital in the reporting currency. Supply the real regulatory
   * figure where it is known; otherwise pass the balance-sheet equity from
   * `computeEquity` and the result says which was used.
   */
  tier1Capital: number | null;
}

/** Shock in basis points, per bucket label. A flat shock applies the same value to every bucket. */
export type ShockByBucket = Record<string, number>;

// Generic shock shapes at a 200bp parallel magnitude; per-currency parametrisation is not implemented.
export function standardShocks(ladder: TimeBucketLadder): Record<string, ShockByBucket> {
  const labels = ladder.buckets.map((b) => b.label);
  const short = labels.slice(0, Math.ceil(labels.length / 2));
  const long = labels.slice(Math.ceil(labels.length / 2));

  const flat = (bps: number): ShockByBucket => Object.fromEntries(labels.map((l) => [l, bps]));
  const split = (shortBps: number, longBps: number): ShockByBucket =>
    Object.fromEntries([...short.map((l) => [l, shortBps]), ...long.map((l) => [l, longBps])]);

  return {
    parallelUp: flat(200),
    parallelDown: flat(-200),
    steepener: split(-65, 90),
    flattener: split(80, -60),
    shortRateUp: split(250, 0),
    shortRateDown: split(-250, 0),
  };
}

export const SHOCK_LABELS: Record<string, string> = {
  parallelUp: 'Parallel up (+200bp)',
  parallelDown: 'Parallel down (−200bp)',
  steepener: 'Steepener',
  flattener: 'Flattener',
  shortRateUp: 'Short rate up',
  shortRateDown: 'Short rate down',
};

function amountIn(p: Position, ctx: IrrbbContext): number {
  return convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
}

// ─────────────────────────────────────────────────────────────────────────
// Repricing gap
// ─────────────────────────────────────────────────────────────────────────

export interface RepricingGapResult {
  buckets: BucketedTotal[];
  currency: CurrencyCode;
  methodology: string;
}

/** Repricing gap buckets each position on its next repricing date, falling back to maturity for fixed-rate instruments which reprice only at maturity. */
export function computeRepricingGap(
  positions: Position[],
  ctx: IrrbbContext,
  ladder: TimeBucketLadder,
): RepricingGapResult {
  const buckets = bucketize(
    ladder,
    ctx.asOfDate,
    positions.map((p) => ({
      amount: amountIn(p, ctx),
      isAsset: p.category === 'Asset',
      date: p.nextRepricingDate ?? p.maturityDate,
      rateSensitive: p.irrbbRateSensitive,
    })),
  );

  return {
    buckets,
    currency: ctx.reportingCurrency,
    methodology:
      'Repricing gap by next repricing date, falling back to maturity date for fixed-rate instruments which ' +
      'reprice only at maturity. Positions flagged as not rate-sensitive are routed to the Non-Rate-Sensitive ' +
      'bucket rather than being dropped.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Net interest income sensitivity
// ─────────────────────────────────────────────────────────────────────────

export interface NiiResult {
  rateSensitiveAssets: number;
  rateSensitiveLiabilities: number;
  repricingGap: number;
  interestIncome: number;
  interestExpense: number;
  baseNii: number;
  deltaNii: number;
  niiSensitivityPercent: number | null;
  horizonDays: number;
  shockBps: number;
  currency: CurrencyCode;
  methodology: string;
}

// `ΔNII = repricing gap within the horizon × shock`, the standard gap approximation: it assumes every
// repricing instrument reprices fully and immediately. Rate caps, floors and deposit betas are not applied
// here - `applyDepositBetas` in `behavioural.ts` adjusts the liability side where a beta rule is configured.
export function computeNiiSensitivity(
  positions: Position[],
  ctx: IrrbbContext,
  shockBps: number,
  horizonDays = 365,
): NiiResult {
  const withinHorizon = (p: Position) => {
    const date = p.nextRepricingDate ?? p.maturityDate;
    if (!date) return false;
    const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${ctx.asOfDate}T00:00:00Z`)) / 86_400_000);
    return days <= horizonDays;
  };

  const sensitive = positions.filter((p) => p.irrbbRateSensitive && withinHorizon(p));
  const rateSensitiveAssets = sensitive.filter((p) => p.category === 'Asset').reduce((s, p) => s + amountIn(p, ctx), 0);
  const rateSensitiveLiabilities = sensitive
    .filter((p) => p.category !== 'Asset')
    .reduce((s, p) => s + amountIn(p, ctx), 0);

  const interestIncome = positions
    .filter((p) => p.category === 'Asset')
    .reduce((s, p) => s + amountIn(p, ctx) * ((p.interestRatePct ?? 0) / 100), 0);
  const interestExpense = positions
    .filter((p) => p.category === 'Liability')
    .reduce((s, p) => s + amountIn(p, ctx) * ((p.interestRatePct ?? 0) / 100), 0);

  const repricingGap = rateSensitiveAssets - rateSensitiveLiabilities;
  const baseNii = interestIncome - interestExpense;
  const deltaNii = repricingGap * (shockBps / 10_000);

  return {
    rateSensitiveAssets,
    rateSensitiveLiabilities,
    repricingGap,
    interestIncome,
    interestExpense,
    baseNii,
    deltaNii,
    niiSensitivityPercent: baseNii !== 0 ? (deltaNii / baseNii) * 100 : null,
    horizonDays,
    shockBps,
    currency: ctx.reportingCurrency,
    methodology:
      'ΔNII = (rate-sensitive assets − rate-sensitive liabilities repricing within the horizon) × shock. A gap ' +
      'approximation: it assumes full, immediate repricing at the shocked rate. Rate caps and floors are not ' +
      'applied, and deposit pass-through is 100% unless a deposit beta rule is configured. Sensitivity is ' +
      'expressed against base net interest income, not against capital.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Economic value of equity
// ─────────────────────────────────────────────────────────────────────────

export interface EveResult {
  assetDuration: number | null;
  liabilityDuration: number | null;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  durationGap: number | null;
  deltaEve: number | null;
  /** ΔEVE for a 1bp parallel move - the standard PV01 sensitivity figure, independent of `shockBps`. */
  pv01: number | null;
  eveSensitivityPercentOfEquity: number | null;
  eveSensitivityPercentOfTier1: number | null;
  /** BCBS supervisory outlier test: |ΔEVE| above 15% of Tier 1 capital. */
  isBaselOutlier: boolean | null;
  outlierThresholdPercent: number;
  capitalBasis: 'Tier 1 capital' | 'Balance-sheet equity';
  shockBps: number;
  currency: CurrencyCode;
  methodology: string;
}

/** Total of the Capital category. */
export function computeEquity(positions: Position[], ctx: IrrbbContext): number {
  return positions.filter((p) => p.category === 'Capital').reduce((s, p) => s + amountIn(p, ctx), 0);
}

/** Balance-weighted average duration over a subset. Null when the subset has no balance. */
function weightedDuration(positions: Position[], ctx: IrrbbContext): number | null {
  let weighted = 0;
  let total = 0;
  for (const p of positions) {
    const amount = amountIn(p, ctx);
    total += amount;
    weighted += amount * (p.approxDurationYears ?? 0);
  }
  return total > 0 ? weighted / total : null;
}

// ΔEVE by the duration-gap method: `DGap = D_assets − (L / A) × D_liabilities`, `ΔEVE = −DGap × A × Δr`.
// A genuine approximation - assumes a parallel shift and linear price sensitivity, ignoring convexity and
// optionality.
export function computeEveSensitivity(positions: Position[], ctx: IrrbbContext, shockBps: number): EveResult {
  const assets = positions.filter((p) => p.category === 'Asset');
  const liabilities = positions.filter((p) => p.category === 'Liability');

  const totalAssets = assets.reduce((s, p) => s + amountIn(p, ctx), 0);
  const totalLiabilities = liabilities.reduce((s, p) => s + amountIn(p, ctx), 0);
  const equity = computeEquity(positions, ctx);

  const assetDuration = weightedDuration(assets, ctx);
  const liabilityDuration = weightedDuration(liabilities, ctx);

  const durationGap =
    assetDuration !== null && liabilityDuration !== null && totalAssets > 0
      ? assetDuration - (totalLiabilities / totalAssets) * liabilityDuration
      : null;

  const deltaEve = durationGap !== null ? -durationGap * (shockBps / 10_000) * totalAssets : null;
  const pv01 = durationGap !== null ? -durationGap * (1 / 10_000) * totalAssets : null;

  const capital = ctx.tier1Capital ?? equity;
  const capitalBasis = ctx.tier1Capital !== null ? 'Tier 1 capital' : 'Balance-sheet equity';
  const percentOfCapital = deltaEve !== null && capital > 0 ? (deltaEve / capital) * 100 : null;

  return {
    assetDuration,
    liabilityDuration,
    totalAssets,
    totalLiabilities,
    equity,
    durationGap,
    deltaEve,
    pv01,
    eveSensitivityPercentOfEquity: deltaEve !== null && equity > 0 ? (deltaEve / equity) * 100 : null,
    eveSensitivityPercentOfTier1: ctx.tier1Capital !== null ? percentOfCapital : null,
    isBaselOutlier: percentOfCapital !== null ? Math.abs(percentOfCapital) > 15 : null,
    outlierThresholdPercent: 15,
    capitalBasis,
    shockBps,
    currency: ctx.reportingCurrency,
    methodology:
      'ΔEVE by duration gap: DGap = D(assets) − (L/A) × D(liabilities); ΔEVE = −DGap × A × Δr. Assumes a ' +
      'parallel shift and linear price sensitivity - convexity and optionality are not modelled, and full ' +
      'cash-flow discounting under each BCBS curve requires contract-level cash flows which are out of scope. ' +
      `The supervisory outlier test compares |ΔEVE| against 15% of ${capitalBasis.toLowerCase()}.`,
  };
}

/** A user-defined shock curve alongside the six standard ones - e.g. a saved ForecastScenarioRule. */
export interface CustomShock {
  id: string;
  label: string;
  shockByBucket: ShockByBucket;
}

/**
 * Run every standardised shock plus any supplied custom scenarios, reporting the worst case - what
 * the outlier test is judged on. The six standard shocks are the BCBS-prescribed set; `custom` is
 * where an institution's own scenario (a saved ForecastScenarioRule) joins the same comparison.
 */
export function computeAllShocks(
  positions: Position[],
  ctx: IrrbbContext,
  ladder: TimeBucketLadder,
  custom: CustomShock[] = [],
) {
  const shocks: Record<string, ShockByBucket> = { ...standardShocks(ladder) };
  const labels: Record<string, string> = { ...SHOCK_LABELS };
  for (const c of custom) {
    shocks[c.id] = c.shockByBucket;
    labels[c.id] = c.label;
  }

  const results: Record<string, { nii: NiiResult; eve: EveResult; label: string }> = {};

  for (const [name, curve] of Object.entries(shocks)) {
    // The gap approximation takes a single magnitude; use the short-end
    // shock for NII (which is driven by near-term repricing) and the
    // average across the curve for EVE (which spans the balance sheet).
    const values = Object.values(curve);
    const shortBps = values[0] ?? 0;
    const averageBps = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    results[name] = {
      label: labels[name] ?? name,
      nii: computeNiiSensitivity(positions, ctx, shortBps),
      eve: computeEveSensitivity(positions, ctx, averageBps),
    };
  }

  const worst = Object.entries(results).reduce<{ name: string; deltaEve: number } | null>((acc, [name, r]) => {
    const value = r.eve.deltaEve;
    if (value === null) return acc;
    if (acc === null || value < acc.deltaEve) return { name, deltaEve: value };
    return acc;
  }, null);

  return { results, worstCase: worst };
}
