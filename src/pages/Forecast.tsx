import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { InfoButton } from '@/components/ui/InfoButton';
import { RatioChart } from '@/components/ui/RatioChart';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, resolveSingleAffiliate } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { assembleInputs, payloadOf } from '@/lib/runHooks';
import { availableAsOfDates } from '@/engine/vintage';
import { draftRun } from '@/engine/run';
import { runForecast, type ForecastPeriod } from '@/engine/forecast';
import { formatDate, formatPct } from '@/lib/format';
import type { NewBusinessRule } from '@/engine/ruleTypes';
import type { CalculationElement } from '@/engine/types';

const FORECAST_ELEMENTS: CalculationElement[] = ['Lcr', 'Nsfr', 'NiiSensitivity'];
const PERIOD_COUNT_OPTIONS = [3, 6, 12];

interface PeriodRow {
  period: number;
  asOfDate: string;
  status: string;
  /** Why this period failed - a projected book can run down to nothing (every maturing position
   * rolled off with no New Business rule to replace it) or hit a currency with no FX rate, the same
   * two hard stops a real Process Run would hit. Null on a Completed period. */
  errorMessage: string | null;
  lcrPercent: number | null;
  nsfrPercent: number | null;
  niiSensitivityPercent: number | null;
}

function rowFor(index: number, p: ForecastPeriod): PeriodRow {
  const lcr = payloadOf<{ lcrPercent: number | null }>(p.outcome.results, 'Lcr');
  const nsfr = payloadOf<{ nsfrPercent: number | null }>(p.outcome.results, 'Nsfr');
  const nii = payloadOf<{ niiSensitivityPercent: number | null }>(p.outcome.results, 'NiiSensitivity');
  return {
    period: index + 1,
    asOfDate: p.asOfDate,
    status: p.outcome.run.status,
    errorMessage: p.outcome.run.errorLog[0]?.message ?? null,
    lcrPercent: lcr?.lcrPercent ?? null,
    nsfrPercent: nsfr?.nsfrPercent ?? null,
    niiSensitivityPercent: nii?.niiSensitivityPercent ?? null,
  };
}

export function Forecast() {
  const { hasPermission, user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: rules = [] } = useRules<NewBusinessRule>('NewBusiness');
  const canRun = hasPermission('run.execute');

  const affiliate = resolveSingleAffiliate(affiliates, affiliateCode);
  const dates = affiliate ? availableAsOfDates(batches, affiliate.code) : [];
  const asOfDate = dates[0] ?? '';

  const [ruleId, setRuleId] = useState('');
  const [periodMonths, setPeriodMonths] = useState(1);
  const [periodCount, setPeriodCount] = useState(6);

  const baseRun = useMemo(() => {
    if (!affiliate || !asOfDate) return null;
    return draftRun({
      id: `FORECAST-${affiliate.code}-${asOfDate}`,
      name: `Forecast base - ${affiliate.name}`,
      asOfDate,
      affiliateCode: affiliate.code,
      reportingCurrency: affiliate.functionalCurrency,
      timeBucketRuleId: '',
      batchIds: [],
      createdBy: user?.name ?? 'unknown',
      createdAt: new Date().toISOString(),
      elements: FORECAST_ELEMENTS,
    });
  }, [affiliate, asOfDate, user]);

  const { data: inputs, isLoading: loadingInputs } = useQuery({
    queryKey: ['forecast-inputs', baseRun?.id],
    queryFn: () => assembleInputs(baseRun!),
    enabled: !!baseRun,
  });

  const rule = rules.find((r) => r.id === ruleId) ?? null;

  const periods = useMemo(() => {
    if (!baseRun || !inputs) return [];
    return runForecast(baseRun, inputs, rule, periodMonths, periodCount, new Date().toISOString());
  }, [baseRun, inputs, rule, periodMonths, periodCount]);

  const rows = periods.map((p, i) => rowFor(i, p));
  const hasFailedPeriod = rows.some((r) => r.status !== 'Completed');
  const failedFromRunoff = hasFailedPeriod && !rule && rows.some((r) => r.errorMessage?.includes('No committed positions'));

  const columns: ResultColumn<PeriodRow>[] = [
    { key: 'period', header: 'Period', render: (r) => <span className="font-mono">{r.period}</span> },
    { key: 'asOfDate', header: 'As of', render: (r) => <span className="font-mono">{formatDate(r.asOfDate)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <>
          <StatusBadge status={r.status} tone={r.status === 'Completed' ? 'success' : 'danger'} />
          {r.errorMessage && <p className="mt-1 max-w-xs text-[10px] leading-snug text-danger">{r.errorMessage}</p>}
        </>
      ),
    },
    {
      key: 'lcr',
      header: 'LCR',
      align: 'right',
      render: (r) => <span className="font-mono">{formatPct(r.lcrPercent, 1)}</span>,
    },
    {
      key: 'nsfr',
      header: 'NSFR',
      align: 'right',
      render: (r) => <span className="font-mono">{formatPct(r.nsfrPercent, 1)}</span>,
    },
    {
      key: 'nii',
      header: 'NII sensitivity',
      align: 'right',
      render: (r) => <span className="font-mono">{formatPct(r.niiSensitivityPercent, 1)}</span>,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Forecast"
        description="A rule-driven, period-by-period projection of the book - each period runs the same calculation engine as a normal run, just against a projected position book rather than today's."
        asOfDate={asOfDate || null}
        scope={affiliate?.name ?? affiliateCode}
        metrics={[
          { label: 'Periods', value: String(periodCount), about: 'How many future periods this projection runs.' },
          {
            label: 'New business rule',
            value: rule ? rule.name : 'None (runoff only)',
            about: 'Growth/rollover assumptions applied each period. Without one, maturing balances simply run off - the same assumption a static run makes.',
          },
        ]}
      />

      {!canRun ? (
        <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
          <p className="mt-1 text-[12px] text-gray-500">Your role doesn&rsquo;t have access to forecasting.</p>
        </div>
      ) : !affiliate || !asOfDate ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[12px] text-gray-500">
          Select an affiliate with committed position data to forecast from.
        </p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="fc-rule" className="mb-1 block text-[11px] text-gray-600">
                  New business rule
                </label>
                <select
                  id="fc-rule"
                  value={ruleId}
                  onChange={(e) => setRuleId(e.target.value)}
                  className="w-64 rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  <option value="">None - runoff only</option>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="fc-period-length" className="mb-1 block text-[11px] text-gray-600">
                  Period length
                </label>
                <select
                  id="fc-period-length"
                  value={periodMonths}
                  onChange={(e) => setPeriodMonths(Number(e.target.value))}
                  className="w-32 rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  <option value={1}>Monthly</option>
                  <option value={3}>Quarterly</option>
                </select>
              </div>
              <div>
                <label htmlFor="fc-period-count" className="mb-1 block text-[11px] text-gray-600">
                  Number of periods
                </label>
                <select
                  id="fc-period-count"
                  value={periodCount}
                  onChange={(e) => setPeriodCount(Number(e.target.value))}
                  className="w-32 rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                >
                  {PERIOD_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <InfoButton label="How this differs from a real run">
                This is a hypothetical projection - it computes with the same engine as any Process Run, but
                nothing here is saved, pinned, or added to Run History. Only an actual Process Run is auditable.
              </InfoButton>
            </div>

            {loadingInputs ? (
              <p className="text-[12px] text-gray-400">Loading the current book…</p>
            ) : rows.length === 0 ? (
              <p className="text-[12px] text-gray-500">Nothing to project yet.</p>
            ) : (
              <>
                {failedFromRunoff && (
                  <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                    <span className="font-bold">Some periods failed: </span>
                    with no New Business rule selected, maturing positions simply run off with nothing
                    replacing them - over enough periods the projected book ran down to nothing. Pick a New
                    Business rule above to keep it populated, or shorten the horizon.
                  </p>
                )}
                <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      LCR across periods
                    </p>
                    <RatioChart
                      data={rows.map((r) => ({ label: `P${r.period}`, value: r.lcrPercent ?? 0 }))}
                      thresholds={[{ label: 'Regulatory floor', value: 100, kind: 'regulatory' }]}
                      variant="line"
                      seriesName="LCR"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      NSFR across periods
                    </p>
                    <RatioChart
                      data={rows.map((r) => ({ label: `P${r.period}`, value: r.nsfrPercent ?? 0 }))}
                      thresholds={[{ label: 'Regulatory floor', value: 100, kind: 'regulatory' }]}
                      variant="line"
                      seriesName="NSFR"
                    />
                  </div>
                </div>

                <ResultTable
                  rows={rows}
                  columns={columns}
                  rowKey={(r) => String(r.period)}
                  emptyMessage="Nothing to show."
                />
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
