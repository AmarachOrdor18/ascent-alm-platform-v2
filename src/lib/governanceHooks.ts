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

interface AuditDescriptor<T> {
  /** Audit-log module label - same taxonomy as ruleHooks.ts/runHooks.ts's own recordAuditEvent calls. */
  module: string;
  entity: string;
  describe: (row: T) => string;
}

let auditCounter = 0;

/**
 * Save and delete, each with an audit event - these governance/workflow entities (approval decisions,
 * remediation stage changes, notification rules, ...) previously only kept their own in-object history
 * (e.g. RemediationIssue.updates), which never surfaced on the central Audit Log screen.
 */
function crudFor<T extends { id: string }>(key: string, api: Crud<T>, audit: AuditDescriptor<T>) {
  const queryKey = [key] as const;

  function useList(affiliateCode?: string) {
    return useQuery({
      queryKey: [...queryKey, affiliateCode ?? 'ALL'],
      queryFn: () => api.list(affiliateCode),
    });
  }

  function record(user: ReturnType<typeof useAuth>['user'], action: string, row: T) {
    if (!user) return Promise.resolve();
    auditCounter += 1;
    return repository.recordAuditEvent({
      id: `AE-${Date.now()}-${auditCounter}`,
      module: audit.module,
      action,
      entity: audit.entity,
      entityId: row.id,
      userId: user.id,
      userName: user.name,
      role: user.role,
      outcome: 'Success',
      detail: audit.describe(row),
      recordedAt: new Date().toISOString(),
    });
  }

  function useSave() {
    const client = useQueryClient();
    const { user } = useAuth();
    return useMutation({
      mutationFn: async (row: T) => {
        await api.upsert(row);
        await record(user, 'Save', row);
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey });
        client.invalidateQueries({ queryKey: ['auditEvents'] });
      },
    });
  }

  function useRemove() {
    const client = useQueryClient();
    const { user } = useAuth();
    return useMutation({
      mutationFn: async (row: T) => {
        await api.remove(row.id);
        await record(user, 'Delete', row);
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey });
        client.invalidateQueries({ queryKey: ['auditEvents'] });
      },
    });
  }

  return { useList, useSave, useRemove, queryKey };
}

export const approvals = crudFor<ApprovalRequest>(
  'approvals',
  {
    list: (a) => repository.listApprovalRequests(a),
    upsert: (r) => repository.upsertApprovalRequest(r),
    remove: (id) => repository.deleteApprovalRequest(id),
  },
  {
    module: 'Approvals',
    entity: 'Approval Request',
    describe: (r) => `${r.entityLabel} - ${r.action} (${r.status})`,
  },
);

export const remediation = crudFor<RemediationIssue>(
  'remediationIssues',
  {
    list: (a) => repository.listRemediationIssues(a),
    upsert: (r) => repository.upsertRemediationIssue(r),
    remove: (id) => repository.deleteRemediationIssue(id),
  },
  { module: 'Remediation', entity: 'Remediation Issue', describe: (r) => `${r.title} - ${r.stage}` },
);

export const notifications = crudFor<NotificationRule>(
  'notificationRules',
  {
    list: (a) => repository.listNotificationRules(a),
    upsert: (r) => repository.upsertNotificationRule(r),
    remove: (id) => repository.deleteNotificationRule(id),
  },
  { module: 'Notifications', entity: 'Notification Rule', describe: (r) => `${r.name} (${r.event})` },
);

export const riskEntries = crudFor<RiskEntry>(
  'riskEntries',
  {
    list: (a) => repository.listRiskEntrys(a),
    upsert: (r) => repository.upsertRiskEntry(r),
    remove: (id) => repository.deleteRiskEntry(id),
  },
  { module: 'Risk Register', entity: 'Risk Entry', describe: (r) => r.title },
);

export const meetings = crudFor<AlcoMeeting>(
  'alcoMeetings',
  {
    list: (a) => repository.listAlcoMeetings(a),
    upsert: (r) => repository.upsertAlcoMeeting(r),
    remove: (id) => repository.deleteAlcoMeeting(id),
  },
  { module: 'ALCO', entity: 'ALCO Meeting', describe: (r) => `${r.title} (${r.status})` },
);

export const regulatoryReturns = crudFor<RegulatoryReturn>(
  'regulatoryReturns',
  {
    list: (a) => repository.listRegulatoryReturns(a),
    upsert: (r) => repository.upsertRegulatoryReturn(r),
    remove: (id) => repository.deleteRegulatoryReturn(id),
  },
  { module: 'Regulatory Reporting', entity: 'Regulatory Return', describe: (r) => `${r.name} - ${r.status}` },
);

export const reportPacks = crudFor<ReportPack>(
  'reportPacks',
  {
    list: (a) => repository.listReportPacks(a),
    upsert: (r) => repository.upsertReportPack(r),
    remove: (id) => repository.deleteReportPack(id),
  },
  { module: 'Reporting', entity: 'Report Pack', describe: (r) => `${r.name} (${r.kind}) - ${r.status}` },
);

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
