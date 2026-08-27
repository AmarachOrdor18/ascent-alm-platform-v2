# Bad optimization — a realistic wrong turn in this codebase

## Current
Onboard Affiliate (`OnboardAffiliate.tsx`) is seven steps. Step 7 ("Initial data load") is
just a checklist and a confirmation checkbox — the affiliate row isn't written to the
database until "Submit for approval" fires `handleActivate`, and even then it's created with
`status: 'Testing'`, not `'Live'`. A separate Approvals step (`approvals.approve`) is needed
before the affiliate consolidates into Group.

## Bad proposal
"Skip the Testing status and maker-checker step — write the affiliate straight to `Live` on
Submit, so onboarding finishes in one action instead of two (wizard + approval)."

## Why this is wrong
`status: 'Testing'` and the separate Approvals gate are the control, not incidental
friction. The code comment is explicit about why: "activation still needs maker-checker
approval, and only Live affiliates consolidate into Group... a half-configured affiliate
cannot quietly join the Group balance sheet." Removing it doesn't shorten a workflow, it
deletes a governance requirement — see `protected-controls.md` §4.

## What a correct optimization of the *same friction* looks like
The actual, still-open issue in this exact wizard is narrower: step 7's checklist links
nowhere, because Data Upload & Staging and GL Reconciliation are affiliate-scoped screens
(`useAffiliates()`) and the affiliate doesn't exist in that table yet at step 7 — so the
footnote pointing at those screens is dead text, unlike step 3's working "Configure
connectors →" link to the Group-level `/connectors` screen.

### Current
Step 1 (create draft, in-memory only) → ... → Step 7 (checklist, no working link) →
Submit for approval (affiliate row created, status `Testing`) → Approvals (`approvals.approve`)
→ status `Live`

### Problem
NAVIGATION-ONLY dead end at step 7: the described actions (upload, validate, reconcile,
commit) have no real destination because the affiliate doesn't exist until after this step.

### Proposed
Create the affiliate row as `status: 'Draft'` as soon as step 1's required fields are valid
(a new status, excluded from Group consolidation exactly like `Testing` is today), so
Data Upload & Staging and GL Reconciliation have a real affiliate to operate on from step 7
onward. Step 7 gets working links: "Go to Data Upload →", "Go to GL Reconciliation →".
"Submit for approval" becomes Draft → Testing (unchanged approval gate after it).

### Preserved controls
- Maker-checker unchanged: Testing → Live still requires `approvals.approve`.
- COA-mapping and connectivity gates (steps 3–4) unchanged.
- New Draft status still excluded from Group consolidation, same as Testing.

### Role impact
| Role | Impact |
|---|---|
| Admin (only role with `group.manage`) | Step 7 becomes usable instead of aspirational; no new step added. |
| Everyone else | No access to this screen regardless (`group.manage`-gated route). |

This is the shape a correct proposal takes: fix the actual dead end, leave the governance
gate exactly where it is.
