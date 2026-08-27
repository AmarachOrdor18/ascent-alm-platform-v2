import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/localRepository';
import { useAuth } from '@/context/AuthContext';
import type {
  AlcoMeeting,
  ApprovalRequest,
  NotificationRule,
  RegulatoryReturn,
  RemediationIssue,
  ReportPack,
  RiskEntry,
} from '@/engine/types';

interface Crud<T> {
  list: (affiliateCode?: string) => Promise<T[]>;
  upsert: (row: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function crudFor<T>(key: string, api: Crud<T>) {
  const queryKey = [key] as const;

  function useList(affiliateCode?: string) {
    return useQuery({
      queryKey: [...queryKey, affiliateCode ?? 'ALL'],
      queryFn: () => api.list(affiliateCode),
    });
  }

  function useSave() {
    const client = useQueryClient();
    return useMutation({
      mutationFn: (row: T) => api.upsert(row),
      onSuccess: () => client.invalidateQueries({ queryKey }),
    });
  }

  function useRemove() {
    const client = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.remove(id),
      onSuccess: () => client.invalidateQueries({ queryKey }),
    });
  }

  return { useList, useSave, useRemove, queryKey };
}

export const approvals = crudFor<ApprovalRequest>('approvals', {
  list: (a) => repository.listApprovalRequests(a),
  upsert: (r) => repository.upsertApprovalRequest(r),
  remove: (id) => repository.deleteApprovalRequest(id),
});

export const remediation = crudFor<RemediationIssue>('remediationIssues', {
  list: (a) => repository.listRemediationIssues(a),
  upsert: (r) => repository.upsertRemediationIssue(r),
  remove: (id) => repository.deleteRemediationIssue(id),
});

export const notifications = crudFor<NotificationRule>('notificationRules', {
  list: (a) => repository.listNotificationRules(a),
  upsert: (r) => repository.upsertNotificationRule(r),
  remove: (id) => repository.deleteNotificationRule(id),
});

export const riskEntries = crudFor<RiskEntry>('riskEntries', {
  list: (a) => repository.listRiskEntrys(a),
  upsert: (r) => repository.upsertRiskEntry(r),
  remove: (id) => repository.deleteRiskEntry(id),
});

export const meetings = crudFor<AlcoMeeting>('alcoMeetings', {
  list: (a) => repository.listAlcoMeetings(a),
  upsert: (r) => repository.upsertAlcoMeeting(r),
  remove: (id) => repository.deleteAlcoMeeting(id),
});

export const regulatoryReturns = crudFor<RegulatoryReturn>('regulatoryReturns', {
  list: (a) => repository.listRegulatoryReturns(a),
  upsert: (r) => repository.upsertRegulatoryReturn(r),
  remove: (id) => repository.deleteRegulatoryReturn(id),
});

export const reportPacks = crudFor<ReportPack>('reportPacks', {
  list: (a) => repository.listReportPacks(a),
  upsert: (r) => repository.upsertReportPack(r),
  remove: (id) => repository.deleteReportPack(id),
});

/** Short, sortable id with a readable prefix. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function useRequestApproval() {
  const save = approvals.useSave();
  const { user } = useAuth();

  return (input: Omit<ApprovalRequest, 'id' | 'status' | 'requestedBy' | 'requestedAt' | 'decidedBy' | 'decidedAt' | 'decisionNote'>) =>
    save.mutateAsync({
      ...input,
      id: newId('APR'),
      status: 'Pending',
      requestedBy: user?.name ?? 'unknown',
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
}

export function approvalBlockedReason(request: ApprovalRequest, userName: string | undefined): string | null {
  if (request.status !== 'Pending') return `Already ${request.status.toLowerCase()}.`;
  if (!userName) return 'Not signed in.';
  if (request.requestedBy === userName) {
    return 'You raised this request. Segregation of duties means a maker cannot be their own checker.';
  }
  return null;
}
