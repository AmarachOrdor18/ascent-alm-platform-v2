/**
 * Rule types that ship with a real engine default, seeded as real rules.
 *
 * Time Buckets and Behaviour Patterns aren't optional the way Filters or
 * Custom Metrics are: `assembleInputs` falls back to `defaultLadder()` and
 * `DEFAULT_PATTERNS` whenever no rule is attached to a run, so a
 * calculation is always happening on *some* basis. The Models & Assumptions
 * registry showed these as "Not configured" regardless, which reads as
 * "nothing is happening" when something demonstrably is - and there was
 * nowhere to see or change what that basis actually was without reading
 * the engine source.
 *
 * Forecast Scenarios has the same shape of problem one level deeper: a run
 * with no scenario selected always used a flat 200bp shock in engine/run.ts,
 * and until runHooks.ts started reading `forecastScenarioIds`, selecting a
 * scenario didn't change that either.
 *
 * These three are seeded as ordinary, versioned, editable rules - editing
 * one and re-running genuinely changes the figures the same way editing any
 * other rule does. They are not a special "defaults" concept; they are the
 * Group Default folder's starting content.
 */

import type { BehaviourPatternRule, ForecastScenarioRule, TimeBucketRule } from '@/engine/ruleTypes';
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

export const SEED_DEFAULT_RULES = [
  SEED_TIME_BUCKET_RULE,
  SEED_BEHAVIOUR_PATTERN_RULE,
  SEED_FORECAST_SCENARIO_RULE,
];
