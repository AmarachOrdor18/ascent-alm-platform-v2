# Ascent ALM Platform - User Guide

This is a role-based walkthrough of how the platform actually works, written for someone new to
accounting, ALM or banking risk. It is not a screen-by-screen list - it follows the platform's
real business flow, and every screen named below is a real, working screen in this application
today (no invented modules, no invented fields).

**Start here:** find your role in [Section 3](#3-role-based-journeys), then read the
[Section 2](#2-the-end-to-end-journey) walkthrough once so the pieces connect.

---

## 1. What is ALM, and what does this platform do?

**ALM (Asset & Liability Management)** is how a bank manages the risk that comes from the
mismatch between what it owns (loans, investments) and what it owes (deposits, borrowings) -
in particular, the risk that it can't pay depositors on time (**liquidity risk**), and the risk
that changing interest rates hurt its earnings or its balance-sheet value (**interest rate
risk**).

This platform takes a bank's actual position data (every loan, deposit, investment - one row per
account), combines it with market data (interest-rate curves, FX rates) and the bank's own
behavioural assumptions (how depositors and borrowers actually behave versus their contractual
terms), and computes the standard regulatory and internal risk metrics from it - for one
affiliate bank, or consolidated across the whole Ecobank Group.

Everything downstream of a **run** (Section 2, step 8) reads from that one run, so a number never
disagrees with itself between screens the way it could if every screen recomputed independently.

---

## 2. The end-to-end journey

This is the order data actually flows through the platform. Each step names the real screen(s)
involved.

```
1. SOURCE SYSTEMS / FILES        Core banking (Flexcube), treasury systems (Calypso),
                                  market data vendors (Reuters, Bloomberg), or a file
                                  an affiliate prepares by hand.
        ↓
2. DATA INGESTION                Data Management → Data Operations → Data Upload & Staging
                                  (or the onboarding wizard's Step 7, same underlying screen).
        ↓
3. VALIDATION                    Same screen - required fields, valid currency codes, no
                                  duplicate IDs, the balance sheet actually balances.
        ↓
4. POSITION BOOK                 What gets committed once validation passes - see Section 4.
        ↓
5. TRIAL BALANCE / RECONCILIATION Onboarding Step 7 (inline) or GL Reconciliation - see
                                  Section 6 for the full walkthrough.
        ↓
6. REFERENCE DATA / DIMENSIONS   Data Management → Data Structure / Reference Data - see
                                  Section 5. Classifies and enriches positions; mostly
                                  already set up, not re-entered per run.
        ↓
7. ASSUMPTIONS                   Configuration → Business Rules - behavioural patterns,
                                  prepayment, discount methods. See Section 7.
        ↓
8. ALM RUN                       Execution → Process Run. This is the actual calculation
                                  step - everything before this is preparing its inputs.
        ↓
9. RISK CALCULATIONS             The engine computes liquidity, IRRBB, profitability,
                                  concentration, stress scenarios - all from the one run.
        ↓
10. DASHBOARDS / RESULTS         Overview → Executive Dashboard, and every screen under
                                  Risk Management / Treasury - see Section 8.
        ↓
11. LIMITS & BREACHES            Risk Management → Concentration & Risk Monitoring →
                                  Limits & Breaches, and → Key Risk Indicators.
        ↓
12. REPORTING / ALCO             Reporting & ALCO - packages the results for the
                                  committee, regulators, or management.
        ↓
13. MANAGEMENT ACTION            Approvals (maker-checker), Control Remediation, and
                                  whatever the business does in response - outside the
                                  platform, but the platform is what surfaces the need.
```

The **onboarding wizard** (Affiliates → Onboard affiliate) exists because a *new* affiliate has
to complete steps 2–6 for the very first time before it can ever reach step 8 - that's exactly
why it's a seven-step wizard rather than a form: legal profile, currencies, connectivity,
chart-of-accounts mapping, assumption choice, limits, and finally the initial data load, all in
one place. See `ALM_PLATFORM_USER_GUIDE.md`'s Section 3 (Administrator) for that journey
specifically.

---

## 3. Role-based journeys

The platform has six roles. What you can *see* and *do* is enforced by real permissions, not
just hidden menu items - if a screen below isn't reachable for your role, it's actually blocked,
not just unlinked.

### Administrator
*You set up the platform so everyone else's numbers are trustworthy.*

1. **Group & Affiliate Management → Affiliates** - the directory of every affiliate and its
   data-freshness. **Onboard affiliate** is your entry point for a new one (see the callout
   above); **Bulk onboard** does the same for several at once from an Excel template.
2. **Group & Affiliate Management → Connectors & Data Sources** - the shared catalogue of
   systems (Flexcube, Calypso, Reuters, Bloomberg) and which domain each affiliate is fed by.
   *Read Section 4 - this is the single most important distinction for your role.*
3. **Data Management → Data Structure** - Dimensions & Hierarchies (how positions are classified)
   and the Counterparty Register.
4. **Data Management → Reference Data** - curves, FX rates, indicators, holiday calendars.
5. **Configuration** - Business Rules (behavioural assumptions, prepayment, discount methods) and
   Validation Rules.
6. **Administration & Governance** - Approvals (you're usually the checker here), Control
   Remediation, Notifications, Users/Roles/Permissions, System Preferences, Audit Log.

### Risk Analyst
*You own whether the risk numbers are right, and what they mean.*

1. **Data Management → Data Operations** - check what's actually loaded and how fresh it is
   before trusting a run.
2. **Risk Management → Liquidity Risk** - LCR, NSFR, the liquidity gap, and the Liquidity Risk
   Map across affiliates.
3. **Risk Management → IRRBB & Behavioural Risk** - interest-rate sensitivity (EVE, NII, PV01)
   and the behavioural assumptions driving it.
4. **Risk Management → Stress Testing & Scenario Analysis** - the six BCBS supervisory shocks,
   plus What-If Builder for a scenario that isn't one of the six.
5. **Risk Management → Concentration & Risk Monitoring** - exposure → limits → KRIs, in that
   order (see Section 9's glossary).
6. **Configuration → Business Rules** - you're usually the one tuning behavioural/prepayment
   assumptions, not just reading their output.

### Treasury User
*You manage funding, pricing and the shape of the balance sheet.*

1. **Treasury → Balance Sheet & Treasury** - Balance Sheet Analytics and FX Position (Section 4:
   FX Position is a *result*, not something you upload).
2. **Treasury → FTP & Profitability** - see Section 7. This is where "which desk is actually
   making money" gets answered.
3. **Risk Management → Liquidity Risk** - you're a heavy consumer of this, even though Risk owns
   the methodology.
4. **Configuration → Business Rules → Transaction Strategies / FTP Rules** - the rules that drive
   your own screen's numbers.

### Executive Viewer
*You need the headline picture, not the configuration behind it.*

1. **Overview → Executive Dashboard** - read Section 8 metric-by-metric once; after that this
   screen should be self-explanatory.
2. **Risk Management** screens - read-only for you; you can drill into any number but not edit
   assumptions or limits.
3. **Reporting & ALCO** - the packaged view for committee/board consumption.
4. **Group & Affiliate Management → Affiliates** - the Group-wide picture across all affiliates.

You will not see Data Management, Configuration, or Administration at all - those need
permissions your role doesn't carry, by design.

### Reporting User
*You package results for people who don't log into the platform.*

1. **Reporting & ALCO** - ALCO Meetings, Report Packs (ALCO pack and Management pack, tab-switched
   in one screen), Regulatory Reporting, Ad-Hoc Analysis.
2. You can generate, download and email packs; you cannot configure the data or rules feeding
   them - that's Risk/Treasury/Admin's job, yours is distribution.

### Control Tester
*You check that the data and controls are actually sound, not just that numbers exist.*

1. **Data Management → Data Operations** - Data Upload & Staging, GL Reconciliation, Data
   Vintages & Load History. Section 6 is your core workflow.
2. **Data Management → Data Structure → Configuration → Validation Rules** - the rules that
   decide what counts as a valid position.
3. **Risk Management** - read-only, to check a control's downstream effect.
4. **Administration & Governance → Audit Log** - the evidence trail for everything above.

---

## 4. Data feeds - what actually enters the platform

| Feed | In plain terms | Where you see it |
|---|---|---|
| **Position Book** | What the bank currently owns and owes - every loan, deposit, investment and other position, one row each. This is the load-bearing feed: nothing computes without it. | Data Upload & Staging |
| **General Ledger / Trial Balance** | The accounting view of the bank's balances. Used to check the detailed position book agrees with the books of account - see Section 6. | GL Reconciliation (and onboarding Step 7) |
| **Interest Rates & Curves** | Yield curves per currency, used for discounting and for pricing FTP's internal transfer rate. | Data Management → Reference Data |
| **FX Rates** | Used to convert every currency to one common currency so the Group can calculate a consolidated result. A missing rate fails the calculation rather than silently dropping that currency. | Data Management → Reference Data |
| **Counterparty Register** | Who the bank's obligors and depositors actually are, so concentration (e.g. "25% of our deposits come from one customer") is computable. | Data Management → Data Structure |
| **Economic Indicators** | Macro series (inflation, policy rates) that drive behavioural assumptions and stress-scenario narratives. | Data Management → Reference Data |
| **Holiday Calendar** | Business-day rules per country. A payment due on a holiday shifts to the next business day - which can move it into a different time bucket in the liquidity gap. | Data Management → Reference Data |

Positions and, where uploaded, GL data are the two domains actually loaded through the upload
pipeline. Market Rates, FX Rates, Counterparties and Economic Indicators are usually Group-level
reference data maintained centrally rather than uploaded per affiliate - see Section 5.

---

## 5. Connectors vs. File Substitution - read this before touching Connectivity

**This is enforced in the UI, not just written here.**

Every data domain (Positions, GL, Market Rates, FX Rates, Counterparties, Economic Indicators)
for a given affiliate is fed one of two ways:

- **Connector** - an automated system integration (e.g. Oracle Flexcube for core banking data,
  Refinitiv/Reuters for market data). Once a domain is configured this way, the connector is the
  **authoritative source** - the platform will not let you upload a file for that domain instead.
  The upload screen shows a clear message naming the connector, not a file picker, so a real feed
  can never be silently overridden by a stray manual upload.
- **File substitution** - a declared, first-class alternative for when a connector genuinely isn't
  available for that affiliate yet. It is held to *exactly* the same validation standard as a
  connector-fed domain - file substitution is not an informal workaround.

**Important:** a connector belonging to one affiliate (e.g. Nigeria's Flexcube instance) does not
transfer to another affiliate just because it's the same vendor. Flexcube is explicitly "one
instance per affiliate" - a new affiliate configures its own, it doesn't inherit Nigeria's. The
onboarding wizard's Connectivity step makes this explicit: picking "Connector" never
auto-selects an existing one, and the primary action is **Configure** - set up this affiliate's
own connector, even if it happens to be the same underlying vendor as another affiliate's.

Where you manage this: **Connectivity** (onboarding wizard, Step 3) for a new affiliate, or
**Group & Affiliate Management → Connectors & Data Sources** for ongoing changes to an existing
one.

---

## 6. Position Book → Trial Balance reconciliation, explained simply

This is the control that catches a data problem before it reaches a risk number.

1. **Upload/receive the position book.** Every loan, deposit and investment, one row each.
2. **Validate it.** The platform checks required fields are present, currency codes are real,
   there are no duplicate rows, and - critically - the position book's own assets equal its
   liabilities plus capital. A file that fails this can't be committed.
3. **Obtain the trial balance.** The accounting department's own view of the same balances, from
   the general ledger.
4. **Reconcile.** The platform compares the position book's total per GL account against the
   trial balance's total for that same account.
   - **What's being compared:** two independent views of the same balances - the detailed
     instrument-level data (position book) against the summarised accounting record (trial
     balance).
   - **Why:** if they disagree, either the position data is wrong (a loan booked twice, one
     missing) or the ledger is wrong - either way, a risk number built on top would be wrong too.
     Catching it here is much cheaper than catching it after LCR or EVE has already been reported.
   - **What a difference means:** a genuine timing or data-quality issue, not an error to ignore.
     Small differences within a stated tolerance can be explained with a "plug" (a proposed
     adjustment) that still requires explicit approval before sign-off; larger differences block
     sign-off entirely and go back to the affiliate to fix.
5. **Resolve or approve.** Every proposed plug needs approval; anything outside tolerance is not
   plugged, it's fixed at the source.
6. **Proceed.** Only once this is signed off does the affiliate's initial data load count as
   complete (see the onboarding wizard's Step 7) - the same standard applies to an existing
   affiliate's ongoing periodic reconciliation on **GL Reconciliation**.

Where you do this: **onboarding Step 7** (new affiliate, inline) or **Data Management → Data
Operations → GL Reconciliation** (an existing affiliate, ongoing).

---

## 7. Reference Data, Dimensions & Assumptions - what's set up once vs. entered every time

Four different kinds of data feed a calculation, and confusing them is the easiest way to get
confused about this platform:

| Kind | What it means | Example |
|---|---|---|
| **Input** | Data supplied to the system for a specific date. | The position book itself. |
| **Reference data** | Information used to interpret or classify the input - usually set up once, not re-entered per run. | Dimensions & Hierarchies, Counterparty Register, Currency & FX Rates, Interest Rates & Curves, Economic Indicators, Holiday Calendar. |
| **Assumptions** | Rules the engine applies when modelling behaviour that isn't contractually fixed. | Behavioural patterns, prepayment assumptions, discount methods - Configuration → Business Rules. |
| **Results** | What the engine calculates - never uploaded, always produced. | LCR, EVE, NII, FX Position, Profitability Ratios, everything under Risk Management/Treasury results screens. |

**Dimensions & Hierarchies** specifically classify every position by seven axes: Legal Entity,
Organisational Unit, Product, GL Account, Common Chart of Accounts, Financial Element, and
Counterparty. Group-standard hierarchies and each affiliate's starting set are seeded when it's
onboarded; from then on it's ordinary configuration data.

**A position file can reference a code that doesn't exist yet as reference data** (e.g. a new
local GL code, or a new counterparty ID). Where that's supported, the platform lets you create
the missing reference values directly from the file that referenced them ("Create these from the
file", on Data Upload & Staging) - this doesn't apply to the Common Chart of Accounts, which is
Group-governed and deliberately not auto-created, so a code it doesn't recognise surfaces as a
mapping gap to resolve, not something silently invented.

**FX Position is a result, not an input.** It's calculated from a completed run's positions
converted through the FX rates above - there's no "upload FX Position" anywhere, and there
shouldn't be.

---

## 8. Dashboard, metric by metric

The Executive Dashboard's four headline tiles, and the metrics feeding the rest of the platform:

**LCR (Liquidity Coverage Ratio)** - can the bank meet 30 days of stressed cash outflows using
assets it can actually sell quickly? Higher is better; below 100% is a regulatory breach.
*Comes from:* the position book's liquid-asset and cash-flow classification. *Drill down:*
Liquidity Risk.

**NSFR (Net Stable Funding Ratio)** - is the bank's longer-term lending backed by
similarly-stable funding, not short-term money that could disappear? Higher is better; below
100% is a regulatory breach. *Drill down:* Liquidity Risk.

**Survival Horizon** - under a severe liquidity stress, how many days can the bank survive
before running out of counterbalancing capacity? Longer is better. *Drill down:* Stress Testing.

**Loan-to-Deposit** - how much of customer deposits is out as loans? Too high suggests
over-reliance on wholesale funding to cover the gap; there's a sensible middle, not just
"lower is always better." *Drill down:* Liquidity Risk.

**EVE (Economic Value of Equity) sensitivity** - if interest rates moved today, how much would
the *economic value* of the balance sheet change? A long-run, valuation-style view of interest
rate risk. *Drill down:* IRRBB.

**NII (Net Interest Income) sensitivity** - if interest rates moved, how would the bank's
*earnings over the next year or so* change? A near-term, income-statement view - genuinely
different from EVE, and the two can point in different directions for the same balance sheet.
*Drill down:* IRRBB.

**PV01** - the approximate change in value for a 1-basis-point (0.01%) move in rates. A finer-
grained way of expressing the same rate sensitivity EVE captures, useful for hedging decisions.
*Drill down:* IRRBB.

**Concentration (largest depositor)** - what share of deposits sits with the single largest
depositor. High concentration means the bank is exposed if that one depositor leaves.
*Drill down:* Concentration & Risk Monitoring.

**NPL (Non-Performing Loan) ratio / NIM (Net Interest Margin)** - asset quality and core earning
efficiency. *Drill down:* Profitability Ratios.

**In breach** - how many of the above have crossed their red threshold right now. *Drill down:*
Limits & Breaches (Section 9).

Every tile links straight to the screen that explains it further - click through rather than
guessing from the number alone.

---

## 9. FTP & Profitability, in plain terms

**Why does Treasury/Risk care about profitability?** Because a loan's headline interest rate
tells you almost nothing on its own - a 10% loan funded at 2% is a great trade, a 10% loan funded
at 9% barely breaks even, and neither the risk team nor the business unit can tell which from the
rate alone.

**How FTP connects the balance sheet to business profitability:** every position is priced
against an internal **transfer rate** (read from a yield curve, plus any named add-ons - see the
info button on the Funds Transfer Pricing screen) *in addition to* its customer rate. The
difference between the two is the margin genuinely attributable to the business unit that booked
it - separate from Treasury's own centrally-managed funding and liquidity cost. That's what turns
"we lent at 18%" into "we lent at 18% against a 12% internal cost of funds, so this desk actually
earned 6%."

**The flow:** Funds Transfer Pricing (margin by business unit, Treasury → FTP & Profitability) →
Profitability Ratios (net interest margin, NPL ratio, NPL coverage, non-earning assets - same
tab group). A position with no curve point to price against, or no external rate, shows as
*unpriced* rather than silently contributing zero margin - that's a data gap to fix (usually: load
the missing curve, or attach an FTP rule), not a real zero.

---

## 10. Limits, Thresholds, Breaches, Warnings, Escalation

- **Limit** - the boundary defined for one metric (e.g. LCR, NSFR, loan-to-deposit).
- **Threshold** - where along that limit the status changes. **Amber** is an early warning;
  **red** is a breach.
- **Regulatory minimum vs. internal appetite** - two different lines, kept deliberately separate.
  The regulatory minimum is not negotiable and is locked once seeded from the affiliate's
  regulator. Internal amber/red sit on top of it and are the bank's own, editable risk appetite -
  a metric can be within appetite and still breach the regulatory minimum, or the reverse, and the
  platform reports which.
- **Breach** - the metric has crossed red. It doesn't stop the bank operating, but it does require
  a recorded cause and a resolution action - a breach with no note attached isn't considered
  handled.
- **Escalation** - who gets told, and how urgently, once amber or red is hit. That routing is
  configured on Limits & Breaches itself.
- **KRI (Key Risk Indicator)** - the trend view of a limit's history over time, not just today's
  snapshot - "is this getting worse" as much as "is this bad right now." See Key Risk Indicators.

Where you manage this: **Risk Management → Concentration & Risk Monitoring → Limits & Breaches**
(ongoing) and onboarding Step 6 (setting a new affiliate's internal amber/red for the first time).

---

## 11. Terminology glossary

Short definitions only - click the (i) button next to a term in the platform for the fuller
version where one exists.

| Term | Plain-language meaning |
|---|---|
| **HQLA** | High-Quality Liquid Assets - assets the bank can convert to cash quickly and reliably, even under stress. The numerator of LCR. |
| **Haircut** | The discount applied to an asset's value to reflect that it might not sell for full price in a hurry. |
| **Repricing gap** | The mismatch between when a bank's assets and liabilities next reset their interest rate - the raw material behind IRRBB. |
| **Yield curve** | Interest rates plotted against how far in the future they apply - a snapshot of "the price of money" at every maturity. |
| **Basis risk** | The risk that two rates that are supposed to move together (e.g. a loan's rate and its funding rate) drift apart. |
| **Behavioural assumption** | A modelling rule for how customers *actually* behave, versus their contract's stated terms - e.g. a "30-day notice" savings account that in practice never gets fully withdrawn. |
| **Survival horizon** | See Section 8. |
| **Reconciliation** | See Section 6. |

---

## 12. Mapping to the demonstration agenda

| Agenda slot | Where it lives in the platform |
|---|---|
| Data, Product & Cash-Flow Management | Data Management (Sections 4–7) |
| Liquidity Risk Management | Risk Management → Liquidity Risk |
| IRRBB, Gap & Duration Analysis | Risk Management → IRRBB & Behavioural Risk |
| Behavioural Modelling & Assumptions | IRRBB & Behavioural Risk → Behavioural Analysis; Configuration → Business Rules |
| FTP & Profitability | Treasury → FTP & Profitability (Section 9) |
| Stress Testing, Scenario Analysis & Balance Sheet Forecasting | Risk Management → Stress Testing & Scenario Analysis |
| Limits, Reporting & Management Information | Concentration & Risk Monitoring; Reporting & ALCO |
| Group Aggregation, Regulatory & Architecture | Group & Affiliate Management; Reporting & ALCO → Regulatory Reporting; Administration & Governance |

The platform's navigation doesn't need to match this agenda line-for-line - the point is that
every agenda item has a real, working home to demonstrate from.

---

*This guide describes the platform as implemented. If a screen, field or behaviour described here
ever stops matching what's actually in the application, trust the application and treat this
guide as due for an update.*
