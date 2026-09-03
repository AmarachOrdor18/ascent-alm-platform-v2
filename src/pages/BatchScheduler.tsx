import { useMemo, useState, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useHolidayCalendars } from '@/lib/hooks';
import { useRuns } from '@/lib/runHooks';
import { useDeleteSchedule, useFireOccurrence, useSaveSchedule, useSchedules } from '@/lib/scheduleHooks';
import { describeFrequency, dueOccurrences, nextOccurrence, WEEKDAY_NAMES } from '@/engine/schedule';
import { toIso } from '@/engine/dates';
import type { RunSchedule, ScheduleFrequency } from '@/engine/types';

const FREQUENCIES: ScheduleFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

export function BatchScheduler() {
  const { hasPermission, user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: schedules = [], isLoading } = useSchedules(affiliateCode);
  const { data: runs = [] } = useRuns(affiliateCode);
  const { data: calendars = [] } = useHolidayCalendars();
  const save = useSaveSchedule();
  const remove = useDeleteSchedule();
  const fire = useFireOccurrence();

  const canEdit = hasPermission('run.execute');
  const today = toIso(new Date());

  const [editing, setEditing] = useState<RunSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedRuns = runs.filter((r) => r.status === 'Completed');

  const backlogs = useMemo(
    () =>
      schedules.map((s) => ({
        schedule: s,
        backlog: dueOccurrences(s, today, calendars.find((c) => c.id === s.holidayCalendarId) ?? null),
      })),
    [schedules, calendars, today],
  );

  const totalOverdue = backlogs.reduce((n, b) => n + b.backlog.overdue.length, 0);

  const blankSchedule = (): RunSchedule => ({
    id: `SCH-${Date.now().toString(36).toUpperCase()}`,
    name: 'New schedule',
    templateRunId: completedRuns[0]?.id ?? '',
    affiliateCode: affiliateCode === 'GROUP' ? (affiliates.find((a) => a.code !== 'GROUP')?.code ?? 'GROUP') : affiliateCode,
    frequency: 'Monthly',
    dayOfMonth: 'last',
    dayOfWeek: 1,
    holidayCalendarId: null,
    startDate: today,
    endDate: null,
    isActive: true,
    lastRunDate: null,
    lastRunId: null,
    createdBy: user?.name ?? 'unknown',
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
  });

  const handleFire = async (schedule: RunSchedule, occurrenceDate: string) => {
    setError(null);
    try {
      const outcome = await fire.mutateAsync({ schedule, occurrenceDate });
      if (outcome.run.status !== 'Completed') {
        setError(outcome.run.errorLog[0]?.message ?? 'The run did not complete. It stays in the backlog.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <ModuleHeader
        title="Batch Scheduler"
        description="Recurring run definitions - what runs, for whom, and how often."
        asOfDate={null}
        scope={affiliates.find((a) => a.code === affiliateCode)?.name ?? 'All affiliates'}
        metrics={[
          { label: 'Schedules', value: String(schedules.length), about: 'Recurring run definitions configured for this scope.' },
          { label: 'Active', value: String(schedules.filter((s) => s.isActive).length), about: 'Schedules currently live - a paused schedule stops producing new occurrences without being deleted.' },
          {
            label: 'Occurrences overdue',
            value: String(totalOverdue),
            tone: totalOverdue > 0 ? 'warning' : 'success',
            about: 'Reporting dates a schedule should have produced by now but has not - each is a separate date, not collapsed into the next run.',
          },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setEditing(blankSchedule())}
            disabled={!canEdit || completedRuns.length === 0}
            title={completedRuns.length === 0 ? 'A schedule needs a completed run to use as its template' : undefined}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            New schedule
          </button>
        }
      />

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/5 p-4 text-[12px] text-danger">{error}</div>
      )}

      {completedRuns.length === 0 && (
        <EmptyState cta={{ label: 'Go to Process Run', href: '/runs/new' }} className="mb-6">
          A schedule repeats an existing run. Compose and execute one on the Process Run screen first, then come back
          and put it on a cycle.
        </EmptyState>
      )}

      {isLoading ? (
        <p className="text-[12px] text-gray-500">Loading schedules…</p>
      ) : schedules.length === 0 ? (
        completedRuns.length > 0 && <EmptyState>No schedules yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {backlogs.map(({ schedule, backlog }) => {
            const template = runs.find((r) => r.id === schedule.templateRunId);
            const calendar = calendars.find((c) => c.id === schedule.holidayCalendarId);

            return (
              <article key={schedule.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-bold text-navy-900">{schedule.name}</h2>
                      <StatusBadge
                        status={schedule.isActive ? 'Active' : 'Paused'}
                        tone={schedule.isActive ? 'success' : 'neutral'}
                      />
                      {backlog.isOverdue && (
                        <StatusBadge status={`${backlog.overdue.length} overdue`} tone="warning" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {describeFrequency(schedule)} · {schedule.affiliateCode} ·{' '}
                      {template ? `repeats “${template.name}”` : (
                        <span className="text-danger">template run missing</span>
                      )}
                      {calendar && ` · ${calendar.name} calendar`}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {schedule.lastRunDate ? `Last produced ${schedule.lastRunDate}` : 'Never produced'}
                      {backlog.nextDue && ` · next due ${backlog.nextDue}`}
                      {!backlog.nextDue && schedule.isActive && ' · no further occurrences'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void save.mutateAsync({ ...schedule, isActive: !schedule.isActive })}
                      disabled={!canEdit}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                    >
                      {schedule.isActive ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(schedule)}
                      disabled={!canEdit}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove.mutateAsync(schedule.id)}
                      disabled={!canEdit}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-danger hover:border-danger disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {backlog.overdue.length > 0 && (
                  <div className="mt-4 rounded-lg bg-warning/5 p-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-warning">
                      Missed occurrences
                    </p>
                    <p className="mb-3 text-[11px] leading-relaxed text-gray-600">
                      Each of these is a separate reporting date. They do not collapse into one - June&apos;s pack is
                      not satisfied by August&apos;s.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {backlog.overdue.map((date) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => void handleFire(schedule, date)}
                          disabled={!canEdit || fire.isPending || !template}
                          className="rounded-lg border border-warning/40 bg-white px-3 py-1.5 font-mono text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                        >
                          Run {date}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <ScheduleForm
          schedule={editing}
          runs={completedRuns.map((r) => ({ id: r.id, name: r.name }))}
          calendars={calendars.map((c) => ({ id: c.id, name: c.name }))}
          affiliateCodes={affiliates.filter((a) => a.code !== 'GROUP').map((a) => a.code)}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            await save.mutateAsync(next);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ScheduleForm({
  schedule,
  runs,
  calendars,
  affiliateCodes,
  onCancel,
  onSave,
}: {
  schedule: RunSchedule;
  runs: Array<{ id: string; name: string }>;
  calendars: Array<{ id: string; name: string }>;
  affiliateCodes: string[];
  onCancel: () => void;
  onSave: (schedule: RunSchedule) => Promise<void>;
}) {
  const [draft, setDraft] = useState(schedule);
  const set = (patch: Partial<RunSchedule>) => setDraft((d) => ({ ...d, ...patch }));

  const invalid =
    draft.name.trim() === ''
      ? 'A schedule needs a name.'
      : draft.templateRunId === ''
        ? 'Choose the run this schedule repeats.'
        : draft.endDate !== null && draft.endDate < draft.startDate
          ? 'The end date falls before the start date.'
          : null;

  const preview = dueOccurrencesPreview(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[14px] font-bold text-navy-900">Schedule</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field id="sch-name" label="Name">
            <input
              id="sch-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className={INPUT}
            />
          </Field>

          <Field id="sch-template" label="Repeats this run">
            <select
              id="sch-template"
              value={draft.templateRunId}
              onChange={(e) => set({ templateRunId: e.target.value })}
              className={INPUT}
            >
              <option value="">Choose a run…</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="sch-affiliate" label="Affiliate">
            <select
              id="sch-affiliate"
              value={draft.affiliateCode}
              onChange={(e) => set({ affiliateCode: e.target.value })}
              className={INPUT}
            >
              {affiliateCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <Field id="sch-freq" label="Frequency">
            <select
              id="sch-freq"
              value={draft.frequency}
              onChange={(e) => set({ frequency: e.target.value as ScheduleFrequency })}
              className={INPUT}
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>

          {draft.frequency === 'Weekly' && (
            <Field id="sch-dow" label="Day of week">
              <select
                id="sch-dow"
                value={draft.dayOfWeek}
                onChange={(e) => set({ dayOfWeek: Number(e.target.value) })}
                className={INPUT}
              >
                {WEEKDAY_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(draft.frequency === 'Monthly' || draft.frequency === 'Quarterly') && (
            <Field id="sch-dom" label="Day of month">
              <select
                id="sch-dom"
                value={draft.dayOfMonth === 'last' ? 'last' : String(draft.dayOfMonth)}
                onChange={(e) => set({ dayOfMonth: e.target.value === 'last' ? 'last' : Number(e.target.value) })}
                className={INPUT}
              >
                <option value="last">Last day of the month</option>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field id="sch-cal" label="Holiday calendar">
            <select
              id="sch-cal"
              value={draft.holidayCalendarId ?? ''}
              onChange={(e) => set({ holidayCalendarId: e.target.value || null })}
              className={INPUT}
            >
              <option value="">None - calendar days</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="sch-start" label="Starts">
            <input
              id="sch-start"
              type="date"
              value={draft.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className={INPUT}
            />
          </Field>

          <Field id="sch-end" label="Ends (optional)">
            <input
              id="sch-end"
              type="date"
              value={draft.endDate ?? ''}
              onChange={(e) => set({ endDate: e.target.value || null })}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Next occurrences</p>
          <p className="font-mono text-[12px] text-navy-900">
            {preview.length > 0 ? preview.join(' · ') : 'None - check the start and end dates.'}
          </p>
        </div>

        {invalid && <p className="mt-3 text-[11px] font-bold text-danger">{invalid}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={invalid !== null}
            onClick={() => void onSave(draft)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Save schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// Unadjusted recurrence - no holiday roll - so the preview matches exactly what was entered; the list screen applies the calendar.
function dueOccurrencesPreview(schedule: RunSchedule): string[] {
  const dates: string[] = [];
  let cursor = schedule.lastRunDate ?? schedule.startDate;
  for (let i = 0; i < 4; i += 1) {
    const next = nextOccurrence(schedule, cursor);
    if (next === null) break;
    dates.push(next);
    cursor = next;
  }
  return dates;
}

const INPUT =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-gray-600">
        {label}
      </label>
      {children}
    </div>
  );
}
