---
name: alm-rules-engine
description: Implement configurable, versioned, effective-dated ALM/regulatory rules (HQLA, haircuts, LCR rates, ASF/RSF, buckets, behavioural assumptions, stress scenarios) for the Ascent ALM platform. Use whenever the user mentions rules, regulatory treatment, factors, haircuts, classifications, rule versions, effective dates, or moving hard-coded logic into configuration — even if they don't say "rules engine".
---

# ALM Rules Engine

Ensure ALM and regulatory treatment is **configurable, versioned, effective-dated and auditable** rather than hard-coded in screens. Assumes the canonical architecture from `alm-product-architecture`; consumes the Position Book from `alm-data-foundation`; feeds all calculation engines.

## Rule categories

Configurable rules for: HQLA classification, HQLA haircuts, LCR cash-flow treatment, LCR inflow/outflow rates, ASF factors, RSF factors, maturity buckets, behavioural assumptions, rate sensitivity, product classification, asset/liability classification, currency classification, regulatory reporting classification, stress scenarios.

## Rule structure

Each rule: rule ID, name, description, category, conditions, result, priority, effective date, expiry date, version, status, created by, approved by, audit history. Start from `src/engine/ruleTypes.ts`, `src/lib/ruleHooks.ts`, and `src/pages/rules/` — extend the existing rule model, don't invent a parallel one.

## Rule lifecycle

Draft → Maker Review → Checker Approval → Effective → Superseded → Archived. Approval flows through `alm-workflow-controls`.

## How positions flow

Position → Classification → Applicable Rule → Regulatory Treatment → Factor → Calculation. Rule evaluation is a pure, independently testable function of (position, rules as-of-date, reference data).

## Effective dating

**Never overwrite historical rules.** If a haircut changes, the old rule remains available for historical reporting and the new one takes effect on its configured date. Historical reports must stay reproducible — pick rules by reporting date, not by "latest".

## Explainability

Every derived regulatory attribute must be explainable, e.g.: *"HQLA Level 1 because product classification = sovereign security and eligibility rule X was effective on the reporting date."* Explanations travel with calculation results so reports and drill-downs can display them (`alm-data-lineage-audit` verifies this).

## Configuration UI

Provide configuration screens only for authorized users; do not expose complex regulatory configuration to ordinary users. Enforce authorization at the service/API layer, not just hidden buttons.

## Safety

Prevent unauthorized rule changes; require approval where appropriate; **never silently change a regulatory calculation** — changes go through the lifecycle and leave an audit trail.

## Implementation

Inspect existing hard-coded ALM rules and migrate them into the rules architecture where practical. Keep rule evaluation independent of the UI. Do not change regulatory formulas merely for UI convenience.
