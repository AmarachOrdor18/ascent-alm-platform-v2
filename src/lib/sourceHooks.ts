// React Query hooks for data sources and their lobby (Phase 4). Reads are scoped the same way RLS scopes
// them: an affiliate-confined user only ever sees their own affiliate's sources (and GROUP market data
// when the organisation allows affiliates their own market data); Group users see every source.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import type { StagedBatch } from '@/store/repository';
import { useAuth } from '@/context/AuthContext';
import { isRestrictedToOwnAffiliate } from './scope';
import { isMarketDataDomain } from './dataSources';
import {
  admitLoad,
  rejectLoad,
  sendToLobby,
  withdrawLoad,
  type Actor,
  type AdmitInput,
  type FileCheck,
} from './sourceIngest';
import { remediation, newId } from './governanceHooks';
import { useAffiliates, useBatches } from './hooks';
import { useRules } from './ruleHooks';
import type { CheckEnv } from './sourceIngest';
import type { CodeMappingRule, FieldMappingRule, ValidationRuleSet } from '@/engine/ruleTypes';
import type { DataSource, LoadBatch } from '@/engine/types';

export const sourceKeys = {
  all: ['dataSources'] as const,
  lobby: ['stagedBatches', 'lobby'] as const,
};

/** Every query a load can change. */
const AFFECTED = [
  ['batches'],
  ['stagedBatches'],
  ['positions'],
  ['fxRates'],
  ['yieldCurves'],
  ['economicIndicators'],
  ['dimension'],
  ['balanceHistory'],
  ['accountHistory'],
  ['auditEvents'],
  // Admits create notifications (market data loaded, ledger admitted).
  ['inAppNotifications'],
];

function useInvalidateLoads() {
  const client = useQueryClient();
  return () => {
    for (const key of AFFECTED) void client.invalidateQueries({ queryKey: key });
  };
}

function useActor(): Actor | null {
  const { user } = useAuth();
  return user ? { id: user.id, name: user.name, role: user.role } : null;
}

/** Who may edit an existing source's fields and settings. */
export function useCanConfigureSources(): boolean {
  const { hasPermission } = useAuth();
  return hasPermission('data.configure') || hasPermission('affiliate.manage') || hasPermission('group.manage');
}

/**
 * Who may change the column mapping of one affiliate's source: anyone who can configure sources, for their
 * own affiliate only - Group-level users (Organisation Admin) for every affiliate.
 */
export function useCanMapColumns(affiliateCode: string | undefined): boolean {
  const { user, hasPermission } = useAuth();
  // Whoever uploads a file may confirm its columns (inline mapping at first upload), for their own scope.
  const canConfigure = useCanConfigureSources() || hasPermission('data.upload');
  if (!user || !affiliateCode || !canConfigure) return false;
  if (affiliateCode === 'GROUP') return user.affiliateCode === 'GROUP' || hasPermission('group.manage');
  if (hasPermission('group.manage')) return true;
  return !isRestrictedToOwnAffiliate(user, hasPermission) || user.affiliateCode === affiliateCode;
}

/** Only the Organisation Admin adds new data sources (from Admin -> Organisation setup). */
export function useCanAddSources(): boolean {
  const { hasPermission } = useAuth();
  return hasPermission('group.manage');
}

/** Who may upload, admit, reject and withdraw files: ALM Analysts and admins, for their own affiliate. */
export function useCanUploadData(): boolean {
  const { hasPermission } = useAuth();
  return hasPermission('data.upload') || hasPermission('data.configure');
}

/**
 * The sources this user works with. Group users: all. Affiliate users: their own affiliate's positions and
 * ledger only - market data is always loaded by Group.
 */
export function useDataSources() {
  const { user, hasPermission } = useAuth();
  const query = useQuery({ queryKey: sourceKeys.all, queryFn: () => repository.listDataSources() });
  const restricted = isRestrictedToOwnAffiliate(user, hasPermission);
  const visible = useMemo(() => {
    const rows = query.data ?? [];
    if (!restricted) return rows;
    return rows.filter((s) => s.affiliateCode === user!.affiliateCode && !isMarketDataDomain(s.domain));
  }, [query.data, restricted, user]);
  return { ...query, data: visible, restricted };
}

export function useSaveDataSource() {
  const client = useQueryClient();
  const actor = useActor();
  return useMutation({
    mutationFn: async (source: DataSource) => {
      await repository.upsertDataSource(source);
      if (actor) {
        await repository.recordAuditEvent({
          id: newId('AE-DS'),
          module: 'Data Ingestion',
          action: 'Save',
          entity: 'Data Source',
          entityId: source.id,
          userId: actor.id,
          userName: actor.name,
          role: actor.role as never,
          outcome: 'Success',
          detail: `${source.name} (${source.affiliateCode}, ${source.domain}) - ${source.fields.length} field(s), ${source.isActive ? 'active' : 'inactive'}`,
          recordedAt: new Date().toISOString(),
        });
      }
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: sourceKeys.all });
      void client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

/** Every lobby entry (staged, not yet admitted or rejected). The kept ledger copies are not lobby entries. */
export function useLobby() {
  return useQuery({
    queryKey: sourceKeys.lobby,
    queryFn: async () => (await repository.listStagedBatches()).filter((s) => !s.admitted),
  });
}

/** Which source a lobby entry or load belongs to - by its sourceId, or (older loads) by affiliate, domain and department. */
export function sourceForLoad(
  load: { sourceId?: string; affiliateCode: string; domain: string; contributor?: string | null },
  sources: DataSource[],
): DataSource | null {
  if (load.sourceId) {
    const exact = sources.find((s) => s.id === load.sourceId);
    if (exact) return exact;
  }
  return (
    sources.find(
      (s) =>
        s.affiliateCode === load.affiliateCode &&
        s.domain === load.domain &&
        (s.domain !== 'Positions' || (s.contributor ?? null) === (load.contributor ?? null)),
    ) ?? null
  );
}

export function useSendToLobby() {
  const actor = useActor();
  const invalidate = useInvalidateLoads();
  return useMutation({ mutationFn: (check: FileCheck) => sendToLobby(check, actor), onSuccess: invalidate });
}

export function useAdmitLoad() {
  const actor = useActor();
  const invalidate = useInvalidateLoads();
  return useMutation({ mutationFn: (input: AdmitInput) => admitLoad(input, actor), onSuccess: invalidate });
}

/** Rejects a lobby entry; a file that failed a blocking check is also raised as a control issue, as before. */
export function useRejectLoad() {
  const actor = useActor();
  const invalidate = useInvalidateLoads();
  const raise = remediation.useSave();
  return useMutation({
    mutationFn: async ({ staged, reason }: { staged: StagedBatch; reason: string }) => {
      const rejected = await rejectLoad(staged, reason, actor);
      if (actor && (staged.check?.blocking ?? 0) > 0) {
        const now = new Date().toISOString();
        await raise.mutateAsync({
          id: newId('CR'),
          title: `Data upload rejected - ${staged.batch.fileName}`,
          description: reason,
          source: 'Data Upload',
          linkedLimitId: null,
          linkedBatchId: staged.batch.id,
          severity: 'High',
          stage: 'Identified',
          owner: '',
          affiliateCode: staged.affiliateCode,
          raisedBy: actor.name,
          raisedAt: now,
          dueDate: null,
          closedAt: null,
          closureApprovedBy: null,
          updates: [{ at: now, by: actor.name, stage: 'Identified', note: 'Auto-raised from a rejected upload.' }],
        });
      }
      return rejected;
    },
    onSuccess: invalidate,
  });
}

export function useWithdrawLoad() {
  const actor = useActor();
  const invalidate = useInvalidateLoads();
  return useMutation({
    mutationFn: ({ batch, reason }: { batch: LoadBatch; reason: string }) => withdrawLoad(batch, reason, actor),
    onSuccess: invalidate,
  });
}

/** What stage a load is at, in words a non-specialist reads. */
export type LoadStage = 'In lobby' | 'Admitted' | 'Rejected' | 'Withdrawn' | 'Superseded';

export function loadStage(b: LoadBatch): LoadStage {
  if (b.withdrawnAt) return 'Withdrawn';
  switch (b.status) {
    case 'Committed':
      return 'Admitted';
    case 'Rejected':
      return 'Rejected';
    case 'Superseded':
      return 'Superseded';
    default:
      return 'In lobby';
  }
}

export const STAGE_TONE: Record<LoadStage, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  'In lobby': 'warning',
  Admitted: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
  Superseded: 'neutral',
};

/** Everything a file check reads besides the file: loads so far, the lobby, affiliates and the rules that apply. */
export function useCheckEnv(): CheckEnv {
  const { user } = useAuth();
  const { data: batches = [] } = useBatches();
  const { data: lobby = [] } = useLobby();
  const { data: affiliates = [] } = useAffiliates();
  const { data: validationRuleSets = [] } = useRules<ValidationRuleSet>('ValidationRule');
  const { data: fieldMappings = [] } = useRules<FieldMappingRule>('FieldMapping');
  const { data: codeMappings = [] } = useRules<CodeMappingRule>('CodeMapping');
  return useMemo(
    () => ({
      batches,
      lobby,
      affiliates,
      validationRuleSets,
      fieldMappings,
      codeMappings,
      userName: user?.name ?? 'unknown',
    }),
    [batches, lobby, affiliates, validationRuleSets, fieldMappings, codeMappings, user?.name],
  );
}
