/**
 * Liquidity stress testing and survival horizon.
 *
 * RFP §2.1 requires stress testing "under a determined survival horizon".
 * v1 computed no survival horizon at all (defect D-07) — this module is that
 * requirement.
 *
 * It also adds counterbalancing capacity (defect P-10): the buffer a bank
 * can actually draw on under stress is its unencumbered liquid assets plus
 * committed undrawn lines, not simply its HQLA stock.
 */

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

/**
 * What the bank can realise under stress.
 *
 * Encumbered assets are excluded — pledged collateral cannot be sold twice.
 * Undrawn commitments the bank has *granted* are an outflow, not capacity;
 * only lines available *to* the bank count, which is why they are read from
 * the asset side.
 */
export function computeCounterbalancingCapacity(
  positions: Position[],
  ctx: StressContext,
  haircutPercent = 0,
): CounterbalancingCapacity {
  const haircut = haircutPercent / 100;
  const value = (p: Position, weight: number) => convert(p.amount * weight, p.currency, ctx.reportingCurrency, ctx.fx);

  const unencumberedHqla = positions
    .filter((p) => p.lcrCashflowRole === 'HQLA' && !p.isEncumbered)
    .reduce((s, p) => s + value(p, Math.max(0, 1 - p.hqlaHaircutPct / 100 - haircut)), 0);

  const committedLinesAvailable = positions
    .filter((p) => p.category === 'Asset' && p.isOffBalanceSheet && p.obsType === 'Undrawn Commitment')
    .reduce((s, p) => s + convert(p.undrawnAmount ?? 0, p.currency, ctx.reportingCurrency, ctx.fx), 0);

  const otherMarketableAssets = positions
    .filter((p) => p.category === 'Asset' && p.hqlaLevel !== 'None' && p.lcrCashflowRole !== 'HQLA' && !p.isEncumbered)
    .reduce((s, p) => s + value(p, Math.max(0, 1 - p.hqlaHaircutPct / 100 - haircut)), 0);

  return {
    unencumberedHqla,
    committedLinesAvailable,
    otherMarketableAssets,
    total: unencumberedHqla + committedLinesAvailable + otherMarketableAssets,
    currency: ctx.reportingCurrency,
    methodology:
      'Counterbalancing capacity = unencumbered HQLA net of haircuts, plus committed undrawn lines available to ' +
      'the bank, plus other unencumbered marketable assets. Encumbered assets are excluded: pledged collateral ' +
      'cannot be realised twice. Commitments the bank has granted are outflows, not capacity, and are excluded.',
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

/**
 * Day-by-day depletion of the liquidity buffer under a stressed outflow.
 *
 * The profile is two-phase — a front-loaded run followed by a steadier
 * tail — which is the shape a deposit run actually takes, and matches the
 * Ecobank mock workbook's stress sheet.
 *
 * This is an assumed profile, not a behavioural model fitted to observed
 * withdrawals. Fitting one needs multi-period history, which the platform
 * begins accumulating only once several as-of dates have been loaded.
 */
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

    // The survival horizon is the last day the buffer is still non-negative.
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
      'behavioural model fitted to observed withdrawals — fitting one requires multi-period position history.',
  };
}

/** The standard severe scenario: a 30-day window with 55% of outflows in the first 10 days. */
export function severeOutflowProfile(totalOutflow: number): OutflowProfile {
  return { totalOutflow, horizonDays: 30, frontLoadedPercent: 55, frontLoadedDays: 10 };
}
