import type { Affiliate, DataDomain, IsoDate, LoadBatch, PositionContributor } from './types';
import { daysBetween } from './dates';

/** Every department the platform currently recognises as a Positions contributor. */
export const ALL_CONTRIBUTORS: PositionContributor[] = ['Loans', 'Deposits', 'Treasury'];

export type FreshnessStatus = 'Fresh' | 'Due' | 'Stale' | 'Never loaded';

export interface FreshnessCheck {
  affiliateCode: string;
  domain: DataDomain;
  status: FreshnessStatus;
  lastLoadedAt: string | null;
  lastAsOfDate: IsoDate | null;
  ageDays: number | null;
  slaDays: number;
  /** Present when the domain is Stale - shown on the screen header. */
  warning: string | null;
}

// Market rates, FX rates and economic indicators are Group-wide reference data - loaded once, not
// per-affiliate - so a batch recorded against GROUP satisfies every affiliate's own freshness check for
// these three domains. GeneralLedger and Counterparties are genuinely per-affiliate (each affiliate
// reconciles its own ledger and maintains its own register) and stay strictly scoped to that affiliate.
const GROUP_WIDE_REFERENCE_DOMAINS: DataDomain[] = ['MarketRates', 'FxRates', 'EconomicIndicators'];

// 'Due' is the grace band at 100-150% of the SLA; beyond that it is 'Stale'.
export function checkFreshness(
  affiliate: Affiliate,
  domain: DataDomain,
  batches: LoadBatch[],
  today: IsoDate,
): FreshnessCheck {
  const feed = affiliate.feeds.find((f) => f.domain === domain);
  const slaDays = feed?.slaDays ?? 30;
  const groupWide = GROUP_WIDE_REFERENCE_DOMAINS.includes(domain);

  const committed = batches
    .filter(
      (b) =>
        (b.affiliateCode === affiliate.code || (groupWide && b.affiliateCode === 'GROUP')) &&
        b.domain === domain &&
        b.status === 'Committed',
    )
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
        ? `${domain} last loaded ${ageDays} days ago against a ${slaDays}-day SLA - figures may not reflect current positions.`
        : null,
  };
}

export function checkAllDomains(affiliate: Affiliate, batches: LoadBatch[], today: IsoDate): FreshnessCheck[] {
  return affiliate.feeds.map((f) => checkFreshness(affiliate, f.domain, batches, today));
}

/** The single worst status across a set of checks - 'Stale' outranks 'Never loaded' outranks 'Due'. */
export function worstFreshness(checks: FreshnessCheck[]): FreshnessStatus {
  if (checks.length === 0) return 'Never loaded';
  if (checks.some((c) => c.status === 'Stale')) return 'Stale';
  if (checks.some((c) => c.status === 'Never loaded')) return 'Never loaded';
  if (checks.some((c) => c.status === 'Due')) return 'Due';
  return 'Fresh';
}

// Reloading an as-of date creates a new version; the highest version wins. Superseded batches are retained, not deleted.
//
// For the Positions domain, "current" is scoped per contributor as well as
// per affiliate/domain/date: Loans re-uploading their slice supersedes only
// Loans' prior version, never Treasury's or Deposits' - each department's
// submission history is independent. `contributor` is required for the
// Positions domain (undefined would otherwise conflate every department's
// batches into one "latest version wins" pool) and ignored elsewhere, where
// there is exactly one submitter per domain/date.
// `contributor` and a batch's `b.contributor` are both normalised to `null` before comparing, so calling this
// with no `contributor` argument matches a `null`-contributor batch specifically - that's how pre-contribution-model
// batches (seeded before this field existed, or any future domain where one submitter is still all there is) are
// addressed as their own, distinct bucket rather than silently matching (or silently excluding) every department.
export function currentBatch(
  batches: LoadBatch[],
  affiliateCode: string,
  domain: DataDomain,
  asOfDate: IsoDate,
  contributor?: PositionContributor,
): LoadBatch | null {
  const candidates = batches.filter(
    (b) =>
      b.affiliateCode === affiliateCode &&
      b.domain === domain &&
      b.asOfDate === asOfDate &&
      b.status === 'Committed' &&
      (domain !== 'Positions' || (b.contributor ?? null) === (contributor ?? null)),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, b) => (b.version > best.version ? b : best));
}

/**
 * Every department's current (latest-version, Committed) Positions batch
 * for an affiliate/date - the actual combined book, assembled from however
 * many contributors have submitted so far. A run must pin every one of
 * these, not a single batch, or a real contribution silently drops out of
 * every calculation that consumes it. Includes any legacy, pre-contributor
 * batch (`contributor: null`) alongside named departments', so data seeded
 * or loaded before this model existed keeps working.
 */
export function currentPositionBatches(batches: LoadBatch[], affiliateCode: string, asOfDate: IsoDate): LoadBatch[] {
  const legacy = currentBatch(batches, affiliateCode, 'Positions', asOfDate);
  const perContributor = ALL_CONTRIBUTORS.map((c) => currentBatch(batches, affiliateCode, 'Positions', asOfDate, c));
  return [legacy, ...perContributor].filter((b): b is LoadBatch => b !== null);
}

export interface ContributionStatus {
  contributor: PositionContributor;
  submitted: boolean;
  batch: LoadBatch | null;
}

/** Per-department submission status for an affiliate/date, against whichever contributors that affiliate requires. */
export function contributionReadiness(
  affiliate: Affiliate,
  batches: LoadBatch[],
  asOfDate: IsoDate,
): ContributionStatus[] {
  const required = affiliate.requiredContributors ?? ALL_CONTRIBUTORS;
  return required.map((contributor) => {
    const batch = currentBatch(batches, affiliate.code, 'Positions', asOfDate, contributor);
    return { contributor, submitted: batch !== null, batch };
  });
}

export interface PositionBookReadiness {
  contributors: ContributionStatus[];
  /** A pre-contributor-model batch for this affiliate/date, if one exists - still counted into the book, but not toward any named department's completeness. */
  legacyBatch: LoadBatch | null;
  /** Every required contributor has submitted. Ignores `legacyBatch` deliberately - a legacy load isn't attributable to a specific department. */
  isComplete: boolean;
}

export function positionBookReadiness(affiliate: Affiliate, batches: LoadBatch[], asOfDate: IsoDate): PositionBookReadiness {
  const contributors = contributionReadiness(affiliate, batches, asOfDate);
  return {
    contributors,
    legacyBatch: currentBatch(batches, affiliate.code, 'Positions', asOfDate),
    isComplete: contributors.every((c) => c.submitted),
  };
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

/** The as-of date immediately before the given one - the prior-period comparison basis. */
export function priorAsOfDate(batches: LoadBatch[], affiliateCode: string, asOfDate: IsoDate): IsoDate | null {
  const earlier = availableAsOfDates(batches, affiliateCode).filter((d) => d < asOfDate);
  return earlier[0] ?? null;
}

export interface SupersedeOutcome {
  superseded: LoadBatch | null;
  nextVersion: number;
}

export function planSupersede(
  batches: LoadBatch[],
  affiliateCode: string,
  domain: DataDomain,
  asOfDate: IsoDate,
  contributor?: PositionContributor,
): SupersedeOutcome {
  const existing = currentBatch(batches, affiliateCode, domain, asOfDate, contributor);
  return { superseded: existing, nextVersion: existing ? existing.version + 1 : 1 };
}

/** Batches outside the retention window. Marked expired and hidden, never auto-deleted. */
export function expiredBatches(batches: LoadBatch[], today: IsoDate, retentionMonths = 24): LoadBatch[] {
  const cutoffMs = Date.parse(`${today}T00:00:00Z`) - retentionMonths * 30 * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  return batches.filter((b) => b.asOfDate < cutoff);
}
