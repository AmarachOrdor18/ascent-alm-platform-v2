/**
 * Key Risk Indicators — screen 46 (Phase 7).
 *
 * Trend-based early-warning indicators, distinct from Limits & Breaches' hard threshold status.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';

export function Kri() {
  // Mock KRI data - in real implementation this would come from the KRI Engine
  const mockKris = [
    {
      metricKey: 'lcrTrend',
      label: 'LCR Trend (30-day)',
      value: 88.4,
      trend: 'Worsening' as const,
      earlyWarning: true,
      earlyWarningReason: 'LCR has declined 3.2 points over the last 30 days, approaching regulatory floor.',
    },
    {
      metricKey: 'nsfrTrend',
      label: 'NSFR Trend (90-day)',
      value: 103.6,
      trend: 'Stable' as const,
      earlyWarning: false,
      earlyWarningReason: null,
    },
    {
      metricKey: 'concentrationTrend',
      label: 'Deposit Concentration Trend',
      value: 40.7,
      trend: 'Improving' as const,
      earlyWarning: false,
      earlyWarningReason: null,
    },
    {
      metricKey: 'niiSensitivityTrend',
      label: 'NII Sensitivity Trend',
      value: -8.1,
      trend: 'Worsening' as const,
      earlyWarning: true,
      earlyWarningReason: 'NII sensitivity has become more negative by 1.4 points due to rate environment shift.',
    },
    {
      metricKey: 'gapTrend',
      label: 'Liquidity Gap Trend (0-30d)',
      value: -2.3,
      trend: 'Stable' as const,
      earlyWarning: false,
      earlyWarningReason: null,
    },
    {
      metricKey: 'hqlaTrend',
      label: 'HQLA Coverage Trend',
      value: 15.2,
      trend: 'Improving' as const,
      earlyWarning: false,
      earlyWarningReason: null,
    },
  ];

  const redCount = mockKris.filter((k) => k.earlyWarning).length;
  const amberCount = mockKris.filter((k) => k.trend === 'Worsening' && !k.earlyWarning).length;
  const greenCount = mockKris.filter((k) => k.trend === 'Improving' || (k.trend === 'Stable' && !k.earlyWarning)).length;

  function visualStatus(k: typeof mockKris[0]): 'Red' | 'Amber' | 'Green' {
    if (k.earlyWarning) return 'Red';
    if (k.trend === 'Worsening') return 'Amber';
    return 'Green';
  }

  const kriStatusClass = {
    Red: 'bg-danger-bg text-danger',
    Amber: 'bg-warning-bg text-warning',
    Green: 'bg-success-bg text-success',
  } as const;

  function KriStatusBadge({ status }: { status: string }) {
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center whitespace-nowrap ${kriStatusClass[status as keyof typeof kriStatusClass] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  }

  function Sparkline({ values, status }: { values: number[]; status: string }) {
    if (values.length === 0) return <p className="text-[10px] text-gray-400">Insufficient history</p>;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const color = status === 'Red' ? 'bg-danger' : status === 'Amber' ? 'bg-warning' : 'bg-success';
    return (
      <div className="flex items-end gap-1 h-9">
        {values.map((v, i) => {
          const heightPct = 15 + ((v - min) / range) * 85;
          return <div key={i} className={`w-2.5 rounded-sm ${color} opacity-70`} style={{ height: `${heightPct}%` }} />;
        })}
      </div>
    );
  }

  // Mock trend data for sparklines
  const mockTrendData = mockKris.map(() => Array.from({ length: 10 }, () => Math.random() * 20 + 80));

  return (
    <>
      <ModuleHeader
        title="Key Risk Indicators (KRI)"
        description="Trend-based early-warning indicators, live from KRI Engine — distinct from Limits & Breaches' hard threshold status"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Red Indicators', value: String(redCount), tone: redCount > 0 ? 'danger' : 'success' },
          { label: 'Amber Indicators', value: String(amberCount), tone: amberCount > 0 ? 'warning' : 'neutral' },
          { label: 'Green Indicators', value: String(greenCount), tone: 'success' },
          { label: 'Total KRIs Tracked', value: String(mockKris.length) },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {mockKris.map((k, i) => {
          const status = visualStatus(k);
          return (
            <div key={k.metricKey} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[12px] font-bold text-navy-900 leading-snug pr-2">{k.label}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{k.trend}</p>
                </div>
                <KriStatusBadge status={status} />
              </div>
              <div className="flex items-end justify-between mb-3">
                <span className="text-[20px] font-bold text-navy-900 tracking-tight">{k.value.toFixed(1)}%</span>
                <Sparkline values={mockTrendData[i] ?? []} status={status} />
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-50 pt-3">
                {k.earlyWarningReason ?? 'No early-warning signal currently.'}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}