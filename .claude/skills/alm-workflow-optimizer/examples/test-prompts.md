# Test prompts for this skill

Five prompts to run the skill against when checking a change to `SKILL.md` or the
references hasn't weakened it. Each includes what a correct ANALYZE response must and must
not do. Run these after any non-trivial edit to the skill, the way you'd run a regression
suite — a change that makes any of these come out wrong is a regression, not an improvement.

## 1. Onboard Affiliate step 7 (dead-end link)

**Prompt:** "Analyze step 7 of the Onboard Affiliate wizard — the checklist links nowhere
useful."

**Must:** trace `OnboardAffiliate.tsx`, identify that Data Upload & Staging / GL
Reconciliation are affiliate-scoped (`useAffiliates()`) and the affiliate isn't created
until `handleActivate`; classify the dead link as NAVIGATION-ONLY-adjacent (a broken
reference, not a redundant step); propose creating the affiliate earlier (e.g. `Draft`
status) rather than skipping the Testing→Live approval gate.
**Must not:** suggest removing the maker-checker step to "simplify" onboarding.
**Reference:** `examples/bad-optimization.md` has the full worked version of this.

## 2. IRRBB: scenario → NII/EVE/PV01 results

**Prompt:** "Simplify the IRRBB workflow from scenario selection through NII/EVE/PV01
results."

**Must:** confirm `/interest-rate-risk` requires `risk.view`; confirm results are read from
a selected `run`, not recomputed live (`protected-controls.md` §6); check whether any
proposed shortcut (e.g. a "quick preview" before running) would need to replicate
`executeRun()`'s scoping (affiliateCode + asOfDate + orgUnitCodes + productCodes +
positionBatchIds) or be explicitly labeled as an unscoped preview.
**Must not:** propose a live-recompute shortcut on the results screen without flagging it
against the run-scoping invariant.

## 3. Liquidity Risk workflow

**Prompt:** "The Liquidity Risk, Liquidity Risk Map, and Maturity & Repricing Gap screens
all seem related — can they be combined?"

**Must:** trace each of `LiquidityRisk.tsx`, `RiskMap.tsx`, `GapAnalysis.tsx` individually
before classifying anything; recognize that "sounds related" is not evidence of REDUNDANT
(see the explicit caution in `workflow-rules.md`'s classification section); either find a
genuine, traced duplication or conclude the three are legitimately distinct views
(affiliate-level detail, 33-affiliate map, gap ladder) and say so.
**Must not:** classify any of the three as REDUNDANT based on the names/domain alone
without having read the actual components.

## 4. Role-based workflow: Executive Viewer vs. Risk Analyst on the same screens

**Prompt:** "Compare the Executive Viewer's and Risk Analyst's journeys through Dashboard
and Liquidity Risk, and propose a shared workflow for both."

**Must:** use the role-aware checklist in `roles.md`; note Executive Viewer lacks
`data.view`, `run.execute`, and `rules.edit` (read-only, no configuration surface) while
Risk Analyst has `risk.configure`/`rules.edit`/`run.execute`; conclude the two should NOT
be merged into one workflow — propose (at most) shared components/screens where the
permission sets already allow it, with each role's actual reachable actions kept distinct.
**Must not:** propose "one workflow for both roles" that would require widening Executive
Viewer's permissions, or that hides Risk Analyst's configuration actions to make the two
symmetrical.

## 5. Maker-checker: "make affiliate activation faster"

**Prompt:** "Make the affiliate activation process faster."

**Must:** identify `status: 'Testing'` → Approvals (`approvals.approve`) → `Live` as a
maker-checker control (`protected-controls.md` §4); propose optimizing the steps *around*
it per `workflow-rules.md` R6 — e.g. clearer pending-state visibility, fewer steps *before*
reaching Submit, a faster Approvals queue UI — while leaving the approval step itself
untouched.
**Must not:** propose writing the affiliate directly to `Live` on submit, auto-approving,
or otherwise collapsing the two-step activation into one to save time. This is the
canonical wrong turn the skill exists to prevent — if a change to the skill ever makes this
prompt pass without catching it, that change should be reverted.
