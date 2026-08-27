# Roles and permissions (source of truth: `src/context/AuthContext.tsx`)

`ROLES` is the seed/fallback; the live source of truth is the `roles` table, editable from
Users, Roles & Permissions (`/admin/users`, `admin.manage`). `hasPermission(permission)`
looks up `user.role` in that table. Six roles ship by default:

## ADMIN — Administrator
Runs the platform: users, permissions, dimensions, connectors, configuration, audit trail.
`dashboard.view, risk.view, treasury.view, reporting.view, data.view, admin.manage,
group.manage, data.configure, risk.configure, rules.edit, run.execute, reporting.generate,
approvals.approve, audit.view`

The only role with `group.manage` (onboard/manage affiliates, cross-affiliate scope) and
`admin.manage` (users/roles/preferences). Optimize toward: fast reach into configuration and
administration, not toward hiding it — this role is meant to see everything.

## RISK_ANALYST — Risk Analyst
Monitors liquidity risk, IRRBB, stress testing; configures assumptions, limits, scenarios.
`dashboard.view, risk.view, treasury.view, reporting.view, data.view, risk.configure,
rules.edit, run.execute, reporting.generate, commentary.write`

Primary screens: RISK MANAGEMENT group, EXECUTION group (can run and build what-ifs),
CONFIGURATION (`rules.edit`). Optimize toward: scenario → run → results with minimal
re-navigation, since this is the highest-frequency role for the risk screens.

## TREASURY_USER — Treasury User
Manages funds transfer pricing, balance sheet, transaction strategies.
`dashboard.view, risk.view, treasury.view, reporting.view, data.view, rules.edit,
run.execute, commentary.write`

No `risk.configure` or `reporting.generate` — can run and edit rules but not configure risk
appetite/limits or generate report packs. Primary screens: TREASURY group, `/rules/*`
relevant to FTP and transaction strategy.

## EXECUTIVE_VIEWER — Executive Viewer
Group-wide read-only view for senior leadership and ALCO.
`dashboard.view, risk.view, treasury.view, reporting.view, commentary.review`

No `data.view`, no `run.execute`, no `rules.edit` — cannot see DATA/CONFIGURATION groups or
mutate anything, only `commentary.review` (can review, not write, commentary). This is the
role optimization should protect hardest against exposure: no configuration surface, no
mutation controls, straight to summary → detail via read-only drill-down.

## CONTROL_TESTER — Control Tester
Checks data quality, runs validation/reconciliation, follows up control weaknesses.
`dashboard.view, risk.view, data.view, reporting.view, data.configure, rules.edit,
audit.view, commentary.review`

Has `audit.view` (Audit Log) and `data.configure` (Validation Rules) but not `treasury.view`
or `run.execute`. Primary screens: DATA group, Validation Rules, Audit Log.

## REPORTING_USER — Reporting User
Generates and distributes regulatory, ALCO and management reports.
`dashboard.view, risk.view, treasury.view, reporting.view, reporting.generate`

No `data.view`, no `run.execute`, no `rules.edit`. Can generate/download/email report packs
(`reporting.generate` gates the Generate/Download/Email actions in `ReportPackScreen.tsx`,
`AlcoMeetings.tsx`, `RegulatoryReporting.tsx`) but cannot configure anything upstream of them.

## The 16 permission strings that exist

`dashboard.view` `risk.view` `treasury.view` `reporting.view` `data.view` `admin.manage`
`group.manage` `data.configure` `risk.configure` `rules.edit` `run.execute`
`reporting.generate` `approvals.approve` `audit.view` `commentary.write` `commentary.review`

Do not invent a new permission string to make a workflow proposal cleaner — if a proposal
needs finer-grained access than these 16 provide, say so explicitly as a design decision for
the user, don't quietly add one.

## Role-aware analysis checklist

Any workflow that's reachable by more than one role needs this run per affected role, not
once for "the user" in the abstract — six roles have six different real permission sets
(above), and a workflow that's efficient for one can be either irrelevant or over-exposed
for another:

1. What is this role actually trying to accomplish here? (Their `description` above is the
   starting point, not the full answer — check what screens/actions they can actually reach.)
2. What do they currently see on this workflow's screens, given their real permission set?
3. What do they actually need to see, versus what's rendered but permission-gated off /
   silently irrelevant to them?
4. Does the proposed workflow reduce their unnecessary steps specifically — not just the
   Admin's, who can reach everything and is the easiest case to "optimize" for?
5. Do their permissions remain exactly unchanged? (A proposal that requires widening a
   role's permissions to make a shared screen work is a permission-model change, not a
   workflow optimization — surface it as its own decision, don't fold it in silently.)
6. Does anything become unintentionally visible or actionable to this role as a side effect
   of combining screens or steps? (E.g. merging two screens that have different `canEdit`
   gates must keep both checks distinct — see `protected-controls.md` §2.)

Never propose collapsing two roles' workflows into one shared path just because their
screens look similar — Risk Analyst and Executive Viewer both reach `/dashboard` and
`/liquidity-risk`, but one can configure and run, the other is read-only end to end. Optimize
each role's actual path, and only share a screen when the permission sets genuinely allow it.
