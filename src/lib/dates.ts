/**
 * Reads a date the way people and spreadsheets write it and returns YYYY-MM-DD, or null when it is not a date.
 *   2026-09-30 · 30/09/2026 · 30-09-2026 · 9/30/26 · 9/30/2026 · 30 Sep 2026 · Sep 30, 2026 · 46295 (Excel)
 * A slash date whose first part is over 12 is day-first; whose second part is over 12 is month-first; when both
 * could be either, a two-digit year is read month-first (Excel's default display) and a four-digit year day-first.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function build(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function normaliseDate(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return build(+m[1]!, +m[2]!, +m[3]!);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = +m[3]!;
    if (a > 12) return build(y, b, a);
    if (b > 12) return build(y, a, b);
    return m[3]!.length === 2 ? build(y, a, b) : build(y, b, a);
  }
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -,]*(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase());
    return mi < 0 ? null : build(+m[3]!, mi + 1, +m[1]!);
  }
  m = t.match(/^([A-Za-z]{3,})[ -](\d{1,2}),?[ -](\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase());
    return mi < 0 ? null : build(+m[3]!, mi + 1, +m[2]!);
  }
  // An Excel serial day number (1900 system) that came through as plain text.
  if (/^\d{5}$/.test(t)) {
    const serial = +t;
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }
  return null;
}
