// Regulatory/behavioural classification (build plan §6, screen 17) - the piece skills.md calls the Rules
// Engine: HQLA level, haircuts, LCR/ASF/RSF factors and rate-sensitivity are configured once per product and
// currency here, rather than typed by hand into every uploaded file. A department uploading Loans or Deposits
// data does not need to know what HQLA Level 2A means; they classify their book by product, and this applies
// the bank's regulatory treatment of that product to every matching position.
import type { Position } from './types';
import type { ProductAssumption } from './ruleTypes';

/** A currency of "" or "*" on a common-account row means "any currency". */
const ANY_CURRENCY = new Set(['', '*']);

/**
 * Finds the assumption for one position: its product + currency first; failing that, a row keyed by its
 * common account (common chart of accounts code) and currency, then a common-account row for any currency.
 * Common-account rows are the fallback that lets a bank classify a whole account family once instead of
 * product by product - a product row always wins over a common-account row.
 */
export function buildAssumptionLookup(
  assumptions: ProductAssumption[],
): (p: Pick<Position, 'productCode' | 'currency' | 'commonCoaCode'>) => ProductAssumption | undefined {
  const byProduct = new Map<string, ProductAssumption>();
  const byCoa = new Map<string, ProductAssumption>();
  const byCoaAny = new Map<string, ProductAssumption>();
  for (const a of assumptions) {
    if (a.commonCoaCode) {
      if (ANY_CURRENCY.has(a.currency ?? '')) byCoaAny.set(a.commonCoaCode, a);
      else byCoa.set(`${a.commonCoaCode}|${a.currency}`, a);
    } else if (a.productCode) {
      byProduct.set(`${a.productCode}|${a.currency}`, a);
    }
  }
  return (p) =>
    byProduct.get(`${p.productCode}|${p.currency}`) ??
    (p.commonCoaCode ? (byCoa.get(`${p.commonCoaCode}|${p.currency}`) ?? byCoaAny.get(p.commonCoaCode)) : undefined);
}

/**
 * Overrides a position's classification fields from the matching assumption (product + currency, else its
 * common account - see buildAssumptionLookup), where one exists. Positions with no matching row pass through
 * with whatever the source file supplied - an unconfigured product is a gap to close in the rule, not a
 * reason to fail the run.
 */
export function applyProductCharacteristics(positions: Position[], assumptions: ProductAssumption[]): Position[] {
  if (assumptions.length === 0) return positions;

  const lookup = buildAssumptionLookup(assumptions);

  return positions.map((p) => {
    const assumption = lookup(p);
    if (!assumption) return p;
    // A factor the rule leaves blank is "not set by this rule", not "zero": the value the source file
    // carried stands. Otherwise a rule written only to add LCR/NSFR factors silently wipes each loan's
    // uploaded duration, collapsing the duration-gap view to 0 years.
    return {
      ...p,
      hqlaLevel: assumption.hqlaLevel,
      hqlaHaircutPct: assumption.hqlaHaircutPct,
      lcrCashflowRole: assumption.lcrCashflowRole,
      lcrRatePct: assumption.lcrRatePct ?? p.lcrRatePct,
      asfFactorPct: assumption.asfFactorPct ?? p.asfFactorPct,
      rsfFactorPct: assumption.rsfFactorPct ?? p.rsfFactorPct,
      approxDurationYears: assumption.approxDurationYears ?? p.approxDurationYears,
      irrbbRateSensitive: assumption.isRateSensitive,
    };
  });
}

/** Positions with no configured assumption (neither their product nor their common account) - surfaced so a gap in the rule is visible, not silent. */
export function unclassifiedProducts(
  positions: Position[],
  assumptions: ProductAssumption[],
): Array<{ productCode: string; currency: string; count: number }> {
  const lookup = buildAssumptionLookup(assumptions);
  const missing = new Map<string, { productCode: string; currency: string; count: number }>();
  for (const p of positions) {
    if (lookup(p)) continue;
    const key = `${p.productCode}|${p.currency}`;
    const entry = missing.get(key) ?? { productCode: p.productCode, currency: p.currency, count: 0 };
    entry.count += 1;
    missing.set(key, entry);
  }
  return Array.from(missing.values()).sort((a, b) => b.count - a.count);
}
