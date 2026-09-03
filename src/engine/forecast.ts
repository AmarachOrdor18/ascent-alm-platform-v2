// Deterministic, period-by-period balance-sheet projection. Reuses the real calculation kernel
// (`executeRun`) unmodified for every period - this module's only job is producing a plausible
// *projected position book* per period; every risk metric on it is computed exactly the way a
// normal run computes it today, not a parallel/simplified calculation.
//
// Explicitly out of scope: origination pricing off a real yield curve (a flat margin over the
// maturing position's own rate is used instead); stochastic/Monte Carlo paths (one deterministic
// path per rule); forecasting FX rates or yield curves themselves (held flat at the base run's
// values). `TargetEndBalance`/`TargetAverageBalance` are both treated as an end-of-period target
// and only ever grow the book to reach it - trimming an existing lot down when the book is
// already above target is out of scope for this pass.
import { addDays, addMonths } from './dates';
import { defaultLadder, bucketMidpointYears } from './buckets';
import type { ForecastBalanceLine, ForecastMethod, NewBusinessRule } from './ruleTypes';
import type { IsoDate, Position, ProcessRun } from './types';
import { executeRun, type RunInputs, type RunOutcome } from './run';

const MATURITY_LADDER = defaultLadder('IncomeSimulation');

const keyOf = (p: Position): string => `${p.productCode}::${p.currency}`;
const lineKeyOf = (l: ForecastBalanceLine): string => `${l.productCode}::${l.currency}`;

const TARGET_METHODS = new Set<ForecastMethod>(['TargetEndBalance', 'TargetAverageBalance', 'NewAddBalance']);

function maturityDateFor(periodEnd: IsoDate, bucketLabel: string): IsoDate {
  const years = bucketMidpointYears(MATURITY_LADDER, bucketLabel) ?? 1;
  return addDays(periodEnd, Math.round(years * 365));
}

/** New volume for one line, tenor-spread across its `maturityMix`, shaped after `template`. */
function synthesizeFor(
  line: ForecastBalanceLine,
  amount: number,
  template: Position,
  periodEnd: IsoDate,
  suffix: string,
): Position[] {
  if (amount <= 0) return [];
  const entries = Object.entries(line.maturityMix).filter(([, share]) => share > 0);
  if (entries.length === 0) return [];

  return entries
    .map(([bucket, share], i): Position | null => {
      const lotAmount = amount * (share / 100);
      if (lotAmount <= 0) return null;
      return {
        ...template,
        id: `${template.id}#${suffix}${i}-${periodEnd}`,
        asOfDate: periodEnd,
        amount: lotAmount,
        originationDate: periodEnd,
        maturityDate: maturityDateFor(periodEnd, bucket),
        nextRepricingDate: template.rateType === 'Floating' ? maturityDateFor(periodEnd, bucket) : null,
        lastRepricingDate: null,
        interestRatePct: (template.interestRatePct ?? 0) + line.pricingMarginBps / 100,
        performingStatus: 'Performing',
        daysPastDue: null,
        provisionAmount: null,
        turnover: null,
        notes: `Projected new business - ${line.method}`,
      };
    })
    .filter((p): p is Position => p !== null);
}

/**
 * Projects one period forward: surviving positions carry over, maturing positions with no
 * matching `NewBusinessRule` line simply run off (today's implicit static assumption), and
 * maturing positions with a matching line get replaced/grown/topped-up per that line's method.
 */
export function projectOnePeriod(
  positions: Position[],
  lines: ForecastBalanceLine[],
  periodEnd: IsoDate,
): Position[] {
  const lineByKey = new Map(lines.map((l) => [lineKeyOf(l), l]));
  const surviving: Position[] = [];
  const maturingByKey = new Map<string, { total: number; template: Position }>();

  for (const p of positions) {
    const matures = p.maturityDate !== null && p.maturityDate <= periodEnd;
    if (!matures) {
      surviving.push({ ...p, asOfDate: periodEnd });
      continue;
    }
    const key = keyOf(p);
    if (!lineByKey.has(key)) continue; // no rule for this product/currency - runs off, no replacement
    const slot = maturingByKey.get(key) ?? { total: 0, template: p };
    slot.total += p.amount;
    maturingByKey.set(key, slot);
  }

  const result: Position[] = [...surviving];

  // Rollover-family lines reissue whatever matured for their key.
  for (const [key, { total, template }] of maturingByKey) {
    const line = lineByKey.get(key);
    if (!line || line.method === 'NoNewBusiness') continue;
    let reissueAmount = 0;
    if (line.method === 'Rollover') reissueAmount = total;
    else if (line.method === 'RolloverWithNewAdd') reissueAmount = total + line.value;
    else if (line.method === 'RolloverWithGrowth') reissueAmount = total * (1 + line.value / 100);
    result.push(...synthesizeFor(line, reissueAmount, template, periodEnd, 'RO'));
  }

  // TargetGrowthPercent scales every surviving position matching the line's key, in place -
  // organic growth of the existing book, not a distinguishable new lot.
  for (const line of lines) {
    if (line.method !== 'TargetGrowthPercent') continue;
    const key = lineKeyOf(line);
    for (let i = 0; i < result.length; i += 1) {
      if (keyOf(result[i]!) === key) {
        result[i] = { ...result[i]!, amount: result[i]!.amount * (1 + line.value / 100) };
      }
    }
  }

  // Target/new-add lines top the book up to a target, synthesizing one new lot for the shortfall.
  for (const line of lines) {
    if (!TARGET_METHODS.has(line.method)) continue;
    const key = lineKeyOf(line);
    const currentTotal = result.filter((p) => keyOf(p) === key).reduce((s, p) => s + p.amount, 0);
    const template = result.find((p) => keyOf(p) === key) ?? maturingByKey.get(key)?.template;
    if (!template) continue; // no position of this product/currency anywhere in the book to shape a new one on
    const target = line.method === 'NewAddBalance' ? currentTotal + line.value : line.value;
    const delta = target - currentTotal;
    if (delta > 0) result.push(...synthesizeFor(line, delta, template, periodEnd, 'TG'));
  }

  return result;
}

export interface ForecastPeriod {
  asOfDate: IsoDate;
  outcome: RunOutcome;
}

/**
 * Chains `projectOnePeriod` across `periodCount` periods and runs the real, unmodified
 * `executeRun` against each projected book. Never persisted (no `insertRunResults`/`upsertRun`
 * call) - a forecast is a hypothetical, not an auditable Process Run, and must not appear in Run
 * History or break the "results read from a run, never recomputed" invariant.
 */
export function runForecast(
  baseRun: ProcessRun,
  inputs: RunInputs,
  rule: NewBusinessRule | null,
  periodMonths: number,
  periodCount: number,
  now: string,
): ForecastPeriod[] {
  const lines = rule?.lines ?? [];
  const periods: ForecastPeriod[] = [];
  let currentBook = inputs.positions.filter((p) => p.asOfDate === baseRun.asOfDate);

  for (let n = 1; n <= periodCount; n += 1) {
    const periodEnd = addMonths(baseRun.asOfDate, periodMonths * n);
    currentBook = projectOnePeriod(currentBook, lines, periodEnd);

    const periodRun: ProcessRun = {
      ...baseRun,
      id: `${baseRun.id}-F${n}`,
      asOfDate: periodEnd,
      status: 'Draft',
      positionBatchIds: [],
    };
    const outcome = executeRun(periodRun, { ...inputs, positions: currentBook }, now);
    periods.push({ asOfDate: periodEnd, outcome });
  }

  return periods;
}
