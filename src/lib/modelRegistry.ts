/**
 * Behavioural-model workbench logic - pure functions shared by the history upload screen, the
 * calibration workbench, the model register and the proposal flow. No React, no storage: the hooks
 * in modelHooks.ts feed these from the repository, and the tests drive them directly.
 *
 *   history rows  → coverage per segment (is there enough to fit?)
 *   spec + rows   → runCalibration() → ModelRun + chart series
 *   ModelRun      → buildProposal() → a new version of the affiliate's BehaviourPattern / Prepayment rule
 *   ModelRun + approval requests → effectiveModelStatus() (Approved is derived, never stored)
 */

import {
  calibrate,
  estimateCoreDeposits,
  estimateDecay,
  estimatePrepayment,
  InsufficientHistoryError,
  MIN_MONTHLY_POINTS,
  ModelFitError,
  monthKey,
  monthlyPolicySeries,
  segmentHistory,
  segmentIdOf,
  stabilityMetrics,
  toDepositBetas,
  toPrepaymentAssumptions,
  type AccountObservation,
  type BalanceObservation,
  type BehaviouralModelType,
  type CoreMethod,
  type DecayMethod,
  type ModelRun,
  type MonthKey,
  type PrepaymentEstimate,
  type SegmentDimension,
  type SegmentKey,
} from '@/engine/behaviouralModels';
import { DEFAULT_BETAS, DEFAULT_PATTERNS, type BehaviourPattern } from '@/engine/behavioural';
import { pickApprovedRule } from '@/lib/ruleApproval';
import type {
  BehaviourPatternRule,
  PrepaymentAssumption,
  PrepaymentRule,
  TermDepositBehaviourAssumption,
} from '@/engine/ruleTypes';
import type { ApprovalRequest, BehaviouralTag, EconomicIndicator, IsoDate, Position, RuleMeta } from '@/engine/types';
import type {
  HistoryUploadMeta,
  ModelRunChartPoint,
  StoredAccountObservation,
  StoredBalanceObservation,
  StoredModelRun,
} from '@/store/repository';

// ─────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────

export const MODEL_TYPE_LABEL: Record<BehaviouralModelType, string> = {
  DepositRunoff: 'Deposit stability & run-off',
  RepricingBeta: 'Repricing beta',
  Prepayment: 'Loan prepayment',
  TermDeposit: 'Term-deposit renewal & early withdrawal',
};

export const SEGMENT_DIMENSION_LABEL: Record<SegmentDimension, string> = {
  productCode: 'Product',
  customerType: 'Customer type',
  currency: 'Currency',
  tenorBand: 'Tenor band',
  affiliateCode: 'Affiliate',
};

/** Plain-language segment name: "Product SAV-RET · Currency NGN". */
export function segmentLabel(key: SegmentKey): string {
  const parts = (Object.keys(key) as SegmentDimension[]).map((d) => `${SEGMENT_DIMENSION_LABEL[d]} ${key[d]}`);
  return parts.length === 0 ? 'Whole book' : parts.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────
// Stored rows
// ─────────────────────────────────────────────────────────────────────────

export type HistoryKind = 'Balance' | 'Account';

export function balanceRowId(o: BalanceObservation): string {
  return ['B', o.affiliateCode, o.asOfDate, o.productCode, o.customerType ?? '', o.currency, o.tenorBand ?? ''].join(
    '|',
  );
}

export function accountRowId(o: AccountObservation): string {
  return ['A', o.affiliateCode, o.accountNumber, o.asOfDate].join('|');
}

export function toStoredBalanceRows(
  rows: readonly BalanceObservation[],
  meta: HistoryUploadMeta,
): StoredBalanceObservation[] {
  return rows.map((r) => ({ ...r, ...meta, id: balanceRowId(r) }));
}

export function toStoredAccountRows(
  rows: readonly AccountObservation[],
  meta: HistoryUploadMeta,
): StoredAccountObservation[] {
  return rows.map((r) => ({ ...r, ...meta, id: accountRowId(r) }));
}

/** How many of `incoming` would overwrite a row already stored (same natural key). */
export function countReplacements(incomingIds: readonly string[], existing: ReadonlyArray<{ id: string }>): number {
  const have = new Set(existing.map((e) => e.id));
  return incomingIds.filter((id) => have.has(id)).length;
}

export interface HistoryUploadSummary extends HistoryUploadMeta {
  rows: number;
  firstDate: IsoDate;
  lastDate: IsoDate;
}

/** One line per upload still holding rows (an upload fully superseded by a later one disappears). */
export function summariseUploads(
  rows: ReadonlyArray<HistoryUploadMeta & { asOfDate: IsoDate }>,
): HistoryUploadSummary[] {
  const byId = new Map<string, HistoryUploadSummary>();
  for (const r of rows) {
    const s = byId.get(r.uploadId);
    if (!s) {
      byId.set(r.uploadId, {
        uploadId: r.uploadId,
        fileName: r.fileName,
        uploadedBy: r.uploadedBy,
        uploadedAt: r.uploadedAt,
        rows: 1,
        firstDate: r.asOfDate,
        lastDate: r.asOfDate,
      });
    } else {
      s.rows += 1;
      if (r.asOfDate < s.firstDate) s.firstDate = r.asOfDate;
      if (r.asOfDate > s.lastDate) s.lastDate = r.asOfDate;
    }
  }
  return [...byId.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

// ─────────────────────────────────────────────────────────────────────────
// Coverage
// ─────────────────────────────────────────────────────────────────────────

function monthIdx(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
}

function monthFromIdx(i: number): MonthKey {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

function gapsBetween(months: readonly MonthKey[]): MonthKey[] {
  if (months.length === 0) return [];
  const have = new Set(months);
  const out: MonthKey[] = [];
  for (let i = monthIdx(months[0]!); i <= monthIdx(months[months.length - 1]!); i += 1) {
    const m = monthFromIdx(i);
    if (!have.has(m)) out.push(m);
  }
  return out;
}

export interface SegmentCoverage {
  segmentId: string;
  key: SegmentKey;
  label: string;
  currency: string;
  months: number;
  firstMonth: MonthKey;
  lastMonth: MonthKey;
  gaps: MonthKey[];
  /** At least MIN_MONTHLY_POINTS month-ends - the minimum any estimator accepts. */
  usable: boolean;
  /** Months that carry a deposit rate - what a repricing beta needs. */
  ratedMonths: number;
  latestBalance: number;
  /** Linear trend per month as a share of mean balance; positive = growing book. Null below 3 months. */
  trendGrowthPerMonth: number | null;
}

export interface CoverageResult<T> {
  segments: T[];
  /** Set when the chosen segmentation cannot be built (e.g. it mixes currencies in one segment). */
  error: string | null;
}

export function balanceCoverage(
  rows: readonly BalanceObservation[],
  by: SegmentDimension[],
): CoverageResult<SegmentCoverage> {
  try {
    const series = segmentHistory(rows, { by });
    return {
      error: null,
      segments: series.map((s) => {
        const balances = s.points.map((p) => p.balance);
        return {
          segmentId: s.segmentId,
          key: s.key,
          label: segmentLabel(s.key),
          currency: s.currency,
          months: s.points.length,
          firstMonth: s.points[0]?.month ?? '',
          lastMonth: s.points[s.points.length - 1]?.month ?? '',
          gaps: s.missingMonths,
          usable: s.points.length >= MIN_MONTHLY_POINTS,
          ratedMonths: s.points.filter((p) => p.ratePercent !== null).length,
          latestBalance: balances[balances.length - 1] ?? 0,
          trendGrowthPerMonth: balances.length >= 3 ? stabilityMetrics(balances).trendGrowthPerMonth : null,
        };
      }),
    };
  } catch (e) {
    return { segments: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface AccountPoolCoverage {
  segmentId: string;
  productCode: string;
  currency: string;
  label: string;
  accounts: number;
  snapshots: number;
  months: number;
  firstMonth: MonthKey;
  lastMonth: MonthKey;
  gaps: MonthKey[];
  usable: boolean;
  firstDate: IsoDate;
  lastDate: IsoDate;
  /** Rows carrying a scheduled (contractual) balance - prepayment needs these. */
  withScheduledBalance: number;
  /** Rows carrying a maturity date - term-deposit behaviour needs these. */
  withMaturity: number;
}

export function accountCoverage(rows: readonly AccountObservation[]): AccountPoolCoverage[] {
  const pools = new Map<string, AccountObservation[]>();
  for (const r of rows) {
    const k = `${r.productCode}|${r.currency.toUpperCase()}`;
    const list = pools.get(k) ?? [];
    list.push(r);
    pools.set(k, list);
  }
  return [...pools.entries()]
    .map(([k, list]) => {
      const [productCode, currency] = k.split('|') as [string, string];
      const dates = [...new Set(list.map((r) => r.asOfDate))].sort();
      const months = [...new Set(dates.map(monthKey))].sort();
      return {
        segmentId: segmentIdOf({ productCode, currency }, ['productCode', 'currency']),
        productCode,
        currency,
        label: `Product ${productCode} · Currency ${currency}`,
        accounts: new Set(list.map((r) => r.accountNumber)).size,
        snapshots: dates.length,
        months: months.length,
        firstMonth: months[0] ?? '',
        lastMonth: months[months.length - 1] ?? '',
        gaps: gapsBetween(months),
        usable: months.length >= MIN_MONTHLY_POINTS,
        firstDate: dates[0] ?? '',
        lastDate: dates[dates.length - 1] ?? '',
        withScheduledBalance: list.filter((r) => r.scheduledBalance !== undefined).length,
        withMaturity: list.filter((r) => r.maturityDate !== undefined).length,
      };
    })
    .sort((a, b) => a.segmentId.localeCompare(b.segmentId));
}

// ─────────────────────────────────────────────────────────────────────────
// Calibration
// ─────────────────────────────────────────────────────────────────────────

export type WorkbenchSpec =
  | {
      modelType: 'DepositRunoff';
      segmentation: SegmentDimension[];
      segmentId: string;
      coreMethod: CoreMethod;
      windowMonths: number;
      /** Volatility method only. */
      coreConfidence: number;
      decayMethod: DecayMethod;
      /** OutflowPercentile only. */
      outflowConfidence: number;
      appliesTo: BehaviouralTag[];
      patternName: string;
      holdoutMonths: number;
      /** MAPE threshold, %. */
      tolerance: number;
    }
  | {
      modelType: 'RepricingBeta';
      segmentation: SegmentDimension[];
      segmentId: string;
      policyIndicatorId: string;
      behaviouralTag: BehaviouralTag;
      maxLagMonths: number;
      holdoutMonths: number;
      /** MAE threshold, percentage points of deposit rate. */
      tolerance: number;
    }
  | {
      modelType: 'Prepayment';
      productCode: string;
      currency: string;
      minSnapshots: number;
      holdoutMonths: number;
      /** MAE threshold on monthly SMM (0-1). */
      tolerance: number;
    }
  | {
      modelType: 'TermDeposit';
      productCode: string;
      currency: string;
      periodFrom: IsoDate;
      periodTo: IsoDate;
      minAccounts: number;
    };

export interface CalibrationData {
  balances: ReadonlyArray<BalanceObservation & Partial<HistoryUploadMeta>>;
  accounts: ReadonlyArray<AccountObservation & Partial<HistoryUploadMeta>>;
  indicators: readonly EconomicIndicator[];
  now?: string;
}

export interface CalibrationOutcome {
  run: ModelRun;
  chart: ModelRunChartPoint[];
  chartUnit: StoredModelRun['chartUnit'];
  historyUploadIds: string[];
  calibrationOptions: StoredModelRun['calibrationOptions'];
}

const uploadIdsOf = (rows: ReadonlyArray<Partial<HistoryUploadMeta>>): string[] =>
  [...new Set(rows.map((r) => r.uploadId).filter((u): u is string => !!u))].sort();

function rowsOfSegment<T extends BalanceObservation>(
  rows: readonly T[],
  by: SegmentDimension[],
  segmentId: string,
): T[] {
  return rows.filter((r) => {
    const key: SegmentKey = {};
    for (const d of by) key[d] = (r[d] ?? '(none)') || '(none)';
    return segmentIdOf(key, by) === segmentId;
  });
}

/** A stable rule-pattern id per segment, so re-proposing the same segment replaces its pattern. */
export function patternIdFor(segmentId: string): string {
  return `BP-MODEL-${segmentId
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()}`;
}

function trainEndFor(
  months: readonly MonthKey[],
  holdout: number,
  minTrain: number,
  context: string,
): MonthKey | undefined {
  if (holdout <= 0) return undefined;
  if (months.length - holdout < minTrain) {
    throw new InsufficientHistoryError(
      `${context} back-test`,
      minTrain + holdout,
      months.length,
      `Holding out ${holdout} month(s) leaves ${Math.max(0, months.length - holdout)} to fit on - reduce the hold-out or upload more history`,
    );
  }
  return months[months.length - 1 - holdout];
}

/** Fit the chosen model in the browser and return the ModelRun plus the series the chart needs. */
export function runCalibration(spec: WorkbenchSpec, data: CalibrationData): CalibrationOutcome {
  const now = data.now;
  switch (spec.modelType) {
    case 'DepositRunoff': {
      if (spec.appliesTo.length === 0)
        throw new ModelFitError('Choose at least one deposit type the fitted pattern applies to');
      const series = segmentHistory(data.balances, { by: spec.segmentation }).find(
        (s) => s.segmentId === spec.segmentId,
      );
      if (!series)
        throw new ModelFitError('That segment has no history under the chosen segmentation - pick a segment again');
      const months = series.points.map((p) => p.month);
      const trainEnd = trainEndFor(months, spec.holdoutMonths, MIN_MONTHLY_POINTS, 'Run-off');
      const core = {
        method: spec.coreMethod,
        windowMonths: spec.windowMonths,
        ...(spec.coreMethod === 'Volatility' ? { confidence: spec.coreConfidence } : {}),
      };
      const decay = {
        method: spec.decayMethod,
        ...(spec.decayMethod === 'OutflowPercentile' ? { confidence: spec.outflowConfidence } : {}),
      };
      const run = calibrate({
        modelType: 'DepositRunoff',
        series,
        core,
        decay,
        pattern: {
          id: patternIdFor(series.segmentId),
          name: spec.patternName || segmentLabel(series.key),
          appliesTo: spec.appliesTo,
        },
        ...(trainEnd
          ? { backtest: { trainEnd, tolerance: { metric: 'MAPE' as const, threshold: spec.tolerance } } }
          : {}),
        ...(now ? { now } : {}),
      });
      const coreEst = estimateCoreDeposits(series, core);
      const fitted = estimateDecay(series, { ...decay, coreAmount: coreEst.coreAmount }).fitted;
      const coreAmount = typeof run.params.coreAmount === 'number' ? run.params.coreAmount : null;
      const segRows = rowsOfSegment(data.balances, spec.segmentation, series.segmentId);
      return {
        run,
        chart: series.points.map((p, i) => ({
          label: p.month,
          actual: p.balance,
          fitted: fitted?.[i] ?? null,
          reference: coreAmount,
        })),
        chartUnit: 'amount',
        historyUploadIds: uploadIdsOf(segRows),
        calibrationOptions: {
          segmentation: spec.segmentation,
          coreMethod: spec.coreMethod,
          windowMonths: spec.windowMonths,
          coreConfidence: spec.coreMethod === 'Volatility' ? spec.coreConfidence : null,
          decayMethod: spec.decayMethod,
          outflowConfidence: spec.decayMethod === 'OutflowPercentile' ? spec.outflowConfidence : null,
          appliesTo: spec.appliesTo,
          patternName: spec.patternName,
          holdoutMonths: spec.holdoutMonths,
          toleranceMapePct: spec.tolerance,
        },
      };
    }

    case 'RepricingBeta': {
      const policy = data.indicators.find((i) => i.id === spec.policyIndicatorId);
      if (!policy) throw new ModelFitError('Pick the policy-rate series the deposit rate is regressed on');
      const series = segmentHistory(data.balances, { by: spec.segmentation }).find(
        (s) => s.segmentId === spec.segmentId,
      );
      if (!series)
        throw new ModelFitError('That segment has no history under the chosen segmentation - pick a segment again');
      const rated = series.points.filter((p) => p.ratePercent !== null);
      const trainEnd = trainEndFor(
        rated.map((p) => p.month),
        spec.holdoutMonths,
        MIN_MONTHLY_POINTS,
        'Repricing beta',
      );
      const run = calibrate({
        modelType: 'RepricingBeta',
        series,
        policy,
        behaviouralTag: spec.behaviouralTag,
        beta: { maxLagMonths: spec.maxLagMonths },
        ...(trainEnd
          ? { backtest: { trainEnd, tolerance: { metric: 'MAE' as const, threshold: spec.tolerance } } }
          : {}),
        ...(now ? { now } : {}),
      });
      const pol = monthlyPolicySeries(policy);
      const beta = Number(run.params.beta);
      const alpha = Number(run.params.intercept);
      const lag = Number(run.params.lagMonths);
      const polAt = (i: number) => pol.get(monthFromIdx(i));
      const chart = rated.map((p, i) => {
        let fitted: number | null = null;
        const prev = rated[i - 1];
        const mi = monthIdx(p.month);
        if (prev && mi - monthIdx(prev.month) === 1) {
          const a = polAt(mi - lag);
          const b = polAt(mi - lag - 1);
          if (a !== undefined && b !== undefined && !Number.isNaN(a) && !Number.isNaN(b)) {
            fitted = prev.ratePercent! + alpha + beta * (a - b);
          }
        }
        const ref = pol.get(p.month);
        return {
          label: p.month,
          actual: p.ratePercent,
          fitted,
          reference: ref === undefined || Number.isNaN(ref) ? null : ref,
        };
      });
      return {
        run,
        chart,
        chartUnit: 'percent',
        historyUploadIds: uploadIdsOf(rowsOfSegment(data.balances, spec.segmentation, series.segmentId)),
        calibrationOptions: {
          segmentation: spec.segmentation,
          policyIndicatorId: policy.id,
          policyIndicatorCode: policy.code,
          behaviouralTag: spec.behaviouralTag,
          maxLagMonths: spec.maxLagMonths,
          holdoutMonths: spec.holdoutMonths,
          toleranceMaePp: spec.tolerance,
        },
      };
    }

    case 'Prepayment': {
      const pool = data.accounts.filter(
        (a) => a.productCode === spec.productCode && a.currency.toUpperCase() === spec.currency.toUpperCase(),
      );
      const months = [...new Set(pool.map((a) => monthKey(a.asOfDate)))].sort();
      const trainEnd = trainEndFor(months, spec.holdoutMonths, 4, 'Prepayment');
      const run = calibrate({
        modelType: 'Prepayment',
        accounts: pool,
        productCode: spec.productCode,
        currency: spec.currency,
        prepayment: { minSnapshots: spec.minSnapshots },
        ...(trainEnd
          ? { backtest: { trainEnd, tolerance: { metric: 'MAE' as const, threshold: spec.tolerance } } }
          : {}),
        ...(now ? { now } : {}),
      });
      const [est] = estimatePrepayment(pool, { minSnapshots: spec.minSnapshots });
      const smm = Number(run.params.smm);
      return {
        run,
        chart: (est?.monthly ?? []).map((m) => ({ label: m.month, actual: m.smm, fitted: smm })),
        chartUnit: 'ratio',
        historyUploadIds: uploadIdsOf(pool),
        calibrationOptions: {
          productCode: spec.productCode,
          currency: spec.currency,
          minSnapshots: spec.minSnapshots,
          holdoutMonths: spec.holdoutMonths,
          toleranceMaeSmm: spec.tolerance,
        },
      };
    }

    case 'TermDeposit': {
      const pool = data.accounts.filter(
        (a) => a.productCode === spec.productCode && a.currency.toUpperCase() === spec.currency.toUpperCase(),
      );
      const run = calibrate({
        modelType: 'TermDeposit',
        accounts: pool,
        productCode: spec.productCode,
        currency: spec.currency,
        period: { periodFrom: spec.periodFrom, periodTo: spec.periodTo, minAccounts: spec.minAccounts },
        ...(now ? { now } : {}),
      });
      return {
        run,
        chart: [],
        chartUnit: 'none',
        historyUploadIds: uploadIdsOf(pool),
        calibrationOptions: {
          productCode: spec.productCode,
          currency: spec.currency,
          periodFrom: spec.periodFrom,
          periodTo: spec.periodTo,
          minAccounts: spec.minAccounts,
        },
      };
    }
  }
}

/** Wrap a calibration for the register: next version for this affiliate + model + segment, status Draft. */
export function toStoredModelRun(
  outcome: CalibrationOutcome,
  ctx: { affiliateCode: string; createdBy: string; existing: readonly StoredModelRun[] },
): StoredModelRun {
  const prior = ctx.existing.filter(
    (r) =>
      r.affiliateCode === ctx.affiliateCode &&
      r.modelType === outcome.run.modelType &&
      r.segment.segmentId === outcome.run.segment.segmentId,
  );
  return {
    ...outcome.run,
    id: `${ctx.affiliateCode}:${outcome.run.id}`,
    version: prior.reduce((m, r) => Math.max(m, r.version), 0) + 1,
    status: 'Draft',
    affiliateCode: ctx.affiliateCode,
    createdBy: ctx.createdBy,
    calibrationOptions: outcome.calibrationOptions,
    historyUploadIds: outcome.historyUploadIds,
    chart: outcome.chart,
    chartUnit: outcome.chartUnit,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Error messages
// ─────────────────────────────────────────────────────────────────────────

export interface FitErrorView {
  title: string;
  message: string;
  hint: string;
  /** The book shows no decay - offer the switch to OutflowPercentile. */
  suggestOutflowPercentile: boolean;
}

export function describeFitError(e: unknown): FitErrorView {
  if (e instanceof InsufficientHistoryError) {
    return {
      title: 'Not enough history to fit this model',
      message: e.message,
      hint: `The model needs at least ${e.required} usable observation(s) and found ${e.actual}. Upload more history in Data → History for models, pick a segment with more months, or shorten the back-test hold-out. Nothing is filled in or assumed for missing months.`,
      suggestOutflowPercentile: false,
    };
  }
  if (e instanceof ModelFitError) {
    const growing = /OutflowPercentile/.test(e.message);
    return {
      title: 'The model could not be fitted to this data',
      message: e.message,
      hint: growing
        ? 'Decay and floor fits need a balance that actually runs off over the window. This segment is growing or flat, so there is no decay to measure. Outflow percentile instead takes the worst monthly outflows observed (e.g. the 5th percentile of month-on-month changes) as the run-off rate - it works for a growing book.'
        : 'Check the segment and options. The data is sufficient in volume, but the model cannot be identified from it as configured.',
      suggestOutflowPercentile: growing,
    };
  }
  return {
    title: 'Fit failed',
    message: e instanceof Error ? e.message : String(e),
    hint: 'This is unexpected - check the uploaded history for unusual values.',
    suggestOutflowPercentile: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Status - Approved is derived from the linked rule version's approval request
// ─────────────────────────────────────────────────────────────────────────

export type EffectiveModelStatus = 'Draft' | 'Proposed' | 'Approved' | 'Rejected' | 'Superseded' | 'Retired';

export function effectiveModelStatus(
  run: Pick<StoredModelRun, 'status' | 'proposedRuleId' | 'proposedRuleVersion' | 'proposedRuleKind'> & { id?: string },
  requests: readonly ApprovalRequest[],
  /** Current rows of the proposed rule kinds - lets a fit carried into a later version be followed there. */
  rules: readonly RuleMeta[] = [],
): { status: EffectiveModelStatus; request: ApprovalRequest | null } {
  if (run.status === 'Retired') return { status: 'Retired', request: null };
  if (!run.proposedRuleId || run.proposedRuleVersion === undefined) return { status: 'Draft', request: null };
  const request =
    [...requests]
      .filter(
        (r) =>
          r.entityId === run.proposedRuleId &&
          r.entityVersion === run.proposedRuleVersion &&
          (!run.proposedRuleKind || r.entityType === run.proposedRuleKind),
      )
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0] ?? null;
  if (!request) return { status: run.status === 'Approved' ? 'Approved' : 'Proposed', request: null };
  switch (request.status) {
    case 'Approved':
      return { status: 'Approved', request };
    case 'Rejected':
      return { status: 'Rejected', request };
    case 'Withdrawn': {
      // A proposal built on a still-pending version (buildProposal's NewVersion basis) withdraws that
      // request but carries its content forward - the rule's lineage records every fit it contains. Such
      // a fit is decided with the later version, not orphaned, so follow it there.
      const proposedVersion = run.proposedRuleVersion;
      const carrier = rules.find(
        (r) =>
          !!run.id &&
          r.id === run.proposedRuleId &&
          r.version > proposedVersion &&
          ((r as { sourceModelRunIds?: string[] }).sourceModelRunIds ?? []).includes(run.id!),
      );
      if (carrier) {
        const later = requests
          .filter(
            (r) =>
              r.entityId === carrier.id &&
              (r.entityVersion ?? 0) > proposedVersion &&
              (r.entityVersion ?? 0) <= carrier.version &&
              r.status !== 'Withdrawn',
          )
          .sort((a, b) => (b.entityVersion ?? 0) - (a.entityVersion ?? 0));
        const approved = later.find((r) => r.status === 'Approved');
        if (approved) return { status: 'Approved', request: approved };
        const pending = later.find((r) => r.status === 'Pending');
        if (pending) return { status: 'Proposed', request: pending };
        const rejected = later.find((r) => r.status === 'Rejected');
        if (rejected) return { status: 'Rejected', request: rejected };
      }
      return { status: 'Superseded', request };
    }
    default:
      return { status: 'Proposed', request };
  }
}

/** Whether a run may be (re)proposed: a fresh draft, or one whose earlier proposal was rejected or superseded. */
export function canPropose(status: EffectiveModelStatus): boolean {
  return status === 'Draft' || status === 'Rejected' || status === 'Superseded';
}

// ─────────────────────────────────────────────────────────────────────────
// Proposal - ModelRun → new rule version
// ─────────────────────────────────────────────────────────────────────────

export class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalError';
  }
}

/** productCode → commonCoaCode from an affiliate's committed positions (the most common mapping wins). */
export function commonCoaByProduct(
  positions: ReadonlyArray<Pick<Position, 'productCode' | 'commonCoaCode'>>,
): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of positions) {
    if (!p.productCode || !p.commonCoaCode) continue;
    const m = counts.get(p.productCode) ?? new Map<string, number>();
    m.set(p.commonCoaCode, (m.get(p.commonCoaCode) ?? 0) + 1);
    counts.set(p.productCode, m);
  }
  const out: Record<string, string> = {};
  for (const [product, m] of counts) {
    out[product] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
  }
  return out;
}

export type ProposalBasis = 'NewVersion' | 'ForkGroupDefault' | 'NewFromEngineDefaults';

export interface Proposal<T extends RuleMeta = RuleMeta> {
  kind: 'BehaviourPattern' | 'Prepayment';
  rule: T;
  basis: ProposalBasis;
  baseRule: T | null;
  /** Plain-language lines describing what changes, for the confirmation panel. */
  changes: string[];
  /** Non-blocking notes (e.g. a pending version this one supersedes). */
  warnings: string[];
}

export interface ProposalContext {
  /** Every rule of the target kind. */
  rules: readonly RuleMeta[];
  requests: readonly ApprovalRequest[];
  /** Needed for Prepayment runs - see commonCoaByProduct. */
  coaByProduct?: Readonly<Record<string, string>>;
  userName: string;
  now: string;
}

export function proposalKindFor(modelType: BehaviouralModelType): 'BehaviourPattern' | 'Prepayment' {
  return modelType === 'Prepayment' ? 'Prepayment' : 'BehaviourPattern';
}

const latestOf = <T extends RuleMeta>(rules: readonly T[]): T | null =>
  [...rules].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
  )[0] ?? null;

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

function summarisePattern(p: BehaviourPattern): string {
  const vol = p.tiers.filter((t) => t.type === 'Volatile').reduce((s, t) => s + t.percent, 0);
  return `${vol.toFixed(1)}% volatile / ${(100 - vol).toFixed(1)}% core over ${p.tiers.length} tier(s)`;
}

/**
 * Build the rule a saved ModelRun proposes: a new version of the affiliate's own rule of the right
 * kind, else a fork of the Group default scoped to the affiliate, else a new rule seeded from the
 * engine defaults. The caller saves it through the ordinary rule save path, which raises the
 * maker-checker approval request.
 */
export function buildProposal(run: StoredModelRun, ctx: ProposalContext): Proposal {
  const kind = proposalKindFor(run.modelType);
  const aff = run.affiliateCode;
  const rules = ctx.rules.filter((r) => r.kind === kind);
  const own = latestOf(rules.filter((r) => r.affiliateCode === aff));
  const group = own
    ? null
    : (pickApprovedRule([...rules], null, [...ctx.requests]) ??
      latestOf(rules.filter((r) => r.affiliateCode === null)));
  const warnings: string[] = [];
  const changes: string[] = [];

  let envelope: RuleMeta;
  let basis: ProposalBasis;
  const base = own ?? group;
  if (own) {
    basis = 'NewVersion';
    envelope = { ...own, version: own.version + 1, isActive: true, updatedBy: ctx.userName, updatedAt: ctx.now };
    const pending = ctx.requests.find(
      (r) => r.entityId === own.id && r.entityVersion === own.version && r.status === 'Pending',
    );
    if (pending) {
      warnings.push(
        `Version ${own.version} of "${own.name}" is still awaiting approval. This proposal builds on it and supersedes that request - the checker approves both changes together as version ${own.version + 1}.`,
      );
    }
    changes.push(`Saves "${own.name}" (${aff}) as version ${own.version + 1}.`);
  } else {
    const stamp = ctx.now.replace(/\D/g, '').slice(0, 14);
    envelope = {
      ...(group ?? {}),
      id: `${kind.toUpperCase()}-${aff}-${stamp}`,
      kind,
      name: group
        ? `${group.name} - ${aff}`
        : `${aff} ${kind === 'Prepayment' ? 'prepayment' : 'behaviour patterns'} (fitted)`,
      description: group
        ? `Forked from Group default "${group.name}" v${group.version} to carry ${aff}'s fitted behavioural assumptions.`
        : `Created from the behavioural-model workbench for ${aff}.`,
      folder: aff,
      accessType: 'Read-Write',
      affiliateCode: aff,
      version: 1,
      isActive: true,
      createdBy: ctx.userName,
      createdAt: ctx.now,
      updatedBy: null,
      updatedAt: null,
    } as RuleMeta;
    basis = group ? 'ForkGroupDefault' : 'NewFromEngineDefaults';
    changes.push(
      group
        ? `${aff} has no ${kind} rule of its own - creates one by copying the Group default "${group.name}" (v${group.version}), scoped to ${aff}.`
        : `No ${kind} rule exists yet - creates one for ${aff} starting from the engine defaults.`,
    );
  }

  const lineage = [
    ...new Set([...((base as { sourceModelRunIds?: string[] } | null)?.sourceModelRunIds ?? []), run.id]),
  ];

  if (kind === 'BehaviourPattern') {
    const b = base as BehaviourPatternRule | null;
    let patterns: BehaviourPattern[] = (b?.patterns ?? DEFAULT_PATTERNS).map((p) => ({
      ...p,
      appliesTo: [...p.appliesTo],
      tiers: [...p.tiers],
    }));
    let betas = [...(b?.betas ?? DEFAULT_BETAS)];
    let termDepositBehaviour: TermDepositBehaviourAssumption[] | undefined = b?.termDepositBehaviour
      ? [...b.termDepositBehaviour]
      : undefined;

    if (run.modelType === 'DepositRunoff') {
      const fitted = run.outputs.behaviourPattern;
      if (!fitted) throw new ProposalError('This run carries no fitted behaviour pattern to propose.');
      const tags = fitted.appliesTo;
      const next: BehaviourPattern[] = [];
      for (const p of patterns) {
        if (p.id === fitted.id) {
          changes.push(`Replaces the previously fitted pattern "${p.name}".`);
          continue;
        }
        const remaining = p.appliesTo.filter((t) => !tags.includes(t));
        if (remaining.length === 0) {
          changes.push(
            `Removes "${p.name}" (${summarisePattern(p)}) - every deposit type it covered now uses the fitted pattern.`,
          );
          continue;
        }
        if (remaining.length < p.appliesTo.length) {
          changes.push(`"${p.name}" no longer applies to ${p.appliesTo.filter((t) => tags.includes(t)).join(', ')}.`);
        }
        next.push({ ...p, appliesTo: remaining });
      }
      next.push(fitted);
      patterns = next;
      changes.push(`Adds fitted pattern "${fitted.name}" for ${tags.join(', ')}: ${summarisePattern(fitted)}.`);
    } else if (run.modelType === 'RepricingBeta') {
      const fitted = run.outputs.depositBeta;
      if (!fitted) throw new ProposalError('This run carries no fitted beta to propose.');
      const before = betas.find((x) => x.behaviouralTag === fitted.behaviouralTag);
      betas = toDepositBetas([fitted], betas);
      const after = betas.find((x) => x.behaviouralTag === fitted.behaviouralTag)!;
      changes.push(
        `Deposit beta for ${fitted.behaviouralTag}: ${before ? before.beta.toFixed(3) : 'none'} → ${after.beta.toFixed(3)}` +
          (after.beta !== Number(run.params.beta)
            ? ` (fitted ${Number(run.params.beta).toFixed(3)}, clamped to 0-1)`
            : '') +
          '.',
      );
    } else if (run.modelType === 'TermDeposit') {
      const productCode = String(run.segment.key.productCode ?? '');
      const currency = run.segment.currency;
      const existing = termDepositBehaviour?.find((t) => t.productCode === productCode && t.currency === currency);
      const renewal = typeof run.params.renewalRate === 'number' ? run.params.renewalRate : existing?.renewalRate;
      const early =
        typeof run.params.earlyWithdrawalRate === 'number'
          ? run.params.earlyWithdrawalRate
          : existing?.earlyWithdrawalRate;
      if (renewal === undefined || early === undefined) {
        throw new ProposalError(
          `The fit could not estimate ${renewal === undefined ? 'a renewal rate' : 'an early-withdrawal rate'} for ${productCode} ${currency} (too few accounts), and the rule has no earlier value to keep. Widen the period or upload more account history, then fit again.`,
        );
      }
      const entry: TermDepositBehaviourAssumption = {
        productCode,
        currency,
        renewalRate: renewal,
        earlyWithdrawalRate: early,
      };
      termDepositBehaviour = [
        ...(termDepositBehaviour ?? []).filter((t) => !(t.productCode === productCode && t.currency === currency)),
        entry,
      ];
      changes.push(
        `Term-deposit behaviour for ${productCode} ${currency}: renewal ${existing ? pct(existing.renewalRate) : 'none'} → ${pct(renewal)}, early withdrawal ${existing ? pct(existing.earlyWithdrawalRate) : 'none'} → ${pct(early)}.`,
      );
      if (typeof run.params.renewalRate !== 'number' || typeof run.params.earlyWithdrawalRate !== 'number') {
        warnings.push(
          'One of the two rates could not be estimated from this period; the rule keeps its earlier value for it.',
        );
      }
    } else {
      throw new ProposalError(`${run.modelType} runs do not map to a behaviour-pattern rule.`);
    }

    const rule: BehaviourPatternRule = {
      ...((base as BehaviourPatternRule | null) ?? {}),
      ...envelope,
      kind: 'BehaviourPattern',
      patterns,
      betas,
      ...(termDepositBehaviour ? { termDepositBehaviour } : {}),
      sourceModelRunIds: lineage,
    };
    return { kind, rule, basis, baseRule: base, changes, warnings };
  }

  // Prepayment
  const b = base as PrepaymentRule | null;
  const fitted = run.outputs.prepaymentCpr;
  if (!fitted) throw new ProposalError('This run carries no fitted prepayment rate to propose.');
  const coaMap = ctx.coaByProduct ?? {};
  const smm = Number(run.params.smm);
  const pseudo = {
    productCode: fitted.productCode,
    currency: fitted.currency,
    monthly: [{ month: run.window.to, smm, scheduled: 1, prepaid: smm, accounts: 0 }],
  } as unknown as PrepaymentEstimate;
  const mapped = toPrepaymentAssumptions([pseudo], coaMap);
  if (mapped.unmapped.length > 0 || mapped.assumptions.length === 0) {
    throw new ProposalError(
      `Prepayment assumptions are keyed by Common Chart of Accounts code, and no committed position for product ${fitted.productCode} in ${aff} carries one. Commit ${aff}'s positions (Data → Load & check) with that product mapped to a Common CoA code, then propose again.`,
    );
  }
  const fittedA = mapped.assumptions[0]!;
  const assumptions: PrepaymentAssumption[] = [...(b?.assumptions ?? [])];
  const i = assumptions.findIndex((a) => a.commonCoaCode === fittedA.commonCoaCode);
  const before = i >= 0 ? assumptions[i]! : null;
  const merged: PrepaymentAssumption = before
    ? { ...before, cpr: fittedA.cpr, method: before.method === 'RateDependent' ? 'RateDependent' : 'ConstantRate' }
    : fittedA;
  if (i >= 0) assumptions[i] = merged;
  else assumptions.push(merged);
  changes.push(
    `CPR for Common CoA ${fittedA.commonCoaCode} (product ${fitted.productCode}): ${before ? pct(before.cpr) : 'none'} → ${pct(fittedA.cpr)}${merged.method === 'RateDependent' ? ' (base CPR of the rate-dependent assumption)' : ''}.`,
  );
  const sharing = Object.entries(coaMap)
    .filter(([p, c]) => c === fittedA.commonCoaCode && p !== fitted.productCode)
    .map(([p]) => p);
  if (sharing.length > 0) {
    warnings.push(
      `Products ${sharing.join(', ')} share Common CoA ${fittedA.commonCoaCode}, so they take this CPR too.`,
    );
  }
  const rule: PrepaymentRule = {
    ...(b ?? {}),
    ...envelope,
    kind: 'Prepayment',
    assumptions,
    sourceModelRunIds: lineage,
  };
  return { kind, rule, basis, baseRule: base, changes, warnings };
}
