import type { LimitConfig } from '@/engine/limits';

const STAMP = { updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z', isActive: true };

// Thresholds below are illustrative starting points, not Ecobank's actual risk appetite - editable on the Limits screen.
// `affiliateCode: null` means the limit applies everywhere unless an affiliate-specific one overrides it.
export const SEED_LIMITS: LimitConfig[] = [
  {
    id: 'LIM-LCR', metricKey: 'lcrPercent', label: 'Liquidity Coverage Ratio',
    affiliateCode: null, direction: 'higher-is-better',
    greenThreshold: 130, amberThreshold: 115, redThreshold: 100,
    regulatoryMinimum: 100, ...STAMP,
  },
  {
    id: 'LIM-NSFR', metricKey: 'nsfrPercent', label: 'Net Stable Funding Ratio',
    affiliateCode: null, direction: 'higher-is-better',
    greenThreshold: 110, amberThreshold: 105, redThreshold: 100,
    regulatoryMinimum: 100, ...STAMP,
  },
  {
    id: 'LIM-LDR', metricKey: 'loanToDepositPercent', label: 'Loan-to-Deposit Ratio',
    affiliateCode: null, direction: 'lower-is-better',
    greenThreshold: 75, amberThreshold: 85, redThreshold: 95,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-SURVIVAL', metricKey: 'survivalHorizonDays', label: 'Liquidity Survival Horizon',
    affiliateCode: null, direction: 'higher-is-better',
    greenThreshold: 30, amberThreshold: 25, redThreshold: 20,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-CONC-1', metricKey: 'largestDepositorSharePercent', label: 'Largest Single Depositor',
    affiliateCode: null, direction: 'lower-is-better',
    greenThreshold: 5, amberThreshold: 10, redThreshold: 15,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-CONC-10', metricKey: 'topTenDepositorSharePercent', label: 'Top-10 Depositor Concentration',
    affiliateCode: null, direction: 'lower-is-better',
    greenThreshold: 25, amberThreshold: 40, redThreshold: 50,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-NPL', metricKey: 'nplRatioPercent', label: 'Non-Performing Loan Ratio',
    affiliateCode: null, direction: 'lower-is-better',
    greenThreshold: 3, amberThreshold: 5, redThreshold: 8,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-NPL-COV', metricKey: 'nplCoverageRatioPercent', label: 'NPL Coverage Ratio',
    affiliateCode: null, direction: 'higher-is-better',
    greenThreshold: 100, amberThreshold: 80, redThreshold: 60,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-EVE', metricKey: 'eveSensitivityPercent', label: 'EVE Sensitivity (% of capital)',
    affiliateCode: null, direction: 'higher-is-better',
    // BCBS 368 outlier threshold is -15%.
    greenThreshold: -8, amberThreshold: -12, redThreshold: -15,
    regulatoryMinimum: -15, ...STAMP,
  },
  {
    id: 'LIM-NII', metricKey: 'niiSensitivityPercent', label: 'NII Sensitivity',
    affiliateCode: null, direction: 'higher-is-better',
    greenThreshold: -5, amberThreshold: -8, redThreshold: -12,
    regulatoryMinimum: null, ...STAMP,
  },
  {
    id: 'LIM-FX', metricKey: 'fxNetOpenPositionPercent', label: 'Aggregate FX Net Open Position',
    affiliateCode: null, direction: 'lower-is-better',
    greenThreshold: 10, amberThreshold: 15, redThreshold: 20,
    regulatoryMinimum: 20, ...STAMP,
  },
];
