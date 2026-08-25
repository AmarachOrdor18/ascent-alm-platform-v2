/**
 * Holiday Calendar — screen 15.
 *
 * Business-day conventions per jurisdiction. A cash flow due on a public
 * holiday settles on the next business day, which moves it between buckets
 * at the short end where liquidity analysis is most sensitive.
 */

import { useEffect, useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useHolidayCalendars, useSaveHolidayCalendar } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { addDays } from '@/engine/dates';
import type { HolidayCalendar as Calendar } from '@/engine/types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Next business day on or after `date`, skipping weekends and holidays. */
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

export function HolidayCalendar() {
  const { hasPermission } = useAuth();
  const { data: calendars = [], isLoading } = useHolidayCalendars();
  const save = useSaveHolidayCalendar();
  const canEdit = hasPermission('data.configure');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: '', name: '' });
  const [probe, setProbe] = useState('2026-12-25');

  useEffect(() => {
    if (!activeId && calendars.length > 0) setActiveId(calendars[0]!.id);
  }, [calendars, activeId]);

  const active = calendars.find((c) => c.id === activeId) ?? null;

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
      <ModuleHeader
        title="Holiday Calendar"
        description="Business-day conventions per jurisdiction. A flow due on a holiday settles on the next business day, moving it between buckets at the short end."
        asOfDate={null}
        scope={active?.name ?? 'Group'}
        metrics={[
          { label: 'Calendars', value: String(calendars.length) },
          { label: 'Holidays defined', value: active ? String(active.holidays.length) : '—' },
          {
            label: 'Weekend',
            value: active ? active.weekendDays.map((d) => DAY_NAMES[d]!.slice(0, 3)).join(' & ') : '—',
          },
          { label: 'Exceptions', value: active ? String(active.holidays.filter((h) => h.isException).length) : '—' },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {calendars.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={
              activeId === c.id
                ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white'
                : 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:border-navy-700 hover:text-navy-900'
            }
          >
            {c.name}
          </button>
        ))}
        {isLoading && <span className="text-[12px] text-gray-400">Loading…</span>}
      </div>

      {active && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Public holidays</h2>

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
                  Added dates are marked as exceptions — declared holidays such as Eid move each year and are not part
                  of the recurring pattern.
                </p>
              </div>
            )}

            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th
                    scope="col"
                    className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Holiday
                  </th>
                  <th
                    scope="col"
                    className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Weekday
                  </th>
                  <th
                    scope="col"
                    className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                  >
                    Type
                  </th>
                  {canEdit && <th scope="col" className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {active.holidays.map((h) => (
                  <tr key={h.date} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-navy-900">{formatDate(h.date)}</td>
                    <td className="py-2">{h.name}</td>
                    <td className="py-2 text-gray-500">{DAY_NAMES[new Date(`${h.date}T00:00:00Z`).getUTCDay()]}</td>
                    <td className="py-2 text-right">
                      <StatusBadge
                        status={h.isException ? 'Exception' : 'Recurring'}
                        tone={h.isException ? 'warning' : 'neutral'}
                      />
                    </td>
                    {canEdit && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(h.date)}
                          className="text-[11px] font-bold text-danger hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Settlement probe</h2>
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
            <p className="text-[18px] font-bold text-navy-900">{settlement ? formatDate(settlement) : '—'}</p>
            {shifted && (
              <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[11px] leading-relaxed text-warning">
                Shifted forward — the due date is a weekend or a public holiday in {active.name}.
              </p>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
              At the short end of the liquidity ladder this matters: a flow shifted across a bucket boundary changes
              which bucket it lands in, and therefore the reported gap.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
