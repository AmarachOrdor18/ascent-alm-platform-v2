import { parseCsv } from '@/lib/csvImport';
import { tableToCsv } from '@/lib/fileImport';
import type { FieldMappingRule } from '@/engine/ruleTypes';

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Normalizes a source date string to ISO (YYYY-MM-DD) where the format is unambiguous. Anything not
 * recognized is left untouched — `isoDate` in csvImport.ts already reports an unrecognized date as a
 * row error, which is a safer outcome than silently guessing day/month order wrong.
 */
function normalizeDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // already ISO

  const slashOrDash = t.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (slashOrDash) {
    const [, a, b, c] = slashOrDash as unknown as [string, string, string, string];
    if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`; // YYYY/MM/DD or YYYY-MM-DD-ish
    // Two-digit-year day/month forms: Ecobank's markets are day-first, so DD/MM/YYYY over MM/DD/YYYY.
    return `${c.padStart(4, '20')}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }

  const withMonthName = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/); // e.g. 10-MAY-2030
  if (withMonthName) {
    const [, day, mon, year] = withMonthName as unknown as [string, string, string, string];
    const month = MONTHS[mon.toLowerCase()];
    if (month) return `${year.padStart(4, '20')}-${month}-${day.padStart(2, '0')}`;
  }

  return t;
}

/** Strips thousands separators and common currency symbols/prefixes, leaving a bare numeric string. */
function normalizeNumber(raw: string): string {
  return raw.trim().replace(/[,\s]/g, '').replace(/^[A-Za-z]{0,4}\$?/, '');
}

/** Strips a trailing "%" — the app's *Pct fields are whole-number percent (15, not 0.15). */
function normalizePercent(raw: string): string {
  return raw.trim().replace(/%\s*$/, '');
}

function applyTransform(value: string, transform: FieldMappingRule['columns'][number]['transform']): string {
  switch (transform) {
    case 'Date':
      return normalizeDate(value);
    case 'Number':
      return normalizeNumber(value);
    case 'Percent':
      return normalizePercent(value);
    case 'Direct':
    default:
      return value;
  }
}

/**
 * Rewrites a raw source file's CSV text into the canonical column shape a `FieldMappingRule`
 * describes, so the existing, unmodified `importPositions`/`importCounterparties` etc. can read it
 * exactly as if it had arrived already-canonical. A header not covered by the rule passes through
 * unchanged — a mapping only needs to cover the columns that actually differ from the canonical name.
 */
export function applyFieldMapping(csvText: string, rule: FieldMappingRule): string {
  const table = parseCsv(csvText);
  if (table.length === 0) return csvText;

  const [header, ...dataRows] = table as [string[], ...string[][]];
  const byIndex = new Map<number, FieldMappingRule['columns'][number]>();
  header.forEach((h, i) => {
    const match = rule.columns.find((c) => c.sourceField.trim().toLowerCase() === h.trim().toLowerCase());
    if (match) byIndex.set(i, match);
  });

  const mappedHeader = header.map((h, i) => byIndex.get(i)?.targetField ?? h);
  const mappedRows = dataRows.map((row) =>
    row.map((cell, i) => {
      const column = byIndex.get(i);
      return column ? applyTransform(cell, column.transform) : cell;
    }),
  );

  return tableToCsv([mappedHeader, ...mappedRows]);
}
