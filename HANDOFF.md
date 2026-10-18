# Ascent ALM – Handoff for the next AI session

Read this fully before changing anything. It is the state of the project as of **18 Oct 2026 (end of day)**.

## 1. Who / what / why

- **Product:** Ascent ALM – an Asset & Liability Management platform built by **Qucoon** for the **Ecobank eProcess RFP** (Bid 1/5/2026/RFP/CIB & GROUP RISK). Shortlisted; demo done Aug 2026.
- **User:** Oluwatomiwa Olu-Ajayi (Qucoon). Non-developer business owner; wants things *working*, simple, and credible for Ecobank's business team, who will **test the platform themselves end-to-end with no vendor help**.
- **The pressure:** in an Oct 2026 clarification email Qucoon answered "Yes" to all of these. They must be genuinely true in the product:
  - **B1–B7 Behavioural modelling:** native engine deriving assumptions from history; in-platform regression/time-series/curve fitting (no Python/R/Excel); core/non-core, stability, decay, run-off; prepayment, early withdrawal, renewal, repricing betas; calibrate/back-test/validate in-platform; approved assumptions flow automatically into liquidity, IRRBB, FTP, stress, forecast; all included.
  - **F1–F4 FTP & profitability:** matched-maturity FTP, pooled funding, liquidity premium, basis/currency adjustments; transaction-level FTP rolled up by product/BU/affiliate/Group with drill-down; FTP uses the same contractual+behavioural cashflows as liquidity & IRRBB; multi-layer profitability (FTP, opex, ECL, capital charge) by product and customer.
  - **Status: all built (see §5).** The test guide in §9 shows how to demonstrate each.

## 2. User preferences (follow these)

- **Minimal testing.** Implement, then run `npx tsc --noEmit` only. No browser checks, no new tests, no full vitest unless the change is structural or the user asks. (They have repeatedly asked for this; their usage budget is nearly exhausted.)
- **No demo/sample data in the app.** Never seed affiliates/positions/runs or add "load demo data" buttons. Test input files live outside the repo at `C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files` (loans.csv, deposits.csv, treasury.csv, gl_ledger.csv, balance-history.csv, account-history.csv, policy-rate.csv).
- **Simplicity over features.** The user feels recent changes made the app *more* complicated. Prefer removing/merging over adding. Explain in plain language, no ALM jargon unless needed.
- **Do not commit** unless the user says so (they have not approved a commit yet; ~160 files are uncommitted on `master`).
- Ask before large builds; explain cost. Use background subagents only for big work.

## 3. Stack & how to run

- React 18 + TypeScript + Vite + wouter + Tailwind + React Query + recharts. Repo: `C:\Users\AmarachiOrdor\Documents\Consulting Demo\ascent-alm-v2`.
- Dev server: `npm run dev -- --port 5173 --host 127.0.0.1` → http://127.0.0.1:5173
- **Backend: Supabase** (Postgres, project ref `zzqfpixciytyikdxzoyw`, eu-central-1). Credentials in git-ignored `.env.local`: `DATABASE_URL` (owner connection – **the password was pasted in chat; user should rotate it**), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. No service-role key.
- Data layer: every screen uses `repository` from `src/store/repositoryInstance.ts` → `supabaseRepository.ts` when `VITE_SUPABASE_URL` is set and not in tests; otherwise `localRepository.ts` (Dexie/IndexedDB, used by vitest).
- Migrations: `supabase/migrations/*.sql`, applied with `node scripts/apply-migration.cjs <file>` (transactional). Seed shipped config (not demo data): `npx vite-node scripts/seed-supabase.ts`.
- Calculation engines are pure TS in `src/engine/` (can move server-side later).
- Logins (all password `Ecobank@2026`): adaeze.okonkwo@ / david.adeyemi@ (Organisation Admin), kofi.mensah@ / fatima.bello@ (Approver), chinwe.okafor@ / aminata.traore@ (ALM Analyst), yaw.boateng@ / samuel.owusu@ (Viewer) — all `@ecobank.com`, all Group-scoped. No Affiliate Admin seeded.

## 4. Architecture decisions (approved)

- **Single organisation per deployment.** The affiliates row `code='GROUP'` *is* the organisation record. Group defaults = rules/limits with `affiliateCode = null`. No multi-tenancy.
- **5 roles:** `ADMIN` (Organisation Admin), `AFFILIATE_ADMIN`, `RISK_ANALYST` (shown as "ALM Analyst"), `APPROVER`, `EXECUTIVE_VIEWER` (shown as "Viewer"). Retired codes TREASURY_USER/CONTROL_TESTER/REPORTING_USER were migrated (→ Analyst/Approver/Viewer) and remain in the TS union only. Permission `affiliate.manage` = Affiliate Admin editing own affiliate.
- **Navigation:** Home · Data · Assumptions · Run & results · Approvals (/controls) · Reports (/reporting) · Admin (Users & roles, Organisation setup, Notifications, Audit, Preferences). Areas defined in `src/pages/areas/Areas.tsx`, sidebar in `src/components/layout/navigation.ts`. Old URLs redirect (`src/App.tsx` LEGACY_REDIRECTS).
- **Run management (NOT cycles – user explicitly rejected cycles):** a run *series* = affiliate + as-of date; each execution is a version v1, v2…; Open → Request sign-off → Approver approves → Signed off; Reopen (reason) freezes that version; next run = v+1. Every screen reads the *official* run (latest signed-off, else latest flagged Provisional), shown in a header pill (`src/components/layout/RunPill.tsx`); Runs page `src/pages/Runs.tsx`; logic `src/lib/runSeries.ts`. Reports from older versions show "Superseded – based on vN".
- **Data sources model** (borrowed from sister product `C:\Users\AmarachiOrdor\Documents\Consulting Demo\Ascent\reconciliation-platform`): each source belongs to an affiliate (market data → GROUP). Upload → pre-submit check panel → Send to lobby / Upload & admit → Admit/Reject/Withdraw. Code: `src/lib/dataSources.ts`, `src/lib/sourceIngest.ts`, `src/lib/sourceHooks.ts`, `src/pages/data/DataSources.tsx`, `LoadHistory.tsx`, `src/components/data/{UploadDataModal,SourceDrawer,LedgerCheckPanel,FieldsEditor,AddSourceDrawer}.tsx`.
- **Market data is loaded by Group** (FX rates, yield curves, indicators); affiliates only load their own positions/GL (+ optional behavioural history). Market-data tables are global (no affiliate column); only Group-level users can write.

## 5. What has been built (all uncommitted) – up to run management; later work is in §6

**Calculations (B/F claims):**
- `src/engine/stats.ts` (OLS w/ CIs, p-values, decay & floor fits, seasonal decomposition, error metrics) and `src/engine/behaviouralModels.ts` (segmentation, core/non-core, decay & run-off profile, repricing beta w/ lag search, prepayment CPR, term-deposit renewal/early withdrawal, back-testing, calibrate → ModelRun). History import `src/lib/historyImport.ts`.
- Calibration workbench `src/pages/areas/BehaviouralModels.tsx`, model register `ModelRegister.tsx`, propose → rule version → approval (`src/lib/modelRegistry.ts`, `modelHooks.ts`, `src/components/models/*`).
- Approval-gated rules (`src/lib/ruleApproval.ts`): BehaviourPattern, Prepayment, ProductCharacteristic, CostAllocation, CreditLoss, CapitalAllocation. Approved assumptions flow into all engines (`src/engine/run.ts`, `src/lib/runHooks.ts` assembleInputs).
- Shared cashflow book `src/engine/cashflow.ts` used by liquidity gap, LCR 30-day window, repricing gap, time-weighted NII, cash-flow-PV EVE, FTP, survival (`src/engine/curves.ts` holds curve helpers).
- FTP (`src/engine/ftp.ts`): methods MatchedMaturity, DurationMatched, AverageLife, RepricingTerm, Pooled (pools on FtpRule); add-ons LiquidityPremium, CurrencyBasis, BasisSpread etc.; FX-converted roll-ups byOrgUnit/byProduct/byAffiliate; drill-down UI `src/pages/results/TransferPricing.tsx`.
- Profitability layers `src/engine/profitabilityLayers.ts` (FTP, opex pools, ECL, capital, RAROC; product & customer trees) + editors `src/pages/rules/ProfitabilityRules.tsx` + results `src/pages/results/Profitability.tsx`.

**Platform (onboarding brief, phases):**
- Phase 1 inspection done. **Phase 2** security + onboarding model (migration `20261018000000_security_onboarding.sql`): app_users escalation fix, Group rows writable only by Group-level users (`app.affiliate_write_ok`), affiliate_code on run_results/rule_history/temporary_limits/breach_notes/audit_events, maker-checker by user **id** (`requestedById/decidedById`), affiliate activation only via approved request (DB trigger), APPROVER role, tables `onboarding` and `settings`, tour-seen flags on `app_users.data.toursSeen`. Logic: `src/lib/onboarding.ts`, `onboardingHooks.ts`.
- **Phase 3** (migration `20261019000000_roles_onboarding.sql`): 8→5 roles, new nav, Organisation onboarding `/welcome/organisation` (`src/pages/welcome/OrganisationOnboarding.tsx`, `orgSteps.tsx`, `WelcomeLayout.tsx`) with 5 steps saved per step to the `onboarding` row `ORG`; OnboardingGate redirects once per session; Organisation setup under Admin (`src/pages/areas/OrganisationSetup.tsx`); role/scope-aware SetupChecklist; header Back button removed; "Inherit Group rules" checkbox removed. `/welcome/affiliate` is only a holding page.
- **Phase 4** (migration `20261020000000_data_sources.sql`): data sources + lobby + load history; affiliates get 7 default sources (Loans/Deposits/Treasury positions, GL, Counterparties, Balance history, Account history), GROUP gets FX/Curves/Indicators; uploads allowed before an affiliate is Live; affiliate picker removed for affiliate-scoped users.
- **Run management** (migration `20261021000000_run_management.sql`): see §4.
- Other: Supabase migration of the whole app (`20261017000000_init.sql` generated by `scripts/gen-schema.py`, `20261017000100_auth.sql` with `create_login`/`set_login_password`), guided tour engine `src/components/tour/*` (needs rewrite), scroll fix in `WelcomeLayout.tsx`.

## 6. Everything done after §5 (18 Oct 2026) – tsc clean, NOT browser-checked, NOT committed

**Data sources simplified** (migrations `20261022000000_data_sources_simplify.sql`, `20261022000100_affiliate_onboarding.sql`)
- Each affiliate has **2 sources: Positions** (whole book, optional department column) and **General ledger**. Group has **1 "Market data" source** taking one CSV or workbook with sheets FX rates / Yield curves / Policy rates. Old per-department, counterparty, history and separate market-data sources are switched off (history kept, hidden if never loaded).
- Market data is **loaded only by Group**; affiliate setup no longer asks about it; the "affiliates load local market data" switch was removed (it could never work – market-data tables are global, Group-write only).
- Only the **Organisation Admin** can add a data source (`/setup/sources`). New permission **`data.upload`** = ALM Analyst, Affiliate Admin, Org Admin (Approver/Viewer read-only).
- **Column mapping per affiliate** (`src/components/data/ColumnMapping.tsx`, helpers in `src/lib/dataSources.ts`, permission `useCanMapColumns` in `src/lib/sourceHooks.ts`): platform fields are fixed per data kind; an affiliate uploads a sample file, columns auto-match, user confirms per field via dropdowns, required gaps must be matched or "skipped"; saved as aliases on that affiliate's source so later uploads match automatically. Appears in affiliate onboarding Step 2, Affiliate settings → Data sources → Column mapping, and the source drawer "Column mapping" tab (old field editor under "Advanced" for Org Admin). `upsertDataSource` is update-then-insert so Affiliate Admins can save.

**Onboarding**
- **Organisation onboarding = 6 steps**: Organisation → Affiliates → Defaults → **Assumptions** (Group defaults with Not set / Pending / Approved + "if not set" consequence; Set up opens the editor; "Do this later"; Review lists gaps) → Users & access → Review. Files: `src/pages/welcome/OrganisationOnboarding.tsx`, `orgSteps.tsx`, `src/lib/onboarding.ts`.
- **Guided Affiliate Admin onboarding = 6 steps** at `/welcome/affiliate` (`src/pages/welcome/affiliateSteps.tsx`, `AffiliateWelcome.tsx`): Confirm → Data sources (+ column mapping) → Users (assign existing / invite / **bulk CSV** via `src/components/users/UserProvisioning.tsx`, also on Admin → Users & roles and org onboarding Users step; affiliate admins can't create admins) → Configuration (inherited vs overridden; tightening saves, loosening raises a Limits/Override approval) → Initial data (upload + GL→Common COA suggested via `deriveMembersFromFile` in `src/engine/dimensions.ts`) → Readiness → Submit for activation.
- **Welcome screen** (`src/pages/welcome/WelcomeIntro.tsx`) shown before step 1 of either onboarding when not started: greeting, what will be set up, time estimate, Get started / I'll do this later.
- **No more app-chrome flash before onboarding:** `OnboardingGate` now wraps `AppShell` in `src/App.tsx` and shows a full-page **"Preparing your workspace…"** (`PreparingWorkspace`) while it decides. Onboarding layout scrolls (`WelcomeLayout.tsx`).

**Approvals & Control issues redesign**
- `src/pages/Approvals.tsx`: tabs Waiting for me / Raised by me / History; filters (type, affiliate, status, date) + search; cards state what changes and why (run sign-off with LCR/NSFR + who ran it, rule version diff, go-live readiness, limit old→new); side panel `?request=<id>`; Reject requires a reason (`decisionNote`); "why you can't decide" messages. Free-text request behind "Other request".
- `src/pages/Remediation.tsx`: board Open (Identified/Assessed/Planned) → In progress → Verified → Closed; cards with severity, owner, due/overdue, source link; side panel `?issue=<id>` with timeline and "Advance to…"; owner can't close own issue.

**UI polish**
- Login page (`src/pages/Login.tsx`): spacious two-panel layout, original text kept (description shortened to 2 lines; MFA note removed; "Forgot password?" / "Remember this device" are display-only and do nothing). Fonts sized down on the login page only.
- **App-wide font bump:** every `text-[9..14px]` raised by 1px across 113 files.
- **Guided tour v4** (`src/components/tour/tourSteps.ts`): main tour in work order Home → Data → Assumptions → Run & results → Approvals → Reports; covers run pill, upload window, runs/sign-off; onboarding screens are outside the tour by design.

**Database housekeeping** (owner scripts, `DATABASE_URL` from `.env.local`)
- `npx vite-node scripts/reset-supabase.ts --onboarding-only` – restarts organisation onboarding (was run: ORG record deleted).
- `npx vite-node scripts/reset-supabase.ts --yes` – full wipe to shipped state (Group + seed logins) and re-seed. NOT run.
- `npx vite-node scripts/delete-affiliate.ts <CODE> [--yes]` – deletes one affiliate with its sources, data, runs, rules, approvals, onboarding, settings and its logins (preview without `--yes`). Was run for **GH** (also deleted logins joy.deborah@ and amarachi.ordor@).
- Current DB (as last checked): GROUP only, 8 seed logins, ORG onboarding not started, no uploads/runs, no market data.

**Browser storage:** no business data. Only the Supabase session token (supabase-js), a per-session "onboarding redirect handled" flag (sessionStorage), and the tour-seen flag in local/test mode only (Supabase mode stores it on `app_users.data.toursSeen`).

**Reuse for other clients:** engines, data sources, runs, approvals, onboarding are generic; but "Ecobank" is hard-coded in ~40 places (login, sidebar, labels, PDF export, welcome screens), the logo/colours, seed emails `@ecobank.com`, West-African regulators. A second client today = separate Supabase project + manual rebranding. Recommended next step: take org name/logo/colours from organisation onboarding.

**Teardown fixes part 1 - foundations** (spec `Downloads\alm_workflow_teardown_consolidated.md`; migrations `20261023000000_teardown_foundations.sql`, `20261023000100_who_can_fix.sql`, both applied; tsc clean, NOT browser-checked)
- **Readiness model** `src/lib/readiness.ts` (pure: `computeReadiness`, `marketDataStatus`, verdict Ready / Ready with warnings / Blocked; items per category Setup, Data, From Group, Rules, Calibration, Governance, each with scope, detail, blocking, degradation, fixPermission, fixHref) + hooks `src/lib/readinessHooks.ts` (`useReadiness(code, date, selection?)`, `useGroupReadiness(date)`, `invalidateReadinessInputs`, `useMarketDataSlaDays`). Run now's pre-flight uses it (single source of truth). Only 6 hard blockers: no committed positions, affiliate not Live, missing FX, no elements, unapproved gated rule selected, locked series.
- **Who can fix** `src/lib/whoCanFix.ts` (+ DB `public.who_can_fix`), components `src/components/readiness/{WhoCanFix,ReadinessChecklist}.tsx`.
- **Degradations**: `ProcessRun.degradations` written by `engine/run.ts` (standard ladder, "Not classified" positions, contractual timing when no behaviour rule, no curve, FTP blank without an FTP rule, profitability blank instead of failing); shown by `components/results/DegradationNotice.tsx` on ResultsFrame, Run now and Runs.
- **Six standard sources per affiliate** (Loans, Deposits, Treasury, GL, Balance history, Account history); old single Positions source switched off. Smart drop zone routes by file name then headers (`routeFile` in `lib/dataSources.ts`); **inline column mapping** at first upload (saved as `mappedHeaders` on the source), later uploads show a diff vs the previous load. **Derivation on admit**: products, GL accounts, org units, common COA, counterparties created from the file (`deriveReferenceData` in `lib/sourceIngest.ts`); unknown codes never block; onboarding COA step and column-mapping step are optional.
- **Working context**: header Scope (all affiliates for Group users, own one for affiliate users) + As-of date (committed dates; default latest), persisted on `app_users.data.workingContext`; `useScope()/useWorkingContext()` expose `asOfDate`, `availableDates`, `setAsOfDate`. Run now, upload, results (official run for that date), ledger check and What-if follow it.
- **Market data** moved to Data → Market data (`/data/market`, sub-tabs fx/curves/indicators/calendars; `/setup/reference*` redirect) with status cards (latest date, who, coverage, staleness vs org setting `marketData.slaDays`, default 30). Every load audits the affected affiliates and notifies them (`lib/marketDataEvents.ts`).
- **Notifications**: table `public.notifications`, `app.notify` / `public.send_notification`, triggers for approval decided (to requester) and affiliate Live; app sends market data loaded, GL admitted, ledger signed off. Hooks `lib/notificationHooks.ts`, header bell `components/layout/NotificationBell.tsx`.
- **Group assumptions file** (`Group_assumptions_setup_values.xlsx`): `lib/groupAssumptions.ts` + `components/rules/GroupAssumptionsUpload.tsx` on Assumptions → Rules, the Admin Assumptions section and the onboarding Defaults step; gated kinds saved as new versions pending approval, FTP + add-ons active.

**Teardown fixes part 2 - screens** (tsc clean, NOT browser-checked; migration `20261024000000_affiliate_admin_cascade.sql` written but **NOT applied** - run `node scripts/apply-migration.cjs supabase/migrations/20261024000000_affiliate_admin_cascade.sql`)
- **Home stays the executive dashboard** (user override of the spec). Only addition: `components/readiness/HomeReadinessStrip.tsx` at the top - verdict for the scope (Group: "N of M affiliates can run, K blocked"), "See readiness →", and for `approvals.approve` holders "N awaiting your decision".
- **Readiness tab** `src/pages/Readiness.tsx` at `/execution/readiness`, first in Run & results → Run (Readiness · Run now · Runs · Schedules; Runs moved into the Run group; group gate now `risk.view`). Exempt from the "affiliate must be Live" route gate. Group scope: market-data card (`marketDataStatus`, upload button or WhoCanFix) + affiliate matrix (Date / Data / From Group / Rules / Verdict / latest run version + sign-off; cells open the fixing screen after switching scope; name switches scope). Affiliate scope: full `ReadinessChecklist` with WhoCanFix, verdict, blockers banner, latest run (headline ratios, degradations), Upload data / Run now (only if the user can). Run now pre-flight now also shows this date's latest version sign-off status with a link to the pending request.
- **Product characteristics fallback by common account**: `ProductAssumption.commonCoaCode?` (append-only). `buildAssumptionLookup` in `engine/classification.ts`: product+currency, else common account+currency, else common account with currency `*` (any). Used by `applyProductCharacteristics`, `unclassifiedProducts`, SetupChecklist. Editor (`pages/rules/ProductCharacteristics.tsx`) has "Applies to: Product / Common account" per row (+ "Any" currency); edit permission is now `rules.edit` (was `data.configure`). Group assumptions parser accepts COA rows (first column `COA-…`/"Common account: …" or a header starting "Common"/"COA"; currency Any/All/*). No seed data changed.
- **Approval status where raised**: `components/rules/RuleApprovalBadge.tsx` (`ruleApprovalState`): "Approved & in use" / "vN pending approval" / "Rejected: reason" / "not submitted", linking to `/controls?request=<id>`; shown in every RuleEditor list row and detail header (gated kinds only), the rule-inheritance table, ProposePanel and the Model register (`ModelApprovalBadge`). Decision notifications already deep-link (`/controls?request=` or `/execution/history?run=`).
- **AffiliateSettings slimmed** (1163 → ~590 lines): Overview, Profile, Thresholds, Users, Data sources summary (links to Data → Sources; `components/affiliates/AffiliateSettingsPanels.tsx`), Rule inheritance (read-only: Group default vs own version + approval). Removed: 18 inline rule editors, rule coverage, reference data, connections/credentials/webhooks/export/notifications/audit. Old `?section=` links redirect (`lib/rulePaths.ts` `legacySettingsSectionTarget`): rule-X → its editor, ref-* → Data → Market data, notifications/audit → Admin. New routes `/rules/validation`, `/rules/field-mappings`, `/rules/code-mappings`, `/rules/coverage` (all old links updated).
- **Merges**: Model register is a sub-tab of Behavioural models (Calibrate · Model register; `/assumptions/models` still works). Runs/Schedules in the Run group; Control issues under Approvals; Notifications admin under Admin (bell is the tray) - verified.
- **Cascading permissions**: AFFILIATE_ADMIN now also has `rules.edit`, `risk.configure`, `reporting.generate`, `commentary.write` (ROLES; bootstrap tops up existing roles; migration above updates the DB row and strips `approvals.approve` from any role other than ADMIN/APPROVER). RLS already scopes rules/model_runs/rule_history writes with `app.affiliate_write_ok`. RuleEditor: affiliate-scoped users' new rules/copies are stamped with their affiliate; Group defaults are read-only to them with a "Save as to make your own version" note (Delete hidden). Market-data edit controls (FX, curves, indicators, calendars) hidden from affiliate users; Market data hub shows WhoCanFix instead.
- **Part-1 leftovers**: manual saves on FX rates and yield curves call `useMarketDataSaved` (`lib/marketDataHooks.ts`: audit + notify affected affiliates + invalidate readiness) and record the real user name. Deleted unrouted legacy screens `DataUpload.tsx`, `DataLoadPanel.tsx`, `GlReconciliation.tsx`, `DataVintages.tsx`, `PipelineTabs.tsx`.
- **Tour v5**: steps for the notification bell (`data-tour="notifications"`) and the Readiness tab; Group-settings steps now point at the slim page only.
- Not done: Home Group risk map / pending list (user kept Home as dashboard), Approvals "Control issues" still a separate tab (already under Approvals), period/cycle object (user rejected cycles).

## 7. Client UAT pack

- **Test input files:** `C:\Users\AmarachiOrdor\Documents\Consulting Demo\test-files` (README.txt): `1_Group_market_data/market_data_2026-07-31.xlsx` (FX for NGN/GHS/KES/XOF/EUR/ZMW, curves NGN/GHS/KES/USD, policy rates CBN/BoG/CBK, 24 months); `2_Nigeria_NG`, `3_Ghana_GH`, `4_Kenya_KE` each with loans/deposits/treasury/gl_ledger + balance-history + account-history (24 months; GH/KE derived from NG in local currency); Kenya also has `NEGATIVE_TEST_positions_with_errors.csv` and `NEGATIVE_TEST_gl_out_of_balance.csv` (must fail). Rules, users and org/affiliate details are entered on screen (values in the workbook's Test Data sheet).
- **Test workbook (latest): `C:\Users\AmarachiOrdor\Documents\Consulting Demo\Ascent_ALM_UAT_Test_Cases_Cycle1_v8.xlsx`** (ignore v1–v7). Modelled on the client's samples (`Downloads\GTM 2 LIT Super App UAT Release Note Cycle 9.xlsx`, `Downloads\Super App - Testing Data - Cycle 10 - 20260625 (1).xlsx`). Sheets: Release Note, Test Cases, Test Data, Summary (COUNTIFS pass/fail per feature + certify %).
  - **120 test cases in strict execution order** (TC_001 first), scenarios merged in (27 duplicates dropped, 15 kept): Type = 99 Functional / 18 Negative / 3 End-to-end.
  - Columns: ID, Seq, Phase, Feature, Type, Email Ref (B1–B7, F1–F4 or Platform/Data/Onboarding), Signed in as, Navigation (where – never blank: menu path, or "Same screen as previous step: …", or the phase's start screen), Depends on, Steps, Expected, Tester, Date, Status (dropdown, colour-coded), Comments, Screenshot.
  - 12 phases: 01 Sign in · 02 Organisation setup · 03 Group market data · 04 Affiliate onboarding · 05 Load data · 06 Assumptions & models · 07 Run & sign-off · 08 Results · 09 Approvals & control issues · 10 Reports · 11 Roles & security · 12 End-to-end journeys.
  - Put the platform URL in the Test Data sheet before sending.
- **Generators (now in the repo):** `scripts/uat/make_uat.py` (build: `python scripts/uat/make_uat.py "<output.xlsx>"` – edit the CASES/SCENARIOS/PHASES lists, bump the file version if the old one is open in Excel), `scripts/uat/organise_test_files.py` (folders + market-data workbook; already run), `scripts/uat/make_history.py` (GH/KE history; already run).

## 7b. Open items / next work

1. Approving a "loosen threshold" Limits/Override request does **not** auto-apply the new value (Org Admin sets it by hand).
2. Affiliate onboarding Step 2: the mapped/skipped choice per source isn't remembered when going back.
3. GL ledger-check sign-off is not maker-checker; no "withdraw sign-off request" button.
4. Branding configurable per organisation (see "Reuse" above).
5. (Done in teardown part 2: the unrouted legacy screens were deleted.) Apply migration `20261024000000_affiliate_admin_cascade.sql`.
6. Not started: role-aware dashboards, report builder, remaining simplifications (one-button run, calibrate-all, results overview, merge what-if screens, merge limit screens, regulatory defaults), real integrations (§8), email invites/forgot password (needs SMTP in Supabase), real MFA.
7. **Nothing has been committed to git** – ask the user before committing (~170 changed files).
8. Nothing since Phase 4 has been clicked through in a browser; the user is testing manually and reports bugs – fix those directly (cheaply), not with large builds.

## 8. Integration reality (be honest with the client)

The app is **upload-based**. Connectors (FLEXCUBE, Calypso, Bloomberg, Reuters) are configuration only; "Test" is simulated; no server-side scheduler/ingestion; runs compute in the browser. Production integration needs an ingestion service + SFTP/API connectors + service accounts + Supabase cron + server-side runs (~3–5 weeks).

## 9. How to demonstrate each email claim (test guide summary)

Setup (files in `Consulting Demo	est-files`, see its README): sign in as Org Admin → welcome screen → organisation onboarding (6 steps) → Data → Sources → upload `1_Group_market_data/market_data_2026-07-31.xlsx` to the Group Market data source → create an Affiliate Admin for NG → sign in as them → affiliate onboarding (6 steps incl. column mapping + initial data from `2_Nigeria_NG`) → Submit for activation → Approver approves → Data → Ledger check sign-off → upload balance/account history from Assumptions → Behavioural models.
- **B1/B3:** Assumptions → Behavioural models → Deposit stability & run-off → Fit → core/volatile, stability, decay, half-life, run-off profile (from data, nothing typed).
- **B2:** fit statistics (R², RMSE, MAPE, p-values, 95% CIs); Repricing beta regression with lag search; all in-browser.
- **B4:** Loan prepayment (CPR+CI), Term deposit (renewal, early withdrawal), Repricing beta.
- **B5:** back-test hold-out + tolerance → pass/fail; Model register; Audit log.
- **B6:** Propose → Approver approves → Run now → behavioural gap, behavioural analysis "patterns applied", NII (betas), FTP deposit tenor, stress; Runs → Assumptions used. Negative: unapproved proposal not used.
- **F1:** FTP rule (methods, pools) + add-ons (liquidity premium, currency basis, basis spread) → Transfer pricing line breakdown + Compare methods.
- **F2:** Transfer pricing drill-down Group → affiliate → BU → product → positions; roll-up toggle.
- **F3:** amortising buckets + "Not bucketed" total; EVE "cash-flow PV"; approve a prepayment rule → gap, FTP and EVE all move together.
- **F4:** cost allocation / ECL / capital rules → Profitability waterfall, RAROC, product & customer views, cost-pool reconciliation.
- Controls: self-approval blocked (DB-enforced); reopen → v2; affiliate users see only their affiliate.
