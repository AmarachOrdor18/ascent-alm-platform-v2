/**
 * Funds transfer pricing.
 *
 * Oracle splits TP methods into two families (ALM UG §7.18): cash-flow
 * methods, which need contract-level origination and maturity data, and
 * non-cash-flow methods, which work on ledger-grain balances. Oracle is
 * explicit that ledger data "does not have the required financial details to
 * generate cash flows, thus preventing you from applying cash flow
 * methodologies to this data".
 *
 * This platform is ledger-grain, so it implements the non-cash-flow family.
 * That is Oracle's own prescribed answer for this data shape, not a
 * simplification we invented.
 */

import type { CurrencyCode, Position } from './types';

export type TpMethod = 'SpreadFromInterestRateCode' | 'SpreadFromNoteRate' | 'RedemptionCurve' | 'MovingAverage';

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

// ─────────────────────────────────────────────────────────────────────────
// Adjustment rules — the add-on stack
// ─────────────────────────────────────────────────────────────────────────

export type AdjustmentType = 'LiquidityPremium' | 'BasisRiskCost' | 'PricingIncentive' | 'OtherAdjustment';

export interface AdjustmentRule {
  id: string;
  type: AdjustmentType;
  /** Applied to positions whose Common Chart of Accounts code matches, or all when null. */
  commonCoaCode: string | null;
  /** Fixed add-on in basis points, or a formula driven by current LCR. */
  method: 'FixedRate' | 'LcrDriven';
  fixedBps?: number;
  /** LcrDriven: bps = clamp((threshold − LCR) × multiplier, 0, cap). */
  lcrThresholdPercent?: number;
  lcrMultiplier?: number;
  lcrCapBps?: number;
}

/**
 * Resolve one adjustment to a basis-point add-on.
 *
 * The LCR-driven method makes internal funding more expensive as the
 * liquidity buffer thins, which is a real treasury policy shape. Its
 * coefficients are illustrative, not calibrated to Ecobank.
 */
export function resolveAdjustmentBps(rule: AdjustmentRule, currentLcrPercent: number | null): number {
  if (rule.method === 'FixedRate') return rule.fixedBps ?? 0;
  if (currentLcrPercent === null) return 0;
  const threshold = rule.lcrThresholdPercent ?? 130;
  const multiplier = rule.lcrMultiplier ?? 1.5;
  const cap = rule.lcrCapBps ?? 150;
  return Math.max(0, Math.min(cap, (threshold - currentLcrPercent) * multiplier));
}

export interface AdjustmentBreakdown {
  type: AdjustmentType;
  ruleId: string;
  bps: number;
}

/**
 * Stack every applicable adjustment onto a position.
 *
 * Oracle allows more than one adjustment type on a single product, so this
 * returns the full breakdown rather than a single blended number — RFP §2.1
 * asks specifically for "Base FTP and Liquidity Premium" as separable
 * components, and v1 produced only one group-wide premium.
 */
export function adjustmentsFor(
  position: Position,
  rules: AdjustmentRule[],
  currentLcrPercent: number | null,
): AdjustmentBreakdown[] {
  return rules
    .filter((r) => r.commonCoaCode === null || r.commonCoaCode === position.commonCoaCode)
    .map((r) => ({ type: r.type, ruleId: r.id, bps: resolveAdjustmentBps(r, currentLcrPercent) }))
    .filter((a) => a.bps !== 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Transfer rates
// ─────────────────────────────────────────────────────────────────────────

export interface TransferRateLine {
  positionId: string;
  productClass: string;
  currency: CurrencyCode;
  baseTransferRatePercent: number | null;
  adjustments: AdjustmentBreakdown[];
  totalAdjustmentBps: number;
  allInTransferRatePercent: number | null;
  method: TpMethod;
  /** Assets are charged the transfer rate; liabilities are credited it. */
  marginContribution: number | null;
}

export interface FtpResult {
  lines: TransferRateLine[];
  totalMarginContribution: number;
  byOrgUnit: Array<{ orgUnitCode: string; marginContribution: number }>;
  unpriced: number;
  methodology: string;
}

function tenorDaysFor(position: Position, asOfDate: string): number {
  const date = position.nextRepricingDate ?? position.maturityDate;
  if (!date) return 0;
  return Math.max(0, Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / 86_400_000));
}

/**
 * Compute transfer rates and FTP-adjusted margin.
 *
 * Standard treasury convention: an asset is *charged* the transfer rate for
 * the internal funds it consumes and keeps `(external rate − transfer rate)`;
 * a liability is *credited* the transfer rate for the funding it provides
 * and keeps `(transfer rate − external cost)`.
 *
 * Margin is attributed to the organisational unit. v1 attributed it to the
 * affiliate because position data carried no business-unit dimension — that
 * dimension now exists.
 */
export function computeFtp(
  positions: Position[],
  curves: YieldCurve[],
  adjustmentRules: AdjustmentRule[],
  options: { asOfDate: string; currentLcrPercent: number | null; method?: TpMethod },
): FtpResult {
  const method = options.method ?? 'SpreadFromInterestRateCode';
  const lines: TransferRateLine[] = [];
  let unpriced = 0;

  for (const p of positions) {
    if (p.category === 'Capital' || p.isOffBalanceSheet) continue;

    const curve =
      curves.find((c) => c.currency === p.currency && (p.rateIndexCode === null || c.indexCode === p.rateIndexCode)) ??
      curves.find((c) => c.currency === p.currency) ??
      null;

    const baseTransferRatePercent = curve ? interpolateCurve(curve, tenorDaysFor(p, options.asOfDate)) : null;
    const adjustments = adjustmentsFor(p, adjustmentRules, options.currentLcrPercent);
    const totalAdjustmentBps = adjustments.reduce((s, a) => s + a.bps, 0);
    const allIn = baseTransferRatePercent === null ? null : baseTransferRatePercent + totalAdjustmentBps / 100;

    // A position with no curve point or no external rate is left unpriced
    // rather than assumed to contribute zero margin, which would quietly
    // understate the book.
    const external = p.interestRatePct;
    const marginContribution =
      allIn === null || external === null
        ? null
        : p.category === 'Asset'
          ? ((external - allIn) / 100) * p.amount
          : ((allIn - external) / 100) * p.amount;

    if (marginContribution === null) unpriced += p.amount;

    lines.push({
      positionId: p.id,
      productClass: p.productClass,
      currency: p.currency,
      baseTransferRatePercent,
      adjustments,
      totalAdjustmentBps,
      allInTransferRatePercent: allIn,
      method,
      marginContribution,
    });
  }

  const byUnit = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    if (line.marginContribution === null) continue;
    const orgUnit =
      positions.filter((p) => p.category !== 'Capital' && !p.isOffBalanceSheet)[index]?.orgUnitCode ?? 'UNKNOWN';
    byUnit.set(orgUnit, (byUnit.get(orgUnit) ?? 0) + line.marginContribution);
  }

  return {
    lines,
    totalMarginContribution: lines.reduce((s, l) => s + (l.marginContribution ?? 0), 0),
    byOrgUnit: Array.from(byUnit.entries())
      .map(([orgUnitCode, marginContribution]) => ({ orgUnitCode, marginContribution }))
      .sort((a, b) => b.marginContribution - a.marginContribution),
    unpriced,
    methodology:
      'Non-cash-flow transfer pricing (Oracle ALM UG §7.18), which is the method family Oracle prescribes for ' +
      "ledger-grain data. Base transfer rate is read off the yield curve at the position's repricing tenor, then " +
      'adjustment rules stack on top as separate, named add-ons (liquidity premium, basis risk, pricing ' +
      'incentive). Assets are charged the all-in rate and keep the excess of their external rate; liabilities ' +
      'are credited it. Positions with no curve point or no external rate are reported as unpriced, not as zero.',
  };
}
