/**
 * React Query hooks for the behavioural-model workbench: uploaded history, the model register and
 * the "propose as assumption" flow. Proposals save through the ordinary rule save path
 * (useRuleMutations), which raises the maker-checker approval request - nothing here approves anything.
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
import { useAuth } from '@/context/AuthContext';
import { approvals } from '@/lib/governanceHooks';
import { useRuleMutations, useRules } from '@/lib/ruleHooks';
import {
  buildProposal,
  commonCoaByProduct,
  proposalKindFor,
  toStoredAccountRows,
  toStoredBalanceRows,
  type HistoryKind,
  type Proposal,
} from '@/lib/modelRegistry';
import type { AccountObservation, BalanceObservation } from '@/engine/behaviouralModels';
import type { AuditEvent, RuleMeta, User } from '@/engine/types';
import type { StoredModelRun } from '@/store/repository';

/** Current Behaviour Pattern and Prepayment rule rows - what effectiveModelStatus() follows a carried fit through. */
export function useModelRuleRows(): RuleMeta[] {
  const { data: patterns = [] } = useRules<RuleMeta>('BehaviourPattern');
  const { data: prepayment = [] } = useRules<RuleMeta>('Prepayment');
  return [...patterns, ...prepayment];
}

export const modelKeys = {
  balanceHistory: (aff: string) => ['balanceHistory', aff] as const,
  accountHistory: (aff: string) => ['accountHistory', aff] as const,
  modelRuns: (aff?: string) => ['modelRuns', aff ?? 'ALL'] as const,
  modelRunsRoot: ['modelRuns'] as const,
};

const MODULE = 'Behavioural Models';
let auditCounter = 0;

function auditEvent(user: User, action: string, entity: string, entityId: string | null, detail: string): AuditEvent {
  auditCounter += 1;
  return {
    id: `AE-MODEL-${Date.now()}-${auditCounter}`,
    module: MODULE,
    action,
    entity,
    entityId,
    userId: user.id,
    userName: user.name,
    role: user.role,
    outcome: 'Success',
    detail,
    recordedAt: new Date().toISOString(),
  };
}

// ── History ──────────────────────────────────────────────────────────────

// History only changes on an upload (which refreshes these keys), so it is kept for a while instead of being
// re-read on every visit - account history runs to thousands of rows.
const HISTORY_STALE_MS = 10 * 60_000;

const balanceHistoryQuery = (affiliateCode: string) => ({
  queryKey: modelKeys.balanceHistory(affiliateCode),
  queryFn: () => repository.listBalanceHistory(affiliateCode),
  staleTime: HISTORY_STALE_MS,
});
const accountHistoryQuery = (affiliateCode: string) => ({
  queryKey: modelKeys.accountHistory(affiliateCode),
  queryFn: () => repository.listAccountHistory(affiliateCode),
  staleTime: HISTORY_STALE_MS,
});

export function useBalanceHistory(affiliateCode: string | undefined) {
  return useQuery({ ...balanceHistoryQuery(affiliateCode ?? ''), enabled: !!affiliateCode });
}

export function useAccountHistory(affiliateCode: string | undefined) {
  return useQuery({ ...accountHistoryQuery(affiliateCode ?? ''), enabled: !!affiliateCode });
}

/** Starts loading an affiliate's history in the background, so Calibrate opens with it already there. */
export function usePrefetchHistory(affiliateCode: string | null | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (!affiliateCode || affiliateCode === 'GROUP') return;
    const t = window.setTimeout(() => {
      void client.prefetchQuery(balanceHistoryQuery(affiliateCode));
      void client.prefetchQuery(accountHistoryQuery(affiliateCode));
    }, 1500);
    return () => window.clearTimeout(t);
  }, [client, affiliateCode]);
}

export interface HistoryUploadInput {
  kind: HistoryKind;
  affiliateCode: string;
  fileName: string;
  rows: BalanceObservation[] | AccountObservation[];
}

/** Accept a parsed history file: store every row tagged with a new uploadId, and audit it. */
export function useAcceptHistoryUpload() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: HistoryUploadInput) => {
      const uploadedAt = new Date().toISOString();
      const meta = {
        uploadId: `HU-${input.affiliateCode}-${Date.now().toString(36).toUpperCase()}`,
        fileName: input.fileName,
        uploadedBy: user?.name ?? 'unknown',
        uploadedAt,
      };
      if (input.kind === 'Balance') {
        await repository.insertBalanceHistory(toStoredBalanceRows(input.rows as BalanceObservation[], meta));
      } else {
        await repository.insertAccountHistory(toStoredAccountRows(input.rows as AccountObservation[], meta));
      }
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Upload',
            input.kind === 'Balance' ? 'Balance History' : 'Account History',
            meta.uploadId,
            `${input.fileName}: ${input.rows.length} row(s) for ${input.affiliateCode}`,
          ),
        );
      }
      return meta.uploadId;
    },
    onSuccess: (_id, input) => {
      client.invalidateQueries({
        queryKey:
          input.kind === 'Balance'
            ? modelKeys.balanceHistory(input.affiliateCode)
            : modelKeys.accountHistory(input.affiliateCode),
      });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

export function useDeleteHistoryUpload() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { kind: HistoryKind; affiliateCode: string; uploadId: string; fileName: string }) => {
      const n =
        input.kind === 'Balance'
          ? await repository.deleteBalanceHistory(input.affiliateCode, input.uploadId)
          : await repository.deleteAccountHistory(input.affiliateCode, input.uploadId);
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Delete',
            input.kind === 'Balance' ? 'Balance History' : 'Account History',
            input.uploadId,
            `${input.fileName}: ${n} row(s) removed for ${input.affiliateCode}`,
          ),
        );
      }
      return n;
    },
    onSuccess: (_n, input) => {
      client.invalidateQueries({
        queryKey:
          input.kind === 'Balance'
            ? modelKeys.balanceHistory(input.affiliateCode)
            : modelKeys.accountHistory(input.affiliateCode),
      });
      client.invalidateQueries({ queryKey: ['auditEvents'] });
    },
  });
}

// ── Model register ───────────────────────────────────────────────────────

export function useModelRuns(affiliateCode?: string) {
  return useQuery({
    queryKey: modelKeys.modelRuns(affiliateCode),
    queryFn: () => repository.listModelRuns(affiliateCode),
  });
}

export function useModelRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ['modelRun', id ?? 'none'],
    queryFn: () => repository.getModelRun(id!),
    enabled: !!id,
  });
}

function useInvalidateRuns() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: modelKeys.modelRunsRoot });
    client.invalidateQueries({ queryKey: ['modelRun'] });
    client.invalidateQueries({ queryKey: ['auditEvents'] });
  };
}

export function useSaveModelRun() {
  const { user } = useAuth();
  const invalidate = useInvalidateRuns();
  return useMutation({
    mutationFn: async (run: StoredModelRun) => {
      await repository.upsertModelRun(run);
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Save',
            'Model Run',
            run.id,
            `${run.modelType} ${run.segment.segmentId} v${run.version} for ${run.affiliateCode} (Draft)`,
          ),
        );
      }
    },
    onSuccess: invalidate,
  });
}

export function useRetireModelRun() {
  const { user } = useAuth();
  const invalidate = useInvalidateRuns();
  return useMutation({
    mutationFn: async (run: StoredModelRun) => {
      await repository.upsertModelRun({ ...run, status: 'Retired' });
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Retire',
            'Model Run',
            run.id,
            `${run.modelType} ${run.segment.segmentId} v${run.version} for ${run.affiliateCode}`,
          ),
        );
      }
    },
    onSuccess: invalidate,
  });
}

// ── Proposal ─────────────────────────────────────────────────────────────

/**
 * The rule a saved run would propose, built from the current rules, approvals and (for prepayment) the
 * affiliate's committed positions. Rebuilt whenever any of those change.
 */
export function usePreparedProposal(run: StoredModelRun | null) {
  const { user } = useAuth();
  const kind = run ? proposalKindFor(run.modelType) : 'BehaviourPattern';
  const { data: rules, isLoading: loadingRules } = useRules<RuleMeta>(kind);
  const { data: requests, isLoading: loadingRequests } = approvals.useList();
  return useQuery({
    queryKey: ['modelProposal', run?.id ?? 'none', run?.status ?? '', rules?.length ?? 0, rules, requests],
    enabled: !!run && !loadingRules && !loadingRequests,
    queryFn: async (): Promise<{ proposal: Proposal | null; error: string | null }> => {
      try {
        const coaByProduct =
          run!.modelType === 'Prepayment'
            ? commonCoaByProduct(await repository.queryPositions({ affiliateCode: run!.affiliateCode }))
            : undefined;
        const proposal = buildProposal(run!, {
          rules: rules ?? [],
          requests: requests ?? [],
          ...(coaByProduct ? { coaByProduct } : {}),
          userName: user?.name ?? 'unknown',
          now: new Date().toISOString(),
        });
        return { proposal, error: null };
      } catch (e) {
        return { proposal: null, error: e instanceof Error ? e.message : String(e) };
      }
    },
  });
}

/** Save the proposed rule through the ordinary rule save path (which raises the approval request), then mark the run Proposed. */
export function useProposeModelRun() {
  const { user } = useAuth();
  const invalidate = useInvalidateRuns();
  const behaviour = useRuleMutations<RuleMeta>('BehaviourPattern');
  const prepayment = useRuleMutations<RuleMeta>('Prepayment');
  return useMutation({
    mutationFn: async ({ run, proposal }: { run: StoredModelRun; proposal: Proposal }) => {
      const rule = { ...proposal.rule, updatedAt: proposal.rule.updatedAt ? new Date().toISOString() : null };
      await (proposal.kind === 'Prepayment' ? prepayment : behaviour).save(rule);
      const now = new Date().toISOString();
      await repository.upsertModelRun({
        ...run,
        status: 'Proposed',
        proposedRuleId: rule.id,
        proposedRuleVersion: rule.version,
        proposedRuleKind: proposal.kind,
        proposedBy: user?.name ?? 'unknown',
        proposedAt: now,
      });
      if (user) {
        await repository.recordAuditEvent(
          auditEvent(
            user,
            'Propose',
            'Model Run',
            run.id,
            `${run.modelType} ${run.segment.segmentId} v${run.version} proposed as ${proposal.kind} rule "${rule.name}" v${rule.version}`,
          ),
        );
      }
      return rule;
    },
    onSuccess: invalidate,
  });
}
