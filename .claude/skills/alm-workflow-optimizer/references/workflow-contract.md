# Workflow contract

A model for decomposing any ALM workflow before proposing to shorten it. The point is
mechanical: a UI step that looks like "just navigation" often turns out to be carrying a
precondition, a validation, a state transition, or an audit write — this model forces that
distinction to be made explicit, stage by stage, instead of judged by eye.

Use it for any workflow being formally ANALYZEd or COMPAREd (see `SKILL.md`). For a quick
one-off question ("why does step 3 link to /connectors?") it's overkill — reach for it when
a workflow is actually being proposed for change.

```
INPUT → PRECONDITIONS → USER ACTIONS → SYSTEM ACTIONS → VALIDATIONS →
STATE TRANSITIONS → APPROVALS / CONTROLS → OUTPUT → AUDIT EVENTS
```

## What each stage means in this codebase

**INPUT** — what the user (or the system, from context) supplies to start. Distinguish
data the user must genuinely provide from data already available via `useAuth()` (`user`,
`role`) or `useScope()` (`affiliateCode`, `asOfDate`) — re-asking for the latter is an
AUTOMATABLE finding, not a real input.

**PRECONDITIONS** — what must already be true before this workflow can start. In this app
that's almost always: the route's `permission` (checked by `RouteGate` in `App.tsx`), plus
any data the workflow depends on already existing (e.g. Onboard Affiliate step 7 requires
the affiliate row to already exist in `affiliates` — see `protected-controls.md` §5 and
`examples/bad-optimization.md` for what happens when a precondition silently isn't met).

**USER ACTIONS** — the discrete things a human does: fill a field, pick from a `<select>`,
tick a checkbox, click a named button (`ModuleHeader`'s primary action, a table row's
`renderDetail`). Each one is a candidate for the step classification in
`workflow-rules.md`.

**SYSTEM ACTIONS** — what the app does in response: a query (`usePositions`, `useAffiliates`,
etc.), a computation (`computeAllShocks`, `executeRun`), a navigation, a re-render. Distinct
from USER ACTIONS because automating a system action doesn't remove a control, but
automating away a user action might (e.g. a user action that *is* the approval decision).

**VALIDATIONS** — anything that can block progress on correctness/completeness grounds
rather than permission grounds: the `complete[step]` checks in `OnboardAffiliate.tsx`
(unmapped COA, unset feeds, missing required fields), form-level required-field checks,
duplicate-code checks (`duplicateCode`). These are REQUIRED, not REDUNDANT, even when they
feel like friction — see `protected-controls.md` §5.

**STATE TRANSITIONS** — a persisted status changing: affiliate `Draft`/`Testing`/`Live`
(or `Testing`/`Live` today — see `bad-optimization.md` for the proposed `Draft` addition),
a `run`'s lifecycle, an approval item's decision state. Never propose a workflow that
collapses two state transitions into one write unless every control gating the transition
being removed is also accounted for.

**APPROVALS / CONTROLS** — maker-checker (`Approvals.tsx`, `approvals.approve`), and any
other point where a different, more-privileged role must act before the workflow can
continue (`RouteGate`, action-level `hasPermission` checks in `protected-controls.md` §1–2).
These are the stages `workflow-rules.md` R6 says to optimize *around*, never *through*.

**OUTPUT** — the artifact or result the workflow produces: a saved affiliate, a generated
report pack (`exportPackPdf`), a committed data-load batch, a run's stored results. What the
user actually walked away with — this is what "the original business outcome is still
achievable" (see the Verification section of `SKILL.md`) is checked against.

**AUDIT EVENTS** — `repository.recordAuditEvent(...)`, most commonly reached through
`useAuditedMutation` in `src/lib/hooks.ts`, which wraps a repository write so "every
configuration change lands in the audit trail" (the code comment cites RFP §2.14: "full
transaction history and user activity audit logs"). `runHooks.ts` and `ruleHooks.ts` call
`recordAuditEvent` directly for run execution and rule edits. Consumed by Audit Log
(`/admin/audit`, `audit.view`). A workflow change that adds a new write path (a new mutation,
a new button that changes state) must route through one of these, not bypass the trail —
see the hard constraints in `protected-controls.md`.

## Worked example: Onboard Affiliate, steps 6–7 → Submit for approval

| Stage | Content |
|---|---|
| INPUT | Regulator selected at step 1 (drives seeded minima); user's confirmation ticks |
| PRECONDITIONS | Route `group.manage`; steps 1–5 already `complete[n]` |
| USER ACTIONS | Tick "Confirm these thresholds" (step 6); tick "Initial load complete and reconciled" (step 7); click "Submit for approval" |
| SYSTEM ACTIONS | `handleActivate()` builds the `Affiliate` object; `save.mutate(affiliate)` |
| VALIDATIONS | `allComplete` (every `complete[n]` true); `!duplicateCode` |
| STATE TRANSITIONS | Affiliate created with `status: 'Testing'` (not `'Live'`) |
| APPROVALS / CONTROLS | Separate Approvals step, `approvals.approve`, moves Testing → Live |
| OUTPUT | A new row in the `affiliates` table, visible on `/affiliates`, not yet Group-consolidated |
| AUDIT EVENTS | `save.mutate` → `useSaveAffiliate` (`src/lib/hooks.ts`) is a `useAuditedMutation('Affiliates', 'Save', 'Affiliate', ...)` — every save, Testing or Live, lands in the audit trail with the affiliate's status in the detail string |

Reading it this way makes the maker-checker control impossible to miss or "simplify away" by
accident — it's its own row, not buried inside a bullet of UI steps.
