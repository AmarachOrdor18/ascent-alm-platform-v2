// The one home of every rule kind's editor (Assumptions → Rules opens these). Rules are edited only here -
// not on an affiliate's settings page - so old /affiliates/:code/settings?section=rule-<Kind> links redirect
// to these paths.
import type { RuleKind } from '@/engine/types';

export const RULE_EDITOR_PATH: Partial<Record<RuleKind, string>> = {
  TimeBucket: '/rules/time-buckets',
  ProductCharacteristic: '/rules/product-characteristics',
  BehaviourPattern: '/rules/behaviour-patterns',
  PaymentPattern: '/rules/patterns',
  Prepayment: '/rules/prepayment',
  DiscountMethod: '/rules/discount-methods',
  ForecastScenario: '/rules/scenarios',
  NewBusiness: '/rules/new-business',
  TransactionStrategy: '/rules/transaction-strategies',
  FtpRule: '/rules/ftp',
  AdjustmentRule: '/rules/adjustments',
  Filter: '/rules/filters',
  CustomMetric: '/rules/custom-metrics',
  ValidationRule: '/rules/validation',
  FieldMapping: '/rules/field-mappings',
  CodeMapping: '/rules/code-mappings',
  CostAllocation: '/rules/cost-allocation',
  CreditLoss: '/rules/credit-loss',
  CapitalAllocation: '/rules/capital',
};

export function ruleEditorPath(kind: RuleKind): string {
  return RULE_EDITOR_PATH[kind] ?? '/assumptions/rules';
}

/**
 * Where an old affiliate-settings section now lives (AffiliateSettings was split: rules → Assumptions,
 * market data → Data → Market data, data sources → Data → Sources, notifications/audit → Admin).
 * Null when the section still exists on the slim settings page.
 */
export function legacySettingsSectionTarget(section: string, isGroup: boolean): string | null {
  if (section.startsWith('rule-') && section !== 'rule-coverage') return ruleEditorPath(section.slice(5) as RuleKind);
  const map: Record<string, string> = {
    'rule-coverage': '/rules/coverage',
    'ref-yield-curves': '/data/market/curves',
    'ref-fx-rates': '/data/market/fx',
    'ref-economic-indicators': '/data/market/indicators',
    'ref-holiday-calendar': '/data/market/calendars',
    notifications: '/admin',
    audit: '/admin/audit',
    credentials: '/data/operations',
    webhooks: '/data/operations',
    export: '/data/operations/position-book',
  };
  if (section in map) return map[section]!;
  if (section === 'data-sources' && isGroup) return '/data/operations';
  return null;
}
