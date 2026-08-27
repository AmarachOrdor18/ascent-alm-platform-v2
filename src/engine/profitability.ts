import type { CurrencyCode, Position } from './types';
import { convert, type FxTable } from './fx';
import { isLoan, isDeposit } from './liquidity';

export interface ProfitabilityContext {
  reportingCurrency: CurrencyCode;
  fx: FxTable;
  /** Non-interest income for the period, where a fee feed exists. */
  nonInterestIncome?: number | null;
}

export interface ProfitabilityResult {
  totalAssets: number;
  interestIncome: number;
  interestExpense: number;
  netInterestIncome: number;
  netInterestMarginPercent: number | null;
  nonEarningAssetRatioPercent: number | null;
  loanToDepositPercent: number | null;
  nplRatioPercent: number | null;
  nplCoverageRatioPercent: number | null;
  interestIncomeToTotalIncomePercent: number | null;
  interestBearingAssetsToLiabilities: number | null;
  currency: CurrencyCode;
  notes: string[];
}

/** Anything Substandard or worse is non-performing under the CBN classification. */
const NON_PERFORMING = new Set(['Substandard', 'Doubtful', 'Loss']);

export function computeProfitability(positions: Position[], ctx: ProfitabilityContext): ProfitabilityResult {
  const value = (p: Position, weight = 1) => convert(p.amount * weight, p.currency, ctx.reportingCurrency, ctx.fx);

  const assets = positions.filter((p) => p.category === 'Asset' && !p.isOffBalanceSheet);
  const liabilities = positions.filter((p) => p.category === 'Liability' && !p.isOffBalanceSheet);

  const totalAssets = assets.reduce((s, p) => s + value(p), 0);
  const interestIncome = assets.reduce((s, p) => s + value(p, (p.interestRatePct ?? 0) / 100), 0);
  const interestExpense = liabilities.reduce((s, p) => s + value(p, (p.interestRatePct ?? 0) / 100), 0);
  const netInterestIncome = interestIncome - interestExpense;

  const nonEarning = assets.filter((p) => (p.interestRatePct ?? 0) === 0).reduce((s, p) => s + value(p), 0);

  const loans = positions.filter(isLoan);
  const totalLoans = loans.reduce((s, p) => s + value(p), 0);
  const nplBalance = loans.filter((p) => NON_PERFORMING.has(p.performingStatus)).reduce((s, p) => s + value(p), 0);
  const provisions = loans.reduce(
    (s, p) => s + convert(p.provisionAmount ?? 0, p.currency, ctx.reportingCurrency, ctx.fx),
    0,
  );

  const deposits = positions.filter(isDeposit).reduce((s, p) => s + value(p), 0);

  const interestBearingAssets = assets.filter((p) => (p.interestRatePct ?? 0) > 0).reduce((s, p) => s + value(p), 0);
  const interestBearingLiabilities = liabilities
    .filter((p) => (p.interestRatePct ?? 0) > 0)
    .reduce((s, p) => s + value(p), 0);

  const notes: string[] = [
    "NIM, non-earning asset ratio and loan-to-deposit are computed directly from position balances and each position's own rate.",
    'NPL ratio uses the CBN loan classification (Substandard, Doubtful and Loss are non-performing); Bank of Ghana and BCEAO mirror it closely.',
  ];

  const nonInterestIncome = ctx.nonInterestIncome ?? null;
  if (nonInterestIncome === null) {
    notes.push(
      'Interest income as a share of total income requires a fee and non-interest-income feed, which is not ingested — left null rather than fabricated.',
    );
  }
  if (provisions === 0 && nplBalance > 0) {
    notes.push('NPL coverage is null: loans are classified as non-performing but carry no provision amounts.');
  }

  return {
    totalAssets,
    interestIncome,
    interestExpense,
    netInterestIncome,
    netInterestMarginPercent: totalAssets > 0 ? (netInterestIncome / totalAssets) * 100 : null,
    nonEarningAssetRatioPercent: totalAssets > 0 ? (nonEarning / totalAssets) * 100 : null,
    loanToDepositPercent: deposits > 0 ? (totalLoans / deposits) * 100 : null,
    nplRatioPercent: totalLoans > 0 ? (nplBalance / totalLoans) * 100 : null,
    nplCoverageRatioPercent: nplBalance > 0 && provisions > 0 ? (provisions / nplBalance) * 100 : null,
    interestIncomeToTotalIncomePercent:
      nonInterestIncome !== null && interestIncome + nonInterestIncome > 0
        ? (interestIncome / (interestIncome + nonInterestIncome)) * 100
        : null,
    interestBearingAssetsToLiabilities:
      interestBearingLiabilities > 0 ? interestBearingAssets / interestBearingLiabilities : null,
    currency: ctx.reportingCurrency,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// FX position
// ─────────────────────────────────────────────────────────────────────────

export interface FxPositionLine {
  currency: CurrencyCode;
  assets: number;
  liabilities: number;
  netOpenPosition: number;
  netOpenPositionPercentOfCapital: number | null;
}

export interface FxPositionResult {
  lines: FxPositionLine[];
  aggregateNetOpenPosition: number;
  aggregatePercentOfCapital: number | null;
  currency: CurrencyCode;
  methodology: string;
}

// The aggregate sums absolute net positions rather than netting long against short across currencies.
export function computeFxPosition(
  positions: Position[],
  ctx: ProfitabilityContext,
  capital: number | null,
): FxPositionResult {
  const byCurrency = new Map<CurrencyCode, { assets: number; liabilities: number }>();

  for (const p of positions) {
    if (p.category === 'Capital') continue;
    const slot = byCurrency.get(p.currency) ?? { assets: 0, liabilities: 0 };
    const value = convert(p.amount, p.currency, ctx.reportingCurrency, ctx.fx);
    if (p.category === 'Asset') slot.assets += value;
    else slot.liabilities += value;
    byCurrency.set(p.currency, slot);
  }

  const lines: FxPositionLine[] = Array.from(byCurrency.entries())
    .map(([currency, v]) => {
      const netOpenPosition = v.assets - v.liabilities;
      return {
        currency,
        assets: v.assets,
        liabilities: v.liabilities,
        netOpenPosition,
        netOpenPositionPercentOfCapital: capital && capital > 0 ? (netOpenPosition / capital) * 100 : null,
      };
    })
    .sort((a, b) => Math.abs(b.netOpenPosition) - Math.abs(a.netOpenPosition));

  const aggregate = lines
    .filter((l) => l.currency !== ctx.reportingCurrency)
    .reduce((s, l) => s + Math.abs(l.netOpenPosition), 0);

  return {
    lines,
    aggregateNetOpenPosition: aggregate,
    aggregatePercentOfCapital: capital && capital > 0 ? (aggregate / capital) * 100 : null,
    currency: ctx.reportingCurrency,
    methodology:
      'Net open position per currency, converted to the reporting currency. The aggregate sums absolute net ' +
      'positions across non-reporting currencies — the conservative shorthand measure — rather than netting ' +
      'long against short, which would understate exposure.',
  };
}
