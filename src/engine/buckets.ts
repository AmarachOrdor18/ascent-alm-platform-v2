/**
 * Time buckets.
 *
 * v1 hardcoded one five-bucket ladder in five separate files and used it for
 * liquidity gap, repricing gap and FTP alike. OFSAA keeps three independent
 * ladders (ALM UG Ch. 15) because they answer different questions: a
 * liquidity ladder wants daily granularity at the short end, a repricing
 * ladder wants monthly out to several years.
 *
 * Buckets are *derived from dates* here rather than arriving pre-assigned,
 * which is what makes a bucket rule mean anything at all.
 */

import type { IsoDate, LadderKind, TimeBucket, TimeBucketLadder } from './types';
import { daysBetween } from './dates';

/** Bucket label used for positions that never reprice (OFSAA's Non-Rate-Sensitive bucket). */
export const NON_RATE_SENSITIVE = 'Non-Rate-Sensitive';

/** Label used when a position carries no date to bucket on. Never silently dropped. */
export const UNDATED = 'Undated';

/**
 * The ladder the Ecobank mock workbook uses. Reproducing its allocation is
 * part of the phase-1 acceptance test, so this is the default liquidity and
 * repricing ladder rather than an arbitrary choice.
 */
export const STANDARD_BUCKETS: TimeBucket[] = [
  { label: '0-30D', upperBoundDays: 30 },
  { label: '1-3M', upperBoundDays: 90 },
  { label: '3-6M', upperBoundDays: 180 },
  { label: '6-12M', upperBoundDays: 365 },
  { label: '1-3Y', upperBoundDays: 1095 },
  { label: '3-5Y', upperBoundDays: 1825 },
  { label: '5Y+', upperBoundDays: null },
];

/** A finer short-end ladder, for liquidity survival analysis. */
export const LIQUIDITY_BUCKETS: TimeBucket[] = [
  { label: 'Overnight', upperBoundDays: 1 },
  { label: '2-7D', upperBoundDays: 7 },
  { label: '8-30D', upperBoundDays: 30 },
  { label: '1-3M', upperBoundDays: 90 },
  { label: '3-6M', upperBoundDays: 180 },
  { label: '6-12M', upperBoundDays: 365 },
  { label: '1-3Y', upperBoundDays: 1095 },
  { label: '3-5Y', upperBoundDays: 1825 },
  { label: '5Y+', upperBoundDays: null },
];

export function defaultLadder(kind: LadderKind): TimeBucketLadder {
  return {
    kind,
    buckets: kind === 'LiquidityGap' ? LIQUIDITY_BUCKETS : STANDARD_BUCKETS,
    includeNonRateSensitive: kind === 'RepricingGap',
  };
}

/**
 * Assign a date to a bucket on the ladder.
 *
 * A date on or before the as-of date falls in the first bucket — an already
 * matured or overdue position is immediately due, not excluded. A `null`
 * date returns `UNDATED` rather than being silently dropped into the
 * terminal bucket, which would overstate long-dated funding.
 */
export function bucketForDate(ladder: TimeBucketLadder, asOfDate: IsoDate, date: IsoDate | null): string {
  if (!date) return UNDATED;
  const days = daysBetween(asOfDate, date);
  for (const bucket of ladder.buckets) {
    if (bucket.upperBoundDays === null) return bucket.label;
    if (days <= bucket.upperBoundDays) return bucket.label;
  }
  return ladder.buckets[ladder.buckets.length - 1]?.label ?? UNDATED;
}

/** Every label this ladder can produce, in order, including the special buckets. */
export function ladderLabels(ladder: TimeBucketLadder): string[] {
  const labels = ladder.buckets.map((b) => b.label);
  if (ladder.includeNonRateSensitive) labels.push(NON_RATE_SENSITIVE);
  return labels;
}

/** Midpoint of a bucket in years — a proxy used only where no instrument duration exists. */
export function bucketMidpointYears(ladder: TimeBucketLadder, label: string): number | null {
  const index = ladder.buckets.findIndex((b) => b.label === label);
  if (index < 0) return null;
  const bucket = ladder.buckets[index]!;
  const lower = index === 0 ? 0 : (ladder.buckets[index - 1]!.upperBoundDays ?? 0);
  // The terminal bucket is open-ended; assume a decade midpoint rather than
  // pretending the upper bound is its own lower bound.
  if (bucket.upperBoundDays === null) return (lower + 3650) / 2 / 365;
  return (lower + bucket.upperBoundDays) / 2 / 365;
}

export interface BucketedTotal {
  bucket: string;
  assets: number;
  liabilities: number;
  gap: number;
  cumulativeGap: number;
}

export interface BucketableItem {
  amount: number;
  isAsset: boolean;
  date: IsoDate | null;
  /** Repricing ladders route non-sensitive items to their own bucket. */
  rateSensitive?: boolean;
}

/**
 * Bucket a set of items and accumulate the gap.
 *
 * Every ladder label appears in the output even when empty — a gap table
 * with rows missing is misread as a gap of zero rather than no data.
 */
export function bucketize(ladder: TimeBucketLadder, asOfDate: IsoDate, items: BucketableItem[]): BucketedTotal[] {
  const labels = ladderLabels(ladder);
  const byLabel = new Map<string, { assets: number; liabilities: number }>(
    labels.map((l) => [l, { assets: 0, liabilities: 0 }]),
  );

  for (const item of items) {
    const label =
      ladder.includeNonRateSensitive && item.rateSensitive === false
        ? NON_RATE_SENSITIVE
        : bucketForDate(ladder, asOfDate, item.date);
    const slot = byLabel.get(label);
    if (!slot) continue;
    if (item.isAsset) slot.assets += item.amount;
    else slot.liabilities += item.amount;
  }

  let cumulative = 0;
  return labels.map((label) => {
    const slot = byLabel.get(label)!;
    const gap = slot.assets - slot.liabilities;
    cumulative += gap;
    return { bucket: label, assets: slot.assets, liabilities: slot.liabilities, gap, cumulativeGap: cumulative };
  });
}
