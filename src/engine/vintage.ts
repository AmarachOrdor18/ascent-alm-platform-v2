/**
 * Data vintages and freshness.
 *
 * Build plan §9: data is a dated time series, results are immutable per run,
 * and corrections happen by reload and reprocess rather than by editing in
 * place. This module decides which batch is current for an as-of date, and
 * whether a domain has gone stale against its SLA.
 *
 * Freshness monitoring is what stops a platform quietly reporting confident
 * numbers off three-month-old data — a stale FX rate does not announce
 * itself, it just silently consolidates the Group at last quarter's rate.
 */

import type { Affiliate, DataDomain, IsoDate, LoadBatch } from './types';
import { daysBetween } from './dates';

export type FreshnessStatus = 'Fresh' | 'Due' | 'Stale' | 'Never loaded';

export interface FreshnessCheck {
  affiliateCode: string;
  domain: DataDomain;
  status: FreshnessStatus;
  lastLoadedAt: string | null;
  lastAsOfDate: IsoDate | null;
  ageDays: number | null;
  slaDays: number;
  /** Present when the domain is Stale — shown on the screen header. */
  warning: string | null;
}

/**
 * Evaluate one domain against its SLA.
 *
 * `Due` is the grace band at 100–150% of the SLA: the data is past its
 * expected refresh but not yet old enough to distrust. Beyond that it is
 * `Stale` and dependent runs are flagged.
 */
export function checkFreshness(
  affiliate: Affiliate,
  domain: DataDomain,
  batches: LoadBatch[],
  today: IsoDate,
): FreshnessCheck {
  const feed = affiliate.feeds.find((f) => f.domain === domain);
  const slaDays = feed?.slaDays ?? 30;

  const committed = batches
    .filter((b) => b.affiliateCode === affiliate.code && b.domain === domain && b.status === 'Committed')
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const latest = committed[0];
  if (!latest) {
    return {
      affiliateCode: affiliate.code,
      domain,
      status: 'Never loaded',
      lastLoadedAt: null,
      lastAsOfDate: null,
      ageDays: null,
      slaDays,
      warning: `${domain} has never been loaded for ${affiliate.name}.`,
    };
  }

  const ageDays = daysBetween(latest.uploadedAt.slice(0, 10), today);
  const status: FreshnessStatus = ageDays <= slaDays ? 'Fresh' : ageDays <= slaDays * 1.5 ? 'Due' : 'Stale';

  return {
    affiliateCode: affiliate.code,
    domain,
    status,
    lastLoadedAt: latest.uploadedAt,
    lastAsOfDate: latest.asOfDate,
    ageDays,
    slaDays,
    warning:
      status === 'Stale'
        ? `${domain} last loaded ${ageDays} days ago against a ${slaDays}-day SLA — figures may not reflect current positions.`
        : null,
  };
}

export function checkAllDomains(affiliate: Affiliate, batches: LoadBatch[], today: IsoDate): FreshnessCheck[] {
  return affiliate.feeds.map((f) => checkFreshness(affiliate, f.domain, batches, today));
}

/**
 * The current committed batch for an as-of date.
 *
 * Reloading an as-of date creates a new version and supersedes the previous
 * one; the highest version wins. Superseded batches are retained, because a
 * run that consumed v1 must still be able to show what it actually computed.
 */
export function currentBatch(
  batches: LoadBatch[],
  affiliateCode: string,
  domain: DataDomain,
  asOfDate: IsoDate,
): LoadBatch | null {
  const candidates = batches.filter(
    (b) =>
      b.affiliateCode === affiliateCode && b.domain === domain && b.asOfDate === asOfDate && b.status === 'Committed',
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, b) => (b.version > best.version ? b : best));
}

/** Every as-of date with committed data, newest first. */
export function availableAsOfDates(
  batches: LoadBatch[],
  affiliateCode: string,
  domain: DataDomain = 'Positions',
): IsoDate[] {
  const dates = new Set(
    batches
      .filter((b) => b.affiliateCode === affiliateCode && b.domain === domain && b.status === 'Committed')
      .map((b) => b.asOfDate),
  );
  return Array.from(dates).sort((a, b) => b.localeCompare(a));
}

/** The as-of date immediately before the given one — the prior-period comparison basis. */
export function priorAsOfDate(batches: LoadBatch[], affiliateCode: string, asOfDate: IsoDate): IsoDate | null {
  const earlier = availableAsOfDates(batches, affiliateCode).filter((d) => d < asOfDate);
  return earlier[0] ?? null;
}

export interface SupersedeOutcome {
  superseded: LoadBatch | null;
  nextVersion: number;
}

/**
 * Work out what a reload of an existing as-of date should do.
 *
 * A reason is mandatory when superseding: the audit question is never "what
 * changed" but "why was it changed", and a version history without reasons
 * answers neither.
 */
export function planSupersede(
  batches: LoadBatch[],
  affiliateCode: string,
  domain: DataDomain,
  asOfDate: IsoDate,
): SupersedeOutcome {
  const existing = currentBatch(batches, affiliateCode, domain, asOfDate);
  return { superseded: existing, nextVersion: existing ? existing.version + 1 : 1 };
}

/** Batches outside the retention window. Marked expired and hidden, never auto-deleted. */
export function expiredBatches(batches: LoadBatch[], today: IsoDate, retentionMonths = 24): LoadBatch[] {
  const cutoffMs = Date.parse(`${today}T00:00:00Z`) - retentionMonths * 30 * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  return batches.filter((b) => b.asOfDate < cutoff);
}
