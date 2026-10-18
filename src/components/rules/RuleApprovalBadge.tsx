// Approval status shown where the approval is raised (teardown §3.3): on each rule (and model proposal) the
// editor lists, "Approved & in use", "v4 pending approval" or "Rejected: reason", linking to the request in
// Approvals. Derived from the approval requests - nothing extra is stored.
import { Link } from 'wouter';
import { cn } from '@/lib/cn';
import { approvals } from '@/lib/governanceHooks';
import { isApprovalGated, isRuleApproved } from '@/lib/ruleApproval';
import type { ApprovalRequest, RuleMeta } from '@/engine/types';

export type RuleApprovalTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface RuleApprovalState {
  label: string;
  tone: RuleApprovalTone;
  /** The request to open in Approvals, when there is one. */
  requestId: string | null;
  /** Rejection reason / longer explanation. */
  detail?: string;
}

/** Where a rule version stands in maker-checker. Null for kinds that carry no approval. */
export function ruleApprovalState(rule: RuleMeta, requests: ApprovalRequest[]): RuleApprovalState | null {
  if (!isApprovalGated(rule.kind)) return null;
  const forVersion = requests
    .filter((r) => r.entityId === rule.id && r.entityType === rule.kind && r.entityVersion === rule.version)
    .sort((a, b) => (b.decidedAt ?? b.requestedAt).localeCompare(a.decidedAt ?? a.requestedAt));
  const approved = forVersion.find((r) => r.status === 'Approved') ?? null;
  if (isRuleApproved(rule, requests)) {
    return {
      label: rule.isActive ? 'Approved & in use' : 'Approved (inactive)',
      tone: rule.isActive ? 'success' : 'neutral',
      requestId: approved?.id ?? null,
    };
  }
  const pending = forVersion.find((r) => r.status === 'Pending');
  if (pending) return { label: `v${rule.version} pending approval`, tone: 'warning', requestId: pending.id };
  const rejected = forVersion.find((r) => r.status === 'Rejected');
  if (rejected) {
    return {
      label: `Rejected${rejected.decisionNote ? `: ${rejected.decisionNote}` : ''}`,
      tone: 'danger',
      requestId: rejected.id,
      detail: rejected.decidedBy ? `Rejected by ${rejected.decidedBy}` : undefined,
    };
  }
  return { label: `v${rule.version} not submitted for approval`, tone: 'neutral', requestId: null };
}

const TONE: Record<RuleApprovalTone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  neutral: 'bg-gray-100 text-gray-600',
};

/** The badge for one rule; links to the request when there is one. */
export function RuleApprovalBadge({
  rule,
  requests,
  className,
  link = true,
}: {
  rule: RuleMeta;
  requests?: ApprovalRequest[];
  className?: string;
  link?: boolean;
}) {
  const { data: fetched = [] } = approvals.useList();
  const state = ruleApprovalState(rule, requests ?? fetched);
  if (!state) return null;
  const cls = cn(
    'inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-bold',
    TONE[state.tone],
    className,
  );
  if (link && state.requestId) {
    return (
      <Link
        href={`/controls?request=${encodeURIComponent(state.requestId)}`}
        title={state.detail ?? 'Open the request in Approvals'}
        onClick={(e) => e.stopPropagation()}
        className={cn(cls, 'hover:underline')}
      >
        {state.label}
      </Link>
    );
  }
  return (
    <span className={cls} title={state.detail}>
      {state.label}
    </span>
  );
}
