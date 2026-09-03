import { useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ChevronRightIcon } from '@/components/icons/Icons';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { remediation, newId } from '@/lib/governanceHooks';
import type { RemediationIssue, RemediationStage, Severity } from '@/engine/types';

const STAGES: RemediationStage[] = ['Identified', 'Assessed', 'Planned', 'In Progress', 'Verified', 'Closed'];
const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_TONE: Record<Severity, 'success' | 'warning' | 'danger'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'danger',
  Critical: 'danger',
};

const STAGE_TONE: Record<RemediationStage, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Identified: 'danger',
  Assessed: 'warning',
  Planned: 'warning',
  'In Progress': 'warning',
  Verified: 'success',
  Closed: 'neutral',
};

// What "moving to this stage" actually means - shown next to the Advance button so the next click's
// effect is stated plainly, not left to guessing from the stage name alone.
const STAGE_MEANING: Record<RemediationStage, string> = {
  Identified: 'The issue has been logged. No investigation has happened yet.',
  Assessed: 'Someone has looked into it and understands the root cause and impact.',
  Planned: 'A remediation plan and owner are in place.',
  'In Progress': 'Work on the fix has actually started.',
  Verified: 'The fix has been checked and confirmed to work.',
  Closed: 'Confirmed resolved by someone other than the owner - the final, checker-approved state.',
};

export function Remediation() {
  const { user, hasPermission } = useAuth();
  // Nobody at all was gated on a role before - any signed-in user, including a read-only viewer, could
  // raise, advance and even close a control issue. Control Tester and Risk Analyst are the roles actually
  // meant to run this workflow, so gate writes on the permissions those two (and Administrator) hold.
  const canEdit = hasPermission('data.configure') || hasPermission('risk.configure');
  const { data: affiliates = [] } = useAffiliates();
  const { data: issues = [], isLoading } = remediation.useList();
  const save = remediation.useSave();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    source: '',
    severity: 'Medium' as Severity,
    owner: '',
    affiliateCode: '',
    dueDate: '',
  });

  const effectiveId = selectedId ?? issues[0]?.id ?? null;
  const selected = issues.find((c) => c.id === effectiveId) ?? null;

  const openCount = issues.filter((c) => c.stage !== 'Closed').length;
  const closedCount = issues.filter((c) => c.stage === 'Closed').length;
  const overdueCount = issues.filter(
    (c) => c.stage !== 'Closed' && c.dueDate && c.dueDate < new Date().toISOString().slice(0, 10),
  ).length;

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    issues,
    10,
    ['title', 'source', 'owner'],
  );

  const currentIndex = selected ? STAGES.indexOf(selected.stage) : -1;
  const nextStage = currentIndex >= 0 && currentIndex < STAGES.length - 1 ? STAGES[currentIndex + 1] : null;

  const closeBlockedReason = (issue: RemediationIssue): string | null => {
    if (!user) return 'Not signed in.';
    if (issue.owner === user.name) {
      return 'You own this issue. Segregation of duties means the owner cannot also verify its closure.';
    }
    return null;
  };

  const advance = async (issue: RemediationIssue, stage: RemediationStage) => {
    if (!user || !canEdit) return;
    if (stage === 'Closed') {
      const blocked = closeBlockedReason(issue);
      if (blocked) return;
    }
    await save.mutateAsync({
      ...issue,
      stage,
      closedAt: stage === 'Closed' ? new Date().toISOString() : issue.closedAt,
      closureApprovedBy: stage === 'Closed' ? user.name : issue.closureApprovedBy,
      updates: [...issue.updates, { at: new Date().toISOString(), by: user.name, stage, note: `Advanced to ${stage}.` }],
    });
  };

  const handleCreate = async () => {
    if (!user || !canEdit || !draft.title || !draft.owner) return;
    await save.mutateAsync({
      id: newId('CR'),
      title: draft.title,
      description: draft.description,
      source: draft.source || 'Manual entry',
      linkedLimitId: null,
      linkedBatchId: null,
      severity: draft.severity,
      stage: 'Identified',
      owner: draft.owner,
      affiliateCode: draft.affiliateCode || null,
      raisedBy: user.name,
      raisedAt: new Date().toISOString(),
      dueDate: draft.dueDate || null,
      closedAt: null,
      closureApprovedBy: null,
      updates: [{ at: new Date().toISOString(), by: user.name, stage: 'Identified', note: 'Issue raised.' }],
    });
    setNewOpen(false);
    setDraft({ title: '', description: '', source: '', severity: 'Medium', owner: '', affiliateCode: '', dueDate: '' });
  };

  function StageTracker({ stage }: { stage: RemediationStage }) {
    const idx = STAGES.indexOf(stage);
    return (
      <div className="flex w-full items-start">
        {STAGES.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={s} className="flex items-center">
              <div className="flex min-w-[64px] flex-col items-center px-1">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                    done ? 'border-success bg-success text-white' : active ? 'border-navy-900 bg-navy-900 text-white' : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  {done ? String.fromCharCode(10003) : i + 1}
                </div>
                <span
                  className={`mt-1.5 text-center text-[9px] font-bold uppercase leading-tight tracking-tight ${active ? 'text-navy-900' : done ? 'text-success' : 'text-gray-400'}`}
                >
                  {s}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`h-0.5 w-4 shrink-0 sm:w-8 ${done ? 'bg-success' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <ModuleHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Control Remediation
            <InfoButton label="How this workflow works">
              Every control weakness moves through the same six stages, left to right: Identified (logged) →
              Assessed (root cause understood) → Planned (a fix and owner are set) → In Progress (work has
              started) → Verified (the fix was checked) → Closed. Closing an issue always needs someone other
              than the owner - the same maker-checker rule used everywhere else in this platform.
            </InfoButton>
          </span>
        }
        description="Every issue tracked from identification to a checker-verified close."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Open', value: String(openCount), tone: openCount > 0 ? 'warning' : 'success', about: 'Issues anywhere in the lifecycle short of Closed.' },
          { label: 'Overdue', value: String(overdueCount), tone: overdueCount > 0 ? 'danger' : 'neutral', about: 'Open issues past their due date.' },
          { label: 'Closed', value: String(closedCount), tone: 'success', about: 'Issues verified and closed - closure requires someone other than the owner to approve it.' },
          { label: 'Total tracked', value: String(issues.length), about: 'Every control issue ever raised, at any stage.' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            disabled={!canEdit}
            title={canEdit ? undefined : 'Only Risk Analyst, Control Tester or Administrator can raise an issue'}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New issue
          </button>
        }
      />

      {isLoading && <p className="text-[12px] text-gray-400">Loading.</p>}

      {!isLoading && issues.length === 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No remediation issues yet. Click "New issue" to log one, or raise one from a breach on Limits and Breaches.
        </div>
      )}

      {!isLoading && selected && (
        <>
          <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">{selected.title}</h3>
                <p className="mt-1 text-[11px] font-medium text-gray-400">
                  {selected.id}. {selected.source}. Owned by {selected.owner}
                </p>
                {selected.linkedBatchId && (
                  <Link
                    href="/data/operations/vintages"
                    className="mt-1 inline-block text-[11px] font-bold text-navy-700 hover:underline"
                  >
                    View batch {selected.linkedBatchId} in Load History →
                  </Link>
                )}
              </div>
              {nextStage && (
                <div className="shrink-0 text-right">
                  <button
                    type="button"
                    disabled={!canEdit || (nextStage === 'Closed' && !!closeBlockedReason(selected))}
                    onClick={() => void advance(selected, nextStage)}
                    className="rounded-lg bg-navy-900 px-3.5 py-2 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Advance to {nextStage}
                  </button>
                  <p className="mt-1.5 max-w-[220px] text-[10px] leading-snug text-gray-400">
                    {!canEdit
                      ? 'Only Risk Analyst, Control Tester or Administrator can advance an issue.'
                      : nextStage === 'Closed' && closeBlockedReason(selected)
                        ? closeBlockedReason(selected)
                        : STAGE_MEANING[nextStage]}
                  </p>
                </div>
              )}
            </div>
            <StageTracker stage={selected.stage} />
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{STAGE_MEANING[selected.stage]}</p>
            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-gray-50 pt-5 md:grid-cols-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Raised</p>
                <p className="mt-0.5 text-[13px] font-bold text-navy-900">{new Date(selected.raisedAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Severity</p>
                <p className="mt-0.5"><StatusBadge status={selected.severity} tone={SEVERITY_TONE[selected.severity]} /></p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Due</p>
                <p className="mt-0.5 text-[13px] font-bold text-navy-900">{selected.dueDate ? new Date(selected.dueDate).toLocaleDateString() : 'None set'}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Closed by</p>
                <p className="mt-0.5 text-[13px] font-bold text-navy-900">{selected.closureApprovedBy ?? 'Not closed'}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-gray-50 pt-4">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-gray-400">Description</p>
              <p className="text-[12px] leading-relaxed text-gray-600">{selected.description || 'No description recorded.'}</p>
            </div>
            {selected.updates.length > 0 && (
              <div className="mt-4 border-t border-gray-50 pt-4">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-gray-400">History</p>
                <ul className="space-y-1.5">
                  {selected.updates.map((u, i) => (
                    <li key={i} className="text-[11px] text-gray-500">
                      <span className="font-mono text-gray-400">{new Date(u.at).toLocaleString()}</span>. {u.by} moved this to {u.stage}. {u.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="table-datagrid-container">
            <div className="border-b border-gray-100 bg-white/50 p-5">
              <div className="mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-navy-900">All control issues</h3>
                <p className="text-[11px] font-medium text-gray-400">Select a row to view its full lifecycle above.</p>
              </div>
              <TableToolbar
                searchValue={search}
                onSearchChange={setSearch}
                exportData={() => issues}
                exportFilename="remediation-issues"
                density={density}
                onDensityChange={setDensity}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="table-datagrid">
                <thead>
                  <tr>
                    <th className="w-8" />
                    <th>Issue</th>
                    <th>Source</th>
                    <th>Owner</th>
                    <th>Stage</th>
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedId(c.id)} className={c.id === effectiveId ? 'is-selected cursor-pointer' : 'cursor-pointer'}>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }}
                          aria-label={`View ${c.title}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:border-navy-700 hover:text-navy-700"
                        >
                          <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </td>
                      <td>
                        <p className="font-bold text-navy-900">{c.title}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-gray-400">{c.id}</p>
                      </td>
                      <td>{c.source}</td>
                      <td>{c.owner}</td>
                      <td>
                        <StatusBadge status={c.stage} tone={STAGE_TONE[c.stage]} />
                      </td>
                      <td>{new Date(c.raisedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
          </div>
        </>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-navy-900">New remediation issue</h3>
            <p className="mb-4 mt-1 text-[11px] leading-relaxed text-gray-500">
              This creates an issue at the Identified stage. It will need an owner other than whoever closes it.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="rem-title" className="mb-1 block text-[11px] text-gray-600">
                  Title
                </label>
                <input
                  id="rem-title"
                  value={draft.title}
                  placeholder="e.g. FX rate uploaded without an as-of date"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="rem-desc" className="mb-1 block text-[11px] text-gray-600">
                  Description
                </label>
                <textarea
                  id="rem-desc"
                  value={draft.description}
                  placeholder="What's wrong, and how it was found."
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="rem-source" className="mb-1 block text-[11px] text-gray-600">
                  Source
                </label>
                <input
                  id="rem-source"
                  value={draft.source}
                  placeholder="e.g. Data Upload, Limits and Breaches, an external audit"
                  onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                  className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rem-severity" className="mb-1 block text-[11px] text-gray-600">
                    Severity
                  </label>
                  <select
                    id="rem-severity"
                    value={draft.severity}
                    onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as Severity }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rem-owner" className="mb-1 block text-[11px] text-gray-600">
                    Owner
                  </label>
                  <input
                    id="rem-owner"
                    value={draft.owner}
                    onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                    placeholder="Name responsible for fixing this - not for closing it"
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rem-affiliate" className="mb-1 block text-[11px] text-gray-600">
                    Affiliate
                  </label>
                  <select
                    id="rem-affiliate"
                    value={draft.affiliateCode}
                    onChange={(e) => setDraft((d) => ({ ...d, affiliateCode: e.target.value }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  >
                    <option value="">Group-wide</option>
                    {affiliates.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rem-due" className="mb-1 block text-[11px] text-gray-600">
                    Due date
                  </label>
                  <input
                    id="rem-due"
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!canEdit || !draft.title || !draft.owner}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Raise issue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
