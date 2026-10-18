import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRID_STROKE,
  CHART_LEGEND_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/components/results/chartStyle';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { formatAmount } from '@/lib/format';
import { MODEL_TYPE_LABEL, segmentLabel } from '@/lib/modelRegistry';
import type { ModelRun } from '@/engine/behaviouralModels';
import type { ModelRunChartPoint, StoredModelRun } from '@/store/repository';

type Unit = StoredModelRun['chartUnit'];

/** How each value in a series reads, by chart unit. */
export function formatUnit(v: number | null | undefined, unit: Unit, currency: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (unit === 'amount') return formatAmount(v, currency);
  if (unit === 'percent') return `${v.toFixed(2)}%`;
  if (unit === 'ratio') return `${(v * 100).toFixed(3)}%`;
  return v.toFixed(4);
}

const pctOf = (v: number) => `${(v * 100).toFixed(2)}%`;

interface ParamSpec {
  label: string;
  format: (v: number, currency: string) => string;
  about?: string;
}

const PARAMS: Record<string, ParamSpec> = {
  currentBalance: { label: 'Current balance', format: (v, c) => formatAmount(v, c) },
  coreAmount: {
    label: 'Core (stable) amount',
    format: (v, c) => formatAmount(v, c),
    about: 'The part of the balance that stays through the observation window.',
  },
  coreShare: { label: 'Core share', format: pctOf },
  lambdaMonthly: {
    label: 'Run-off rate λ (per month)',
    format: (v) => v.toFixed(4),
    about: 'Monthly rate at which the volatile (non-core) balance leaves.',
  },
  halfLifeMonths: { label: 'Half-life of volatile balance', format: (v) => `${v.toFixed(1)} months` },
  beta: {
    label: 'Repricing beta',
    format: (v) => v.toFixed(3),
    about: 'Share of a policy-rate move passed through to the deposit rate.',
  },
  intercept: { label: 'Monthly drift (α)', format: (v) => `${v.toFixed(3)} pp` },
  lagMonths: { label: 'Lag (months)', format: (v) => String(v) },
  smm: { label: 'Single monthly mortality (SMM)', format: pctOf },
  cpr: { label: 'Annual prepayment rate (CPR)', format: pctOf },
  renewalRate: { label: 'Renewal rate (balance-weighted)', format: pctOf },
  earlyWithdrawalRate: { label: 'Early withdrawal (over the period)', format: pctOf },
  earlyWithdrawalRateAnnualised: { label: 'Early withdrawal (annualised)', format: pctOf },
  renewalRateByCount: { label: 'Renewal rate (by count)', format: pctOf },
  earlyWithdrawalRateByCount: { label: 'Early withdrawal (by count)', format: pctOf },
};

const STATS: Record<string, { label: string; format: (v: number, run: ModelRun) => string; about?: string }> = {
  rSquared: { label: 'R²', format: (v) => v.toFixed(3), about: 'Share of variation the model explains (1 = perfect).' },
  rmse: {
    label: 'RMSE',
    format: (v, run) =>
      run.modelType === 'RepricingBeta' ? `${v.toFixed(3)} pp` : formatAmount(v, run.segment.currency),
    about: 'Typical size of the in-sample error.',
  },
  mape: { label: 'MAPE', format: (v) => `${v.toFixed(2)}%`, about: 'Mean absolute percentage error, in sample.' },
  pValue: {
    label: 'p-value (beta)',
    format: (v) => (v < 0.001 ? '< 0.001' : v.toFixed(3)),
    about:
      'Probability of a beta this far from zero if the true pass-through were zero. Below 0.05 is conventionally significant.',
  },
  standardError: { label: 'Standard error (beta)', format: (v) => v.toFixed(4) },
  n: { label: 'Observations used', format: (v) => String(v) },
  coefficientOfVariation: { label: 'Coefficient of variation', format: pctOf },
  maxDrawdown: { label: 'Largest peak-to-trough fall', format: pctOf },
  shareMonthsBelowTrend: { label: 'Months below trend', format: pctOf },
  accountMonths: { label: 'Account-months observed', format: (v) => v.toLocaleString() },
  months: { label: 'Monthly SMM observations', format: (v) => String(v) },
  maturingCount: { label: 'Maturing accounts (outcome known)', format: (v) => String(v) },
  undeterminedCount: { label: 'Maturing accounts (outcome unknown)', format: (v) => String(v) },
  exposedCount: { label: 'Accounts exposed to early withdrawal', format: (v) => String(v) },
  renewalRateByCount: { label: 'Renewal rate (by count)', format: pctOf },
};

function Section({ title, about, children }: { title: string; about?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
        {title}
        {about && <InfoButton label={`About ${title}`}>{about}</InfoButton>}
      </h3>
      {children}
    </div>
  );
}

const th = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400';
const td = 'px-3 py-2 text-[13px] text-navy-900';

function SeriesChart({
  data,
  unit,
  currency,
  labels,
}: {
  data: ModelRunChartPoint[];
  unit: Unit;
  currency: string;
  labels: { actual: string; fitted: string; reference?: string };
}) {
  const hasRef = labels.reference && data.some((d) => d.reference !== null && d.reference !== undefined);
  const refUnit: Unit = unit === 'percent' ? 'percent' : unit;
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => formatUnit(v, unit, currency)}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              formatUnit(v, name === labels.reference ? refUnit : unit, currency),
              name,
            ]}
          />
          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
          <Line
            type="monotone"
            dataKey="actual"
            name={labels.actual}
            stroke={CHART_COLORS.primary}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="fitted"
            name={labels.fitted}
            stroke={CHART_COLORS.accent}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls={false}
          />
          {hasRef && (
            <Line
              type="stepAfter"
              dataKey="reference"
              name={labels.reference}
              stroke={CHART_COLORS.neutral}
              strokeWidth={1.5}
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function chartLabels(run: ModelRun): { actual: string; fitted: string; reference?: string } {
  switch (run.modelType) {
    case 'DepositRunoff':
      return { actual: 'Actual month-end balance', fitted: 'Fitted balance', reference: 'Core floor' };
    case 'RepricingBeta':
      return { actual: 'Actual deposit rate', fitted: 'Fitted (one month ahead)', reference: 'Policy rate' };
    case 'Prepayment':
      return { actual: 'Observed monthly SMM', fitted: 'Pooled SMM' };
    default:
      return { actual: 'Actual', fitted: 'Fitted' };
  }
}

function backtestUnit(run: ModelRun): Unit {
  if (run.modelType === 'DepositRunoff') return 'amount';
  if (run.modelType === 'RepricingBeta') return 'percent';
  if (run.modelType === 'Prepayment') return 'ratio';
  return 'none';
}

function toleranceText(run: ModelRun): string {
  const bt = run.backtest;
  if (!bt) return '';
  const m = bt.tolerance.metric;
  const value = m === 'MAPE' ? bt.metrics.mape : m === 'MAE' ? bt.metrics.mae : bt.metrics.rmse;
  const fmt = (v: number | null) =>
    v === null
      ? '-'
      : m === 'MAPE'
        ? `${v.toFixed(2)}%`
        : run.modelType === 'Prepayment'
          ? `${(v * 100).toFixed(3)}%`
          : run.modelType === 'RepricingBeta'
            ? `${v.toFixed(3)} pp`
            : formatAmount(v, run.segment.currency);
  return `${m} ${fmt(value)} against a tolerance of ${fmt(bt.tolerance.threshold)}`;
}

/** Everything a reviewer needs to judge a fit - shown on the workbench after "Fit model" and in the register. */
export function ModelRunDetail({
  run,
  chart,
  chartUnit,
}: {
  run: ModelRun;
  chart: ModelRunChartPoint[];
  chartUnit: Unit;
}) {
  const currency = run.segment.currency;
  const paramRows = Object.entries(run.params).filter(
    ([k]) => k !== 'coreMethod' && k !== 'decayMethod' && k !== 'behaviouralTag',
  );
  const ciOnly = Object.keys(run.confidenceIntervals).filter((k) => !(k in run.params));
  const statRows = Object.entries(run.fitStats).filter(([, v]) => v !== null && v !== undefined);
  const profile = run.outputs.runoffProfile;
  const profileData = profile
    ? [...new Set(profile.buckets.map((b) => b.tenorDays))].map((tenor) => ({
        bucket: tenor >= 365 ? `${(tenor / 365).toFixed(tenor % 365 === 0 ? 0 : 1)}Y` : `${tenor}d`,
        Volatile: profile.buckets
          .filter((b) => b.tenorDays === tenor && b.type === 'Volatile')
          .reduce((s, b) => s + b.percent, 0),
        Core: profile.buckets
          .filter((b) => b.tenorDays === tenor && b.type === 'Core')
          .reduce((s, b) => s + b.percent, 0),
      }))
    : [];
  const btUnit = backtestUnit(run);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
        <StatusBadge status={MODEL_TYPE_LABEL[run.modelType]} tone="info" />
        <span className="font-bold text-navy-900">{segmentLabel(run.segment.key)}</span>
        <span>·</span>
        <span>
          Data window {run.window.from} to {run.window.to} ({run.window.observations} observation
          {run.window.observations === 1 ? '' : 's'})
        </span>
        {typeof run.params.coreMethod === 'string' && <span>· Core: {run.params.coreMethod}</span>}
        {typeof run.params.decayMethod === 'string' && <span>· Run-off: {run.params.decayMethod}</span>}
        {typeof run.params.behaviouralTag === 'string' && (
          <span>· Applies to {run.params.behaviouralTag} deposits</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Parameters"
          about="Estimated values with 95% confidence intervals where the method gives one. A wide interval means the data pins the value down poorly."
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Parameter</th>
                <th className={`${th} text-right`}>Estimate</th>
                <th className={`${th} text-right`}>95% interval</th>
              </tr>
            </thead>
            <tbody>
              {paramRows.map(([k, v]) => {
                const spec = PARAMS[k];
                const ci = run.confidenceIntervals[k];
                return (
                  <tr key={k} className="border-b border-gray-50">
                    <td className={td}>
                      <span className="inline-flex items-center gap-1">
                        {spec?.label ?? k}
                        {spec?.about && <InfoButton label={`About ${spec.label}`}>{spec.about}</InfoButton>}
                      </span>
                    </td>
                    <td className={`${td} text-right font-mono`}>
                      {typeof v === 'number'
                        ? spec
                          ? spec.format(v, currency)
                          : v.toFixed(4)
                        : v === null
                          ? 'not estimable'
                          : v}
                    </td>
                    <td className={`${td} text-right font-mono text-gray-500`}>
                      {ci
                        ? `${spec ? spec.format(ci.lower, currency) : ci.lower.toFixed(4)} – ${spec ? spec.format(ci.upper, currency) : ci.upper.toFixed(4)}`
                        : '-'}
                    </td>
                  </tr>
                );
              })}
              {ciOnly.map((k) => {
                const ci = run.confidenceIntervals[k]!;
                const spec = PARAMS[k];
                const point = run.fitStats[k];
                return (
                  <tr key={k} className="border-b border-gray-50">
                    <td className={td}>{spec?.label ?? k}</td>
                    <td className={`${td} text-right font-mono`}>
                      {typeof point === 'number' ? (spec ? spec.format(point, currency) : point) : '-'}
                    </td>
                    <td className={`${td} text-right font-mono text-gray-500`}>
                      {spec
                        ? `${spec.format(ci.lower, currency)} – ${spec.format(ci.upper, currency)}`
                        : `${ci.lower} – ${ci.upper}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section
          title="Fit statistics"
          about="How well the model reproduces the history it was fitted to. In-sample only - the back-test below is the out-of-sample check."
        >
          {statRows.length === 0 ? (
            <p className="text-[13px] text-gray-500">This method does not produce in-sample fit statistics.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              {statRows.map(([k, v]) => {
                const spec = STATS[k];
                return (
                  <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      {spec?.label ?? k}
                      {spec?.about && <InfoButton label={`About ${spec.label}`}>{spec.about}</InfoButton>}
                    </dt>
                    <dd className="font-mono text-[14px] font-bold text-navy-900">
                      {spec ? spec.format(v as number, run) : String(v)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
          {run.modelType === 'DepositRunoff' && run.params.decayMethod === 'OutflowPercentile' && (
            <p className="mt-3 text-[12px] leading-relaxed text-gray-500">
              Outflow percentile is not a balance-path model, so there is no fitted line, R² or back-test - the run-off
              rate is the stressed (percentile) monthly outflow actually observed.
            </p>
          )}
        </Section>
      </div>

      {chart.length > 0 && (
        <Section title="Actual vs fitted">
          <SeriesChart data={chart} unit={chartUnit} currency={currency} labels={chartLabels(run)} />
        </Section>
      )}

      {profile && (
        <Section
          title="Resulting run-off profile"
          about="Share of today's balance assumed to leave in each tenor bucket. This is what becomes the behaviour pattern's tiers."
        >
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={profileData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
                />
                <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                <Bar dataKey="Volatile" stackId="a" fill={CHART_COLORS.accent} />
                <Bar dataKey="Core" stackId="a" fill={CHART_COLORS.primary} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {run.outputs.behaviourPattern && (
            <p className="mt-2 text-[12px] text-gray-500">
              Pattern tiers:{' '}
              {run.outputs.behaviourPattern.tiers.map((t) => `${t.tenorDays}d ${t.percent}% ${t.type}`).join(' · ')}
            </p>
          )}
        </Section>
      )}

      <Section
        title="Back-test"
        about="The model is refitted on the earlier months only and asked to predict the held-out months it never saw. Pass means the out-of-sample error is within the tolerance you set."
      >
        {run.backtest ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
              <StatusBadge
                status={run.backtest.passed ? 'Pass' : 'Fail'}
                tone={run.backtest.passed ? 'success' : 'danger'}
              />
              <span className="text-gray-600">
                Trained on {run.backtest.train.from} to {run.backtest.train.to}; tested on {run.backtest.test.from} to{' '}
                {run.backtest.test.to}. {toleranceText(run)}.
              </span>
            </div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={run.backtest.points} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={CHART_AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tickFormatter={(v: number) => formatUnit(v, btUnit, currency)}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [formatUnit(v, btUnit, currency), name]}
                  />
                  <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART_COLORS.primary} strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Predicted"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="mt-3 w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={th}>Month</th>
                  <th className={`${th} text-right`}>Actual</th>
                  <th className={`${th} text-right`}>Predicted</th>
                  <th className={`${th} text-right`}>Error</th>
                </tr>
              </thead>
              <tbody>
                {run.backtest.points.map((p) => (
                  <tr key={p.month} className="border-b border-gray-50">
                    <td className={td}>{p.month}</td>
                    <td className={`${td} text-right font-mono`}>{formatUnit(p.actual, btUnit, currency)}</td>
                    <td className={`${td} text-right font-mono`}>{formatUnit(p.predicted, btUnit, currency)}</td>
                    <td className={`${td} text-right font-mono`}>{formatUnit(p.error, btUnit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-[13px] text-gray-500">
            {run.modelType === 'TermDeposit'
              ? 'Renewal and early-withdrawal rates are observed proportions over the chosen period, not a path model, so there is nothing to project forward. Judge them by their confidence intervals and by refitting on a different period.'
              : run.modelType === 'DepositRunoff' && run.params.decayMethod === 'OutflowPercentile'
                ? 'Not applicable to outflow percentile - it measures a stressed outflow rate rather than predicting a balance path.'
                : 'No back-test was run - set a hold-out of at least one month before fitting.'}
          </p>
        )}
      </Section>

      <Section title="Methodology">
        <p className="text-[13px] leading-relaxed text-gray-600">{run.methodology}</p>
      </Section>
    </div>
  );
}
