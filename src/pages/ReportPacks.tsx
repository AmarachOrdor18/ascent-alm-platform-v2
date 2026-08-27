import { useState } from 'react';
import { ReportPackScreen } from './ReportPackScreen';

const ALCO_SECTIONS = [
  { element: 'Lcr', title: 'Liquidity Coverage Ratio' },
  { element: 'Nsfr', title: 'Net Stable Funding Ratio' },
  { element: 'LoanToDeposit', title: 'Loan-to-Deposit' },
  { element: 'LiquidityGap', title: 'Liquidity Gap' },
  { element: 'NiiSensitivity', title: 'NII Sensitivity' },
  { element: 'EveSensitivity', title: 'EVE Sensitivity' },
  { element: 'SurvivalHorizon', title: 'Survival Horizon' },
  { element: 'Concentration', title: 'Depositor Concentration' },
  { element: 'FxPosition', title: 'FX Position' },
  { element: 'ProfitabilityRatios', title: 'Profitability Ratios' },
] as const;

const MANAGEMENT_SECTIONS = [
  { element: 'Lcr', title: 'Liquidity Coverage Ratio' },
  { element: 'Nsfr', title: 'Net Stable Funding Ratio' },
  { element: 'LoanToDeposit', title: 'Loan-to-Deposit' },
  { element: 'ProfitabilityRatios', title: 'Profitability Ratios' },
  { element: 'Concentration', title: 'Depositor Concentration' },
] as const;

const TABS = [
  {
    key: 'ALCO' as const,
    label: 'ALCO pack',
    title: 'ALCO Reporting',
    description: 'The full risk pack for the committee — generated from a real run, not typed into a mock table.',
    candidates: [...ALCO_SECTIONS],
  },
  {
    key: 'Management' as const,
    label: 'Management pack',
    title: 'Management Reporting',
    description: 'A lighter KPI snapshot for management review — the same real-run pack machinery, fewer sections.',
    candidates: [...MANAGEMENT_SECTIONS],
  },
];

export function AlcoReporting() {
  return <ReportPacks initialTab="ALCO" />;
}

export function ManagementReporting() {
  return <ReportPacks initialTab="Management" />;
}

export function ReportPacks({ initialTab }: { initialTab?: 'ALCO' | 'Management' }) {
  const [tab, setTab] = useState<'ALCO' | 'Management'>(initialTab ?? 'ALCO');
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <>
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white'
                : 'rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 hover:border-navy-700 hover:text-navy-900'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <ReportPackScreen kind={active.key} title={active.title} description={active.description} candidates={active.candidates} />
    </>
  );
}
