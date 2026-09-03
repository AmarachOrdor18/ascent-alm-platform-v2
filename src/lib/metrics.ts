import type { CalculationElement, RunResult } from '@/engine/types';

export interface MetricSpec {
  key: string;
  label: string;
  /** Which run element carries it. */
  element: CalculationElement;
  /** How it reads: a percentage, a count of days, or a money amount. */
  unit: 'percent' | 'days' | 'amount';
  /** Pull the value out of that element's payload. */
  extract: (payload: Record<string, unknown>) => number | null;
}

/** Read a numeric field, treating anything non-finite as absent rather than zero. */
function num(payload: Record<string, unknown>, field: string): number | null {
  const v = payload[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const METRIC_SPECS: MetricSpec[] = [
  { key: 'lcrPercent', label: 'Liquidity Coverage Ratio', element: 'Lcr', unit: 'percent',
    extract: (p) => num(p, 'lcrPercent') },
  { key: 'nsfrPercent', label: 'Net Stable Funding Ratio', element: 'Nsfr', unit: 'percent',
    extract: (p) => num(p, 'nsfrPercent') },
  { key: 'loanToDepositPercent', label: 'Loan-to-Deposit Ratio', element: 'LoanToDeposit', unit: 'percent',
    extract: (p) => num(p, 'ratioPercent') },
  { key: 'survivalHorizonDays', label: 'Liquidity Survival Horizon', element: 'SurvivalHorizon', unit: 'days',
    extract: (p) => num(p, 'survivalHorizonDays') },
  { key: 'largestDepositorSharePercent', label: 'Largest Depositor Share', element: 'Concentration', unit: 'percent',
    extract: (p) => num(p, 'largestSharePercent') },
  { key: 'topTenDepositorSharePercent', label: 'Top-10 Depositor Concentration', element: 'Concentration', unit: 'percent',
    extract: (p) => num(p, 'topTenSharePercent') },
  { key: 'nplRatioPercent', label: 'Non-Performing Loan Ratio', element: 'ProfitabilityRatios', unit: 'percent',
    extract: (p) => num(p, 'nplRatioPercent') },
  { key: 'nplCoverageRatioPercent', label: 'NPL Coverage Ratio', element: 'ProfitabilityRatios', unit: 'percent',
    extract: (p) => num(p, 'nplCoverageRatioPercent') },
  { key: 'netInterestMarginPercent', label: 'Net Interest Margin', element: 'ProfitabilityRatios', unit: 'percent',
    extract: (p) => num(p, 'netInterestMarginPercent') },
  { key: 'niiSensitivityPercent', label: 'NII Sensitivity', element: 'NiiSensitivity', unit: 'percent',
    extract: (p) => num(p, 'niiSensitivityPercent') },
  { key: 'eveSensitivityPercent', label: 'EVE Sensitivity (% of capital)', element: 'EveSensitivity', unit: 'percent',
    extract: (p) => num(p, 'eveSensitivityPercentOfEquity') },
  { key: 'fxNetOpenPositionPercent', label: 'Aggregate FX Net Open Position', element: 'FxPosition', unit: 'percent',
    extract: (p) => num(p, 'aggregatePercentOfCapital') },
];

export const METRIC_BY_KEY = new Map(METRIC_SPECS.map((m) => [m.key, m]));

/** Absent from the map means the run didn't compute that element; `null` means it did but couldn't produce a figure (e.g. LCR over zero net outflows). */
export function extractMetrics(results: RunResult[]): Map<string, number | null> {
  const byElement = new Map(results.map((r) => [r.element, r.payload as Record<string, unknown>]));
  const out = new Map<string, number | null>();

  for (const spec of METRIC_SPECS) {
    const payload = byElement.get(spec.element);
    if (payload === undefined) continue; // element not computed by this run
    out.set(spec.key, spec.extract(payload));
  }
  return out;
}

/** Convenience for a single key. Returns null when absent or not computable. */
export function metricValue(results: RunResult[], key: string): number | null {
  return extractMetrics(results).get(key) ?? null;
}

/** Format a metric for display, respecting its unit. */
export function formatMetric(value: number | null, key: string): string {
  if (value === null) return '-';
  const unit = METRIC_BY_KEY.get(key)?.unit ?? 'percent';
  if (unit === 'days') return `${Math.round(value)} days`;
  if (unit === 'amount') return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${value.toFixed(2)}%`;
}
