// Readiness: "can this affiliate run ALM for this date, and if not, what is missing and who can fix it?"
//
// One pure module, the single source of truth for the Run screen's pre-flight check, the Home readiness
// checklist (affiliate scope) and the readiness matrix (Group scope). Everything is computed from live
// data - nothing is ticked by hand - so it recalculates the moment an input changes (an upload, an
// approval, a market-data load, a status change; see lib/readinessHooks.ts).
//
// The governing rule (teardown §6): only six things block a run - no committed positions for the date,
// the affiliate not Live, a missing FX rate for a currency in use, no calculation element selected, an
// unapproved approval-gated rule selected, a locked series. Everything else runs and is labelled with the
// output it degrades.
import { buildFxTable, convert, missingRates } from '@/engine/fx';
import { ALL_CONTRIBUTORS, currentBatch, currentPositionBatches } from '@/engine/vintage';
import { pickApprovedRule, isRuleApproved } from './ruleApproval';
import { buildSeries, seriesKeyFor, seriesLockReason, signOffStatusOf } from './runSeries';
import { defaultSourceId } from './dataSources';
import type {
  Affiliate,
  ApprovalRequest,
  CalculationElement,
  EconomicIndicator,
  IsoDate,
  LoadBatch,
  Position,
  ProcessRun,
  RuleKind,
  RuleMeta,
  StoredFxRate,
  StoredYieldCurve,
} from '@/engine/types';

export type ReadinessCategory = 'Setup' | 'Data' | 'From Group' | 'Rules' | 'Calibration' | 'Governance';
export type ReadinessScope = 'Group' | 'Affiliate';
/** ok = done; missing = not there; warning = there but needs attention; default = a standard default is in use. */
export type ReadinessStatus = 'ok' | 'missing' | 'warning' | 'default';
export type ReadinessVerdict = 'Ready' | 'Ready with warnings' | 'Blocked';

export interface ReadinessItem {
  key: string;
  label: string;
  category: ReadinessCategory;
  /** Whose item it is: Group (market data, organisation) or the affiliate itself. */
  scope: ReadinessScope;
  status: ReadinessStatus;
  /** Plain words: what is there, or exactly what is missing (which currency, which contributor ...). */
  detail: string;
  /** True when this item, unresolved, stops a run. */
  blocking: boolean;
  /** When unresolved but not blocking: the output that is degraded. */
  degradation?: string;
  /** The permission that lets a user fix it (see lib/whoCanFix.ts). */
  fixPermission: string;
  /** The screen that fixes it. */
  fixHref: string;
  /** Short label for the fix button. */
  fixLabel: string;
}

export interface Readiness {
  affiliateCode: string;
  asOfDate: IsoDate | null;
  items: ReadinessItem[];
  verdict: ReadinessVerdict;
  /** Unresolved blocking items. */
  blockers: ReadinessItem[];
  /** Unresolved non-blocking items (missing, warning or default in use). */
  warnings: ReadinessItem[];
}

/** The rules readiness reads, by kind. */
export interface ReadinessRules {
  timeBucket: RuleMeta[];
  productCharacteristic: RuleMeta[];
  behaviourPattern: RuleMeta[];
  prepayment: RuleMeta[];
  ftp: RuleMeta[];
  costAllocation: RuleMeta[];
  creditLoss: RuleMeta[];
  capital: RuleMeta[];
}

/** What the Run screen has chosen - only the run screen passes this. */
export interface RunSelection {
  elements: CalculationElement[];
  /** Names of selected approval-gated rules / scenarios that are not approved. */
  unapproved: string[];
  /** Further run-configuration blockers in plain words (e.g. a dynamic run without a new-business rule). */
  extra?: string[];
}

export interface ReadinessInputs {
  /** An affiliate code, or GROUP for the consolidated run. */
  affiliateCode: string;
  affiliates: Affiliate[];
  asOfDate: IsoDate | null;
  batches: LoadBatch[];
  fxRates: StoredFxRate[];
  yieldCurves: StoredYieldCurve[];
  indicators?: EconomicIndicator[];
  rules: ReadinessRules;
  approvals: ApprovalRequest[];
  runs: ProcessRun[];
  /** The affiliate's positions for the date - enables the combined-book balance check. Optional. */
  positions?: Position[];
  /** Market data older than this (days) is stale. Organisation setting marketData.slaDays, default 30. */
  slaDays: number;
  /** Today, ISO - only used when there is no working date. */
  today: IsoDate;
  selection?: RunSelection;
}

export const DEFAULT_MARKET_DATA_SLA_DAYS = 30;
export const MARKET_DATA_SLA_SETTING = 'marketData.slaDays';

const DAY_MS = 86_400_000;
export const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Committed position dates for an affiliate (or, for GROUP, any Live affiliate), newest first. */
export function committedDates(batches: LoadBatch[], affiliateCode: string, affiliates: Affiliate[]): IsoDate[] {
  const codes =
    affiliateCode === 'GROUP'
      ? new Set(affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live').map((a) => a.code))
      : new Set([affiliateCode]);
  const dates = new Set(
    batches
      .filter((b) => b.domain === 'Positions' && b.status === 'Committed' && codes.has(b.affiliateCode))
      .map((b) => b.asOfDate),
  );
  return [...dates].sort((a, b) => b.localeCompare(a));
}

/** Currencies a scope transacts in (functional + active); for GROUP every Live affiliate's. */
export function currenciesInUse(affiliateCode: string, affiliates: Affiliate[]): string[] {
  const scope =
    affiliateCode === 'GROUP'
      ? affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live')
      : affiliates.filter((a) => a.code === affiliateCode);
  return Array.from(new Set(scope.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies]))).filter(Boolean);
}

export function reportingCurrencyOf(affiliateCode: string, affiliates: Affiliate[]): string {
  if (affiliateCode === 'GROUP') return 'USD';
  return affiliates.find((a) => a.code === affiliateCode)?.functionalCurrency ?? 'USD';
}

// ─── Market data status (shared with Data → Market data and Home) ──────────

export interface MarketKindStatus {
  kind: 'FX rates' | 'Yield curves' | 'Indicators';
  /** Latest data date on file (on or before the reference date when one is given). */
  lastDate: IsoDate | null;
  lastUpdatedAt: string | null;
  lastUpdatedBy: string | null;
  /** "12 pairs", "3 curves (NGN, GHS, USD)", "3 series". */
  coverage: string;
  count: number;
  ageDays: number | null;
  stale: boolean;
}

/** Status of each kind of market data against the SLA, as at `refDate` (the working date, else today). */
export function marketDataStatus(
  fxRates: StoredFxRate[],
  curves: StoredYieldCurve[],
  indicators: EconomicIndicator[],
  slaDays: number,
  refDate: IsoDate,
): MarketKindStatus[] {
  const latestBy = <T extends { updatedAt: string; updatedBy: string }>(rows: T[]) =>
    rows.reduce<T | null>((m, r) => (!m || (r.updatedAt ?? '') > (m.updatedAt ?? '') ? r : m), null);

  const fx = fxRates.filter((r) => r.asOfDate <= refDate);
  const fxDate = fx.reduce<string | null>((m, r) => (!m || r.asOfDate > m ? r.asOfDate : m), null);
  const pairs = new Set(fx.map((r) => `${r.base}/${r.quote}`));
  const fxLatest = latestBy(fxRates);

  const cv = curves.filter((c) => c.isActive && c.asOfDate <= refDate);
  const cvDate = cv.reduce<string | null>((m, c) => (!m || c.asOfDate > m ? c.asOfDate : m), null);
  const curveCurrencies = Array.from(new Set(cv.map((c) => c.currency))).sort();
  const cvLatest = latestBy(curves);

  const ind = indicators.filter((i) => i.isActive !== false);
  const indDate = ind.reduce<string | null>((m, i) => {
    const d =
      [...i.observations]
        .filter((o) => o.asOfDate <= refDate)
        .map((o) => o.asOfDate)
        .sort()
        .at(-1) ?? null;
    return !m || (d && d > m) ? d : m;
  }, null);
  const indLatest = latestBy(indicators);

  const mk = (
    kind: MarketKindStatus['kind'],
    lastDate: string | null,
    latest: { updatedAt: string; updatedBy: string } | null,
    count: number,
    coverage: string,
    staleApplies: boolean,
  ): MarketKindStatus => {
    const ageDays = lastDate ? Math.max(0, daysBetween(lastDate, refDate)) : null;
    return {
      kind,
      lastDate,
      lastUpdatedAt: latest?.updatedAt ?? null,
      lastUpdatedBy: latest?.updatedBy ?? null,
      coverage,
      count,
      ageDays,
      stale: staleApplies && ageDays !== null && ageDays > slaDays,
    };
  };

  return [
    mk('FX rates', fxDate, fxLatest, pairs.size, `${pairs.size} pair${pairs.size === 1 ? '' : 's'}`, true),
    mk(
      'Yield curves',
      cvDate,
      cvLatest,
      curveCurrencies.length,
      curveCurrencies.length > 0
        ? `${curveCurrencies.length} curve currenc${curveCurrencies.length === 1 ? 'y' : 'ies'} (${curveCurrencies.join(', ')})`
        : 'none',
      true,
    ),
    // Indicators feed calibration, not the run - reported, never stale-flagged.
    mk('Indicators', indDate, indLatest, ind.length, `${ind.length} series`, false),
  ];
}

// ─── The readiness check ───────────────────────────────────────────────────

const RULE_HREF: Partial<Record<RuleKind, string>> = {
  ProductCharacteristic: '/rules/product-characteristics',
  BehaviourPattern: '/assumptions',
  TimeBucket: '/rules/time-buckets',
  FtpRule: '/rules/ftp',
  CostAllocation: '/rules/cost-allocation',
  CreditLoss: '/rules/credit-loss',
  CapitalAllocation: '/rules/capital',
};

/** The latest active rule in force for a scope: the affiliate's own, else the Group default (non-gated kinds). */
export function activeRuleFor(rules: RuleMeta[], affiliateCode: string): RuleMeta | null {
  const active = rules.filter((r) => r.isActive);
  const latest = (list: RuleMeta[]) =>
    [...list].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0] ?? null;
  const own = affiliateCode !== 'GROUP' ? latest(active.filter((r) => r.affiliateCode === affiliateCode)) : null;
  return own ?? latest(active.filter((r) => r.affiliateCode === null));
}

/** Gated rules in scope saved but not yet approved (a newer version waiting). */
function pendingFor(rules: RuleMeta[], affiliateCode: string, approvals: ApprovalRequest[]): RuleMeta[] {
  return rules.filter(
    (r) =>
      r.isActive && (r.affiliateCode === null || r.affiliateCode === affiliateCode) && !isRuleApproved(r, approvals),
  );
}

function verdictOf(items: ReadinessItem[]): ReadinessVerdict {
  if (items.some((i) => i.blocking && i.status !== 'ok')) return 'Blocked';
  if (items.some((i) => i.status !== 'ok')) return 'Ready with warnings';
  return 'Ready';
}

export function computeReadiness(inp: ReadinessInputs): Readiness {
  const items: ReadinessItem[] = [];
  const isGroup = inp.affiliateCode === 'GROUP';
  const affiliate = isGroup ? null : (inp.affiliates.find((a) => a.code === inp.affiliateCode) ?? null);
  const liveAffiliates = inp.affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');
  const date = inp.asOfDate;
  const refDate = date ?? inp.today;
  const name = affiliate?.name ?? (isGroup ? 'Group' : inp.affiliateCode);
  const code = inp.affiliateCode;
  const uploadHref = (slug: string) =>
    isGroup ? '/data/operations?upload=1' : `/data/operations?upload=1&source=${defaultSourceId(code, slug)}`;

  // ── Setup ────────────────────────────────────────────────────────────
  if (isGroup) {
    items.push({
      key: 'live',
      label: 'Affiliates Live',
      category: 'Setup',
      scope: 'Group',
      status: liveAffiliates.length > 0 ? 'ok' : 'missing',
      detail:
        liveAffiliates.length > 0
          ? `${liveAffiliates.length} Live: ${liveAffiliates.map((a) => a.name).join(', ')}.`
          : 'No affiliate is Live yet - a Group run has nothing to consolidate.',
      blocking: true,
      fixPermission: 'group.manage',
      fixHref: '/affiliates',
      fixLabel: 'Open affiliates',
    });
  } else {
    const status = affiliate?.status ?? 'Onboarding';
    items.push({
      key: 'live',
      label: 'Affiliate is Live',
      category: 'Setup',
      scope: 'Affiliate',
      status: status === 'Live' ? 'ok' : 'missing',
      detail: !affiliate
        ? 'No affiliate selected.'
        : status === 'Live'
          ? `${name} is Live.`
          : status === 'Testing'
            ? `${name} is in Testing - waiting for an Approver to approve go-live.`
            : status === 'Suspended'
              ? `${name} is Suspended.`
              : `${name} is still being onboarded.`,
      blocking: true,
      fixPermission: status === 'Testing' ? 'approvals.approve' : 'group.manage',
      fixHref: status === 'Testing' ? '/controls' : '/affiliates',
      fixLabel: status === 'Testing' ? 'Open Approvals' : 'Open affiliates',
    });
  }

  // ── Data ─────────────────────────────────────────────────────────────
  const positionBatches = !date
    ? []
    : isGroup
      ? liveAffiliates.flatMap((a) => currentPositionBatches(inp.batches, a.code, date))
      : currentPositionBatches(inp.batches, code, date);
  const noPositions = positionBatches.length === 0;

  if (!date) {
    items.push({
      key: 'date',
      label: 'Positions committed',
      category: 'Data',
      scope: 'Affiliate',
      status: 'missing',
      detail: isGroup
        ? 'No Live affiliate has committed position data yet.'
        : `No position data has been committed for ${name} yet.`,
      blocking: true,
      fixPermission: 'data.upload',
      fixHref: uploadHref('LOANS'),
      fixLabel: 'Upload positions',
    });
  } else if (isGroup) {
    items.push({
      key: 'positions',
      label: 'Positions committed',
      category: 'Data',
      scope: 'Affiliate',
      status: noPositions ? 'missing' : 'ok',
      detail: noPositions
        ? `No Live affiliate has committed position data for ${date}.`
        : `${new Set(positionBatches.map((b) => b.affiliateCode)).size} affiliate(s) have committed positions for ${date}.`,
      blocking: true,
      fixPermission: 'data.upload',
      fixHref: '/data/operations?upload=1',
      fixLabel: 'Upload positions',
    });
  } else {
    // A legacy whole-book load (the retired single Positions source) still completes the book on its own.
    const legacy = currentBatch(inp.batches, code, 'Positions', date);
    const required = affiliate?.requiredContributors ?? ALL_CONTRIBUTORS;
    for (const c of ALL_CONTRIBUTORS) {
      const b = currentBatch(inp.batches, code, 'Positions', date, c);
      const isRequired = required.includes(c);
      const ok = !!b || !!legacy;
      items.push({
        key: `positions.${c}`,
        label: `${c} positions`,
        category: 'Data',
        scope: 'Affiliate',
        status: ok ? 'ok' : isRequired ? 'missing' : 'default',
        detail: b
          ? `Committed ${b.committedAt ? b.committedAt.slice(0, 10) : date} - ${b.rowsAccepted.toLocaleString()} position(s) (${b.fileName}).`
          : legacy
            ? `Included in the whole-book file ${legacy.fileName}.`
            : isRequired
              ? `Not yet submitted for ${date}.`
              : `Not required for ${name}.`,
        // Only "nothing at all" blocks; one missing contributor runs on an incomplete book.
        blocking: noPositions,
        degradation:
          ok || noPositions ? undefined : `The book is incomplete - results exclude ${c.toLowerCase()} positions.`,
        fixPermission: 'data.upload',
        fixHref: uploadHref(c.toUpperCase()),
        fixLabel: `Upload ${c.toLowerCase()}`,
      });
    }

    const gl = currentBatch(inp.batches, code, 'GeneralLedger', date);
    items.push({
      key: 'gl',
      label: 'General ledger uploaded',
      category: 'Data',
      scope: 'Affiliate',
      status: gl ? 'ok' : 'missing',
      detail: gl
        ? `Committed ${gl.committedAt ? gl.committedAt.slice(0, 10) : date} (${gl.fileName}).`
        : `No general ledger for ${date}.`,
      blocking: false,
      degradation: gl
        ? undefined
        : 'Positions cannot be checked against the ledger - the run is flagged as unreconciled.',
      fixPermission: 'data.upload',
      fixHref: uploadHref('GL'),
      fixLabel: 'Upload GL',
    });

    const unreconciled = positionBatches.filter((b) => !b.reconciledAt);
    items.push({
      key: 'reconciled',
      label: 'Positions reconciled to the ledger',
      category: 'Data',
      scope: 'Affiliate',
      status: noPositions ? 'missing' : unreconciled.length === 0 ? 'ok' : 'warning',
      detail: noPositions
        ? 'Waiting for positions.'
        : unreconciled.length === 0
          ? 'Signed off against the general ledger.'
          : !gl
            ? 'Waiting for the general ledger.'
            : `${unreconciled.length} of ${positionBatches.length} position file(s) not yet signed off against the ledger.`,
      blocking: false,
      degradation: unreconciled.length === 0 && !noPositions ? undefined : 'The run is flagged as unreconciled.',
      fixPermission: 'data.upload',
      fixHref: `/data/operations?source=${defaultSourceId(code, 'GL')}`,
      fixLabel: 'Open ledger check',
    });

    if (inp.positions && inp.positions.length > 0 && affiliate) {
      const ccy = affiliate.functionalCurrency;
      const fx = buildFxTable('USD', inp.fxRates, date);
      let assets = 0;
      let funding = 0;
      let convertible = true;
      for (const p of inp.positions) {
        if (!positionBatches.some((b) => b.id === p.batchId)) continue;
        let amount = p.amount;
        try {
          amount = convert(p.amount, p.currency, ccy, fx);
        } catch {
          convertible = false;
        }
        if (p.category === 'Asset') assets += amount;
        else funding += amount;
      }
      const difference = assets - funding;
      const tolerance = Math.abs(assets) * 0.0001;
      const balanced = Math.abs(difference) <= tolerance;
      items.push({
        key: 'bookBalance',
        label: 'Combined book balances',
        category: 'Data',
        scope: 'Affiliate',
        status: balanced ? 'ok' : 'warning',
        detail: balanced
          ? 'Assets equal liabilities plus equity across the committed files.'
          : `Assets differ from liabilities plus equity by ${Math.round(difference).toLocaleString()} ${ccy}${convertible ? '' : ' (some currencies could not be converted)'}.`,
        blocking: false,
        degradation: balanced ? undefined : 'The run is flagged: the combined book does not balance.',
        fixPermission: 'data.upload',
        fixHref: '/data/operations',
        fixLabel: 'Review uploads',
      });
    }
  }

  // ── From Group: market data ─────────────────────────────────────────
  const reportingCurrency = reportingCurrencyOf(code, inp.affiliates);
  const currencies = currenciesInUse(code, inp.affiliates);
  const fxTable = buildFxTable('USD', inp.fxRates, refDate);
  const missingFx = missingRates(currencies, reportingCurrency, fxTable);
  const market = marketDataStatus(inp.fxRates, inp.yieldCurves, inp.indicators ?? [], inp.slaDays, refDate);
  const fxStatus = market[0]!;
  const curveStatus = market[1]!;
  const updated = (s: MarketKindStatus) =>
    s.lastDate ? ` Latest ${s.lastDate}${s.lastUpdatedBy ? `, loaded by ${s.lastUpdatedBy}` : ''}.` : '';
  items.push({
    key: 'fx',
    label: 'FX rates for every currency in use',
    category: 'From Group',
    scope: 'Group',
    status: missingFx.length === 0 ? 'ok' : 'missing',
    detail:
      currencies.length === 0
        ? 'No currencies declared yet.'
        : missingFx.length === 0
          ? `Rates available for ${currencies.join(', ')}.${updated(fxStatus)}`
          : `No rate for ${missingFx.join(', ')} - amounts in ${missingFx.length === 1 ? 'it' : 'them'} cannot be converted.${updated(fxStatus)}`,
    blocking: true,
    fixPermission: 'data.upload',
    fixHref: '/data/market/fx',
    fixLabel: 'Upload market data',
  });

  const functional = isGroup
    ? Array.from(new Set(liveAffiliates.map((a) => a.functionalCurrency)))
    : affiliate
      ? [affiliate.functionalCurrency]
      : [];
  const missingCurves = functional.filter(
    (c) => !inp.yieldCurves.some((cv) => cv.currency === c && cv.isActive && cv.asOfDate <= refDate),
  );
  items.push({
    key: 'curves',
    label: 'Yield curves for functional currencies',
    category: 'From Group',
    scope: 'Group',
    status: missingCurves.length === 0 ? 'ok' : 'missing',
    detail:
      functional.length === 0
        ? 'No functional currency yet.'
        : missingCurves.length === 0
          ? `Curves available for ${functional.join(', ')}.${updated(curveStatus)}`
          : `No curve for ${missingCurves.join(', ')} on or before ${refDate}.`,
    blocking: false,
    degradation:
      missingCurves.length === 0
        ? undefined
        : 'Transfer pricing: no curve, positions unpriced. EVE discounting falls back to a flat basis.',
    fixPermission: 'data.upload',
    fixHref: '/data/market/curves',
    fixLabel: 'Upload market data',
  });

  const staleKinds = market.filter((m) => m.stale);
  items.push({
    key: 'freshness',
    label: 'Market data within its freshness limit',
    category: 'From Group',
    scope: 'Group',
    status: staleKinds.length === 0 ? 'ok' : 'warning',
    detail:
      staleKinds.length === 0
        ? `Within ${inp.slaDays} days of ${refDate}.`
        : staleKinds.map((m) => `${m.kind} ${m.ageDays} days old (limit ${inp.slaDays})`).join('; ') + '.',
    blocking: false,
    degradation:
      staleKinds.length === 0
        ? undefined
        : 'Results use the most recent rates on file, which are older than the agreed limit.',
    fixPermission: 'data.upload',
    fixHref: '/data/market',
    fixLabel: 'Upload market data',
  });

  // ── Rules ────────────────────────────────────────────────────────────
  const gated = (kind: RuleKind, rules: RuleMeta[], label: string, degradation: string, notConfigured: string) => {
    const approved = pickApprovedRule(rules, code, inp.approvals);
    const pending = pendingFor(rules, code, inp.approvals);
    items.push({
      key: `rule.${kind}`,
      label,
      category: 'Rules',
      scope: approved?.affiliateCode ? 'Affiliate' : 'Group',
      status: approved ? (pending.length > 0 ? 'warning' : 'ok') : 'missing',
      detail: approved
        ? `${approved.name} v${approved.version} (approved${approved.affiliateCode ? '' : ', Group default'}).` +
          (pending.length > 0 ? ` A newer version is waiting for approval.` : '')
        : pending.length > 0
          ? `${pending[0]!.name} v${pending[0]!.version} is waiting for approval.`
          : notConfigured,
      blocking: false,
      degradation: approved ? undefined : degradation,
      fixPermission: pending.length > 0 && !approved ? 'approvals.approve' : 'rules.edit',
      fixHref: pending.length > 0 && !approved ? '/controls' : (RULE_HREF[kind] ?? '/assumptions/rules'),
      fixLabel: pending.length > 0 && !approved ? 'Open Approvals' : 'Set up',
    });
  };

  gated(
    'ProductCharacteristic',
    inp.rules.productCharacteristic,
    'Product characteristics',
    'LCR and NSFR use the liquidity treatment carried in the files; positions without one are reported "Not classified".',
    'Not configured.',
  );
  gated(
    'BehaviourPattern',
    inp.rules.behaviourPattern,
    'Behaviour patterns',
    'Gap and stress use contractual timing - behavioural assumptions not configured.',
    'Not configured.',
  );

  const bucket = activeRuleFor(inp.rules.timeBucket, code);
  items.push({
    key: 'rule.TimeBucket',
    label: 'Time bucket ladder',
    category: 'Rules',
    scope: bucket?.affiliateCode ? 'Affiliate' : 'Group',
    status: bucket ? 'ok' : 'default',
    detail: bucket ? `${bucket.name} v${bucket.version}.` : 'Standard ladder in use (overnight to 5 years and over).',
    blocking: false,
    degradation: bucket ? undefined : 'Gaps use the standard ladder.',
    fixPermission: 'rules.edit',
    fixHref: '/rules/time-buckets',
    fixLabel: 'Set up',
  });

  const ftp = activeRuleFor(inp.rules.ftp, code);
  items.push({
    key: 'rule.FtpRule',
    label: 'Transfer pricing (FTP) rule',
    category: 'Rules',
    scope: ftp?.affiliateCode ? 'Affiliate' : 'Group',
    status: ftp ? 'ok' : 'missing',
    detail: ftp ? `${ftp.name} v${ftp.version}.` : 'Not configured.',
    blocking: false,
    degradation: ftp ? undefined : 'Transfer pricing is blank.',
    fixPermission: 'rules.edit',
    fixHref: '/rules/ftp',
    fixLabel: 'Set up',
  });

  const profit = [
    { label: 'cost allocation', rule: pickApprovedRule(inp.rules.costAllocation, code, inp.approvals) },
    { label: 'credit loss', rule: pickApprovedRule(inp.rules.creditLoss, code, inp.approvals) },
    { label: 'capital', rule: pickApprovedRule(inp.rules.capital, code, inp.approvals) },
  ];
  const missingProfit = profit.filter((p) => !p.rule).map((p) => p.label);
  const pendingProfit = [
    ...pendingFor(inp.rules.costAllocation, code, inp.approvals),
    ...pendingFor(inp.rules.creditLoss, code, inp.approvals),
    ...pendingFor(inp.rules.capital, code, inp.approvals),
  ];
  items.push({
    key: 'rule.Profitability',
    label: 'Profitability rules',
    category: 'Rules',
    scope: 'Group',
    status: missingProfit.length === 0 ? (pendingProfit.length > 0 ? 'warning' : 'ok') : 'missing',
    detail:
      missingProfit.length === 0
        ? 'Cost allocation, credit loss and capital approved.' +
          (pendingProfit.length > 0 ? ' A newer version is waiting for approval.' : '')
        : `No approved ${missingProfit.join(', ')} rule${missingProfit.length === 1 ? '' : 's'}${pendingProfit.length > 0 ? ` (${pendingProfit.length} waiting for approval)` : ''}.`,
    blocking: false,
    degradation: missingProfit.length === 0 ? undefined : 'Profitability layers are blank.',
    fixPermission: pendingProfit.length > 0 && missingProfit.length > 0 ? 'approvals.approve' : 'rules.edit',
    fixHref: pendingProfit.length > 0 && missingProfit.length > 0 ? '/controls' : '/rules/cost-allocation',
    fixLabel: pendingProfit.length > 0 && missingProfit.length > 0 ? 'Open Approvals' : 'Set up',
  });

  // ── Calibration ──────────────────────────────────────────────────────
  if (!isGroup) {
    const hasHistory = (domain: 'BalanceHistory' | 'AccountHistory') =>
      inp.batches.some((b) => b.affiliateCode === code && b.domain === domain && b.status === 'Committed');
    const bal = hasHistory('BalanceHistory');
    const acct = hasHistory('AccountHistory');
    items.push({
      key: 'history',
      label: 'History for behavioural models',
      category: 'Calibration',
      scope: 'Affiliate',
      status: bal && acct ? 'ok' : bal || acct ? 'warning' : 'missing',
      detail:
        bal && acct
          ? 'Balance and account history loaded.'
          : bal
            ? 'Balance history loaded; no account history (prepayment and roll-over cannot be calibrated).'
            : acct
              ? 'Account history loaded; no balance history (deposit run-off cannot be calibrated).'
              : 'No balance or account history loaded.',
      blocking: false,
      degradation: bal && acct ? undefined : 'Behavioural calibration is unavailable; runs are unaffected.',
      fixPermission: 'data.upload',
      fixHref: uploadHref(bal ? 'ACCTHIST' : 'BALHIST'),
      fixLabel: 'Upload history',
    });
  }

  // ── Governance ───────────────────────────────────────────────────────
  if (date) {
    const scopeRuns = inp.runs.filter((r) => r.affiliateCode === code);
    const series = buildSeries(scopeRuns).find((s) => s.key === seriesKeyFor(code, date)) ?? null;
    const lock = seriesLockReason(series, scopeRuns);
    const latest = series?.latest ?? null;
    const pendingSignOff = latest ? signOffStatusOf(latest) === 'PendingSignOff' : false;
    items.push({
      key: 'series',
      label: 'Run series open',
      category: 'Governance',
      scope: 'Affiliate',
      status: lock ? 'missing' : 'ok',
      detail: lock ?? (latest ? `Next run for ${date} becomes a new version.` : `No run yet for ${date}.`),
      blocking: true,
      fixPermission: pendingSignOff ? 'approvals.approve' : 'run.execute',
      fixHref: pendingSignOff ? '/controls' : latest ? `/execution/history?run=${latest.id}` : '/execution',
      fixLabel: pendingSignOff ? 'Open Approvals' : 'Reopen',
    });
  }

  if (inp.selection) {
    const sel = inp.selection;
    items.push({
      key: 'elements',
      label: 'Calculations selected',
      category: 'Governance',
      scope: 'Affiliate',
      status: sel.elements.length > 0 ? 'ok' : 'missing',
      detail:
        sel.elements.length > 0
          ? `${sel.elements.length} calculation(s) selected.`
          : 'Select at least one calculation.',
      blocking: true,
      fixPermission: 'run.execute',
      fixHref: '/execution',
      fixLabel: 'Choose calculations',
    });
    items.push({
      key: 'unapproved',
      label: 'Only approved rules selected',
      category: 'Governance',
      scope: 'Affiliate',
      status: sel.unapproved.length === 0 ? 'ok' : 'missing',
      detail:
        sel.unapproved.length === 0
          ? 'Every selected rule and scenario is approved.'
          : `Not yet approved: ${sel.unapproved.join(', ')}.`,
      blocking: true,
      fixPermission: 'approvals.approve',
      fixHref: '/controls',
      fixLabel: 'Open Approvals',
    });
    (sel.extra ?? []).forEach((message, i) =>
      items.push({
        key: `extra.${i}`,
        label: 'Run set-up',
        category: 'Governance',
        scope: 'Affiliate',
        status: 'missing',
        detail: message,
        blocking: true,
        fixPermission: 'run.execute',
        fixHref: '/execution',
        fixLabel: 'Fix set-up',
      }),
    );
  }

  const blockers = items.filter((i) => i.blocking && i.status !== 'ok');
  const warnings = items.filter((i) => !(i.blocking && i.status !== 'ok') && i.status !== 'ok');
  return { affiliateCode: code, asOfDate: date, items, verdict: verdictOf(items), blockers, warnings };
}

/** One line per unresolved blocking item - what the Run screen shows as "Cannot run yet". */
export function blockerMessages(r: Readiness): string[] {
  return r.blockers.map((b) => `${b.label}: ${b.detail}`);
}

export const READINESS_CATEGORIES: ReadinessCategory[] = [
  'Setup',
  'Data',
  'From Group',
  'Rules',
  'Calibration',
  'Governance',
];
