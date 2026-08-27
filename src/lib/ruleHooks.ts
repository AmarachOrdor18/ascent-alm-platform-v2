import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import type { RuleKind, RuleMeta } from '@/engine/types';

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
export function useRuleMutations<T extends RuleMeta>(kind: RuleKind) {
  const client = useQueryClient();
  const { user } = useAuth();

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
  };

  const save = useMutation({
    mutationFn: async (rule: T) => {
      await repository.upsertRule(rule);
      await record('Save', rule);
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
