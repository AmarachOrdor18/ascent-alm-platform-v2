// Holiday calendar upload: one file (CSV or Excel) with a row per holiday - countryCode, date, holidayName and
// optionally calendarName and weekendDays (e.g. "Sat,Sun" or "Fri"). A file may cover several countries; each
// country is its own calendar. Uploading again replaces a holiday on the same date rather than duplicating it.
import { parseCsv } from './csvImport';
import { normaliseDate } from './dates';
import type { HolidayCalendar, HolidayEntry } from '@/engine/types';

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export interface ParsedHolidayFile {
  calendars: Array<{
    countryCode: string;
    name: string | null;
    weekendDays: number[] | null;
    holidays: HolidayEntry[];
  }>;
  errors: Array<{ line: number; message: string }>;
}

const norm = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');

export function parseHolidayFile(text: string): ParsedHolidayFile {
  const table = parseCsv(text);
  const head = (table[0] ?? []).map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const cCountry = col('countrycode', 'country');
  const cDate = col('date', 'holidaydate');
  const cName = col('holidayname', 'holiday', 'name', 'description');
  const cCalendar = col('calendarname', 'calendar');
  const cWeekend = col('weekenddays', 'weekend');
  const errors: ParsedHolidayFile['errors'] = [];
  if (cCountry < 0 || cDate < 0 || cName < 0) {
    errors.push({ line: 1, message: 'The file needs the columns countryCode, date and holidayName.' });
    return { calendars: [], errors };
  }

  const by = new Map<string, ParsedHolidayFile['calendars'][number]>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    if (cells.every((c) => !c.trim())) return;
    const country = (cells[cCountry] ?? '').trim().toUpperCase();
    const date = normaliseDate(cells[cDate] ?? '');
    const name = (cells[cName] ?? '').trim();
    if (!country) return errors.push({ line, message: 'countryCode is missing' });
    if (!date) return errors.push({ line, message: `"${cells[cDate] ?? ''}" is not a date` });
    if (!name) return errors.push({ line, message: 'holidayName is missing' });
    const cal = by.get(country) ?? { countryCode: country, name: null, weekendDays: null, holidays: [] };
    if (cCalendar >= 0 && cells[cCalendar]?.trim()) cal.name = cells[cCalendar]!.trim();
    if (cWeekend >= 0 && cells[cWeekend]?.trim()) {
      const days = cells[cWeekend]!.split(/[,;/ ]+/)
        .map((d) => DAY_INDEX[d.trim().slice(0, 3).toLowerCase()])
        .filter((d): d is number => d !== undefined);
      if (days.length > 0) cal.weekendDays = days;
    }
    cal.holidays = [...cal.holidays.filter((h) => h.date !== date), { date, name, isException: false }];
    by.set(country, cal);
  });
  return { calendars: [...by.values()], errors };
}

/** Merges a parsed country into its existing calendar (or a new one); a date already on file is replaced. */
export function mergeCalendar(
  existing: HolidayCalendar | undefined,
  parsed: ParsedHolidayFile['calendars'][number],
  userName: string,
): HolidayCalendar {
  const dates = new Set(parsed.holidays.map((h) => h.date));
  return {
    id: existing?.id ?? `CAL-${parsed.countryCode}`,
    code: existing?.code ?? `CAL-${parsed.countryCode}`,
    name: parsed.name ?? existing?.name ?? `${parsed.countryCode} business calendar`,
    countryCode: parsed.countryCode,
    weekendDays: parsed.weekendDays ?? existing?.weekendDays ?? [0, 6],
    holidays: [...(existing?.holidays ?? []).filter((h) => !dates.has(h.date)), ...parsed.holidays].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    isActive: true,
    updatedBy: userName,
    updatedAt: new Date().toISOString(),
  };
}
