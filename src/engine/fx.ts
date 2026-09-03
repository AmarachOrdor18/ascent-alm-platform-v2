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

// Throws rather than silently returning the unconverted amount when a rate is missing.
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

/** Which currencies are missing a rate - used to explain a blocked run rather than failing opaquely. */
export function missingRates(currencies: CurrencyCode[], to: CurrencyCode, fx: FxTable): CurrencyCode[] {
  return Array.from(new Set(currencies)).filter((c) => c !== to && c !== fx.pivot && fx.toPivot[c] === undefined);
}

// Rates are a dated series, same as a yield curve or a Position batch - a currency pair can carry
// several rows on file (one per date a rate was struck), and each is kept rather than overwritten.
// Only the row valid as of `asOfDate` - the latest one struck on or before it - is used; a rate struck
// later has no bearing on an earlier date's conversion. Rates quoted against the pivot are taken
// directly; the reciprocal is used where a pair is quoted the other way round.
export function buildFxTable(pivot: CurrencyCode, rates: FxRate[], asOfDate: string): FxTable {
  const toPivot: Record<CurrencyCode, number> = { [pivot]: 1 };
  const latestByCurrency = new Map<CurrencyCode, FxRate>();

  for (const r of rates) {
    if (r.rate <= 0 || r.asOfDate > asOfDate) continue;
    const currency = r.quote === pivot ? r.base : r.base === pivot ? r.quote : null;
    if (!currency) continue;
    const current = latestByCurrency.get(currency);
    if (!current || r.asOfDate > current.asOfDate) latestByCurrency.set(currency, r);
  }

  for (const [currency, r] of latestByCurrency) {
    toPivot[currency] = r.quote === pivot ? r.rate : 1 / r.rate;
  }
  return { pivot, toPivot, asOfDate };
}

/** A single-currency table, for an affiliate reporting only in its own currency. */
export function identityFxTable(currency: CurrencyCode, asOfDate: string): FxTable {
  return { pivot: currency, toPivot: { [currency]: 1 }, asOfDate };
}
