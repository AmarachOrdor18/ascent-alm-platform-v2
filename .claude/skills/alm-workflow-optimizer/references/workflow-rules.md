# Optimization rules and scoring

## Step classification (authoritative — `SKILL.md` points here)

Decompose the workflow first (see `workflow-contract.md`), then classify every USER ACTION
and SYSTEM ACTION stage as exactly one of the following. **State the classification and the
reason for it** in any ANALYZE or COMPARE output — "this looks removable" is not a
classification, "this is NAVIGATION-ONLY because X duplicates the routing Y already does"
is.

- **REQUIRED** — performs a necessary business, control, regulatory, security, data,
  approval, or audit function. Maps to a PRECONDITION, VALIDATION, STATE TRANSITION,
  APPROVAL/CONTROL, or AUDIT EVENT stage in the workflow contract. Keep, full stop.
- **COMBINABLE** — two steps the user experiences as one task, split only by page/component
  structure, with no distinct permission or control between them. Merge.
- **AUTOMATABLE** — the value is already known deterministically from context (`useScope()`,
  `useAuth()`'s `user`, the selected `run`, a prior step's answer in the same wizard) and
  shouldn't be re-asked. Automate.
- **CONDITIONAL** — only meaningful for a subset of already-chosen inputs (e.g. shock-type
  fields in `ForecastScenarios.tsx` that only apply to one shock kind). Show conditionally,
  don't remove.
- **REDUNDANT** — genuinely duplicates another control or screen with no distinct data or
  permission of its own (the sidebar Feed/Catalogue split, ALCO Reporting vs. Management
  Reporting before their merge, "In breach" shown in two places). Verify duplication by
  tracing both call sites, not by name similarity — `LiquidityRisk.tsx`, `GapAnalysis.tsx`,
  and `RiskMap.tsx` all sound related but each holds distinct data; none is REDUNDANT with
  the others.
- **NAVIGATION-ONLY** — exists because of route/information-architecture structure, not a
  real business requirement: no distinct permission, no distinct validation, no distinct
  state transition, nothing in the workflow contract beyond USER ACTION → SYSTEM ACTION
  (navigate). Strongest candidate for removal.

If a step's function is ambiguous — it's not obviously REQUIRED but you can't rule out a
regulatory, governance, calculation, validation, audit, or scope purpose either — do not
classify it as REDUNDANT or NAVIGATION-ONLY by default. See the ambiguous-logic safety rule
in `SKILL.md`: inspect further, then flag it rather than guessing permissive.

## Rules

**R1 — Remove navigation-only steps.** If a screen exists only to route to another screen
(no distinct decision, no distinct permission, no distinct data), fold it in. This session's
sidebar consolidation did exactly this: Feed/Catalogue collapsed into one configurable place
under Onboard Affiliate's Connectivity step; ALCO Reporting and Management Reporting merged
into one tab-switched `ReportPacks.tsx` screen sharing `ReportPackScreen.tsx`.

**R2 — Reuse known context, don't re-ask.** `useScope()` already carries `affiliateCode` and
`asOfDate`; `useAuth()` already carries `user` and `role`. A screen that adds its own
affiliate/date picker instead of reading scope is asking the user something the app already
knows — check whether that's deliberate (a report generator picking a *different* affiliate
than the current scope, on purpose) or accidental before "fixing" it.

**R3 — One primary action per screen.** `ModuleHeader`'s `actions` slot is the established
place for the one action that matters (Download PDF, Email pack, Onboard affiliate). Don't
stack three equally-weighted buttons where a real workflow only ever uses one of them.

**R4 — Automate what's already decided.** `ScopeContext`'s auto-sync to `user.affiliateCode`
on login is this pattern already applied: don't make a scoped user manually pick their own
affiliate on every session.

**R5 — Conditional fields, not one giant form.** `ForecastScenarios.tsx`'s `ShockCurveEditor`
and `TimeBucketRules.tsx`'s `BucketTimeline` only show the controls relevant to the chosen
shape — apply the same discipline to any new configuration screen.

**R6 — Optimize around a control, never through it.** If a maker-checker or RBAC step is the
actual source of the friction, shorten the steps before and after it, and make the pending
state visible (`StatusBadge`, `ModuleHeader` metrics) — don't propose removing the step.

**R7 — Drill-down from summary to detail.** Risk Snapshot tiles, KRI, and Limits & Breaches
should each provide a path from "this number is red" to the underlying exposure, not just
display the number. `RiskMap.tsx`'s conversion to a table with `renderDetail` is the pattern.

## Complexity score (0–35, lower is better)

Score the *current* workflow before proposing anything, and the *proposed* workflow after,
so the improvement is a number, not an assertion.

| Dimension | 0 | 5 |
|---|---|---|
| Navigation complexity | direct path | excessive navigation |
| Input duplication | no duplication | extensive repeated input |
| Context switching | none | frequent context loss (scope/date re-entered) |
| Cognitive load | obvious next step | confusing, unclear primary action |
| Role complexity | tailored to the role's actual permission set | exposes irrelevant/inaccessible functionality |
| Control friction | controls (RBAC/maker-checker/data-integrity) directly visible and reachable | controls buried behind unrelated navigation |
| Automation opportunity | little left to automate | significant known-context re-asked |

0–7 low · 8–14 moderate · 15–21 high · 22–28 very high · 29–35 critical.

A proposal that lowers Navigation/Duplication/Switching/Load/Automation while leaving Role
complexity and Control friction unchanged (or improving *visibility* of a control without
weakening it) is the target shape. A proposal that lowers Control friction by weakening a
check is not a valid optimization — see `protected-controls.md`.
