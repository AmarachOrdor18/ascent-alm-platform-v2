import type { CurrencyCode, IsoDate, Position, TimeBucketLadder } from './types';
import { bucketize, type BucketedTotal } from './buckets';
import { convert, type FxTable } from './fx';
import { daysBetween } from './dates';
import { bucketCashflows, type PositionCashflows } from './cashflow';

/** The LCR stress window. */
export const LCR_WINDOW_DAYS = 30;

export interface LiquidityContext {
  asOfDate: IsoDate;
  reportingCurrency: CurrencyCode;
  fx: FxTable;
}

/** Sum a set of positions in the reporting currency, applying a per-position weight. */
function sumConverted(positions: Position[], ctx: LiquidityContext, weight: (p: Position) => number = () => 1): number {
  return positions.reduce((total, p) => {
    const w = weight(p);
    if (w === 0) return total;
    return total + convert(p.amount * w, p.currency, ctx.reportingCurrency, ctx.fx);
  }, 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Liquidity Coverage Ratio
// ─────────────────────────────────────────────────────────────────────────

export interface LcrResult {
  hqla: number;
  hqlaByLevel: Record<string, number>;
  grossOutflows: number;
  grossInflows: number;
  inflowCap: number;
  eligibleInflows: number;
  netCashOutflows: number;
  lcrPercent: number | null;
  excludedEncumbered: number;
  /**
   * How much of the (unstressed-rate) inflow and outflow totals was read from contractual cashflows due in
   * the 30-day window rather than from balances. Absent when no cashflow book was supplied.
   */
  cashflowWindow?: {
    windowDays: number;
    /** Contractual principal + interest due within the window on dated Inflow positions, before the inflow rate. */
    inflowsDue: number;
    /** Contractual principal + interest due within the window on dated term funding, before the run-off rate. */
    termFundingDue: number;
    /** Balances of dated positions read from cashflows - included only to the extent they fall due in the window. */
    datedInflowBalance: number;
    datedTermFundingBalance: number;
  };
  currency: CurrencyCode;
  methodology: string;
}

export interface LcrStress {
  /** Additional haircut in percentage points applied on top of each position's own. */
  hqlaHaircutPercent?: number;
  /** Multiplier on every outflow rate, capped at 100% per position. */
  runoffMultiplier?: number;
  /** Share of inflows assumed not to arrive under stress. */
  inflowSuppressionPercent?: number;
}

/**
 * Whether a position's 30-day LCR flow is read from its contractual cashflows rather than its balance: dated,
 * on-balance-sheet Inflow positions (loans and placements - only what falls due in the window flows in), and
 * dated, on-balance-sheet Outflow funding that is not a customer deposit (interbank takings, borrowings,
 * wholesale term funding - only what matures in the window can run). Customer deposits keep their balance ×
 * run-off treatment whatever their maturity: a retail or corporate term deposit can usually be broken early,
 * and the Product Characteristics run-off rate is calibrated on the balance. Non-maturity items, HQLA and
 * off-balance-sheet commitments are unchanged.
 */
export function lcrReadsCashflows(p: Position): boolean {
  if (p.isOffBalanceSheet || p.maturityDate === null) return false;
  if (p.lcrCashflowRole === 'Inflow') return true;
  return p.lcrCashflowRole === 'Outflow' && !isDeposit(p);
}

/** Contractual principal + interest due within the LCR window (anything already past due counts as due now). */
function dueWithinWindow(pc: PositionCashflows, asOfDate: IsoDate): number {
  return pc.contractual
    .filter((f) => daysBetween(asOfDate, f.date) <= LCR_WINDOW_DAYS)
    .reduce((s, f) => s + f.principal + f.interest, 0);
}

// Only the unencumbered portion counts; liens are amounts rather than flags, since real liens are often partial.
// With the run's cashflow book, dated inflows and term funding count only what falls due inside the 30-day
// window (see lcrReadsCashflows); without it, every flow is the balance × rate, as before.
export function computeLcr(
  positions: Position[],
  ctx: LiquidityContext,
  stress: LcrStress = {},
  book?: PositionCashflows[],
): LcrResult {
  const bookById = book ? new Map(book.map((pc) => [pc.positionId, pc])) : null;
  const windowed = (p: Position): PositionCashflows | null =>
    bookById && lcrReadsCashflows(p) ? (bookById.get(p.id) ?? null) : null;
  /** The amount a flow rate applies to: what is due in the window from the book, else the balance. */
  const flowBase = (p: Position): number => {
    const pc = windowed(p);
    return pc ? dueWithinWindow(pc, ctx.asOfDate) : p.amount;
  };
  const extraHaircut = (stress.hqlaHaircutPercent ?? 0) / 100;
  const runoffMultiplier = stress.runoffMultiplier ?? 1;
  const inflowSuppression = (stress.inflowSuppressionPercent ?? 0) / 100;

  const hqlaCandidates = positions.filter((p) => p.lcrCashflowRole === 'HQLA');

  const haircutWeight = (p: Position) => Math.max(0, 1 - p.hqlaHaircutPct / 100 - extraHaircut);
  /** Only the portion free of lien is eligible, after its own haircut. */
  const eligibleAmount = (p: Position) => Math.max(0, p.amount - p.lienAmount) * haircutWeight(p);

  const hqla = hqlaCandidates.reduce(
    (total, p) => total + convert(eligibleAmount(p), p.currency, ctx.reportingCurrency, ctx.fx),
    0,
  );

  const hqlaByLevel: Record<string, number> = {};
  for (const p of hqlaCandidates) {
    const value = convert(eligibleAmount(p), p.currency, ctx.reportingCurrency, ctx.fx);
    if (value === 0) continue;
    hqlaByLevel[p.hqlaLevel] = (hqlaByLevel[p.hqlaLevel] ?? 0) + value;
  }

  const excludedEncumbered = hqlaCandidates.reduce(
    (total, p) =>
      total + convert(Math.min(p.amount, p.lienAmount) * haircutWeight(p), p.currency, ctx.reportingCurrency, ctx.fx),
    0,
  );

  const toReporting = (amount: number, p: Position) => convert(amount, p.currency, ctx.reportingCurrency, ctx.fx);

  const grossOutflows = positions
    .filter((p) => p.lcrCashflowRole === 'Outflow')
    .reduce((s, p) => s + toReporting(flowBase(p) * Math.min(1, ((p.lcrRatePct ?? 0) / 100) * runoffMultiplier), p), 0);

  const grossInflows = positions
    .filter((p) => p.lcrCashflowRole === 'Inflow')
    .reduce((s, p) => s + toReporting(flowBase(p) * ((p.lcrRatePct ?? 0) / 100) * (1 - inflowSuppression), p), 0);

  const inflowCap = 0.75 * grossOutflows;
  const eligibleInflows = Math.min(grossInflows, inflowCap);
  const netCashOutflows = grossOutflows - eligibleInflows;

  let cashflowWindow: LcrResult['cashflowWindow'];
  if (bookById) {
    cashflowWindow = {
      windowDays: LCR_WINDOW_DAYS,
      inflowsDue: 0,
      termFundingDue: 0,
      datedInflowBalance: 0,
      datedTermFundingBalance: 0,
    };
    for (const p of positions) {
      const pc = windowed(p);
      if (!pc) continue;
      const due = toReporting(dueWithinWindow(pc, ctx.asOfDate), p);
      if (p.lcrCashflowRole === 'Inflow') {
        cashflowWindow.inflowsDue += due;
        cashflowWindow.datedInflowBalance += toReporting(p.amount, p);
      } else {
        cashflowWindow.termFundingDue += due;
        cashflowWindow.datedTermFundingBalance += toReporting(p.amount, p);
      }
    }
  }

  return {
    hqla,
    hqlaByLevel,
    grossOutflows,
    grossInflows,
    inflowCap,
    eligibleInflows,
    netCashOutflows,
    lcrPercent: netCashOutflows > 0 ? (hqla / netCashOutflows) * 100 : null,
    excludedEncumbered,
    ...(cashflowWindow ? { cashflowWindow } : {}),
    currency: ctx.reportingCurrency,
    methodology:
      "Basel III LCR: HQLA net of each position's own haircut, unencumbered only, divided by 30-day net cash " +
      'outflows (gross outflows less inflows capped at 75% of outflows). Run-off and inflow rates, HQLA level and ' +
      'haircut are per-position fields set by the Product Characteristics rule, not inferred from product names. ' +
      (bookById
        ? "Dated inflows (loans, placements) and dated non-deposit term funding are read from the run's " +
          'contractual cashflows: only principal and interest falling due within 30 days is weighted by the ' +
          'inflow or run-off rate - the same cashflows the liquidity gap buckets. Non-maturity balances, customer ' +
          'deposits (which can be broken early), HQLA and off-balance-sheet commitments stay on balance × rate. '
        : '') +
      'Returns null rather than a figure when net cash outflows are zero or negative.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Net Stable Funding Ratio
// ─────────────────────────────────────────────────────────────────────────

export interface NsfrResult {
  availableStableFunding: number;
  requiredStableFunding: number;
  nsfrPercent: number | null;
  currency: CurrencyCode;
  methodology: string;
}

export interface NsfrStress {
  /** Share of liability balances assumed already gone before ASF is computed. */
  depositAttritionPercent?: number;
}

// ASF is computed over everything that is not an asset, so Capital contributes at its own ASF factor.
export function computeNsfr(positions: Position[], ctx: LiquidityContext, stress: NsfrStress = {}): NsfrResult {
  const attrition = (stress.depositAttritionPercent ?? 0) / 100;

  const availableStableFunding = sumConverted(
    positions.filter((p) => p.category !== 'Asset'),
    ctx,
    (p) => ((p.asfFactorPct ?? 0) / 100) * (p.category === 'Liability' ? 1 - attrition : 1),
  );

  const requiredStableFunding = sumConverted(
    positions.filter((p) => p.category === 'Asset'),
    ctx,
    (p) => (p.rsfFactorPct ?? 0) / 100,
  );

  return {
    availableStableFunding,
    requiredStableFunding,
    nsfrPercent: requiredStableFunding > 0 ? (availableStableFunding / requiredStableFunding) * 100 : null,
    currency: ctx.reportingCurrency,
    methodology:
      'Basel III NSFR: available stable funding (liabilities and capital, weighted by per-position ASF factor) ' +
      'over required stable funding (assets, weighted by per-position RSF factor). Capital contributes to ASF at ' +
      'its own factor. Stress applies deposit attrition to liabilities only, not to capital.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Loan-to-deposit
// ─────────────────────────────────────────────────────────────────────────

export interface LoanToDepositResult {
  loans: number;
  deposits: number;
  ratioPercent: number | null;
  currency: CurrencyCode;
  methodology: string;
}

// Loans and deposits are identified by Common Chart of Accounts classification, not by matching the product name.
export function computeLoanToDeposit(positions: Position[], ctx: LiquidityContext): LoanToDepositResult {
  const loans = sumConverted(positions.filter(isLoan, undefined), ctx);
  const deposits = sumConverted(positions.filter(isDeposit, undefined), ctx);
  return {
    loans,
    deposits,
    ratioPercent: deposits > 0 ? (loans / deposits) * 100 : null,
    currency: ctx.reportingCurrency,
    methodology:
      'Total customer loans over total customer deposits. Interbank placements and borrowings are excluded from ' +
      'both, being wholesale rather than customer flows, and so are internal, suspense, nostro and vostro ' +
      'accounts - they are not customer money and counting them would inflate the ratio.',
  };
}

/** Customer loans. `accountClass` excludes internal accounts regardless of how the product is described. */
export function isLoan(p: Position): boolean {
  return (
    p.category === 'Asset' &&
    p.accountClass === 'Customer' &&
    /^loans|trade finance/i.test(p.productClass) &&
    !/interbank/i.test(p.productClass)
  );
}

/** Customer deposits. Internal, suspense, nostro and vostro balances are not. */
export function isDeposit(p: Position): boolean {
  return (
    p.category === 'Liability' &&
    p.accountClass === 'Customer' &&
    /deposits/i.test(p.productClass) &&
    !/interbank/i.test(p.productClass)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Liquidity gap
// ─────────────────────────────────────────────────────────────────────────

export interface LiquidityGapResult {
  buckets: BucketedTotal[];
  currency: CurrencyCode;
  basis: 'Contractual' | 'Behavioural';
  /**
   * Balances with no date to bucket on under this basis - no contractual maturity and (behavioural basis) no
   * behaviour pattern. Reported, never silently dropped. Absent on runs computed before it existed.
   */
  undated?: { assets: number; liabilities: number };
  /** 'Cashflows' when bucketed from the run's cashflow book; 'Balances' when each balance sits whole on its maturity date. */
  source?: 'Cashflows' | 'Balances';
  methodology: string;
}

/**
 * Liquidity gap. With the run's cashflow `book` (cashflow.ts), every principal flow is bucketed on its own
 * payment date - amortisation and, on the behavioural basis, prepayment, deposit run-off and term-deposit
 * roll-over all move cash between buckets - via the same bucketize the rest of the platform uses. Without a
 * book, each balance sits whole on its maturity date. Either way, balances with no date are reported in
 * `undated` rather than dropped.
 */
export function computeLiquidityGap(
  positions: Position[],
  ctx: LiquidityContext,
  ladder: TimeBucketLadder,
  basis: 'Contractual' | 'Behavioural' = 'Contractual',
  book?: PositionCashflows[],
): LiquidityGapResult {
  const toReporting = (amount: number, currency: CurrencyCode) =>
    convert(amount, currency, ctx.reportingCurrency, ctx.fx);

  if (book) {
    const bucketed = bucketCashflows(book, ladder, ctx.asOfDate, basis, { view: 'Cashflow', convert: toReporting });
    return {
      buckets: bucketed.buckets,
      currency: ctx.reportingCurrency,
      basis,
      undated: bucketed.undated,
      source: 'Cashflows',
      methodology:
        `${basis} liquidity gap from the run's cashflow book: every principal flow is bucketed on its own ` +
        'payment date against the active Time Bucket rule - amortisation instalments, not just the final ' +
        'maturity' +
        (basis === 'Behavioural'
          ? ', with prepayment (Prepayment rule CPR), non-maturity deposit run-off (behaviour pattern tiers) and ' +
            'term-deposit early withdrawal / roll-over applied'
          : '') +
        '. Assets less liabilities and capital per bucket, with a running cumulative gap. The same cashflows ' +
        'feed the repricing gap, NII, EVE and transfer pricing. Balances with no date to bucket on - no ' +
        'contractual maturity' +
        (basis === 'Behavioural' ? ' and no behaviour pattern' : '') +
        ' - are reported as not bucketed rather than dropped.',
    };
  }

  const undated = { assets: 0, liabilities: 0 };
  for (const p of positions) {
    if (p.maturityDate !== null) continue;
    const amount = toReporting(p.amount, p.currency);
    if (p.category === 'Asset') undated.assets += amount;
    else undated.liabilities += amount;
  }
  const buckets = bucketize(
    ladder,
    ctx.asOfDate,
    positions.map((p) => ({
      amount: toReporting(p.amount, p.currency),
      isAsset: p.category === 'Asset',
      date: p.maturityDate,
    })),
  );

  return {
    buckets,
    currency: ctx.reportingCurrency,
    basis,
    undated,
    source: 'Balances',
    methodology:
      `${basis} liquidity gap: assets less liabilities and capital by maturity bucket, with a running cumulative ` +
      "gap. Buckets are derived from each position's maturity date against the active Time Bucket rule, so " +
      'changing the ladder genuinely changes the allocation. Balances with no maturity date are reported as not ' +
      'bucketed rather than dropped.',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Depositor concentration
// ─────────────────────────────────────────────────────────────────────────

export interface ConcentrationEntry {
  counterpartyId: string;
  amount: number;
  sharePercent: number;
}

export interface ConcentrationResult {
  byCounterparty: ConcentrationEntry[];
  totalDeposits: number;
  largestSharePercent: number | null;
  topFiveSharePercent: number | null;
  topTenSharePercent: number | null;
  herfindahlIndex: number | null;
  unattributedAmount: number;
  currency: CurrencyCode;
  methodology: string;
}

/** Depositor concentration, grouped by counterparty. */
export function computeConcentration(positions: Position[], ctx: LiquidityContext): ConcentrationResult {
  const deposits = positions.filter(isDeposit);
  const totalDeposits = sumConverted(deposits, ctx);

  const byId = new Map<string, number>();
  let unattributedAmount = 0;
  for (const p of deposits) {
    const value = convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
    if (!p.counterpartyId) {
      unattributedAmount += value;
      continue;
    }
    byId.set(p.counterpartyId, (byId.get(p.counterpartyId) ?? 0) + value);
  }

  const byCounterparty: ConcentrationEntry[] = Array.from(byId.entries())
    .map(([counterpartyId, amount]) => ({
      counterpartyId,
      amount,
      sharePercent: totalDeposits > 0 ? (amount / totalDeposits) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topN = (n: number) =>
    byCounterparty.length === 0 ? null : byCounterparty.slice(0, n).reduce((s, e) => s + e.sharePercent, 0);

  return {
    byCounterparty,
    totalDeposits,
    largestSharePercent: byCounterparty[0]?.sharePercent ?? null,
    topFiveSharePercent: topN(5),
    topTenSharePercent: topN(10),
    // Conventional 0-10,000 scale (sum of squared percentage-point shares) - dividing by 100 before squaring would put this on a 0-1 scale instead.
    herfindahlIndex: byCounterparty.length === 0 ? null : byCounterparty.reduce((s, e) => s + e.sharePercent ** 2, 0),
    unattributedAmount,
    currency: ctx.reportingCurrency,
    methodology:
      'Customer deposits grouped by counterparty, with largest-single, top-5 and top-10 shares and a Herfindahl ' +
      'index. Deposits carrying no counterparty are reported separately as unattributed rather than being ' +
      'dropped or treated as one depositor, either of which would distort the measure.',
  };
}

export interface AffiliateFundingShare {
  affiliateCode: string;
  amount: number;
  sharePercent: number;
}

// A different question from `computeConcentration`: this measures the Group's own funding diversification
// across affiliates, not customer concentration risk, and is only meaningful at Group scope.
export function computeDepositsByAffiliate(positions: Position[], ctx: LiquidityContext): AffiliateFundingShare[] {
  const deposits = positions.filter(isDeposit);
  const total = sumConverted(deposits, ctx);

  const byAffiliate = new Map<string, number>();
  for (const p of deposits) {
    const value = convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
    byAffiliate.set(p.affiliateCode, (byAffiliate.get(p.affiliateCode) ?? 0) + value);
  }

  return Array.from(byAffiliate.entries())
    .map(([affiliateCode, amount]) => ({
      affiliateCode,
      amount,
      sharePercent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}
