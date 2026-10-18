// Maker-checker for the rules that change how a run calculates. Same mechanism ForecastScenario already
// uses (WhatIf.tsx submit -> Approvals -> Process Run): saving raises an ApprovalRequest, and a rule is
// usable only once a second person has approved it. Pure functions here, so the gate can be enforced
// identically by the Run now screen, the What-If/Forecast auto-pick and the execute hook itself.

import type { ApprovalRequest, RuleKind, RuleMeta } from '@/engine/types';

/** Rule kinds a run may only consume once approved. ForecastScenario is gated by its own submit flow. */
export const APPROVAL_GATED_RULE_KINDS: readonly RuleKind[] = [
  'BehaviourPattern',
  'Prepayment',
  'ProductCharacteristic',
  'CostAllocation',
  'CreditLoss',
  'CapitalAllocation',
];

/** `createdBy` on rules seeded from engine defaults (data/seed/defaultRules.ts). */
export const SEED_AUTHOR = 'system-seed';

export function isApprovalGated(kind: RuleKind): boolean {
  return APPROVAL_GATED_RULE_KINDS.includes(kind);
}

/**
 * A seeded default that nobody has edited ships pre-vetted, the same way the seeded +200bp scenario does.
 * Anything else needs an Approved request for this exact version - an approval of version 2 says nothing
 * about the version 3 someone saved afterwards.
 */
export function isRuleApproved(rule: RuleMeta, requests: ApprovalRequest[]): boolean {
  if (rule.createdBy === SEED_AUTHOR && rule.version === 1 && rule.updatedBy === null) return true;
  return requests.some(
    (r) =>
      r.entityId === rule.id &&
      r.entityType === rule.kind &&
      r.status === 'Approved' &&
      r.entityVersion === rule.version,
  );
}

/** A Pending request for the version just saved, raised by whoever saved it (name, plus app_users id when known). */
export function ruleApprovalRequest(
  rule: RuleMeta,
  requestedBy: string,
  now: string,
  requestedById?: string,
): ApprovalRequest {
  return {
    id: `APR-${rule.id}-V${rule.version}`,
    module: 'Business Rules',
    entityType: rule.kind,
    entityId: rule.id,
    entityLabel: `${rule.name} (v${rule.version})`,
    entityVersion: rule.version,
    action: rule.version === 1 ? 'Create' : 'Update',
    summary: `${rule.kind} rule "${rule.name}" saved as version ${rule.version} - not usable in a run until approved.`,
    affiliateCode: rule.affiliateCode,
    status: 'Pending',
    requestedBy,
    ...(requestedById ? { requestedById } : {}),
    requestedAt: now,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  };
}

/** Pending requests for earlier versions of this rule - nothing left to approve once a newer version is saved. */
export function supersededRequests(rule: RuleMeta, requests: ApprovalRequest[], now: string): ApprovalRequest[] {
  return requests
    .filter(
      (r) =>
        r.entityId === rule.id &&
        r.entityType === rule.kind &&
        r.status === 'Pending' &&
        r.entityVersion !== rule.version,
    )
    .map((r) => ({
      ...r,
      status: 'Withdrawn' as const,
      decidedAt: now,
      decisionNote: `Superseded by version ${rule.version}.`,
    }));
}

/**
 * The rule a screen should use for an affiliate without asking: the most recently saved approved, active
 * rule scoped to that affiliate, else the Group default. Null when nothing approved exists - the caller
 * falls back to engine defaults and says so.
 */
export function pickApprovedRule<T extends RuleMeta>(
  rules: T[],
  affiliateCode: string | null | undefined,
  requests: ApprovalRequest[],
): T | null {
  const eligible = rules.filter((r) => r.isActive && isRuleApproved(r, requests));
  const latest = (candidates: T[]) =>
    [...candidates].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0] ?? null;
  const own =
    affiliateCode && affiliateCode !== 'GROUP'
      ? latest(eligible.filter((r) => r.affiliateCode === affiliateCode))
      : null;
  return own ?? latest(eligible.filter((r) => r.affiliateCode === null));
}

/** Names of the referenced gated rules that are not approved - empty when a run may proceed. */
export function unapprovedRules(rules: Array<RuleMeta | null>, requests: ApprovalRequest[]): string[] {
  return rules
    .filter((r): r is RuleMeta => r !== null && isApprovalGated(r.kind) && !isRuleApproved(r, requests))
    .map((r) => r.name);
}
