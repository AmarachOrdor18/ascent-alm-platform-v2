/**
 * Management Reporting — screen 54.
 *
 * The lighter KPI pack for management — fewer sections than the ALCO pack,
 * same real-run machinery underneath.
 */

import { ReportPackScreen } from './ReportPackScreen';

const MANAGEMENT_SECTIONS = [
  { element: 'Lcr', title: 'Liquidity Coverage Ratio' },
  { element: 'Nsfr', title: 'Net Stable Funding Ratio' },
  { element: 'LoanToDeposit', title: 'Loan-to-Deposit' },
  { element: 'ProfitabilityRatios', title: 'Profitability Ratios' },
  { element: 'Concentration', title: 'Depositor Concentration' },
] as const;

export function ManagementReporting() {
  return (
    <ReportPackScreen
      kind="Management"
      title="Management Reporting"
      description="A lighter KPI snapshot for management review — the same real-run pack machinery, fewer sections."
      candidates={[...MANAGEMENT_SECTIONS]}
    />
  );
}
