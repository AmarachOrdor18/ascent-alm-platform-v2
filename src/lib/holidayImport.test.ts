import { describe, expect, it } from 'vitest';
import { mergeCalendar, parseHolidayFile } from './holidayImport';

const FILE = `countryCode,calendarName,date,holidayName,weekendDays
NG,Nigeria (CBN) business days,2026-10-01,Independence Day,"Sat,Sun"
NG,,25/12/2026,Christmas Day,
GH,Ghana business days,2026-07-01,Republic Day,
,,2026-01-01,No country,
NG,,not a date,Bad row,
`;

describe('holiday calendar upload', () => {
  it('reads one calendar per country, with any date format and the weekend', () => {
    const { calendars, errors } = parseHolidayFile(FILE);
    expect(calendars.map((c) => c.countryCode)).toEqual(['NG', 'GH']);
    const ng = calendars[0]!;
    expect(ng.name).toBe('Nigeria (CBN) business days');
    expect(ng.weekendDays).toEqual([6, 0]);
    expect(ng.holidays.map((h) => h.date)).toEqual(['2026-10-01', '2026-12-25']);
    expect(errors.map((e) => e.line)).toEqual([5, 6]);
  });

  it('replaces a holiday on the same date instead of duplicating it', () => {
    const { calendars } = parseHolidayFile(FILE);
    const merged = mergeCalendar(
      {
        id: 'CAL-NG',
        code: 'CAL-NG',
        name: 'Old',
        countryCode: 'NG',
        weekendDays: [0, 6],
        holidays: [{ date: '2026-10-01', name: 'Old name', isException: false }],
        isActive: true,
        updatedBy: 'x',
        updatedAt: '',
      },
      calendars[0]!,
      'tester',
    );
    expect(merged.holidays).toHaveLength(2);
    expect(merged.holidays[0]!.name).toBe('Independence Day');
  });
});
