// Funds transfer pricing on the platform's one cashflow set (cashflow.ts). The FTP engine prices the same
// contractual and behavioural cashflows the liquidity gap buckets and IRRBB discounts: a run generates the
// book once and hands it here, so a prepaying mortgage is funded on the same accelerated principal schedule
// the liquidity gap shows, and a current account is credited over the same run-off tiers.

import type { CurrencyCode, IsoDate, Position } from './types';
import { convert, type FxTable } from './fx';
import type { BehaviourPattern } from './behavioural';
import { daysBetween } from './dates';
import { defaultCurveFor, interpolateCurve, type YieldCurve } from './curves';
import {
  cashflowTransferRate,
  cashflowWeightedTenor,
  generateBookCashflows,
  macaulayDurationYears,
  repricingCashflows,
  type Cashflow,
  type PositionCashflows,
} from './cashflow';

// Curve primitives live in curves.ts (shared with cashflow.ts without an import cycle); re-exported so every
// existing `@/engine/ftp` import keeps working.
export { defaultCurveFor, engineCurvesAsOf, interpolateCurve, latestCurveAsOf } from './curves';
export type { CurvePoint, YieldCurve } from './curves';

// ─────────────────────────────────────────────────────────────────────────
// Methods
// ─────────────────────────────────────────────────────────────────────────

/**
 * The transfer-pricing methods the engine actually calculates. Each produces a different number for the same
 * position, because each reads a different property of its cashflows off the curve:
 *
 * - MatchedMaturity: every principal flow is funded at its own tenor - the cash-flow-weighted rate
 *   Σ(P·t·R(t)) / Σ(P·t) over the repricing cashflows, so a floating loan funds only to its reset date.
 * - DurationMatched: the curve rate at the Macaulay duration of the repricing cashflows.
 * - AverageLife: the curve rate at the principal-weighted average life of the repricing cashflows.
 * - RepricingTerm: one curve point at the next repricing date (or maturity). A non-maturity deposit with a
 *   behaviour pattern is priced as a strip across its run-off tiers.
 * - Pooled: the rate of the funding pool the position's tenor falls into - see FtpPool.
 */
export type CoreTpMethod = 'MatchedMaturity' | 'DurationMatched' | 'AverageLife' | 'RepricingTerm' | 'Pooled';

/**
 * Method names saved on FTP rules before the cash-flow methods existed. They all priced at a single curve
 * point at the repricing tenor, so they keep doing exactly that (as RepricingTerm) - a saved rule's numbers
 * do not move under it. The configured name is still recorded on every line.
 */
export type LegacyTpMethod = 'SpreadFromInterestRateCode' | 'SpreadFromNoteRate' | 'RedemptionCurve' | 'MovingAverage';

export type TpMethod = CoreTpMethod | LegacyTpMethod;

export const CORE_TP_METHODS: CoreTpMethod[] = [
  'MatchedMaturity',
  'DurationMatched',
  'AverageLife',
  'RepricingTerm',
  'Pooled',
];

export const LEGACY_TP_METHODS: LegacyTpMethod[] = [
  'SpreadFromInterestRateCode',
  'SpreadFromNoteRate',
  'RedemptionCurve',
  'MovingAverage',
];

/** The calculation a configured method runs. Legacy names run RepricingTerm, which is what they always computed. */
export function resolveTpMethod(method: TpMethod): CoreTpMethod {
  return (CORE_TP_METHODS as string[]).includes(method) ? (method as CoreTpMethod) : 'RepricingTerm';
}

export const TP_METHOD_LABELS: Record<TpMethod, string> = {
  MatchedMaturity: 'Matched maturity (cash-flow weighted)',
  DurationMatched: 'Duration matched',
  AverageLife: 'Average life',
  RepricingTerm: 'Repricing term',
  Pooled: 'Pooled funding rate',
  SpreadFromInterestRateCode: 'Spread from interest rate code (legacy - priced as repricing term)',
  SpreadFromNoteRate: 'Spread from note rate (legacy - priced as repricing term)',
  RedemptionCurve: 'Redemption curve (legacy - priced as repricing term)',
  MovingAverage: 'Moving average (legacy - priced as repricing term)',
};

/** Plain-language explanation per method, for the rule editor and the results screen. */
export const TP_METHOD_HELP: Record<CoreTpMethod, string> = {
  MatchedMaturity:
    'Each repayment of principal is funded at the curve rate for its own date, weighted by amount and time ' +
    'outstanding. An amortising or prepaying loan is cheaper to fund than a bullet of the same final maturity. ' +
    'A floating-rate loan funds only to its next reset.',
  DurationMatched:
    'One curve rate, read at the Macaulay duration of the cashflows (principal and interest, discounted). ' +
    'Captures the interest-rate exposure Treasury takes on, rather than the cash timing.',
  AverageLife:
    'One curve rate, read at the average life of the principal - the date by which, on average, the money ' +
    'comes back. Simpler than matched maturity and close to it on a steady curve.',
  RepricingTerm:
    'One curve rate, read at the next repricing date (or maturity for fixed-rate). A non-maturity deposit ' +
    'is credited across its behavioural run-off tiers. This is how every legacy method was priced.',
  Pooled:
    'Positions are grouped into funding pools by currency and tenor band; every position in a pool is ' +
    'charged or credited the same pool rate - the balance-weighted curve rate across the pool, or a rate ' +
    'Treasury sets. Simplest to explain, least precise.',
};

/** A funding pool for the Pooled method: one rate for every position of `currency` whose tenor falls in the band. */
export interface FtpPool {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Inclusive lower bound of the tenor band, in days. */
  tenorFromDays: number;
  /** Exclusive upper bound, in days; null for open-ended. */
  tenorToDays: number | null;
  /** Treasury-set pool rate in percent. Absent means the balance-weighted curve rate of the pool's members. */
  rate?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Adjustment rules - the add-on stack
// ─────────────────────────────────────────────────────────────────────────

export type AdjustmentType =
  | 'LiquidityPremium'
  | 'BasisRiskCost'
  | 'PricingIncentive'
  | 'OtherAdjustment'
  /** Cross-currency funding cost of a position not in the reporting currency. */
  | 'CurrencyBasis'
  /** Spread between the position's own index curve and the curve it is funded on. */
  | 'BasisSpread';

export type AdjustmentMethod =
  /** A flat add-on: `fixedBps`. */
  | 'FixedRate'
  /** bps = clamp((threshold − LCR) × multiplier, 0, cap). */
  | 'LcrDriven'
  /** bps read off `spreadCurve` at the line's tenor. */
  | 'TenorSpread'
  /** bps = (index curve − funding curve) at the line's tenor × 100. BasisSpread only. */
  | 'CurveDifference';

export interface SpreadPoint {
  tenorDays: number;
  bps: number;
}

export interface AdjustmentRule {
  id: string;
  type: AdjustmentType;
  /** Applied to positions whose Common Chart of Accounts code matches, or all when null. */
  commonCoaCode: string | null;
  method: AdjustmentMethod;
  fixedBps?: number;
  /** LcrDriven: bps = clamp((threshold − LCR) × multiplier, 0, cap). */
  lcrThresholdPercent?: number;
  lcrMultiplier?: number;
  lcrCapBps?: number;
  /** CurrencyBasis: the position currency this add-on prices against the reporting currency; null = every foreign currency. */
  currency?: string | null;
  /** TenorSpread: basis points by tenor, interpolated linearly, flat beyond either end. */
  spreadCurve?: SpreadPoint[];
  /** BasisSpread: the position rate index this applies to; null = whatever index the position carries. */
  indexCode?: string | null;
}

/** What an adjustment may need to know about the line it is pricing. */
export interface AdjustmentContext {
  /** Tenor the base rate was read at - drives TenorSpread and CurveDifference. */
  tenorDays?: number;
  /** CurveDifference: the index-minus-funding spread at that tenor, in bps, when both curves are on file. */
  indexSpreadBps?: number | null;
}

function interpolateSpread(points: SpreadPoint[], tenorDays: number): number {
  const sorted = [...points].sort((a, b) => a.tenorDays - b.tenorDays);
  if (sorted.length === 0) return 0;
  return (
    interpolateCurve(
      {
        currency: '',
        indexCode: '',
        asOfDate: '',
        points: sorted.map((p) => ({ tenorDays: p.tenorDays, ratePercent: p.bps })),
      },
      tenorDays,
    ) ?? 0
  );
}

/** Resolve one adjustment to a basis-point add-on. The LCR-driven method makes internal funding more expensive as the liquidity buffer thins. */
export function resolveAdjustmentBps(
  rule: AdjustmentRule,
  currentLcrPercent: number | null,
  ctx: AdjustmentContext = {},
): number {
  switch (rule.method) {
    case 'FixedRate':
      return rule.fixedBps ?? 0;
    case 'TenorSpread':
      return interpolateSpread(rule.spreadCurve ?? [], ctx.tenorDays ?? 0);
    case 'CurveDifference':
      return ctx.indexSpreadBps ?? 0;
    case 'LcrDriven':
    default: {
      if (currentLcrPercent === null) return 0;
      const threshold = rule.lcrThresholdPercent ?? 130;
      const multiplier = rule.lcrMultiplier ?? 1.5;
      const cap = rule.lcrCapBps ?? 150;
      return Math.max(0, Math.min(cap, (threshold - currentLcrPercent) * multiplier));
    }
  }
}

export interface AdjustmentBreakdown {
  type: AdjustmentType;
  ruleId: string;
  bps: number;
  /** How the add-on was arrived at, e.g. "USD vs NGN" or "NGN-NIBOR − NGN-OIS at 182d". */
  detail?: string;
}

export interface AdjustmentPricingContext {
  /** Tenor the base rate was read at. */
  tenorDays?: number;
  /** The run's reporting currency - CurrencyBasis prices positions not in it. */
  reportingCurrency?: CurrencyCode;
  /** Every curve on file, for BasisSpread's index curve. */
  curves?: YieldCurve[];
  /** The curve the base rate came from - BasisSpread's funding leg. */
  fundingCurve?: YieldCurve | null;
}

/** Whether a rule reaches this position at all, before its add-on is sized. */
function ruleApplies(rule: AdjustmentRule, position: Position, ctx: AdjustmentPricingContext): boolean {
  if (rule.commonCoaCode !== null && rule.commonCoaCode !== position.commonCoaCode) return false;
  if (rule.type === 'CurrencyBasis') {
    if (rule.currency && rule.currency !== position.currency) return false;
    // A reporting-currency position has no cross-currency funding to pay for. With no reporting currency
    // known, only an explicitly named currency applies.
    if (ctx.reportingCurrency) return position.currency !== ctx.reportingCurrency;
    return !!rule.currency;
  }
  if (rule.type === 'BasisSpread') {
    if (!position.rateIndexCode) return false;
    if (rule.indexCode && rule.indexCode !== position.rateIndexCode) return false;
  }
  return true;
}

// Returns the full breakdown rather than a single blended number, since more than one adjustment type can
// apply to a single product.
export function adjustmentsFor(
  position: Position,
  rules: AdjustmentRule[],
  currentLcrPercent: number | null,
  ctx: AdjustmentPricingContext = {},
): AdjustmentBreakdown[] {
  const tenorDays = ctx.tenorDays ?? 0;
  const out: AdjustmentBreakdown[] = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, position, ctx)) continue;
    let detail: string | undefined;
    let indexSpreadBps: number | null = null;

    if (rule.method === 'CurveDifference') {
      const index = (ctx.curves ?? []).find(
        (c) => c.currency === position.currency && c.indexCode === position.rateIndexCode,
      );
      const funding = ctx.fundingCurve ?? null;
      if (index && funding && index !== funding) {
        const a = interpolateCurve(index, tenorDays);
        const b = interpolateCurve(funding, tenorDays);
        if (a !== null && b !== null) {
          indexSpreadBps = (a - b) * 100;
          detail = `${index.indexCode} − ${funding.indexCode} at ${Math.round(tenorDays)}d`;
        }
      } else {
        detail = index ? 'Funded on its own index curve - no basis' : `No ${position.rateIndexCode} curve on file`;
      }
    } else if (rule.type === 'CurrencyBasis') {
      detail = `${position.currency} vs ${ctx.reportingCurrency ?? 'reporting currency'}`;
      if (rule.method === 'TenorSpread') detail += ` at ${Math.round(tenorDays)}d`;
    } else if (rule.method === 'TenorSpread') {
      detail = `at ${Math.round(tenorDays)}d`;
    }

    const bps = resolveAdjustmentBps(rule, currentLcrPercent, { tenorDays, indexSpreadBps });
    if (bps === 0) continue;
    out.push(detail ? { type: rule.type, ruleId: rule.id, bps, detail } : { type: rule.type, ruleId: rule.id, bps });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Transfer rates
// ─────────────────────────────────────────────────────────────────────────

export interface TransferRateLine {
  positionId: string;
  /** Drill-down keys: margin rolls up position → product → org unit → affiliate → Group. */
  productCode: string;
  productClass: string;
  /** Where the margin is attributed. */
  orgUnitCode: string;
  affiliateCode: string;
  /** Which assignment picked this line's method and curve. */
  commonCoaCode: string;
  currency: CurrencyCode;
  /** Tenor the base rate was read at - behavioural when the cashflows carry a behavioural assumption. */
  tenorDays: number;
  tenorBasis: 'Contractual' | 'Behavioural';
  baseTransferRatePercent: number | null;
  adjustments: AdjustmentBreakdown[];
  totalAdjustmentBps: number;
  allInTransferRatePercent: number | null;
  /** The method configured for this line (rule assignment, else the run default). */
  method: TpMethod;
  /** The calculation that actually produced the base rate. Absent on runs computed before methods diverged. */
  methodApplied?: CoreTpMethod;
  /** Why the applied method differs from the configured one, or why the line is unpriced. */
  pricingNote?: string | null;
  /** Base rate under every method, for the compare-methods view. Null where a method cannot price the line. */
  rateByMethod?: Partial<Record<CoreTpMethod, number | null>>;
  /** Pool the line was funded from, under Pooled. */
  poolId?: string | null;
  /** Balance in the position's currency, and in the reporting currency - weights for product-level averages. */
  balance?: number;
  balanceReporting?: number;
  /** Assets are charged the transfer rate; liabilities are credited it. In the position's own currency. */
  marginContribution: number | null;
  /** `marginContribution` converted to the result's reporting currency - the figure every roll-up sums. */
  marginContributionReporting: number | null;
}

export interface FtpResult {
  lines: TransferRateLine[];
  /** Currency every total and roll-up below is expressed in. Null when no reporting currency was supplied. */
  currency: CurrencyCode | null;
  totalMarginContribution: number;
  byOrgUnit: Array<{ orgUnitCode: string; marginContribution: number }>;
  byProduct: Array<{ productCode: string; productClass: string; marginContribution: number }>;
  byAffiliate: Array<{ affiliateCode: string; marginContribution: number }>;
  /** Pool rates actually used, for the Pooled method. */
  pools?: Array<FtpPool & { appliedRate: number | null; memberBalance: number; source: 'Override' | 'Curve' }>;
  /** Balance left unpriced, in the reporting currency. */
  unpriced: number;
  methodology: string;
}

// Keys on the Common Chart of Accounts code rather than a local GL code, so the assignment survives affiliates
// with incompatible local GL schemes.
export interface FtpAssignmentInput {
  commonCoaCode: string;
  method: TpMethod;
  curveCode: string | null;
}

/** A deposit with no contractual date and a behavioural tag - its tenor comes from its behaviour pattern. */
function isNonMaturityDeposit(p: Position): boolean {
  return p.category === 'Liability' && p.behaviouralTag !== 'N/A' && !p.maturityDate && !p.nextRepricingDate;
}

function tenorDaysFor(position: Position, asOfDate: string): number {
  const date = position.nextRepricingDate ?? position.maturityDate;
  if (!date) return 0;
  return Math.max(0, daysBetween(asOfDate, date));
}

interface MethodRate {
  ratePercent: number;
  tenorDays: number;
  tenorBasis: 'Contractual' | 'Behavioural';
}

/** Base rate for a non-maturity deposit priced as a strip: each behavioural run-off tier at its own tenor. */
function stripRate(flows: Cashflow[], curve: YieldCurve, asOfDate: string): MethodRate | null {
  const total = flows.reduce((s, f) => s + f.principal, 0);
  if (total === 0) return null;
  let ratePercent = 0;
  let tenorDays = 0;
  for (const f of flows) {
    const days = Math.max(0, daysBetween(asOfDate, f.date));
    ratePercent += (interpolateCurve(curve, days) ?? 0) * (f.principal / total);
    tenorDays += days * (f.principal / total);
  }
  return { ratePercent, tenorDays: Math.round(tenorDays), tenorBasis: 'Behavioural' };
}

function repricingTermRate(p: Position, pc: PositionCashflows, curve: YieldCurve, asOfDate: string): MethodRate | null {
  // A non-maturity deposit has no contractual date, so its contractual tenor is day 0 - pricing it there
  // credits stable core funding at the overnight rate. Its behaviour pattern says how long the money
  // actually stays, so each run-off tier in the book is priced at its own tenor instead.
  if (pc.behaviouralTreatment === 'DepositRunoff' && isNonMaturityDeposit(p)) {
    const strip = stripRate(pc.behavioural, curve, asOfDate);
    if (strip) return strip;
  }
  const tenorDays = tenorDaysFor(p, asOfDate);
  const ratePercent = interpolateCurve(curve, tenorDays);
  return ratePercent === null ? null : { ratePercent, tenorDays, tenorBasis: 'Contractual' };
}

/** A cash-flow method on the behavioural repricing cashflows. Null when there are no dated principal flows to read. */
function cashflowMethodRate(
  method: 'MatchedMaturity' | 'DurationMatched' | 'AverageLife',
  pc: PositionCashflows,
  curve: YieldCurve,
  asOfDate: string,
): MethodRate | null {
  const { cashflows } = repricingCashflows(pc, 'Behavioural');
  const dated = cashflows.filter((f) => f.principal !== 0 || f.interest !== 0);
  if (!dated.some((f) => f.principal !== 0)) return null;
  const tenorBasis =
    pc.behaviouralTreatment === 'None' || pc.behaviouralTreatment === 'Unmodelled' ? 'Contractual' : 'Behavioural';

  if (method === 'DurationMatched') {
    const years = macaulayDurationYears(dated, curve, asOfDate);
    if (years === null) return null;
    const ratePercent = interpolateCurve(curve, years * 365);
    return ratePercent === null ? null : { ratePercent, tenorDays: Math.round(years * 365), tenorBasis };
  }
  const wal = cashflowWeightedTenor(dated, asOfDate);
  if (wal === null) return null;
  const ratePercent =
    method === 'AverageLife'
      ? interpolateCurve(curve, wal)
      : cashflowTransferRate(dated, curve, asOfDate, 'WeightedAverageTerm');
  return ratePercent === null ? null : { ratePercent, tenorDays: Math.round(wal), tenorBasis };
}

function poolFor(pools: FtpPool[], currency: CurrencyCode, tenorDays: number): FtpPool | null {
  return (
    pools.find(
      (pool) =>
        pool.currency === currency &&
        tenorDays >= pool.tenorFromDays &&
        (pool.tenorToDays === null || pool.tenorToDays === undefined || tenorDays < pool.tenorToDays),
    ) ?? null
  );
}

/** Per-position working state, computed once and shared by the pricing and pooling passes. */
interface Candidate {
  position: Position;
  pc: PositionCashflows;
  curve: YieldCurve | null;
  configured: TpMethod;
  method: CoreTpMethod;
  rates: Partial<Record<Exclude<CoreTpMethod, 'Pooled'>, MethodRate | null>>;
  /** Tenor that places the position in a pool: average life of its repricing cashflows, else its repricing term. */
  poolTenorDays: number;
}

// Standard treasury convention: an asset is charged the transfer rate and keeps (external rate − transfer
// rate); a liability is credited the transfer rate and keeps (transfer rate − external cost).
export function computeFtp(
  positions: Position[],
  curves: YieldCurve[],
  adjustmentRules: AdjustmentRule[],
  options: {
    asOfDate: string;
    currentLcrPercent: number | null;
    method?: TpMethod;
    /** Per-COA method and curve. Positions with no matching assignment use `method`. */
    assignments?: FtpAssignmentInput[];
    /**
     * Roll-ups are summed in this currency. Each margin is earned in its position's own currency, so a
     * multi-currency book must be converted before it is added up. Absent, amounts are summed as
     * loaded - only meaningful for a single-currency book.
     */
    reportingCurrency?: CurrencyCode;
    fx?: FxTable;
    /** Non-maturity deposits are priced at their behavioural tenor from these patterns rather than at day 0. */
    behaviourPatterns?: BehaviourPattern[];
    /**
     * The run's cashflow book (cashflow.ts generateBookCashflows) - the same one the liquidity and IRRBB
     * elements read. Absent, a book is generated here from `behaviourPatterns` alone (no prepayment).
     */
    book?: PositionCashflows[];
    /** Funding pools for the Pooled method. */
    pools?: FtpPool[];
  },
): FtpResult {
  const asOfDate = options.asOfDate as IsoDate;
  const toReporting = (amount: number, currency: CurrencyCode) =>
    options.reportingCurrency && options.fx ? convert(amount, currency, options.reportingCurrency, options.fx) : amount;
  const fallbackMethod = options.method ?? 'SpreadFromInterestRateCode';
  const assignments = options.assignments ?? [];
  const pools = options.pools ?? [];

  const priceable = positions.filter((p) => p.category !== 'Capital' && !p.isOffBalanceSheet);
  const bookById = new Map((options.book ?? []).map((pc) => [pc.positionId, pc]));
  const missing = priceable.filter((p) => !bookById.has(p.id));
  if (missing.length > 0) {
    for (const pc of generateBookCashflows(missing, asOfDate, { depositPatterns: options.behaviourPatterns })) {
      bookById.set(pc.positionId, pc);
    }
  }

  // Pass 1: curve, and the rate under every curve-reading method, per position.
  const candidates: Candidate[] = priceable.map((p) => {
    const assignment = assignments.find((a) => a.commonCoaCode === p.commonCoaCode) ?? null;
    const configured = assignment?.method ?? fallbackMethod;
    // An assignment naming a curve is authoritative: if that curve is absent the position is left unpriced
    // rather than quietly falling back to some other curve, which would price the book off a rate nobody chose.
    const curve = assignment?.curveCode
      ? (curves.find((c) => c.indexCode === assignment.curveCode && c.currency === p.currency) ?? null)
      : defaultCurveFor(curves, p.currency, p.rateIndexCode);
    const pc = bookById.get(p.id)!;
    const rates: Candidate['rates'] = {};
    if (curve) {
      rates.RepricingTerm = repricingTermRate(p, pc, curve, asOfDate);
      rates.MatchedMaturity = cashflowMethodRate('MatchedMaturity', pc, curve, asOfDate);
      rates.DurationMatched = cashflowMethodRate('DurationMatched', pc, curve, asOfDate);
      rates.AverageLife = cashflowMethodRate('AverageLife', pc, curve, asOfDate);
    }
    const poolTenorDays =
      rates.AverageLife?.tenorDays ??
      rates.RepricingTerm?.tenorDays ??
      (pc.behaviouralTreatment === 'DepositRunoff'
        ? (cashflowWeightedTenor(pc.behavioural, asOfDate) ?? 0)
        : tenorDaysFor(p, asOfDate));
    return {
      position: p,
      pc,
      curve,
      configured,
      method: resolveTpMethod(configured),
      rates,
      poolTenorDays: Math.round(poolTenorDays),
    };
  });

  // Pass 2: pool rates - the balance-weighted curve rate across every priceable position of the pool's
  // currency in its tenor band (whatever method those positions are themselves priced on), unless Treasury
  // has set the pool's rate outright.
  const poolStats = new Map<string, { weighted: number; balance: number }>();
  for (const c of candidates) {
    const pool = poolFor(pools, c.position.currency, c.poolTenorDays);
    if (!pool || !c.curve) continue;
    const rate = interpolateCurve(c.curve, c.poolTenorDays);
    if (rate === null) continue;
    const stats = poolStats.get(pool.id) ?? { weighted: 0, balance: 0 };
    stats.weighted += Math.abs(c.position.amount) * rate;
    stats.balance += Math.abs(c.position.amount);
    poolStats.set(pool.id, stats);
  }
  const poolRate = (pool: FtpPool): number | null => {
    if (pool.rate !== null && pool.rate !== undefined && Number.isFinite(pool.rate)) return pool.rate;
    const stats = poolStats.get(pool.id);
    return stats && stats.balance > 0 ? stats.weighted / stats.balance : null;
  };

  const lines: TransferRateLine[] = [];
  let unpriced = 0;

  for (const c of candidates) {
    const p = c.position;
    let pricingNote: string | null = null;
    let methodApplied: CoreTpMethod = c.method;
    let chosen: MethodRate | null = null;
    let poolId: string | null = null;

    const pool = poolFor(pools, p.currency, c.poolTenorDays);
    const pooled = pool ? poolRate(pool) : null;

    if (!c.curve) {
      pricingNote = 'No yield curve for this currency/index - left unpriced.';
    } else if (c.method === 'Pooled') {
      if (pool && pooled !== null) {
        chosen = {
          ratePercent: pooled,
          tenorDays: c.poolTenorDays,
          tenorBasis: c.rates.AverageLife?.tenorBasis ?? 'Contractual',
        };
        poolId = pool.id;
      } else {
        pricingNote = `No funding pool covers ${p.currency} at ${c.poolTenorDays} days - left unpriced.`;
      }
    } else {
      chosen = c.rates[c.method] ?? null;
      // A balance with no dated cashflow at all (an unmodelled non-maturity balance) has nothing for a
      // cash-flow method to read; it is priced at its repricing term (overnight) and says so.
      if (!chosen && c.method !== 'RepricingTerm' && c.rates.RepricingTerm) {
        chosen = c.rates.RepricingTerm;
        methodApplied = 'RepricingTerm';
        pricingNote = 'No dated cashflows to weight - priced at the repricing term instead.';
      }
    }
    if (c.configured !== c.method) {
      pricingNote = pricingNote ?? `Legacy method "${c.configured}" - priced as repricing term.`;
    }

    const baseTransferRatePercent = chosen?.ratePercent ?? null;
    const tenorDays = chosen?.tenorDays ?? c.rates.RepricingTerm?.tenorDays ?? tenorDaysFor(p, asOfDate);
    const adjustments = adjustmentsFor(p, adjustmentRules, options.currentLcrPercent, {
      tenorDays,
      reportingCurrency: options.reportingCurrency,
      curves,
      fundingCurve: c.curve,
    });
    const totalAdjustmentBps = adjustments.reduce((s, a) => s + a.bps, 0);
    const allIn = baseTransferRatePercent === null ? null : baseTransferRatePercent + totalAdjustmentBps / 100;

    // A position with no curve point or no external rate is left unpriced rather than assumed to contribute
    // zero margin, which would quietly understate the book.
    const external = p.interestRatePct;
    if (allIn !== null && external === null)
      pricingNote = pricingNote ?? 'No external (customer) rate - margin unknown.';
    const marginContribution =
      allIn === null || external === null
        ? null
        : p.category === 'Asset'
          ? ((external - allIn) / 100) * p.amount
          : ((allIn - external) / 100) * p.amount;

    if (marginContribution === null) unpriced += toReporting(p.amount, p.currency);

    const rateByMethod: Partial<Record<CoreTpMethod, number | null>> = {
      RepricingTerm: c.rates.RepricingTerm?.ratePercent ?? null,
      MatchedMaturity: c.rates.MatchedMaturity?.ratePercent ?? null,
      DurationMatched: c.rates.DurationMatched?.ratePercent ?? null,
      AverageLife: c.rates.AverageLife?.ratePercent ?? null,
      Pooled: c.curve ? pooled : null,
    };

    lines.push({
      positionId: p.id,
      productCode: p.productCode,
      productClass: p.productClass,
      orgUnitCode: p.orgUnitCode,
      affiliateCode: p.affiliateCode,
      commonCoaCode: p.commonCoaCode,
      currency: p.currency,
      tenorDays,
      tenorBasis: chosen?.tenorBasis ?? 'Contractual',
      baseTransferRatePercent,
      adjustments,
      totalAdjustmentBps,
      allInTransferRatePercent: allIn,
      method: c.configured,
      methodApplied,
      pricingNote,
      rateByMethod,
      poolId,
      balance: p.amount,
      balanceReporting: toReporting(p.amount, p.currency),
      marginContribution,
      marginContributionReporting: marginContribution === null ? null : toReporting(marginContribution, p.currency),
    });
  }

  // Every roll-up sums the reporting-currency figure - an NGN margin added to a GHS margin unconverted is a
  // number in no currency at all.
  const rollUp = (key: (l: TransferRateLine) => string) => {
    const totals = new Map<string, { line: TransferRateLine; marginContribution: number }>();
    for (const line of lines) {
      if (line.marginContributionReporting === null) continue;
      const entry = totals.get(key(line)) ?? { line, marginContribution: 0 };
      entry.marginContribution += line.marginContributionReporting;
      totals.set(key(line), entry);
    }
    return Array.from(totals.values()).sort((a, b) => b.marginContribution - a.marginContribution);
  };

  const methodsUsed = Array.from(new Set(lines.map((l) => l.methodApplied)));

  return {
    lines,
    currency: options.reportingCurrency ?? null,
    totalMarginContribution: lines.reduce((s, l) => s + (l.marginContributionReporting ?? 0), 0),
    byOrgUnit: rollUp((l) => l.orgUnitCode).map((e) => ({
      orgUnitCode: e.line.orgUnitCode,
      marginContribution: e.marginContribution,
    })),
    byProduct: rollUp((l) => l.productCode).map((e) => ({
      productCode: e.line.productCode,
      productClass: e.line.productClass,
      marginContribution: e.marginContribution,
    })),
    byAffiliate: rollUp((l) => l.affiliateCode).map((e) => ({
      affiliateCode: e.line.affiliateCode,
      marginContribution: e.marginContribution,
    })),
    pools: pools.map((pool) => ({
      ...pool,
      appliedRate: poolRate(pool),
      memberBalance: poolStats.get(pool.id)?.balance ?? 0,
      source:
        pool.rate !== null && pool.rate !== undefined && Number.isFinite(pool.rate)
          ? ('Override' as const)
          : ('Curve' as const),
    })),
    unpriced,
    methodology:
      "Cash-flow transfer pricing on the run's single cashflow book - the same contractual schedule and " +
      'behavioural overlay (prepayment, deposit run-off, term-deposit roll-over) the liquidity gap buckets and ' +
      'IRRBB discounts. Each position is priced by the method its FTP rule assigns: matched maturity (every ' +
      'principal flow funded at its own tenor, Σ(P·t·R(t))/Σ(P·t)); duration matched (curve at the Macaulay ' +
      'duration); average life (curve at the principal-weighted average life); repricing term (one curve point ' +
      'at the next repricing date, non-maturity deposits as a strip across their run-off tiers); or pooled (the ' +
      'balance-weighted curve rate of the currency/tenor pool, or a Treasury-set pool rate). Cash-flow methods ' +
      'read the repricing cashflows, so a floating loan funds only to its reset. Legacy method names are priced ' +
      'as repricing term. Adjustment rules stack on top as separate, named add-ons - liquidity premium, basis ' +
      'risk, currency basis (foreign-currency positions against the reporting currency, flat or by tenor), ' +
      "basis spread (the position's index curve less its funding curve at the same tenor) and pricing " +
      'incentive. Assets are charged the all-in rate and keep the excess of their external rate; liabilities ' +
      'are credited it. Each margin is converted to the reporting currency before it is rolled up by product, ' +
      'org unit and affiliate. Positions with no curve point or no external rate are reported as unpriced, not ' +
      `as zero. Methods applied in this run: ${methodsUsed.join(', ') || 'none'}.`,
  };
}
