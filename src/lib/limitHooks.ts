/**
 * Limits and KRIs, evaluated against real run output.
 *
 * The engine modules for both have existed since phase 1 and were never
 * called: the monitoring screens rendered hardcoded arrays, which meant the
 * Limits screen could assert an LCR in breach while the Liquidity Risk
 * screen, reading the same run, reported it comfortably above the floor.
 *
 * Two different questions are answered here, and they need different data:
 *
 *   * a **limit** is a point-in-time test against the selected run
 *   * a **KRI** is a trend, so it needs the same metric from several runs at
 *     successive as-of dates — which is exactly what run history holds
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { evaluateLimit, type BreachNote, type LimitConfig, type LimitEvaluation, type TemporaryLimit } from '@/engine/limits';
import { evaluateKri, DEFAULT_KRIS, type KriEvaluation, type KriObservation } from '@/engine/kri';
import { extractMetrics } from './metrics';
import type { ProcessRun, RunResult } from '@/engine/types';

export const limitKeys = {
  configs: ['limitConfigs'] as const,
  temporary: ['temporaryLimits'] as const,
  notes: ['breachNotes'] as const,
  kri: ['kriSeries'] as const,
};

export function useLimitConfigs(affiliateCode?: string) {
  return useQuery({
    queryKey: [...limitKeys.configs, affiliateCode ?? 'ALL'],
    queryFn: () => repository.listLimitConfigs(affiliateCode === 'GROUP' ? undefined : affiliateCode),
  });
}

export function useTemporaryLimits() {
  return useQuery({ queryKey: limitKeys.temporary, queryFn: () => repository.listTemporaryLimits() });
}

export function useBreachNotes() {
  return useQuery({ queryKey: limitKeys.notes, queryFn: () => repository.listBreachNotes() });
}

export function useSaveLimitConfig() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (config: LimitConfig) =>
      repository.upsertLimitConfig({
        ...config,
        updatedBy: user?.name ?? 'unknown',
        updatedAt: new Date().toISOString(),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: limitKeys.configs }),
  });
}

export function useDeleteLimitConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repository.deleteLimitConfig(id),
    onSuccess: () => client.invalidateQueries({ queryKey: limitKeys.configs }),
  });
}

export function useSaveTemporaryLimit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (temp: TemporaryLimit) => repository.upsertTemporaryLimit(temp),
    onSuccess: () => client.invalidateQueries({ queryKey: limitKeys.temporary }),
  });
}

export function useSaveBreachNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (note: BreachNote) => repository.upsertBreachNote(note),
    onSuccess: () => client.invalidateQueries({ queryKey: limitKeys.notes }),
  });
}

export interface EvaluatedLimit extends LimitEvaluation {
  config: LimitConfig;
}

/**
 * Evaluate every active limit against one run.
 *
 * Metrics the run did not compute are passed through as `null`, which the
 * engine reports as `No data` rather than Green. An unmeasured limit is not
 * a satisfied one, and showing it green is how a gap becomes invisible.
 */
export function evaluateAll(
  configs: LimitConfig[],
  results: RunResult[],
  asOfDate: string,
  temporaryLimits: TemporaryLimit[],
): EvaluatedLimit[] {
  const metrics = extractMetrics(results);
  return configs
    .filter((c) => c.isActive)
    .map((config) => ({
      ...evaluateLimit(config, metrics.get(config.metricKey) ?? null, asOfDate, temporaryLimits),
      config,
    }));
}

/**
 * A KRI's observation series, built from every completed run for the scope.
 *
 * One run per as-of date: where a date has been run more than once, the most
 * recent run wins, because that is the figure that stands. Trending over
 * both would show a step change that never happened.
 */
export function useKriSeries(runs: ProcessRun[], metricKeys: string[]) {
  const completed = runs.filter((r) => r.status === 'Completed');
  const ids = completed.map((r) => r.id).join(',');

  return useQuery({
    queryKey: [...limitKeys.kri, ids, metricKeys.join(',')],
    enabled: completed.length > 0,
    queryFn: async () => {
      const byDate = new Map<string, ProcessRun>();
      for (const run of completed) {
        const held = byDate.get(run.asOfDate);
        if (!held || run.createdAt > held.createdAt) byDate.set(run.asOfDate, run);
      }

      const dated = Array.from(byDate.values()).sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));
      const series = new Map<string, KriObservation[]>(metricKeys.map((k) => [k, []]));

      for (const run of dated) {
        const results = await repository.listRunResults(run.id);
        const metrics = extractMetrics(results);
        for (const key of metricKeys) {
          const value = metrics.get(key);
          // Only observed values enter the series. A gap is a gap; filling it
          // with a zero would read as a collapse.
          if (typeof value === 'number') series.get(key)!.push({ asOfDate: run.asOfDate, value });
        }
      }
      return series;
    },
  });
}

/** Evaluate the default KRI set against those series. */
export function evaluateKris(series: Map<string, KriObservation[]> | undefined): KriEvaluation[] {
  if (!series) return [];
  return DEFAULT_KRIS.filter((d) => d.isActive).map((d) => evaluateKri(d, series.get(d.metricKey) ?? []));
}
