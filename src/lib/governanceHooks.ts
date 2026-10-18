import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '@/store/repositoryInstance';
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

  return (
    input: Omit<
      ApprovalRequest,
      | 'id'
      | 'status'
      | 'requestedBy'
      | 'requestedById'
      | 'requestedAt'
      | 'decidedBy'
      | 'decidedById'
      | 'decidedAt'
      | 'decisionNote'
    >,
  ) => {
    if (!user) return Promise.reject(new Error('Not signed in.'));
    return save.mutateAsync(newApprovalRequest(input, user));
  };
}

type ApprovalInput = Omit<
  ApprovalRequest,
  | 'id'
  | 'status'
  | 'requestedBy'
  | 'requestedById'
  | 'requestedAt'
  | 'decidedBy'
  | 'decidedById'
  | 'decidedAt'
  | 'decisionNote'
> & { id?: string };

/** A Pending request raised by `requester` - the single place requester name and id are stamped. */
export function newApprovalRequest(
  input: ApprovalInput,
  requester: { id: string; name: string },
  now = new Date().toISOString(),
): ApprovalRequest {
  return {
    ...input,
    id: input.id ?? newId('APR'),
    status: 'Pending',
    requestedBy: requester.name,
    requestedById: requester.id,
    requestedAt: now,
    decidedBy: null,
    decidedById: null,
    decidedAt: null,
    decisionNote: null,
  };
}

/** True when `user` raised `request` - by id; by name only for an older request that carries no id. */
export function isRequester(request: ApprovalRequest, user: { id: string; name: string } | null | undefined): boolean {
  if (!user) return false;
  if (request.requestedById) return request.requestedById === user.id;
  return request.requestedBy === user.name;
}

export function approvalBlockedReason(
  request: ApprovalRequest,
  user: { id: string; name: string } | null | undefined,
): string | null {
  if (request.status !== 'Pending') return `Already ${request.status.toLowerCase()}.`;
  if (!user) return 'Not signed in.';
  if (isRequester(request, user)) {
    return 'You raised this request. Segregation of duties means a maker cannot be their own checker.';
  }
  return null;
}
