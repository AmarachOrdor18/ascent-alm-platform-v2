import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import { executeRun, type RunInputs } from '@/engine/run';
import { buildFxTable } from '@/engine/fx';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_PATTERNS } from '@/engine/behavioural';
import type { ProcessRun, RunResult } from '@/engine/types';
import type { YieldCurve } from '@/engine/ftp';
import type {
  AdjustmentRuleDef,
  BehaviourPatternRule,
  FtpRule,
  ForecastScenarioRule,
  ProductCharacteristicRule,
  TimeBucketRule,
} from '@/engine/ruleTypes';

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

/**
 * Runs actually computed for this exact scope. `useRuns('GROUP')` deliberately returns every
 * affiliate's runs (Run History browses across affiliates when scoped to Group), but a consumer
 * that means "the run(s) belonging to the scope I'm currently on" - the selected run behind
 * Dashboard/every results screen, KRI trend series, limit-breach transition detection, the batch
 * scheduler's own history - needs the narrower answer: only runs whose own `affiliateCode` is this
 * scope. Without this, the newest run *anywhere* (e.g. a Nigeria run created after the last real
 * Group-consolidated run) got picked up as "the" run while at Group scope, showing NGN figures
 * under a "Ecobank Group" header.
 */
export function useScopedRuns(affiliateCode: string) {
  const query = useRuns(affiliateCode);
  const data = useMemo(
    () => query.data?.filter((r) => r.affiliateCode === affiliateCode),
    [query.data, affiliateCode],
  );
  return { ...query, data };
}

export function useRunResults(runId: string | null) {
  return useQuery({
    queryKey: runKeys.results(runId ?? 'none'),
    queryFn: () => (runId ? repository.listRunResults(runId) : Promise.resolve([] as RunResult[])),
    enabled: runId !== null,
  });
}

// Rules are read at execution time so the run records the versions it
// actually used, not whatever is current when the result is later opened.
// Exported so callers that need to run the engine outside the ordinary
// Process Run screen - the snapshot workbench's Original vs Snapshot
// comparison - assemble inputs identically rather than duplicating this.
export async function assembleInputs(run: ProcessRun): Promise<RunInputs> {
  const [positions, fxRates, orgUnitMembers, productMembers, storedCurves] = await Promise.all([
    repository.queryPositions({}),
    repository.listFxRates(),
    repository.listDimensionMembers('OrgUnit'),
    repository.listDimensionMembers('Product'),
    repository.listYieldCurves(),
  ]);

  const bucketRule = run.timeBucketRuleId ? await repository.getRule<TimeBucketRule>(run.timeBucketRuleId) : null;
  const behaviourRule = run.behaviourPatternRuleId
    ? await repository.getRule<BehaviourPatternRule>(run.behaviourPatternRuleId)
    : null;
  const ftpRule = run.ftpRuleId ? await repository.getRule<FtpRule>(run.ftpRuleId) : null;
  const adjustmentRule = run.adjustmentRuleId
    ? await repository.getRule<AdjustmentRuleDef>(run.adjustmentRuleId)
    : null;
  const scenarioRule = run.forecastScenarioIds[0]
    ? await repository.getRule<ForecastScenarioRule>(run.forecastScenarioIds[0])
    : null;
  const productRule = run.productCharacteristicRuleId
    ? await repository.getRule<ProductCharacteristicRule>(run.productCharacteristicRuleId)
    : null;

  // The engine's NII/EVE sensitivity takes one shock magnitude, not a full
  // per-bucket curve, so the scenario's bucket shocks are averaged here.
  const scenarioShockBps = scenarioRule
    ? Object.values(scenarioRule.shockByBucket).reduce((s, v) => s + v, 0) /
      (Object.values(scenarioRule.shockByBucket).length || 1)
    : undefined;

  const liquidityLadder =
    bucketRule?.ladders.find((l) => l.kind === 'LiquidityGap') ?? defaultLadder('LiquidityGap');
  const repricingLadder =
    bucketRule?.ladders.find((l) => l.kind === 'RepricingGap') ?? defaultLadder('RepricingGap');

  // A currency/index can carry several dated curves on file, same as an FX rate - only the most recent
  // one struck on or before the run date applies; a curve published later did not exist when these
  // balances were struck, and an older one has since been superseded. ftp.ts's own curve lookup
  // (curves.find) takes the first match per currency/indexCode, so this dedupe is what makes that
  // unambiguous rather than dependent on array order.
  const latestCurveByKey = new Map<string, (typeof storedCurves)[number]>();
  for (const c of storedCurves) {
    if (!c.isActive || c.asOfDate > run.asOfDate) continue;
    const key = `${c.currency}|${c.code}`;
    const current = latestCurveByKey.get(key);
    if (!current || c.asOfDate > current.asOfDate) latestCurveByKey.set(key, c);
  }
  const yieldCurves: YieldCurve[] = Array.from(latestCurveByKey.values()).map((c) => ({
    currency: c.currency,
    indexCode: c.code,
    points: c.terms.map((t) => ({ tenorDays: t.tenorDays, ratePercent: t.ratePercent })),
    asOfDate: c.asOfDate,
  }));

  return {
    positions,
    fx: buildFxTable('USD', fxRates, run.asOfDate),
    liquidityLadder,
    repricingLadder,
    behaviourPatterns: behaviourRule?.patterns ?? DEFAULT_PATTERNS,
    orgUnitMembers,
    productMembers,
    tier1Capital: null,
    yieldCurves,
    adjustmentRules: adjustmentRule?.adjustments ?? [],
    ftpAssignments: ftpRule?.assignments ?? [],
    shockBps: scenarioShockBps,
    productAssumptions: productRule?.assumptions ?? [],
  };
}

// The rule id alone only resolves to whatever that row holds *now* - if it's edited after this run,
// the id can no longer tell you what it held when this run actually executed. Recording the version
// each referenced rule had at this moment is what lets a later edit be recovered from, via
// getRuleVersion against the history upsertRule archives on every edit.
async function collectRuleVersionsUsed(run: ProcessRun): Promise<Record<string, number>> {
  const ids = [
    run.timeBucketRuleId,
    run.productCharacteristicRuleId,
    run.behaviourPatternRuleId,
    run.newBusinessRuleId,
    run.transactionStrategyId,
    run.ftpRuleId,
    run.adjustmentRuleId,
    ...run.forecastScenarioIds,
  ].filter((id): id is string => !!id);

  const versions: Record<string, number> = {};
  await Promise.all(
    ids.map(async (id) => {
      const rule = await repository.getRule(id);
      if (rule) versions[id] = rule.version;
    }),
  );
  return versions;
}

export function useExecuteRun() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (run: ProcessRun) => {
      const queued: ProcessRun = { ...run, status: 'Running' };
      await repository.upsertRun(queued);

      const [inputs, ruleVersionsUsed] = await Promise.all([assembleInputs(run), collectRuleVersionsUsed(run)]);
      const outcome = executeRun({ ...queued, ruleVersionsUsed }, inputs, new Date().toISOString());

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

/** Headline figures pulled from a result set - shared by Run History's A/B compare and the snapshot workbench's Original vs Snapshot compare. */
export interface RunHeadline {
  label: string;
  value: number | null;
  unit: 'percent' | 'amount' | 'days';
  higherIsBetter: boolean;
}

export function runHeadlines(results: RunResult[]): RunHeadline[] {
  const lcr = payloadOf<{ lcrPercent: number | null }>(results, 'Lcr');
  const nsfr = payloadOf<{ nsfrPercent: number | null }>(results, 'Nsfr');
  const ldr = payloadOf<{ ratioPercent: number | null }>(results, 'LoanToDeposit');
  const nii = payloadOf<{ niiSensitivityPercent: number | null }>(results, 'NiiSensitivity');
  const eve = payloadOf<{ eveSensitivityPercentOfEquity: number | null }>(results, 'EveSensitivity');
  const survival = payloadOf<{ survivalHorizonDays: number }>(results, 'SurvivalHorizon');
  const conc = payloadOf<{ largestSharePercent: number | null }>(results, 'Concentration');

  return [
    { label: 'LCR', value: lcr?.lcrPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'NSFR', value: nsfr?.nsfrPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'Loan-to-deposit', value: ldr?.ratioPercent ?? null, unit: 'percent', higherIsBetter: false },
    { label: 'NII sensitivity', value: nii?.niiSensitivityPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'EVE sensitivity', value: eve?.eveSensitivityPercentOfEquity ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'Survival horizon', value: survival?.survivalHorizonDays ?? null, unit: 'days', higherIsBetter: true },
    { label: 'Largest depositor', value: conc?.largestSharePercent ?? null, unit: 'percent', higherIsBetter: false },
  ];
}
