# Screen map (source of truth: `src/components/layout/navigation.ts` + `src/App.tsx`)

`NAV_GROUPS` is what actually renders in the sidebar, filtered per-role by `permission`.
`ALL_NAV_ITEMS` + `UNLISTED_SCREENS` + the parameterised routes together make up
`buildRouteOrder()` in `App.tsx` — every route the router actually mounts. Literal paths
must precede `/affiliates/:code` in that order (a real bug this session: the parameterised
route swallowed `/affiliates/onboard` when it was declared first — `routing.test.ts` now
holds the invariant). Treat `buildRouteOrder()`, not this file, as ground truth if they ever
disagree — this is a snapshot.

## OVERVIEW — `dashboard.view`
- Executive Dashboard `/dashboard` — scope-scoped snapshot: Risk Snapshot (6 tiles including
  "In breach"), six-shock ΔEVE bar chart read from the selected `run`, Market & Rate Monitor.

## RISK MANAGEMENT — `risk.view`
- Liquidity Risk `/liquidity-risk`
- Liquidity Risk Map `/risk-map` — table (33 affiliates), not cards
- Maturity & Repricing Gap `/gap-analysis`
- Concentration & Large Exposures `/concentration`
- Interest Rate Risk (IRRBB) `/interest-rate-risk`
- Stress Testing `/stress-testing`
- Behavioural Analysis `/behavioural-analysis`
- Profitability Ratios `/profitability`
- Limits & Breaches `/limits`
- Key Risk Indicators `/kri`

## TREASURY — `treasury.view`
- Funds Transfer Pricing `/ftp`
- Balance Sheet Analytics `/balance-sheet`
- FX Position `/fx-position`

## REPORTING — `reporting.view` (actions gated by `reporting.generate`)
- ALCO Meetings `/alco-meetings`
- Report Packs `/alco-reporting` — merged ALCO Reporting + Management Reporting, tab-switched
  (`ReportPacks.tsx` → shared `ReportPackScreen.tsx`); `/management-reporting` still resolves
  (unlisted, `reporting.view`) but the nav entry is the merged one.
- Regulatory Reporting `/regulatory-reporting`
- Ad-Hoc Analysis `/ad-hoc`

## EXECUTION — `run.execute` (Run History is `risk.view`, read-only)
- Process Run `/runs/new`
- Run History `/runs`
- What-If Builder `/what-if`
- Batch Scheduler `/scheduler`

## DATA — `data.view`
- Data Upload & Staging `/data-upload` — affiliate-scoped; requires the affiliate to already
  exist in the `affiliates` table (`useAffiliates()`).
- GL Reconciliation `/gl-reconciliation`
- Data Vintages & Load History `/data-vintages`
- Dimensions & Hierarchies `/dimensions` — paginated (`TableToolbar`/`TablePagination`)
- Counterparty Register `/counterparties` — paginated
- Interest Rates & Curves `/yield-curves` — curve picker is a `<select>`
- Currency & FX Rates `/fx-rates`
- Economic Indicators `/economic-indicators`
- Holiday Calendar `/holiday-calendar` — calendar picker is a `<select>`

## CONFIGURATION — `rules.edit` (data.configure for Validation Rules)
- Business Rules `/rules` — hub linking to 13 `RuleKind` screens, unlisted individually:
  Time Buckets, Product Characteristics, Behaviour Patterns, Payment & Repricing Patterns,
  Prepayment, Discount Methods, Forecast Scenarios, New Business, Transaction Strategies,
  Filters, Custom Metrics, FTP Rules, Adjustment Rules — all at `rules.edit`.
- Validation Rules `/validation-rules` — `data.configure`

## AFFILIATE MANAGEMENT — `dashboard.view` (nav entry), but onboarding itself is `group.manage`
- Affiliates `/affiliates`
- Onboard Affiliate `/affiliates/onboard` — unlisted, `group.manage`. Seven-step wizard;
  creates the affiliate row only on final "Submit for approval" (status `Testing`, not
  `Live` — see maker-checker in protected-controls.md).
- Connectors & Data Sources `/connectors` — unlisted, `data.view`. Group-level, not scoped to
  any one affiliate — reachable from Onboard Affiliate step 3's "Configure connectors →".
- Affiliate Detail `/affiliates/:code` — parameterised, `dashboard.view`.

## ADMINISTRATION — mixed permissions per item
- Approvals `/approvals` — `risk.view` to see the queue, `approvals.approve` to decide
  (`canDecide` in `Approvals.tsx`)
- Control Remediation `/remediation` — `risk.view`
- Notifications `/notifications` — `dashboard.view`
- Users, Roles & Permissions `/admin/users` — `admin.manage`
- System Preferences `/admin/preferences` — `admin.manage`
- Audit Log `/admin/audit` — `audit.view`

## Global chrome (not a route, but part of every workflow)
- Scope selector (`AppShell.tsx`) — affiliate picker, locked to the user's own affiliate for
  non-Group users without `group.manage` (`restrictedToOwn`).
- Command palette — Cmd/Ctrl+K, `CommandPalette.tsx`, searches the same permission-filtered
  `NAV_GROUPS` the sidebar shows.
