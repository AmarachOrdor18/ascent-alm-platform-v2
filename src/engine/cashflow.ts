// One cashflow set for the whole platform: liquidity, IRRBB and FTP all bucket, discount and price the same
// contractual schedule and the same behavioural overlay of it, rather than each engine treating a position's
// balance as a single lump on whichever date it happens to read.
//
// Sign convention follows liquidity.ts and irrbb.ts: amounts are positive magnitudes in the position's own
// currency, and the side is carried separately (`isAsset` = category 'Asset'; Liability and Capital sit on the
// funding side). An asset's cashflow is money in, a liability's is money out.

import type { CurrencyCode, IsoDate, Position, TimeBucketLadder } from './types';
import type { PatternPhase } from './ruleTypes';
import { addDays, addMonths, daysBetween, yearFraction } from './dates';
import { bucketize, NON_RATE_SENSITIVE, type BucketableItem, type BucketedTotal } from './buckets';
import { validateBehaviourPattern, type BehaviourPattern } from './behavioural';
import { interpolateCurve, type YieldCurve } from './curves';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type CashflowKind = 'Contractual' | 'Behavioural';
export type CashflowReason = 'Scheduled' | 'Maturity' | 'Prepayment' | 'Runoff' | 'Repricing';
export type CashflowBasis = 'Contractual' | 'Behavioural';

export interface Cashflow {
  positionId: string;
  date: IsoDate;
  principal: number;
  interest: number;
  kind: CashflowKind;
  reason?: CashflowReason;
}

/** How the behavioural stream was derived from the contractual one. */
export type BehaviouralTreatment =
  /** No assumption applies - the behavioural stream is the contractual one. */
  | 'None'
  /** Asset prepaid at a constant prepayment rate. */
  | 'Prepayment'
  /** Non-maturity deposit spread over its behaviour pattern's tiers. */
  | 'DepositRunoff'
  /** Term liability with early withdrawal and/or roll-over at maturity. */
  | 'TermDeposit'
  /** Non-maturity balance with no matching assumption - left undated, never defaulted into a bucket. */
  | 'Unmodelled';

export interface ContractualSchedule {
  cashflows: Cashflow[];
  /** Balance with no contractual principal date (non-maturity items). Left for the behavioural overlay. */
  undatedPrincipal: number;
  notes: string[];
}

export interface BehaviouralOverlay {
  cashflows: Cashflow[];
  undatedPrincipal: number;
  treatment: BehaviouralTreatment;
  notes: string[];
}

export interface PositionCashflows {
  positionId: string;
  currency: CurrencyCode;
  /** category === 'Asset'; Liability and Capital are the funding side, as in bucketize. */
  isAsset: boolean;
  rateSensitive: boolean;
  balance: number;
  contractual: Cashflow[];
  behavioural: Cashflow[];
  /**
   * Date on which the whole outstanding balance reprices (a floating instrument's next reset, or an
   * administered-rate product's next review). Null when the instrument reprices only as its principal
   * cashflows fall due - the fixed-rate case - so repricing then follows the cashflow schedule itself.
   */
  repricingDate: IsoDate | null;
  /** True when the position has no contractual maturity. */
  nonMaturity: boolean;
  undatedContractual: number;
  undatedBehavioural: number;
  behaviouralTreatment: BehaviouralTreatment;
  notes: string[];
}

export interface CashflowAssumptions {
  /** Annualised CPR (0-1) keyed by Common Chart of Accounts code, falling back to product class. Assets only. */
  prepaymentCprByClass?: Record<string, number>;
  /** Non-maturity deposit run-off patterns, matched on behavioural tag. Omitted means no NMD overlay. */
  depositPatterns?: BehaviourPattern[];
  /** Annualised share (0-1) of a term liability withdrawn before maturity. */
  earlyWithdrawalRate?: number;
  /** Share (0-1) of a term liability's maturing balance that rolls over for another term of the same length. */
  renewalRate?: number;
  /**
   * Payment pattern for positions whose amortisation type is 'Pattern'. Phases are read as Relative:
   * `term` is the 1-based payment period counted from the as-of date and `percent` the share of the
   * then-outstanding balance repaid in it. Unresolved patterns fall back to a bullet and say so.
   */
  paymentPatternFor?: (position: Position) => PatternPhase[] | null;
}

/** Hard stop on schedule length - 100 years of monthly payments. */
const MAX_PERIODS = 1200;
const EPSILON = 1e-9;

// ─────────────────────────────────────────────────────────────────────────
// Contractual cashflows
// ─────────────────────────────────────────────────────────────────────────

export function isNonMaturity(position: Position): boolean {
  return position.maturityDate === null;
}

/**
 * Payment dates strictly after `asOfDate`, anchored backwards on maturity so the final payment always
 * lands on the maturity date. Each date is computed from maturity directly rather than chained, so
 * month-end clamping never drifts. Also returns the start of the period the first payment closes.
 */
function paymentDates(
  asOfDate: IsoDate,
  maturity: IsoDate,
  frequencyMonths: number,
): { dates: IsoDate[]; firstStart: IsoDate } {
  const dates: IsoDate[] = [];
  let k = 0;
  let date = maturity;
  while (date > asOfDate && k < MAX_PERIODS) {
    dates.push(date);
    k += 1;
    date = addMonths(maturity, -k * frequencyMonths);
  }
  return { dates: dates.reverse(), firstStart: date };
}

function cf(
  position: Position,
  date: IsoDate,
  principal: number,
  interest: number,
  reason: CashflowReason,
  kind: CashflowKind = 'Contractual',
): Cashflow {
  return { positionId: position.id, date, principal, interest, kind, reason };
}

/**
 * The contract's own schedule from the as-of date: principal per the amortisation type, interest at the
 * contract rate on the outstanding balance. Floating-rate interest is projected flat at the current rate.
 *
 * - Non-Amortising: interest each period (or once at maturity with no payment frequency), principal at maturity.
 * - Level Principal: equal principal each period, interest on the declining balance.
 * - Conventional: level instalment (annuity) at the periodic rate rate × frequency / 12.
 * - Pattern: the supplied payment pattern; a bullet, noted, when none resolves.
 * - No maturity date: no contractual principal date at all - the balance is returned as undated for the
 *   behavioural overlay rather than placed in any bucket.
 */
export function generateContractualCashflows(
  position: Position,
  asOfDate: IsoDate,
  options: Pick<CashflowAssumptions, 'paymentPatternFor'> = {},
): ContractualSchedule {
  const notes: string[] = [];
  const balance = position.amount;
  if (balance === 0) return { cashflows: [], undatedPrincipal: 0, notes };

  const maturity = position.maturityDate;
  if (maturity === null) {
    notes.push('No contractual maturity - balance left undated for the behavioural overlay.');
    return { cashflows: [], undatedPrincipal: balance, notes };
  }

  if (maturity <= asOfDate) {
    notes.push('Past contractual maturity - balance treated as due on its maturity date.');
    return { cashflows: [cf(position, maturity, balance, 0, 'Maturity')], undatedPrincipal: 0, notes };
  }

  if (position.interestRatePct === null) notes.push('No contract rate - interest projected as zero.');
  const rate = (position.interestRatePct ?? 0) / 100;
  const basis = position.accrualBasis;

  let amortization = position.amortizationType;
  let pattern: PatternPhase[] | null = null;
  if (amortization === 'Pattern') {
    pattern = options.paymentPatternFor?.(position) ?? null;
    if (!pattern) {
      notes.push('Payment pattern not resolved - scheduled as a bullet at maturity.');
      amortization = 'Non-Amortising';
    }
  }

  const rawFrequency = position.paymentFrequencyMonths;
  let frequency = rawFrequency !== null && rawFrequency > 0 ? rawFrequency : null;
  if (frequency === null && amortization !== 'Non-Amortising') {
    notes.push('No payment frequency on an amortising contract - monthly payments assumed.');
    frequency = 1;
  }

  // Bullet with no interim payments: one flow, interest accrued over the whole contract.
  if (frequency === null) {
    const start = position.originationDate && position.originationDate < maturity ? position.originationDate : asOfDate;
    const interest = balance * rate * yearFraction(start, maturity, basis);
    return { cashflows: [cf(position, maturity, balance, interest, 'Maturity')], undatedPrincipal: 0, notes };
  }

  const { dates, firstStart } = paymentDates(asOfDate, maturity, frequency);
  const n = dates.length;
  const periodicRate = (rate * frequency) / 12;
  const annuity =
    amortization === 'Conventional'
      ? periodicRate === 0
        ? balance / n
        : (balance * periodicRate) / (1 - (1 + periodicRate) ** -n)
      : 0;

  const cashflows: Cashflow[] = [];
  let outstanding = balance;
  let start =
    position.originationDate && position.originationDate > firstStart && position.originationDate < dates[0]!
      ? position.originationDate
      : firstStart;

  for (const [i, date] of dates.entries()) {
    const last = i === n - 1;
    let interest: number;
    let principal: number;

    switch (amortization) {
      case 'Conventional':
        interest = outstanding * periodicRate;
        principal = annuity - interest;
        break;
      case 'Level Principal':
        interest = outstanding * rate * yearFraction(start, date, basis);
        principal = balance / n;
        break;
      case 'Pattern': {
        interest = outstanding * rate * yearFraction(start, date, basis);
        const phase = pattern!.find((p) => Number(p.term) === i + 1);
        principal = phase ? (outstanding * phase.percent) / 100 : 0;
        break;
      }
      default:
        interest = outstanding * rate * yearFraction(start, date, basis);
        principal = 0;
    }

    // The final payment clears whatever floating-point residue is left.
    if (last) principal = outstanding;
    principal = Math.min(principal, outstanding);
    outstanding -= principal;

    cashflows.push(cf(position, date, principal, interest, last ? 'Maturity' : 'Scheduled'));
    start = date;
  }

  return { cashflows, undatedPrincipal: 0, notes };
}

// ─────────────────────────────────────────────────────────────────────────
// Behavioural overlay
// ─────────────────────────────────────────────────────────────────────────

/** Single monthly mortality from an annual constant prepayment rate: SMM = 1 − (1 − CPR)^(1/12). */
export function cprToSmm(cpr: number): number {
  const bounded = Math.min(1, Math.max(0, cpr));
  return 1 - (1 - bounded) ** (1 / 12);
}

function asBehavioural(flows: Cashflow[]): Cashflow[] {
  return flows.map((f) => ({ ...f, kind: 'Behavioural' as const }));
}

function lookupCpr(position: Position, byClass: Record<string, number> | undefined): number | null {
  if (!byClass) return null;
  return byClass[position.commonCoaCode] ?? byClass[position.productClass] ?? null;
}

/**
 * Decrements the outstanding balance at a constant annual rate, on a monthly grid merged with the contractual
 * payment dates. Scheduled principal is paid pro rata to the contractual amortisation fraction on the
 * surviving balance, and the final contractual date clears what is left - so total principal is conserved
 * exactly and only its timing moves earlier. Interest scales with the surviving share of the balance.
 */
function decrement(contractual: Cashflow[], asOfDate: IsoDate, annualRate: number, reason: CashflowReason): Cashflow[] {
  const past = contractual.filter((f) => f.date <= asOfDate);
  const future = contractual.filter((f) => f.date > asOfDate).sort((a, b) => a.date.localeCompare(b.date));
  if (future.length === 0 || annualRate <= 0) return asBehavioural(contractual);

  const lastDate = future[future.length - 1]!.date;
  const byDate = new Map(future.map((f) => [f.date, f]));
  const eventDates = new Set(future.map((f) => f.date));
  for (let k = 1; k < MAX_PERIODS; k += 1) {
    const d = addMonths(asOfDate, k);
    if (d >= lastDate) break;
    eventDates.add(d);
  }

  const survival = 1 - Math.min(1, annualRate);
  const out: Cashflow[] = asBehavioural(past);
  let contractualBalance = future.reduce((s, f) => s + f.principal, 0);
  let balance = contractualBalance;
  let prev = asOfDate;

  for (const date of Array.from(eventDates).sort()) {
    const positionId = future[0]!.positionId;
    const months = (daysBetween(prev, date) * 12) / 365;
    const startBalance = balance;
    const startContractual = contractualBalance;

    const early = balance * (1 - survival ** (months / 12));
    balance -= early;
    if (Math.abs(early) > EPSILON) {
      out.push({ positionId, date, principal: early, interest: 0, kind: 'Behavioural', reason });
    }

    const flow = byDate.get(date);
    if (flow) {
      const scheduled =
        date === lastDate ? balance : contractualBalance !== 0 ? (balance * flow.principal) / contractualBalance : 0;
      const interest = startContractual !== 0 ? (flow.interest * startBalance) / startContractual : 0;
      contractualBalance -= flow.principal;
      balance -= scheduled;
      out.push({ ...flow, principal: scheduled, interest, kind: 'Behavioural' });
    }
    prev = date;
  }

  return out;
}

/** Splits a term liability's maturing principal into withdrawn-at-maturity and rolled-for-another-term. */
function applyRenewal(flows: Cashflow[], position: Position, asOfDate: IsoDate, renewalRate: number): Cashflow[] {
  const maturity = position.maturityDate;
  if (!maturity || renewalRate <= 0) return flows;

  const termDays =
    position.originationDate && position.originationDate < maturity
      ? daysBetween(position.originationDate, maturity)
      : daysBetween(asOfDate, maturity);
  if (termDays <= 0) return flows;

  const share = Math.min(1, renewalRate);
  const rolledDate = addDays(maturity, termDays);
  const rate = (position.interestRatePct ?? 0) / 100;
  const out: Cashflow[] = [];

  for (const f of flows) {
    if (f.date !== maturity || f.reason !== 'Maturity') {
      out.push(f);
      continue;
    }
    const rolled = f.principal * share;
    out.push({ ...f, principal: f.principal - rolled });
    out.push({
      positionId: f.positionId,
      date: rolledDate,
      principal: rolled,
      interest: rolled * rate * yearFraction(maturity, rolledDate, position.accrualBasis),
      kind: 'Behavioural',
      reason: 'Maturity',
    });
  }
  return out;
}

/**
 * Behavioural view of a position's cashflows. The behavioural stream always carries the whole balance, so
 * a position with no applicable assumption gets its contractual flows back re-labelled as behavioural.
 *
 * - Assets with a CPR: principal accelerated at SMM = 1 − (1 − CPR)^(1/12) per month, reason 'Prepayment'.
 * - Non-maturity liabilities whose behavioural tag matches a pattern: the balance spread over the pattern's
 *   tiers at as-of + tenorDays, reason 'Runoff'. Interest is not projected on administered-rate balances.
 * - Term liabilities: early withdrawal at `earlyWithdrawalRate` (reason 'Runoff'), then `renewalRate` of the
 *   maturing balance rolls over once for a term equal to the original one.
 * - Non-maturity balances with no matching assumption stay undated and are reported as unmodelled.
 */
export function applyBehaviouralOverlay(
  schedule: ContractualSchedule,
  position: Position,
  assumptions: CashflowAssumptions = {},
  asOfDate: IsoDate = position.asOfDate,
): BehaviouralOverlay {
  const notes: string[] = [];

  if (schedule.undatedPrincipal !== 0) {
    const pattern =
      position.category === 'Liability' && position.behaviouralTag !== 'N/A'
        ? ((assumptions.depositPatterns ?? []).find((p) => p.appliesTo.includes(position.behaviouralTag)) ?? null)
        : null;
    if (!pattern) {
      notes.push('Non-maturity balance with no matching behaviour pattern - left undated.');
      return {
        cashflows: asBehavioural(schedule.cashflows),
        undatedPrincipal: schedule.undatedPrincipal,
        treatment: 'Unmodelled',
        notes,
      };
    }
    validateBehaviourPattern(pattern);
    const tiers = pattern.tiers.map((tier) => ({
      positionId: position.id,
      date: addDays(asOfDate, tier.tenorDays),
      principal: (schedule.undatedPrincipal * tier.percent) / 100,
      interest: 0,
      kind: 'Behavioural' as const,
      reason: 'Runoff' as const,
    }));
    notes.push(`Run off per behaviour pattern "${pattern.name}".`);
    return {
      cashflows: [...asBehavioural(schedule.cashflows), ...tiers],
      undatedPrincipal: 0,
      treatment: 'DepositRunoff',
      notes,
    };
  }

  if (position.category === 'Asset') {
    const cpr = lookupCpr(position, assumptions.prepaymentCprByClass);
    if (cpr !== null && cpr > 0) {
      notes.push(`Prepaid at ${(cpr * 100).toFixed(2)}% CPR.`);
      return {
        cashflows: decrement(schedule.cashflows, asOfDate, cpr, 'Prepayment'),
        undatedPrincipal: 0,
        treatment: 'Prepayment',
        notes,
      };
    }
  }

  if (position.category === 'Liability' && position.maturityDate !== null && position.maturityDate > asOfDate) {
    const withdrawal = assumptions.earlyWithdrawalRate ?? 0;
    const renewal = assumptions.renewalRate ?? 0;
    if (withdrawal > 0 || renewal > 0) {
      const withdrawn = decrement(schedule.cashflows, asOfDate, withdrawal, 'Runoff');
      notes.push(
        `Term liability: ${(withdrawal * 100).toFixed(2)}% annual early withdrawal, ` +
          `${(renewal * 100).toFixed(2)}% rolled at maturity.`,
      );
      return {
        cashflows: applyRenewal(withdrawn, position, asOfDate, renewal),
        undatedPrincipal: 0,
        treatment: 'TermDeposit',
        notes,
      };
    }
  }

  return { cashflows: asBehavioural(schedule.cashflows), undatedPrincipal: 0, treatment: 'None', notes };
}

// ─────────────────────────────────────────────────────────────────────────
// Book
// ─────────────────────────────────────────────────────────────────────────

/** A floating reset (or administered-rate review) before maturity reprices the whole outstanding balance. */
function wholeBalanceRepricingDate(position: Position): IsoDate | null {
  const next = position.nextRepricingDate;
  if (!next) return null;
  if (position.maturityDate !== null && next >= position.maturityDate) return null;
  return next;
}

/** Every position's contractual and behavioural cashflows, in input order. Deterministic: reads no clock. */
export function generateBookCashflows(
  positions: Position[],
  asOfDate: IsoDate,
  assumptions: CashflowAssumptions = {},
): PositionCashflows[] {
  (assumptions.depositPatterns ?? []).forEach(validateBehaviourPattern);

  return positions.map((position) => {
    const schedule = generateContractualCashflows(position, asOfDate, assumptions);
    const overlay = applyBehaviouralOverlay(schedule, position, assumptions, asOfDate);
    return {
      positionId: position.id,
      currency: position.currency,
      isAsset: position.category === 'Asset',
      rateSensitive: position.irrbbRateSensitive,
      balance: position.amount,
      contractual: schedule.cashflows,
      behavioural: overlay.cashflows,
      repricingDate: wholeBalanceRepricingDate(position),
      nonMaturity: isNonMaturity(position),
      undatedContractual: schedule.undatedPrincipal,
      undatedBehavioural: overlay.undatedPrincipal,
      behaviouralTreatment: overlay.treatment,
      notes: [...schedule.notes, ...overlay.notes],
    };
  });
}

export function cashflowsFor(pc: PositionCashflows, basis: CashflowBasis): Cashflow[] {
  return basis === 'Contractual' ? pc.contractual : pc.behavioural;
}

function undatedFor(pc: PositionCashflows, basis: CashflowBasis): number {
  return basis === 'Contractual' ? pc.undatedContractual : pc.undatedBehavioural;
}

/**
 * Principal re-dated to when it reprices. Flows falling due before the whole-balance repricing date keep
 * their own dates (they reprice when they are paid and re-lent); everything still outstanding at that date,
 * undated balances included, reprices there. With no repricing date the cashflow dates are the repricing dates.
 */
export function repricingCashflows(
  pc: PositionCashflows,
  basis: CashflowBasis,
): { cashflows: Cashflow[]; undatedPrincipal: number } {
  const flows = cashflowsFor(pc, basis);
  const undated = undatedFor(pc, basis);
  const rd = pc.repricingDate;
  if (!rd) return { cashflows: flows, undatedPrincipal: undated };

  const before = flows.filter((f) => f.date < rd);
  const remaining = flows.filter((f) => f.date >= rd).reduce((s, f) => s + f.principal, 0) + undated;
  if (Math.abs(remaining) <= EPSILON) return { cashflows: before, undatedPrincipal: 0 };
  return {
    cashflows: [
      ...before,
      {
        positionId: pc.positionId,
        date: rd,
        principal: remaining,
        interest: 0,
        kind: basis,
        reason: 'Repricing',
      },
    ],
    undatedPrincipal: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Bucketing
// ─────────────────────────────────────────────────────────────────────────

export interface BucketCashflowOptions {
  /** 'Cashflow' buckets on payment dates (liquidity); 'Repricing' on repricing dates. Defaults from the ladder kind. */
  view?: 'Cashflow' | 'Repricing';
  /** Defaults to principal only, which is what gap reports show and what reconciles to balances. */
  measure?: 'Principal' | 'PrincipalAndInterest';
  /** Reporting-currency conversion, e.g. `(a, c) => convert(a, c, ctx.reportingCurrency, ctx.fx)`. */
  convert?: (amount: number, currency: CurrencyCode) => number;
}

export interface CashflowBucketResult {
  buckets: BucketedTotal[];
  /** Balances with no date to bucket on under this basis. Reported, never silently dropped. */
  undated: { assets: number; liabilities: number };
  basis: CashflowBasis;
  view: 'Cashflow' | 'Repricing';
}

/** Buckets a book's cashflows onto a ladder via the same `bucketize` the gap engines use, so the shapes match. */
export function bucketCashflows(
  book: PositionCashflows[],
  ladder: TimeBucketLadder,
  asOfDate: IsoDate,
  basis: CashflowBasis,
  options: BucketCashflowOptions = {},
): CashflowBucketResult {
  const view = options.view ?? (ladder.kind === 'RepricingGap' ? 'Repricing' : 'Cashflow');
  const withInterest = options.measure === 'PrincipalAndInterest';
  const convert = options.convert ?? ((amount: number) => amount);

  const items: BucketableItem[] = [];
  const undated = { assets: 0, liabilities: 0 };

  for (const pc of book) {
    // A repricing ladder routes non-sensitive balances whole to their own bucket, exactly as bucketize does.
    if (view === 'Repricing' && ladder.includeNonRateSensitive && !pc.rateSensitive) {
      items.push({ amount: convert(pc.balance, pc.currency), isAsset: pc.isAsset, date: null, rateSensitive: false });
      continue;
    }

    const { cashflows, undatedPrincipal } =
      view === 'Repricing'
        ? repricingCashflows(pc, basis)
        : { cashflows: cashflowsFor(pc, basis), undatedPrincipal: undatedFor(pc, basis) };

    for (const f of cashflows) {
      const amount = f.principal + (withInterest ? f.interest : 0);
      if (amount === 0) continue;
      items.push({ amount: convert(amount, pc.currency), isAsset: pc.isAsset, date: f.date, rateSensitive: true });
    }
    if (undatedPrincipal !== 0) {
      const amount = convert(undatedPrincipal, pc.currency);
      if (pc.isAsset) undated.assets += amount;
      else undated.liabilities += amount;
    }
  }

  return { buckets: bucketize(ladder, asOfDate, items), undated, basis, view };
}

/**
 * Principal repricing within a horizon, plus the same weighted by the share of the horizon remaining after
 * it reprices - the input to a time-weighted ΔNII (`Σ amount × (H − t)/H × shock`) in place of the
 * full-horizon gap approximation.
 */
export function repricingWithinHorizon(
  book: PositionCashflows[],
  asOfDate: IsoDate,
  horizonDays: number,
  basis: CashflowBasis,
  convert: (amount: number, currency: CurrencyCode) => number = (a) => a,
): { assets: number; liabilities: number; timeWeightedAssets: number; timeWeightedLiabilities: number } {
  const out = { assets: 0, liabilities: 0, timeWeightedAssets: 0, timeWeightedLiabilities: 0 };
  for (const pc of book) {
    if (!pc.rateSensitive) continue;
    for (const f of repricingCashflows(pc, basis).cashflows) {
      const days = Math.max(0, daysBetween(asOfDate, f.date));
      if (days > horizonDays) continue;
      const amount = convert(f.principal, pc.currency);
      const weight = horizonDays > 0 ? (horizonDays - days) / horizonDays : 0;
      if (pc.isAsset) {
        out.assets += amount;
        out.timeWeightedAssets += amount * weight;
      } else {
        out.liabilities += amount;
        out.timeWeightedLiabilities += amount * weight;
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Valuation
// ─────────────────────────────────────────────────────────────────────────

export type Compounding = 'Annual' | 'Continuous';

export interface ValuationOptions {
  /** Defaults to annual compounding on an Actual/365 year fraction. */
  compounding?: Compounding;
  /** Discount interest as well as principal. Defaults to true. */
  includeInterest?: boolean;
}

/**
 * Discount factor read off the curve with ftp.ts's own `interpolateCurve` (linear in tenor days, flat beyond
 * either end). Dates on or before the as-of date discount at 1. Null when the curve has no points.
 */
export function discountFactor(
  curve: YieldCurve,
  asOfDate: IsoDate,
  date: IsoDate,
  compounding: Compounding = 'Annual',
): number | null {
  const days = daysBetween(asOfDate, date);
  const ratePercent = interpolateCurve(curve, Math.max(0, days));
  if (ratePercent === null) return null;
  if (days <= 0) return 1;
  const t = days / 365;
  const r = ratePercent / 100;
  return compounding === 'Continuous' ? Math.exp(-r * t) : (1 + r) ** -t;
}

/** Present value of a cashflow set on a curve. Null when the curve has no points. */
export function presentValue(
  cashflows: Cashflow[],
  curve: YieldCurve,
  asOfDate: IsoDate,
  options: ValuationOptions = {},
): number | null {
  const withInterest = options.includeInterest ?? true;
  let pv = 0;
  for (const f of cashflows) {
    const df = discountFactor(curve, asOfDate, f.date, options.compounding);
    if (df === null) return null;
    pv += (f.principal + (withInterest ? f.interest : 0)) * df;
  }
  return pv;
}

/** A curve moved by a parallel shock, or by a tenor-dependent one (bps as a function of tenor days). */
export function shiftCurve(curve: YieldCurve, shockBps: number | ((tenorDays: number) => number)): YieldCurve {
  const bpsAt = typeof shockBps === 'number' ? () => shockBps : shockBps;
  return {
    ...curve,
    points: curve.points.map((p) => ({ ...p, ratePercent: p.ratePercent + bpsAt(p.tenorDays) / 100 })),
  };
}

/**
 * Principal-weighted average days to cashflow (weighted average life). Past-dated flows count at day zero.
 * Null when the flows carry no principal.
 */
export function cashflowWeightedTenor(cashflows: Cashflow[], asOfDate: IsoDate): number | null {
  let weighted = 0;
  let total = 0;
  for (const f of cashflows) {
    total += f.principal;
    weighted += f.principal * Math.max(0, daysBetween(asOfDate, f.date));
  }
  return Math.abs(total) > EPSILON ? weighted / total : null;
}

/** Macaulay duration in years, discounting principal and interest on the curve. */
export function macaulayDurationYears(
  cashflows: Cashflow[],
  curve: YieldCurve,
  asOfDate: IsoDate,
  options: ValuationOptions = {},
): number | null {
  const withInterest = options.includeInterest ?? true;
  let pv = 0;
  let timeWeighted = 0;
  for (const f of cashflows) {
    const df = discountFactor(curve, asOfDate, f.date, options.compounding);
    if (df === null) return null;
    const value = (f.principal + (withInterest ? f.interest : 0)) * df;
    pv += value;
    timeWeighted += value * (Math.max(0, daysBetween(asOfDate, f.date)) / 365);
  }
  return Math.abs(pv) > EPSILON ? timeWeighted / pv : null;
}

export type CashflowTpMethod = 'WeightedAverageTerm' | 'AverageLife' | 'Duration';

/**
 * Matched-maturity transfer rate from the position's own cashflows (the Oracle FTP cash-flow method family):
 *
 * - WeightedAverageTerm: Σ(P·t·R(t)) / Σ(P·t) over principal flows - every principal repayment is funded
 *   at its own tenor, weighted by amount × time outstanding.
 * - AverageLife: the curve rate at the principal-weighted average life.
 * - Duration: the curve rate at the Macaulay duration.
 *
 * Returns a percent, or null when the curve is empty or the flows carry no principal.
 */
export function cashflowTransferRate(
  cashflows: Cashflow[],
  curve: YieldCurve,
  asOfDate: IsoDate,
  method: CashflowTpMethod = 'WeightedAverageTerm',
): number | null {
  if (method === 'AverageLife') {
    const days = cashflowWeightedTenor(cashflows, asOfDate);
    return days === null ? null : interpolateCurve(curve, days);
  }
  if (method === 'Duration') {
    const years = macaulayDurationYears(cashflows, curve, asOfDate);
    return years === null ? null : interpolateCurve(curve, years * 365);
  }

  let numerator = 0;
  let denominator = 0;
  let principal = 0;
  for (const f of cashflows) {
    if (f.principal === 0) continue;
    const days = Math.max(0, daysBetween(asOfDate, f.date));
    const rate = interpolateCurve(curve, days);
    if (rate === null) return null;
    principal += f.principal;
    numerator += f.principal * days * rate;
    denominator += f.principal * days;
  }
  if (Math.abs(principal) <= EPSILON) return null;
  // Everything due today: the overnight point.
  if (Math.abs(denominator) <= EPSILON) return interpolateCurve(curve, 0);
  return numerator / denominator;
}

export interface EconomicValueResult {
  assets: number;
  liabilities: number;
  /** Assets less liabilities and capital. */
  net: number;
  /** Balances that could not be discounted - no curve, or no date to discount to. */
  unvalued: number;
}

/**
 * Economic value of a book by discounting every position's cashflows on its own curve - the cash-flow
 * replacement for the duration-gap ΔEVE. Revalue under a shocked curve (`shiftCurve`) and difference the nets.
 */
export function economicValue(
  book: PositionCashflows[],
  curveFor: (pc: PositionCashflows) => YieldCurve | null,
  asOfDate: IsoDate,
  basis: CashflowBasis,
  options: ValuationOptions & { convert?: (amount: number, currency: CurrencyCode) => number } = {},
): EconomicValueResult {
  const convert = options.convert ?? ((amount: number) => amount);
  const out = { assets: 0, liabilities: 0, net: 0, unvalued: 0 };
  for (const pc of book) {
    const curve = curveFor(pc);
    const pv = curve ? presentValue(cashflowsFor(pc, basis), curve, asOfDate, options) : null;
    const undated = undatedFor(pc, basis);
    if (pv === null) {
      out.unvalued += convert(pc.balance, pc.currency);
      continue;
    }
    if (undated !== 0) out.unvalued += convert(undated, pc.currency);
    const value = convert(pv, pc.currency);
    if (pc.isAsset) out.assets += value;
    else out.liabilities += value;
  }
  out.net = out.assets - out.liabilities;
  return out;
}

/** Re-exported so callers bucketing non-sensitive balances can match the label without importing buckets.ts. */
export { NON_RATE_SENSITIVE };
