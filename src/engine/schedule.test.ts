/**
 * Recurrence tests.
 *
 * Every case supplies its own reference date, so these do not drift as the
 * real clock moves.
 */

import { describe, expect, it } from 'vitest';
import { dueOccurrences, endOfMonth, isBusinessDay, nextOccurrence, rollToBusinessDay } from './schedule';
import type { HolidayCalendar, RunSchedule, ScheduleFrequency } from './types';

function schedule(overrides: Partial<RunSchedule> = {}): RunSchedule {
  return {
    id: 'SCH-1',
    name: 'Monthly ALCO pack',
    templateRunId: 'RUN-1',
    affiliateCode: 'NG',
    frequency: 'Monthly' as ScheduleFrequency,
    dayOfMonth: 'last',
    dayOfWeek: 1,
    holidayCalendarId: null,
    startDate: '2026-01-31',
    endDate: null,
    isActive: true,
    lastRunDate: null,
    lastRunId: null,
    createdBy: 'tester',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
    updatedAt: null,
    ...overrides,
  };
}

/** Weekends off, with Nigerian independence day as a fixed holiday. */
const CALENDAR: HolidayCalendar = {
  id: 'CAL-NG',
  code: 'NG',
  name: 'Nigeria',
  countryCode: 'NG',
  weekendDays: [0, 6],
  holidays: [{ date: '2026-10-01', name: 'Independence Day', isException: false }],
  isActive: true,
  updatedBy: 'tester',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('endOfMonth', () => {
  it('handles the short months', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(endOfMonth('2026-04-01')).toBe('2026-04-30');
    expect(endOfMonth('2026-12-31')).toBe('2026-12-31');
  });
});

describe('business days', () => {
  it('treats weekends and listed holidays as non-business days', () => {
    expect(isBusinessDay('2026-10-03', CALENDAR)).toBe(false); // Saturday
    expect(isBusinessDay('2026-10-01', CALENDAR)).toBe(false); // holiday
    expect(isBusinessDay('2026-10-02', CALENDAR)).toBe(true);
  });

  it('treats every day as a business day when no calendar is attached', () => {
    expect(isBusinessDay('2026-10-03', null)).toBe(true);
  });

  it('rolls forward, not back', () => {
    // 31 Oct 2026 is a Saturday. A month-end pack is produced on the Monday,
    // because Friday's balances are not the month end.
    expect(rollToBusinessDay('2026-10-31', CALENDAR)).toBe('2026-11-02');
  });
});

describe('nextOccurrence — monthly', () => {
  it('steps month-end to month-end, clamping short months', () => {
    const s = schedule();
    expect(nextOccurrence(s, '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence(s, '2026-02-28')).toBe('2026-03-31');
    expect(nextOccurrence(s, '2026-03-31')).toBe('2026-04-30');
  });

  it('does not drift when an occurrence is rolled for a holiday', () => {
    const s = schedule();
    // October's month end rolls into November, but November's own occurrence
    // is still 30 November — the roll must not push the sequence forward.
    const october = nextOccurrence(s, '2026-09-30', CALENDAR);
    expect(october).toBe('2026-11-02');
    expect(nextOccurrence(s, '2026-10-31', CALENDAR)).toBe('2026-11-30');
  });

  it('honours a fixed day of month', () => {
    const s = schedule({ dayOfMonth: 15, startDate: '2026-01-15' });
    expect(nextOccurrence(s, '2026-01-15')).toBe('2026-02-15');
    expect(nextOccurrence(s, '2026-02-20')).toBe('2026-03-15');
  });

  it('returns null once past the end date', () => {
    const s = schedule({ endDate: '2026-03-31' });
    expect(nextOccurrence(s, '2026-02-28')).toBe('2026-03-31');
    expect(nextOccurrence(s, '2026-03-31')).toBeNull();
  });

  it('never fires before the start date', () => {
    const s = schedule({ startDate: '2026-06-30' });
    expect(nextOccurrence(s, '2026-01-01')).toBe('2026-06-30');
  });
});

describe('nextOccurrence — quarterly', () => {
  it('anchors to the start month rather than the calendar quarter', () => {
    // Starting in February means Feb / May / Aug / Nov.
    const s = schedule({ frequency: 'Quarterly', startDate: '2026-02-28' });
    expect(nextOccurrence(s, '2026-02-28')).toBe('2026-05-31');
    expect(nextOccurrence(s, '2026-05-31')).toBe('2026-08-31');
    expect(nextOccurrence(s, '2026-08-31')).toBe('2026-11-30');
  });
});

describe('nextOccurrence — weekly and daily', () => {
  it('finds the next matching weekday', () => {
    const s = schedule({ frequency: 'Weekly', dayOfWeek: 3, startDate: '2026-01-01' });
    // 2026-01-05 is a Monday, so the next Wednesday is the 7th.
    expect(nextOccurrence(s, '2026-01-05')).toBe('2026-01-07');
    expect(nextOccurrence(s, '2026-01-07')).toBe('2026-01-14');
  });

  it('skips weekends rather than rolling them, so a daily run is not due three times on Monday', () => {
    const s = schedule({ frequency: 'Daily', startDate: '2026-01-01' });
    // 2026-01-02 is a Friday.
    expect(nextOccurrence(s, '2026-01-02', CALENDAR)).toBe('2026-01-05');
    expect(nextOccurrence(s, '2026-01-03', CALENDAR)).toBe('2026-01-05');
    expect(nextOccurrence(s, '2026-01-04', CALENDAR)).toBe('2026-01-05');
  });
});

describe('dueOccurrences', () => {
  it('accumulates missed occurrences rather than collapsing them', () => {
    // Ran in April, now August: May, June and July are all still missing.
    const s = schedule({ lastRunDate: '2026-04-30' });
    const backlog = dueOccurrences(s, '2026-08-15');
    expect(backlog.overdue).toEqual(['2026-05-31', '2026-06-30', '2026-07-31']);
    expect(backlog.isOverdue).toBe(true);
    expect(backlog.nextDue).toBe('2026-08-31');
  });

  it('reports nothing due when the schedule is up to date', () => {
    const s = schedule({ lastRunDate: '2026-07-31' });
    const backlog = dueOccurrences(s, '2026-08-15');
    expect(backlog.overdue).toEqual([]);
    expect(backlog.isOverdue).toBe(false);
    expect(backlog.nextDue).toBe('2026-08-31');
  });

  it('produces nothing for a paused schedule', () => {
    const s = schedule({ isActive: false, lastRunDate: '2026-01-31' });
    expect(dueOccurrences(s, '2026-08-15')).toEqual({ overdue: [], nextDue: null, isOverdue: false });
  });

  it('counts every occurrence since the start date when nothing has ever run', () => {
    const s = schedule({ startDate: '2026-01-31', lastRunDate: null });
    const backlog = dueOccurrences(s, '2026-04-15');
    expect(backlog.overdue).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('stops at the end date', () => {
    const s = schedule({ lastRunDate: '2026-04-30', endDate: '2026-06-30' });
    const backlog = dueOccurrences(s, '2026-12-31');
    expect(backlog.overdue).toEqual(['2026-05-31', '2026-06-30']);
    expect(backlog.nextDue).toBeNull();
  });
});
