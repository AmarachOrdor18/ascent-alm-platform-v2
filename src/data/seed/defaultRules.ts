// TimeBucket, BehaviourPattern and ForecastScenario rules mirror real engine fallbacks (defaultLadder(),
// DEFAULT_PATTERNS, standardShocks) — a run always calculates on some basis even with no rule attached, so
// these are seeded as ordinary, versioned, editable rules rather than left implicit.

import type { BehaviourPatternRule, ForecastScenarioRule, NewBusinessRule, TimeBucketRule } from '@/engine/ruleTypes';
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

export const SEED_DEFAULT_RULES = [
  SEED_TIME_BUCKET_RULE,
  SEED_BEHAVIOUR_PATTERN_RULE,
  SEED_FORECAST_SCENARIO_RULE,
  SEED_NEW_BUSINESS_RULE,
];
