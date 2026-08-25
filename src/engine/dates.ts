/**
 * Date and day-count arithmetic.
 *
 * Accrual basis is a seeded dimension in OFSAA and is used pervasively:
 * two positions with identical balance and rate accrue different interest
 * under 30/360 than under Actual/365. v1 had no day-count concept at all.
 */

import type { AccrualBasis, IsoDate } from './types';

const MS_PER_DAY = 86_400_000;

function parse(date: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** Calendar days between two ISO dates. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

/** Days under the 30/360 US convention, where every month is 30 days. */
export function days30360(from: IsoDate, to: IsoDate): number {
  const a = parse(from);
  const b = parse(to);
  const d1 = Math.min(a.d, 30);
  const d2 = d1 === 30 ? Math.min(b.d, 30) : b.d;
  return 360 * (b.y - a.y) + 30 * (b.m - a.m) + (d2 - d1);
}

/** Year fraction between two dates under a given accrual basis. */
export function yearFraction(from: IsoDate, to: IsoDate, basis: AccrualBasis): number {
  switch (basis) {
    case '30/360':
      return days30360(from, to) / 360;
    case '30/365':
      return days30360(from, to) / 365;
    case '30/Actual':
      return days30360(from, to) / daysInYearSpan(from, to);
    case 'Actual/360':
      return daysBetween(from, to) / 360;
    case 'Actual/365':
      return daysBetween(from, to) / 365;
    case 'Actual/Actual':
      return daysBetween(from, to) / daysInYearSpan(from, to);
    default:
      return daysBetween(from, to) / 365;
  }
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Denominator for Actual/Actual — 366 where the span touches a leap year. */
function daysInYearSpan(from: IsoDate, to: IsoDate): number {
  const a = parse(from);
  const b = parse(to);
  for (let y = a.y; y <= b.y; y += 1) {
    if (isLeapYear(y)) return 366;
  }
  return 365;
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const { y, m, d } = parse(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp to the last valid day of the target month: 31 Jan + 1 month is
  // 28 (or 29) Feb, not 3 March.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toIso(target);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return toIso(new Date(ms + days * MS_PER_DAY));
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Latest of a set of dates, ignoring nulls. Returns null when all are null. */
export function maxDate(dates: Array<IsoDate | null>): IsoDate | null {
  const present = dates.filter((d): d is IsoDate => d !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => (a > b ? a : b));
}

/** Whole months between two dates, rounded down. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = parse(from);
  const b = parse(to);
  const months = (b.y - a.y) * 12 + (b.m - a.m);
  return b.d < a.d ? months - 1 : months;
}
