// Pure date arithmetic: every function takes the reference date as an argument rather than reading `Date.now()`.

import { addDays, addMonths, toIso } from './dates';
import type { HolidayCalendar, IsoDate, RunSchedule, ScheduleFrequency } from './types';

/** Months between occurrences, for the two calendar-month frequencies. */
const MONTH_STEP: Partial<Record<ScheduleFrequency, number>> = { Monthly: 1, Quarterly: 3 };

export function describeFrequency(schedule: RunSchedule): string {
  const day = schedule.dayOfMonth === 'last' ? 'the last day' : `day ${schedule.dayOfMonth}`;
  switch (schedule.frequency) {
    case 'Daily':
      return 'Every business day';
    case 'Weekly':
      return `Every ${WEEKDAY_NAMES[schedule.dayOfWeek] ?? 'week'}`;
    case 'Monthly':
      return `Monthly, on ${day}`;
    case 'Quarterly':
      return `Quarterly, on ${day}`;
  }
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Day of the week for an ISO date. 0 = Sunday. */
export function dayOfWeek(date: IsoDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The last calendar day of the month containing `date`. */
export function endOfMonth(date: IsoDate): IsoDate {
  const [year, month] = date.split('-').map(Number) as [number, number];
  // Day 0 of the following month is the last day of this one.
  return toIso(new Date(Date.UTC(year, month, 0)));
}

/** Set the day-of-month, clamping to the month end so 31 works in February. */
function withDayOfMonth(date: IsoDate, day: number | 'last'): IsoDate {
  if (day === 'last') return endOfMonth(date);
  const [year, month] = date.split('-').map(Number) as [number, number];
  const last = Number(endOfMonth(date).slice(8));
  const clamped = Math.min(Math.max(1, day), last);
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

export function isBusinessDay(date: IsoDate, calendar: HolidayCalendar | null): boolean {
  if (!calendar) return true;
  if (calendar.weekendDays.includes(dayOfWeek(date))) return false;
  return !calendar.holidays.some((h) => h.date === date);
}

/**
 * Roll forward to the next business day.
 *
 * Forward rather than backward: a month-end report due on a Saturday is
 * produced on the Monday, not the Friday, because Friday's data is not the
 * month end. The 14-day cap stops an ill-formed calendar - one that marks
 * every day a holiday - from spinning.
 */
export function rollToBusinessDay(date: IsoDate, calendar: HolidayCalendar | null): IsoDate {
  let candidate = date;
  for (let i = 0; i < 14; i += 1) {
    if (isBusinessDay(candidate, calendar)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return date;
}

/**
 * The first occurrence strictly after `after`.
 *
 * Returns `null` once the schedule has passed its end date. The returned
 * date is business-day adjusted, but the *sequence* is generated from the
 * unadjusted calendar so a rolled occurrence does not drag every later one
 * with it.
 */
export function nextOccurrence(
  schedule: RunSchedule,
  after: IsoDate,
  calendar: HolidayCalendar | null = null,
): IsoDate | null {
  const from = after < schedule.startDate ? addDays(schedule.startDate, -1) : after;

  let raw: IsoDate;
  if (schedule.frequency === 'Daily') {
    raw = addDays(from, 1);
    // A daily schedule means every *business* day, so weekends are skipped
    // rather than rolled - otherwise Saturday and Sunday both roll to Monday
    // and the same run is due three times.
    while (!isBusinessDay(raw, calendar)) raw = addDays(raw, 1);
    return schedule.endDate && raw > schedule.endDate ? null : raw;
  }

  if (schedule.frequency === 'Weekly') {
    const target = ((schedule.dayOfWeek % 7) + 7) % 7;
    raw = addDays(from, 1);
    while (dayOfWeek(raw) !== target) raw = addDays(raw, 1);
    const rolled = rollToBusinessDay(raw, calendar);
    return schedule.endDate && rolled > schedule.endDate ? null : rolled;
  }

  const step = MONTH_STEP[schedule.frequency] ?? 1;
  const startMonth = Number(schedule.startDate.slice(5, 7));
  // Quarterly fires only in months aligned to the start month, so a schedule
  // starting in February means Feb/May/Aug/Nov - not the calendar quarters.
  const isAlignedMonth = (d: IsoDate) => (Number(d.slice(5, 7)) - startMonth + 12) % step === 0;

  // Step one month at a time until the anchor both clears `from` and lands
  // in an eligible month. One loop, so the two conditions cannot disagree.
  let anchor = withDayOfMonth(from, schedule.dayOfMonth);
  let guard = 0;
  while ((anchor <= from || !isAlignedMonth(anchor)) && guard < 64) {
    anchor = withDayOfMonth(addMonths(`${anchor.slice(0, 8)}01`, 1), schedule.dayOfMonth);
    guard += 1;
  }

  const rolled = rollToBusinessDay(anchor, calendar);
  return schedule.endDate && rolled > schedule.endDate ? null : rolled;
}

export interface DueBacklog {
  /** Occurrences that fell due on or before `today` and have not been run. */
  overdue: IsoDate[];
  nextDue: IsoDate | null;
  isOverdue: boolean;
}

/**
 * What this schedule owes, as at `today`.
 *
 * Missed occurrences accumulate rather than collapsing to one: a monthly
 * ALCO pack skipped for three months is three missing packs, and a
 * regulator asking for June's figures is not satisfied by August's.
 */
export function dueOccurrences(
  schedule: RunSchedule,
  today: IsoDate,
  calendar: HolidayCalendar | null = null,
  limit = 24,
): DueBacklog {
  if (!schedule.isActive) return { overdue: [], nextDue: null, isOverdue: false };

  const overdue: IsoDate[] = [];
  let cursor = schedule.lastRunDate ?? addDays(schedule.startDate, -1);

  for (let i = 0; i < limit; i += 1) {
    const next = nextOccurrence(schedule, cursor, calendar);
    if (next === null) break;
    if (next > today) return { overdue, nextDue: next, isOverdue: overdue.length > 0 };
    overdue.push(next);
    cursor = next;
  }

  // Hit the limit while still behind - report the backlog and the next date
  // after it rather than pretending there is none.
  const nextDue = nextOccurrence(schedule, cursor, calendar);
  return { overdue, nextDue, isOverdue: overdue.length > 0 };
}
