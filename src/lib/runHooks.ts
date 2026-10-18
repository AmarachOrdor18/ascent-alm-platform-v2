import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import { useAuth } from '@/context/AuthContext';
import { executeRun, type RunInputs, type RunOutcome } from '@/engine/run';
import { buildFxTable } from '@/engine/fx';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_BETAS } from '@/engine/behavioural';
import { unapprovedRules } from '@/lib/ruleApproval';
import type { ProcessRun, RunResult, User } from '@/engine/types';
import { newApprovalRequest } from './governanceHooks';
import {
  buildSeries,
  nextVersion,
  seriesKeyFor,
  seriesKeyOf,
  seriesLockReason,
  signOffStatusOf,
  versionOf,
} from './runSeries';
import { engineCurvesAsOf } from '@/engine/ftp';
import type {
  AdjustmentRuleDef,
  BehaviourPatternRule,
  CapitalAllocationRuleDef,
  CostAllocationRuleDef,
  CreditLossRuleDef,
  FtpRule,
  ForecastScenarioRule,
  PrepaymentRule,
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
 * affiliate's runs (the Runs page browses across affiliates when scoped to Group), but a consumer
 * that means "the run(s) belonging to the scope I'm currently on" - the selected run behind
 * Dashboard/every results screen, KRI trend series, limit-breach transition detection, the batch
 * scheduler's own history - needs the narrower answer: only runs whose own `affiliateCode` is this
 * scope. Without this, the newest run *anywhere* (e.g. a Nigeria run created after the last real
 * Group-consolidated run) got picked up as "the" run while at Group scope, showing NGN figures
 * under a "Ecobank Group" header.
 */
export function useScopedRuns(affiliateCode: string) {
  const query = useRuns(affiliateCode);
  const data = useMemo(() => query.data?.filter((r) => r.affiliateCode === affiliateCode), [query.data, affiliateCode]);
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
  const prepaymentRule = run.prepaymentRuleId ? await repository.getRule<PrepaymentRule>(run.prepaymentRuleId) : null;
  const costRule = run.costAllocationRuleId
    ? await repository.getRule<CostAllocationRuleDef>(run.costAllocationRuleId)
    : null;
  const creditLossRule = run.creditLossRuleId
    ? await repository.getRule<CreditLossRuleDef>(run.creditLossRuleId)
    : null;
  const capitalRule = run.capitalRuleId ? await repository.getRule<CapitalAllocationRuleDef>(run.capitalRuleId) : null;

  // The engine's NII/EVE sensitivity takes one shock magnitude, not a full
  // per-bucket curve, so the scenario's bucket shocks are averaged here.
  const scenarioShockBps = scenarioRule
    ? Object.values(scenarioRule.shockByBucket).reduce((s, v) => s + v, 0) /
      (Object.values(scenarioRule.shockByBucket).length || 1)
    : undefined;

  const liquidityLadder = bucketRule?.ladders.find((l) => l.kind === 'LiquidityGap') ?? defaultLadder('LiquidityGap');
  const repricingLadder = bucketRule?.ladders.find((l) => l.kind === 'RepricingGap') ?? defaultLadder('RepricingGap');

  // A currency/index can carry several dated curves on file, same as an FX rate - only the most recent
  // one struck on or before the run date applies; a curve published later did not exist when these
  // balances were struck, and an older one has since been superseded. ftp.ts's own curve lookup
  // (curves.find) takes the first match per currency/indexCode, so this dedupe is what makes that
  // unambiguous rather than dependent on array order.
  const yieldCurves = engineCurvesAsOf(storedCurves, run.asOfDate);

  return {
    positions,
    fx: buildFxTable('USD', fxRates, run.asOfDate),
    liquidityLadder,
    repricingLadder,
    // No behaviour pattern rule: contractual timing (no run-off overlay) - the run names this as a degradation.
    behaviourPatterns: behaviourRule?.patterns ?? [],
    // Betas and stress severity come from the same rule as the patterns, so one behavioural basis drives
    // the liquidity gap, NII and the severe run alike - with no rule, the same engine defaults throughout.
    depositBetas: behaviourRule?.betas ?? DEFAULT_BETAS,
    stressSeverityMultiplier: behaviourRule?.stressSeverityMultiplier,
    prepaymentRules: (prepaymentRule?.assumptions ?? [])
      .filter((a) => a.method !== 'None')
      .map((a) => ({ commonCoaCode: a.commonCoaCode, cpr: a.cpr })),
    // Fitted term-deposit early withdrawal / roll-over from the same behaviour rule - shapes the cashflow book.
    termDepositBehaviour: behaviourRule?.termDepositBehaviour ?? [],
    orgUnitMembers,
    productMembers,
    tier1Capital: null,
    yieldCurves,
    adjustmentRules: adjustmentRule?.adjustments ?? [],
    ftpAssignments: ftpRule?.assignments ?? [],
    ftpMethod: ftpRule?.defaultMethod,
    ftpPools: ftpRule?.pools ?? [],
    shockBps: scenarioShockBps,
    // The scenario's shape, so cash-flow EVE shocks each tenor by its own bucket's amount (NII keeps the average).
    shockByBucket: scenarioRule?.shockByBucket,
    productAssumptions: productRule?.assumptions ?? [],
    // Multi-layer profitability: null when the run selected no such rule - the layers are then left blank and named.
    costAllocation: costRule
      ? { currency: costRule.currency, pools: costRule.pools, headcountByOrgUnit: costRule.headcountByOrgUnit ?? {} }
      : null,
    creditLoss: creditLossRule
      ? {
          method: creditLossRule.method,
          pdByProduct: creditLossRule.pdByProduct,
          lgdByProduct: creditLossRule.lgdByProduct,
          defaultPdPct: creditLossRule.defaultPdPct,
          defaultLgdPct: creditLossRule.defaultLgdPct,
          useProvisionAmount: creditLossRule.useProvisionAmount,
        }
      : null,
    capital: capitalRule
      ? {
          riskWeightByProductClass: capitalRule.riskWeightByProductClass,
          defaultRiskWeightPct: capitalRule.defaultRiskWeightPct,
          capitalRatioPct: capitalRule.capitalRatioPct,
          costOfCapitalPct: capitalRule.costOfCapitalPct,
          taxRatePct: capitalRule.taxRatePct,
        }
      : null,
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
    run.prepaymentRuleId,
    run.newBusinessRuleId,
    run.transactionStrategyId,
    run.ftpRuleId,
    run.adjustmentRuleId,
    run.costAllocationRuleId,
    run.creditLossRuleId,
    run.capitalRuleId,
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
    mutationFn: async (requested: ProcessRun) => {
      // Every execution is a new version of its series (scope + as-of date). Whatever lifecycle fields a
      // template carried (a re-run, a schedule's clone) are reset - the new version starts Open.
      const scopeRuns = await repository.listRuns(requested.affiliateCode);
      const seriesKey = seriesKeyFor(requested.affiliateCode, requested.asOfDate);
      const seriesRuns = scopeRuns.filter((r) => seriesKeyOf(r) === seriesKey);
      const series = buildSeries(seriesRuns)[0] ?? null;
      const locked = seriesLockReason(series, scopeRuns);
      if (locked) throw new Error(locked);
      const { signOff: _signOff, supersededByRunId: _superseded, ...rest } = requested;
      const run: ProcessRun = {
        ...rest,
        seriesKey,
        version: nextVersion(seriesRuns, scopeRuns),
        createdById: user?.id ?? requested.createdById,
        signOff: { status: 'Open' },
      };

      // The screen already hides unapproved rules; this is the same gate where the run is actually
      // executed, so nothing that calls the hook (a re-run, the batch scheduler) can consume a rule no
      // checker has signed off. Recorded as a failed run, same as a missing FX rate, rather than thrown.
      const gated = await Promise.all(
        [
          run.productCharacteristicRuleId,
          run.behaviourPatternRuleId,
          run.prepaymentRuleId,
          run.costAllocationRuleId,
          run.creditLossRuleId,
          run.capitalRuleId,
        ].map((id) => (id ? repository.getRule(id) : Promise.resolve(null))),
      );
      const blocked = unapprovedRules(gated, await repository.listApprovalRequests());

      const queued: ProcessRun = { ...run, status: 'Running' };
      await repository.upsertRun(queued);

      let outcome: RunOutcome;
      if (blocked.length > 0) {
        outcome = {
          run: {
            ...run,
            status: 'Failed',
            completedAt: new Date().toISOString(),
            errorLog: [
              {
                positionId: null,
                code: 'RULE_NOT_APPROVED',
                message: `Not yet approved, so not usable in a run: ${blocked.join(', ')}. See Approvals.`,
              },
            ],
          },
          results: [],
          errors: [],
        };
      } else {
        const [inputs, ruleVersionsUsed] = await Promise.all([assembleInputs(run), collectRuleVersionsUsed(run)]);
        outcome = executeRun({ ...queued, ruleVersionsUsed }, inputs, new Date().toISOString());
      }

      await repository.upsertRun(outcome.run);
      if (outcome.results.length > 0) await repository.insertRunResults(outcome.results);

      // The version this one replaces (the series' previous latest) records its successor.
      const previous = series?.latest;
      if (outcome.run.status === 'Completed' && previous && !previous.supersededByRunId) {
        await repository.upsertRun({ ...previous, supersededByRunId: outcome.run.id });
      }

      if (user) {
        await repository.recordAuditEvent({
          id: `AE-RUN-${Date.now()}`,
          module: 'Execution',
          action: 'Execute',
          entity: 'Run',
          entityId: run.id,
          userId: user.id,
          userName: user.name,
          role: user.role,
          outcome: outcome.run.status === 'Completed' ? 'Success' : 'Failure',
          detail:
            outcome.run.status === 'Completed'
              ? `v${run.version} - ${outcome.results.length} element(s) computed for ${run.affiliateCode} as at ${run.asOfDate}`
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

function recordRunEvent(
  user: Pick<User, 'id' | 'name' | 'role'> | null,
  action: string,
  run: ProcessRun,
  detail: string,
) {
  if (!user) return Promise.resolve();
  return repository.recordAuditEvent({
    id: `AE-RUN-${action}-${Date.now()}`,
    module: 'Execution',
    action,
    entity: 'Run',
    entityId: run.id,
    userId: user.id,
    userName: user.name,
    role: user.role,
    outcome: 'Success',
    detail,
    recordedAt: new Date().toISOString(),
  });
}

/**
 * Raise a Runs/SignOff approval request for one version and mark it PendingSignOff. The approval is
 * what signs it off - a database trigger on Supabase (the repository itself locally) moves the run to
 * SignedOff when a different user approves, or back to Open when the request is rejected or withdrawn.
 */
export function useRequestRunSignOff() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      run,
      allRuns,
      affiliateName,
      note,
    }: {
      run: ProcessRun;
      allRuns: ProcessRun[];
      affiliateName?: string;
      note?: string;
    }) => {
      if (!user) throw new Error('Not signed in.');
      if (run.status !== 'Completed') throw new Error('Only a completed run can be signed off.');
      if (signOffStatusOf(run) !== 'Open') throw new Error('This version is not open for sign-off.');
      const v = versionOf(run, allRuns);
      const request = newApprovalRequest(
        {
          module: 'Runs',
          entityType: 'Run',
          entityId: run.id,
          entityVersion: v,
          entityLabel: `${affiliateName ?? run.affiliateCode} · ${run.asOfDate} · v${v}`,
          action: 'SignOff',
          summary: note?.trim()
            ? note.trim()
            : `Sign off v${v} of the ${run.asOfDate} run as the official figures for ${affiliateName ?? run.affiliateCode}.`,
          affiliateCode: run.affiliateCode === 'GROUP' ? null : run.affiliateCode,
        },
        user,
      );
      await repository.upsertApprovalRequest(request);
      const now = new Date().toISOString();
      await repository.upsertRun({
        ...run,
        seriesKey: seriesKeyOf(run),
        version: v,
        signOff: {
          ...(run.signOff ?? {}),
          status: 'PendingSignOff',
          approvalId: request.id,
          requestedAt: now,
          requestedBy: user.name,
          requestedById: user.id,
        },
      });
      await recordRunEvent(
        user,
        'RequestSignOff',
        run,
        `Sign-off requested for v${v} (${run.affiliateCode}, ${run.asOfDate})`,
      );
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: runKeys.all });
      client.invalidateQueries({ queryKey: ['approvals'] });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

/**
 * Reopen a signed-off version: it becomes Reopened - still frozen and read-only, never the official
 * figures again - and the series' next execution creates a new version. Needs a reason; no approval.
 */
export function useReopenRun() {
  const client = useQueryClient();
  const { user, hasPermission } = useAuth();
  return useMutation({
    mutationFn: async ({ run, reason, allRuns }: { run: ProcessRun; reason: string; allRuns: ProcessRun[] }) => {
      if (!user) throw new Error('Not signed in.');
      if (!hasPermission('run.execute')) throw new Error('Reopening a run needs the run.execute permission.');
      if (signOffStatusOf(run) !== 'SignedOff') throw new Error('Only a signed-off version can be reopened.');
      if (!reason.trim()) throw new Error('Give a reason for reopening.');
      const v = versionOf(run, allRuns);
      await repository.upsertRun({
        ...run,
        signOff: {
          ...(run.signOff ?? { status: 'SignedOff' }),
          status: 'Reopened',
          reopenedAt: new Date().toISOString(),
          reopenedBy: user.name,
          reopenedById: user.id,
          reopenReason: reason.trim(),
        },
      });
      await recordRunEvent(
        user,
        'Reopen',
        run,
        `Reopened v${v} (${run.affiliateCode}, ${run.asOfDate}): ${reason.trim()}`,
      );
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: runKeys.all });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

/** A fresh copy of `run` ready to execute as its series' next version (Re-run). */
export function rerunOf(run: ProcessRun, createdBy: string): ProcessRun {
  const { signOff: _s, supersededByRunId: _x, version: _v, ...rest } = run;
  return {
    ...rest,
    id: `RUN-${Date.now().toString(36).toUpperCase()}`,
    status: 'Draft',
    createdBy,
    createdAt: new Date().toISOString(),
    completedAt: null,
    errorLog: [],
  };
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

/** Headline figures pulled from a result set - shared by the Runs page's version compare and the snapshot workbench's Original vs Snapshot compare. */
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
    {
      label: 'EVE sensitivity',
      value: eve?.eveSensitivityPercentOfEquity ?? null,
      unit: 'percent',
      higherIsBetter: true,
    },
    { label: 'Survival horizon', value: survival?.survivalHorizonDays ?? null, unit: 'days', higherIsBetter: true },
    { label: 'Largest depositor', value: conc?.largestSharePercent ?? null, unit: 'percent', higherIsBetter: false },
  ];
}
