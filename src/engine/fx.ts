/**
 * Currency conversion.
 *
 * This module exists because of defect D-02: v1's aggregation helper was
 * literally `Number(p.amount)` with no currency check anywhere, so LCR,
 * NSFR, the maturity gap, loan-to-deposit and concentration all summed NGN,
 * GHS, XOF and USD as if they were one unit. Across a 33-affiliate Group
 * that makes every consolidated figure meaningless.
 *
 * OFSAA distinguishes three currency roles (ALM UG §7.6): a single
 * functional currency, reporting currencies that intermediate consolidation,
 * and other active currencies the institution transacts in.
 */

import type { CurrencyCode } from './types';

/** Rates expressed as units of the quote currency per one unit of the base. */
export interface FxRate {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  asOfDate: string;
}

export interface FxTable {
  /** The currency every rate is expressed against. */
  pivot: CurrencyCode;
  /** Units of pivot per one unit of the keyed currency. */
  toPivot: Record<CurrencyCode, number>;
  asOfDate: string;
}

export class MissingFxRateError extends Error {
  constructor(
    readonly from: CurrencyCode,
    readonly to: CurrencyCode,
  ) {
    super(`No FX rate available to convert ${from} to ${to}`);
    this.name = 'MissingFxRateError';
  }
}

/**
 * Convert an amount between currencies via the table's pivot.
 *
 * Throws rather than silently returning the unconverted amount when a rate
 * is missing. A wrong number that looks right is the failure mode this
 * module exists to prevent, so the caller is forced to handle it.
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, fx: FxTable): number {
  if (from === to) return amount;
  if (amount === 0) return 0;

  const fromRate = from === fx.pivot ? 1 : fx.toPivot[from];
  const toRate = to === fx.pivot ? 1 : fx.toPivot[to];
  if (fromRate === undefined || toRate === undefined || toRate === 0) {
    throw new MissingFxRateError(from, to);
  }
  return (amount * fromRate) / toRate;
}

/** True when every currency present can be converted to the target. */
export function canConvertAll(currencies: CurrencyCode[], to: CurrencyCode, fx: FxTable): boolean {
  return currencies.every((c) => c === to || c === fx.pivot || fx.toPivot[c] !== undefined);
}

/** Which currencies are missing a rate — used to explain a blocked run rather than failing opaquely. */
export function missingRates(currencies: CurrencyCode[], to: CurrencyCode, fx: FxTable): CurrencyCode[] {
  return Array.from(new Set(currencies)).filter((c) => c !== to && c !== fx.pivot && fx.toPivot[c] === undefined);
}

/**
 * Build a table from a list of pairwise rates.
 *
 * Rates quoted against the pivot are taken directly; the reciprocal is used
 * where a pair is quoted the other way round.
 */
export function buildFxTable(pivot: CurrencyCode, rates: FxRate[], asOfDate: string): FxTable {
  const toPivot: Record<CurrencyCode, number> = { [pivot]: 1 };
  for (const r of rates) {
    if (r.rate <= 0) continue;
    if (r.quote === pivot) toPivot[r.base] = r.rate;
    else if (r.base === pivot) toPivot[r.quote] = 1 / r.rate;
  }
  return { pivot, toPivot, asOfDate };
}

/** A single-currency table, for an affiliate reporting only in its own currency. */
export function identityFxTable(currency: CurrencyCode, asOfDate: string): FxTable {
  return { pivot: currency, toPivot: { [currency]: 1 }, asOfDate };
}
