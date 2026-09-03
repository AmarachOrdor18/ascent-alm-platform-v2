import { useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useHolidayCalendars, useSaveHolidayCalendar } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { addDays } from '@/engine/dates';
import type { HolidayCalendar as Calendar } from '@/engine/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextBusinessDay(calendar: Calendar, date: string): string {
  const holidays = new Set(calendar.holidays.map((h) => h.date));
  let candidate = date;
  // Bounded so a misconfigured calendar (every day a weekend) cannot hang.
  for (let i = 0; i < 30; i += 1) {
    const weekday = new Date(`${candidate}T00:00:00Z`).getUTCDay();
    if (!calendar.weekendDays.includes(weekday) && !holidays.has(candidate)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export function HolidayCalendar({ embedded = false }: { embedded?: boolean } = {}) {
  const { hasPermission } = useAuth();
  const { data: calendars = [], isLoading } = useHolidayCalendars();
  const save = useSaveHolidayCalendar();
  const canEdit = hasPermission('data.configure');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: '', name: '' });
  const [probe, setProbe] = useState('2026-12-25');
  const [creating, setCreating] = useState(false);
  const [newCalendar, setNewCalendar] = useState({ countryCode: '', name: '', weekendDays: [0, 6] as number[] });

  useEffect(() => {
    if (!activeId && calendars.length > 0) setActiveId(calendars[0]!.id);
  }, [calendars, activeId]);

  const active = calendars.find((c) => c.id === activeId) ?? null;

  const handleCreateCalendar = () => {
    const countryCode = newCalendar.countryCode.trim().toUpperCase();
    const name = newCalendar.name.trim();
    if (!countryCode || !name) return;
    const created: Calendar = {
      id: `CAL-${countryCode}`,
      code: `CAL-${countryCode}`,
      name,
      countryCode,
      weekendDays: newCalendar.weekendDays,
      holidays: [],
      isActive: true,
      updatedBy: 'current-user',
      updatedAt: new Date().toISOString(),
    };
    save.mutate(created, {
      onSuccess: () => {
        setActiveId(created.id);
        setCreating(false);
        setNewCalendar({ countryCode: '', name: '', weekendDays: [0, 6] });
      },
    });
  };

  const settlement = useMemo(() => (active ? nextBusinessDay(active, probe) : null), [active, probe]);
  const shifted = settlement !== null && settlement !== probe;

  const handleAdd = () => {
    if (!active || !draft.date || !draft.name.trim()) return;
    const holidays = [
      ...active.holidays.filter((h) => h.date !== draft.date),
      { date: draft.date, name: draft.name.trim(), isException: true },
    ];
    save.mutate(
      { ...active, holidays, updatedBy: 'current-user', updatedAt: new Date().toISOString() },
      { onSuccess: () => setDraft({ date: '', name: '' }) },
    );
  };

  const handleRemove = (date: string) => {
    if (!active) return;
    save.mutate({
      ...active,
      holidays: active.holidays.filter((h) => h.date !== date),
      updatedBy: 'current-user',
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <>
      {!embedded && (
      <ModuleHeader
        title="Holiday Calendar"
        description="Business-day conventions per jurisdiction. A flow due on a holiday settles on the next business day, moving it between buckets at the short end."
        asOfDate={null}
        scope={active?.name ?? 'Group'}
        metrics={[
          {
            label: 'Calendars',
            value: String(calendars.length),
            about: 'Business-day calendars defined, typically one per jurisdiction.',
          },
          {
            label: 'Holidays defined',
            value: active ? String(active.holidays.length) : '-',
            about: 'Dates on the selected calendar that are not business days.',
          },
          {
            label: 'Weekend',
            value: active ? active.weekendDays.map((d) => DAY_NAMES[d]!.slice(0, 3)).join(' & ') : '-',
            about:
              'Which weekdays this jurisdiction treats as non-business days - not every calendar uses Saturday/Sunday.',
          },
          {
            label: 'Exceptions',
            value: active ? String(active.holidays.filter((h) => h.isException).length) : '-',
            about: 'Holidays that move each year (like Eid) rather than falling on a fixed recurring date.',
          },
        ]}
      />
      )}

      <div className="mb-6 flex items-center gap-3">
        <label htmlFor="calendar-picker" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          Calendar
        </label>
        <select
          id="calendar-picker"
          value={activeId ?? ''}
          onChange={(e) => setActiveId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
        >
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isLoading && <span className="text-[12px] text-gray-400">Loading…</span>}
        {canEdit && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto rounded-lg border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-navy-700 hover:bg-navy-50"
          >
            New calendar
          </button>
        )}
      </div>

      {creating && (
        <section className="mb-6 rounded-2xl border border-navy-700 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">New calendar</h2>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="cal-country" className="mb-1 block text-[11px] text-gray-600">Country code</label>
              <input
                id="cal-country"
                value={newCalendar.countryCode}
                onChange={(e) => setNewCalendar({ ...newCalendar, countryCode: e.target.value.toUpperCase() })}
                placeholder="NG"
                className="w-24 rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="cal-name" className="mb-1 block text-[11px] text-gray-600">Name</label>
              <input
                id="cal-name"
                value={newCalendar.name}
                onChange={(e) => setNewCalendar({ ...newCalendar, name: e.target.value })}
                placeholder="Nigeria"
                className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-gray-600">Weekend</span>
              <div className="flex gap-2">
                {DAY_NAMES.map((day, i) => (
                  <label key={day} className="flex items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={newCalendar.weekendDays.includes(i)}
                      onChange={(e) =>
                        setNewCalendar({
                          ...newCalendar,
                          weekendDays: e.target.checked
                            ? [...newCalendar.weekendDays, i]
                            : newCalendar.weekendDays.filter((d) => d !== i),
                        })
                      }
                      className="accent-gold-500"
                    />
                    {day.slice(0, 3)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateCalendar}
              disabled={!newCalendar.countryCode.trim() || !newCalendar.name.trim()}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              Create calendar
            </button>
          </div>
        </section>
      )}

      {active && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Public holidays
              <InfoButton label="Recurring vs exception">
                Recurring holidays fall on the same pattern every year. Exceptions are dates added directly - a declared
                holiday like Eid that moves each year rather than following a fixed rule.
              </InfoButton>
            </h2>

            {canEdit && (
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 p-4">
                <div>
                  <label htmlFor="hol-date" className="mb-1 block text-[11px] text-gray-600">
                    Date
                  </label>
                  <input
                    id="hol-date"
                    type="date"
                    value={draft.date}
                    onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                    className="rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="hol-name" className="mb-1 block text-[11px] text-gray-600">
                    Name
                  </label>
                  <input
                    id="hol-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Eid al-Fitr (declared)"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={save.isPending || !draft.date || !draft.name.trim()}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  Add holiday
                </button>
                <p className="w-full text-[11px] text-gray-500">
                  Added dates are marked as exceptions - declared holidays such as Eid move each year and are not part
                  of the recurring pattern.
                </p>
              </div>
            )}

            <ResultTable
              rows={active.holidays}
              rowKey={(h) => h.date}
              emptyMessage="No holidays defined on this calendar."
              columns={[
                {
                  key: 'date',
                  header: 'Date',
                  render: (h) => <span className="font-mono text-navy-900">{formatDate(h.date)}</span>,
                },
                { key: 'name', header: 'Holiday', render: (h) => h.name },
                {
                  key: 'weekday',
                  header: 'Weekday',
                  render: (h) => (
                    <span className="text-gray-500">{DAY_NAMES[new Date(`${h.date}T00:00:00Z`).getUTCDay()]}</span>
                  ),
                },
                {
                  key: 'type',
                  header: 'Type',
                  align: 'right',
                  render: (h) => (
                    <StatusBadge
                      status={h.isException ? 'Exception' : 'Recurring'}
                      tone={h.isException ? 'warning' : 'neutral'}
                    />
                  ),
                },
                ...(canEdit
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        align: 'right' as const,
                        render: (h: (typeof active.holidays)[number]) => (
                          <button
                            type="button"
                            onClick={() => handleRemove(h.date)}
                            className="text-[11px] font-bold text-danger hover:underline"
                          >
                            Remove
                          </button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Settlement probe
              <InfoButton label="Why this matters for buckets">
                A flow due on a non-business day rolls forward to the next one. At the short end of a liquidity ladder,
                that roll can shift a flow across a bucket boundary and change the reported gap.
              </InfoButton>
            </h2>
            <label htmlFor="probe-date" className="mb-1 block text-[11px] text-gray-600">
              A flow falls due on
            </label>
            <input
              id="probe-date"
              type="date"
              value={probe}
              onChange={(e) => setProbe(e.target.value)}
              className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
            <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-gray-400">It settles on</p>
            <p className="text-[18px] font-bold text-navy-900">{settlement ? formatDate(settlement) : '-'}</p>
            {shifted && (
              <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[11px] leading-relaxed text-warning">
                Shifted forward - the due date is a weekend or a public holiday in {active.name}.
              </p>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
              At the short end of the liquidity ladder this matters: a flow shifted across a bucket boundary changes
              which bucket it lands in, and therefore the reported gap.
            </p>
          </section>
        </div>
      )}

      {!active && !isLoading && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No calendars defined</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            No business-day calendar has been set up yet for any jurisdiction.
          </p>
        </section>
      )}
    </>
  );
}
