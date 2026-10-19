import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoButton } from '@/components/ui/InfoButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { ModelRunDetail } from '@/components/models/ModelRunDetail';
import { ProposePanel } from '@/components/models/ProposePanel';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates, useEconomicIndicators } from '@/lib/hooks';
import { COUNTRIES } from '@/lib/countries';
import { accessibleAffiliates } from '@/lib/scope';
import { approvals } from '@/lib/governanceHooks';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  useAccountHistory,
  useBalanceHistory,
  useModelRuleRows,
  useModelRuns,
  useSaveModelRun,
} from '@/lib/modelHooks';
import {
  accountCoverage,
  balanceCoverage,
  describeFitError,
  effectiveModelStatus,
  MODEL_TYPE_LABEL,
  runCalibration,
  SEGMENT_DIMENSION_LABEL,
  toStoredModelRun,
  type CalibrationOutcome,
  type FitErrorView,
  type WorkbenchSpec,
} from '@/lib/modelRegistry';
import {
  MIN_MONTHLY_POINTS,
  type BehaviouralModelType,
  type CoreMethod,
  type DecayMethod,
  type SegmentDimension,
} from '@/engine/behaviouralModels';
import type { BehaviouralTag } from '@/engine/types';

const MODEL_TYPES: Array<{ type: BehaviouralModelType; needs: 'Balance' | 'Account'; what: string }> = [
  {
    type: 'DepositRunoff',
    needs: 'Balance',
    what: 'How much of a deposit book is stable (core) and how fast the rest leaves. Becomes a behaviour pattern (run-off tiers).',
  },
  {
    type: 'RepricingBeta',
    needs: 'Balance',
    what: 'How much of a policy-rate move you pass on to the deposit rate. Becomes a deposit beta. Needs the customer rate column.',
  },
  {
    type: 'Prepayment',
    needs: 'Account',
    what: 'How fast loans repay ahead of schedule (CPR). Becomes a prepayment assumption. Needs the scheduled-balance column.',
  },
  {
    type: 'TermDeposit',
    needs: 'Account',
    what: 'How often term deposits renew at maturity and how often they are broken early. Needs the maturity-date column.',
  },
];

const SEGMENT_DIMS: SegmentDimension[] = ['productCode', 'customerType', 'currency', 'tenorBand'];
const TAGS: BehaviouralTag[] = ['Core', 'Non-Core', 'Operational', 'Non-Operational'];

const DEFAULT_TOLERANCE: Record<BehaviouralModelType, number> = {
  DepositRunoff: 10,
  RepricingBeta: 0.25,
  Prepayment: 0.005,
  TermDeposit: 0,
};

const inputCls =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] text-navy-900 focus:border-navy-700 focus:outline-none disabled:bg-gray-50';
const labelCls = 'mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400';

function Step({
  n,
  title,
  children,
  about,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  about?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-navy-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-[11px] text-white">
          {n}
        </span>
        {title}
        {about && <InfoButton label={`About ${title}`}>{about}</InfoButton>}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, about, children }: { label: string; about?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className={labelCls}>
        {label}
        {about && <InfoButton label={`About ${label}`}>{about}</InfoButton>}
      </div>
      {children}
    </div>
  );
}

interface SegmentRow {
  segmentId: string;
  label: string;
  currency: string;
  months: number;
  first: string;
  last: string;
  gaps: number;
  usable: boolean;
  why: string | null;
  extra: string;
  growing: boolean;
}

/**
 * Behavioural models - the calibration workbench. Fit a model to the affiliate's own uploaded history
 * in the browser, back-test it, save it to the model register and propose it as an assumption.
 */
export function BehaviouralModels() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (affiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, affiliateCode));

  const { data: balanceRows = [], isLoading: loadingBalances } = useBalanceHistory(affiliate?.code);
  const { data: accountRows = [], isLoading: loadingAccounts } = useAccountHistory(affiliate?.code);
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: runs = [] } = useModelRuns(affiliate?.code);
  const { data: requests = [] } = approvals.useList();
  const ruleRows = useModelRuleRows();
  const saveRun = useSaveModelRun();

  const [modelType, setModelType] = useState<BehaviouralModelType>('DepositRunoff');
  const [dims, setDims] = useState<SegmentDimension[]>(['productCode', 'currency']);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [coreMethod, setCoreMethod] = useState<CoreMethod>('MinimumBalance');
  const [windowMonths, setWindowMonths] = useState(12);
  const [coreConfidence, setCoreConfidence] = useState(0.99);
  const [decayMethod, setDecayMethod] = useState<DecayMethod>('DecayFit');
  const [outflowConfidence, setOutflowConfidence] = useState(0.95);
  const [appliesTo, setAppliesTo] = useState<BehaviouralTag[]>([]);
  const [patternName, setPatternName] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [betaTag, setBetaTag] = useState<BehaviouralTag>('Non-Core');
  const [maxLag, setMaxLag] = useState(3);
  const [minSnapshots, setMinSnapshots] = useState(12);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [minAccounts, setMinAccounts] = useState(12);
  const [holdout, setHoldout] = useState(3);
  const [tolerance, setTolerance] = useState<Record<BehaviouralModelType, number>>(DEFAULT_TOLERANCE);

  const [result, setResult] = useState<{
    key: string;
    outcome: CalibrationOutcome | null;
    error: FitErrorView | null;
  } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // The fit result opens in its own window so it cannot be missed below the options.
  const [showResult, setShowResult] = useState(false);

  const needs = MODEL_TYPES.find((m) => m.type === modelType)!.needs;
  const isBalanceModel = needs === 'Balance';

  // ── Segments with coverage for the chosen model ──
  const balanceCov = useMemo(() => balanceCoverage(balanceRows, dims), [balanceRows, dims]);
  const accountCov = useMemo(() => accountCoverage(accountRows), [accountRows]);
  const segments: SegmentRow[] = useMemo(() => {
    if (isBalanceModel) {
      return balanceCov.segments.map((s) => {
        const months = modelType === 'RepricingBeta' ? s.ratedMonths : s.months;
        const usable = months >= MIN_MONTHLY_POINTS;
        return {
          segmentId: s.segmentId,
          label: s.label,
          currency: s.currency,
          months,
          first: s.firstMonth,
          last: s.lastMonth,
          gaps: s.gaps.length,
          usable,
          why: usable
            ? null
            : modelType === 'RepricingBeta'
              ? `${s.ratedMonths} month(s) carry a rate - needs ${MIN_MONTHLY_POINTS}`
              : `Needs ${MIN_MONTHLY_POINTS - s.months} more month(s)`,
          extra: `${formatAmount(s.latestBalance, s.currency)}${s.trendGrowthPerMonth !== null ? ` · trend ${(s.trendGrowthPerMonth * 100).toFixed(1)}%/month` : ''}`,
          growing: (s.trendGrowthPerMonth ?? -1) >= 0,
        };
      });
    }
    return accountCov.map((s) => {
      const hasField = modelType === 'Prepayment' ? s.withScheduledBalance > 0 : s.withMaturity > 0;
      const usable = s.months >= MIN_MONTHLY_POINTS && hasField;
      return {
        segmentId: s.segmentId,
        label: s.label,
        currency: s.currency,
        months: s.months,
        first: s.firstMonth,
        last: s.lastMonth,
        gaps: s.gaps.length,
        usable,
        why: usable
          ? null
          : !hasField
            ? modelType === 'Prepayment'
              ? 'No scheduled balances in the file'
              : 'No maturity dates in the file'
            : `Needs ${MIN_MONTHLY_POINTS - s.months} more month(s)`,
        extra: `${s.accounts.toLocaleString()} account(s), ${s.snapshots} snapshot date(s)`,
        growing: false,
      };
    });
  }, [isBalanceModel, balanceCov, accountCov, modelType]);

  const segment = segments.find((s) => s.segmentId === segmentId) ?? null;
  const pool = !isBalanceModel && segment ? (accountCov.find((p) => p.segmentId === segment.segmentId) ?? null) : null;

  // Indicators: the affiliate's own country first. A series carries an ISO country code ("NG") while an
  // affiliate records its country by name ("Nigeria"), so compare through the country list.
  const policyOptions = useMemo(() => {
    const iso = COUNTRIES.find((c) => c.name === affiliate?.country)?.code ?? affiliate?.code;
    return [...indicators].sort(
      (a, b) => Number(b.countryCode === iso) - Number(a.countryCode === iso) || a.name.localeCompare(b.name),
    );
  }, [indicators, affiliate?.country, affiliate?.code]);

  // ── The spec the fit would use, and why it cannot run yet ──
  const spec: WorkbenchSpec | null = (() => {
    if (!segment) return null;
    switch (modelType) {
      case 'DepositRunoff':
        return {
          modelType,
          segmentation: dims,
          segmentId: segment.segmentId,
          coreMethod,
          windowMonths,
          coreConfidence,
          decayMethod,
          outflowConfidence,
          appliesTo,
          patternName: patternName.trim() || `Fitted - ${segment.label}`,
          holdoutMonths: holdout,
          tolerance: tolerance.DepositRunoff,
        };
      case 'RepricingBeta':
        return {
          modelType,
          segmentation: dims,
          segmentId: segment.segmentId,
          policyIndicatorId: policyId,
          behaviouralTag: betaTag,
          maxLagMonths: maxLag,
          holdoutMonths: holdout,
          tolerance: tolerance.RepricingBeta,
        };
      case 'Prepayment':
        return {
          modelType,
          productCode: pool?.productCode ?? '',
          currency: pool?.currency ?? '',
          minSnapshots,
          holdoutMonths: holdout,
          tolerance: tolerance.Prepayment,
        };
      case 'TermDeposit':
        return {
          modelType,
          productCode: pool?.productCode ?? '',
          currency: pool?.currency ?? '',
          periodFrom: periodFrom || pool?.firstDate || '',
          periodTo: periodTo || pool?.lastDate || '',
          minAccounts,
        };
    }
  })();
  const specKey = JSON.stringify([affiliate?.code, spec, balanceRows.length, accountRows.length]);
  const blocker = !affiliate
    ? 'Pick an affiliate.'
    : !segment
      ? 'Pick a segment.'
      : !segment.usable
        ? `This segment cannot be fitted: ${segment.why}.`
        : modelType === 'DepositRunoff' && appliesTo.length === 0
          ? 'Choose which deposit types the fitted pattern applies to.'
          : modelType === 'RepricingBeta' && !policyId
            ? 'Pick the policy-rate series.'
            : null;

  const fit = (withSpec: WorkbenchSpec | null = spec) => {
    if (!withSpec || blocker) return;
    const key = JSON.stringify([affiliate?.code, withSpec, balanceRows.length, accountRows.length]);
    setSavedId(null);
    setShowResult(true);
    try {
      const outcome = runCalibration(withSpec, { balances: balanceRows, accounts: accountRows, indicators });
      setResult({ key, outcome, error: null });
    } catch (e) {
      setResult({ key, outcome: null, error: describeFitError(e) });
    }
  };
  // Switch a growing book to outflow percentile and fit again straight away.
  const refitWithOutflow = () => {
    setDecayMethod('OutflowPercentile');
    if (spec?.modelType === 'DepositRunoff') fit({ ...spec, decayMethod: 'OutflowPercentile' });
  };

  const current = result && result.key === specKey ? result : null;
  const savedRun = savedId ? (runs.find((r) => r.id === savedId) ?? null) : null;

  const statuses = runs.map((r) => effectiveModelStatus(r, requests, ruleRows).status);
  const resetFor = (patch: () => void) => {
    patch();
    setSegmentId(null);
    setSavedId(null);
  };

  const noHistory = !loadingBalances && !loadingAccounts && balanceRows.length === 0 && accountRows.length === 0;
  const noHistoryForType = isBalanceModel ? balanceRows.length === 0 : accountRows.length === 0;

  return (
    <>
      <ModuleHeader
        title="Behavioural models"
        description="Fit deposit and prepayment behaviour to your own history, then propose it as an assumption."
        about="Proposals go through maker-checker approval before any run uses them."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          {
            label: 'Months of balance history',
            value: String(new Set(balanceRows.map((r) => r.asOfDate.slice(0, 7))).size),
            about: 'Distinct month-ends in the uploaded balance history for this affiliate.',
          },
          { label: 'Saved model runs', value: String(runs.length) },
          {
            label: 'Awaiting approval',
            value: String(statuses.filter((s) => s === 'Proposed').length),
            tone: statuses.includes('Proposed') ? 'warning' : 'neutral',
          },
          {
            label: 'Approved',
            value: String(statuses.filter((s) => s === 'Approved').length),
            tone: statuses.includes('Approved') ? 'success' : 'neutral',
          },
        ]}
        actions={
          <Link
            href="/assumptions/models"
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-bold text-navy-700 hover:bg-gray-50"
          >
            Model register →
          </Link>
        }
      />

      <AffiliateSelector
        affiliates={affiliates}
        value={affiliate?.code}
        onChange={(c) => resetFor(() => setPickedCode(c))}
      />

      {!affiliate ? (
        <EmptyState title="No affiliate selected">Pick the affiliate whose behaviour you want to model.</EmptyState>
      ) : noHistory ? (
        <EmptyState
          title="No history to fit yet"
          cta={hasPermission('data.view') ? { label: 'Go to History for models', href: '/data/history' } : undefined}
        >
          Upload at least {MIN_MONTHLY_POINTS} months of balance history (for deposit run-off and repricing beta) or
          account history (for prepayment and term deposits) for {affiliate.name} in Data → History for models. Models
          are only ever fitted to your own data - nothing is pre-loaded.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <Step n={1} title="What to model">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {MODEL_TYPES.map((m) => {
                const has = m.needs === 'Balance' ? balanceRows.length > 0 : accountRows.length > 0;
                return (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => resetFor(() => setModelType(m.type))}
                    aria-pressed={modelType === m.type}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors',
                      modelType === m.type ? 'border-navy-700 bg-navy-50' : 'border-gray-200 hover:border-navy-500',
                    )}
                  >
                    <p className="text-[13px] font-bold text-navy-900">{MODEL_TYPE_LABEL[m.type]}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-gray-600">{m.what}</p>
                    <p
                      className={cn(
                        'mt-2 text-[11px] font-bold uppercase tracking-wider',
                        has ? 'text-success' : 'text-warning',
                      )}
                    >
                      {m.needs} history {has ? 'loaded' : 'not uploaded'}
                    </p>
                  </button>
                );
              })}
            </div>
          </Step>

          {noHistoryForType ? (
            <EmptyState
              title={`No ${needs.toLowerCase()} history for ${affiliate.name}`}
              cta={{ label: 'Upload history', href: '/data/history' }}
            >
              {MODEL_TYPE_LABEL[modelType]} is fitted from {needs.toLowerCase()} history. Upload at least{' '}
              {MIN_MONTHLY_POINTS} months of it in Data → History for models.
            </EmptyState>
          ) : (
            <>
              <Step
                n={2}
                title="Segment"
                about={`Each model is fitted to one segment's monthly series. A segment needs at least ${MIN_MONTHLY_POINTS} month-ends; gaps are never filled in.`}
              >
                {isBalanceModel && (
                  <div className="mb-4 flex flex-wrap items-center gap-4">
                    <span className={labelCls}>Segment by</span>
                    {SEGMENT_DIMS.map((d) => (
                      <label key={d} className="flex items-center gap-1.5 text-[13px] text-gray-700">
                        <input
                          type="checkbox"
                          className="accent-gold-500"
                          checked={dims.includes(d)}
                          onChange={(e) =>
                            resetFor(() =>
                              setDims(
                                e.target.checked
                                  ? SEGMENT_DIMS.filter((x) => x === d || dims.includes(x))
                                  : dims.filter((x) => x !== d),
                              ),
                            )
                          }
                        />
                        {SEGMENT_DIMENSION_LABEL[d]}
                      </label>
                    ))}
                  </div>
                )}
                {!isBalanceModel && (
                  <p className="mb-3 text-[12px] text-gray-500">
                    Account-level models are fitted per product and currency.
                  </p>
                )}
                {isBalanceModel && balanceCov.error ? (
                  <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{balanceCov.error}</p>
                ) : (
                  <div className="max-h-80 overflow-auto rounded-lg border border-gray-100">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          {[
                            '',
                            'Segment',
                            modelType === 'RepricingBeta' ? 'Months with a rate' : 'Months',
                            'First',
                            'Last',
                            'Gaps',
                            'Detail',
                            'Fit?',
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {segments.map((s) => (
                          <tr
                            key={s.segmentId}
                            onClick={() => {
                              setSegmentId(s.segmentId);
                              setSavedId(null);
                            }}
                            className={cn(
                              'cursor-pointer border-t border-gray-100',
                              segmentId === s.segmentId ? 'bg-navy-50' : 'hover:bg-gray-50',
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="radio"
                                name="segment"
                                aria-label={`Select ${s.label}`}
                                checked={segmentId === s.segmentId}
                                onChange={() => {
                                  setSegmentId(s.segmentId);
                                  setSavedId(null);
                                }}
                                className="accent-gold-500"
                              />
                            </td>
                            <td className="px-3 py-2 text-[13px] font-bold text-navy-900">{s.label}</td>
                            <td className="px-3 py-2 text-[13px]">{s.months}</td>
                            <td className="px-3 py-2 text-[13px]">{s.first}</td>
                            <td className="px-3 py-2 text-[13px]">{s.last}</td>
                            <td className={cn('px-3 py-2 text-[13px]', s.gaps > 0 && 'text-warning')}>
                              {s.gaps === 0 ? 'None' : s.gaps}
                            </td>
                            <td className="px-3 py-2 text-[12px] text-gray-500">{s.extra}</td>
                            <td className="px-3 py-2">
                              {s.usable ? (
                                <StatusBadge status="Usable" tone="success" />
                              ) : (
                                <StatusBadge status={s.why ?? 'Not usable'} tone="warning" />
                              )}
                            </td>
                          </tr>
                        ))}
                        {segments.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-6 text-center text-[13px] text-gray-500">
                              No segments in the uploaded history.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </Step>

              <Step n={3} title="Method & options">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {modelType === 'DepositRunoff' && (
                    <>
                      <Field
                        label="Core method"
                        about="Minimum balance: core = the lowest month-end balance in the window - money that never left. Volatility: core = mean minus z standard deviations at the chosen confidence."
                      >
                        <select
                          className={inputCls}
                          value={coreMethod}
                          onChange={(e) => setCoreMethod(e.target.value as CoreMethod)}
                        >
                          <option value="MinimumBalance">Minimum balance</option>
                          <option value="Volatility">Volatility (mean − z·σ)</option>
                        </select>
                      </Field>
                      <Field label="Core look-back (months)">
                        <input
                          type="number"
                          min={MIN_MONTHLY_POINTS}
                          max={120}
                          className={inputCls}
                          value={windowMonths}
                          onChange={(e) => setWindowMonths(Math.max(1, Number(e.target.value) || MIN_MONTHLY_POINTS))}
                        />
                      </Field>
                      <Field
                        label="Core confidence"
                        about="Volatility method only - one-sided confidence that the balance stays above the core."
                      >
                        <select
                          className={inputCls}
                          disabled={coreMethod !== 'Volatility'}
                          value={coreConfidence}
                          onChange={(e) => setCoreConfidence(Number(e.target.value))}
                        >
                          {[0.9, 0.95, 0.975, 0.99, 0.995].map((c) => (
                            <option key={c} value={c}>
                              {(c * 100).toFixed(1)}%
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Run-off method"
                        about="Decay fit: exponential decay of the balance above the core. Floor fit: core and decay rate estimated together. Both need a book that actually shrinks. Outflow percentile: the stressed monthly outflow actually observed - use it for a growing or flat book."
                      >
                        <select
                          className={inputCls}
                          value={decayMethod}
                          onChange={(e) => setDecayMethod(e.target.value as DecayMethod)}
                        >
                          <option value="DecayFit">Decay fit (above core)</option>
                          <option value="FloorFit">Floor fit (core + decay jointly)</option>
                          <option value="OutflowPercentile">Outflow percentile</option>
                        </select>
                        {segment?.growing && decayMethod !== 'OutflowPercentile' && (
                          <p className="mt-1.5 text-[11px] leading-snug text-warning">
                            This segment is growing - decay and floor fits need a shrinking book.{' '}
                            <button
                              type="button"
                              onClick={() => setDecayMethod('OutflowPercentile')}
                              className="font-bold underline"
                            >
                              Use outflow percentile
                            </button>
                          </p>
                        )}
                      </Field>
                      {decayMethod === 'OutflowPercentile' && (
                        <Field
                          label="Outflow confidence"
                          about="0.95 takes the 5th percentile of month-on-month balance changes as the stressed outflow rate."
                        >
                          <select
                            className={inputCls}
                            value={outflowConfidence}
                            onChange={(e) => setOutflowConfidence(Number(e.target.value))}
                          >
                            {[0.9, 0.95, 0.975, 0.99].map((c) => (
                              <option key={c} value={c}>
                                {(c * 100).toFixed(1)}%
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field
                        label="Pattern applies to"
                        about="Which deposit types (behavioural tags on positions) the fitted run-off pattern will be used for once approved."
                      >
                        <div className="flex flex-wrap gap-3 pt-1">
                          {TAGS.map((t) => (
                            <label key={t} className="flex items-center gap-1 text-[12px] text-gray-700">
                              <input
                                type="checkbox"
                                className="accent-gold-500"
                                checked={appliesTo.includes(t)}
                                onChange={(e) =>
                                  setAppliesTo(e.target.checked ? [...appliesTo, t] : appliesTo.filter((x) => x !== t))
                                }
                              />
                              {t}
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Field label="Pattern name">
                        <input
                          className={inputCls}
                          value={patternName}
                          placeholder={segment ? `Fitted - ${segment.label}` : 'Pick a segment'}
                          onChange={(e) => setPatternName(e.target.value)}
                        />
                      </Field>
                    </>
                  )}

                  {modelType === 'RepricingBeta' && (
                    <>
                      <Field
                        label="Policy-rate series"
                        about="From Setup → Market & reference data → Economic indicators. The deposit rate's monthly changes are regressed on this series' changes."
                      >
                        {indicators.length === 0 ? (
                          <p className="text-[12px] text-warning">
                            No economic indicators yet - add the policy rate in{' '}
                            <Link href="/data/market/indicators" className="font-bold underline">
                              Economic indicators
                            </Link>
                            .
                          </p>
                        ) : (
                          <select className={inputCls} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                            <option value="">Select a series…</option>
                            {policyOptions.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name} ({i.countryCode}, {i.observations.length} obs)
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                      <Field
                        label="Lag search (months)"
                        about="Tries the policy-rate change 0 to N months earlier and keeps the lag that explains the deposit rate best (highest R²)."
                      >
                        <input
                          type="number"
                          min={0}
                          max={12}
                          className={inputCls}
                          value={maxLag}
                          onChange={(e) => setMaxLag(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                        />
                      </Field>
                      <Field
                        label="Beta applies to"
                        about="The deposit type (behavioural tag) whose beta this fit replaces once approved."
                      >
                        <select
                          className={inputCls}
                          value={betaTag}
                          onChange={(e) => setBetaTag(e.target.value as BehaviouralTag)}
                        >
                          {TAGS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}

                  {modelType === 'Prepayment' && (
                    <Field label="Minimum snapshots" about="Monthly snapshots required per product. 12 is the floor.">
                      <input
                        type="number"
                        min={MIN_MONTHLY_POINTS}
                        className={inputCls}
                        value={minSnapshots}
                        onChange={(e) =>
                          setMinSnapshots(Math.max(MIN_MONTHLY_POINTS, Number(e.target.value) || MIN_MONTHLY_POINTS))
                        }
                      />
                    </Field>
                  )}

                  {modelType === 'TermDeposit' && (
                    <>
                      <Field label="Period from">
                        <input
                          type="date"
                          className={inputCls}
                          value={periodFrom || pool?.firstDate || ''}
                          onChange={(e) => setPeriodFrom(e.target.value)}
                        />
                      </Field>
                      <Field label="Period to">
                        <input
                          type="date"
                          className={inputCls}
                          value={periodTo || pool?.lastDate || ''}
                          onChange={(e) => setPeriodTo(e.target.value)}
                        />
                      </Field>
                      <Field
                        label="Minimum accounts"
                        about="Fewest maturing (or exposed) accounts a rate may be based on - below it the rate is reported as not estimable."
                      >
                        <input
                          type="number"
                          min={1}
                          className={inputCls}
                          value={minAccounts}
                          onChange={(e) => setMinAccounts(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </Field>
                    </>
                  )}
                </div>
              </Step>

              {modelType !== 'TermDeposit' && (
                <Step
                  n={4}
                  title="Back-test"
                  about="The last N months are held out: the model is refitted on the earlier months and asked to predict the held-out ones. Set 0 to skip."
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Field label="Hold-out months">
                      <input
                        type="number"
                        min={0}
                        max={24}
                        className={inputCls}
                        value={holdout}
                        onChange={(e) => setHoldout(Math.min(24, Math.max(0, Number(e.target.value) || 0)))}
                      />
                    </Field>
                    <Field
                      label={
                        modelType === 'DepositRunoff'
                          ? 'Tolerance - MAPE (%)'
                          : modelType === 'RepricingBeta'
                            ? 'Tolerance - MAE (pp of rate)'
                            : 'Tolerance - MAE (monthly SMM)'
                      }
                      about="The back-test passes when the out-of-sample error is at or below this."
                    >
                      <input
                        type="number"
                        step="any"
                        min={0}
                        className={inputCls}
                        value={tolerance[modelType]}
                        onChange={(e) =>
                          setTolerance({ ...tolerance, [modelType]: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </Field>
                  </div>
                </Step>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!!blocker}
                  onClick={() => fit()}
                  className="rounded-lg bg-navy-900 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Fit model
                </button>
                {blocker && <span className="text-[12px] text-gray-500">{blocker}</span>}
                {current && !showResult && (
                  <button
                    type="button"
                    onClick={() => setShowResult(true)}
                    className="rounded-lg border border-gray-200 px-4 py-2.5 text-[13px] font-bold text-navy-900 hover:border-navy-700"
                  >
                    {current.error ? 'View fit error' : 'View fit result'}
                  </button>
                )}
              </div>

              {current && showResult && (
                <Modal
                  wide="xl"
                  title={current.error ? 'The model could not be fitted' : 'Fit result'}
                  description={segment ? `Segment: ${segment.label}` : undefined}
                  onClose={() => setShowResult(false)}
                >
                  {current.error && (
                    <section role="alert" className="rounded-2xl border border-danger/30 bg-danger-bg p-5">
                      <p className="text-[14px] font-bold text-danger">{current.error.title}</p>
                      <p className="mt-1 font-mono text-[12px] text-danger">{current.error.message}</p>
                      <p className="mt-2 text-[13px] leading-relaxed text-gray-700">{current.error.hint}</p>
                      {current.error.suggestOutflowPercentile && (
                        <button
                          type="button"
                          onClick={refitWithOutflow}
                          className="mt-3 rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
                        >
                          Fit with outflow percentile instead
                        </button>
                      )}
                    </section>
                  )}

                  {current.outcome && (
                    <section className="space-y-4">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {savedRun ? (
                          <span className="text-[13px] text-success">
                            Saved to the model register as version {savedRun.version}.{' '}
                            <Link href="/assumptions/models" className="font-bold underline">
                              Open register
                            </Link>
                          </span>
                        ) : hasPermission('rules.edit') ? (
                          <button
                            type="button"
                            disabled={saveRun.isPending}
                            onClick={async () => {
                              const stored = toStoredModelRun(current.outcome!, {
                                affiliateCode: affiliate.code,
                                createdBy: user?.name ?? 'unknown',
                                existing: runs,
                              });
                              await saveRun.mutateAsync(stored);
                              setSavedId(stored.id);
                            }}
                            className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-50"
                          >
                            {saveRun.isPending ? 'Saving…' : 'Save to model register'}
                          </button>
                        ) : (
                          <span className="text-[12px] text-gray-500">
                            Saving to the register needs the rules-edit permission.
                          </span>
                        )}
                      </div>
                      {savedRun && <ProposePanel run={savedRun} />}
                      <ModelRunDetail
                        run={current.outcome.run}
                        chart={current.outcome.chart}
                        chartUnit={current.outcome.chartUnit}
                      />
                    </section>
                  )}
                </Modal>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
