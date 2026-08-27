---
name: alm-workflow-optimizer
description: Analyze, compare, and simplify Ascent ALM user workflows — navigation, screens, forms, role-based journeys. Use when reviewing, redesigning, comparing, or troubleshooting how a user (Administrator, Risk Analyst, Treasury User, Executive Viewer, Control Tester, or Reporting User) moves through the app to get a task done. Preserves RBAC, route gating, scope locking, maker-checker, data-integrity gates, audit logging, and the "results read from a run" invariant.
---

# Ascent ALM Workflow Optimizer

## Mission

Reduce unnecessary steps, navigation, and repeated input in Ascent's user workflows —
without weakening a control. This app is a bank ALM platform for a 33-affiliate group;
its friction is often a control, not an accident. The job is to find friction that is
*actually* accidental (navigation-only, technically-forced, redundant) and leave the rest.

Never remove a step because it adds a click. A step may exist for permission enforcement,
scope isolation, maker-checker, data-integrity gating, or auditability — see
[references/protected-controls.md](references/protected-controls.md) before proposing
anything that touches one.

## Three modes — never skip ANALYZE

**ANALYZE (default).** Trace the real workflow in code, decompose it with the workflow
contract, classify every step, score it, propose a change. Do not edit files. Stop and show
the proposal — see the ANALYZE output contract below.

**COMPARE.** Use when asked to compare an existing workflow against a proposed or already-
implemented one. Produces a current-vs-proposed diff with measured (not invented) metrics —
see the COMPARE output contract below.

**IMPLEMENT.** Only after the user approves a specific ANALYZE/COMPARE proposal, or
explicitly asks for direct implementation in the same message. Run the pre-implementation
trace, make the smallest change that achieves the approved workflow, then verify — see
"Implementing" and "Verifying" below.

## Before analyzing anything

1. Read the actual page component(s) involved — not just the route name.
2. Check its permission via [references/roles.md](references/roles.md) and confirm what
   `RouteGate` currently requires for that path in `src/App.tsx`
   ([references/modules.md](references/modules.md) has the current snapshot).
3. Check whether the screen reads live data (`usePositions`, `useAffiliates`, etc.) or reads
   from a stored `run` — see the run-scoping invariant in `protected-controls.md` §6. Never
   propose a change that makes a results screen recompute outside its run's scope.
4. Check `src/context/ScopeContext.tsx` / `AppShell.tsx`'s `restrictedToOwn` — a non-Group
   user is locked to their own affiliate. Never propose a shortcut that lets a workflow read
   or act on another affiliate without `group.manage`.
5. Decompose the workflow with the model in
   [references/workflow-contract.md](references/workflow-contract.md) — INPUT →
   PRECONDITIONS → USER ACTIONS → SYSTEM ACTIONS → VALIDATIONS → STATE TRANSITIONS →
   APPROVALS/CONTROLS → OUTPUT → AUDIT EVENTS. This is what stops a control from being
   mistaken for incidental UI friction.

## Step classification

Classify every USER ACTION / SYSTEM ACTION as REQUIRED, COMBINABLE, AUTOMATABLE,
CONDITIONAL, REDUNDANT, or NAVIGATION-ONLY — full definitions, the reasoning requirement,
and the "don't guess REDUNDANT from a name" caution are in
[references/workflow-rules.md](references/workflow-rules.md). State the classification and
the reason inline for every step proposed for removal, merging, or automation.

## Ambiguous business logic — when in doubt, don't assume

If a step's purpose can't be determined to be regulatory, governance, calculation,
validation, data-integrity, approval, audit, or scope-related — and can't be ruled out
either — do not default to REDUNDANT or NAVIGATION-ONLY. Instead: read more of the
implementation (the calling code, the engine module it touches, related tests); check
whether a doc comment in the code explains the "why" (this codebase leans on WHY-comments
at exactly these decision points — see the maker-checker and COA-mapping comments cited in
`protected-controls.md`); and if it's still unclear, say so explicitly in the proposal
("this step's purpose is unclear — needs business confirmation before removal") rather than
proposing removal. A conservative, under-optimized proposal is always preferable to an
unsafe simplification.

## ANALYZE output contract

```
## User Goal
## Role
(which of the six roles this workflow is for — see references/roles.md)

## Current Workflow
A → B → C → D

## Workflow Contract
### Inputs / Preconditions / User Actions / System Actions / Validations /
### State Transitions / Controls & Approvals / Outputs / Audit Events
(see references/workflow-contract.md — fill in only the stages that are non-trivial;
"none" is a valid, useful answer for a stage that genuinely doesn't apply)

## Step Classification
| Step | Classification | Reason |
|---|---|---|

## Complexity Score  (see references/workflow-rules.md)
Navigation: X/5 · Input duplication: X/5 · Context switching: X/5 · Cognitive load: X/5 ·
Role complexity: X/5 · Control friction: X/5 · Automation opportunity: X/5
Total: X/35

## Problems
1. ...

## Proposed Workflow
A → B → C

## Removed / Combined / Automated / Conditional
(state which, and cite the classification reason already given above)

## Preserved Controls
(exact permission(s) / RouteGate entries / scope rule / maker-checker / audit path kept
unchanged, and why — see references/protected-controls.md)

## Role Impact
| Role | Impact |
(every role that can reach this workflow today — see references/roles.md's checklist)

## Expected Improvement
(only measured or clearly-labeled-estimated numbers; mark anything not verifiable from the
code as "not verified" rather than guessing)

## Files That Would Change
- path — what changes

## Risks

## Recommendation
SAFE TO IMPLEMENT | REQUIRES BUSINESS CONFIRMATION | DO NOT IMPLEMENT
```

Do not modify the application in ANALYZE mode. Wait for approval before implementing,
unless the user explicitly asked for direct implementation in the same message.

## COMPARE output contract

```
### Current Workflow
A → B → C → D

### Proposed Workflow
A → B → D

### Comparison
| Metric | Current | Proposed | Change |
|---|---:|---:|---:|
| Screens | X | Y | ±Z |
| User actions | X | Y | ±Z |
| Repeated inputs | X | Y | ±Z |
| Navigation transitions | X | Y | ±Z |
| Context switches | X | Y | ±Z |
| Required controls | X | Y | must not decrease |

### Controls, Permissions, Calculations, Auditability Preserved
(explicit list — say "unchanged" per item, don't just assert the row above)

### Role Impact
```

Every number must come from actually tracing the code. If something can't be measured
precisely, write "not verified" next to it rather than inventing a figure — this applies
especially to "Expected Improvement" claims and any COMPARE metric.

## Implementing

Only after approval. First, trace the actual implementation:

1. Locate the route (`buildRouteOrder()` / `navigation.ts`).
2. Locate the page/component.
3. Locate related components it renders or is rendered by.
4. Trace its state (local `useState`, `useScope()`, `useAuth()`).
5. Trace its data fetches / mutations (`src/lib/hooks.ts`, `runHooks.ts`, `ruleHooks.ts`).
6. Trace the underlying business logic where relevant (`src/engine/*`).
7. Locate its route-level permission (`RouteGate` entry).
8. Locate any action-level `hasPermission(...)` checks.
9. Locate any workflow/status state it participates in (affiliate status, run status,
   approval decision).
10. Locate its validations (`complete[...]`-style gates, required-field checks).
11. Locate its audit behavior (`useAuditedMutation`, direct `recordAuditEvent` calls).
12. Identify existing tests that cover it.

Then implement the smallest change that achieves the approved proposal. Reuse existing
components (`TableToolbar`/`TablePagination`/`useTableControls`, `InfoButton`, `RouteGate`,
`ModuleHeader`) rather than inventing new patterns. Never perform unrelated refactoring —
if you notice something else worth fixing while tracing, report it as a separate finding
(see the hard constraints below), don't fold it into this change.

## Verifying

Compilation is not verification. After implementing, check what's actually applicable to
the change:

- Happy path · validation failures · empty state · loading state · a failed
  write/query (Dexie/repository rejection paths, where applicable to the change).
- Permission denial and wrong-role access — log in (or seed) as a role that should be
  blocked and confirm `RouteGate`/`hasPermission` still blocks it.
- Approval/workflow state transitions — confirm the maker-checker or status flow still
  behaves exactly as before, if the change touched anything near it.
- Audit behavior — confirm a new or moved mutation still lands in the audit trail.
- Calculation results — for anything touching `src/engine/*`, confirm the numbers are
  unchanged unless the change was explicitly a calculation change.
- Data scope — confirm the change didn't widen what a query or run can reach.
- The original business outcome is still achievable end to end, not just that the diff
  compiles.

For role-based changes, verify at least every role listed in the proposal's Role Impact
table, not just the role you were thinking about while implementing.

## Reference material

- [references/roles.md](references/roles.md) — the six real roles, their exact permission
  strings (from `src/context/AuthContext.tsx`), and the role-aware analysis checklist.
- [references/modules.md](references/modules.md) — the actual sidebar groups and screens,
  read from `src/components/layout/navigation.ts` and `src/App.tsx`.
- [references/protected-controls.md](references/protected-controls.md) — RouteGate, scope
  locking, maker-checker, data-integrity gates, the run-scoping invariant, the audit trail,
  the full list of prohibited actions, and known open gaps to report rather than silently fix.
- [references/workflow-contract.md](references/workflow-contract.md) — the
  INPUT→...→AUDIT EVENTS decomposition model, with a worked example from this codebase.
- [references/workflow-rules.md](references/workflow-rules.md) — the step-classification
  system (authoritative), optimization rules, and the 0–35 complexity scoring rubric.
- [references/ux-principles.md](references/ux-principles.md) — how to present a REQUIRED
  step with less friction, without ever proposing to remove it.
- [examples/good-optimization.md](examples/good-optimization.md),
  [examples/bad-optimization.md](examples/bad-optimization.md), and
  [examples/test-prompts.md](examples/test-prompts.md) — worked examples and regression
  prompts, all from this actual codebase, not hypothetical ones.

## Hard constraints

Never, as part of a workflow optimization: bypass or widen a `RouteGate`/`hasPermission`
check; let a non-Group-scoped user reach another affiliate's data; move an affiliate (or
any maker-checker-gated entity) to its approved/live state without going through Approvals;
make a results screen recompute live instead of reading its `run`; remove a validation or
data-integrity gate; remove or bypass audit logging; change a financial/risk calculation or
regulatory logic merely to simplify UI; delete a screen/field because it looks unused
without tracing its actual callers and route entry; merge two roles' permission sets or
workflows to simplify a shared screen; silently change a repository/API contract. The full
list, with the reasoning for each, is in `protected-controls.md`.

If a genuinely unrelated bug turns up while tracing a workflow (e.g. a button visible to a
role that can't use what it links to), report it as a finding — don't fold an unrelated fix
into the workflow proposal without saying so explicitly.
