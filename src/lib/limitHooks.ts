import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { evaluateLimit, type BreachNote, type LimitConfig, type LimitEvaluation, type TemporaryLimit } from '@/engine/limits';
import { evaluateKri, DEFAULT_KRIS, type KriEvaluation, type KriObservation } from '@/engine/kri';
import { extractMetrics } from './metrics';
import type { ProcessRun, RunResult, User } from '@/engine/types';

let auditCounter = 0;

/** Limit thresholds, temporary overrides and breach notes previously had no audit trail at all - a
 * limit could be loosened or a breach explained away with no record on the central Audit Log. */
function recordAudit(user: User | null, module: string, action: string, entity: string, entityId: string, detail: string) {
  if (!user) return Promise.resolve();
  auditCounter += 1;
  return repository.recordAuditEvent({
    id: `AE-${Date.now()}-${auditCounter}`,
    module,
    action,
    entity,
    entityId,
    userId: user.id,
    userName: user.name,
    role: user.role,
    outcome: 'Success',
    detail,
    recordedAt: new Date().toISOString(),
  });
}

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
    mutationFn: async (config: LimitConfig) => {
      const saved = { ...config, updatedBy: user?.name ?? 'unknown', updatedAt: new Date().toISOString() };
      await repository.upsertLimitConfig(saved);
      await recordAudit(user, 'Limits', 'Save', 'Limit Config', saved.id, `${saved.label} (${saved.metricKey})`);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: limitKeys.configs });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export function useDeleteLimitConfig() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (config: LimitConfig) => {
      await repository.deleteLimitConfig(config.id);
      await recordAudit(user, 'Limits', 'Delete', 'Limit Config', config.id, `${config.label} (${config.metricKey})`);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: limitKeys.configs });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export function useSaveTemporaryLimit() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (temp: TemporaryLimit) => {
      await repository.upsertTemporaryLimit(temp);
      await recordAudit(
        user,
        'Limits',
        'Save',
        'Temporary Limit',
        temp.id,
        `${temp.limitId} - amber ${temp.amberThreshold}/red ${temp.redThreshold} until ${temp.expiresOn} (${temp.reason})`,
      );
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: limitKeys.temporary });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export function useSaveBreachNote() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (note: BreachNote) => {
      await repository.upsertBreachNote(note);
      await recordAudit(user, 'Limits', 'Save', 'Breach Note', note.id, `${note.breachId} - ${note.cause}`);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: limitKeys.notes });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export interface EvaluatedLimit extends LimitEvaluation {
  config: LimitConfig;
}

/** Evaluate every active limit against one run; metrics the run didn't compute pass through as `null`, which reports as `No data` rather than Green. */
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

/** A KRI's observation series, built from every completed run for the scope; when a date has multiple runs, the most recent wins. */
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
          // Only observed values enter the series; a gap stays a gap rather than becoming a zero.
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
