# Protected controls — verify, don't assume

These are the actual enforcement mechanisms in this codebase. A workflow proposal can
route around friction; it must never route around one of these.

## 1. Route-level gating — `RouteGate` in `src/App.tsx`
Every entry in `buildRouteOrder()` carries a `permission`; the router wraps every rendered
`Component` in `<RouteGate permission={permission} screenName={screenName}>`. If
`hasPermission(permission)` is false, the user sees an "Access restricted" panel instead of
the screen — this exists precisely so a shorter workflow can't be built by skipping the
check that used to only exist on individual buttons. Any workflow change that adds a new
reachable path to a screen (a shortcut link, a new nav entry, a modal that renders a page
component inline) must carry the same permission the route already requires.

## 2. Action-level gating — `hasPermission(...)` at the point of mutation
Route access and action access are separate checks. Examples:
- `Approvals.tsx`: `canDecide = hasPermission('approvals.approve')` — a user can view the
  queue (`risk.view`) without being able to decide on it.
- `ReportPackScreen.tsx` / `AlcoMeetings.tsx` / `RegulatoryReporting.tsx`:
  `canEdit = hasPermission('reporting.generate') || hasPermission('reporting.manage') ||
  hasPermission('run.execute')` gates Generate/Download/Email.
- `/rules/*` screens: edit actions gated by `rules.edit` even though some of those screens
  are reachable read-only via the hub at `risk.view`-adjacent contexts.

A workflow that "simplifies" by combining a view screen and its edit action onto one page
must keep both checks — don't let reaching the page imply the ability to act on it.

## 3. Scope locking — `ScopeContext.tsx` + `AppShell.tsx`
`ScopeProvider` seeds `affiliateCode` from `user.affiliateCode` on login and re-syncs on
every `user.id` change (this was the actual root-cause fix for "different logins show the
same data" — see git history). `AppShell.tsx` additionally computes:

```ts
const restrictedToOwn = user !== null && user.affiliateCode !== GROUP_CODE && !hasPermission('group.manage');
```

and disables the scope `<select>` for that user, restricting it to their own affiliate. A
Treasury User in Nigeria cannot select Ghana in the scope picker. Never propose a workflow
that reads or writes another affiliate's data as a shortcut for this population — it has to
route through a role/permission that actually has `group.manage`.

## 4. Maker-checker — affiliate activation and approvals
`OnboardAffiliate.tsx` creates the affiliate with `status: 'Testing'`, never `'Live'`,
explicitly because "activation still needs maker-checker approval, and only Live affiliates
consolidate into Group." Moving Testing → Live happens through Approvals
(`approvals.approve`). A workflow proposal must never let onboarding (or any other
draft-creating flow) write `Live` directly, even to save a step — that step is the control.

## 5. Data-integrity gates (distinct from RBAC)
Some steps aren't permission checks at all — they block on data completeness because bad
data reaching Group consolidation is the actual risk:
- Onboarding step 4 (Chart of Accounts): `unmappedCoa.length === 0` blocks activation.
  Comment in the code: "Unmapped nodes block activation" — this is what keeps 33 affiliates'
  local charts comparable. Don't propose removing the block; if the friction is the *UI* of
  discovering which nodes are unmapped, that's fair game to improve.
- Onboarding step 3 (Connectivity): every domain must resolve to `Connector` or `File`
  substitution before the step counts complete — "every domain must be fed by something."

## 6. The run-scoping invariant — `src/engine/run.ts`
> "It is also why the v1 affiliate-switcher defect cannot recur: a run is scoped by
> construction, so there is no unscoped query to write."

Results screens are meant to read from a stored `run` (positions, assumptions, and scope
frozen at run time), not recompute live from whatever the current scope/date happens to be.
`StressTesting.tsx` and the rest of the results screens follow this. Any workflow change
that adds a "quick preview" or "inline recompute" to a results screen needs to either scope
the query the same way `executeRun()` does (affiliateCode + asOfDate + orgUnitCodes +
productCodes + positionBatchIds) or make clear in the proposal that it's intentionally an
unscoped, non-run preview — don't silently blur the two.

## Known open gaps — report, don't silently fold into an unrelated fix
- `Affiliates.tsx`'s "Onboard affiliate" button/link has no `hasPermission('group.manage')`
  gate, so it renders for every role even though `/affiliates/onboard` is correctly
  `RouteGate`-blocked behind `group.manage`. It's a real, acknowledged, not-yet-fixed
  dead-end-button bug — flag it if a workflow trace touches `Affiliates.tsx`, but treat it
  as a separate finding from whatever workflow was actually being optimized.

## 7. Audit trail — `recordAuditEvent` / `useAuditedMutation`
`src/lib/hooks.ts`'s `useAuditedMutation` wraps a repository write so it lands in the audit
trail automatically, citing the RFP requirement for "full transaction history and user
activity audit logs." `runHooks.ts` and `ruleHooks.ts` call `repository.recordAuditEvent`
directly for run execution and rule edits. See `workflow-contract.md` for the full AUDIT
EVENTS stage. Any workflow change that introduces a new mutation (a new save, a new status
change, a new approval action) must route through one of these — never add a write path
that bypasses the trail to save a step.

## Full list of prohibited actions

None of the following is ever a valid "optimization," regardless of how much friction it
removes:

- Bypassing or weakening a `RouteGate` permission or an action-level `hasPermission(...)`
  check (§1–2).
- Removing a role restriction, or widening what a role can see/do to make a shared screen
  simpler (§1–2, and `roles.md`'s role-aware checklist item 5).
- Bypassing or auto-approving a maker-checker/Approvals step (§4).
- Removing or short-circuiting audit logging — a new write path with no `recordAuditEvent`
  call (§7).
- Removing a `VALIDATIONS`-stage check (required-field, duplicate-code, `complete[step]`
  gates) to shorten a form.
- Changing a financial/risk calculation (anything in `src/engine/*`) merely to simplify a
  UI — a calculation change is a business-logic change, not a workflow optimization, and
  needs its own explicit justification independent of this skill.
- Changing regulatory logic (e.g. `REGULATORY_MINIMA`, BCBS shock definitions) to make a
  workflow shorter.
- Changing data scope — letting a query reach beyond what `useScope()` / a `run`'s stored
  scope would have returned (§3, §6).
- Changing run scoping — a results screen recomputing live instead of reading its `run`
  (§6), or a new run created with different `orgUnitCodes`/`productCodes`/
  `positionBatchIds` filtering than what the user actually selected.
- Removing a data-integrity gate (unmapped-COA block, connectivity-completeness check) (§5).
- Bypassing COA-mapping or connectivity validation specifically (§5) — these are the
  mechanism that keeps 33 affiliates' figures comparable; do not treat them as onboarding
  friction.
- Changing a persisted status's state-transition rules (e.g. what counts as `Testing` vs.
  `Live`, or what an approval decision does) without calling it out as its own explicit,
  separately-justified change — never as an implicit side effect of a workflow proposal.
- Exposing administrative or configuration functionality (`admin.manage`, `group.manage`,
  `rules.edit`, `data.configure`) to a role's screen that doesn't already carry that
  permission, even inline/contextually.
- Silently changing an API/repository contract (`src/store/repository.ts`, `localRepository.ts`)
  — a signature or behavior change there affects every caller, not just the workflow being
  optimized; call it out explicitly if genuinely required.
- Deleting a screen, route, field, or component because it "looks unused" without tracing
  its actual callers, its route entry in `buildRouteOrder()`, and its permission — an
  unlisted screen (`UNLISTED_SCREENS`) is still live and reachable even though it's not in
  the sidebar.
- Assuming a screen or step is REDUNDANT from its name or apparent similarity to another
  screen without tracing both implementations — see the `LiquidityRisk`/`GapAnalysis`/
  `RiskMap` caution in `workflow-rules.md`'s classification section.
