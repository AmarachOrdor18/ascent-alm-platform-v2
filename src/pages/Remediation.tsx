// Control issues (/controls/remediation): a board of every control issue, grouped Open → In progress →
// Verified → Closed. The six underlying stages are kept (Open covers Identified, Assessed and Planned) and
// shown on each card. Clicking a card opens a side panel (?issue=<id>) with its timeline and the one next
// action. Closing is maker-checker: the issue's owner can never close it.
import { useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { remediation, newId } from '@/lib/governanceHooks';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RemediationIssue, RemediationStage, Severity } from '@/engine/types';

const STAGES: RemediationStage[] = ['Identified', 'Assessed', 'Planned', 'In Progress', 'Verified', 'Closed'];
const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_TONE: Record<Severity, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Low: 'neutral',
  Medium: 'warning',
  High: 'danger',
  Critical: 'danger',
};

/** The board's four columns and the stages each one holds. */
const COLUMNS: Array<{ key: string; title: string; hint: string; stages: RemediationStage[] }> = [
  {
    key: 'open',
    title: 'Open',
    hint: 'Logged, being assessed or planned',
    stages: ['Identified', 'Assessed', 'Planned'],
  },
  { key: 'progress', title: 'In progress', hint: 'The fix is being worked on', stages: ['In Progress'] },
  { key: 'verified', title: 'Verified', hint: 'Fix checked - waiting to be closed', stages: ['Verified'] },
  { key: 'closed', title: 'Closed', hint: 'Closed by someone other than the owner', stages: ['Closed'] },
];

// What "moving to this stage" means - shown on the next-action button so the click's effect is plain.
const STAGE_MEANING: Record<RemediationStage, string> = {
  Identified: 'The issue has been logged. No investigation yet.',
  Assessed: 'The cause and impact are understood.',
  Planned: 'A fix and an owner are agreed.',
  'In Progress': 'Work on the fix has started.',
  Verified: 'The fix has been checked and works.',
  Closed: 'Confirmed resolved by someone other than the owner.',
};

const TODAY = new Date().toISOString().slice(0, 10);
const isOverdue = (c: RemediationIssue) => c.stage !== 'Closed' && !!c.dueDate && c.dueDate < TODAY;
const when = (iso: string) => new Date(iso).toLocaleString();

/** Where the issue came from, as a link when the platform knows the source record. */
function sourceLink(c: RemediationIssue): { label: string; href: string } | null {
  if (c.linkedLimitId) return { label: 'Open the limit breach in Limits & breaches', href: '/monitoring' };
  if (c.linkedBatchId)
    return { label: `Open the rejected upload (${c.linkedBatchId}) in Data → History`, href: '/data/loads' };
  return null;
}

export function Remediation() {
  const { user, hasPermission } = useAuth();
  // ALM Analysts, Affiliate Admins and the Organisation Admin run this workflow; viewers and approvers read it.
  const canEdit = hasPermission('data.configure') || hasPermission('risk.configure');
  const { data: affiliates = [] } = useAffiliates();
  const { data: issues = [], isLoading } = remediation.useList();
  const save = remediation.useSave();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const openId = new URLSearchParams(search).get('issue');
  const [text, setText] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [showAllClosed, setShowAllClosed] = useState(false);

  const setOpen = (id: string | null) => {
    const p = new URLSearchParams(search);
    if (id) p.set('issue', id);
    else p.delete('issue');
    const q = p.toString();
    navigate(`${location}${q ? `?${q}` : ''}`, { replace: true });
  };

  const openCount = issues.filter((c) => c.stage !== 'Closed').length;
  const overdueCount = issues.filter(isOverdue).length;
  const closedCount = issues.filter((c) => c.stage === 'Closed').length;

  const closeBlockedReason = (issue: RemediationIssue): string | null => {
    if (!user) return 'Not signed in.';
    if (issue.owner === user.name)
      return 'You own this issue. The owner cannot close it - someone else must confirm the fix.';
    return null;
  };

  const advance = async (issue: RemediationIssue, stage: RemediationStage, note: string) => {
    if (!user || !canEdit) return;
    if (stage === 'Closed' && closeBlockedReason(issue)) return;
    const now = new Date().toISOString();
    await save.mutateAsync({
      ...issue,
      stage,
      closedAt: stage === 'Closed' ? now : issue.closedAt,
      closureApprovedBy: stage === 'Closed' ? user.name : issue.closureApprovedBy,
      updates: [...issue.updates, { at: now, by: user.name, stage, note: note.trim() || `Moved to ${stage}.` }],
    });
  };

  const t = text.trim().toLowerCase();
  const visible = issues.filter(
    (c) => !t || [c.title, c.owner, c.source, c.description].some((v) => v.toLowerCase().includes(t)),
  );
  const open = openId ? (issues.find((c) => c.id === openId) ?? null) : null;
  const affiliateName = (code: string | null) =>
    !code ? 'Group-wide' : (affiliates.find((a) => a.code === code)?.name ?? code);

  return (
    <>
      <ModuleHeader
        title="Control issues"
        description="Every control weakness, from first logged to closed."
        about="The owner fixes it; someone else closes it."
        asOfDate={null}
        metrics={[
          {
            label: 'Not closed',
            value: String(openCount),
            tone: openCount > 0 ? 'warning' : 'success',
            about: 'Issues at any stage short of Closed.',
          },
          {
            label: 'Overdue',
            value: String(overdueCount),
            tone: overdueCount > 0 ? 'danger' : 'neutral',
            about: 'Issues past their due date that are not closed.',
          },
          {
            label: 'Closed',
            value: String(closedCount),
            tone: 'success',
            about: 'Closed by someone other than the owner.',
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            disabled={!canEdit}
            title={canEdit ? undefined : 'Only an ALM Analyst, Affiliate Admin or Organisation Admin can log an issue'}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            New issue
          </button>
        }
      />

      {save.error && (
        <div role="alert" className="mb-4 rounded-lg bg-danger-bg px-4 py-3 text-[13px] text-danger">
          {save.error instanceof Error ? save.error.message : String(save.error)}
        </div>
      )}

      {isLoading ? (
        <p className="text-[13px] text-gray-400">Loading…</p>
      ) : issues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center text-[13px] text-gray-500">
          No control issues yet. Log one with New issue, or raise one from a breach on Limits &amp; breaches or a
          rejected upload.
        </div>
      ) : (
        <>
          <div className="mb-5 max-w-sm">
            <input
              aria-label="Search issues"
              placeholder="Search by title, owner or source…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const all = visible
                .filter((c) => col.stages.includes(c.stage))
                .sort((a, b) => (b.raisedAt ?? '').localeCompare(a.raisedAt ?? ''));
              const cards = col.key === 'closed' && !showAllClosed ? all.slice(0, 8) : all;
              return (
                <section key={col.key} aria-label={col.title} className="flex flex-col rounded-2xl bg-gray-50 p-3">
                  <header className="mb-3 px-1">
                    <h3 className="flex items-center gap-2 text-[13px] font-bold text-navy-900">
                      {col.title}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">{all.length}</span>
                    </h3>
                    <p className="text-[12px] text-gray-500">{col.hint}</p>
                  </header>
                  <ul className="space-y-2">
                    {cards.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setOpen(c.id)}
                          className={cn(
                            'w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-navy-700',
                            isOverdue(c) ? 'border-danger/40' : 'border-gray-100',
                          )}
                        >
                          <p className="text-[13px] font-bold leading-snug text-navy-900">{c.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={c.severity} tone={SEVERITY_TONE[c.severity]} />
                            {col.stages.length > 1 && <StatusBadge status={c.stage} tone="info" />}
                          </div>
                          <p className="mt-2 text-[12px] text-gray-500">Owner: {c.owner}</p>
                          {c.stage !== 'Closed' && (
                            <p className={cn('text-[12px]', isOverdue(c) ? 'font-bold text-danger' : 'text-gray-500')}>
                              {c.dueDate
                                ? `${isOverdue(c) ? '⚠ Overdue - was due' : 'Due'} ${formatDate(c.dueDate)}`
                                : 'No due date'}
                            </p>
                          )}
                          {c.stage === 'Closed' && c.closureApprovedBy && (
                            <p className="text-[12px] text-gray-500">Closed by {c.closureApprovedBy}</p>
                          )}
                          {(c.linkedLimitId || c.linkedBatchId) && (
                            <p className="mt-1 text-[11px] text-gray-400">
                              From {c.linkedLimitId ? 'a limit breach' : 'a rejected upload'}
                            </p>
                          )}
                        </button>
                      </li>
                    ))}
                    {all.length === 0 && (
                      <li className="px-1 py-4 text-center text-[12px] text-gray-400">Nothing here.</li>
                    )}
                  </ul>
                  {col.key === 'closed' && all.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAllClosed((v) => !v)}
                      className="mt-2 text-[12px] font-bold text-navy-700 hover:underline"
                    >
                      {showAllClosed ? 'Show fewer' : `Show all ${all.length}`}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {open && (
        <IssueDrawer
          issue={open}
          affiliate={affiliateName(open.affiliateCode)}
          canEdit={canEdit}
          closeBlocked={closeBlockedReason(open)}
          busy={save.isPending}
          onClose={() => setOpen(null)}
          onAdvance={(stage, note) => advance(open, stage, note)}
        />
      )}
      {!open && openId && !isLoading && (
        <Drawer title="Issue not found" onClose={() => setOpen(null)}>
          <p className="text-[13px] text-gray-500">This issue does not exist or is outside your scope.</p>
        </Drawer>
      )}

      {newOpen && (
        <NewIssueForm
          affiliates={affiliates}
          canEdit={canEdit}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            setOpen(id);
          }}
        />
      )}
    </>
  );
}

// ─── Side panel ────────────────────────────────────────────────────────────

function StageTracker({ stage }: { stage: RemediationStage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <ol className="flex flex-wrap gap-1">
      {STAGES.map((s, i) => (
        <li
          key={s}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-bold',
            i < idx ? 'bg-success-bg text-success' : i === idx ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-400',
          )}
        >
          {i < idx ? '✓ ' : ''}
          {s}
        </li>
      ))}
    </ol>
  );
}

function IssueDrawer({
  issue,
  affiliate,
  canEdit,
  closeBlocked,
  busy,
  onClose,
  onAdvance,
}: {
  issue: RemediationIssue;
  affiliate: string;
  canEdit: boolean;
  closeBlocked: string | null;
  busy: boolean;
  onClose: () => void;
  onAdvance: (stage: RemediationStage, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const idx = STAGES.indexOf(issue.stage);
  const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1]! : null;
  const blocked = !canEdit
    ? 'Only an ALM Analyst, Affiliate Admin or Organisation Admin can move an issue on.'
    : next === 'Closed'
      ? closeBlocked
      : null;
  const link = sourceLink(issue);
  const facts: Array<[string, string]> = [
    ['Severity', issue.severity],
    ['Owner', issue.owner],
    ['Affiliate', affiliate],
    ['Due', issue.dueDate ? formatDate(issue.dueDate) : 'No due date'],
    ['Raised by', issue.raisedBy],
    ['Raised on', formatDate(issue.raisedAt.slice(0, 10))],
    ...(issue.stage === 'Closed' ? ([['Closed by', issue.closureApprovedBy ?? '-']] as Array<[string, string]>) : []),
  ];
  return (
    <Drawer
      title={issue.title}
      description={`${issue.id} · ${issue.source}`}
      onClose={onClose}
      wide
      footer={
        next ? (
          <div className="space-y-3">
            {blocked ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
                <span className="font-bold text-navy-900">You can&rsquo;t move this on: </span>
                {blocked}
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="issue-note" className="mb-1 block text-[12px] font-bold text-navy-900">
                    Note for the timeline (optional)
                  </label>
                  <input
                    id="issue-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={next === 'Closed' ? 'How you confirmed the fix' : 'What was done'}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-gray-500">{STAGE_MEANING[next]}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAdvance(next, note).then(() => setNote(''))}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {busy ? 'Saving…' : `Advance to ${next}`}
                  </button>
                </div>
              </>
            )}
            {next === 'Closed' && !blocked && (
              <p className="text-[12px] text-gray-400">
                The owner ({issue.owner}) cannot close this - that is why you can.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-success">
            Closed{issue.closureApprovedBy ? ` by ${issue.closureApprovedBy}` : ''}. Nothing more to do.
          </p>
        )
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <StageTracker stage={issue.stage} />
          <p className="text-[13px] text-gray-600">{STAGE_MEANING[issue.stage]}</p>
          {isOverdue(issue) && (
            <p className="text-[13px] font-bold text-danger">⚠ Overdue - it was due {formatDate(issue.dueDate)}.</p>
          )}
        </section>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-gray-50 p-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{k}</dt>
              <dd className="mt-0.5 text-[13px] text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">What is wrong</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
            {issue.description || 'No description recorded.'}
          </p>
          {link && (
            <Link href={link.href} className="mt-2 inline-block text-[13px] font-bold text-navy-700 hover:underline">
              {link.label} →
            </Link>
          )}
        </section>
        <section>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Timeline</h3>
          {issue.updates.length === 0 ? (
            <p className="mt-2 text-[13px] text-gray-400">No history recorded.</p>
          ) : (
            <ol className="mt-3 space-y-3 border-l-2 border-gray-100 pl-4">
              {[...issue.updates].reverse().map((u, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-navy-700"
                    aria-hidden="true"
                  />
                  <p className="text-[13px] text-navy-900">
                    <span className="font-bold">{u.stage}</span> · {u.by}
                  </p>
                  <p className="text-[12px] text-gray-500">{u.note}</p>
                  <p className="text-[11px] text-gray-400">{when(u.at)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  );
}

// ─── New issue ─────────────────────────────────────────────────────────────

function NewIssueForm({
  affiliates,
  canEdit,
  onClose,
  onCreated,
}: {
  affiliates: Array<{ code: string; name: string }>;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const save = remediation.useSave();
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    source: '',
    severity: 'Medium' as Severity,
    owner: '',
    affiliateCode: '',
    dueDate: '',
  });
  const field =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] focus:border-navy-700 focus:outline-none';
  const label = 'mb-1 block text-[12px] font-bold text-navy-900';
  const create = async () => {
    if (!user || !canEdit || !draft.title.trim() || !draft.owner.trim()) return;
    const now = new Date().toISOString();
    const id = newId('CR');
    await save.mutateAsync({
      id,
      title: draft.title.trim(),
      description: draft.description.trim(),
      source: draft.source.trim() || 'Manual entry',
      linkedLimitId: null,
      linkedBatchId: null,
      severity: draft.severity,
      stage: 'Identified',
      owner: draft.owner.trim(),
      affiliateCode: draft.affiliateCode || null,
      raisedBy: user.name,
      raisedAt: now,
      dueDate: draft.dueDate || null,
      closedAt: null,
      closureApprovedBy: null,
      updates: [{ at: now, by: user.name, stage: 'Identified', note: 'Issue logged.' }],
    });
    onCreated(id);
  };
  return (
    <Drawer
      title="New control issue"
      description="It starts as Open. The owner fixes it; someone else closes it."
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
            onClick={() => void create()}
            disabled={!canEdit || !draft.title.trim() || !draft.owner.trim() || save.isPending}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Log issue
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="rem-title" className={label}>
            What is wrong?
          </label>
          <input
            id="rem-title"
            value={draft.title}
            placeholder="e.g. FX rates uploaded without a date"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="rem-desc" className={label}>
            Details (optional)
          </label>
          <textarea
            id="rem-desc"
            rows={3}
            value={draft.description}
            placeholder="How it was found and what it affects."
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rem-owner" className={label}>
              Who will fix it?
            </label>
            <input
              id="rem-owner"
              value={draft.owner}
              placeholder="Full name"
              onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="rem-due" className={label}>
              Due date
            </label>
            <input
              id="rem-due"
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
              className={field}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rem-severity" className={label}>
              How serious?
            </label>
            <select
              id="rem-severity"
              value={draft.severity}
              onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value as Severity }))}
              className={field}
            >
              {SEVERITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rem-affiliate" className={label}>
              Affiliate
            </label>
            <select
              id="rem-affiliate"
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
          <label htmlFor="rem-source" className={label}>
            Where was it found? (optional)
          </label>
          <input
            id="rem-source"
            value={draft.source}
            placeholder="e.g. data upload, audit, limit review"
            onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
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
