// Regulatory/behavioural classification (build plan §6, screen 17) - the piece skills.md calls the Rules
// Engine: HQLA level, haircuts, LCR/ASF/RSF factors and rate-sensitivity are configured once per product and
// currency here, rather than typed by hand into every uploaded file. A department uploading Loans or Deposits
// data does not need to know what HQLA Level 2A means; they classify their book by product, and this applies
// the bank's regulatory treatment of that product to every matching position.
import type { Position } from './types';
import type { ProductAssumption } from './ruleTypes';

/**
 * Overrides a position's classification fields from the matching product/currency assumption, where one
 * exists. Positions whose product/currency has no configured assumption pass through with whatever the
 * source file supplied - an unconfigured product is a gap to close in the rule, not a reason to fail the run.
 */
export function applyProductCharacteristics(positions: Position[], assumptions: ProductAssumption[]): Position[] {
  if (assumptions.length === 0) return positions;

  const byKey = new Map<string, ProductAssumption>();
  for (const a of assumptions) byKey.set(`${a.productCode}|${a.currency}`, a);

  return positions.map((p) => {
    const assumption = byKey.get(`${p.productCode}|${p.currency}`);
    if (!assumption) return p;
    return {
      ...p,
      hqlaLevel: assumption.hqlaLevel,
      hqlaHaircutPct: assumption.hqlaHaircutPct,
      lcrCashflowRole: assumption.lcrCashflowRole,
      lcrRatePct: assumption.lcrRatePct,
      asfFactorPct: assumption.asfFactorPct,
      rsfFactorPct: assumption.rsfFactorPct,
      approxDurationYears: assumption.approxDurationYears,
      irrbbRateSensitive: assumption.isRateSensitive,
    };
  });
}

/** Positions whose product/currency has no configured assumption - surfaced so a gap in the rule is visible, not silent. */
export function unclassifiedProducts(positions: Position[], assumptions: ProductAssumption[]): Array<{ productCode: string; currency: string; count: number }> {
  const known = new Set(assumptions.map((a) => `${a.productCode}|${a.currency}`));
  const missing = new Map<string, { productCode: string; currency: string; count: number }>();
  for (const p of positions) {
    const key = `${p.productCode}|${p.currency}`;
    if (known.has(key)) continue;
    const entry = missing.get(key) ?? { productCode: p.productCode, currency: p.currency, count: 0 };
    entry.count += 1;
    missing.set(key, entry);
  }
  return Array.from(missing.values()).sort((a, b) => b.count - a.count);
}
