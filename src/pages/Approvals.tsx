import { SEED_AUTHOR } from '@/lib/ruleApproval';
// Approvals (/controls): three plain lists - what is waiting for me, what I raised, and everything decided -
// each request a card saying WHAT changes and WHY. Clicking one opens a side panel (?request=<id>) with the
// details, Approve, and Reject (a reason is required). Maker-checker stays a property of the decision itself:
// the person who raised a request, or ran the run being signed off, can never decide it - and the database
// enforces the same rule by user id.
import { useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateReadinessInputs } from '@/lib/readinessHooks';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import { useAuth } from '@/context/AuthContext';
import { keys, useAffiliates, useBatches } from '@/lib/hooks';
import { approvals, approvalBlockedReason, isRequester, newApprovalRequest, newId } from '@/lib/governanceHooks';
import { repository } from '@/store/repositoryInstance';
import { useCommitSnapshot } from '@/lib/snapshotHooks';
import { checkAllDomains } from '@/engine/vintage';
import { runHeadlines, runKeys, useRunResults, useRuns } from '@/lib/runHooks';
import { signOffStatusOf, SIGN_OFF_LABEL, versionOf } from '@/lib/runSeries';
import { formatDate, formatPct } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Affiliate, ApprovalRequest, ProcessRun, RuleMeta } from '@/engine/types';

const TODAY = new Date().toISOString().slice(0, 10);

const ACTIONS = ['Create', 'Update', 'Delete', 'Activate', 'Override'] as const;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
};

type Tab = 'mine' | 'raised' | 'history';

/** Plain name of the kind of request. */
function typeOf(r: ApprovalRequest): string {
  if (r.module === 'Runs') return 'Run sign-off';
  if (r.module === 'Business Rules') return 'Assumption change';
  if (r.module === 'Affiliates' && r.action === 'Activate') return 'Affiliate go-live';
  if (r.module === 'Limits') return 'Limit change';
  if (r.module === 'Position Snapshot') return 'Position correction';
  return r.module || 'Other';
}

/** Rule kinds in plain words. */
const RULE_KIND_WORDS: Record<string, string> = {
  BehaviourPattern: 'Deposit behaviour',
  Prepayment: 'Loan prepayment',
  ProductCharacteristic: 'Product characteristics',
  CostAllocation: 'Operating cost allocation',
  CreditLoss: 'Expected credit loss',
  CapitalAllocation: 'Capital charge',
  FtpRule: 'Transfer pricing',
  AdjustmentRule: 'Transfer pricing add-ons',
  ForecastScenario: 'Forecast scenario',
};

const day = (iso: string | null | undefined) => (iso ? formatDate(iso.slice(0, 10)) : '-');

/** "amber 80% / red 70% (organisation default amber 90% / red 80%)" -> old and new thresholds. */
function parseLimitChange(summary: string): { amber: [string, string]; red: [string, string] } | null {
  const m = summary.match(/amber ([\d.]+)% \/ red ([\d.]+)% \(organisation default amber ([\d.]+)% \/ red ([\d.]+)%\)/);
  if (!m) return null;
  return { amber: [m[3]!, m[1]!], red: [m[4]!, m[2]!] };
}

export function Approvals() {
  const { user, hasPermission } = useAuth();
  const canDecide = hasPermission('approvals.approve');
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: allRequests = [], isLoading } = approvals.useList();
  const requests = useMemo(() => allRequests.filter((r) => r.requestedBy !== SEED_AUTHOR), [allRequests]);
  const save = approvals.useSave();
  const queryClient = useQueryClient();
  const commitSnapshot = useCommitSnapshot();
  const { data: allRuns = [] } = useRuns();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const openId = new URLSearchParams(search).get('request');

  const [tab, setTab] = useState<Tab>('mine');
  const [filters, setFilters] = useState({ type: '', affiliate: '', status: '', from: '', to: '', text: '' });
  const [newOpen, setNewOpen] = useState(false);
  const [commitConfirmation, setCommitConfirmation] = useState<{ requestId: string; batchId: string } | null>(null);

  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(search);
    if (id) p.set('request', id);
    else p.delete('request');
    const q = p.toString();
    navigate(`${location}${q ? `?${q}` : ''}`, { replace: true });
  };

  const affiliateName = (code: string | null) =>
    !code || code === 'GROUP' ? 'Group-wide' : (affiliates.find((a) => a.code === code)?.name ?? code);

  /** Why this user may not decide this request - null when they may. */
  const blockedReason = (r: ApprovalRequest): string | null => {
    if (r.status !== 'Pending') {
      return `Already ${r.status.toLowerCase()}${r.decidedBy ? ` by ${r.decidedBy}` : ''}${r.decidedAt ? ` on ${day(r.decidedAt)}` : ''}.`;
    }
    const base = approvalBlockedReason(r, user);
    if (base) return base;
    const run = runSignOffBlockedReason(r, allRuns, user);
    if (run) return run;
    if (!canDecide)
      return 'Your role does not include approval rights. An Approver or Organisation Admin decides this.';
    return null;
  };

  /** Informational only - a human still decides, this just tells them what they'd otherwise have to check by hand. */
  const activationReadiness = (r: ApprovalRequest): { issues: string[] } | null => {
    if (r.module !== 'Affiliates' || r.action !== 'Activate') return null;
    const affiliate = affiliates.find((a) => a.code === r.entityId);
    if (!affiliate) return null;
    const neverLoaded = checkAllDomains(affiliate, batches, TODAY).filter((f) => f.status === 'Never loaded').length;
    const issues: string[] = [];
    if (neverLoaded > 0) issues.push(`${neverLoaded} data domain${neverLoaded === 1 ? '' : 's'} never loaded`);
    if (!affiliate.limitsConfirmed) issues.push('Risk thresholds not confirmed');
    return { issues };
  };

  const waiting = requests.filter((r) => r.status === 'Pending' && !blockedReason(r));
  const raised = requests.filter((r) => isRequester(r, user));
  const base = tab === 'mine' ? waiting : tab === 'raised' ? raised : requests;

  const types = useMemo(() => Array.from(new Set(requests.map(typeOf))).sort(), [requests]);
  const affiliateCodes = useMemo(
    () => Array.from(new Set(requests.map((r) => r.affiliateCode ?? 'GROUP'))).sort(),
    [requests],
  );

  const rows = base
    .filter((r) => !filters.type || typeOf(r) === filters.type)
    .filter((r) => !filters.affiliate || (r.affiliateCode ?? 'GROUP') === filters.affiliate)
    .filter((r) => !filters.status || r.status === filters.status)
    .filter((r) => !filters.from || r.requestedAt.slice(0, 10) >= filters.from)
    .filter((r) => !filters.to || r.requestedAt.slice(0, 10) <= filters.to)
    .filter((r) => {
      const t = filters.text.trim().toLowerCase();
      if (!t) return true;
      return [r.entityLabel, r.summary, r.requestedBy, r.module, typeOf(r)].some((v) => v.toLowerCase().includes(t));
    })
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  // Approving an Activate request on Affiliates moves the affiliate Live - the repository does that as part
  // of saving the decision (a database trigger on Supabase), never this screen; it only refetches.
  // Approving a Business Rules request (behaviour patterns, prepayment, product characteristics) is what
  // makes that rule version selectable on Run now - see lib/ruleApproval.ts isRuleApproved.
  const decide = async (request: ApprovalRequest, status: 'Approved' | 'Rejected', note: string): Promise<boolean> => {
    // The buttons are already disabled for the maker; refuse here too so segregation of duties is a
    // property of the action, not just of the screen.
    if (!user || !canDecide || approvalBlockedReason(request, user) || runSignOffBlockedReason(request, allRuns, user))
      return false;
    if (status === 'Rejected' && !note.trim()) return false;
    // Awaited: the database can still refuse the decision (maker-checker is enforced there too), and
    // nothing downstream - activating an affiliate, committing a snapshot - may happen if it did.
    try {
      await save.mutateAsync({
        ...request,
        status,
        decidedBy: user.name,
        decidedById: user.id,
        decidedAt: new Date().toISOString(),
        decisionNote: note.trim() || null,
      });
    } catch {
      return false;
    }

    if (status === 'Approved' && request.module === 'Affiliates' && request.action === 'Activate') {
      void queryClient.invalidateQueries({ queryKey: keys.affiliates });
    }
    // A decision can unblock (or block) a run anywhere - readiness recalculates; the requester's bell updates.
    invalidateReadinessInputs(queryClient);
    void queryClient.invalidateQueries({ queryKey: ['inAppNotifications'] });

    // A Runs/SignOff decision moves the run itself (SignedOff, or back to Open) - same pattern, the
    // repository / database trigger does it; this screen only refetches.
    if (request.module === 'Runs') void queryClient.invalidateQueries({ queryKey: runKeys.all });

    // Approving an edited position snapshot commits it as a new, superseding Position Book version - the
    // parent batch is never touched (see useCommitSnapshot). A rejection leaves the snapshot exactly as it
    // was, still editable from Position Book.
    if (status === 'Approved' && request.module === 'Position Snapshot') {
      void repository.getSnapshot(request.entityId).then((snapshot) => {
        if (snapshot && snapshot.status === 'PendingApproval') {
          void commitSnapshot
            .mutateAsync(snapshot)
            .then((newBatch) => setCommitConfirmation({ requestId: request.id, batchId: newBatch.id }));
        }
      });
    }
    return true;
  };

  const open = openId ? (requests.find((r) => r.id === openId) ?? null) : null;

  const tabs: Array<{ key: Tab; label: string; count: number; hint: string }> = [
    {
      key: 'mine',
      label: 'Waiting for me',
      count: waiting.length,
      hint: 'Requests you are allowed to approve or reject.',
    },
    {
      key: 'raised',
      label: 'Raised by me',
      count: raised.length,
      hint: 'Requests you sent - someone else decides them.',
    },
    { key: 'history', label: 'History', count: requests.length, hint: 'Every request, pending or decided.' },
  ];
  const active = tabs.find((t) => t.key === tab)!;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <ModuleHeader
        title="Approvals"
        description="Changes that need a second person."
        about="Whoever raised a request - or ran the run being signed off - cannot decide it."
        asOfDate={null}
        metrics={[
          {
            label: 'Waiting for me',
            value: String(waiting.length),
            tone: waiting.length > 0 ? 'warning' : 'success',
            about: 'Pending requests you may decide.',
          },
          {
            label: 'Pending (all)',
            value: String(requests.filter((r) => r.status === 'Pending').length),
            about: 'Every request still waiting for a decision.',
          },
          {
            label: 'Raised by me',
            value: String(raised.filter((r) => r.status === 'Pending').length),
            about: 'Your own requests still waiting for someone else.',
          },
        ]}
      />

      {save.error && (
        <div role="alert" className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-[13px] text-danger">
          {save.error instanceof Error ? save.error.message : String(save.error)}
        </div>
      )}

      {commitConfirmation && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success-bg px-4 py-3 text-[13px] text-success"
        >
          <span>
            <span className="font-bold">Committed.</span> The approved correction is now Position Book version{' '}
            <span className="font-mono font-bold">{commitConfirmation.batchId}</span>.
          </span>
          <div className="flex items-center gap-3">
            <Link
              href={`/data/operations/position-book?batchId=${commitConfirmation.batchId}`}
              className="font-bold underline hover:no-underline"
            >
              View in Position Book →
            </Link>
            <button
              type="button"
              onClick={() => setCommitConfirmation(null)}
              aria-label="Dismiss"
              className="text-success/70 hover:text-success"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-lg px-4 py-2 text-[13px] font-bold transition-colors',
              tab === t.key
                ? 'bg-navy-900 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700',
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Search requests"
            placeholder="Search…"
            value={filters.text}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
            className={cn(filterCls, 'min-w-[160px] flex-1')}
          />
          <select
            aria-label="Type"
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className={filterCls}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Affiliate"
            value={filters.affiliate}
            onChange={(e) => setFilters((f) => ({ ...f, affiliate: e.target.value }))}
            className={filterCls}
          >
            <option value="">All affiliates</option>
            {affiliateCodes.map((c) => (
              <option key={c} value={c}>
                {affiliateName(c)}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={filterCls}
          >
            <option value="">Any status</option>
            {['Pending', 'Approved', 'Rejected', 'Withdrawn'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              aria-label="Raised from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className={cn(filterCls, 'w-[140px]')}
            />
            <span className="text-gray-400">–</span>
            <input
              aria-label="Raised to"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className={cn(filterCls, 'w-[140px]')}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px] text-gray-500">
          <span>{active.hint}</span>
          {filtered && (
            <button
              type="button"
              className="font-bold text-navy-700 hover:underline"
              onClick={() => setFilters({ type: '', affiliate: '', status: '', from: '', to: '', text: '' })}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-[13px] text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-[13px] text-gray-500">
          {filtered
            ? 'Nothing matches these filters.'
            : tab === 'mine'
              ? 'Nothing is waiting for you. New requests appear here when someone else needs your decision.'
              : tab === 'raised'
                ? 'You have not raised any requests. Sign-off requests, assumption changes and go-live requests you send appear here.'
                : 'No requests yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">Change</th>
                <th className="px-4 py-2.5">Scope</th>
                <th className="px-4 py-2.5">Raised</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canDecide = !blockedReason(r);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setOpen(r.id)}
                    className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2.5 text-gray-500">{typeOf(r)}</td>
                    <td className="px-4 py-2.5 font-bold text-navy-900">{r.entityLabel}</td>
                    <td className="px-4 py-2.5">
                      <ChangeCell request={r} readiness={r.status === 'Pending' ? activationReadiness(r) : null} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {r.affiliateCode && r.affiliateCode !== 'GROUP' ? r.affiliateCode : 'Group'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                      {r.requestedBy.split(' ')[0]} · {day(r.requestedAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(r.id);
                        }}
                        className={cn(
                          'rounded-lg px-3 py-1 text-[12px] font-bold',
                          canDecide
                            ? 'bg-navy-900 text-white hover:bg-navy-700'
                            : 'border border-gray-200 text-navy-900 hover:border-navy-700',
                        )}
                      >
                        {canDecide ? 'Review' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-[12px] text-gray-400">
        Requests are raised from the screen where the change is made (run sign-off, assumptions, affiliate setup,
        limits).{' '}
        <button type="button" onClick={() => setNewOpen(true)} className="font-bold text-navy-700 hover:underline">
          Other request
        </button>
      </p>

      {open && (
        <RequestDrawer
          request={open}
          affiliate={affiliateName(open.affiliateCode)}
          allRuns={allRuns}
          affiliates={affiliates}
          readiness={open.status === 'Pending' ? activationReadiness(open) : null}
          blocked={blockedReason(open)}
          busy={save.isPending}
          onClose={() => setOpen(null)}
          onDecide={async (status, note) => {
            if (await decide(open, status, note)) setOpen(null);
          }}
        />
      )}
      {!open && openId && !isLoading && (
        <Drawer title="Request not found" onClose={() => setOpen(null)}>
          <p className="text-[13px] text-gray-500">This request does not exist or is outside your scope.</p>
        </Drawer>
      )}

      {newOpen && <OtherRequestForm affiliates={affiliates} onClose={() => setNewOpen(false)} />}
    </>
  );
}

const filterCls =
  'w-auto max-w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] text-navy-900 focus:border-navy-700 focus:outline-none';

// ─── Table cell ────────────────────────────────────────────────────────────

/** The change in a few characters - the side panel holds the full detail and the reason. */
function ChangeCell({ request: r, readiness }: { request: ApprovalRequest; readiness: { issues: string[] } | null }) {
  const mono = 'font-mono text-[12px] text-navy-900';
  if (r.module === 'Business Rules') {
    if (!r.entityVersion) return <span className="text-gray-400">-</span>;
    return (
      <span className={mono}>{r.entityVersion > 1 ? `v${r.entityVersion - 1} → v${r.entityVersion}` : 'New (v1)'}</span>
    );
  }
  if (r.module === 'Affiliates' && r.action === 'Activate') {
    return (
      <span className="flex items-center gap-2">
        <span className="text-navy-900">Go Live</span>
        {readiness && (
          <StatusBadge
            status={readiness.issues.length > 0 ? `${readiness.issues.length} issue(s)` : 'Checks pass'}
            tone={readiness.issues.length > 0 ? 'warning' : 'success'}
          />
        )}
      </span>
    );
  }
  if (r.module === 'Runs' && r.action === 'SignOff') return <span className="text-navy-900">Sign off run</span>;
  if (r.module === 'Limits') {
    const change = parseLimitChange(r.summary);
    if (change)
      return (
        <span className={mono}>
          A {change.amber[0]}→{change.amber[1]}% · R {change.red[0]}→{change.red[1]}%
        </span>
      );
  }
  if (r.module === 'Position Snapshot') return <span className="text-navy-900">Edited positions</span>;
  return <span className="text-navy-900">{r.action}</span>;
}

/** One plain line (or block) saying what the request changes, by kind of request. */
function WhatChanges({
  request: r,
  allRuns,
  affiliates,
  readiness,
}: {
  request: ApprovalRequest;
  allRuns: ProcessRun[];
  affiliates: Affiliate[];
  readiness: { issues: string[] } | null;
}) {
  if (r.module === 'Runs' && r.action === 'SignOff')
    return <RunSignOffSummary request={r} allRuns={allRuns} affiliates={affiliates} />;
  const box = 'mt-3 rounded-lg bg-navy-50 px-3 py-2 text-[13px] text-navy-900';
  if (r.module === 'Business Rules') {
    return (
      <p className={box}>
        <span className="font-bold">{RULE_KIND_WORDS[r.entityType] ?? r.entityType}</span>
        {r.entityVersion ? ` - version ${r.entityVersion}` : ''}
        {r.entityVersion && r.entityVersion > 1
          ? ` replaces version ${r.entityVersion - 1}`
          : r.entityVersion === 1
            ? ' (new)'
            : ''}
        . Not used in any run until approved.
      </p>
    );
  }
  if (r.module === 'Affiliates' && r.action === 'Activate') {
    return (
      <p className={box}>
        Makes the affiliate <span className="font-bold">Live</span> - its results join Group figures.{' '}
        {readiness && (
          <span className={cn('font-bold', readiness.issues.length > 0 ? 'text-warning' : 'text-success')}>
            {readiness.issues.length > 0 ? `⚠ ${readiness.issues.join(' · ')}` : '✓ Data readiness checks pass'}
          </span>
        )}
      </p>
    );
  }
  if (r.module === 'Limits') {
    const change = parseLimitChange(r.summary);
    if (change) {
      return (
        <p className={box}>
          Amber threshold{' '}
          <span className="font-mono font-bold">
            {change.amber[0]}% → {change.amber[1]}%
          </span>{' '}
          · Red threshold{' '}
          <span className="font-mono font-bold">
            {change.red[0]}% → {change.red[1]}%
          </span>{' '}
          (organisation default → requested)
        </p>
      );
    }
  }
  if (r.module === 'Position Snapshot') {
    return (
      <p className={box}>
        Edited positions become a new Position Book version once approved. The original upload is kept.
      </p>
    );
  }
  return null;
}

// ─── Side panel ────────────────────────────────────────────────────────────

function RequestDrawer({
  request: r,
  affiliate,
  allRuns,
  affiliates,
  readiness,
  blocked,
  busy,
  onClose,
  onDecide,
}: {
  request: ApprovalRequest;
  affiliate: string;
  allRuns: ProcessRun[];
  affiliates: Affiliate[];
  readiness: { issues: string[] } | null;
  blocked: string | null;
  busy: boolean;
  onClose: () => void;
  onDecide: (status: 'Approved' | 'Rejected', note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const facts: Array<[string, string]> = [
    ['Type', typeOf(r)],
    ['Affiliate', affiliate],
    ['Raised by', r.requestedBy],
    ['Raised on', day(r.requestedAt)],
    ['Status', r.status],
    ...(r.status !== 'Pending'
      ? ([
          ['Decided by', r.decidedBy ?? '-'],
          ['Decided on', day(r.decidedAt)],
        ] as Array<[string, string]>)
      : []),
  ];
  return (
    <Drawer
      title={r.entityLabel}
      description={`${typeOf(r)} · ${affiliate}`}
      onClose={onClose}
      wide
      footer={
        blocked ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
            <span className="font-bold text-navy-900">You can&rsquo;t decide this: </span>
            {blocked}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="decision-note" className="mb-1 block text-[12px] font-bold text-navy-900">
                {rejecting ? 'Reason for rejecting (required)' : 'Note (optional)'}
              </label>
              <textarea
                id="decision-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={rejecting ? 'Tell the requester what to fix.' : 'Anything the requester should know.'}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {rejecting ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRejecting(false)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !note.trim()}
                    onClick={() => void onDecide('Rejected', note)}
                    className="rounded-lg bg-danger px-4 py-2 text-[13px] font-bold text-white hover:bg-danger/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Confirm reject
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejecting(true)}
                    className="rounded-lg border border-danger/40 px-4 py-2 text-[13px] font-bold text-danger hover:bg-danger-bg disabled:opacity-40"
                  >
                    Reject…
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDecide('Approved', note)}
                    className="rounded-lg bg-success px-4 py-2 text-[13px] font-bold text-white hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? 'Saving…' : 'Approve'}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-gray-50 p-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className="mt-0.5 text-[13px] text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">What changes</h3>
          <WhatChanges request={r} allRuns={allRuns} affiliates={affiliates} readiness={readiness} />
          {r.module === 'Business Rules' && r.entityVersion && (
            <RuleVersionDiff ruleId={r.entityId} version={r.entityVersion} />
          )}
          {r.module !== 'Business Rules' &&
            r.module !== 'Runs' &&
            r.module !== 'Limits' &&
            r.module !== 'Position Snapshot' &&
            !(r.module === 'Affiliates' && r.action === 'Activate') && (
              <p className="mt-2 text-[13px] text-gray-600">
                {r.action} · {r.entityType}
              </p>
            )}
        </section>
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Why</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{r.summary || '-'}</p>
        </section>
        {r.decisionNote && (
          <section>
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Decision note</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{r.decisionNote}</p>
          </section>
        )}
      </div>
    </Drawer>
  );
}

const META_KEYS = new Set([
  'id',
  'kind',
  'name',
  'description',
  'folder',
  'accessType',
  'affiliateCode',
  'version',
  'isActive',
  'createdBy',
  'createdAt',
  'updatedBy',
  'updatedAt',
]);

/** A value as a person reads it: numbers grouped, yes/no, lists joined - never "settings" or "3 items". */
function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-GB') : String(v);
  if (Array.isArray(v)) return v.length === 0 ? '-' : v.map((x) => showValue(x)).join(', ');
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${label(k)}: ${showValue(x)}`)
      .join(' · ');
  return String(v);
}

const label = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bpct\b/i, '%');

const isRowList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));

const isMap = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length > 0 &&
  Object.values(v).every((x) => x === null || typeof x !== 'object');

/** A list of rows, or a key -> value map turned into rows - whatever a rule keeps as a table. */
function asRows(v: unknown): Record<string, unknown>[] | null {
  if (isRowList(v)) return v;
  if (isMap(v)) return Object.entries(v).map(([key, value]) => ({ key, value }));
  return null;
}

/**
 * The proposed version in full, as tables, with what differs from the previous version marked: single
 * settings as Before / Now, and every list (cost pools, risk weights, products…) as its own table.
 */
function RuleVersionDiff({ ruleId, version }: { ruleId: string; version: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ruleVersionDiff', ruleId, version],
    queryFn: async () => {
      const current =
        (await repository.getRuleVersion<RuleMeta>(ruleId, version)) ??
        (await repository.getRule<RuleMeta>(ruleId).then((r) => (r?.version === version ? r : null)));
      const previous = version > 1 ? await repository.getRuleVersion<RuleMeta>(ruleId, version - 1) : null;
      return { current, previous };
    },
  });
  if (isLoading) return <p className="mt-2 text-[12px] text-gray-400">Loading the proposed settings…</p>;
  if (!data?.current) return null;
  const cur = data.current as unknown as Record<string, unknown>;
  const prev = (data.previous ?? null) as unknown as Record<string, unknown> | null;
  const keys = Object.keys(cur).filter((k) => !META_KEYS.has(k));
  const lists = keys.filter((k) => asRows(cur[k]) !== null || asRows(prev?.[k]) !== null);
  const singles = keys.filter((k) => !lists.includes(k));
  const differs = (k: string) => !!prev && JSON.stringify(cur[k]) !== JSON.stringify(prev[k]);

  return (
    <div className="mt-3 space-y-4">
      {singles.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-bold">Setting</th>
                {prev && <th className="px-3 py-2 font-bold">Before (v{version - 1})</th>}
                <th className="px-3 py-2 font-bold">{prev ? `Now (v${version})` : 'Value'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {singles.map((k) => (
                <tr key={k} className={differs(k) ? 'bg-warning-bg/60' : undefined}>
                  <td className="px-3 py-2 font-bold text-navy-900">{label(k)}</td>
                  {prev && <td className="px-3 py-2 text-gray-500">{showValue(prev[k])}</td>}
                  <td className="px-3 py-2 text-navy-900">{showValue(cur[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lists.map((k) => (
        <RowListTable
          key={k}
          title={label(k)}
          rows={asRows(cur[k]) ?? []}
          before={prev ? (asRows(prev[k]) ?? []) : null}
        />
      ))}
      {!prev && version === 1 && (
        <p className="text-[12px] text-gray-500">A new assumption - there is no earlier version to compare with.</p>
      )}
    </div>
  );
}

/** One list of a rule as a table: every row of the proposed version, marked New / Changed against the one before. */
function RowListTable({
  title,
  rows,
  before,
}: {
  title: string;
  rows: Record<string, unknown>[];
  before: Record<string, unknown>[] | null;
}) {
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => c !== 'id');
  const beforeJson = new Set((before ?? []).map((r) => JSON.stringify(r)));
  const removed = before ? before.length - before.filter((b) => rows.some((r) => sameRow(r, b))).length : 0;
  return (
    <div>
      <p className="mb-1 text-[12px] font-bold text-navy-900">
        {title} <span className="font-normal text-gray-400">({rows.length})</span>
        {removed > 0 && <span className="ml-2 font-normal text-danger">{removed} removed</span>}
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              {before && <th className="px-3 py-2" />}
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-bold">
                  {label(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => {
              const mark = !before
                ? null
                : beforeJson.has(JSON.stringify(r))
                  ? null
                  : before.some((b) => sameRow(r, b))
                    ? 'Changed'
                    : 'New';
              return (
                <tr key={i} className={mark ? 'bg-warning-bg/60' : undefined}>
                  {before && <td className="px-3 py-2 text-[11px] font-bold text-warning">{mark ?? ''}</td>}
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 text-navy-900">
                      {showValue(r[c])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Same row in two versions: same id, or the same first identifying field (name, code, product…). */
function sameRow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.id !== undefined || b.id !== undefined) return a.id === b.id;
  const key = Object.keys(a).find((k) => typeof a[k] === 'string');
  return key !== undefined && a[key] === b[key];
}

// ─── Other request (free-text) ─────────────────────────────────────────────

function OtherRequestForm({ affiliates, onClose }: { affiliates: Affiliate[]; onClose: () => void }) {
  const { user } = useAuth();
  const save = approvals.useSave();
  const [draft, setDraft] = useState({
    module: '',
    entityLabel: '',
    action: 'Update' as ApprovalRequest['action'],
    summary: '',
    affiliateCode: '',
  });
  const field =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none';
  const raise = async () => {
    if (!user || !draft.module || !draft.entityLabel || !draft.summary) return;
    await save.mutateAsync(
      newApprovalRequest(
        {
          module: draft.module,
          entityType: draft.module,
          entityId: newId('ENT'),
          entityLabel: draft.entityLabel,
          action: draft.action,
          summary: draft.summary,
          affiliateCode: draft.affiliateCode || null,
        },
        user,
      ),
    );
    onClose();
  };
  return (
    <Drawer
      title="Other request"
      description="For a change that has no approval button of its own. Someone else must decide it."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void raise()}
            disabled={!draft.module || !draft.entityLabel || !draft.summary || save.isPending}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send request
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="apr-module" className="mb-1 block text-[12px] font-bold text-navy-900">
            Area
          </label>
          <input
            id="apr-module"
            value={draft.module}
            onChange={(e) => setDraft((d) => ({ ...d, module: e.target.value }))}
            placeholder="e.g. Limits"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="apr-label" className="mb-1 block text-[12px] font-bold text-navy-900">
            What is being changed
          </label>
          <input
            id="apr-label"
            value={draft.entityLabel}
            onChange={(e) => setDraft((d) => ({ ...d, entityLabel: e.target.value }))}
            placeholder="e.g. Nigeria LCR internal limit"
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="apr-action" className="mb-1 block text-[12px] font-bold text-navy-900">
              Action
            </label>
            <select
              id="apr-action"
              value={draft.action}
              onChange={(e) => setDraft((d) => ({ ...d, action: e.target.value as ApprovalRequest['action'] }))}
              className={field}
            >
              {ACTIONS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="apr-affiliate" className="mb-1 block text-[12px] font-bold text-navy-900">
              Affiliate
            </label>
            <select
              id="apr-affiliate"
              value={draft.affiliateCode}
              onChange={(e) => setDraft((d) => ({ ...d, affiliateCode: e.target.value }))}
              className={field}
            >
              <option value="">Group-wide</option>
              {affiliates
                .filter((a) => a.code !== 'GROUP')
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="apr-summary" className="mb-1 block text-[12px] font-bold text-navy-900">
            Why
          </label>
          <textarea
            id="apr-summary"
            rows={3}
            value={draft.summary}
            onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
            className={field}
          />
        </div>
        {save.error && (
          <p role="alert" className="text-[12px] text-danger">
            {save.error instanceof Error ? save.error.message : String(save.error)}
          </p>
        )}
      </div>
    </Drawer>
  );
}

// ─── Runs ──────────────────────────────────────────────────────────────────

/** The approver of a run's sign-off may not be the person who executed it (maker-checker on the run itself). */
function runSignOffBlockedReason(
  request: ApprovalRequest,
  runs: ProcessRun[],
  user: { id: string } | null | undefined,
): string | null {
  if (request.module !== 'Runs' || request.action !== 'SignOff' || !user) return null;
  const run = runs.find((r) => r.id === request.entityId);
  if (run?.createdById && run.createdById === user.id) {
    return 'You ran this run. Segregation of duties means someone else must sign it off.';
  }
  return null;
}

/** What a checker is signing off: scope, date, version and the headline figures from the run itself. */
function RunSignOffSummary({
  request,
  allRuns,
  affiliates,
}: {
  request: ApprovalRequest;
  allRuns: ProcessRun[];
  affiliates: Array<{ code: string; name: string }>;
}) {
  const run = allRuns.find((r) => r.id === request.entityId) ?? null;
  const { data: results = [] } = useRunResults(run ? run.id : null);
  if (!run)
    return <p className="mt-3 text-[12px] text-gray-400">Run {request.entityId} is not visible in your scope.</p>;
  const name =
    run.affiliateCode === 'GROUP'
      ? 'Ecobank Group'
      : (affiliates.find((a) => a.code === run.affiliateCode)?.name ?? run.affiliateCode);
  const heads = runHeadlines(results);
  const pick = (label: string) => heads.find((h) => h.label === label)?.value ?? null;
  const lcr = pick('LCR');
  const nsfr = pick('NSFR');
  const status = signOffStatusOf(run);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-navy-50 px-3 py-2 text-[13px] text-navy-900">
      <span className="font-bold">{name}</span>
      <span>
        as of <span className="font-mono">{formatDate(run.asOfDate)}</span>
      </span>
      <span className="font-mono font-bold">v{versionOf(run, allRuns)}</span>
      <span>
        LCR <span className="font-mono font-bold">{lcr === null ? '-' : formatPct(lcr, 1)}</span>
      </span>
      <span>
        NSFR <span className="font-mono font-bold">{nsfr === null ? '-' : formatPct(nsfr, 1)}</span>
      </span>
      <span className="text-gray-500">run by {run.createdBy}</span>
      <span className="text-gray-500">· now {SIGN_OFF_LABEL[status].toLowerCase()}</span>
      <Link href={`/execution/history?run=${run.id}`} className="font-bold underline hover:no-underline">
        Open run
      </Link>
    </div>
  );
}
