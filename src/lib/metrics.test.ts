/**
 * The join between run results and the monitoring engines.
 *
 * These tests exist because the failure this code fixes was silent: the
 * limits and KRI engines were complete, the runs were producing the right
 * numbers, and nothing connected them — so the monitoring screens showed
 * hardcoded figures that contradicted the results screens.
 */

import { describe, expect, it } from 'vitest';
import { extractMetrics, metricValue, formatMetric, METRIC_SPECS } from './metrics';
import { evaluateAll } from './limitHooks';
import { SEED_LIMITS } from '@/data/seed/limits';
import type { CalculationElement, RunResult } from '@/engine/types';

function result(element: CalculationElement, payload: Record<string, unknown>): RunResult {
  return {
    id: `R-${element}`, runId: 'RUN-1', element, payload,
    methodology: 'test', computedAt: '2026-08-01T00:00:00.000Z',
  };
}

const FULL: RunResult[] = [
  result('Lcr', { lcrPercent: 168.85759 }),
  result('Nsfr', { nsfrPercent: 103.631468 }),
  result('LoanToDeposit', { ratioPercent: 78.571429 }),
  result('SurvivalHorizon', { survivalHorizonDays: 17 }),
  result('Concentration', { largestSharePercent: 18.97, topTenSharePercent: 41.2 }),
  result('ProfitabilityRatios', { nplRatioPercent: 4.57, nplCoverageRatioPercent: 92.1, netInterestMarginPercent: 5.4 }),
  result('NiiSensitivity', { niiSensitivityPercent: -8.062891 }),
  result('EveSensitivity', { eveSensitivityPercentOfEquity: -13.809067 }),
  result('FxPosition', { aggregatePercentOfCapital: 12.4 }),
];

describe('extractMetrics', () => {
  it('pulls every declared metric off a complete result set', () => {
    const m = extractMetrics(FULL);
    expect(m.get('lcrPercent')).toBeCloseTo(168.85759, 5);
    expect(m.get('nsfrPercent')).toBeCloseTo(103.631468, 6);
    expect(m.get('loanToDepositPercent')).toBeCloseTo(78.571429, 6);
    expect(m.get('survivalHorizonDays')).toBe(17);
    expect(m.get('largestDepositorSharePercent')).toBe(18.97);
    expect(m.get('eveSensitivityPercentOfEquity' as string)).toBeUndefined();
    expect(m.get('eveSensitivityPercent')).toBeCloseTo(-13.809067, 6);
  });

  it('reads two metrics from one element without needing it twice', () => {
    const m = extractMetrics([result('Concentration', { largestSharePercent: 9, topTenSharePercent: 33 })]);
    expect(m.get('largestDepositorSharePercent')).toBe(9);
    expect(m.get('topTenDepositorSharePercent')).toBe(33);
  });

  it('distinguishes "element not run" from "element ran, no figure"', () => {
    // Absent key: the run never computed it.
    const partial = extractMetrics([result('Lcr', { lcrPercent: 120 })]);
    expect(partial.has('nsfrPercent')).toBe(false);

    // Present but null: it ran and could not produce a number — LCR over zero
    // net outflows, for instance. Reporting that as 0% would be a lie.
    const nulled = extractMetrics([result('Lcr', { lcrPercent: null })]);
    expect(nulled.has('lcrPercent')).toBe(true);
    expect(nulled.get('lcrPercent')).toBeNull();
  });

  it('treats a non-finite value as absent rather than as a number', () => {
    const m = extractMetrics([result('Lcr', { lcrPercent: Number.NaN })]);
    expect(m.get('lcrPercent')).toBeNull();
    const inf = extractMetrics([result('Lcr', { lcrPercent: Number.POSITIVE_INFINITY })]);
    expect(inf.get('lcrPercent')).toBeNull();
  });

  it('every spec names an element and a distinct key', () => {
    const keys = METRIC_SPECS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(METRIC_SPECS.every((s) => s.element.length > 0 && s.label.length > 0)).toBe(true);
  });

  it('metricValue returns null for a key nothing supplies', () => {
    expect(metricValue(FULL, 'notAMetric')).toBeNull();
  });
});

describe('formatMetric', () => {
  it('respects the unit', () => {
    expect(formatMetric(168.85759, 'lcrPercent')).toBe('168.86%');
    expect(formatMetric(17, 'survivalHorizonDays')).toBe('17 days');
    expect(formatMetric(null, 'lcrPercent')).toBe('—');
  });
});

describe('limits evaluated against real results', () => {
  const temps: never[] = [];

  it('grades the workbook figures against the seeded appetite', () => {
    const evals = evaluateAll(SEED_LIMITS.filter((c) => c.affiliateCode === null), FULL, '2026-07-31', temps);
    const by = (k: string) => evals.find((e) => e.metricKey === k)!;

    // LCR 168.9% against green 130 — comfortably within appetite.
    expect(by('lcrPercent').status).toBe('Green');
    expect(by('lcrPercent').breachesRegulatoryMinimum).toBe(false);

    // EVE at -13.8% is inside the -15% BCBS outlier threshold but past the
    // -12% amber, which is the point of holding appetite above the floor.
    expect(by('eveSensitivityPercent').status).toBe('Amber');
    expect(by('eveSensitivityPercent').breachesRegulatoryMinimum).toBe(false);
  });

  it('reports No data rather than Green for a metric the run never produced', () => {
    const evals = evaluateAll(
      SEED_LIMITS.filter((c) => c.affiliateCode === null),
      [result('Lcr', { lcrPercent: 150 })],
      '2026-07-31',
      temps,
    );
    // An unmeasured limit is not a satisfied one.
    expect(evals.find((e) => e.metricKey === 'nsfrPercent')!.status).toBe('No data');
    expect(evals.find((e) => e.metricKey === 'lcrPercent')!.status).toBe('Green');
  });

  it('flags a regulatory breach separately from an appetite breach', () => {
    const evals = evaluateAll(
      SEED_LIMITS.filter((c) => c.metricKey === 'lcrPercent'),
      [result('Lcr', { lcrPercent: 96 })],
      '2026-07-31',
      temps,
    );
    expect(evals[0]!.status).toBe('Red');
    expect(evals[0]!.breachesRegulatoryMinimum).toBe(true);
  });

  it('only evaluates active limits', () => {
    const off = SEED_LIMITS.filter((c) => c.metricKey === 'lcrPercent').map((c) => ({ ...c, isActive: false }));
    expect(evaluateAll(off, FULL, '2026-07-31', temps)).toEqual([]);
  });

  it('seeded thresholds are ordered consistently with their direction', () => {
    // Out-of-order thresholds silently invert an evaluation, so this holds
    // the seed itself rather than trusting it.
    for (const c of SEED_LIMITS) {
      if (c.direction === 'higher-is-better') {
        expect(c.greenThreshold, c.label).toBeGreaterThanOrEqual(c.amberThreshold);
        expect(c.amberThreshold, c.label).toBeGreaterThanOrEqual(c.redThreshold);
      } else {
        expect(c.greenThreshold, c.label).toBeLessThanOrEqual(c.amberThreshold);
        expect(c.amberThreshold, c.label).toBeLessThanOrEqual(c.redThreshold);
      }
    }
  });

  it('every seeded limit points at a metric the extractor can supply', () => {
    const known = new Set(METRIC_SPECS.map((s) => s.key));
    const orphans = SEED_LIMITS.filter((c) => !known.has(c.metricKey)).map((c) => c.label);
    expect(orphans).toEqual([]);
  });
});
