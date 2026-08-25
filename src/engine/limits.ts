/**
 * Limit monitoring, temporary limits and breach detection.
 *
 * RFP §2.1 asks for "a series of escalation points as the metric utilization
 * approaches and breaches a limit", plus "the allowance of temporary limits
 * and timelines of expiry" and "notes on causes of the breach and the
 * resolution actions and timelines".
 *
 * v1 had two tiers, five hardcoded thresholds, and no concept of a temporary
 * limit, an expiry or a breach note (defect D-08). All three are here.
 */

import type { IsoDate, LimitStatus, Severity } from './types';

/** Whether a higher value is better (LCR) or worse (loan-to-deposit). */
export type LimitDirection = 'higher-is-better' | 'lower-is-better';

export interface LimitConfig {
  id: string;
  metricKey: string;
  label: string;
  affiliateCode: string | null;
  direction: LimitDirection;
  /** Three tiers, per RFP §2.1's "series of escalation points". */
  greenThreshold: number;
  amberThreshold: number;
  redThreshold: number;
  /** The regulator's own floor, where one exists — distinct from internal appetite. */
  regulatoryMinimum: number | null;
  isActive: boolean;
  updatedBy: string;
  updatedAt: string;
}

/**
 * A time-boxed relaxation of a limit.
 *
 * Temporary limits expire on their own date. Evaluation takes the as-of date
 * so an expired relaxation stops applying without anyone having to remember
 * to remove it.
 */
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

/**
 * Evaluate one metric against its limit.
 *
 * A `null` value yields `No data` rather than a Green — an unmeasured metric
 * is not a compliant one, and reporting it as green is how a gap becomes
 * invisible.
 */
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

  // Utilisation measures how far the metric has travelled from its green
  // threshold toward its red one — 100% means it is at the red line.
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

/**
 * Compare two evaluations and describe the transition.
 *
 * Only transitions raise events. v1 got this right and it is worth keeping:
 * emitting an event on every evaluation floods the queue and trains people
 * to ignore it.
 */
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

/**
 * Jurisdiction-specific regulatory minima.
 *
 * CBN, Bank of Ghana and BCEAO do not impose identical requirements, so
 * these are seeded per regulator during onboarding rather than assumed
 * uniform across the Group.
 */
export const REGULATORY_MINIMA: Record<string, Record<string, number>> = {
  CBN: { lcrPercent: 100, nsfrPercent: 100, loanToDepositPercent: 65 },
  'Bank of Ghana': { lcrPercent: 100, nsfrPercent: 100 },
  BCEAO: { lcrPercent: 100, nsfrPercent: 100 },
};
