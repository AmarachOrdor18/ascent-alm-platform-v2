// The Group view is the consolidation of the affiliates' own runs - nobody runs "Group" separately. For a
// date, each Live affiliate's official run (its signed-off version, else its latest completed one) is taken,
// and the same engine is run over the union of the positions those runs pinned, with the Group-default
// assumptions and USD reporting. Nothing is stored: it is computed when the Group view is opened and follows
// any new sign-off. A Group run executed by hand for the date still takes precedence (see resultHooks).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import { draftRun, executeRun } from '@/engine/run';
import { pickApprovedRule } from './ruleApproval';
import { assembleInputs, useRuns } from './runHooks';
import { useAffiliates } from './hooks';
import { pickOfficial } from './runSeries';
import type { CalculationElement, ProcessRun, RuleKind, RuleMeta, RunResult } from '@/engine/types';

export const GROUP_CONSOLIDATED_PREFIX = 'GROUP-CONSOLIDATED-';

export interface GroupConsolidation {
  run: ProcessRun;
  results: RunResult[];
  /** The affiliate runs it combines, e.g. "Ecobank Nigeria v2". */
  sources: Array<{ affiliateName: string; run: ProcessRun; version: number }>;
}

export function isConsolidatedRun(run: ProcessRun | null | undefined): boolean {
  return !!run && run.id.startsWith(GROUP_CONSOLIDATED_PREFIX);
}

/** The official affiliate runs behind the Group view for `asOfDate` (Live affiliates only). */
export function useGroupSources(asOfDate: string | null) {
  const { data: affiliates = [] } = useAffiliates();
  const { data: runs = [] } = useRuns();
  return useMemo(() => {
    if (!asOfDate) return [];
    return affiliates
      .filter((a) => a.code !== 'GROUP' && a.status === 'Live')
      .flatMap((a) => {
        const own = runs.filter((r) => r.affiliateCode === a.code && r.asOfDate === asOfDate);
        const official = pickOfficial(own.filter((r) => r.status === 'Completed'));
        if (!official) return [];
        const ordered = [...own].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
        return [{ affiliateName: a.name, run: official.run, version: ordered.indexOf(official.run) + 1 }];
      });
  }, [affiliates, runs, asOfDate]);
}

export function useGroupConsolidation(enabled: boolean, asOfDate: string | null) {
  const sources = useGroupSources(enabled ? asOfDate : null);
  const key = sources.map((s) => `${s.run.id}:${s.run.signOff?.status ?? ''}`).join('|');
  const query = useQuery({
    queryKey: ['groupConsolidation', asOfDate, key],
    enabled: enabled && !!asOfDate && sources.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<GroupConsolidation> => {
      const [rules, approvals] = await Promise.all([repository.listRules({}), repository.listApprovalRequests()]);
      const group = (kind: RuleKind) => rules.filter((r) => r.kind === kind && r.affiliateCode === null);
      const latestActive = (kind: RuleKind) =>
        [...group(kind).filter((r) => r.isActive)].sort((a, b) =>
          (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
        )[0]?.id ?? null;
      const approved = (kind: RuleKind) => pickApprovedRule(group(kind) as RuleMeta[], 'GROUP', approvals)?.id ?? null;

      const elements = Array.from(new Set(sources.flatMap((s) => s.run.elements))) as CalculationElement[];
      const now = new Date().toISOString();
      const run: ProcessRun = {
        ...draftRun({
          id: `${GROUP_CONSOLIDATED_PREFIX}${asOfDate}`,
          name: `Group consolidated - ${sources.map((s) => `${s.affiliateName} v${s.version}`).join(', ')}`,
          asOfDate: asOfDate!,
          affiliateCode: 'GROUP',
          reportingCurrency: 'USD',
          timeBucketRuleId: latestActive('TimeBucket') ?? '',
          batchIds: Array.from(new Set(sources.flatMap((s) => s.run.positionBatchIds))),
          createdBy: 'Group consolidation',
          createdAt: now,
          elements,
        }),
        productCharacteristicRuleId: approved('ProductCharacteristic'),
        behaviourPatternRuleId: approved('BehaviourPattern'),
        prepaymentRuleId: approved('Prepayment'),
        ftpRuleId: latestActive('FtpRule'),
        adjustmentRuleId: latestActive('AdjustmentRule'),
        costAllocationRuleId: approved('CostAllocation'),
        creditLossRuleId: approved('CreditLoss'),
        capitalRuleId: approved('CapitalAllocation'),
      };
      const outcome = executeRun(run, await assembleInputs(run), now);
      return { run: { ...outcome.run, signOff: { status: 'Open' } }, results: outcome.results, sources };
    },
  });
  return { ...query, sources };
}
