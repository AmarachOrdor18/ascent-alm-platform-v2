import type { IsoDate, LimitStatus } from './types';

export interface KriObservation {
  asOfDate: IsoDate;
  value: number;
}

export interface KriDefinition {
  id: string;
  metricKey: string;
  label: string;
  /** Whether a rising value is deterioration. */
  direction: 'higher-is-better' | 'lower-is-better';
  /** How many observations to trend over. */
  windowSize: number;
  /** Percentage-point move across the window that counts as a warning. */
  warningDeltaPct: number;
  /** …and as a critical trend. */
  criticalDeltaPct: number;
  isActive: boolean;
}

export type TrendDirection = 'Improving' | 'Stable' | 'Deteriorating';

export interface KriEvaluation {
  definitionId: string;
  metricKey: string;
  label: string;
  currentValue: number | null;
  priorValue: number | null;
  changeOverWindow: number | null;
  /** Average change per observation — the slope, not just the endpoints. */
  slopePerPeriod: number | null;
  trend: TrendDirection;
  status: LimitStatus | 'No data';
  observationsUsed: number;
  /** Projected value if the current slope persists for another window. */
  projectedValue: number | null;
  narrative: string;
}

// Slope is a least-squares fit rather than first-to-last, so one anomalous month doesn't read as a trend.
export function evaluateKri(definition: KriDefinition, observations: KriObservation[]): KriEvaluation {
  const sorted = [...observations].sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
  const window = sorted.slice(-definition.windowSize);

  const base = {
    definitionId: definition.id,
    metricKey: definition.metricKey,
    label: definition.label,
    observationsUsed: window.length,
  };

  if (window.length === 0) {
    return {
      ...base,
      currentValue: null,
      priorValue: null,
      changeOverWindow: null,
      slopePerPeriod: null,
      trend: 'Stable',
      status: 'No data',
      projectedValue: null,
      narrative: 'No observations loaded for this indicator.',
    };
  }

  const currentValue = window[window.length - 1]!.value;
  const priorValue = window.length > 1 ? window[0]!.value : null;

  if (window.length < 3) {
    return {
      ...base,
      currentValue,
      priorValue,
      changeOverWindow: priorValue !== null ? currentValue - priorValue : null,
      slopePerPeriod: null,
      trend: 'Stable',
      status: 'No data',
      projectedValue: null,
      narrative: `Only ${window.length} observation(s) — at least 3 as-of dates are needed before a trend is meaningful.`,
    };
  }

  const slope = leastSquaresSlope(window.map((o, i) => [i, o.value] as const));
  const changeOverWindow = currentValue - window[0]!.value;

  // Deterioration is direction-aware: a falling LCR is bad, a falling
  // loan-to-deposit ratio is good.
  const deterioration = definition.direction === 'higher-is-better' ? -changeOverWindow : changeOverWindow;

  const status: LimitStatus =
    deterioration >= definition.criticalDeltaPct
      ? 'Red'
      : deterioration >= definition.warningDeltaPct
        ? 'Amber'
        : 'Green';

  const trend: TrendDirection =
    Math.abs(changeOverWindow) < 0.01 ? 'Stable' : deterioration > 0 ? 'Deteriorating' : 'Improving';

  return {
    ...base,
    currentValue,
    priorValue,
    changeOverWindow,
    slopePerPeriod: slope,
    trend,
    status,
    projectedValue: currentValue + slope * definition.windowSize,
    narrative:
      trend === 'Deteriorating'
        ? `${definition.label} has moved ${changeOverWindow.toFixed(2)} over ${window.length} periods and is deteriorating at ${Math.abs(slope).toFixed(2)} per period.`
        : trend === 'Improving'
          ? `${definition.label} is improving at ${Math.abs(slope).toFixed(2)} per period.`
          : `${definition.label} is stable over the observation window.`,
  };
}

/** Ordinary least-squares slope through the observations. */
function leastSquaresSlope(points: ReadonlyArray<readonly [number, number]>): number {
  const n = points.length;
  const sumX = points.reduce((s, [x]) => s + x, 0);
  const sumY = points.reduce((s, [, y]) => s + y, 0);
  const sumXy = points.reduce((s, [x, y]) => s + x * y, 0);
  const sumXx = points.reduce((s, [x]) => s + x * x, 0);
  const denominator = n * sumXx - sumX * sumX;
  return denominator === 0 ? 0 : (n * sumXy - sumX * sumY) / denominator;
}

export const DEFAULT_KRIS: KriDefinition[] = [
  {
    id: 'KRI-LCR',
    metricKey: 'lcrPercent',
    label: 'Liquidity Coverage Ratio',
    direction: 'higher-is-better',
    windowSize: 6,
    warningDeltaPct: 10,
    criticalDeltaPct: 25,
    isActive: true,
  },
  {
    id: 'KRI-NSFR',
    metricKey: 'nsfrPercent',
    label: 'Net Stable Funding Ratio',
    direction: 'higher-is-better',
    windowSize: 6,
    warningDeltaPct: 5,
    criticalDeltaPct: 12,
    isActive: true,
  },
  {
    id: 'KRI-LDR',
    metricKey: 'loanToDepositPercent',
    label: 'Loan-to-Deposit Ratio',
    direction: 'lower-is-better',
    windowSize: 6,
    warningDeltaPct: 5,
    criticalDeltaPct: 12,
    isActive: true,
  },
  {
    id: 'KRI-SURVIVAL',
    metricKey: 'survivalHorizonDays',
    label: 'Liquidity Survival Horizon',
    direction: 'higher-is-better',
    windowSize: 6,
    warningDeltaPct: 3,
    criticalDeltaPct: 7,
    isActive: true,
  },
  {
    id: 'KRI-CONC',
    metricKey: 'topTenDepositorSharePercent',
    label: 'Top-10 Depositor Concentration',
    direction: 'lower-is-better',
    windowSize: 6,
    warningDeltaPct: 5,
    criticalDeltaPct: 10,
    isActive: true,
  },
  {
    id: 'KRI-NPL',
    metricKey: 'nplRatioPercent',
    label: 'Non-Performing Loan Ratio',
    direction: 'lower-is-better',
    windowSize: 6,
    warningDeltaPct: 1,
    criticalDeltaPct: 2.5,
    isActive: true,
  },
];
