import type { CurrencyCode, IsoDate, Position } from './types';
import { convert, type FxTable } from './fx';
import { addDays } from './dates';

export interface StressContext {
  asOfDate: IsoDate;
  reportingCurrency: CurrencyCode;
  fx: FxTable;
}

// ─────────────────────────────────────────────────────────────────────────
// Counterbalancing capacity
// ─────────────────────────────────────────────────────────────────────────

export interface CounterbalancingCapacity {
  unencumberedHqla: number;
  committedLinesAvailable: number;
  otherMarketableAssets: number;
  total: number;
  currency: CurrencyCode;
  methodology: string;
}

// Encumbered assets are excluded; only lines available to the bank count as capacity, not lines it has granted.
export function computeCounterbalancingCapacity(
  positions: Position[],
  ctx: StressContext,
  haircutPercent = 0,
): CounterbalancingCapacity {
  const haircut = haircutPercent / 100;

  /** Lien-free portion only, after haircut. */
  const eligible = (p: Position) =>
    convert(
      Math.max(0, p.amount - p.lienAmount) * Math.max(0, 1 - p.hqlaHaircutPct / 100 - haircut),
      p.currency,
      ctx.reportingCurrency,
      ctx.fx,
    );

  const unencumberedHqla = positions.filter((p) => p.lcrCashflowRole === 'HQLA').reduce((s, p) => s + eligible(p), 0);

  const committedLinesAvailable = positions
    .filter((p) => p.category === 'Asset' && p.isOffBalanceSheet && p.obsType === 'Undrawn Commitment')
    .reduce((s, p) => s + convert(p.undrawnAmount ?? 0, p.currency, ctx.reportingCurrency, ctx.fx), 0);

  const otherMarketableAssets = positions
    .filter((p) => p.category === 'Asset' && p.hqlaLevel !== 'None' && p.lcrCashflowRole !== 'HQLA')
    .reduce((s, p) => s + eligible(p), 0);

  return {
    unencumberedHqla,
    committedLinesAvailable,
    otherMarketableAssets,
    total: unencumberedHqla + committedLinesAvailable + otherMarketableAssets,
    currency: ctx.reportingCurrency,
    methodology:
      'Counterbalancing capacity = the lien-free portion of HQLA net of haircuts, plus committed undrawn lines ' +
      'available to the bank, plus other unencumbered marketable assets. Liens are netted as amounts rather than ' +
      'excluding the whole position, since pledges are usually partial. Commitments the bank has granted are ' +
      'outflows, not capacity, and are excluded.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Survival horizon
// ─────────────────────────────────────────────────────────────────────────

export interface OutflowProfile {
  /** Total outflow assumed over the scenario window, in the reporting currency. */
  totalOutflow: number;
  horizonDays: number;
  /** Share of the total that lands in the front-loaded phase. */
  frontLoadedPercent: number;
  frontLoadedDays: number;
}

export interface SurvivalDay {
  day: number;
  date: IsoDate;
  dailyOutflow: number;
  cumulativeOutflow: number;
  remainingBuffer: number;
  isExhausted: boolean;
}

export interface SurvivalHorizonResult {
  openingBuffer: number;
  timeline: SurvivalDay[];
  /** Days the buffer survives. Equal to `horizonDays` when it never depletes. */
  survivalHorizonDays: number;
  survivesFullHorizon: boolean;
  totalOutflow: number;
  currency: CurrencyCode;
  methodology: string;
}

// Assumed two-phase profile, not a behavioural model fitted to observed withdrawals.
export function computeSurvivalHorizon(
  openingBuffer: number,
  profile: OutflowProfile,
  ctx: StressContext,
): SurvivalHorizonResult {
  const { totalOutflow, horizonDays, frontLoadedPercent, frontLoadedDays } = profile;
  const tailDays = Math.max(1, horizonDays - frontLoadedDays);

  const frontDaily = frontLoadedDays > 0 ? (totalOutflow * (frontLoadedPercent / 100)) / frontLoadedDays : 0;
  const tailDaily = (totalOutflow * (1 - frontLoadedPercent / 100)) / tailDays;

  const timeline: SurvivalDay[] = [];
  let cumulative = 0;
  let survival = horizonDays;
  let breached = false;

  for (let day = 1; day <= horizonDays; day += 1) {
    const dailyOutflow = day <= frontLoadedDays ? frontDaily : tailDaily;
    cumulative += dailyOutflow;
    const remainingBuffer = openingBuffer - cumulative;
    const isExhausted = remainingBuffer < 0;

    if (isExhausted && !breached) {
      survival = day - 1;
      breached = true;
    }

    timeline.push({
      day,
      date: addDays(ctx.asOfDate, day),
      dailyOutflow,
      cumulativeOutflow: cumulative,
      remainingBuffer,
      isExhausted,
    });
  }

  return {
    openingBuffer,
    timeline,
    survivalHorizonDays: survival,
    survivesFullHorizon: !breached,
    totalOutflow,
    currency: ctx.reportingCurrency,
    methodology:
      `Two-phase outflow profile: ${frontLoadedPercent}% of the total stressed outflow over the first ` +
      `${frontLoadedDays} days, the remainder spread evenly across the rest of the ${horizonDays}-day window. ` +
      'The survival horizon is the last day the buffer remains non-negative. This is an assumed profile, not a ' +
      'behavioural model fitted to observed withdrawals - fitting one requires multi-period position history.',
  };
}

/** The standard severe scenario: a 30-day window with 55% of outflows in the first 10 days. */
export function severeOutflowProfile(totalOutflow: number): OutflowProfile {
  return { totalOutflow, horizonDays: 30, frontLoadedPercent: 55, frontLoadedDays: 10 };
}

// ─────────────────────────────────────────────────────────────────────────
// Reverse stress
// ─────────────────────────────────────────────────────────────────────────

export interface ReverseStressResult {
  targetSurvivalDays: number;
  /** The total stressed outflow that exhausts the buffer at (or as close as bisection reaches to) the target day. */
  solvedTotalOutflow: number;
  /** False only if the target day sits outside what a bounded search range can reach. */
  converged: boolean;
  timeline: SurvivalDay[];
  methodology: string;
}

/**
 * Solves backward from a target survival horizon to the outflow magnitude that produces it - "how severe a
 * run would it take to exhaust our buffer in N days?" rather than "given this run, how long do we survive?"
 * `survivalHorizonDays` is monotonically non-increasing in `totalOutflow` for a fixed profile shape, so this
 * is a plain bisection over the existing forward calculation - no new risk model, just run it backward.
 */
export function solveOutflowForSurvivalTarget(
  openingBuffer: number,
  baseProfile: Omit<OutflowProfile, 'totalOutflow'>,
  targetSurvivalDays: number,
  ctx: StressContext,
): ReverseStressResult {
  const clampedTarget = Math.max(0, Math.min(baseProfile.horizonDays, targetSurvivalDays));

  let lo = 0;
  let hi = Math.max(openingBuffer, 1) * 20;
  let best = computeSurvivalHorizon(openingBuffer, { ...baseProfile, totalOutflow: hi }, ctx);

  // 50 iterations is far more than needed for a one-day tolerance within this bound, and keeps the function
  // a fixed, deterministic amount of work regardless of input - no while-true risk.
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    const result = computeSurvivalHorizon(openingBuffer, { ...baseProfile, totalOutflow: mid }, ctx);
    best = result;
    if (result.survivalHorizonDays > clampedTarget) {
      lo = mid; // not severe enough yet - push the outflow up
    } else {
      hi = mid; // at or past the target - pull back to bracket it more tightly
    }
  }

  return {
    targetSurvivalDays: clampedTarget,
    solvedTotalOutflow: hi,
    converged: Math.abs(best.survivalHorizonDays - clampedTarget) <= 1,
    timeline: best.timeline,
    methodology:
      `Bisection over the same two-phase outflow model used forward: the total stressed outflow is searched ` +
      `until the buffer would be exhausted within ${clampedTarget} day(s), rather than assuming a scenario and ` +
      `reading off the result.`,
  };
}
