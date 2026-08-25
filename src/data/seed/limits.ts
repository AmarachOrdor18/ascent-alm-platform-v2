/**
 * The starting limit framework.
 *
 * Two distinct things get conflated in most risk systems and are kept apart
 * here: the **regulator's floor**, which is not negotiable, and the bank's
 * **internal appetite**, which sits above it and is where management wants
 * to be told. `LimitConfig` carries both, and a breach of the regulatory
 * minimum is reported separately from a breach of appetite.
 *
 * Thresholds below are illustrative starting points, not Ecobank's actual
 * risk appetite — they are editable on the Limits screen, and the screen
 * says so rather than implying these figures came from the bank.
 */

import { REGULATORY_MINIMA, type LimitConfig } from '@/engine/limits';

const STAMP = { updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z', isActive: true };

/**
 * Group-wide defaults. `affiliateCode: null` means the limit applies
 * everywhere unless an affiliate-specific one overrides it.
 */
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
    // BCBS 368 makes a bank an outlier below -15%. Appetite bites earlier.
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

  // Nigeria's regulator sets a loan-to-deposit *floor*, not a ceiling: the
  // CBN pushes banks to lend. The Group ceiling still applies, so Nigeria
  // gets its own limit and this is exactly why limits are per-affiliate.
  {
    id: 'LIM-LDR-NG', metricKey: 'loanToDepositPercent', label: 'Loan-to-Deposit Ratio (CBN floor)',
    affiliateCode: 'NG', direction: 'higher-is-better',
    greenThreshold: 70, amberThreshold: 67, redThreshold: 65,
    regulatoryMinimum: REGULATORY_MINIMA.CBN?.loanToDepositPercent ?? 65, ...STAMP,
  },
];
