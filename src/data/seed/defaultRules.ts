// TimeBucket, BehaviourPattern and ForecastScenario rules mirror real engine fallbacks (defaultLadder(),
// DEFAULT_PATTERNS, standardShocks) — a run always calculates on some basis even with no rule attached, so
// these are seeded as ordinary, versioned, editable rules rather than left implicit.

import type {
  BehaviourPatternRule,
  ForecastScenarioRule,
  NewBusinessRule,
  ProductCharacteristicRule,
  TimeBucketRule,
} from '@/engine/ruleTypes';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_BETAS, DEFAULT_PATTERNS } from '@/engine/behavioural';
import { standardShocks } from '@/engine/irrbb';

const SEEDED_AT = '2026-01-01T00:00:00Z';

function ruleMetaSeed(id: string, kind: string, name: string) {
  return {
    id,
    kind,
    name,
    description: 'Seeded from the engine default so it is visible and editable rather than implicit.',
    folder: 'Group Default',
    accessType: 'Read-Write' as const,
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy: 'system-seed',
    createdAt: SEEDED_AT,
    updatedBy: null,
    updatedAt: null,
  };
}

export const SEED_TIME_BUCKET_RULE: TimeBucketRule = {
  ...ruleMetaSeed('RULE-TIMEBUCKET-DEFAULT', 'TimeBucket', 'Group Default Time Buckets'),
  kind: 'TimeBucket',
  ladders: [defaultLadder('LiquidityGap'), defaultLadder('RepricingGap'), defaultLadder('IncomeSimulation')],
};

export const SEED_BEHAVIOUR_PATTERN_RULE: BehaviourPatternRule = {
  ...ruleMetaSeed('RULE-BEHAVIOURPATTERN-DEFAULT', 'BehaviourPattern', 'Group Default Behaviour Patterns'),
  kind: 'BehaviourPattern',
  patterns: DEFAULT_PATTERNS,
  betas: DEFAULT_BETAS,
};

export const SEED_FORECAST_SCENARIO_RULE: ForecastScenarioRule = {
  ...ruleMetaSeed('RULE-FORECASTSCENARIO-DEFAULT', 'ForecastScenario', 'Group Default +200bp Parallel'),
  kind: 'ForecastScenario',
  shockByBucket: standardShocks(defaultLadder('RepricingGap')).parallelUp!,
  basedOn: 'parallelUp',
  economicIndicatorCodes: [],
};

// Unlike the three rules above, NewBusiness has no engine fallback — a run with none is genuinely static.
// This entry is Nigeria's actual FY26 growth plan, not a Group default.
export const SEED_NEW_BUSINESS_RULE: NewBusinessRule = {
  ...ruleMetaSeed('RULE-NEWBUSINESS-NG-FY26', 'NewBusiness', 'Nigeria — FY26 Growth Plan'),
  kind: 'NewBusiness',
  folder: 'Nigeria',
  affiliateCode: 'NG',
  lines: [
    {
      productCode: 'P-LOANS---CORPORATE--1-3Y',
      currency: 'NGN',
      method: 'TargetGrowthPercent',
      value: 8,
      timing: 'Distributed',
      pricingMarginBps: 250,
      maturityMix: { '0-30D': 0, '1-3M': 10, '3-6M': 15, '6-12M': 20, '1-3Y': 40, '3-5Y': 15, '5Y+': 0 },
    },
    {
      productCode: 'P-CORPORATE-DEPOSITS---OPERATI',
      currency: 'NGN',
      method: 'TargetGrowthPercent',
      value: 5,
      timing: 'Distributed',
      pricingMarginBps: 0,
      maturityMix: { '0-30D': 60, '1-3M': 25, '3-6M': 10, '6-12M': 5, '1-3Y': 0, '3-5Y': 0, '5Y+': 0 },
    },
  ],
};

// Regulatory/behavioural classification by product and currency (engine/classification.ts) — derived from the
// Nigeria seed position book itself, so applying this rule reproduces exactly what's already loaded rather
// than silently changing the demo's numbers. A department uploading Loans, Deposits or Treasury data supplies
// productClass and currency; this rule is what turns that into HQLA level, haircuts and ASF/RSF factors,
// which is the whole point — a Loans officer should never need to type in "HQLA Level 2A" by hand.
export const SEED_PRODUCT_CHARACTERISTIC_RULE: ProductCharacteristicRule = {
  ...ruleMetaSeed('RULE-PRODUCTCHARACTERISTIC-DEFAULT', 'ProductCharacteristic', 'Group Default Product Characteristics'),
  kind: 'ProductCharacteristic',
  assumptions: [
    { productCode: 'P-CASH-IN-TILL', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 0, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-CASH-IN-TRANSIT', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 0, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-CASH-IN-ATM', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 0, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-CASH-AND-CENTRAL-BANK-BALANC', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 0, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-DUE-FROM-BANKS---NOSTRO', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Inflow', lcrRatePct: 100, asfFactorPct: null, rsfFactorPct: 0, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-PLACEMENTS-WITH-BANKS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Inflow', lcrRatePct: 100, asfFactorPct: null, rsfFactorPct: 15, approxDurationYears: 0.17, isRateSensitive: true },
    { productCode: 'P-TREASURY-BILLS', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 5, approxDurationYears: 0.38, isRateSensitive: true },
    { productCode: 'P-GOVERNMENT-BONDS', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 5, approxDurationYears: 4.24, isRateSensitive: true },
    { productCode: 'P-CORPORATE-BONDS', currency: 'NGN', hqlaLevel: 'Level 2A', hqlaHaircutPct: 15, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 15, approxDurationYears: 2.46, isRateSensitive: true },
    { productCode: 'P-FIXED-INCOME-INVESTMENT-RECE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Inflow', lcrRatePct: 100, asfFactorPct: null, rsfFactorPct: 50, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-LOANS-AND-ADVANCES---CORPORA', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 2.21, isRateSensitive: true },
    { productCode: 'P-OVERDRAFTS---CORPORATE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 3.73, isRateSensitive: true },
    { productCode: 'P-LOANS-AND-ADVANCES---SME', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 4.72, isRateSensitive: true },
    { productCode: 'P-MORTGAGE-LOANS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 1.34, isRateSensitive: true },
    { productCode: 'P-PERSONAL-LOANS---RETAIL', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 3.36, isRateSensitive: true },
    { productCode: 'P-STAFF-LOANS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 5.05, isRateSensitive: true },
    { productCode: 'P-AGRICULTURAL-FINANCE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 3.88, isRateSensitive: true },
    { productCode: 'P-TRADE-FINANCE---IMPORT', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 2.53, isRateSensitive: true },
    { productCode: 'P-ASSET-FINANCE---LEASES', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 85, approxDurationYears: 5.73, isRateSensitive: true },
    { productCode: 'P-FIXED-AND-OTHER-ASSETS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 100, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-FIXED-ASSETS-ACCOUNTS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 100, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-CURRENT', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 5, asfFactorPct: 90, rsfFactorPct: null, approxDurationYears: 0.59, isRateSensitive: false },
    { productCode: 'P-CURRENT---CORPORATE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 25, asfFactorPct: 50, rsfFactorPct: null, approxDurationYears: 1.46, isRateSensitive: true },
    { productCode: 'P-SAVINGS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 5, asfFactorPct: 95, rsfFactorPct: null, approxDurationYears: 1.28, isRateSensitive: false },
    { productCode: 'P-FIXED', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 5, asfFactorPct: 95, rsfFactorPct: null, approxDurationYears: 0.61, isRateSensitive: true },
    { productCode: 'P-FIXED---CORPORATE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 40, asfFactorPct: 50, rsfFactorPct: null, approxDurationYears: 1.15, isRateSensitive: true },
    { productCode: 'P-TARGET', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 3, asfFactorPct: 95, rsfFactorPct: null, approxDurationYears: 1.75, isRateSensitive: true },
    { productCode: 'P-DOMICILIARY-DEPOSITS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 25, asfFactorPct: 50, rsfFactorPct: null, approxDurationYears: 1.36, isRateSensitive: true },
    { productCode: 'P-DUE-TO-BANKS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 100, asfFactorPct: 0, rsfFactorPct: null, approxDurationYears: 2.28, isRateSensitive: true },
    { productCode: 'P-LONG-TERM-BORROWINGS', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 0, asfFactorPct: 100, rsfFactorPct: null, approxDurationYears: 1.71, isRateSensitive: true },
    { productCode: 'P-DEBT-SECURITIES-ISSUED', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 0, asfFactorPct: 100, rsfFactorPct: null, approxDurationYears: 3.4, isRateSensitive: true },
    { productCode: 'P-INTEREST-PAYABLE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 100, asfFactorPct: 0, rsfFactorPct: null, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-OTHER-LIABILITIES-AND-ACCRUA', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 100, asfFactorPct: 0, rsfFactorPct: null, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-MANAGERS-CHEQUES-PAYABLE', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 100, asfFactorPct: 0, rsfFactorPct: null, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-SHARE-CAPITAL', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: 100, rsfFactorPct: null, approxDurationYears: null, isRateSensitive: false },
    { productCode: 'P-RETAINED-EARNINGS-AND-RESERV', currency: 'NGN', hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'None', lcrRatePct: null, asfFactorPct: 100, rsfFactorPct: null, approxDurationYears: null, isRateSensitive: false },
  ],
};

export const SEED_DEFAULT_RULES = [
  SEED_TIME_BUCKET_RULE,
  SEED_BEHAVIOUR_PATTERN_RULE,
  SEED_FORECAST_SCENARIO_RULE,
  SEED_NEW_BUSINESS_RULE,
  SEED_PRODUCT_CHARACTERISTIC_RULE,
];
