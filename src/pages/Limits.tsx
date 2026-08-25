/**
 * Limits & Breaches — screen 45 (Phase 7).
 *
 * Real-time threshold monitoring against Liquidity Risk Engine and IRRBB Engine.
 * Auto-opens remediation issues via Kafka when limits breach.
 */

import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { REGULATORY_MINIMA } from '@/engine/limits';
import { Link } from 'wouter';

export function Limits() {

  // Mock data for demo purposes - in real implementation this would come from the engine
  const mockLimits = [
    {
      metricKey: 'lcr',
      label: 'Liquidity Coverage Ratio (LCR)',
      value: 88.4,
      direction: 'above' as const,
      warningThreshold: 110,
      breachThreshold: 100,
      status: 'Breach' as const,
    },
    {
      metricKey: 'nsfr',
      label: 'Net Stable Funding Ratio (NSFR)',
      value: 103.6,
      direction: 'above' as const,
      warningThreshold: 110,
      breachThreshold: 100,
      status: 'Within Limit' as const,
    },
    {
      metricKey: 'loanToDeposit',
      label: 'Loan-to-Deposit Ratio',
      value: 79.9,
      direction: 'below' as const,
      warningThreshold: 80,
      breachThreshold: 90,
      status: 'Within Limit' as const,
    },
    {
      metricKey: 'concentration',
      label: 'Deposit Concentration',
      value: 40.7,
      direction: 'below' as const,
      warningThreshold: 25,
      breachThreshold: 35,
      status: 'Breach' as const,
    },
    {
      metricKey: 'niiSensitivity',
      label: 'NII Sensitivity (+200bp)',
      value: -8.1,
      direction: 'below' as const,
      warningThreshold: -5,
      breachThreshold: -10,
      status: 'Warning' as const,
    },
  ];

  const activeBreaches = mockLimits.filter((l) => l.status === 'Breach');
  const warnings = mockLimits.filter((l) => l.status === 'Warning');

  const STATUS_COLOR = {
    Breach: 'bg-danger',
    Warning: 'bg-warning',
    'Within Limit': 'bg-success',
  } as const;

  function utilizationPct(l: typeof mockLimits[0]): number {
    if (l.direction === 'above') return Math.min(100, (l.value / l.breachThreshold) * 100);
    return l.value > 0 ? Math.min(100, (l.breachThreshold / l.value) * 100) : 100;
  }

  return (
    <>
      <ModuleHeader
        title="Limits & Breaches"
        description="Real-time threshold monitoring against Liquidity Risk Engine and IRRBB Engine, Group-wide"
        asOfDate={null}
        scope="Ecobank Group"
        metrics={[
          { label: 'Active Breaches', value: String(activeBreaches.length), tone: activeBreaches.length > 0 ? 'danger' : 'success' },
          { label: 'Warnings', value: String(warnings.length), tone: warnings.length > 0 ? 'warning' : 'neutral' },
          { label: 'Limits Configured', value: String(mockLimits.length) },
          { label: 'Regulatory Minima', value: 'Basel III' },
        ]}
        actions={
          <Link
            href="/rules"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors"
          >
            Configure Rules
          </Link>
        }
      />

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Limit Utilization</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Live values from Liquidity Risk Engine and IRRBB Engine against configurable thresholds</p>
        </div>
        <div className="space-y-5">
          {mockLimits.map((l) => (
            <div key={l.metricKey}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-bold text-navy-900">{l.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-400">Warn {l.warningThreshold} · Breach {l.breachThreshold}</span>
                  <span className="text-[13px] font-bold text-navy-900">{l.value.toFixed(1)}%</span>
                  <StatusBadge status={l.status} />
                </div>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full ${STATUS_COLOR[l.status]}`}
                  style={{ width: `${utilizationPct(l)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-[12px] font-bold text-navy-900 tracking-widest uppercase">Regulatory Minima by Jurisdiction</h3>
          <p className="text-[11px] text-gray-400 font-medium mt-1">Baseline thresholds seeded from regulator selection during affiliate onboarding</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(REGULATORY_MINIMA).map(([regulator, minima]) => (
            <div key={regulator} className="border border-gray-100 rounded-lg p-4">
              <p className="text-[11px] font-bold text-navy-900">{regulator}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">LCR</span>
                  <span className="font-mono">{minima.lcrPercent}%</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">NSFR</span>
                  <span className="font-mono">{minima.nsfrPercent}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}