# Phase 1 - Current State Assessment

Assessment of the existing application against the 16 ALM skills, produced before any code changes. Status scale: Complete / Partial / UI Only / Mock / Missing / Incorrect.

## Executive summary

The platform is substantially more real than a typical demo: a canonical Position Book with versioned, append-only batches; a pure, tested calculation engine layer (LCR, NSFR, gap, IRRBB, FTP, FX, limits, KRI, stress, profitability); run orchestration that pins consumed batch versions and persists immutable results; dashboards and reports that read stored run results rather than hard-coded numbers; a genuine staging → validation → admission ingestion pipeline; a coherent custom design system.

The principal gaps are: (1) authorisation, scope and maker/checker are enforced only in the UI; (2) the approvals module is largely a free-text mock; (3) validation-rule edits are not persisted; (4) connectors are configuration-only with no execution path and one seed inconsistency that blocks Nigeria uploads; (5) headline liquidity/IRRBB metrics lack position-level drill-down; (6) run reproducibility records rule IDs but not versions; (7) the ProductCharacteristic rule is never applied at run time; (8) several cosmetic fakes (simulated connector test, fake "Run checks" stamp, zero-row freshness batches, ephemeral reconciliation sign-off).

## Gap matrix

| Skill | Existing capability | Status | Gap | Affected area | Priority |
|---|---|---|---|---|---|
| alm-product-architecture | Canonical flow represented end-to-end; pure engine; runs pin batch versions; audit trail exists | Partial | All enforcement UI-only; no service-layer authorisation; some cosmetic fakes undermine trust | Whole app | High |
| alm-source-integration | Connector registry (REST/SOAP/SFTP/JDBC/Proprietary/FileDrop), per-affiliate feed maps with SLA/owner, validation of config | Partial | Connectors never execute; "Test connection" is a simulated stub; NG Positions feed mapped to Blocked Flexcube connector blocks manual upload; connector runs don't feed the pipeline | Connectors, feed maps | High |
| alm-data-foundation | Real staging → validation → admission; append-only versioned batches; Position Book has every canonical field; duplicate-file hash detection; reconciliation vs ledger with plugs | Partial | Validation-rule edits lost on refresh (useState); `Validated`/`Rejected` batch statuses dead; GL sign-off ephemeral (not persisted, no audit, `reconciledBy` never written); GL/COA/product mappings not effective-dated; zero-row "freshness" batches are cosmetic | DataUpload, ValidationRules, GlReconciliation, DataVintages | High |
| alm-rules-engine | 14 versioned rule kinds with maker/checker metadata, dependency-checked deletion, rule hub + 13 editors; behaviour patterns/betas/FTP/buckets genuinely consumed at run time | Partial | ProductCharacteristic rule recorded but never applied at run time (factors ride on positions only); run stores rule IDs not versions (reproducibility hole); validation rules unversioned/unpersisted | runHooks, rules | High |
| alm-liquidity-engine | computeLcr (HQLA by level, haircuts+liens, 75% inflow cap), computeNsfr (ASF/RSF), gap (contractual+behavioural), concentration (HHI), LTD; 75% cap and runoff levers as parameters | Partial | No position-level contribution payloads → no metric→position drill-down for LCR/NSFR; inflow cap hard-coded; results pages re-query positions independently of run | liquidity.ts, results pages | High |
| alm-irrbb-engine | Repricing gap, NII sensitivity, EVE duration-gap + PV01 + BCBS outlier test, 6 standardised shocks, equity; behavioural betas applied | Partial | BCBS shock shapes hard-coded in code (comment admits per-currency parametrisation missing); tier1Capital always null; dashboard shock chart recomputes live instead of reading the run | irrbb.ts, Dashboard | Medium |
| alm-stress-scenario-engine | Stress levers are first-class parameters of the same engines (no duplicate formulas); CBC, survival horizon, WhatIf with 6 levers + presets, permission-gated save | Partial | severeOutflowProfile hard-coded; scenario presets hard-coded in page; ForecastScenario rule consumed only for shockBps; stress/WhatIf recompute client-side rather than stored runs | stress.ts, StressTesting, WhatIf | Medium |
| alm-reporting-framework | Report packs read run results via METRIC_SPECS (12 metrics); regulatory returns register with genuine maker-checker on submission; AdHoc matrix from real runs; branded PDF export; 6-status return lifecycle | Partial | Pack sections/structure hard-coded per kind (no configurable/versioned templates); no approval step on packs; scheduleId never wired; Board/Ad-hoc kinds unused; no reporting calendar view; archive = persistence only, no retention model | ReportPacks, RegulatoryReporting | High |
| alm-workflow-controls | Approvals table with maker/checker on affiliate Testing→Live activation; regulatory returns preparer≠submitter enforced; audit events for rules, users/roles, reference data, batch commit, runs | Partial | Approvals module otherwise a free-text mock (`useRequestApproval` unused; New request bound to no real change); batch admission, rule saves, limits, connectors, packs not covered by workflow; approval decisions/limits/connectors/report generation/export/failed logins not audited; reconciliation sign-off unlogged | Approvals, governanceHooks, audit writers | High |
| alm-enterprise-ui | ResultTable (27 usages, drill-down in 16 pages), StatusBadge (46), ResultsFrame (loading/no-run/stale states), TableControls, InfoButton (~30), 44-step role-filtered tour, CommandPalette; dashboard numbers all from runs with tone bands and trends | Partial | Scope leaks (AdHoc, DataVintages, RiskMap, admin queues, pack builder `useRuns`, `/affiliates/:code` URL access); duplicated Stat/STATUS_TONE patterns; AdHoc raw table; ResultTable lacks built-in pagination; FX position rows lack drill-down | Multiple screens | High |
| alm-flow-audit | No placeholder screens reachable; routing invariants tested; ErrorBoundary + stale-run banners | Partial | To be walked live (Phase 7) | - | Medium |
| alm-permission-audit | RouteGate blocks URL access per permission (tested); sidebar+palette filtered; users.manage confined to own affiliate, DANGEROUS_PERMISSIONS blocked | Partial | Zero repository/service-layer enforcement; self-approval UI-only; unsalted SHA-256 passwords; no lockout; MFA flag cosmetic; `/admin/preferences` route gate looser than tab gate | AuthContext, store, Login | High |
| alm-data-lineage-audit | positionBatchIds pins inputs; batches versioned+hash; methodology strings on results; isStale detection; FX/curves effective-dated and as-of filtered | Partial | Rule versions not snapshotted on run; no position-level lineage for headline metrics; hard-coded "today" dates (DataVintages) | runHooks, metrics | High |
| alm-rfp-compliance | To be evaluated against `RFP DOCUMENT.pdf` (Phase 7) | - | - | - | High |
| alm-ui-review | Consistent teal design system, Outfit/JetBrains Mono; no 30+ column tables; strong empty states | Partial | Items under enterprise-ui above; ~6 dead npm dependencies; dead `useLimits()` export | Multiple screens | Low |
| alm-demo-script | DEMO_SCRIPT.md + ALM_CONSULTANT_PITCH_SCRIPT.md exist; 44-step in-app tour with data/why annotations | Partial | To be refreshed after stabilisation (Phase 8) | - | Medium |

## What must NOT be rebuilt

- The pure engine contract (engines take `Position[]` + context; results pages read from runs).
- The batch/vintage versioning and `positionBatchIds` pinning model.
- The staging → validation → admission ingestion pipeline and its commit gates.
- The design system (ResultTable, StatusBadge, ResultsFrame, TableControls, InfoButton, tour).
- RouteGate + routing invariants, role model, scope context.
- Regulatory-returns maker/checker and GL reconciliation logic.

## Implementation plan (high-priority first)

1. **P2 Data foundation**: persist validation rules; wire `Rejected` batch status; fix NG feed-map blocking; persist reconciliation sign-off + audit; remove fake "Run checks" stamp.
2. **P3 Rules**: apply ProductCharacteristic rule at run time; snapshot rule versions onto runs.
3. **P4 Engines**: position-level LCR/NSFR contributions + drill-down; dashboard shock chart reads stored run; FX limits from affiliate thresholds; optional tier1 capital.
4. **P5 Reporting/workflow**: audit events for approvals/limits/connectors/reports/logins; report pack approval step; reporting calendar.
5. **P6 UI/scope**: enforce scope in AdHoc, DataVintages, RiskMap, admin queues, pack builder, affiliate detail route.
6. **P7 Audits**: flow, permission, lineage, RFP, UI - verify and fix remaining criticals.
7. **P8 Demo script** refreshed against the final app.
