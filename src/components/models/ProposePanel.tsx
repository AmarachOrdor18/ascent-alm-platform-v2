import { useState } from 'react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { approvals } from '@/lib/governanceHooks';
import { useModelRuleRows, usePreparedProposal, useProposeModelRun, useRetireModelRun } from '@/lib/modelHooks';
import { canPropose, effectiveModelStatus, type EffectiveModelStatus } from '@/lib/modelRegistry';
import type { StoredModelRun } from '@/store/repository';
import type { ApprovalRequest } from '@/engine/types';

export const STATUS_TONE: Record<EffectiveModelStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  Draft: 'neutral',
  Proposed: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Superseded: 'neutral',
  Retired: 'neutral',
};

/**
 * Model approval in the same words as the rule editors ("Approved & in use", "v4 pending approval",
 * "Rejected: reason"), linking to the request in Approvals when there is one.
 */
export function ModelApprovalBadge({
  status,
  request,
  version,
}: {
  status: EffectiveModelStatus;
  request: ApprovalRequest | null;
  version?: number;
}) {
  const v = request?.entityVersion ?? version;
  const label =
    status === 'Approved'
      ? 'Approved & in use'
      : status === 'Proposed'
        ? `${v ? `v${v} ` : ''}pending approval`
        : status === 'Rejected'
          ? `Rejected${request?.decisionNote ? `: ${request.decisionNote}` : ''}`
          : status;
  if (!request) return <StatusBadge status={label} tone={STATUS_TONE[status]} />;
  return (
    <Link
      href={`/controls?request=${encodeURIComponent(request.id)}`}
      onClick={(e) => e.stopPropagation()}
      title="Open the request in Approvals"
      className="hover:underline"
    >
      <StatusBadge status={label} tone={STATUS_TONE[status]} />
    </Link>
  );
}

const BASIS_TEXT = {
  NewVersion: 'New version of the affiliate’s own rule',
  ForkGroupDefault: 'Affiliate copy of the Group default',
  NewFromEngineDefaults: 'New affiliate rule from engine defaults',
} as const;

/**
 * "Propose as assumption" for one saved run: previews exactly what the new rule version will contain,
 * then saves it through the ordinary rule save path - which raises the maker-checker request.
 */
export function ProposePanel({ run }: { run: StoredModelRun }) {
  const { hasPermission } = useAuth();
  const { data: requests = [] } = approvals.useList();
  const ruleRows = useModelRuleRows();
  const { status, request } = effectiveModelStatus(run, requests, ruleRows);
  // A fit carried into a later version of the rule is decided with that version.
  const decidingVersion = request?.entityVersion ?? run.proposedRuleVersion;
  const prepared = usePreparedProposal(canPropose(status) ? run : null);
  const propose = useProposeModelRun();
  const retire = useRetireModelRun();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission('rules.edit');

  const ruleHref =
    run.proposedRuleKind === 'Prepayment' || run.modelType === 'Prepayment'
      ? '/rules/prepayment'
      : '/rules/behaviour-patterns';

  return (
    <div className="rounded-2xl border border-navy-100 bg-navy-50/40 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Use as an assumption</h3>
        <ModelApprovalBadge status={status} request={request} version={run.proposedRuleVersion} />
        {run.proposedRuleId && (
          <span className="text-[12px] text-gray-600">
            Linked to rule <span className="font-mono">{run.proposedRuleId}</span> v{run.proposedRuleVersion}
            {run.proposedBy && ` · proposed by ${run.proposedBy}`}
          </span>
        )}
      </div>

      {status === 'Proposed' && (
        <p className="text-[13px] leading-relaxed text-gray-600">
          Waiting for a second user to approve rule version {decidingVersion}
          {decidingVersion !== run.proposedRuleVersion &&
            ` (which carries this fit forward from version ${run.proposedRuleVersion})`}{' '}
          in{' '}
          <Link
            href={request ? `/controls?request=${encodeURIComponent(request.id)}` : '/controls'}
            className="font-bold text-navy-700 hover:underline"
          >
            Approvals
          </Link>
          . Until then runs keep using the currently approved assumptions.
        </p>
      )}
      {status === 'Approved' && (
        <p className="text-[13px] leading-relaxed text-gray-600">
          Approved{request?.decidedBy ? ` by ${request.decidedBy}` : ''}. Runs for {run.affiliateCode} pick up this rule
          version (open it in{' '}
          <Link href={ruleHref} className="font-bold text-navy-700 hover:underline">
            Rules
          </Link>
          ).
        </p>
      )}
      {status === 'Rejected' && (
        <p className="mb-3 text-[13px] leading-relaxed text-danger">
          The checker rejected rule version {run.proposedRuleVersion}
          {request?.decisionNote ? `: “${request.decisionNote}”` : '.'} You can propose it again below.
        </p>
      )}
      {status === 'Superseded' && (
        <p className="mb-3 text-[13px] leading-relaxed text-gray-600">
          A later save of the rule replaced the version this run was proposed in before it was decided. Propose again to
          put this fit back in front of the checker.
        </p>
      )}
      {status === 'Retired' && (
        <p className="text-[13px] text-gray-600">Retired - kept for audit, cannot be proposed.</p>
      )}

      {canPropose(status) && (
        <>
          {prepared.isLoading || !prepared.data ? (
            <p className="text-[13px] text-gray-500">Preparing the rule change…</p>
          ) : prepared.data.error ? (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{prepared.data.error}</p>
          ) : prepared.data.proposal ? (
            <div className="space-y-3">
              <p className="text-[13px] text-gray-700">
                <span className="font-bold">{BASIS_TEXT[prepared.data.proposal.basis]}:</span> “
                {prepared.data.proposal.rule.name}” version {prepared.data.proposal.rule.version} (
                {prepared.data.proposal.kind === 'Prepayment' ? 'Prepayment' : 'Behaviour patterns'}).
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-gray-700">
                {prepared.data.proposal.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {prepared.data.proposal.warnings.map((w) => (
                <p key={w} className="rounded-lg bg-warning-bg px-3 py-2 text-[12px] text-warning">
                  {w}
                </p>
              ))}
              {canEdit ? (
                <button
                  type="button"
                  disabled={propose.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      const rule = await propose.mutateAsync({ run, proposal: prepared.data!.proposal! });
                      setMessage(`Saved “${rule.name}” as version ${rule.version} and sent it for approval.`);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-50"
                >
                  {propose.isPending ? 'Proposing…' : 'Propose as assumption'}
                </button>
              ) : (
                <p className="text-[12px] text-gray-500">Proposing a rule change needs the rules-edit permission.</p>
              )}
            </div>
          ) : null}
        </>
      )}

      {message && (
        <p role="status" className="mt-3 rounded-lg bg-success-bg px-3 py-2 text-[13px] text-success">
          {message} A second user approves it in{' '}
          <Link href="/controls" className="font-bold underline">
            Approvals
          </Link>
          .
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

      {canEdit && status !== 'Retired' && status !== 'Proposed' && (
        <button
          type="button"
          disabled={retire.isPending}
          onClick={() => void retire.mutateAsync(run)}
          className="mt-4 block text-[12px] font-bold text-gray-500 hover:text-danger hover:underline"
        >
          Retire this model run
        </button>
      )}
    </div>
  );
}
