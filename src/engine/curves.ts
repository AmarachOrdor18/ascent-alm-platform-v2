// Yield-curve primitives shared by transfer pricing (ftp.ts), the cashflow engine (cashflow.ts) and IRRBB
// valuation. Kept in their own module so ftp.ts and cashflow.ts can both depend on them without importing
// each other in a cycle. ftp.ts re-exports everything here, so existing `@/engine/ftp` imports keep working.

import type { CurrencyCode, IsoDate, StoredYieldCurve } from './types';

export interface CurvePoint {
  tenorDays: number;
  ratePercent: number;
}

export interface YieldCurve {
  currency: CurrencyCode;
  indexCode: string;
  points: CurvePoint[];
  asOfDate: string;
}

/**
 * A currency/index can carry several dated curves on file (a series, like an FX rate or a Position
 * batch), so resolving "the" curve for a calculation means picking the most recent one struck on or
 * before `asOfDate` - a curve published later did not exist yet, and an older one has since been
 * superseded. Every consumer that reads StoredYieldCurve directly (rather than through
 * runHooks.ts's already-deduped RunInputs) should resolve through this rather than `.find()`, which
 * only returns whichever happens to be first in array order.
 */
export function latestCurveAsOf(
  curves: StoredYieldCurve[],
  asOfDate: string,
  predicate: (c: StoredYieldCurve) => boolean,
): StoredYieldCurve | null {
  let best: StoredYieldCurve | null = null;
  for (const c of curves) {
    if (!c.isActive || c.asOfDate > asOfDate || !predicate(c)) continue;
    if (!best || c.asOfDate > best.asOfDate) best = c;
  }
  return best;
}

/**
 * Every currency/index's latest active curve struck on or before `asOfDate`, in engine form. This is what a
 * run consumes (runHooks.assembleInputs) and what any screen recomputing on a run's book must use, so both
 * read the same curves.
 */
export function engineCurvesAsOf(stored: StoredYieldCurve[], asOfDate: IsoDate): YieldCurve[] {
  const latest = new Map<string, StoredYieldCurve>();
  for (const c of stored) {
    if (!c.isActive || c.asOfDate > asOfDate) continue;
    const key = `${c.currency}|${c.code}`;
    const current = latest.get(key);
    if (!current || c.asOfDate > current.asOfDate) latest.set(key, c);
  }
  return Array.from(latest.values()).map((c) => ({
    currency: c.currency,
    indexCode: c.code,
    points: c.terms.map((t) => ({ tenorDays: t.tenorDays, ratePercent: t.ratePercent })),
    asOfDate: c.asOfDate,
  }));
}

/** Linear interpolation between the bracketing points; flat beyond either end. */
export function interpolateCurve(curve: YieldCurve, tenorDays: number): number | null {
  const points = [...curve.points].sort((a, b) => a.tenorDays - b.tenorDays);
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (tenorDays <= first.tenorDays) return first.ratePercent;
  if (tenorDays >= last.tenorDays) return last.ratePercent;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (tenorDays >= a.tenorDays && tenorDays <= b.tenorDays) {
      const span = b.tenorDays - a.tenorDays;
      if (span === 0) return a.ratePercent;
      return a.ratePercent + ((b.ratePercent - a.ratePercent) * (tenorDays - a.tenorDays)) / span;
    }
  }
  return last.ratePercent;
}

/**
 * The curve a position is priced or discounted on, absent an explicit assignment: its own index curve in
 * its currency where one exists, else the first curve in its currency. Null when its currency has none.
 */
export function defaultCurveFor(
  curves: YieldCurve[],
  currency: CurrencyCode,
  rateIndexCode: string | null,
): YieldCurve | null {
  return (
    curves.find((c) => c.currency === currency && (rateIndexCode === null || c.indexCode === rateIndexCode)) ??
    curves.find((c) => c.currency === currency) ??
    null
  );
}
