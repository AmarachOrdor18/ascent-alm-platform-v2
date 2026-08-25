/**
 * Behavioural modelling — non-maturity deposit run-off, prepayment, betas.
 *
 * RFP §2.1 asks, in these words, for the "Run off profile of customer
 * deposits based on type (Core/Non-Core)". v1 applied a single flat annual
 * decay rate per product regex and had no core/volatile concept at all.
 *
 * Oracle's mechanic (ALM UG Ch. 11.3) is the one adopted here: for each
 * non-maturity product, allocate its balance across tenor tiers, each tier
 * tagged Core or Volatile, percentages summing to 100%. That profile is what
 * makes a *behavioural* maturity ladder different from a contractual one —
 * v1's Behavioural/Contractual toggle rendered identical data in both modes
 * because no separate model existed.
 */

import type { BehaviouralTag, IsoDate, Position } from './types';
import { addDays } from './dates';

// ─────────────────────────────────────────────────────────────────────────
// Behaviour patterns
// ─────────────────────────────────────────────────────────────────────────

export type RunoffTierType = 'Core' | 'Volatile';

export interface RunoffTier {
  /** Days from the as-of date at which this share is assumed to run off. */
  tenorDays: number;
  /** Share of the balance running off at that tenor. Tiers must total 100. */
  percent: number;
  type: RunoffTierType;
}

export interface BehaviourPattern {
  id: string;
  name: string;
  /** Which deposits this pattern applies to. */
  appliesTo: BehaviouralTag[];
  tiers: RunoffTier[];
}

export class InvalidBehaviourPatternError extends Error {
  constructor(patternName: string, total: number) {
    super(`Behaviour pattern "${patternName}" allocates ${total.toFixed(2)}% — tiers must total 100%`);
    this.name = 'InvalidBehaviourPatternError';
  }
}

/** Oracle requires the tiers of a non-maturity pattern to sum to 100%. So do we. */
export function validateBehaviourPattern(pattern: BehaviourPattern): void {
  const total = pattern.tiers.reduce((s, t) => s + t.percent, 0);
  if (Math.abs(total - 100) > 0.0001) throw new InvalidBehaviourPatternError(pattern.name, total);
}

/**
 * Default patterns, calibrated to the Basel LCR deposit taxonomy.
 *
 * These are *assumptions*, not coefficients fitted to observed withdrawals.
 * Fitting requires multi-period position history, which the platform only
 * begins accumulating once several as-of dates have been loaded — the same
 * honest position v1 took, retained here.
 */
export const DEFAULT_PATTERNS: BehaviourPattern[] = [
  {
    id: 'BP-RETAIL-CORE',
    name: 'Retail — core deposits',
    appliesTo: ['Core'],
    tiers: [
      { tenorDays: 30, percent: 5, type: 'Volatile' },
      { tenorDays: 365, percent: 15, type: 'Core' },
      { tenorDays: 1095, percent: 40, type: 'Core' },
      { tenorDays: 1825, percent: 40, type: 'Core' },
    ],
  },
  {
    id: 'BP-RETAIL-NONCORE',
    name: 'Retail — non-core deposits',
    appliesTo: ['Non-Core'],
    tiers: [
      { tenorDays: 30, percent: 35, type: 'Volatile' },
      { tenorDays: 180, percent: 30, type: 'Volatile' },
      { tenorDays: 365, percent: 25, type: 'Core' },
      { tenorDays: 1095, percent: 10, type: 'Core' },
    ],
  },
  {
    id: 'BP-CORP-OPERATIONAL',
    name: 'Corporate — operational balances',
    appliesTo: ['Operational'],
    tiers: [
      { tenorDays: 30, percent: 15, type: 'Volatile' },
      { tenorDays: 365, percent: 45, type: 'Core' },
      { tenorDays: 1095, percent: 40, type: 'Core' },
    ],
  },
  {
    id: 'BP-CORP-NONOPERATIONAL',
    name: 'Corporate — non-operational balances',
    appliesTo: ['Non-Operational'],
    tiers: [
      { tenorDays: 30, percent: 60, type: 'Volatile' },
      { tenorDays: 180, percent: 25, type: 'Volatile' },
      { tenorDays: 365, percent: 15, type: 'Core' },
    ],
  },
];

export interface RunoffLine {
  positionId: string;
  productClass: string;
  behaviouralTag: BehaviouralTag;
  balance: number;
  coreAmount: number;
  volatileAmount: number;
  corePercent: number;
  patternName: string | null;
  /** Movement-based classification, which adjusts the split above. */
  activity: ActivityLevel;
}

export interface DepositRunoffResult {
  lines: RunoffLine[];
  totalDeposits: number;
  totalCore: number;
  totalVolatile: number;
  corePercent: number | null;
  unmodelled: number;
  methodology: string;
}

function patternFor(tag: BehaviouralTag, patterns: BehaviourPattern[]): BehaviourPattern | null {
  return patterns.find((p) => p.appliesTo.includes(tag)) ?? null;
}

/**
 * Split deposits into core and volatile balances.
 *
 * Deposits whose behavioural tag has no matching pattern are reported as
 * `unmodelled` rather than being defaulted into a core or volatile bucket —
 * inventing a split would be exactly the kind of plausible-looking figure
 * this codebase refuses to produce.
 */
export function computeDepositRunoff(
  positions: Position[],
  patterns: BehaviourPattern[] = DEFAULT_PATTERNS,
  stressMultiplier = 1,
): DepositRunoffResult {
  patterns.forEach(validateBehaviourPattern);

  const deposits = positions.filter((p) => p.category === 'Liability' && p.behaviouralTag !== 'N/A');
  const lines: RunoffLine[] = [];
  let unmodelled = 0;

  for (const p of deposits) {
    const pattern = patternFor(p.behaviouralTag, patterns);
    if (!pattern) {
      unmodelled += p.amount;
      lines.push({
        positionId: p.id,
        productClass: p.productClass,
        behaviouralTag: p.behaviouralTag,
        balance: p.amount,
        coreAmount: 0,
        volatileAmount: 0,
        corePercent: 0,
        patternName: null,
        activity: classifyActivity(p),
      });
      continue;
    }

    // Stress shifts balance from core to volatile: a run makes stickier
    // money leave sooner. Capped so the volatile share cannot exceed 100%.
    const patternVolatile = pattern.tiers.filter((t) => t.type === 'Volatile').reduce((s, t) => s + t.percent, 0);

    // A quiet account is stickier than its product implies, so part of the
    // volatile share is reclassified as core before stress is applied.
    const activity = classifyActivity(p);
    const uplift = ACTIVITY_CORE_UPLIFT[activity];
    const adjustedVolatile = patternVolatile * (1 - uplift);

    const volatileShare = Math.min(100, adjustedVolatile * stressMultiplier);
    const coreShare = 100 - volatileShare;

    lines.push({
      positionId: p.id,
      productClass: p.productClass,
      behaviouralTag: p.behaviouralTag,
      balance: p.amount,
      coreAmount: (p.amount * coreShare) / 100,
      volatileAmount: (p.amount * volatileShare) / 100,
      corePercent: coreShare,
      patternName: pattern.name,
      activity,
    });
  }

  const totalDeposits = lines.reduce((s, l) => s + l.balance, 0);
  const totalCore = lines.reduce((s, l) => s + l.coreAmount, 0);
  const totalVolatile = lines.reduce((s, l) => s + l.volatileAmount, 0);

  return {
    lines,
    totalDeposits,
    totalCore,
    totalVolatile,
    corePercent: totalDeposits > 0 ? (totalCore / totalDeposits) * 100 : null,
    unmodelled,
    methodology:
      'Non-maturity deposits split into core and volatile balances by behaviour pattern, keyed on the Basel ' +
      'deposit taxonomy (Core / Non-Core / Operational / Non-Operational). Pattern tiers must total 100%. ' +
      'Rates are published-style assumptions, not coefficients fitted to observed withdrawals — fitting ' +
      'requires multi-period position history. Deposits with no matching pattern are reported as unmodelled ' +
      'rather than defaulted into a bucket.',
  };
}

/**
 * Re-date non-maturity deposits by their behavioural profile.
 *
 * This is what makes the behavioural liquidity gap genuinely different from
 * the contractual one: a current account with no contractual maturity is
 * spread across the tenor tiers of its pattern instead of landing entirely
 * in the earliest bucket. Each tier becomes its own synthetic position, so
 * the balance total is unchanged.
 */
export function applyBehaviouralMaturity(
  positions: Position[],
  asOfDate: IsoDate,
  patterns: BehaviourPattern[] = DEFAULT_PATTERNS,
): Position[] {
  patterns.forEach(validateBehaviourPattern);
  const out: Position[] = [];

  for (const p of positions) {
    const pattern =
      p.category === 'Liability' && p.behaviouralTag !== 'N/A' ? patternFor(p.behaviouralTag, patterns) : null;
    if (!pattern) {
      out.push(p);
      continue;
    }
    for (const [index, tier] of pattern.tiers.entries()) {
      out.push({
        ...p,
        id: `${p.id}#BEH${index + 1}`,
        amount: (p.amount * tier.percent) / 100,
        maturityDate: addDays(asOfDate, tier.tenorDays),
        notes: `Behavioural tier ${index + 1} of "${pattern.name}" — ${tier.percent}% at ${tier.tenorDays}d (${tier.type})`,
      });
    }
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Dormancy
// ─────────────────────────────────────────────────────────────────────────

export type ActivityLevel = 'Active' | 'Low' | 'Dormant' | 'Unknown';

/**
 * Classify an account by its movement.
 *
 * Turnover is the behavioural signal the platform previously had no access
 * to. Product type says a current account is volatile; turnover says whether
 * *this* current account has moved at all this quarter. A dormant balance is
 * materially stickier than an active one of the same product, and treating
 * them identically is why assumption-based run-off models drift.
 *
 * Returns `Unknown` rather than guessing when no turnover was loaded.
 */
export function classifyActivity(position: Position): ActivityLevel {
  const t = position.turnover;
  if (!t) return 'Unknown';

  const monthlyMovement = Math.abs(t.monthlyCredit) + Math.abs(t.monthlyDebit);
  if (monthlyMovement === 0) return 'Dormant';

  // Movement as a share of the balance: a large account moving a token
  // amount is behaviourally quiet even though the absolute figure is big.
  const turnoverRatio = position.amount > 0 ? monthlyMovement / position.amount : 0;
  if (turnoverRatio < 0.02) return 'Low';
  return 'Active';
}

/**
 * How much of a deposit's volatile share to reclassify as core, by activity.
 *
 * A dormant balance behaves like core money regardless of its product
 * classification; an active one behaves like its product suggests. These are
 * assumptions, stated rather than fitted.
 */
export const ACTIVITY_CORE_UPLIFT: Record<ActivityLevel, number> = {
  Dormant: 0.5,
  Low: 0.25,
  Active: 0,
  Unknown: 0,
};

// ─────────────────────────────────────────────────────────────────────────
// Deposit betas
// ─────────────────────────────────────────────────────────────────────────

export interface DepositBeta {
  behaviouralTag: BehaviouralTag;
  /** Share of a policy-rate move passed through to this deposit type, 0–1. */
  beta: number;
}

/**
 * Pass-through assumptions.
 *
 * Without these, NII sensitivity assumes 100% pass-through of a rate rise to
 * depositors, which no bank experiences — stickier balances reprice least
 * (defect P-11). Core retail money is the slowest to reprice; wholesale
 * non-operational balances track the market almost fully.
 */
export const DEFAULT_BETAS: DepositBeta[] = [
  { behaviouralTag: 'Core', beta: 0.35 },
  { behaviouralTag: 'Non-Core', beta: 0.65 },
  { behaviouralTag: 'Operational', beta: 0.45 },
  { behaviouralTag: 'Non-Operational', beta: 0.9 },
  { behaviouralTag: 'N/A', beta: 1 },
];

export interface BetaAdjustedNii {
  unadjustedDeltaNii: number;
  betaAdjustedDeltaNii: number;
  liabilityRepricingReduction: number;
  methodology: string;
}

/**
 * Adjust a ΔNII figure for deposit betas.
 *
 * Only the liability leg is damped: assets reprice contractually, deposits
 * reprice at management's discretion. A bank with a negative repricing gap —
 * more liabilities than assets repricing — therefore looks *less* exposed to
 * a rate rise once betas are applied, which is the real effect and the
 * reason the adjustment matters.
 */
export function applyDepositBetas(
  positions: Position[],
  shockBps: number,
  unadjustedDeltaNii: number,
  betas: DepositBeta[] = DEFAULT_BETAS,
): BetaAdjustedNii {
  const betaFor = (tag: BehaviouralTag) => betas.find((b) => b.behaviouralTag === tag)?.beta ?? 1;

  // The share of liability repricing that does *not* happen because deposits
  // lag the market.
  const liabilityRepricingReduction = positions
    .filter((p) => p.category === 'Liability' && p.irrbbRateSensitive)
    .reduce((s, p) => s + p.amount * (1 - betaFor(p.behaviouralTag)), 0);

  // Damped liability repricing means less interest expense than the raw gap
  // implies, so ΔNII improves by that amount times the shock.
  const improvement = liabilityRepricingReduction * (shockBps / 10_000);

  return {
    unadjustedDeltaNii,
    betaAdjustedDeltaNii: unadjustedDeltaNii + improvement,
    liabilityRepricingReduction,
    methodology:
      'Deposit betas damp the liability leg only — assets reprice contractually, deposits reprice at ' +
      "management's discretion. Betas are assumptions by deposit type, not fitted to observed pass-through. " +
      'A bank with a negative repricing gap appears less exposed to a rate rise once betas are applied.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Asset prepayment
// ─────────────────────────────────────────────────────────────────────────

export interface PrepaymentRule {
  /** Matched against the Common Chart of Accounts classification. */
  commonCoaCode: string;
  /** Constant prepayment rate, annualised, 0–1. */
  cpr: number;
}

export interface PrepaymentResult {
  lines: Array<{ positionId: string; productClass: string; balance: number; cpr: number; projectedPayoff: number }>;
  totalBalance: number;
  totalProjectedPayoff: number;
  unmodelled: number;
  methodology: string;
}

/** Projected 12-month principal payoff from prepayment, over and above contractual amortisation. */
export function computePrepayment(positions: Position[], rules: PrepaymentRule[]): PrepaymentResult {
  const assets = positions.filter((p) => p.category === 'Asset' && !p.isOffBalanceSheet);
  const lines = [];
  let unmodelled = 0;

  for (const p of assets) {
    const rule = rules.find((r) => r.commonCoaCode === p.commonCoaCode);
    if (!rule) {
      unmodelled += p.amount;
      continue;
    }
    lines.push({
      positionId: p.id,
      productClass: p.productClass,
      balance: p.amount,
      cpr: rule.cpr,
      projectedPayoff: p.amount * rule.cpr,
    });
  }

  return {
    lines,
    totalBalance: lines.reduce((s, l) => s + l.balance, 0),
    totalProjectedPayoff: lines.reduce((s, l) => s + l.projectedPayoff, 0),
    unmodelled,
    methodology:
      'Constant prepayment rate applied by Common Chart of Accounts classification, projecting 12-month payoff ' +
      'over and above contractual amortisation. A rate-dependent or fitted prepayment model requires ' +
      'contract-level history and is out of scope. Assets with no matching rule are reported as unmodelled.',
  };
}
