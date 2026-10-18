import type { CurrencyCode, IsoDate, Position, TimeBucketLadder } from './types';
import { bucketize, type BucketedTotal } from './buckets';
import { convert, type FxTable } from './fx';
import { betaFor, type DepositBeta } from './behavioural';
import { daysBetween } from './dates';
import { defaultCurveFor, type YieldCurve } from './curves';
import { bucketCashflows, presentValue, repricingCashflows, shiftCurve, type PositionCashflows } from './cashflow';

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
  /**
   * Deposit pass-through by behavioural tag, from the run's Behaviour Pattern rule. When present,
   * NII sensitivity damps each deposit's repricing by its beta and treats non-maturity deposits as
   * administered-rate (repricing within the horizon, at management's discretion). Absent means
   * 100% pass-through and non-maturity deposits outside the gap - the plain gap approximation.
   */
  depositBetas?: DepositBeta[];
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

/**
 * A per-bucket shock as a function of tenor: the shock of the ladder bucket the tenor falls in. This is what
 * moves each point of a yield curve under a non-parallel scenario (steepener, short-rate up...).
 */
export function shockAtTenor(ladder: TimeBucketLadder, shock: ShockByBucket): (tenorDays: number) => number {
  return (tenorDays: number) => {
    for (const bucket of ladder.buckets) {
      if (bucket.upperBoundDays === null || tenorDays <= bucket.upperBoundDays) return shock[bucket.label] ?? 0;
    }
    const last = ladder.buckets[ladder.buckets.length - 1];
    return last ? (shock[last.label] ?? 0) : 0;
  };
}

function amountIn(p: Position, ctx: IrrbbContext): number {
  return convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
}

// ─────────────────────────────────────────────────────────────────────────
// Repricing gap
// ─────────────────────────────────────────────────────────────────────────

export interface RepricingGapResult {
  buckets: BucketedTotal[];
  /** Rate-sensitive balances with no repricing or cashflow date. Absent on runs computed before it existed. */
  undated?: { assets: number; liabilities: number };
  source?: 'Cashflows' | 'Balances';
  currency: CurrencyCode;
  methodology: string;
}

/**
 * Repricing gap. With the run's cashflow `book`, each position's behavioural principal is bucketed on the
 * date it reprices: a floating instrument's whole outstanding balance at its next reset, a fixed-rate
 * instrument's principal as each instalment (or prepayment) is repaid and re-lent, a non-maturity deposit
 * over its behavioural run-off tiers. Without a book, each balance sits whole on its next repricing date,
 * falling back to maturity.
 */
export function computeRepricingGap(
  positions: Position[],
  ctx: IrrbbContext,
  ladder: TimeBucketLadder,
  book?: PositionCashflows[],
): RepricingGapResult {
  const toReporting = (amount: number, currency: CurrencyCode) =>
    convert(amount, currency, ctx.reportingCurrency, ctx.fx);

  if (book) {
    const bucketed = bucketCashflows(book, ladder, ctx.asOfDate, 'Behavioural', {
      view: 'Repricing',
      convert: toReporting,
    });
    return {
      buckets: bucketed.buckets,
      undated: bucketed.undated,
      source: 'Cashflows',
      currency: ctx.reportingCurrency,
      methodology:
        "Repricing gap from the run's cashflow book (behavioural basis): a floating or administered-rate " +
        "instrument's outstanding balance is bucketed at its next reset; a fixed-rate instrument's principal " +
        'reprices as each instalment or prepayment is repaid and re-lent; a non-maturity deposit reprices over ' +
        'its behaviour pattern run-off tiers. The same cashflows feed the liquidity gap, NII, EVE and transfer ' +
        'pricing. Positions flagged as not rate-sensitive are routed to the Non-Rate-Sensitive bucket; ' +
        'rate-sensitive balances with no date at all are reported as not bucketed rather than dropped.',
    };
  }

  const undated = { assets: 0, liabilities: 0 };
  for (const p of positions) {
    if (!p.irrbbRateSensitive || p.nextRepricingDate || p.maturityDate) continue;
    if (p.category === 'Asset') undated.assets += amountIn(p, ctx);
    else undated.liabilities += amountIn(p, ctx);
  }
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
    undated,
    source: 'Balances',
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
  /** Beta-adjusted when deposit betas were supplied; otherwise equal to `unadjustedDeltaNii`. */
  deltaNii: number;
  /** ΔNII at 100% deposit pass-through. */
  unadjustedDeltaNii: number;
  depositBetasApplied: boolean;
  /** Rate-sensitive deposit balance that does not reprice because deposits lag the market. */
  liabilityRepricingReduction: number;
  /**
   * True when ΔNII weights each repricing amount by the share of the horizon left after it reprices
   * (Σ amount × (H − t)/H), from the run's cashflow book. False for the plain full-horizon gap approximation.
   * Absent on runs computed before it existed.
   */
  timeWeighted?: boolean;
  timeWeightedAssets?: number;
  timeWeightedLiabilities?: number;
  niiSensitivityPercent: number | null;
  horizonDays: number;
  shockBps: number;
  currency: CurrencyCode;
  methodology: string;
}

/** No contractual date and a behavioural tag: an administered-rate deposit that reprices when management moves it. */
function isNonMaturityDeposit(p: Position): boolean {
  return p.category === 'Liability' && p.behaviouralTag !== 'N/A' && !p.nextRepricingDate && !p.maturityDate;
}

function baseInterest(positions: Position[], ctx: IrrbbContext) {
  const interestIncome = positions
    .filter((p) => p.category === 'Asset')
    .reduce((s, p) => s + amountIn(p, ctx) * ((p.interestRatePct ?? 0) / 100), 0);
  const interestExpense = positions
    .filter((p) => p.category === 'Liability')
    .reduce((s, p) => s + amountIn(p, ctx) * ((p.interestRatePct ?? 0) / 100), 0);
  return { interestIncome, interestExpense, baseNii: interestIncome - interestExpense };
}

// Without a book: `ΔNII = repricing gap within the horizon × shock`, the standard gap approximation - it
// assumes every repricing instrument reprices fully and immediately. With the run's cashflow book, each
// repricing flow is time-weighted by the share of the horizon left after it reprices. Either way, where
// `ctx.depositBetas` is supplied (the run's Behaviour Pattern rule), the liability leg is damped by each
// deposit type's beta - assets reprice contractually, deposits at management's discretion. Rate caps and
// floors are not applied.
export function computeNiiSensitivity(
  positions: Position[],
  ctx: IrrbbContext,
  shockBps: number,
  horizonDays = 365,
  book?: PositionCashflows[],
): NiiResult {
  if (book) return niiFromCashflows(positions, ctx, shockBps, horizonDays, book);

  const betas = ctx.depositBetas;
  const withinHorizon = (p: Position) => {
    // A non-maturity deposit has no repricing date, but its rate is administered - with a beta rule it
    // reprices inside the horizon to the extent of its beta, rather than being left out of the gap.
    if (betas && isNonMaturityDeposit(p)) return true;
    const date = p.nextRepricingDate ?? p.maturityDate;
    if (!date) return false;
    return daysBetween(ctx.asOfDate, date) <= horizonDays;
  };

  const sensitive = positions.filter((p) => p.irrbbRateSensitive && withinHorizon(p));
  const rateSensitiveAssets = sensitive.filter((p) => p.category === 'Asset').reduce((s, p) => s + amountIn(p, ctx), 0);
  const rateSensitiveLiabilities = sensitive
    .filter((p) => p.category !== 'Asset')
    .reduce((s, p) => s + amountIn(p, ctx), 0);
  const liabilityRepricingReduction = betas
    ? sensitive
        .filter((p) => p.category === 'Liability')
        .reduce((s, p) => s + amountIn(p, ctx) * (1 - betaFor(p.behaviouralTag, betas)), 0)
    : 0;

  const { interestIncome, interestExpense, baseNii } = baseInterest(positions, ctx);
  const repricingGap = rateSensitiveAssets - rateSensitiveLiabilities;
  const unadjustedDeltaNii = repricingGap * (shockBps / 10_000);
  // Liabilities that do not reprice cost no extra interest, so the damped gap is the raw gap plus the
  // non-repriced share.
  const deltaNii = (repricingGap + liabilityRepricingReduction) * (shockBps / 10_000);

  return {
    rateSensitiveAssets,
    rateSensitiveLiabilities,
    repricingGap,
    interestIncome,
    interestExpense,
    baseNii,
    deltaNii,
    unadjustedDeltaNii,
    depositBetasApplied: betas !== undefined,
    liabilityRepricingReduction,
    timeWeighted: false,
    niiSensitivityPercent: baseNii !== 0 ? (deltaNii / baseNii) * 100 : null,
    horizonDays,
    shockBps,
    currency: ctx.reportingCurrency,
    methodology:
      'ΔNII = (rate-sensitive assets − rate-sensitive liabilities repricing within the horizon) × shock. A gap ' +
      'approximation: it assumes full, immediate repricing at the shocked rate. Rate caps and floors are not ' +
      'applied. ' +
      (betas
        ? 'Deposit betas from the Behaviour Pattern rule damp the liability leg: each deposit reprices by its ' +
          "type's beta, and non-maturity deposits are treated as administered-rate, repricing within the horizon. "
        : 'Deposit pass-through is 100% and non-maturity deposits sit outside the gap - no beta rule was applied. ') +
      'Sensitivity is expressed against base net interest income, not against capital.',
  };
}

function niiFromCashflows(
  positions: Position[],
  ctx: IrrbbContext,
  shockBps: number,
  horizonDays: number,
  book: PositionCashflows[],
): NiiResult {
  const betas = ctx.depositBetas;
  const byId = new Map(positions.map((p) => [p.id, p]));
  let rateSensitiveAssets = 0;
  let rateSensitiveLiabilities = 0;
  let timeWeightedAssets = 0;
  let timeWeightedLiabilities = 0;
  let liabilityRepricingReduction = 0;
  let timeWeightedReduction = 0;

  for (const pc of book) {
    const p = byId.get(pc.positionId);
    if (!p || !pc.rateSensitive) continue;
    // An administered-rate deposit reprices when management moves it, so with a beta rule its whole
    // balance reprices at once (to the extent of its beta); otherwise it follows its repricing cashflows.
    const flows: Array<{ days: number; amount: number }> =
      betas && isNonMaturityDeposit(p)
        ? [{ days: 0, amount: p.amount }]
        : repricingCashflows(pc, 'Behavioural').cashflows.map((f) => ({
            days: Math.max(0, daysBetween(ctx.asOfDate, f.date)),
            amount: f.principal,
          }));
    const beta = betas && p.category === 'Liability' ? betaFor(p.behaviouralTag, betas) : 1;

    for (const f of flows) {
      if (f.days > horizonDays || f.amount === 0) continue;
      const amount = convert(f.amount, p.currency, ctx.reportingCurrency, ctx.fx);
      const weight = horizonDays > 0 ? (horizonDays - f.days) / horizonDays : 0;
      if (pc.isAsset) {
        rateSensitiveAssets += amount;
        timeWeightedAssets += amount * weight;
      } else {
        rateSensitiveLiabilities += amount;
        timeWeightedLiabilities += amount * weight;
        if (betas && p.category === 'Liability') {
          liabilityRepricingReduction += amount * (1 - beta);
          timeWeightedReduction += amount * weight * (1 - beta);
        }
      }
    }
  }

  const { interestIncome, interestExpense, baseNii } = baseInterest(positions, ctx);
  const repricingGap = rateSensitiveAssets - rateSensitiveLiabilities;
  const unadjustedDeltaNii = (timeWeightedAssets - timeWeightedLiabilities) * (shockBps / 10_000);
  const deltaNii = (timeWeightedAssets - timeWeightedLiabilities + timeWeightedReduction) * (shockBps / 10_000);

  return {
    rateSensitiveAssets,
    rateSensitiveLiabilities,
    repricingGap,
    interestIncome,
    interestExpense,
    baseNii,
    deltaNii,
    unadjustedDeltaNii,
    depositBetasApplied: betas !== undefined,
    liabilityRepricingReduction,
    timeWeighted: true,
    timeWeightedAssets,
    timeWeightedLiabilities,
    niiSensitivityPercent: baseNii !== 0 ? (deltaNii / baseNii) * 100 : null,
    horizonDays,
    shockBps,
    currency: ctx.reportingCurrency,
    methodology:
      `ΔNII over ${horizonDays} days from the run's cashflow book: every principal amount repricing within the ` +
      'horizon - a floating reset, a fixed-rate instalment or prepayment repaid and re-lent, a deposit run-off ' +
      'tier - earns or pays the shock only for the part of the horizon left after it reprices, ' +
      'ΔNII = Σ amount × (H − t)/H × shock (assets less liabilities). Constant balance sheet, no caps or floors. ' +
      (betas
        ? 'Deposit betas from the Behaviour Pattern rule damp the liability leg: each deposit reprices by its ' +
          "type's beta, and non-maturity deposits are administered-rate, repricing at once to the extent of their beta. "
        : 'Deposit pass-through is 100%; non-maturity deposits reprice over their behavioural run-off tiers. ') +
      'Sensitivity is expressed against base net interest income, not against capital.',
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
  /**
   * 'CashflowPv' when every rate-sensitive balance was revalued by discounting its cashflows; 'Mixed' when
   * some had no curve (or no dated cashflow) and fell back to duration; 'DurationGap' when none could be
   * discounted. Absent on runs computed before cash-flow EVE existed (all duration gap).
   */
  method?: 'CashflowPv' | 'Mixed' | 'DurationGap';
  /** ΔEVE from discounting cashflows on the base and shocked curves. */
  deltaEveCashflow?: number;
  /** ΔEVE estimated by duration for the balances that could not be discounted. */
  deltaEveDurationFallback?: number;
  /** Balance (reporting currency) not valued by discounting - no curve for its currency, or no dated cashflow. */
  unvalued?: number;
  /** Present value of the discounted cashflows on the base curve. */
  baseEconomicValue?: { assets: number; liabilities: number; net: number };
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

/** What cash-flow EVE needs: the run's book, its curves, and optionally a tenor-dependent shock. */
export interface EveValuationInputs {
  book: PositionCashflows[];
  curves: YieldCurve[];
  /** Shock in bps as a function of tenor days. Absent means a parallel `shockBps`. */
  shockAtTenor?: (tenorDays: number) => number;
}

// Without valuation inputs, ΔEVE by the duration-gap method: `DGap = D_assets − (L / A) × D_liabilities`,
// `ΔEVE = −DGap × A × Δr` - a parallel, linear approximation. With the run's cashflow book and curves, each
// rate-sensitive position's behavioural repricing cashflows are discounted on its curve before and after the
// shock (tenor by tenor for a non-parallel scenario), so prepayment and deposit run-off move EVE.
export function computeEveSensitivity(
  positions: Position[],
  ctx: IrrbbContext,
  shockBps: number,
  valuation?: EveValuationInputs,
): EveResult {
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

  const capital = ctx.tier1Capital ?? equity;
  const capitalBasis = ctx.tier1Capital !== null ? 'Tier 1 capital' : 'Balance-sheet equity';

  const finish = (
    deltaEve: number | null,
    pv01: number | null,
    extra: Partial<EveResult>,
    methodology: string,
  ): EveResult => {
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
      ...extra,
      currency: ctx.reportingCurrency,
      methodology,
    };
  };

  if (valuation) {
    const v = valueByCashflows(positions, ctx, shockBps, valuation);
    if (v.valued > 0) {
      const method = v.unvalued > 0 ? 'Mixed' : 'CashflowPv';
      return finish(
        v.deltaCashflow + v.deltaFallback,
        v.pv01,
        {
          method,
          deltaEveCashflow: v.deltaCashflow,
          deltaEveDurationFallback: v.deltaFallback,
          unvalued: v.unvalued,
          baseEconomicValue: v.base,
        },
        "ΔEVE by discounting the run's cashflow book: each rate-sensitive position's behavioural repricing " +
          'cashflows (principal and interest, to the next reset for floating instruments; prepayment, deposit ' +
          "run-off and term-deposit roll-over applied) are present-valued on its currency's curve, before and " +
          'after the shock' +
          (valuation.shockAtTenor
            ? ', the shock applied point by point along the curve by tenor'
            : ', a parallel shift') +
          '. ΔEVE = Δ(PV assets) − Δ(PV liabilities); capital and non-rate-sensitive items are excluded. ' +
          (method === 'Mixed'
            ? 'Balances with no curve for their currency, or no dated cashflow, are estimated by duration ' +
              '(−D × balance × Δr) and reported as unvalued. '
            : '') +
          `The supervisory outlier test compares |ΔEVE| against 15% of ${capitalBasis.toLowerCase()}.`,
      );
    }
  }

  const deltaEve = durationGap !== null ? -durationGap * (shockBps / 10_000) * totalAssets : null;
  const pv01 = durationGap !== null ? -durationGap * (1 / 10_000) * totalAssets : null;

  return finish(
    deltaEve,
    pv01,
    valuation
      ? { method: 'DurationGap', unvalued: totalAssets + totalLiabilities, deltaEveDurationFallback: deltaEve ?? 0 }
      : {},
    'ΔEVE by duration gap: DGap = D(assets) − (L/A) × D(liabilities); ΔEVE = −DGap × A × Δr. Assumes a ' +
      'parallel shift and linear price sensitivity - convexity and optionality are not modelled' +
      (valuation
        ? ". No yield curve was available for the book's currencies, so cash-flow discounting could not be " +
          'used and the whole book is reported as unvalued. '
        : ", and cash-flow discounting needs the run's cashflow book and curves. ") +
      `The supervisory outlier test compares |ΔEVE| against 15% of ${capitalBasis.toLowerCase()}.`,
  );
}

function valueByCashflows(positions: Position[], ctx: IrrbbContext, shockBps: number, valuation: EveValuationInputs) {
  const byId = new Map(positions.map((p) => [p.id, p]));
  const shockFn = valuation.shockAtTenor ?? (() => shockBps);
  const toReporting = (amount: number, p: Position) => convert(amount, p.currency, ctx.reportingCurrency, ctx.fx);
  const out = {
    deltaCashflow: 0,
    deltaFallback: 0,
    pv01: 0,
    valued: 0,
    unvalued: 0,
    base: { assets: 0, liabilities: 0, net: 0 },
  };
  const shocked = new Map<YieldCurve, { shocked: YieldCurve; bumped: YieldCurve }>();

  const fallback = (p: Position, amount: number, sign: number) => {
    const d = p.approxDurationYears ?? 0;
    out.deltaFallback += sign * -d * amount * (shockFn(d * 365) / 10_000);
    out.pv01 += sign * -d * amount * (1 / 10_000);
    out.unvalued += amount;
  };

  for (const pc of valuation.book) {
    const p = byId.get(pc.positionId);
    if (!p || p.category === 'Capital' || p.isOffBalanceSheet || !pc.rateSensitive) continue;
    const sign = p.category === 'Asset' ? 1 : -1;
    const curve = defaultCurveFor(valuation.curves, p.currency, p.rateIndexCode);
    const { cashflows, undatedPrincipal } = repricingCashflows(pc, 'Behavioural');
    if (!curve || cashflows.length === 0) {
      fallback(p, toReporting(p.amount, p), sign);
      continue;
    }
    let curves = shocked.get(curve);
    if (!curves) {
      curves = { shocked: shiftCurve(curve, shockFn), bumped: shiftCurve(curve, 1) };
      shocked.set(curve, curves);
    }
    const base = presentValue(cashflows, curve, ctx.asOfDate);
    const up = presentValue(cashflows, curves.shocked, ctx.asOfDate);
    const bp = presentValue(cashflows, curves.bumped, ctx.asOfDate);
    if (base === null || up === null || bp === null) {
      fallback(p, toReporting(p.amount, p), sign);
      continue;
    }
    out.deltaCashflow += sign * toReporting(up - base, p);
    out.pv01 += sign * toReporting(bp - base, p);
    out.valued += toReporting(p.amount - undatedPrincipal, p);
    if (sign > 0) out.base.assets += toReporting(base, p);
    else out.base.liabilities += toReporting(base, p);
    if (undatedPrincipal !== 0) fallback(p, toReporting(undatedPrincipal, p), sign);
  }
  out.base.net = out.base.assets - out.base.liabilities;
  return out;
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
 *
 * With `valuation` (the run's cashflow book and curves), EVE revalues the cashflows under each scenario's
 * own tenor-dependent shock - a steepener moves the short and long ends of the curve differently - and NII
 * is time-weighted on the same cashflows. Without it, the single-magnitude gap/duration approximations.
 */
export function computeAllShocks(
  positions: Position[],
  ctx: IrrbbContext,
  ladder: TimeBucketLadder,
  custom: CustomShock[] = [],
  valuation?: Omit<EveValuationInputs, 'shockAtTenor'>,
) {
  const shocks: Record<string, ShockByBucket> = { ...standardShocks(ladder) };
  const labels: Record<string, string> = { ...SHOCK_LABELS };
  for (const c of custom) {
    shocks[c.id] = c.shockByBucket;
    labels[c.id] = c.label;
  }

  const results: Record<string, { nii: NiiResult; eve: EveResult; label: string }> = {};

  for (const [name, curve] of Object.entries(shocks)) {
    // NII takes a single magnitude: the short-end shock, since NII is driven by near-term repricing. The
    // duration approximation of EVE takes the average across the curve; cash-flow EVE takes the whole shape.
    const values = Object.values(curve);
    const shortBps = values[0] ?? 0;
    const averageBps = values.reduce((s, v) => s + v, 0) / (values.length || 1);
    results[name] = {
      label: labels[name] ?? name,
      nii: computeNiiSensitivity(positions, ctx, shortBps, 365, valuation?.book),
      eve: computeEveSensitivity(
        positions,
        ctx,
        averageBps,
        valuation ? { ...valuation, shockAtTenor: shockAtTenor(ladder, curve) } : undefined,
      ),
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
