# Ascent ALM — Application Context Handoff (for Gemini demo coaching)

This document is background knowledge, not a script. It explains how the actual Ascent ALM
application works — code-verified, not generic ALM theory — so that given a screenshot, the
reader can identify the screen, its inputs, what's being calculated, and where it sits in the
overall process.

---

## 1. Application Overview

**Ascent ALM** is a browser-based Asset & Liability Management platform built for Ecobank Group —
a 33-affiliate pan-African banking group. It solves the problem every multi-country bank has:
each affiliate (Nigeria, Ghana, Côte d'Ivoire, etc.) runs its own core banking system, its own
local chart of accounts, its own regulator — but the Group needs one comparable, trustworthy view
of liquidity risk, interest-rate risk and profitability across all of them, in one currency.

**Primary users** (six roles, permission-enforced, not just hidden menus):
- **Administrator** — onboards affiliates, configures data sources, dimensions, users/roles, audit.
- **Risk Analyst** — owns liquidity, IRRBB, stress testing, limits, behavioural assumptions.
- **Treasury User** — balance sheet, FTP, funding, FX position.
- **Executive Viewer** — read-only Group-wide summary, no configuration surface at all.
- **Reporting User** — generates/distributes ALCO, regulatory and management report packs.
- **Control Tester** — data quality, reconciliation, validation rules, audit evidence.

**Architecture, high level:** a React/TypeScript single-page app with a local (Dexie/IndexedDB)
data store standing in for what would be a real backend in production. Every calculation is
deterministic TypeScript in `src/engine/*` — no black box, no server round-trip. **One core
invariant governs the whole app: results are never recomputed live on a results screen. Every
result comes from a stored Process Run.** This is stated explicitly in the codebase as the fix
for a real defect class (a prior version's screens each recomputed independently and could
silently disagree with each other).

**From raw data to a management decision, in one sentence:** position-level banking data is
uploaded and validated → enriched with reference data, market rates and behavioural assumptions →
a Process Run executes the actual calculations once → every risk, treasury and profitability
screen reads from that one run → limits flag what's out of appetite → ALCO and regulatory reports
package it for a decision → every step is audited.

---

## 2. End-to-End Data Flow

```
Source Systems → Connectors/Data Sources → Data Upload & Staging → Validation →
GL Reconciliation → Business Rules/Assumptions → Process Run → Risk/Treasury Calculations →
Dashboards & Results → Stress/What-If → FTP/Profitability → Limits & Breaches →
ALCO/Reporting → Audit/Governance
```

| Stage | What enters | What happens | Controls applied | What comes out | Depends on this |
|---|---|---|---|---|---|
| **Source Systems** | Core banking (Flexcube), treasury (Calypso), market data (Reuters, Bloomberg) | Nothing in-app — external | — | Raw files/feeds | Everything downstream |
| **Connectors/Data Sources** | A catalogue entry per system, per data domain | Declares whether a domain is fed by a connector or file substitution | A connector-fed domain **blocks manual upload in the UI** — it can't be silently bypassed | Feed configuration per affiliate | Data Upload |
| **Data Upload & Staging** | A CSV file (Positions, GL, or Counterparties) | Parses, stages editable rows | 8 validation rules (below) | A staged batch | Validation, GL Reconciliation |
| **Validation** | Staged position rows | Checks required fields, currency-code format, no duplicate IDs, and that assets = liabilities + capital | Blocks commit if failed | Pass/fail + exceptions | Commit |
| **GL Reconciliation** | Committed positions + an uploaded trial balance | Compares instrument-level total per GL account against the ledger total | Variance in tolerance → suggested plug, needs approval; out of tolerance → sign-off blocked entirely | Signed-off, trustworthy position data | Process Run (in spirit — see §17 on the actual maker-checker gap) |
| **Business Rules/Assumptions** | Behaviour patterns, FTP rules, adjustment rules, time buckets, discount methods | Configured, versioned, ahead of time | Version + audit trail on every save | A referenceable rule set | Process Run |
| **Process Run** | Positions, reference data, a selected rule set, elements to compute | The actual calculation step (§3) | Blockers prevent execution until inputs are ready | A stored `RunResult[]` | Every results screen |
| **Risk/Treasury Calculations** | The run's own scoped position set | LCR, NSFR, gap, EVE, NII, FTP, profitability, FX position, concentration | — | Stored results, keyed by run | Dashboards, Limits |
| **Stress/What-If** | Positions + a scenario | Six BCBS shocks (real run elements) or a live What-If recalculation (a separate, real, on-the-fly tool — see §3, §14) | — | Scenario-level ΔNII/ΔEVE | Dashboards, ALCO |
| **Limits & Breaches** | Every evaluated metric | Compares against regulatory minimum (locked) and internal amber/red (editable) | Breach requires a recorded cause + action | Green/Amber/Red status | Reporting, KRI |
| **ALCO/Reporting** | A selected run's results | Packages sections into a pack; PDF export is real, email is a `mailto:` draft (see §16) | — | A report pack / regulatory submission | Management decision (outside the app) |
| **Audit/Governance** | Every mutation across the platform | Records who/what/when | — | An immutable-in-practice event log | Nothing downstream — it's the record |

---

## 3. Process Run — the central calculation context

A **Process Run** (`ProcessRun` type) is a real, persisted object with: an as-of date, a scope
(`affiliateCode`, or `'GROUP'` to consolidate every Live affiliate), optional org-unit/product
filters, which position batches it draws from, which rule sets it uses (time buckets, behaviour
patterns, FTP rules, adjustment rules, forecast scenarios), and a list of **calculation elements**
to compute. Status moves `Draft → Queued → Running → Completed → Failed`.

**"Every number reads off the selected Process Run"** means literally this: no results screen
ever recomputes anything. `useSelectedRun()` picks the current run (auto-selecting the newest
completed one for the current scope, or whichever the user explicitly chose on Run History), and
every metric on every screen is read from that run's stored `RunResult[]` via `payloadOf()`.
Changing which run is selected is the *only* thing that changes what a results screen shows — the
underlying position data isn't touched.

**Calculation elements a run can compute** (13 real ones, each independently try/caught so one
failure doesn't kill the whole run): LCR, NSFR, Loan-to-Deposit, Concentration, Liquidity Gap
(contractual + behavioural + runoff), Repricing Gap, NII Sensitivity, EVE Sensitivity, Survival
Horizon, Transfer Pricing, TP Adjustments, Profitability Ratios, FX Position.

**Static vs. Dynamic — real, but shallower than the label suggests.** `ProcessType` ('Static' |
'Dynamic') is a genuine field with a real UI gate (Dynamic requires a New Business rule
selected). **But the engine never actually reads `processType`, `newBusinessRuleId` or
`transactionStrategyId`.** There is no growth/new-business layering logic anywhere in
`executeRun`. Selecting "Dynamic" and attaching a New Business rule changes nothing about the
computed numbers today — see §15 for exactly what this means for the demo.

**Readiness/blockers** are real and enforced: no affiliate selected, no committed position batch
in scope, a missing FX rate for a currency in scope, zero elements selected, or Dynamic without a
New Business rule — any of these disable the "Execute run" button with the specific reason shown.

**Run History** lets you browse every run, A/B-compare two runs' headline metrics, re-select which
run feeds the results screens, and genuinely **re-execute** a run against current data (calls the
same real `executeRun`). **Batch Scheduler** genuinely executes a real run when a scheduled
occurrence is manually fired — but there is no background timer; the app states this outright:
nothing fires while the browser tab is closed. Scheduling is cadence bookkeeping, not autonomous
execution.

---

## 4. Data Sources

**Implemented in this app:** a Connectors catalogue (`Connector` records) representing Oracle
Flexcube, Refinitiv/Reuters, Bloomberg, and Calypso — each with a status (Available/Blocked/
Planned/Retired), the data domains it can serve, and a stated reason when blocked (e.g. Bloomberg
is genuinely blocked because its real-world protocol, BLPAPI, is a session-based binary protocol
that cannot be called from a browser — that's a real architectural note, not filler). Per
affiliate, per data domain, a feed is either **Connector**-fed or **File**-substituted — never
both, and the UI actively prevents uploading a file for a connector-fed domain (see §17).

**Typical real-world role of each** (context, not app behaviour): Flexcube would supply core
banking data — positions and GL — one integration instance per affiliate. Reuters/Bloomberg would
supply market data — yield curves and FX rates. Calypso would supply treasury/derivatives
positions. **What the app actually does with a "connected" domain:** nothing automated — there is
no live socket call anywhere (the Connectors screen's own "Test" button is explicitly a simulated
reachability check, not a real handshake, and says so in the UI). A connector-fed domain simply
has no manual-upload path in this browser-only demo; in production that integration would run
server-side.

---

## 5. Product Characteristics — configured, but not consumed

The **Product Characteristics** screen genuinely captures, per product/currency: LCR rate %, ASF
factor %, RSF factor %, HQLA Level, HQLA haircut %, approximate duration (years), and a
rate-sensitivity flag — all the fields you'd expect.

**Implementation truth, important:** this rule set is **not actually read by the calculation
engine**. The real Basel factors the liquidity and IRRBB engines consume come pre-populated
directly on each `Position` record itself (at ingestion), not from this rule screen. A
`ProcessRun` can reference a Product Characteristic rule set, but `executeRun` never looks at it.
Treat this screen, in a demo, as **illustrative configuration** of what those factors mean — not
as a live control knob. Don't claim editing a value here changes a number elsewhere; it currently
doesn't.

**The conceptual chain that IS real** (just sourced from the position data, not this screen):
HQLA Level → liquidity classification → LCR numerator; Haircut → adjusted liquidity value; ASF →
NSFR stable-funding side; RSF → NSFR required-funding side; approximate duration → EVE's duration
gap.

---

## 6. Liquidity Risk

| Metric | Inputs | What's computed | Configuration | Also appears |
|---|---|---|---|---|
| **LCR** | HQLA-classified positions, LCR cash-flow role/rate on each position | HQLA ÷ net stressed 30-day outflows | Position-level HQLA/haircut fields | Dashboard, Limits, ALCO |
| **NSFR** | ASF/RSF factors on positions | Available ÷ required stable funding | Position-level ASF/RSF fields | Dashboard, Limits |
| **Loan-to-Deposit** | Loan and deposit balances | Simple ratio | — | Dashboard, Limits |
| **Contractual Gap** | Contractual maturity dates | Cash-flow ladder by stated maturity | Time bucket rule | Gap Analysis |
| **Behavioural Gap** | Same positions + Behaviour Pattern rule | Re-dates non-maturity balances (deposits) into modelled tenor buckets | Behaviour Pattern rule (real, traced dependency — §11) | Gap Analysis, Liquidity Risk |
| **Core / Volatile Deposits** | Behaviour Pattern's runoff tiers | Splits deposits by `type: 'Core'|'Volatile'` per tenor tier | Behaviour Pattern rule | Liquidity Risk, Survival Horizon |
| **Survival Horizon** | Severe outflow profile + counterbalancing capacity | Days until counterbalancing capacity is exhausted | Behaviour Pattern | Dashboard, Stress Testing |
| **HQLA** | Position `hqlaLevel`/`hqlaHaircutPct` | Haircut-adjusted liquid-asset stock | Position data | LCR, Survival Horizon |
| **Committed Lines** | Position/counterbalancing data | Counted as counterbalancing capacity | — | Survival Horizon |

---

## 7. Maturity & Repricing Gap

**Maturity buckets** ladder cash flows by when principal is contractually due or, on the
behavioural side, when a deposit is *modelled* as actually leaving. **Repricing buckets** ladder
by `nextRepricingDate ?? maturityDate` — when the *rate* resets, which for a floating-rate loan
can be very different from when the principal is due. **Cumulative gap** is the running total
across buckets; a large negative cumulative gap at the short end is the classic liquidity-stress
signal. This screen is the shared raw material behind both Liquidity Risk (which cares about the
maturity ladder) and IRRBB (which cares about the repricing ladder) — same positions, two
different lenses.

---

## 8. Concentration & Large Exposures

Real, computed metrics (`ConcentrationResult`): total deposits, largest single depositor share %,
top-5 and top-10 share %, and a genuine **Herfindahl-Hirschman Index** (sum of each counterparty's
squared share). Deposits with no counterparty attached are reported as a separate "unattributed"
amount rather than dropped or lumped in — that distinction is deliberate (it would otherwise
distort the measure). **Implementation truth:** the "above 10%" / "above 5%" large-exposure
badges on this screen are hardcoded numeric thresholds in the UI, not sourced from the Limits
configuration engine — Limits & Breaches is a separate control with its own thresholds for the
same underlying metric.

---

## 9. IRRBB

- **ΔNII (`computeNiiSensitivity`)** — a repricing-gap approximation: rate-sensitive assets minus
  rate-sensitive liabilities that reprice within the horizon (default 365 days), times the shock
  in bps. Assumes full, immediate repricing — a near-term, earnings-statement view.
- **ΔEVE (`computeEveSensitivity`)** — a duration-based approximation: asset duration minus
  liability-weighted duration (the **Duration Gap**, a real, named field), times the shock, times
  total assets. A long-run, balance-sheet-value view. **ΔNII and ΔEVE are genuinely different
  calculations and can point in different directions for the same book** — that's the point of
  showing both.
- **PV01** — the EVE-side sensitivity expressed per 1bp rather than per the full shock; literally
  `−durationGap × totalAssets / 10,000`.
- **Duration Gap** — real, `EveResult.durationGap`, driven by each position's
  `approxDurationYears` (a per-position proxy, not a full cash-flow-level duration calculation).
- **Capital basis** — EVE's outlier test (±15% of capital) uses Tier 1 capital if supplied to the
  run, otherwise falls back to balance-sheet equity — which basis was used is tracked and shown.

---

## 10. Interest-Rate Scenarios

Six real, named shocks (`standardShocks()`), all generic BCBS-shape shocks at a 200bp parallel
magnitude — **not per-currency parametrized**, and the code says so explicitly:

| Scenario | Short end | Long end |
|---|---|---|
| Parallel Up | +200bp | +200bp |
| Parallel Down | −200bp | −200bp |
| Steepener | −65bp | +90bp |
| Flattener | +80bp | −60bp |
| Short Rate Up | +250bp | 0 |
| Short Rate Down | −250bp | 0 |

Each shock changes only the rate-shift curve fed into the NII/EVE functions — **behavioural
assumptions (betas, runoff) do not change per shock.** "Short" and "long" are a bucket-count
split, not a fixed tenor boundary. The bucket grid on Stress Testing/IRRBB shows all six shocks'
NII and EVE impact side by side — the point is comparing the book's sensitivity to every
prescribed shape at once, not just whichever shock a run happened to be configured with.
Custom scenarios are the job of **What-If Builder** (§14), a genuinely separate tool from these
six standard ones.

---

## 11. Behavioural Modelling

A **Behaviour Pattern** rule set (versioned, audited) captures, per behavioural tag (Core/
Non-Core/Operational/Non-Operational): a set of **runoff tiers** (tenor in days, a percentage,
and whether that slice counts as Core or Volatile), plus a separate **deposit beta** per tag (the
pass-through rate applied when What-If's "apply deposit betas" option is on). **This genuinely
drives the calculation** — `executeRun`'s Liquidity Gap element calls `applyBehaviouralMaturity()`
and `computeDepositRunoff()` with the selected pattern, producing the behavioural gap and the
Core/Volatile split used in Survival Horizon. **No "dormancy" field exists** — don't invent one.

Governance: each rule set carries `version`, `createdBy`, `updatedBy`, `updatedAt` — real
version tracking at the rule-set level (not per individual pattern), and every save/delete is
audited. So the real governance chain is **Behaviour Pattern rule set → version → creator/updater
→ audit event**, not a per-pattern owner field.

---

## 12. FTP (Funds Transfer Pricing)

Real chain: **Position → base transfer rate (curve interpolation at the position's repricing
tenor) → named adjustments → all-in transfer rate → margin = customer rate minus all-in transfer
rate → aggregated by business unit.**

All four named adjustment types are genuinely implemented, not just liquidity premium: **Liquidity
Premium**, **Basis Risk Cost**, **Pricing Incentive**, and a general **Other Adjustment** — each
independently configurable per Common-COA node. Each adjustment's *method* is separately either a
**Fixed Rate** (a flat bps add-on) or **LCR-Driven** (bps scale up as the affiliate's LCR falls
below a configured threshold, capped) — method and adjustment type are orthogonal, so an LCR-driven
liquidity premium and a fixed-rate pricing incentive can coexist. A position that finds no curve
point or has no external rate is reported as **unpriced** (excluded from margin totals, not
silently counted as zero) — that's a genuine data-gap signal, not an error state to hide.

---

## 13. Profitability

Net Interest Income, Net Interest Margin, NPL ratio, NPL coverage ratio, and non-earning-asset
ratio — computed from the same run's positions (interest income/expense, and credit-quality
tagging via `performingStatus`). This is the earnings/asset-quality complement to the risk
screens: same book, same run, different lens — "is the balance sheet not just safe, but actually
profitable."

---

## 14. What-If Analysis

**A genuinely separate, real, live-recalculation tool** — not a simplified simulation and not the
same mechanism as the six standard shocks. Levers: rate shock size (±400bp), a runoff multiplier,
an HQLA haircut override, inflow suppression %, deposit attrition %, a loan-growth scaling factor
(explicitly a "crude proxy" per its own code comment, not real balance-sheet modelling), and a
toggle to apply deposit betas. It calls the **exact same engine functions** the real run and
results screens use (`computeLcr`, `computeNsfr`, `computeNiiSensitivity`,
`computeEveSensitivity`, `computeSurvivalHorizon`, etc.) against a locally-adjusted copy of the
position set — so its output is a real recalculation, just scoped to this one interactive session
rather than persisted as a run. **Difference from analysing the current run:** the current run's
numbers are fixed and stored; What-If recomputes on the fly every time a lever moves, and nothing
it produces is saved unless the user separately creates a real Process Run from the same
assumptions.

---

## 15. Dynamic / New Business — configured, not executed

**Static vs. Dynamic** is a real field on a run, gated in the UI (Dynamic requires a New Business
rule attached) — but as covered in §3, **the engine does not actually apply any growth logic.**
The **New Business** rule screen genuinely lets you configure, per product/currency, a forecast
method (target growth %, rollover, etc.), pricing margin, timing and a maturity-mix ladder — a
complete editor. The **Transaction Strategies** screen genuinely lets you model discrete actions
(Add/Sell/Hedge — e.g. a Eurobond issuance or an asset sale) with amount, rate and dates. **Both
are fully real, saved, audited rule sets that a run can reference by ID — but `executeRun` never
reads either one.** For a demo: these screens correctly demonstrate the *configuration* story
("this is how Ecobank would model growth and strategic actions"), but selecting them on a run
today changes nothing about the computed numbers. Don't claim otherwise on screen.

---

## 16. ALCO & Reporting

**ALCO Meetings**: a real meeting register — status, chair, attendees, minutes, decisions, and
action items (each with an owner, due date and status). The agenda is a genuine but **static
template** (the same 8-item checklist copied onto every new meeting, not generated from the run).
A meeting can be linked to one specific Process Run (`runId`); when linked, the meeting card pulls
that run's live LCR/NSFR figures directly from stored results.

**Report Packs** (ALCO pack and Management pack, same underlying screen, tab-switched): generation
requires picking a **source run**. Each section maps to one real calculation element, and is only
marked "included" if that run actually computed it — the headline value shown is read live from
that run's results every time the pack is opened, not frozen at generation time. **PDF export is
real** (client-side `jsPDF`, an actual downloadable file, same figures as on screen). **"Email
pack" is not a real send** — it opens the user's own mail client via a `mailto:` link with the
figures pre-filled in the body; the platform doesn't run a mail server. **"Mark distributed"** is
a real, audited status change recording that distribution happened by some other means — it is
the audit record, not the distribution mechanism itself.

The story: **risk analysis (a run's results) → management discussion (a linked ALCO meeting) →
decision (recorded as decisions/actions) → documented report (a generated, PDF-exportable pack).**

---

## 17. Governance & Audit

**Permission editing is real**, not view-only: an Administrator can open Users, Roles &
Permissions and toggle individual permission checkboxes per role, saved to the same live table
`hasPermission()` checks everywhere else in the app — so a permission change here takes effect
platform-wide immediately, no redeploy.

**Segregation of duties is real and enforced in more than one place:** Approvals blocks a decision
if the decider is also the requester; Control Remediation blocks an issue's owner from closing
their own finding.

**Important implementation-truth flag for this section specifically:** the maker-checker control
for moving an affiliate from Testing to Live status is genuinely wired through the Approvals queue
(a real `ApprovalRequest`, decided by someone other than whoever submitted it, and only on
approval does the affiliate's status actually change) — **but only one role in the seeded data
(Administrator) holds both the permission to onboard an affiliate and the permission to decide an
approval**, so demonstrating the full maker-checker loop end-to-end needs two separate
Administrator logins, not one.

**Audit Log** captures every mutation from six real call sites (run execution, rule changes,
batch commits, affiliate changes, reference-data edits, reconciliation sign-off) — module, action,
entity, entity ID, user, role, outcome (Success/Failure), a detail string, and a timestamp.
Filterable by module and outcome, with full-text search across user/entity/detail.

---

## 18. Group / Affiliate Model

Every affiliate has its own country, regulator, functional currency, and its own local chart of
accounts — genuinely different schemes are seeded (Nigeria numeric, Ghana letter-prefixed,
Côte d'Ivoire SYSCOHADA), each mapped onto one Group-standard Common Chart of Accounts. This
mapping is what makes 33 different local ledgers comparable at all.

**Scope selector**: switching between "Ecobank Nigeria" and "Ecobank Group (Consolidated)"
changes which affiliate's (or every Live affiliate's, summed) positions the current screen reads.
A user without Group-wide permission is locked to their own affiliate and cannot select another
one — enforced, not just hidden. **Only affiliates with `status: 'Live'` are selectable for Group
consolidation** — an affiliate still Onboarding or in Testing does not contribute to Group
figures, by the UI-level scope restriction (the calculation engine itself does not independently
re-check affiliate status — the guarantee is enforced at the scope-selection layer).

**Why this matters for Group Risk/Treasury:** a Group CRO needs one number for "the Group's LCR,"
not 33 separate ones to add up by hand — but that number is only trustworthy if every contributing
affiliate's local data has actually been mapped, reconciled and validated to the same standard
first (§6, §17).

---

## 19. Market Data

Real reference data feeds shown on the Dashboard's Market & Rate Monitor: a policy-rate indicator
per currency (CBN MPR for Nigeria, Bank of Ghana MPR for Ghana), an interbank/overnight rate off
the relevant local yield curve, a local sovereign-yield benchmark, SOFR (as the USD reference
curve), and FX rates against USD. **What this data actually feeds, confirmed in code:** yield
curves feed FTP's base transfer rate and general discounting; FX rates feed every currency
conversion in consolidated (Group-scope) figures and FX Position specifically. **Do not claim** a
specific policy-rate print or FX quote directly drives a specific risk metric beyond that — the
Dashboard's market panel is informational context sitting alongside the risk figures, not an input
literally wired into the LCR/EVE calculations shown next to it.

---

## 20. Dashboard

The Dashboard is the **management-level summary of the underlying Process Run — not a separate
calculation engine.** Four headline tiles (LCR, NSFR, Survival Horizon, Loan-to-Deposit) plus a
lighter snapshot row (NII sensitivity, EVE sensitivity, largest-depositor concentration, NPL
ratio, NIM, and an "in breach" count) — every one of them is `payloadOf()` reading the selected
run's stored results, the same values the dedicated screens show, never recomputed independently.
The ΔEVE-by-scenario bar chart re-runs the six standard shocks (§10) against this scope's own
current position set at the run's as-of date (a genuine calculation done in the Dashboard
component itself, not stored — but using the same `computeAllShocks` function, so it will always
agree with the Stress Testing screen). The Market & Rate Monitor panel is reference data (§19),
shown alongside, not blended into, the risk figures.

---

## 21. Key Relationships

**Data → Product Characteristics (illustrative only, §5) → Behaviour Patterns (real input) →
Business Rules (FTP/adjustments, real input) → Scenarios → Process Run → Risk Metrics.**

- **Liquidity Risk ↔ Balance Sheet** — same position data, liquidity lens vs. shape/composition lens.
- **IRRBB ↔ interest-rate-sensitive cash flows** — repricing dates and durations drive both ΔNII and ΔEVE.
- **Behavioural Modelling ↔ Liquidity + IRRBB** — the one real assumption set that changes both the behavioural gap and (via betas, in What-If) NII.
- **FTP ↔ Funding cost + Profitability** — the transfer rate is the bridge between Treasury's centralised cost of funds and a business unit's own margin.
- **Stress Testing ↔ Risk Metrics** — the six standard shocks recompute NII/EVE, nothing else.
- **What-If ↔ Management Decisions** — a live sandbox for "what if," genuinely real but not persisted as a run.
- **ALCO ↔ Decisions** — a meeting can attach to one run and record what was decided about it.
- **Reporting ↔ Communication** — packages a run's results for people who don't log into the platform.
- **Audit ↔ Governance** — the record of everything above, not itself a calculation.

---

## 22. Terminology Cheat Sheet

- **ALM** — Asset & Liability Management; managing the risk in what a bank owns vs. owes.
- **LCR** — Liquidity Coverage Ratio; HQLA ÷ stressed 30-day net outflows. Regulatory minimum
  typically 100%.
- **NSFR** — Net Stable Funding Ratio; available ÷ required stable funding over one year.
- **HQLA** — High-Quality Liquid Assets; convertible to cash quickly, even under stress.
- **ASF / RSF** — Available/Required Stable Funding factors — the NSFR building blocks.
- **NII / ΔNII** — Net Interest Income / its change under a rate shock — a near-term earnings view.
- **EVE / ΔEVE** — Economic Value of Equity / its change under a rate shock — a long-run value view.
- **IRRBB** — Interest Rate Risk in the Banking Book.
- **PV01** — Approximate change in value for a 1bp rate move.
- **Duration Gap** — Asset duration minus liability-weighted duration; drives ΔEVE and PV01 here.
- **FTP** — Funds Transfer Pricing; the internal rate a business unit is charged/credited for funding.
- **NIM** — Net Interest Margin.
- **NPL** — Non-Performing Loan.
- **Survival Horizon** — Days the bank can survive a severe liquidity stress before exhausting counterbalancing capacity.
- **Behavioural Gap** — The maturity ladder after modelling how balances actually behave, not just their contract terms.
- **Contractual Gap** — The maturity ladder by stated contract terms only.
- **Herfindahl Index (HHI)** — Sum of squared depositor shares; a concentration measure, real in this app.
- **Process Run** — The persisted object every result reads from; see §3.
- **Static / Dynamic Run** — A real field/UI gate; does not currently change computed numbers (§3, §15).
- **BCBS Shock** — One of six standard, generic-shape supervisory interest-rate scenarios (§10).
- **Parallel Up / Down, Steepener, Flattener, Short Rate Up / Down** — the six shocks, see §10 table.
- **ALCO** — Asset & Liability Committee; the meeting this platform supports with a linked run and figures.

---

## 23. Implementation Truth — read this before every demo section

| Capability | Status |
|---|---|
| LCR, NSFR, Loan-to-Deposit, Concentration/HHI | **IMPLEMENTED** — real calculation, real data |
| Liquidity Gap (contractual + behavioural), Repricing Gap | **IMPLEMENTED** |
| EVE/NII sensitivity, PV01, Duration Gap | **IMPLEMENTED** |
| Six BCBS standard shocks | **IMPLEMENTED** (generic shape, not per-currency parametrized) |
| What-If Builder | **IMPLEMENTED** — genuine live recalculation, same engine functions |
| FTP (base rate + 4 named adjustment types, LCR-driven or fixed) | **IMPLEMENTED** |
| Profitability ratios | **IMPLEMENTED** |
| Behaviour Pattern assumptions | **IMPLEMENTED** — genuinely consumed by the Liquidity Gap element |
| Product Characteristics rule screen | **UI REPRESENTATION ONLY** — captured but not read by the engine; real factors live on the Position record |
| New Business rule screen | **UI REPRESENTATION ONLY** — fully editable/saved, not consumed by `executeRun` |
| Transaction Strategies rule screen | **UI REPRESENTATION ONLY** — same as above |
| Static vs. Dynamic run type | **UI GATE ONLY** — no growth logic actually applied |
| Connectors (Flexcube, Reuters, Bloomberg, Calypso) | **SIMULATED** — real catalogue/config; no live integration, "Test" is a simulated check |
| File substitution upload/validate/commit pipeline | **IMPLEMENTED** — real, end to end |
| GL Reconciliation | **IMPLEMENTED** — real comparison, tolerance, plugs |
| Onboarding wizard (7 steps) | **IMPLEMENTED**, inline connector/data-load, real persistence |
| Maker-checker (affiliate Testing → Live) | **IMPLEMENTED**, but needs two distinct Administrator logins to demo end-to-end (only role with both permissions) |
| Batch Scheduler | **IMPLEMENTED execution, NOT autonomous** — no background timer; manual "fire" only |
| Report Pack PDF export | **IMPLEMENTED** — real client-side PDF, real download |
| Report Pack email distribution | **SIMULATED** — opens a `mailto:` draft, no real send |
| "Mark distributed" | **IMPLEMENTED** as an audited status record, not a send mechanism |
| Users/Roles permission editing | **IMPLEMENTED** — live, platform-wide effect |
| Audit Log | **IMPLEMENTED** — real events from six call sites |
| Group consolidation Live-only filter | **IMPLEMENTED at the UI/scope layer**; the calculation engine itself does not independently re-check affiliate status |

Nothing in this application is purely **CONCEPTUAL/FUTURE** in the sense of "doesn't exist at
all" — everything named above has real, working UI. The distinction that matters for this demo is
narrower and more important: **which screens feed a real calculation, and which are governance/
configuration surface that doesn't yet connect to one.**

---

## 24. Demo-Specific Knowledge

The natural demo storyline this application actually supports:

**Data** → Connectors & Data Sources, Data Upload & Staging, GL Reconciliation (§4, §6, §17)
**Process** → Process Run, its blockers, its stored results (§3)
**Risk** → Liquidity Risk, IRRBB, Maturity & Repricing Gap, Concentration (§6–§9)
**Scenario** → Stress Testing (six shocks), What-If Builder (§10, §14)
**Decision** → FTP & Profitability, then Limits & Breaches (§9→§12→§13, §6)
**Reporting** → ALCO Meetings, Report Packs, Regulatory Reporting (§16)
**Governance** → Roles & Permissions, Approvals, Affiliates (Group model), Audit Log (§17, §18)

Each stage genuinely has a real, working screen to demonstrate from — the honest caveats are
narrow (§23) rather than pervasive, which is itself worth knowing: most of what's on screen is
real calculation, not staged UI.

---

## INSTRUCTIONS TO GEMINI

When the user uploads screenshots of this application during demo preparation:

1. Use the screenshot as the source of truth for what is visually present.
2. Use this document to understand what the screen means, what feeds it, and what it produces.
3. Never invent information not visible in the screenshot or supported by this document —
   especially do not claim Product Characteristics, New Business or Transaction Strategies drive
   a calculation (§23), and do not claim email distribution or connector integrations are live.
4. Produce a short, fluent consultant talk track, not a script read verbatim.
5. Direct the presenter's attention to the important areas of the screen, not every UI element.
6. Briefly explain the data/calculation flow behind what's shown.
7. Explain why the capability matters to a bank running this across 33 affiliates.
8. Do not teach basic banking concepts — the audience is experienced banking professionals.
9. Write as a confident ALM solution consultant would speak, not as a tutorial.
10. Highlight relationships between screens (e.g. "this gap feeds directly into the EVE number
    you'll see next").
11. End each screen or group of screens with a natural transition to what's next in the flow.
12. Prioritise what matters for the demo agenda over describing every field on screen.
13. If something in a screenshot conflicts with this document (a number, a label, a feature that
    looks different from what's described here), flag the discrepancy back to the user rather
    than guessing or silently reconciling it.
