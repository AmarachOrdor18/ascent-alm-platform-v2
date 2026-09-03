import { useQueries } from '@tanstack/react-query';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useFxRates } from '@/lib/hooks';
import { useRuns, runKeys } from '@/lib/runHooks';
import { accessibleAffiliates } from '@/lib/scope';
import { repository } from '@/store/localRepository';
import { metricValue } from '@/lib/metrics';
import { buildFxTable } from '@/engine/fx';
import { isDeposit } from '@/engine/liquidity';
import { convert } from '@/engine/fx';
import type { Position, RunResult } from '@/engine/types';

type Severity = 'Low' | 'Medium' | 'High' | 'No run';

const SEVERITY_STYLE: Record<
  Severity,
  { bar: string; ring: string; dot: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  Low: { bar: 'bg-success', ring: 'ring-success/20', dot: 'bg-success', tone: 'success' },
  Medium: { bar: 'bg-warning', ring: 'ring-warning/20', dot: 'bg-warning', tone: 'warning' },
  High: { bar: 'bg-danger', ring: 'ring-danger/20', dot: 'bg-danger', tone: 'danger' },
  'No run': { bar: 'bg-gray-300', ring: 'ring-gray-200', dot: 'bg-gray-300', tone: 'neutral' },
};

function classify(lcr: number | null, depositSharePercent: number | null): Severity {
  if (lcr === null || depositSharePercent === null) return 'No run';
  if (lcr < 100 || depositSharePercent > 35) return 'High';
  if (lcr < 130 || depositSharePercent > 20) return 'Medium';
  return 'Low';
}

function primaryDriver(lcr: number | null, depositSharePercent: number | null, severity: Severity): string {
  if (severity === 'No run') return 'No completed run yet for this affiliate.';
  if (lcr !== null && lcr < 100) return `LCR of ${lcr.toFixed(1)}% is below the 100% regulatory minimum.`;
  if (depositSharePercent !== null && depositSharePercent > 35) {
    return `Holds ${depositSharePercent.toFixed(1)}% of Group deposit funding - a concentrated funding base.`;
  }
  if (lcr !== null && lcr < 130)
    return `LCR of ${lcr.toFixed(1)}% is inside the minimum but under the internal buffer.`;
  return 'Within LCR and funding-diversification thresholds.';
}

interface AffiliatePoint {
  code: string;
  name: string;
  region: string;
  lcr: number | null;
  nsfr: number | null;
  totalAssets: number;
  totalLiabilities: number;
  depositTotal: number;
  depositSharePercent: number | null;
  hasRun: boolean;
  severity: Severity;
}

export function RiskMap() {
  const { user, hasPermission } = useAuth();
  const { data: affiliates = [], isLoading: affiliatesLoading } = useAffiliates();
  // Runs and affiliates for the *calculation* stay Group-wide and unscoped - each affiliate's deposit
  // share is only meaningful as a fraction of the true Group total, so narrowing this to one affiliate
  // would corrupt the denominator, not just hide rows. Scope is applied below, to what's rendered.
  const { data: runs = [], isLoading: runsLoading } = useRuns();
  const { data: fxRates = [] } = useFxRates();

  const liveAffiliates = affiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');
  // A user confined to one affiliate sees that affiliate's own row, correctly computed against the
  // real Group denominator above, but not every other affiliate's individual LCR/deposit figures.
  const visibleAffiliates = accessibleAffiliates(liveAffiliates, user, hasPermission);

  const latestRunByAffiliate = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.status !== 'Completed') continue;
    const held = latestRunByAffiliate.get(run.affiliateCode);
    if (!held || run.createdAt > held.createdAt) latestRunByAffiliate.set(run.affiliateCode, run);
  }

  const resultQueries = useQueries({
    queries: liveAffiliates.map((a) => {
      const runId = latestRunByAffiliate.get(a.code)?.id ?? null;
      return {
        queryKey: runKeys.results(runId ?? 'none'),
        queryFn: (): Promise<RunResult[]> => (runId ? repository.listRunResults(runId) : Promise.resolve([])),
        enabled: runId !== null,
      };
    }),
  });

  const positionQueries = useQueries({
    queries: liveAffiliates.map((a) => {
      const asOfDate = latestRunByAffiliate.get(a.code)?.asOfDate ?? null;
      return {
        queryKey: ['positions', a.code, asOfDate ?? 'none'],
        queryFn: (): Promise<Position[]> =>
          asOfDate ? repository.queryPositions({ affiliateCode: a.code, asOfDate }) : Promise.resolve([]),
        enabled: asOfDate !== null,
      };
    }),
  });

  const raw = liveAffiliates.map((a, i) => {
    const results = resultQueries[i]?.data ?? [];
    const positions = positionQueries[i]?.data ?? [];
    const run = latestRunByAffiliate.get(a.code) ?? null;
    const fx = run ? buildFxTable('USD', fxRates, run.asOfDate) : buildFxTable('USD', fxRates, '');
    const reportingCurrency = run?.reportingCurrency ?? 'USD';

    const totalAssets = positions
      .filter((p) => p.category === 'Asset')
      .reduce((s, p) => s + convert(p.amount, p.currency, reportingCurrency, fx), 0);
    const totalLiabilities = positions
      .filter((p) => p.category === 'Liability')
      .reduce((s, p) => s + convert(p.amount, p.currency, reportingCurrency, fx), 0);
    const depositTotal = positions
      .filter(isDeposit)
      .reduce((s, p) => s + convert(p.amount, p.currency, reportingCurrency, fx), 0);

    return {
      code: a.code,
      name: a.name,
      region: a.region,
      lcr: metricValue(results, 'lcrPercent'),
      nsfr: metricValue(results, 'nsfrPercent'),
      totalAssets,
      totalLiabilities,
      depositTotal,
      hasRun: run !== null,
    };
  });

  const groupDepositTotal = raw.reduce((s, a) => s + a.depositTotal, 0);

  // Deposit share here is Group funding diversification, not the regulatory concentration measure on Concentration & Large Exposures - deliberately separate.
  const points: AffiliatePoint[] = raw.map((a) => {
    const depositSharePercent = a.hasRun && groupDepositTotal > 0 ? (a.depositTotal / groupDepositTotal) * 100 : null;
    const severity = a.hasRun ? classify(a.lcr, depositSharePercent) : 'No run';
    return { ...a, depositSharePercent, severity };
  });

  // Rendered rows are restricted to what this user may see; the counts/classification above are
  // computed Group-wide first so a restricted viewer's own row is still correct.
  const visiblePoints = points.filter((p) => visibleAffiliates.some((a) => a.code === p.code));

  // Any affiliate with a run still has its results/positions in flight the first time this page renders -
  // without this, every affiliate briefly reads as "No run" (a settled finding) rather than "still loading".
  const runDataLoading =
    affiliatesLoading ||
    runsLoading ||
    resultQueries.some((q) => q.isLoading) ||
    positionQueries.some((q) => q.isLoading);

  const highCount = points.filter((p) => p.severity === 'High').length;
  const mediumCount = points.filter((p) => p.severity === 'Medium').length;
  const lowCount = points.filter((p) => p.severity === 'Low').length;

  const fmt = (n: number) =>
    `$${Math.abs(n) >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(2)}B` : `${(n / 1_000_000).toFixed(1)}M`}`;

  const columns: ResultColumn<AffiliatePoint>[] = [
    {
      key: 'affiliate',
      header: 'Affiliate',
      render: (p) => (
        <div>
          <p className="font-medium text-navy-900">{p.name}</p>
          <p className="text-[10px] text-gray-400">{p.region}</p>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      render: (p) => <StatusBadge status={p.severity} tone={SEVERITY_STYLE[p.severity].tone} />,
    },
    {
      key: 'lcr',
      header: 'LCR',
      align: 'right',
      render: (p) => <span className="font-mono">{p.lcr !== null ? `${p.lcr.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'depositShare',
      header: 'Deposit share',
      align: 'right',
      render: (p) => (
        <span className="font-mono">
          {p.depositSharePercent !== null ? `${p.depositSharePercent.toFixed(1)}%` : '-'}
        </span>
      ),
    },
    {
      key: 'net',
      header: 'Net position',
      align: 'right',
      render: (p) => {
        const net = p.totalAssets - p.totalLiabilities;
        return <span className="font-mono">{p.hasRun ? `${net >= 0 ? '' : '-'}${fmt(net)}` : '-'}</span>;
      },
    },
    {
      key: 'assets',
      header: 'Total assets',
      align: 'right',
      render: (p) => <span className="font-mono text-gray-500">{p.hasRun ? fmt(p.totalAssets) : '-'}</span>,
    },
    {
      key: 'liabilities',
      header: 'Total liabilities',
      align: 'right',
      render: (p) => <span className="font-mono text-gray-500">{p.hasRun ? fmt(p.totalLiabilities) : '-'}</span>,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Liquidity Risk Map"
        description="Colour-coded funding concentration and LCR standing across every Live affiliate, from each one's latest completed run."
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          {
            label: 'High risk',
            value: String(highCount),
            tone: highCount > 0 ? 'danger' : 'neutral',
            about: 'Affiliates whose LCR is below 100% or whose share of Group deposit funding exceeds 35%.',
          },
          {
            label: 'Medium risk',
            value: String(mediumCount),
            tone: mediumCount > 0 ? 'warning' : 'neutral',
            about:
              'Affiliates whose LCR is between 100% and 130%, or whose Group deposit share is between 20% and 35%.',
          },
          {
            label: 'Low risk',
            value: String(lowCount),
            tone: 'success',
            about: 'Affiliates within both the LCR internal buffer and the funding-diversification threshold.',
          },
          {
            label: 'Affiliates monitored',
            value: String(liveAffiliates.length),
            about: 'How many Live affiliates have a completed run to draw a severity rating from.',
          },
        ]}
      />

      {runDataLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-[12px] text-gray-400 shadow-sm"
        >
          Loading affiliate risk positions…
        </div>
      ) : visibleAffiliates.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400 shadow-sm">
          No affiliates are Live yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Group liquidity risk concentration
                <InfoButton label="How severity is classified">
                  Each affiliate is read from its own latest completed run - a High rating means its LCR is below 100%
                  or it holds over 35% of Group deposit funding; Medium means it's inside those floors but outside the
                  internal buffer (130% LCR, 20% deposit share).
                </InfoButton>
              </h2>
              <p className="mt-1 text-[11px] font-medium text-gray-400">
                Severity from LCR standing and each affiliate's share of Group deposit funding
              </p>
            </div>
            <div className="flex items-center gap-4">
              {(['Low', 'Medium', 'High'] as const).map((label) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${SEVERITY_STYLE[label].dot}`} />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <ResultTable
            rows={visiblePoints}
            columns={columns}
            rowKey={(p) => p.code}
            renderDetail={(p) => (
              <p className="text-[11px] leading-relaxed text-gray-500">
                {primaryDriver(p.lcr, p.depositSharePercent, p.severity)}
              </p>
            )}
          />
        </div>
      )}
    </>
  );
}
