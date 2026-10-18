import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import { useAuth } from '@/context/AuthContext';
import { approvals, isRequester } from '@/lib/governanceHooks';
import {
  isApprovalGated,
  isRuleApproved,
  pickApprovedRule,
  ruleApprovalRequest,
  supersededRequests,
} from '@/lib/ruleApproval';
import type { ProcessRun, RuleKind, RuleMeta } from '@/engine/types';

export function ruleKey(kind: RuleKind) {
  return ['rules', kind] as const;
}

export function useRules<T extends RuleMeta>(kind: RuleKind) {
  return useQuery({
    queryKey: ruleKey(kind),
    queryFn: async () => (await repository.listRules({ kind })) as T[],
  });
}

let auditCounter = 0;

/** Save and delete, with an audit event for each. */
/**
 * A rule as a run actually used it - the version recorded in `run.ruleVersionsUsed`, recovered from
 * rule history, rather than whatever the row holds now. Falls back to the current row for runs that
 * pre-date version capture.
 */
export function useRuleAsUsedBy<T extends RuleMeta>(ruleId: string | null | undefined, run: ProcessRun | null) {
  const version = ruleId ? run?.ruleVersionsUsed?.[ruleId] : undefined;
  return useQuery({
    queryKey: ['ruleAsUsed', ruleId ?? 'none', version ?? 'current'],
    queryFn: async () => {
      if (!ruleId) return null;
      const used = version !== undefined ? await repository.getRuleVersion<T>(ruleId, version) : null;
      return used ?? (await repository.getRule<T>(ruleId));
    },
    enabled: !!ruleId,
  });
}

/** Ids of every rule a run may consume as approved - seeded defaults plus approval-gated rules signed off at their current version. */
export function useApprovedRuleIds<T extends RuleMeta>(rules: T[]): Set<string> {
  const { data: requests = [] } = approvals.useList();
  return useMemo(
    () => new Set(rules.filter((r) => !isApprovalGated(r.kind) || isRuleApproved(r, requests)).map((r) => r.id)),
    [rules, requests],
  );
}

/** The approved, active rule of a kind for an affiliate (affiliate override, else Group default), or null. */
export function useApprovedRuleFor<T extends RuleMeta>(kind: RuleKind, affiliateCode: string | null | undefined) {
  const { data: rules = [], isLoading: loadingRules } = useRules<T>(kind);
  const { data: requests = [], isLoading: loadingApprovals } = approvals.useList();
  const rule = useMemo(() => pickApprovedRule(rules, affiliateCode, requests), [rules, affiliateCode, requests]);
  return { rule, isLoading: loadingRules || loadingApprovals };
}

export function useRuleMutations<T extends RuleMeta>(kind: RuleKind) {
  const client = useQueryClient();
  const { user, hasPermission } = useAuth();

  const record = async (action: string, rule: { id: string; name: string; version: number }) => {
    if (!user) return;
    auditCounter += 1;
    await repository.recordAuditEvent({
      id: `AE-${Date.now()}-${auditCounter}`,
      module: 'Business Rules',
      action,
      entity: kind,
      entityId: rule.id,
      userId: user.id,
      userName: user.name,
      role: user.role,
      outcome: 'Success',
      detail: `${rule.name} (version ${rule.version})`,
      recordedAt: new Date().toISOString(),
    });
  };

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ruleKey(kind) });
    client.invalidateQueries({ queryKey: ['auditEvents'] });
    client.invalidateQueries({ queryKey: ['approvals'] });
  };

  const save = useMutation({
    mutationFn: async (rule: T) => {
      await repository.upsertRule(rule);
      await record('Save', rule);
      // An approval-gated rule is saved but not yet usable: the save itself raises the request, so
      // sign-off can't be skipped by forgetting a second step. The maker is whoever saved it, and
      // approvalBlockedReason stops them being their own checker.
      if (isApprovalGated(kind) && user) {
        const now = new Date().toISOString();
        for (const stale of supersededRequests(rule, await repository.listApprovalRequests(), now)) {
          // Only the requester or an approver may withdraw a request (the database enforces this too);
          // anyone else's stale request is left for an approver to clear rather than failing the save.
          if (!isRequester(stale, user) && !hasPermission('approvals.approve')) continue;
          await repository.upsertApprovalRequest(stale);
        }
        await repository.upsertApprovalRequest(ruleApprovalRequest(rule, user.name, now, user.id));
        await record('Submit for approval', rule);
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const rule = await repository.getRule(id);
      // `deleteRule` re-checks dependencies and throws if any remain, so a
      // delete cannot slip past the check by calling the repository directly.
      await repository.deleteRule(id);
      if (rule) await record('Delete', rule);
    },
    onSuccess: invalidate,
  });

  return {
    save: (rule: T) => save.mutateAsync(rule),
    remove: (id: string) => remove.mutateAsync(id),
    checkDependencies: (id: string) => repository.checkDependencies(id),
    isSaving: save.isPending || remove.isPending,
  };
}

/** Common envelope for a newly-created rule. */
export function newRuleMeta(kind: RuleKind, name: string, createdBy: string): RuleMeta {
  return {
    id: `${kind.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
    kind,
    name,
    description: '',
    folder: 'Group Default',
    accessType: 'Read-Write',
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
  };
}
