import type { IsoDate, LimitStatus, Severity } from './types';

/** Whether a higher value is better (LCR) or worse (loan-to-deposit). */
export type LimitDirection = 'higher-is-better' | 'lower-is-better';

export interface LimitConfig {
  id: string;
  metricKey: string;
  label: string;
  affiliateCode: string | null;
  direction: LimitDirection;
  greenThreshold: number;
  amberThreshold: number;
  redThreshold: number;
  /** The regulator's own floor, where one exists — distinct from internal appetite. */
  regulatoryMinimum: number | null;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

// Evaluation takes the as-of date so an expired relaxation stops applying automatically.
export interface TemporaryLimit {
  id: string;
  limitId: string;
  amberThreshold: number;
  redThreshold: number;
  reason: string;
  effectiveFrom: IsoDate;
  expiresOn: IsoDate;
  approvedBy: string;
  approvedAt: string;
}

export interface BreachNote {
  id: string;
  breachId: string;
  cause: string;
  resolutionAction: string;
  targetResolutionDate: IsoDate | null;
  authorName: string;
  recordedAt: string;
}

export interface LimitEvaluation {
  limitId: string;
  metricKey: string;
  label: string;
  value: number | null;
  status: LimitStatus | 'No data';
  /** How far into the appetite range the metric sits, 0–100+. */
  utilisationPercent: number | null;
  appliedAmberThreshold: number;
  appliedRedThreshold: number;
  temporaryLimitId: string | null;
  temporaryLimitExpiresOn: IsoDate | null;
  breachesRegulatoryMinimum: boolean;
  severity: Severity | null;
  headroom: number | null;
}

function isEffective(temp: TemporaryLimit, asOfDate: IsoDate): boolean {
  return temp.effectiveFrom <= asOfDate && asOfDate <= temp.expiresOn;
}

// A null value yields 'No data' rather than 'Green' — an unmeasured metric is not a compliant one.
export function evaluateLimit(
  config: LimitConfig,
  value: number | null,
  asOfDate: IsoDate,
  temporaryLimits: TemporaryLimit[] = [],
): LimitEvaluation {
  const active = temporaryLimits.find((t) => t.limitId === config.id && isEffective(t, asOfDate)) ?? null;
  const amber = active?.amberThreshold ?? config.amberThreshold;
  const red = active?.redThreshold ?? config.redThreshold;

  const base = {
    limitId: config.id,
    metricKey: config.metricKey,
    label: config.label,
    value,
    appliedAmberThreshold: amber,
    appliedRedThreshold: red,
    temporaryLimitId: active?.id ?? null,
    temporaryLimitExpiresOn: active?.expiresOn ?? null,
  };

  if (value === null) {
    return {
      ...base,
      status: 'No data',
      utilisationPercent: null,
      breachesRegulatoryMinimum: false,
      severity: null,
      headroom: null,
    };
  }

  const higherIsBetter = config.direction === 'higher-is-better';
  const status: LimitStatus = higherIsBetter
    ? value <= red
      ? 'Red'
      : value <= amber
        ? 'Amber'
        : 'Green'
    : value >= red
      ? 'Red'
      : value >= amber
        ? 'Amber'
        : 'Green';

  const breachesRegulatoryMinimum =
    config.regulatoryMinimum !== null &&
    (higherIsBetter ? value < config.regulatoryMinimum : value > config.regulatoryMinimum);

  // 100% utilisation means the metric is at the red line.
  const span = Math.abs(config.greenThreshold - red);
  const travelled = Math.abs(config.greenThreshold - value);
  const utilisationPercent = span > 0 ? Math.min(999, (travelled / span) * 100) : null;

  return {
    ...base,
    status,
    utilisationPercent,
    breachesRegulatoryMinimum,
    severity: breachesRegulatoryMinimum
      ? 'Critical'
      : status === 'Red'
        ? 'High'
        : status === 'Amber'
          ? 'Medium'
          : 'Low',
    headroom: higherIsBetter ? value - red : red - value,
  };
}

export interface BreachTransition {
  metricKey: string;
  from: LimitStatus | 'No data';
  to: LimitStatus | 'No data';
  isNewBreach: boolean;
  isResolved: boolean;
  isEscalation: boolean;
}

export function detectTransition(previous: LimitEvaluation | null, current: LimitEvaluation): BreachTransition | null {
  const from = previous?.status ?? 'No data';
  const to = current.status;
  if (from === to) return null;

  const rank: Record<string, number> = { 'No data': -1, Green: 0, Amber: 1, Red: 2 };
  return {
    metricKey: current.metricKey,
    from,
    to,
    isNewBreach: to === 'Red' && from !== 'Red',
    isResolved: to === 'Green' && (from === 'Amber' || from === 'Red'),
    isEscalation: (rank[to] ?? 0) > (rank[from] ?? 0),
  };
}

/** Temporary limits expiring within the window — the reminder that stops silent reversion. */
export function expiringSoon(temporaryLimits: TemporaryLimit[], asOfDate: IsoDate, withinDays = 14): TemporaryLimit[] {
  const cutoff = new Date(Date.parse(`${asOfDate}T00:00:00Z`) + withinDays * 86_400_000).toISOString().slice(0, 10);
  return temporaryLimits.filter((t) => t.expiresOn >= asOfDate && t.expiresOn <= cutoff);
}

// Seeded per regulator during onboarding — requirements are not uniform across jurisdictions.
export const REGULATORY_MINIMA: Record<string, Record<string, number>> = {
  CBN: { lcrPercent: 100, nsfrPercent: 100, loanToDepositPercent: 65 },
  'Bank of Ghana': { lcrPercent: 100, nsfrPercent: 100 },
  BCEAO: { lcrPercent: 100, nsfrPercent: 100 },
  'Central Bank of Kenya': { lcrPercent: 100, nsfrPercent: 100 },
};
