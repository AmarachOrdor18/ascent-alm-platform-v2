/**
 * Liquidity risk — LCR, NSFR, loan-to-deposit, gap and concentration.
 *
 * Two things are structurally different from v1:
 *
 * 1. **Factors come from the data, not from regex.** v1 decided run-off
 *    rates, ASF and RSF by matching product names against 22 regular
 *    expressions compiled into TypeScript, so adding a product meant a code
 *    change (defect D-12, RFP §1.1). Here every factor is a field on the
 *    position, set by the Product Characteristics rule.
 *
 * 2. **Amounts are converted before they are summed.** v1's `num()` helper
 *    was literally `Number(p.amount)` with no currency check anywhere, so
 *    NGN, GHS, XOF and USD were added together (defect D-02). Every
 *    aggregate here goes through `convert`.
 *
 * 3. **Internal accounts are excluded from customer metrics.** Core banking
 *    systems classify every account, and suspense or internal accounts are
 *    not customer money. Counting them inflates loan-to-deposit and
 *    depositor concentration.
 */

import type { CurrencyCode, IsoDate, Position, TimeBucketLadder } from './types';
import { bucketize, type BucketedTotal } from './buckets';
import { convert, type FxTable } from './fx';

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
 * Basel III LCR.
 *
 * `HQLA / max(net cash outflows, 0)`, where net cash outflows are gross
 * 30-day outflows less inflows capped at 75% of outflows.
 *
 * Only the *unencumbered* portion counts. Liens are amounts rather than
 * flags, because real liens are partial: a bond of 500 carrying a lien of
 * 200 contributes 300 of HQLA — not nothing, and not all of it. v1 tested
 * only whether the product name matched `/government securities/i`, so a
 * pledged bill counted in full (defect D-03). The encumbered amount is
 * reported so the effect is visible rather than silent.
 */
export function computeLcr(positions: Position[], ctx: LiquidityContext, stress: LcrStress = {}): LcrResult {
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

  const grossOutflows = sumConverted(
    positions.filter((p) => p.lcrCashflowRole === 'Outflow'),
    ctx,
    (p) => Math.min(1, ((p.lcrRatePct ?? 0) / 100) * runoffMultiplier),
  );

  const grossInflows = sumConverted(
    positions.filter((p) => p.lcrCashflowRole === 'Inflow'),
    ctx,
    (p) => ((p.lcrRatePct ?? 0) / 100) * (1 - inflowSuppression),
  );

  const inflowCap = 0.75 * grossOutflows;
  const eligibleInflows = Math.min(grossInflows, inflowCap);
  const netCashOutflows = grossOutflows - eligibleInflows;

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
    currency: ctx.reportingCurrency,
    methodology:
      "Basel III LCR: HQLA net of each position's own haircut, unencumbered only, divided by 30-day net cash " +
      'outflows (gross outflows less inflows capped at 75% of outflows). Run-off and inflow rates, HQLA level and ' +
      'haircut are per-position fields set by the Product Characteristics rule, not inferred from product names. ' +
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

/**
 * Basel III NSFR — available over required stable funding.
 *
 * ASF is computed over everything that is not an asset, so Capital
 * contributes at its own ASF factor. v1 had no Capital category at all, so
 * equity simply did not appear in the numerator (defect P-04).
 */
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

/**
 * Loans and deposits are identified by their Common Chart of Accounts
 * classification rather than by matching the product name, so a new deposit
 * product is picked up by mapping it in the COA — not by editing a regex.
 */
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
      'accounts — they are not customer money and counting them would inflate the ratio.',
  };
}

/**
 * Customer loans.
 *
 * `accountClass` does the work an internal-account exclusion needs: a
 * suspense account holding loan-recovery entries is not a customer loan,
 * however its product is described.
 */
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
  methodology: string;
}

/**
 * Contractual gap buckets every position on its contractual maturity date.
 * The behavioural view is produced by `applyBehaviouralMaturity` in
 * `behavioural.ts`, which re-dates non-maturity deposits by their run-off
 * profile — v1's Behavioural/Contractual toggle rendered identical data in
 * both modes because no separate model existed.
 */
export function computeLiquidityGap(
  positions: Position[],
  ctx: LiquidityContext,
  ladder: TimeBucketLadder,
  basis: 'Contractual' | 'Behavioural' = 'Contractual',
): LiquidityGapResult {
  const buckets = bucketize(
    ladder,
    ctx.asOfDate,
    positions.map((p) => ({
      amount: convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx),
      isAsset: p.category === 'Asset',
      date: p.maturityDate,
    })),
  );

  return {
    buckets,
    currency: ctx.reportingCurrency,
    basis,
    methodology:
      `${basis} liquidity gap: assets less liabilities and capital by maturity bucket, with a running cumulative ` +
      "gap. Buckets are derived from each position's maturity date against the active Time Bucket rule, so " +
      'changing the ladder genuinely changes the allocation.',
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

/**
 * Depositor concentration, grouped by counterparty.
 *
 * RFP §2.1 asks for "Depositor Concentrations". v1 grouped by
 * `p.affiliate`, which answers how deposits are spread across the Group —
 * a different question entirely, and not the one a regulator asks
 * (defect D-04). Deposits with no counterparty are reported as
 * unattributed rather than being dropped or lumped into one bucket, since
 * either would distort the concentration measure.
 */
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
    herfindahlIndex:
      byCounterparty.length === 0 ? null : byCounterparty.reduce((s, e) => s + (e.sharePercent / 100) ** 2, 0),
    unattributedAmount,
    currency: ctx.reportingCurrency,
    methodology:
      'Customer deposits grouped by counterparty, with largest-single, top-5 and top-10 shares and a Herfindahl ' +
      'index. Deposits carrying no counterparty are reported separately as unattributed rather than being ' +
      'dropped or treated as one depositor, either of which would distort the measure.',
  };
}
