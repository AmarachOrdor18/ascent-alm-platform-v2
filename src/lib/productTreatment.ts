// Liquidity treatment by product - onboarding's guided step (welcome/affiliateSteps LiquidityStep) and
// the affiliate readiness gate. Pure functions only, no React/repository, so onboarding stays unit-
// testable the same way lib/onboarding.ts is.
//
// Why this exists: an uploaded file's products are created automatically (productCodeFrom derives P-
// codes from the product class text), but nothing set their HQLA / LCR / ASF / RSF treatment, so LCR
// and NSFR reported the whole book "Not classified" - the gap surfaced only at run time with a "Fix
// this" link into the rules editor. Onboarding now closes it with the same lookup the engine runs
// (engine/classification.ts buildAssumptionLookup): rows are proposed per uncovered product, pre-filled
// from the product's common-account family, and saved through the ordinary maker-checker rule flow.
import type { ApprovalRequest, Position, RuleMeta } from '@/engine/types';
import type { ProductAssumption, ProductCharacteristicRule } from '@/engine/ruleTypes';
import { unclassifiedProducts } from '@/engine/classification';
import { pickApprovedRule } from '@/lib/ruleApproval';

/** The order positions sit on a product's COA family - mirrors the demo workbook's sheet 6 baselines. */
export interface CoaFamilyBaseline {
  lcrCashflowRole: ProductAssumption['lcrCashflowRole'];
  lcrRatePct: number | null;
  asfFactorPct: number | null;
  rsfFactorPct: number | null;
  hqlaLevel: ProductAssumption['hqlaLevel'];
  hqlaHaircutPct: number;
  isRateSensitive: boolean;
}

/** Keyword mapping over the family NAME (the common account's name, or the product class text), applied before a category fallback. */
export const STANDARD_COA_BASELINES: Array<[RegExp, CoaFamilyBaseline]> = [
  [/capital|equity|reserv/i, { lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: 100, rsfFactorPct: null, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: false }],
  [/borrow|issuance/i, { lcrCashflowRole: 'Outflow', lcrRatePct: 100, asfFactorPct: 100, rsfFactorPct: null, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true }],
  [/interbank/i, { lcrCashflowRole: 'Inflow', lcrRatePct: 50, asfFactorPct: null, rsfFactorPct: 15, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true }],
  [/treasur|bond|bill|securit/i, { lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 5, hqlaLevel: 'Level 1', hqlaHaircutPct: 0, isRateSensitive: true }],
  [/deposit|savings|current/i, { lcrCashflowRole: 'Outflow', lcrRatePct: 10, asfFactorPct: 90, rsfFactorPct: null, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true }],
  [/cash|central bank|vault|till|atm/i, { lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 0, hqlaLevel: 'Level 1', hqlaHaircutPct: 0, isRateSensitive: false }],
  [/loan|overdraft|credit|receivable/i, { lcrCashflowRole: 'Inflow', lcrRatePct: 50, asfFactorPct: null, rsfFactorPct: 85, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true }],
];

// Capital treated like the ownership position it is: fully available funding, no LCR cashflow, no RSF.
const CATEGORY_FALLBACK: Record<Position['category'], CoaFamilyBaseline> = {
  Asset: { lcrCashflowRole: 'Inflow', lcrRatePct: 50, asfFactorPct: null, rsfFactorPct: 85, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true },
  Liability: { lcrCashflowRole: 'Outflow', lcrRatePct: 10, asfFactorPct: 90, rsfFactorPct: null, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: true },
  Capital: { lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: 100, rsfFactorPct: null, hqlaLevel: 'None', hqlaHaircutPct: 0, isRateSensitive: false },
};

/** The rule a run would actually use: the affiliate's approved own rule, else the Group default - the same pick executeRun's caller makes. */
export function effectiveProductRule<ProductCharacteristicRuleMeta extends ProductCharacteristicRule & RuleMeta>(
  rules: ProductCharacteristicRuleMeta[],
  affiliateCode: string,
  requests: ApprovalRequest[],
): ProductCharacteristicRuleMeta | null {
  return pickApprovedRule(rules, affiliateCode, requests);
}

/** Uncovered products in the book under `assumptions` (the engine's own dedup + count). */
export function uncoveredProducts(
  positions: Position[],
  assumptions: ProductAssumption[],
): Array<{ productCode: string; currency: string; count: number }> {
  return unclassifiedProducts(positions, assumptions);
}

/**
 * The product's family treatment: the organisation's own default row for its common account first
 * (currency-specific, then any-currency), else a keyword baseline over the family name, else the
 * category fallback (asset = inflow/RSF, liability = outflow/ASF). The result is a PROPOSAL the user
 * reviews and edits - nothing is written without them saving it as a new rule version.
 */
export function defaultTreatment(
  position: Pick<Position, 'productCode' | 'currency' | 'category' | 'commonCoaCode' | 'productClass'>,
  orgRows: ProductAssumption[],
  coaName?: string,
): CoaFamilyBaseline {
  const own = position.commonCoaCode
    ? orgRows.find(
        (a) => a.commonCoaCode === position.commonCoaCode && (a.currency === '*' || a.currency === position.currency),
      )
    : undefined;
  if (own) {
    return {
      lcrCashflowRole: own.lcrCashflowRole,
      lcrRatePct: own.lcrRatePct,
      asfFactorPct: own.asfFactorPct,
      rsfFactorPct: own.rsfFactorPct,
      hqlaLevel: own.hqlaLevel,
      hqlaHaircutPct: own.hqlaHaircutPct,
      isRateSensitive: own.isRateSensitive,
    };
  }
  const text = coaName ?? position.productClass ?? '';
  const mapped = STANDARD_COA_BASELINES.find(([re]) => re.test(text))?.[1];
  return mapped ?? CATEGORY_FALLBACK[position.category];
}

/**
 * One proposed row per uncovered product (deduplicated by product|currency, followed by the highest
 * positions count): pre-filled from the COA family, keyed by product so the view stays explicit.
 */
export function proposedAssumptions(
  positions: Position[],
  assumptions: ProductAssumption[],
  coaNameOf: (coaCode: string) => string | undefined = () => undefined,
): ProductAssumption[] {
  const uncovered = uncoveredProducts(positions, assumptions);
  return uncovered.map(({ productCode, currency }) => {
    const sample = positions.find((p) => p.productCode === productCode && p.currency === currency)!;
    const baseline = defaultTreatment(sample, assumptions, coaNameOf(sample.commonCoaCode ?? ''));
    return {
      productCode,
      currency,
      commonCoaCode: undefined,
      ...baseline,
      approxDurationYears: null,
    };
  });
}
