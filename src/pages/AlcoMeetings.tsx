/**
 * ALCO Meetings — screen 51.
 *
 * Real meetings, stored, editable, with a real run attached as the evidence
 * behind the agenda — "Review Group LCR position" now shows the actual LCR
 * from the linked run, not a number typed into a mock array.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RunPicker } from '@/components/layout/RunPicker';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { meetings, newId } from '@/lib/governanceHooks';
import { useRuns, useRunResults } from '@/lib/runHooks';
import { metricValue, formatMetric } from '@/lib/metrics';
import type { AlcoAction, AlcoMeeting, MeetingStatus } from '@/engine/types';

const STANDARD_AGENDA = [
  'Opening and approval of previous minutes',
  'Group liquidity position (LCR, NSFR)',
  'Interest rate risk position (IRRBB)',
  'Stress testing results',
  'Regulatory compliance status',
  'Affiliate-specific risk discussions',
  'Decisions and action items',
  'Any other business',
];

const STATUS_TONE: Record<MeetingStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  Scheduled: 'warning', Held: 'success', Cancelled: 'neutral',
};

export function AlcoMeetings() {
  const { hasPermission, user } = useAuth();
  const { affiliateCode } = useScope();
  const canEdit = hasPermission('reporting.manage') || hasPermission('run.execute');
  const { data: rows = [], isLoading } = meetings.useList(affiliateCode === 'GROUP' ? undefined : affiliateCode);
  const { data: runs = [] } = useRuns();
  const save = meetings.useSave();
  const remove = meetings.useRemove();

  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [editing, setEditing] = useState<AlcoMeeting | null>(null);

  const upcoming = rows.filter((m) => m.status === 'Scheduled').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const history = rows.filter((m) => m.status !== 'Scheduled').sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const shown = tab === 'upcoming' ? upcoming : history;

  const openActions = rows.flatMap((m) => m.actions).filter((a) => a.status === 'Open').length;
  const openDecisionsTotal = rows.reduce((s, m) => s + m.decisions.length, 0);

  const blank = (): AlcoMeeting => ({
    id: newId('ALCO'),
    title: `ALCO — ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
    scheduledFor: new Date().toISOString().slice(0, 10),
    status: 'Scheduled',
    chair: user?.name ?? '',
    attendees: user?.name ? [user.name] : [],
    agenda: [...STANDARD_AGENDA],
    runId: null,
    minutes: '',
    decisions: [],
    actions: [],
    affiliateCode: affiliateCode === 'GROUP' ? null : affiliateCode,
  });

  return (
    <>
      <ModuleHeader
        title="ALCO Meetings"
        description="Agenda, minutes, decisions and actions — each meeting can point at the run its figures came from."
        asOfDate={null}
        scope={affiliateCode === 'GROUP' ? 'All scopes' : affiliateCode}
        metrics={[
          { label: 'Upcoming', value: String(upcoming.length), tone: upcoming.length > 0 ? 'warning' : 'neutral' },
          { label: 'Held', value: String(history.length) },
          { label: 'Open actions', value: String(openActions), tone: openActions > 0 ? 'warning' : 'success' },
          { label: 'Decisions recorded', value: String(openDecisionsTotal) },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setEditing(blank())}
            disabled={!canEdit}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Schedule meeting
          </button>
        }
      />

      <div className="mb-6 flex gap-2">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-[12px] font-bold capitalize ${
              tab === t ? 'bg-navy-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700'
            }`}
          >
            {t} ({t === 'upcoming' ? upcoming.length : history.length})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-[12px] text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[12px] text-gray-500">
          No {tab} meetings. Schedule one to see its agenda and, once a run is attached, its figures here.
        </p>
      ) : (
        <div className="space-y-4">
          {shown.map((m) => (
            <MeetingCard key={m.id} meeting={m} canEdit={canEdit} onEdit={() => setEditing(m)} onDelete={() => void remove.mutateAsync(m.id)} />
          ))}
        </div>
      )}

      {editing && (
        <MeetingEditor
          meeting={editing}
          runs={runs}
          onCancel={() => setEditing(null)}
          onSave={async (m) => {
            await save.mutateAsync(m);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function MeetingCard({
  meeting, canEdit, onEdit, onDelete,
}: { meeting: AlcoMeeting; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const { data: results = [] } = useRunResults(meeting.runId);
  const lcr = metricValue(results, 'lcrPercent');
  const nsfr = metricValue(results, 'nsfrPercent');

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold text-navy-900">{meeting.title}</h2>
            <StatusBadge status={meeting.status} tone={STATUS_TONE[meeting.status]} />
          </div>
          <p className="mt-1 text-[11px] text-gray-500">
            {meeting.scheduledFor} · chaired by {meeting.chair || 'unassigned'} · {meeting.attendees.length} attendee(s)
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} disabled={!canEdit} className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40">
            Edit
          </button>
          <button type="button" onClick={onDelete} disabled={!canEdit} className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-danger hover:border-danger disabled:opacity-40">
            Delete
          </button>
        </div>
      </div>

      {meeting.runId && (
        <div className="mt-3 flex flex-wrap gap-4 rounded-lg bg-gray-50 px-3 py-2 text-[11px]">
          <span><span className="text-gray-400">LCR</span> <span className="font-mono font-bold">{formatMetric(lcr, 'lcrPercent')}</span></span>
          <span><span className="text-gray-400">NSFR</span> <span className="font-mono font-bold">{formatMetric(nsfr, 'nsfrPercent')}</span></span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Agenda</p>
          <ol className="space-y-1 text-[12px] text-gray-700">
            {meeting.agenda.map((item, i) => <li key={i}>{i + 1}. {item}</li>)}
          </ol>
        </div>
        <div className="space-y-3">
          {meeting.decisions.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Decisions</p>
              <ul className="space-y-1 text-[12px] text-gray-700">
                {meeting.decisions.map((d, i) => <li key={i}>· {d}</li>)}
              </ul>
            </div>
          )}
          {meeting.actions.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Actions</p>
              <ul className="space-y-1 text-[12px] text-gray-700">
                {meeting.actions.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span>{a.description} — {a.owner}{a.dueDate ? ` (due ${a.dueDate})` : ''}</span>
                    <StatusBadge status={a.status} tone={a.status === 'Open' ? 'warning' : a.status === 'Closed' ? 'success' : 'neutral'} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function MeetingEditor({
  meeting, runs, onCancel, onSave,
}: { meeting: AlcoMeeting; runs: ReturnType<typeof useRuns>['data']; onCancel: () => void; onSave: (m: AlcoMeeting) => Promise<void> }) {
  const [draft, setDraft] = useState(meeting);
  const set = (patch: Partial<AlcoMeeting>) => setDraft((d) => ({ ...d, ...patch }));
  const [newAction, setNewAction] = useState({ description: '', owner: '', dueDate: '' });
  const [newDecision, setNewDecision] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[14px] font-bold text-navy-900">{draft.title || 'New meeting'}</h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Title"><input value={draft.title} onChange={(e) => set({ title: e.target.value })} className={INPUT} /></Field>
          <Field label="Date"><input type="date" value={draft.scheduledFor} onChange={(e) => set({ scheduledFor: e.target.value })} className={INPUT} /></Field>
          <Field label="Chair"><input value={draft.chair} onChange={(e) => set({ chair: e.target.value })} className={INPUT} /></Field>
          <Field label="Status">
            <select value={draft.status} onChange={(e) => set({ status: e.target.value as MeetingStatus })} className={INPUT}>
              {(['Scheduled', 'Held', 'Cancelled'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-4">
          <RunPicker runs={runs ?? []} value={draft.runId} onChange={(runId) => set({ runId })} />
        </div>

        <div className="mt-4">
          <Field label="Attendees (comma-separated)">
            <input
              value={draft.attendees.join(', ')}
              onChange={(e) => set({ attendees: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-medium text-gray-600">Decisions</p>
          {draft.decisions.map((d, i) => (
            <div key={i} className="mb-1 flex items-center gap-2">
              <span className="flex-1 rounded bg-gray-50 px-2 py-1 text-[12px]">{d}</span>
              <button type="button" onClick={() => set({ decisions: draft.decisions.filter((_, j) => j !== i) })} className="text-[11px] font-bold text-danger">
                Remove
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newDecision} onChange={(e) => setNewDecision(e.target.value)} placeholder="Record a decision" className={INPUT} />
            <button
              type="button"
              onClick={() => { if (newDecision.trim()) { set({ decisions: [...draft.decisions, newDecision.trim()] }); setNewDecision(''); } }}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
            >
              Add
            </button>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[11px] font-medium text-gray-600">Actions</p>
          {draft.actions.map((a) => (
            <div key={a.id} className="mb-1 flex items-center gap-2 text-[12px]">
              <span className="flex-1 rounded bg-gray-50 px-2 py-1">{a.description} — {a.owner}{a.dueDate ? ` (due ${a.dueDate})` : ''}</span>
              <select
                value={a.status}
                onChange={(e) => set({ actions: draft.actions.map((x) => x.id === a.id ? { ...x, status: e.target.value as AlcoAction['status'] } : x) })}
                className="rounded border border-gray-200 px-1 py-1 text-[11px]"
              >
                {(['Open', 'Closed', 'Carried forward'] as const).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" onClick={() => set({ actions: draft.actions.filter((x) => x.id !== a.id) })} className="text-[11px] font-bold text-danger">
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <input value={newAction.description} onChange={(e) => setNewAction({ ...newAction, description: e.target.value })} placeholder="Action" className="flex-1 min-w-[140px] rounded border border-gray-200 px-2 py-1.5 text-[12px]" />
            <input value={newAction.owner} onChange={(e) => setNewAction({ ...newAction, owner: e.target.value })} placeholder="Owner" className="w-28 rounded border border-gray-200 px-2 py-1.5 text-[12px]" />
            <input type="date" value={newAction.dueDate} onChange={(e) => setNewAction({ ...newAction, dueDate: e.target.value })} className="rounded border border-gray-200 px-2 py-1.5 text-[12px]" />
            <button
              type="button"
              onClick={() => {
                if (!newAction.description.trim()) return;
                set({ actions: [...draft.actions, { id: newId('ACT'), description: newAction.description, owner: newAction.owner, dueDate: newAction.dueDate || null, status: 'Open' }] });
                setNewAction({ description: '', owner: '', dueDate: '' });
              }}
              className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
            >
              Add
            </button>
          </div>
        </div>

        <div className="mt-4">
          <Field label="Minutes">
            <textarea rows={4} value={draft.minutes} onChange={(e) => set({ minutes: e.target.value })} className={INPUT} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">Cancel</button>
          <button type="button" onClick={() => void onSave(draft)} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">Save meeting</button>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[11px] font-medium text-gray-600">{label}</label>{children}</div>;
}
