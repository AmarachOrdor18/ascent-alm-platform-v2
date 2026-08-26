/**
 * ALCO Reporting — screen 53.
 *
 * The pack the committee actually reviews: the full risk sweep, generated
 * from a real run rather than a mock table of pack titles.
 */

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

export function AlcoReporting() {
  return (
    <ReportPackScreen
      kind="ALCO"
      title="ALCO Reporting"
      description="The full risk pack for the committee — generated from a real run, not typed into a mock table."
      candidates={[...ALCO_SECTIONS]}
    />
  );
}
