/**
 * Executing a process run.
 *
 * The orchestrator in `engine/run.ts` is pure — it takes data and returns
 * results. This is the layer that assembles its inputs from the store, calls
 * it, and persists what comes back.
 *
 * Results are written once and never recomputed. A run from last month keeps
 * reporting the figures it actually produced, against the data version and
 * rule versions it consumed.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { executeRun, type RunInputs } from '@/engine/run';
import { buildFxTable } from '@/engine/fx';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_PATTERNS } from '@/engine/behavioural';
import type { ProcessRun, RunResult } from '@/engine/types';
import type { BehaviourPatternRule, TimeBucketRule } from '@/engine/ruleTypes';

export const runKeys = {
  all: ['runs'] as const,
  results: (runId: string) => ['runResults', runId] as const,
};

export function useRuns(affiliateCode?: string) {
  return useQuery({
    queryKey: [...runKeys.all, affiliateCode ?? 'ALL'],
    queryFn: () => repository.listRuns(affiliateCode === 'GROUP' ? undefined : affiliateCode),
  });
}

export function useRunResults(runId: string | null) {
  return useQuery({
    queryKey: runKeys.results(runId ?? 'none'),
    queryFn: () => (runId ? repository.listRunResults(runId) : Promise.resolve([] as RunResult[])),
    enabled: runId !== null,
  });
}

/**
 * Gather everything the engine needs.
 *
 * Rules referenced by the run are read at execution time, so a run records
 * the versions it actually used rather than whatever is current when someone
 * later opens the result.
 */
async function assembleInputs(run: ProcessRun): Promise<RunInputs> {
  const [positions, fxRates, orgUnitMembers, productMembers] = await Promise.all([
    repository.queryPositions({}),
    repository.listFxRates(),
    repository.listDimensionMembers('OrgUnit'),
    repository.listDimensionMembers('Product'),
  ]);

  const bucketRule = run.timeBucketRuleId ? await repository.getRule<TimeBucketRule>(run.timeBucketRuleId) : null;
  const behaviourRule = run.behaviourPatternRuleId
    ? await repository.getRule<BehaviourPatternRule>(run.behaviourPatternRuleId)
    : null;

  // Fall back to engine defaults where no rule is attached, and the result's
  // methodology string says which basis was used.
  const liquidityLadder =
    bucketRule?.ladders.find((l) => l.kind === 'LiquidityGap') ?? defaultLadder('LiquidityGap');
  const repricingLadder =
    bucketRule?.ladders.find((l) => l.kind === 'RepricingGap') ?? defaultLadder('RepricingGap');

  return {
    positions,
    fx: buildFxTable('USD', fxRates, run.asOfDate),
    liquidityLadder,
    repricingLadder,
    behaviourPatterns: behaviourRule?.patterns ?? DEFAULT_PATTERNS,
    orgUnitMembers,
    productMembers,
    tier1Capital: null,
  };
}

export function useExecuteRun() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (run: ProcessRun) => {
      const queued: ProcessRun = { ...run, status: 'Running' };
      await repository.upsertRun(queued);

      const inputs = await assembleInputs(run);
      const outcome = executeRun(queued, inputs, new Date().toISOString());

      await repository.upsertRun(outcome.run);
      if (outcome.results.length > 0) await repository.insertRunResults(outcome.results);

      if (user) {
        await repository.recordAuditEvent({
          id: `AE-RUN-${Date.now()}`,
          module: 'Execution',
          action: 'Execute',
          entity: 'Process Run',
          entityId: run.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          outcome: outcome.run.status === 'Completed' ? 'Success' : 'Failure',
          detail:
            outcome.run.status === 'Completed'
              ? `${outcome.results.length} element(s) computed for ${run.affiliateCode} as at ${run.asOfDate}`
              : (outcome.run.errorLog[0]?.message ?? 'Run failed'),
          recordedAt: new Date().toISOString(),
        });
      }

      return outcome;
    },
    onSuccess: (outcome) => {
      client.invalidateQueries({ queryKey: runKeys.all });
      client.invalidateQueries({ queryKey: runKeys.results(outcome.run.id) });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export function useSaveRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (run: ProcessRun) => repository.upsertRun(run),
    onSuccess: () => client.invalidateQueries({ queryKey: runKeys.all }),
  });
}

/** Typed accessor for a result payload, since payloads are element-specific. */
export function payloadOf<T>(results: RunResult[], element: string): T | null {
  const result = results.find((r) => r.element === element);
  return result ? (result.payload as T) : null;
}

export function methodologyOf(results: RunResult[], element: string): string | null {
  return results.find((r) => r.element === element)?.methodology ?? null;
}
