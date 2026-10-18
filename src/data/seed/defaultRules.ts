// TimeBucket, BehaviourPattern and ForecastScenario rules mirror real engine fallbacks (defaultLadder(),
// DEFAULT_PATTERNS, standardShocks) - a run always calculates on some basis even with no rule attached, so
// these are seeded as ordinary, versioned, editable rules rather than left implicit.

import type {
  AdjustmentRuleDef,
  BehaviourPatternRule,
  CapitalAllocationRuleDef,
  CostAllocationRuleDef,
  CreditLossRuleDef,
  ForecastScenarioRule,
  FtpRule,
  NewBusinessRule,
  ProductCharacteristicRule,
  TimeBucketRule,
} from '@/engine/ruleTypes';
import type { ApprovalRequest } from '@/engine/types';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_BETAS, DEFAULT_PATTERNS } from '@/engine/behavioural';
import type { CostPool } from '@/engine/profitabilityLayers';
import { standardShocks } from '@/engine/irrbb';
import { SEED_AUTHOR } from '@/lib/ruleApproval';

const SEEDED_AT = '2026-01-01T00:00:00Z';

function ruleMetaSeed(id: string, kind: string, name: string, description?: string) {
  return {
    id,
    kind,
    name,
    description: description ?? 'Seeded from the engine default so it is visible and editable rather than implicit.',
    folder: 'Group Default',
    accessType: 'Read-Write' as const,
    affiliateCode: null,
    version: 1,
    isActive: true,
    // Marks the rule as a shipped baseline: an unedited seeded rule counts as approved (lib/ruleApproval.ts),
    // so an approval-gated kind like Behaviour Patterns is usable on day one without a request nobody raised.
    createdBy: SEED_AUTHOR,
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

// Every OTHER scenario gets its Activate request raised at the moment it's saved (see WhatIf.tsx's
// handleSaveScenario) - a real user creating one, needing a real second pair of eyes. This one is
// seeded directly into the database, never "saved" through that flow, so without this it would sit
// forever labelled "Pending approval" on Run now with no request anywhere in Approvals for anyone
// to actually decide - a maker-checker gate nobody can ever pass, not maker-checker working as intended.
// Treated as pre-vetted at the point of shipping, the same way the Time Bucket and Behaviour Pattern
// defaults require no approval at all.
export const SEED_FORECAST_SCENARIO_APPROVAL: ApprovalRequest = {
  id: 'APR-FORECASTSCENARIO-DEFAULT',
  module: 'Stress Testing',
  entityType: 'ForecastScenario',
  entityId: 'RULE-FORECASTSCENARIO-DEFAULT',
  entityLabel: 'Group Default +200bp Parallel',
  action: 'Create',
  summary: 'Basel-standard +200bp parallel shock, shipped as the Group default and pre-approved as such.',
  affiliateCode: null,
  status: 'Approved',
  requestedBy: 'system-seed',
  requestedAt: SEEDED_AT,
  decidedBy: 'system-seed',
  decidedAt: SEEDED_AT,
  decisionNote: 'Pre-approved at seed time - a shipped baseline, not a user-submitted scenario.',
};

// Unlike the three rules above, NewBusiness has no engine fallback - a run with none is genuinely static.
// This entry is Nigeria's actual FY26 growth plan, not a Group default.
export const SEED_NEW_BUSINESS_RULE: NewBusinessRule = {
  ...ruleMetaSeed('RULE-NEWBUSINESS-NG-FY26', 'NewBusiness', 'Nigeria - FY26 Growth Plan'),
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

// Regulatory/behavioural classification by product and currency (engine/classification.ts) - derived from the
// Nigeria seed position book itself, so applying this rule reproduces exactly what's already loaded rather
// than silently changing the demo's numbers. A department uploading Loans, Deposits or Treasury data supplies
// productClass and currency; this rule is what turns that into HQLA level, haircuts and ASF/RSF factors,
// which is the whole point - a Loans officer should never need to type in "HQLA Level 2A" by hand.
export const SEED_PRODUCT_CHARACTERISTIC_RULE: ProductCharacteristicRule = {
  ...ruleMetaSeed(
    'RULE-PRODUCTCHARACTERISTIC-DEFAULT',
    'ProductCharacteristic',
    'Group Default Product Characteristics',
  ),
  kind: 'ProductCharacteristic',
  assumptions: [
    {
      productCode: 'P-CASH-IN-TILL',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 0,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-CASH-IN-TRANSIT',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 0,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-CASH-IN-ATM',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 0,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-CASH-AND-CENTRAL-BANK-BALANC',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 0,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-DUE-FROM-BANKS---NOSTRO',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Inflow',
      lcrRatePct: 100,
      asfFactorPct: null,
      rsfFactorPct: 0,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-PLACEMENTS-WITH-BANKS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Inflow',
      lcrRatePct: 100,
      asfFactorPct: null,
      rsfFactorPct: 15,
      approxDurationYears: 0.17,
      isRateSensitive: true,
    },
    {
      productCode: 'P-TREASURY-BILLS',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 5,
      approxDurationYears: 0.38,
      isRateSensitive: true,
    },
    {
      productCode: 'P-GOVERNMENT-BONDS',
      currency: 'NGN',
      hqlaLevel: 'Level 1',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 5,
      approxDurationYears: 4.24,
      isRateSensitive: true,
    },
    {
      productCode: 'P-CORPORATE-BONDS',
      currency: 'NGN',
      hqlaLevel: 'Level 2A',
      hqlaHaircutPct: 15,
      lcrCashflowRole: 'HQLA',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 15,
      approxDurationYears: 2.46,
      isRateSensitive: true,
    },
    {
      productCode: 'P-FIXED-INCOME-INVESTMENT-RECE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Inflow',
      lcrRatePct: 100,
      asfFactorPct: null,
      rsfFactorPct: 50,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-LOANS-AND-ADVANCES---CORPORA',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 2.21,
      isRateSensitive: true,
    },
    {
      productCode: 'P-OVERDRAFTS---CORPORATE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 3.73,
      isRateSensitive: true,
    },
    {
      productCode: 'P-LOANS-AND-ADVANCES---SME',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 4.72,
      isRateSensitive: true,
    },
    {
      productCode: 'P-MORTGAGE-LOANS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 1.34,
      isRateSensitive: true,
    },
    {
      productCode: 'P-PERSONAL-LOANS---RETAIL',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 3.36,
      isRateSensitive: true,
    },
    {
      productCode: 'P-STAFF-LOANS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 5.05,
      isRateSensitive: true,
    },
    {
      productCode: 'P-AGRICULTURAL-FINANCE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 3.88,
      isRateSensitive: true,
    },
    {
      productCode: 'P-TRADE-FINANCE---IMPORT',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 2.53,
      isRateSensitive: true,
    },
    {
      productCode: 'P-ASSET-FINANCE---LEASES',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 85,
      approxDurationYears: 5.73,
      isRateSensitive: true,
    },
    {
      productCode: 'P-FIXED-AND-OTHER-ASSETS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 100,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-FIXED-ASSETS-ACCOUNTS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: 100,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-CURRENT',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 5,
      asfFactorPct: 90,
      rsfFactorPct: null,
      approxDurationYears: 0.59,
      isRateSensitive: false,
    },
    {
      productCode: 'P-CURRENT---CORPORATE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 25,
      asfFactorPct: 50,
      rsfFactorPct: null,
      approxDurationYears: 1.46,
      isRateSensitive: true,
    },
    {
      productCode: 'P-SAVINGS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 5,
      asfFactorPct: 95,
      rsfFactorPct: null,
      approxDurationYears: 1.28,
      isRateSensitive: false,
    },
    {
      productCode: 'P-FIXED',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 5,
      asfFactorPct: 95,
      rsfFactorPct: null,
      approxDurationYears: 0.61,
      isRateSensitive: true,
    },
    {
      productCode: 'P-FIXED---CORPORATE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 40,
      asfFactorPct: 50,
      rsfFactorPct: null,
      approxDurationYears: 1.15,
      isRateSensitive: true,
    },
    {
      productCode: 'P-TARGET',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 3,
      asfFactorPct: 95,
      rsfFactorPct: null,
      approxDurationYears: 1.75,
      isRateSensitive: true,
    },
    {
      productCode: 'P-DOMICILIARY-DEPOSITS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 25,
      asfFactorPct: 50,
      rsfFactorPct: null,
      approxDurationYears: 1.36,
      isRateSensitive: true,
    },
    {
      productCode: 'P-DUE-TO-BANKS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 100,
      asfFactorPct: 0,
      rsfFactorPct: null,
      approxDurationYears: 2.28,
      isRateSensitive: true,
    },
    {
      productCode: 'P-LONG-TERM-BORROWINGS',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 0,
      asfFactorPct: 100,
      rsfFactorPct: null,
      approxDurationYears: 1.71,
      isRateSensitive: true,
    },
    {
      productCode: 'P-DEBT-SECURITIES-ISSUED',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 0,
      asfFactorPct: 100,
      rsfFactorPct: null,
      approxDurationYears: 3.4,
      isRateSensitive: true,
    },
    {
      productCode: 'P-INTEREST-PAYABLE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 100,
      asfFactorPct: 0,
      rsfFactorPct: null,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-OTHER-LIABILITIES-AND-ACCRUA',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 100,
      asfFactorPct: 0,
      rsfFactorPct: null,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-MANAGERS-CHEQUES-PAYABLE',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 100,
      asfFactorPct: 0,
      rsfFactorPct: null,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-SHARE-CAPITAL',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: 100,
      rsfFactorPct: null,
      approxDurationYears: null,
      isRateSensitive: false,
    },
    {
      productCode: 'P-RETAINED-EARNINGS-AND-RESERV',
      currency: 'NGN',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: 100,
      rsfFactorPct: null,
      approxDurationYears: null,
      isRateSensitive: false,
    },
  ],
};

// SEED_NEW_BUSINESS_RULE and SEED_PRODUCT_CHARACTERISTIC_RULE are deliberately excluded from what
// actually ships - both are derived from the old Nigeria fixture book (data/seed/nigeria.ts), keyed to
// product codes ("P-LOANS-AND-ADVANCES---CORPORA" etc.) nothing in a real onboarded affiliate's data
// will ever match, and NewBusiness is worse: tagged affiliateCode 'NG', it would silently attach a
// phantom growth plan to whichever real affiliate onboards under that code. Both constants stay exported
// - classification.test.ts still uses SEED_PRODUCT_CHARACTERISTIC_RULE.assumptions directly as a fixture
// - only their presence in the seeded database is what's removed, consistent with the rest of this file's
// "no affiliate ships pre-onboarded" data (FX rates, yield curves, holiday calendars, indicators).
// ─── Group-default assumptions for the Assumptions step ──────────────────
//
// Every Group-default assumption ships with an industry-standard baseline, so nothing on the organisation
// onboarding Assumptions step shows "Not set" and a first run produces full results immediately. They are
// seeded like the rules above (SEED_AUTHOR, v1, unedited → approved) and are meant to be replaced: each
// carries figures a typical bank uses, plainly labelled as illustrative. Costs in particular (a real opex
// budget) can only ever come from the client - the shipped amount exists so the profitability layers are
// wired up, not because the number is meaningful.

export const SEED_FTP_GROUP_DEFAULT: FtpRule = {
  ...ruleMetaSeed(
    'RULE-FTP-GROUP-DEFAULT',
    'FtpRule',
    'Group Default Transfer Pricing',
    'Shipped baseline: every position priced on its currency\u2019s yield curve at matched maturity, per the organisation default method. Replace with per-product assignments.',
  ),
  kind: 'FtpRule',
  assignments: [],
  defaultMethod: 'MatchedMaturity',
};

export const SEED_ADJUSTMENT_GROUP_DEFAULT: AdjustmentRuleDef = {
  ...ruleMetaSeed(
    'RULE-ADJUSTMENT-GROUP-DEFAULT',
    'AdjustmentRule',
    'Group Default Add-ons',
    'Shipped baseline: a 25bp liquidity premium on every transfer price. Replace with your own add-ons, rates and bases.',
  ),
  kind: 'AdjustmentRule',
  adjustments: [
    {
      id: 'ADJ-GROUP-LP-DEFAULT',
      type: 'LiquidityPremium',
      commonCoaCode: null,
      method: 'FixedRate',
      fixedBps: 25,
      // Unused on FixedRate lines; carried at their engine-default values so the line stays valid if edited.
      lcrThresholdPercent: 130,
      lcrMultiplier: 1.5,
      lcrCapBps: 150,
    },
  ],
};

const DEFAULT_COST_POOLS: CostPool[] = [
  {
    id: 'POOL-GROUP-OPEX-DEFAULT',
    name: 'Group operating costs (illustrative - replace with your budget)',
    amount: 100_000_000,
    driver: 'Balance',
  },
];

export const SEED_COST_ALLOCATION_GROUP_DEFAULT: CostAllocationRuleDef = {
  ...ruleMetaSeed(
    'RULE-COSTALLOCATION-GROUP-DEFAULT',
    'CostAllocation',
    'Group Default Cost Allocation',
    'Shipped baseline: one operating-cost pool spread pro rata to balance. The amount is illustrative - replace it with your real annual budget.',
  ),
  kind: 'CostAllocation',
  currency: 'USD',
  pools: DEFAULT_COST_POOLS,
  headcountByOrgUnit: {},
};

export const SEED_CREDIT_LOSS_GROUP_DEFAULT: CreditLossRuleDef = {
  ...ruleMetaSeed(
    'RULE-CREDITLOSS-GROUP-DEFAULT',
    'CreditLoss',
    'Group Default Credit Loss',
    'Shipped baseline: 2% probability of default and 45% loss given default for every product until yours are entered.',
  ),
  kind: 'CreditLoss',
  method: 'PdLgd',
  pdByProduct: {},
  lgdByProduct: {},
  defaultPdPct: 2,
  defaultLgdPct: 45,
  useProvisionAmount: true,
};

export const SEED_CAPITAL_GROUP_DEFAULT: CapitalAllocationRuleDef = {
  ...ruleMetaSeed(
    'RULE-CAPITAL-GROUP-DEFAULT',
    'CapitalAllocation',
    'Group Default Capital',
    'Shipped baseline: Basel-standard capital held (12.5% of RWA), 100% risk weight, 15% cost of capital, 30% tax. Replace with your products\u2019 risk weights.',
  ),
  kind: 'CapitalAllocation',
  riskWeightByProductClass: {},
  defaultRiskWeightPct: 100,
  capitalRatioPct: 12.5,
  costOfCapitalPct: 15,
  taxRatePct: 30,
};

// Empty on purpose: without product codes to key on, the shipped treatment is the position\u2019s own file
// classification (liquid-asset level, cash-flow role), which is exactly what the engine does with no
// rule at all - shipping it makes that explicit and editable as real products are onboarded.
export const SEED_PRODUCT_CHARACTERISTIC_GROUP_DEFAULT: ProductCharacteristicRule = {
  ...ruleMetaSeed(
    'RULE-PRODUCTCHARACTERISTIC-GROUP-DEFAULT',
    'ProductCharacteristic',
    'Group Default Product Characteristics',
    'Shipped baseline: each position\u2019s liquidity treatment comes from its uploaded file. Add per-product assumptions as products are onboarded.',
  ),
  kind: 'ProductCharacteristic',
  assumptions: [],
};

export const SEED_DEFAULT_RULES = [
  SEED_TIME_BUCKET_RULE,
  SEED_BEHAVIOUR_PATTERN_RULE,
  SEED_FORECAST_SCENARIO_RULE,
  SEED_FTP_GROUP_DEFAULT,
  SEED_ADJUSTMENT_GROUP_DEFAULT,
  SEED_COST_ALLOCATION_GROUP_DEFAULT,
  SEED_CREDIT_LOSS_GROUP_DEFAULT,
  SEED_CAPITAL_GROUP_DEFAULT,
  SEED_PRODUCT_CHARACTERISTIC_GROUP_DEFAULT,
];
