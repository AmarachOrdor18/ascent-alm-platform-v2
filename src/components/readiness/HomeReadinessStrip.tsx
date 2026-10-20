// The compact strip at the top of Home: the current scope's readiness verdict with a link to the full
// Readiness view (Run & results → Run → Readiness) and, for approvers, how many requests wait for them.
// Home itself stays the executive dashboard - this is the only readiness it carries.
import { Link } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useWorkingContext } from '@/context/ScopeContext';
import { approvals, approvalBlockedReason } from '@/lib/governanceHooks';
import { useGroupReadiness, useReadiness } from '@/lib/readinessHooks';
import { useRuns } from '@/lib/runHooks';
import { VerdictBadge } from './ReadinessChecklist';

function useAwaitingMyDecision(enabled: boolean): number {
  const { user } = useAuth();
  const { data: requests = [] } = approvals.useList();
  const { data: runs = [] } = useRuns();
  if (!enabled || !user) return 0;
  return requests.filter((r) => {
    if (r.status !== 'Pending' || approvalBlockedReason(r, user)) return false;
    // Whoever executed a run cannot sign it off.
    if (r.module === 'Runs' && runs.find((x) => x.id === r.entityId)?.createdById === user.id) return false;
    return true;
  }).length;
}

export function HomeReadinessStrip() {
  const { hasPermission } = useAuth();
  const { affiliateCode, asOfDate, asOfDateChosen, isGroup } = useWorkingContext();
  const canDecide = hasPermission('approvals.approve');
  const awaiting = useAwaitingMyDecision(canDecide);
  const { readiness } = useReadiness(isGroup ? null : affiliateCode, asOfDate);
  const { rows } = useGroupReadiness(isGroup && asOfDateChosen ? asOfDate : null);

  const blocked = rows.filter((r) => r.readiness.verdict === 'Blocked').length;
  const ready = rows.filter((r) => r.readiness.verdict !== 'Blocked').length;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
      <span className="text-[12px] font-bold uppercase tracking-widest text-gray-400">Readiness</span>
      {isGroup ? (
        <span className="text-[13px] text-navy-900">
          {rows.length === 0 ? (
            'No affiliates yet'
          ) : (
            <>
              <span className="font-bold text-success">{ready}</span> of {rows.length} affiliate
              {rows.length === 1 ? '' : 's'} can run
              {blocked > 0 && (
                <>
                  , <span className="font-bold text-danger">{blocked} blocked</span>
                </>
              )}
            </>
          )}
        </span>
      ) : readiness ? (
        <span className="flex items-center gap-2 text-[13px] text-gray-600">
          <VerdictBadge verdict={readiness.verdict} />
          {/* "Signed off" is the verdict itself - list only the other blockers next to it. */}
          {readiness.blockers.some((b) => b.key !== 'series') && (
            <span>
              {readiness.blockers
                .filter((b) => b.key !== 'series')
                .map((b) => b.label)
                .join(', ')}
            </span>
          )}
        </span>
      ) : (
        <span className="text-[13px] text-gray-400">Checking…</span>
      )}
      <Link href="/execution/readiness" className="text-[13px] font-bold text-navy-700 hover:underline">
        See readiness →
      </Link>
      {canDecide && awaiting > 0 && (
        <Link
          href="/controls"
          className="ml-auto rounded-full bg-warning-bg px-3 py-1 text-[12px] font-bold text-warning hover:underline"
        >
          {awaiting} awaiting your decision
        </Link>
      )}
    </div>
  );
}
