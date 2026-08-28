# ALM Executive Demonstration Coaching Guide

**Generated for:** Ascent ALM Platform  
**Target Audience:** Group Risk, Treasury, Balance Sheet Management, Finance, Technology, Information Security, Senior Executives  
**Demonstration Type:** Complete Platform Walkthrough  
**Estimated Duration:** 45-60 minutes

---

## Demonstration Story Flow

This demonstration follows the logical progression of a comprehensive ALM assessment:

**DATA** → Where does the data come from?  
**VALIDATION** → Can we trust the data?  
**PRODUCT BEHAVIOUR** → How does each product behave?  
**LIQUIDITY** → Do we have enough liquidity?  
**MATURITY** → When does cash come in and go out?  
**REPRICING** → When do interest rates reset?  
**BEHAVIOURAL MODELLING** → How realistic are contractual assumptions?  
**CONCENTRATION** → How dependent are we on particular funding sources?  
**LIMITS** → Are we within risk appetite?  
**STRESS** → What happens when conditions deteriorate?  
**PROFITABILITY** → How does risk translate into economics?  
**GROUP AGGREGATION** → How does management see the entire group?  
**GOVERNANCE** → Can we prove how every number was produced?

---

## READ THIS FIRST — Data Caveats for the Presenter

Every figure in this guide is a real, computed output of the actual calculation engine (`src/engine/*`) against the actual seeded demo data (`src/data/seed/nigeria.ts`), run through `executeRun` exactly as the application would — not an estimate or a plausible-looking placeholder. Ecobank Nigeria, as of 31 July 2026, is the scope used throughout unless stated otherwise, because it's the only affiliate with a full, clean position book today. Four things are worth knowing before you present:

1. **Nigeria is the only affiliate ready for a live walkthrough.** Ghana and Côte d'Ivoire exist in the platform but currently hold small, illustrative onboarding-stub datasets (five position rows each) rather than full books, and their liability figures carry a sign convention that doesn't net cleanly against Nigeria's. Switching to "Ecobank Group Consolidated" scope today produces nonsensical output — negative aggregate deposits, a null Liquidity Coverage Ratio and Net Stable Funding Ratio. **Do not run Group scope live.** Describe the aggregation mechanism narratively (Section 9 does this) and present it as a near-term data-completion item, not a working click-through, until Ghana and Côte d'Ivoire carry real books.
2. **This is a small, illustrative dataset (27 Nigeria positions), not a production-scale balance sheet.** Ratios and percentages (LCR, NSFR, NIM, sensitivities, concentration shares) are genuine and meaningful regardless of scale. Absolute currency amounts are not — treat them as illustrating the mechanism, not as claims about Ecobank Nigeria's real balance-sheet size.
3. **The "largest depositor" figure (52.9%) reflects a pooled retail counterparty bucket**, not one institutional client — the demo book only maps four counterparties in total, so top-five and top-ten concentration both read close to 100% mechanically. Real customer-level counterparty mapping would tell a very different story; say so if it comes up.
4. **The FX Net Open Position reads roughly 100% of capital and breaches the seeded 20% regulatory ceiling** — this is an artifact of Nigeria's book being entirely NGN-denominated against a USD reporting currency (a single-currency book's net open position is mathematically close to its own capital), not evidence of real currency mismanagement. Two other metrics — **core deposit share** and the **non-earning asset ratio** — currently have no configured limit in the seed data at all, so present them informationally rather than implying they're being graded against a governed threshold.

None of this should feel like a disclaimer wall — it's exactly the kind of precision (what's real, what's illustrative, what's a genuine gap) that the rest of this guide asks you to bring to every metric on screen. Use it to answer questions credibly rather than to avoid a screen.

---

## SCREEN 1 — Executive Dashboard

### 1. What you are looking at

The Executive Dashboard provides a single-run, single-number view of the institution's risk profile. Every metric displayed reads from the same selected run, ensuring consistency across all measures. This is the first screen senior executives see during ALCO meetings and daily risk monitoring.

### 2. What you say

"Welcome to the Executive Dashboard. This is your single source of truth for the institution's risk position. Every number you see here reads from the same run — the same as-of date, the same positions, the same assumptions. There's no reconciliation across different reports because everything is calculated from one consistent dataset.

Let me walk you through the four headline metrics that Treasury and Risk check first every morning. This is Ecobank Nigeria, as of 31 July 2026.

**First, the Liquidity Coverage Ratio.** This tells us whether we have enough high-quality liquid assets to survive a 30-day stress scenario. The Basel III minimum is 100%. We're currently at 168.9%, comfortably above both the regulatory minimum and our own internal target of 130% — this metric is Green on our own scale, not just technically compliant.

**Second, the Net Stable Funding Ratio.** This measures the stability of our funding over a one-year horizon. Again, 100% is the regulatory floor. We're at 103.6% — above the Basel floor, but inside our own internal amber band, which starts at 105%. That's a genuinely useful distinction: this run isn't in regulatory breach, but it is flagged for management attention before it drifts any closer to the floor.

**Third, the Survival Horizon.** This answers the question: if all funding ran off today, how many days could we operate on liquid assets alone? We're showing 13 days under our standard severe stress assumption — and that's inside our internal red band, which starts at 20 days. This is the one figure on this page that should make a Treasurer sit up; we'll come back to exactly what's driving it on the Stress Testing screen.

**Fourth, Loan-to-Deposit.** This is a classic funding metric — the ratio of customer loans to customer deposits. We're at 78.6%. Against the CBN's own floor for Nigeria, that's comfortably Green; against our own Group-wide ceiling of 85%, it sits in the amber band. Both readings matter, and the platform shows both rather than picking one.

What's powerful here is that these aren't isolated metrics. They're all calculated from the same positions, same assumptions, same run. Click any metric and you'll drill down to the detailed analysis screen."

### 3. Where to direct their eyes

1. **Run selector** (top right) — "This is the run picker. Every number below reads from this single run."
2. **Reporting scope** — "We're looking at [Group/Affiliate] level."
3. **As-of date** — "All positions are valued as of this date."
4. **LCR card** — "Liquidity Coverage Ratio, our 30-day stress buffer."
5. **NSFR card** — "Net Stable Funding Ratio, our one-year funding stability."
6. **Survival horizon card** — "Days of operation without new funding."
7. **Loan-to-deposit card** — "Classic funding ratio."
8. **Rate shock sensitivity chart** — "Capital impact under all six Basel shocks."
9. **Market & Rate Monitor** — "Current benchmarks and FX rates."
10. **Risk snapshot** — "Supporting metrics: NII, EVE, concentration, NPL."
11. **Active Breaches** — "Any limits currently breached."
12. **Balance sheet shape** — "Total assets, income, expense."

### 4. Metric-by-metric banking explanation

#### Liquidity Coverage Ratio (LCR)

**Displayed value:** 168.9% (Ecobank Nigeria, 31 July 2026 — Green against the 130%/115%/100% internal thresholds)  
**What it means in banking:** The Liquidity Coverage Ratio is a Basel III regulatory requirement that measures a bank's ability to survive a 30-day acute stress scenario. It compares high-quality liquid assets (HQLA) against net cash outflows over 30 days.

**Why Treasury/Risk cares:** This is the primary short-term liquidity metric. Falling below 100% triggers regulatory intervention and signals immediate funding stress. A buffer above 100% is prudent for operational resilience.

**How the application calculates it:**
```
LCR = (HQLA net of haircuts, unencumbered only) / (30-day net cash outflows)
Net cash outflows = Gross outflows - min(Gross inflows, 75% of outflows)
```

**Inputs:**
- Positions marked as HQLA with per-position haircut percentages
- Positions marked as 30-day outflows with per-position runoff rates
- Positions marked as inflows with per-position arrival rates
- Lien amounts on HQLA positions (encumbered portions are excluded)

**Assumptions:**
- Haircuts are per-position, set by Product Characteristics rules
- Runoff rates are per-position, not inferred from product names
- Inflows are capped at 75% of outflows (Basel III rule)
- Lien amounts reduce eligible HQLA dollar-for-dollar

**Interpretation of this result:** At 168.9%, Nigeria holds roughly 1.69 units of liquid assets for every unit of net cash outflow over 30 days. High-quality liquid assets total 348.1 (Level 1: 309.7, Level 2A: 38.4) against net cash outflows of 206.1 (gross outflows of 281.3 less inflows of 75.2, none of which needed capping — the 75% inflow cap would only bind at inflows above 210.97). A value this far above 100% means the position could absorb the prescribed 30-day stress without touching external funding at all.

**What can change it:**
- Changes in HQLA composition (more/less liquid assets)
- Changes in funding profile (more/less stable deposits)
- Changes in runoff rates (behavioural assumptions)
- Stress scenario adjustments (multipliers in What-If Builder)

#### Net Stable Funding Ratio (NSFR)

**Displayed value:** 103.6% (Ecobank Nigeria, 31 July 2026 — Amber: above the 100% Basel floor, below our 105% internal amber line)  
**What it means in banking:** The Net Stable Funding Ratio is a Basel III longer-term liquidity metric. It compares available stable funding (ASF) against required stable funding (RSF) over a one-year horizon, ensuring that asset maturities are matched with stable funding sources.

**Why Treasury/Risk cares:** This prevents maturity transformation mismatches that could create funding stress over the medium term. It's particularly important for balance sheet planning and funding strategy.

**How the application calculates it:**
```
NSFR = (Available Stable Funding) / (Required Stable Funding)
ASF = Σ(Liabilities × ASF factor) + Σ(Capital × ASF factor)
RSF = Σ(Assets × RSF factor)
```

**Inputs:**
- Per-position ASF factors for liabilities and capital
- Per-position RSF factors for assets
- All non-asset positions contribute to ASF
- All asset positions contribute to RSF

**Assumptions:**
- ASF and RSF factors are per-position, set by Product Characteristics
- Capital contributes to ASF at its own factor
- Stress scenarios can apply deposit attrition to liabilities

**Interpretation of this result:** Available stable funding of 918.7 against required stable funding of 886.5 gives 103.6% — a surplus of roughly 32 in absolute terms, or 3.6 percentage points of headroom above the requirement. That's real headroom above the Basel floor, but inside our own internal amber band (100–105%), which is exactly the kind of early-warning signal an internal threshold is meant to catch before a regulatory one would.

**What can change it:**
- Changes in asset composition (more/less long-term assets)
- Changes in funding composition (more/less stable funding)
- Changes in regulatory factors (updates to Product Characteristics)

#### Survival Horizon

**Displayed value:** 13 days (Ecobank Nigeria, 31 July 2026 — Red against our 30/25/20-day internal thresholds)  
**What it means in banking:** The survival horizon measures how many days the institution could continue operating if all funding sources ran off simultaneously, using only available liquid assets. It's a worst-case liquidity stress measure.

**Why Treasury/Risk cares:** This indicates the time available to arrange alternative funding or emergency liquidity assistance. A short horizon indicates vulnerability to sudden funding withdrawals.

**How the application calculates it:**
```
Survival days = (Total liquid assets) / (Daily cash outflow rate)
Daily cash outflow rate is derived from behavioural patterns and stress assumptions
```

**Inputs:**
- Total liquid assets (including HQLA and other liquid positions)
- Daily outflow rates from behavioural patterns
- Stress multipliers from scenario definitions

**Assumptions:**
- All funding runs off simultaneously (worst-case assumption)
- Liquid assets are used sequentially as needed
- No new funding arrives during the stress period

**Interpretation of this result:** Opening counterbalancing capacity is 348.1 (the unencumbered, haircut-net HQLA — there are no committed backup lines or other marketable assets loaded for this affiliate yet, so capacity is HQLA alone today). Against a stressed 30-day outflow of 562.6 (the default assumption: twice the 30-day gross LCR outflows, front-loaded 55% into the first 10 days), the buffer is exhausted on day 13. That's inside the internal red band and is the sharpest number on this dashboard — a genuine prompt to look at counterbalancing capacity and committed lines before assuming Nigeria's headline LCR tells the whole liquidity story.

**What can change it:**
- Changes in liquid asset holdings
- Changes in funding composition (more/less stable funding)
- Changes in behavioural assumptions (runoff rates)

#### Loan-to-Deposit Ratio

**Displayed value:** 78.6% (Ecobank Nigeria, 31 July 2026 — loans 709.7 / deposits 903.2)  
**What it means in banking:** The loan-to-deposit ratio measures the proportion of customer loans funded by customer deposits. It's a classic indicator of funding structure and liquidity pressure.

**Why Treasury/Risk cares:** A high ratio indicates heavy reliance on deposits to fund lending, creating potential liquidity pressure if deposits withdraw. It's a key monitoring metric for regulators and internal risk management.

**How the application calculates it:**
```
LDR = (Total customer loans) / (Total customer deposits)
```

**Inputs:**
- Customer loans (identified by account class "Customer" and product class matching "loans" or "trade finance")
- Customer deposits (identified by account class "Customer" and product class matching "deposits")
- Excludes interbank positions, internal accounts, suspense, nostro, vostro

**Assumptions:**
- Classification is based on account class, not product names
- Wholesale funding is excluded from both numerator and denominator
- Internal accounts are excluded to avoid double-counting

**Interpretation of this result:** At 78.6%, roughly 79 cents of every deposit dollar is deployed as a customer loan. Two limits actually apply here in the seed configuration: the Group-wide ceiling (green ≤75%, amber ≤85%, red ≤95%) grades this Amber; Nigeria's own CBN-floor limit (green ≥70%, amber ≥67%, red ≥65% — a floor, not a ceiling, because CBN sets a minimum loan-to-deposit ratio, not a maximum) grades the same 78.6% Green. Worth showing both badges if the screen surfaces them — it's a good example of one number meaning two different things to two different regulators.

**What can change it:**
- Changes in loan book growth
- Changes in deposit gathering
- Changes in interbank funding (which doesn't affect this ratio)

#### NII Sensitivity

**Displayed value:** −8.06% (Ecobank Nigeria, +200bp parallel shock, 365-day horizon — Amber against −5%/−8%/−12% internal thresholds)  
**What it means in banking:** Net Interest Income sensitivity measures the percentage change in net interest income resulting from a specified interest rate shock. It indicates earnings-at-risk from interest rate movements.

**Why Treasury/Risk cares:** This is the primary earnings-based IRRBB metric. It shows how rate changes affect the income statement, which is critical for earnings volatility management and budgeting.

**How the application calculates it:**
```
ΔNII = (Rate-sensitive assets - Rate-sensitive liabilities within horizon) × shock
NII sensitivity % = (ΔNII / Base NII) × 100
```

**Inputs:**
- Rate-sensitive assets repricing within the horizon
- Rate-sensitive liabilities repricing within the horizon
- Base net interest income
- Shock magnitude in basis points

**Assumptions:**
- Full, immediate repricing at the shocked rate (gap approximation)
- No rate caps or floors applied
- 100% deposit pass-through unless beta rules are configured
- Fixed-rate instruments reprice only at maturity

**Interpretation of this result:** Rate-sensitive assets repricing within a year total 419.4, against rate-sensitive liabilities of 1,000 — a repricing gap of −580.6. A +200bp move against that gap changes net interest income by −11.6 against a base NII of 144.0, i.e. −8.06%. Negative means Nigeria is liability-sensitive over this horizon: rates rising faster than the book can reprice its assets costs earnings, not helps them.

**What can change it:**
- Changes in repricing gap profile
- Changes in interest rate levels
- Changes in deposit beta assumptions
- Changes in shock magnitude

#### EVE Sensitivity

**Displayed value:** −13.81% of balance-sheet equity (Ecobank Nigeria, +200bp parallel shock — the worst of the six Basel scenarios; Amber against −8%/−12%/−15% internal thresholds, not a Basel outlier)  
**What it means in banking:** Economic Value of Equity sensitivity measures the percentage change in the economic value of equity resulting from a specified interest rate shock. It indicates capital-at-risk from interest rate movements over the full balance sheet duration.

**Why Treasury/Risk cares:** This is the primary economic value-based IRRBB metric. Basel III requires monitoring of EVE sensitivity, with a supervisory outlier test at ±15% of Tier 1 capital. It captures long-term economic value risk beyond the earnings horizon.

**How the application calculates it:**
```
Duration gap = D(assets) - (Liabilities/Assets) × D(liabilities)
ΔEVE = -Duration gap × Assets × Δr
EVE sensitivity % = (ΔEVE / Capital) × 100
```

**Inputs:**
- Asset duration (weighted average)
- Liability duration (weighted average)
- Total assets
- Total liabilities
- Capital (Tier 1 or balance-sheet equity)
- Shock magnitude in basis points

**Assumptions:**
- Duration is approximated per position, not from full cash flows
- Parallel shift assumption (no curve twisting)
- Linear price sensitivity (no convexity)
- Optionality not modelled

**Interpretation of this result:** Asset duration averages 1.48 years against liability duration of 0.66 years, giving a duration gap of +0.91 years — assets reprice more slowly than liabilities, so Nigeria is asset-sensitive on a value basis: a rate rise reduces economic value. Against total assets of 1,470.97, a +200bp shock produces a ΔEVE of −26.73, which is −13.81% of the 193.5 balance-sheet equity used as the capital basis here (no Tier 1 capital figure is loaded for this affiliate, so the run falls back to balance-sheet equity and says so in its methodology). That's inside the ±15% Basel outlier line, but only just — three points of headroom, worth watching rather than dismissing.

**What can change it:**
- Changes in duration profile
- Changes in capital levels
- Changes in shock magnitude
- Changes in balance sheet composition

#### Largest Depositor Concentration

**Displayed value:** 52.9% (Ecobank Nigeria, 31 July 2026 — Red against 5%/10%/15% internal thresholds)  
**What it means in banking:** Concentration measures the share of total deposits held by the largest single depositor. High concentration creates funding vulnerability if that depositor withdraws.

**Why Treasury/Risk cares:** Concentration risk is a key concern for both regulators and internal risk management. Over-reliance on a few large depositors creates liquidity and reputational risk.

**How the application calculates it:**
```
Largest share % = (Largest depositor balance / Total deposits) × 100
```

**Inputs:**
- Individual depositor balances
- Counterparty mappings
- Total deposits

**Assumptions:**
- Counterparty mapping is required for accurate measurement
- Unattributed deposits are reported separately
- Measurement is at the selected scope (Group or affiliate)

**Interpretation of this result:** The largest counterparty on Nigeria's deposit book is CP-NG-RETAIL-POOL at 52.9% of total deposits — well above the 15% internal red line. Read this one carefully in the room: in this demo dataset, retail deposits are booked to a single pooled counterparty code rather than individual customer-level counterparty mappings, so this figure overstates true single-name concentration. It's a genuinely useful moment to show *why* counterparty mapping quality matters — a real book with customer-level mapping would break this pool into thousands of individual depositors and the true largest-single-name number would look very different. With only four counterparties in the book, top-five and top-ten shares both round to 100% for the same reason — small counterparty count, not real-world concentration.

**What can change it:**
- Changes in depositor balances
- Changes in counterparty mappings
- New large depositors or withdrawals

#### NPL Ratio

**Displayed value:** 0.0% (Ecobank Nigeria, 31 July 2026 — Green; no positions currently classified Substandard, Doubtful or Loss)  
**What it means in banking:** The Non-Performing Loan ratio measures the proportion of the loan book that is classified as non-performing (typically Substandard, Doubtful, or Loss under CBN classification). It's a key asset quality indicator.

**Why Treasury/Risk cares:** High NPL ratios indicate credit deterioration and potential provisioning needs. Regulators set thresholds (typically 5% in many jurisdictions) beyond which intervention may occur.

**How the application calculates it:**
```
NPL ratio = (Non-performing loans / Total loans) × 100
```

**Inputs:**
- Loan balances classified as Substandard, Doubtful, or Loss
- Total loan portfolio balance

**Assumptions:**
- Classification follows CBN standards (Substandard, Doubtful, Loss)
- Classification is per-position, not inferred
- Only customer loans are included (not interbank)

**Interpretation of this result:** None of Nigeria's 27 seeded positions currently carry a Substandard, Doubtful or Loss classification, so the ratio reads a clean 0.0% — Green against the 3%/5%/8% internal thresholds. Worth being upfront that this is a small, clean illustrative book rather than a claim that Ecobank Nigeria's real portfolio has zero NPLs; the engine test suite deliberately reclassifies a position to Doubtful to prove the ratio and coverage calculation respond correctly (see `computeProfitability` in `src/engine/profitability.ts`), which is a good thing to demonstrate live if credit quality comes up.

**What can change it:**
- Changes in loan classifications
- New NPLs or recoveries
- Changes in total loan book

#### Net Interest Margin

**Displayed value:** 9.79% (Ecobank Nigeria, 31 July 2026 — interest income 230.1 less interest expense 86.0, over total assets 1,471.0)  
**What it means in banking:** Net Interest Margin measures the difference between interest income generated and interest paid, expressed as a percentage of interest-earning assets. It's a key profitability metric for banks.

**Why Treasury/Risk cares:** NIM indicates the spread earned on the interest-earning asset portfolio. It's a primary driver of bank profitability and is closely monitored by both management and investors.

**How the application calculates it:**
```
NIM = (Interest income - Interest expense) / Total assets × 100
```

**Inputs:**
- Interest income from assets
- Interest expense from liabilities
- Total assets

**Assumptions:**
- Calculated from position balances and rates
- No allocation of non-interest expenses
- All assets are included in the denominator

**Interpretation of this result:** At 9.79%, Nigeria earns roughly 9.8 cents on every dollar of assets from the interest spread after funding costs — a healthy margin, consistent with a book weighted toward higher-yielding Naira corporate and retail lending funded by relatively low-cost deposits. This is a ratio, so it holds regardless of the book's absolute scale.

**What can change it:**
- Changes in interest rate environment
- Changes in asset/liability mix
- Changes in funding costs
- Changes in loan pricing

### LIVE SCRIPT

"Let me show you how this works in practice. I'll select our most recent run, and you'll see all these metrics update instantly. This isn't a dashboard of separate reports — it's one consistent calculation engine.

If I click on the Liquidity Coverage Ratio, we drill straight into the detailed liquidity analysis. Every number is traceable back to the underlying positions and assumptions. That's what makes this defensible when the regulators ask 'how did you arrive at this figure?'"

### COACHING / TECHNICAL DETAIL

**Run-based architecture:** All metrics read from a single run, ensuring consistency. This is the "results read from a run" invariant — results screens never recompute live, they always read from a stored run. This makes figures defensible months later.

**Scope isolation:** The same calculation can be run at Group level or individual affiliate level. The scope selector at the top changes which positions are included, but the calculation logic remains identical.

**Currency conversion:** All calculations are performed in the reporting currency, with FX conversion applied at the position level using the FX rates as of the run date.

**Versioned assumptions:** Time bucket rules, behaviour patterns, and other assumptions are versioned and attached to each run. Changing a rule doesn't affect historical runs — it only applies to future runs.

### IF THEY ASK

**Q: How do you ensure data quality?**  
A: The platform includes GL reconciliation screens that compare position totals against General Ledger balances. Data vintages track load history, and validation rules can be configured to flag data quality issues before calculations run.

**Q: Can we see historical trends?**  
A: Yes, the dashboard shows trend lines where historical data exists. Each run is stored indefinitely, so you can compare current performance against any historical period.

**Q: How does this handle multi-currency?**  
A: FX conversion is applied at the position level using rates as of the run date. All calculations are performed in the reporting currency, but you can also view FX position analysis to understand cross-currency exposures.

---

## SCREEN 2 — Liquidity Risk

### 1. What you are looking at

The Liquidity Risk screen provides detailed analysis of liquidity positions, including coverage ratios, maturity gap analysis, and funding concentration. This is where Treasury and Risk teams drill down when the dashboard metrics indicate potential issues.

### 2. What you say

"Now let's dive deeper into liquidity. This screen gives us the full picture of our liquidity position — not just the headline ratios, but the underlying gap analysis and funding concentration.

**First, the coverage ratios.** You can see the Liquidity Coverage Ratio broken down into its components: high-quality liquid assets by level, gross outflows, gross inflows, and the net cash outflows after the 75% inflow cap. This transparency lets us understand exactly what's driving the ratio.

Below that, the Net Stable Funding Ratio shows available stable funding versus required stable funding. The surplus tells us how much stable funding we have in excess of requirements.

**Next, the maturity gap analysis.** This chart shows assets versus liabilities by maturity bucket. The blue bars are assets, the gray bars are liabilities, and the green bars show the net gap. A positive gap means we have more assets maturing than liabilities in that bucket — that's cash coming in. A negative gap means more liabilities maturing — that's cash going out.

I can toggle between Behavioural and Contractual views. The Contractual view shows when cash actually moves based on contract terms. The Behavioural view applies our run-off assumptions to non-maturity deposits, which is more realistic for liquidity planning.

**Third, funding concentration.** This section shows how our deposits are distributed across counterparties. The Herfindahl index gives us a single concentration measure — below 1500 is diversified, 1500-2500 is moderately concentrated, above 2500 is highly concentrated.

**Finally, cross-currency funding position.** This shows our assets and liabilities by settlement currency, highlighting any currency mismatches that could create FX liquidity risk."

### 3. Where to direct their eyes

1. **LCR section** — "Coverage ratio with full component breakdown"
2. **HQLA by level** — "Level 1, Level 2A, Level 2B assets"
3. **30-day outflows breakdown** — "Gross outflows, inflows, net after cap"
4. **NSFR section** — "Available vs required stable funding"
5. **Maturity gap chart** — "Assets vs liabilities by time bucket"
6. **Behavioural/Contractual toggle** — "Switch between contractual and behavioural views"
7. **Gap ladder table** — "The same data as numbers, not just a chart"
8. **Deposit concentration by affiliate** — "Funding diversification across group"
9. **Cross-currency funding position** — "FX liquidity risk"
10. **Deposit core and volatile split** — "Behavioural modelling of NMDs"

### 4. Metric-by-metric banking explanation

#### Maturity Gap Analysis

**Displayed value:** Contractual — widest negative gap in the 8–30 Day bucket: assets 208.4 vs liabilities 980.6, a gap of −772.3. Behavioural — the same bucket narrows to assets 208.4 vs liabilities 370.0, a gap of −161.6 (Ecobank Nigeria, 31 July 2026).  
**What it means in banking:** Maturity gap analysis measures the timing difference between asset maturities and liability maturities. It identifies when cash inflows and outflows occur, highlighting potential liquidity gaps or surpluses in different time periods.

**Why Treasury/Risk cares:** This is the primary tool for liquidity planning. It shows when the institution will need to refinance maturing liabilities and when cash will be available from maturing assets. Negative gaps indicate funding pressure; positive gaps indicate liquidity surpluses.

**How the application calculates it:**
```
For each time bucket:
  Bucket assets = Σ(Assets maturing in bucket)
  Bucket liabilities = Σ(Liabilities maturing in bucket)
  Bucket gap = Bucket assets - Bucket liabilities
  Cumulative gap = Running sum of bucket gaps
```

**Inputs:**
- Position maturity dates
- Time bucket definitions (from Time Bucket rule)
- Position amounts (converted to reporting currency)

**Assumptions:**
- Bucket definitions are configurable via Time Bucket rules
- Contractual maturity is used unless behavioural view is selected
- All positions are included (assets, liabilities, capital)

**Interpretation of this result:** On the contractual ladder, the 8–30 Day bucket carries the widest negative gap at −772.3 — the point of maximum contractual cash-flow pressure. The cumulative gap runs negative through most of the ladder before closing to zero at the final bucket, which is the expected identity check: total assets must equal total liabilities plus capital across the full horizon.

**What can change it:**
- Changes in maturity profile (new business, maturities)
- Changes in time bucket definitions
- Switching between contractual and behavioural views

#### Behavioural vs Contractual Gap

**What it means in banking:** Contractual gap uses actual contract maturity dates. Behavioural gap applies run-off assumptions to non-maturity deposits (like savings accounts) that don't have fixed maturities but do exhibit predictable withdrawal patterns.

**Why Treasury/Risk cares:** Contractual gap is legally accurate but operationally unrealistic for NMDs. Behavioural gap provides a more realistic view of actual liquidity needs by accounting for deposit stickiness.

**How the application calculates it:**
```
Contractual: Use actual maturity date for all positions
Behavioural: Apply run-off patterns to NMDs based on behavioural tags
```

**Inputs:**
- Contractual maturity dates
- Behavioural pattern rules
- Behavioural tags on positions
- Account activity (turnover) for core/volatile adjustments

**Assumptions:**
- Behavioural patterns are defined per tag/tenor
- Core/volatile split is adjusted by account activity
- Unmodelled positions are reported separately, not defaulted

**Interpretation of this result:** In the 8–30 Day bucket, the contractual gap of −772.3 narrows to −161.6 under the behavioural view — a reduction of roughly 79%. That's the behavioural pattern re-dating non-maturity deposits out of the front bucket according to how sticky each tag actually is, rather than assuming every non-maturity balance could contractually leave tomorrow. It's the single clearest illustration of why behavioural modelling matters for liquidity planning: the contractual view alone would overstate near-term funding pressure by roughly four times.

**What can change it:**
- Changes in behavioural pattern rules
- Changes in behavioural tag assignments
- Changes in account activity data

#### Deposit Core and Volatile Split

**Displayed value:** Core 866,000 / Volatile 404,000 of 1,270,000 total modelled deposits — 68.2% core (Ecobank Nigeria, 31 July 2026, local currency)  
**What it means in banking:** Non-maturity deposits are split into core (stable, unlikely to withdraw) and volatile (likely to withdraw under stress) portions. This split is critical for realistic liquidity modelling.

**Why Treasury/Risk cares:** Assuming all deposits are volatile overstates liquidity needs. Assuming all are core understates risk. The core/volatile split provides a realistic middle ground based on historical behaviour patterns.

**How the application calculates it:**
```
Core = Balance × Core% from behavioural pattern
Volatile = Balance × Volatile% from behavioural pattern
Core% is adjusted by account activity (dormant accounts are stickier)
```

**Inputs:**
- Deposit balances
- Behavioural pattern rules (core% by tenor)
- Behavioural tags on positions
- Account activity/turnover data

**Assumptions:**
- Core% varies by tenor (shorter tenor = more volatile)
- Activity uplifts are applied: dormant accounts get +core% uplift
- Unmodelled tags are reported separately, not defaulted

**Interpretation of this result:** Across the four tagged deposit lines, core percentage ranges from 95% on Retail — Core deposits (Active usage) down to 15% on Corporate — Non-Operational balances (also Active usage) — a deliberate, realistic spread rather than one blanket assumption. Retail Non-Core deposits sit at 67.5% core, boosted from their base pattern by a Dormant-activity uplift. Blended across all four, the book is 68.2% core, which is the figure that feeds the behavioural liquidity gap and survival horizon.

**What can change it:**
- Changes in behavioural pattern rules
- Changes in account activity
- Changes in behavioural tag assignments

#### Cross-Currency Funding Position

**Displayed value:** NGN — assets 1,470.97 / liabilities 1,277.42 / net open position 193.55 (100% of the 193.55 balance-sheet equity used as the capital basis) (Ecobank Nigeria, 31 July 2026, reporting currency USD)  
**What it means in banking:** Cross-currency funding position shows assets and liabilities denominated in each currency, highlighting currency mismatches that could create FX liquidity risk.

**Why Treasury/Risk cares:** Currency mismatches can create liquidity risk even when the overall position is balanced in the reporting currency. A funding need in one currency may not be easily met using liquidity in another currency.

**How the application calculates it:**
```
For each currency:
  Currency assets = Σ(Assets in that currency)
  Currency liabilities = Σ(Liabilities in that currency)
  Net position = Currency assets - Currency liabilities
  Net % of capital = Net position / Capital
```

**Inputs:**
- Position amounts by currency
- FX rates for conversion to reporting currency
- Capital in reporting currency

**Assumptions:**
- Conversion uses FX rates as of the run date
- Aggregate uses absolute values (conservative measure)
- Reporting currency positions are excluded from aggregate

**Interpretation of this result:** Worth a careful, honest read here: Nigeria's seeded book is entirely NGN-denominated, with USD as the reporting currency. Because assets minus liabilities always equals capital by construction, a single-currency book's net open position in that currency equals capital almost exactly — which is exactly what shows up here (193.55 net position against 193.55 equity, ≈100%). That crosses the seeded 20% regulatory ceiling on aggregate FX net open position, which would flag as a Critical breach on the Limits screen. That is a genuine artifact of this being a single-currency demo book, not evidence of real cross-currency mismanagement — a real multi-currency Nigeria book (NGN core book plus USD trade-finance and Eurobond lines, say) would show a materially different, two-way position. Flag this proactively if a Treasury stakeholder notices the 100% figure, rather than let it sit unexplained.

**What can change it:**
- Changes in currency mix of assets/liabilities
- Changes in FX rates
- Changes in capital levels

### LIVE SCRIPT

"The power here is the integration. The LCR calculation uses the same gap analysis you see in the chart. The behavioural assumptions that drive the gap view are the same ones used in the NSFR calculation. Everything is consistent.

If I click on 'Configure Rules', I can see the Time Bucket rules that define these buckets, the Behavioural Pattern rules that drive the core/volatile split, and the Product Characteristics that define HQLA levels and runoff rates. All of these are versioned and governed — I can change them, but that change only applies to future runs, not to the historical run we're looking at now."

### COACHING / TECHNICAL DETAIL

**Bucket governance:** Time bucket definitions are governed by rules, not hardcoded. This means each affiliate can have different bucket structures if needed, and changes are versioned and auditable.

**Behavioural pattern application:** Patterns are applied based on behavioural tags assigned to positions. The same tag can have different patterns in different rules, and the rule attached to the run determines which pattern is used.

**Unmodelled position handling:** Positions with behavioural tags that have no matching pattern are reported as unmodelled rather than being defaulted. This prevents silent misapplication of assumptions.

**FX conversion methodology:** All conversions use FX rates as of the run date, ensuring consistency with the run's as-of date. The aggregate FX position uses absolute values (the conservative measure) rather than netting long against short.

### IF THEY ASK

**Q: How do you validate the behavioural assumptions?**  
A: Behavioural patterns are configurable and can be calibrated against historical run-off data. The platform shows which patterns were applied to each run, so you can trace back to the exact assumptions used.

**Q: Can we run what-if scenarios on liquidity?**  
A: Yes, the What-If Builder allows you to apply stress multipliers to runoff rates, HQLA haircuts, and inflow suppression. You can test how the LCR and NSFR would change under different stress scenarios.

**Q: How does this handle intraday liquidity?**  
A: The current implementation focuses on end-of-day positions. Intraday liquidity can be modelled by creating time buckets with intraday boundaries and loading intraday position data if available.

---

## SCREEN 3 — Maturity & Repricing Gap

### 1. What you are looking at

The Maturity & Repricing Gap screen provides two complementary views of the balance sheet: when cash actually moves (maturity gap) and when interest rates reset (repricing gap). This dual view is essential for understanding both liquidity and interest rate risk.

### 2. What you say

"This screen answers two fundamental questions: when does cash arrive, and when do rates reset?

**The maturity gap** shows the timing of actual cash flows based on contract terms. This is what we use for liquidity planning — when we'll receive cash from maturing assets and when we'll need to pay maturing liabilities.

**The repricing gap** shows when interest rates reset on our positions. This is what we use for interest rate risk management — when our assets will reprice at new rates and when our funding costs will change.

The key insight is that these two ladders are often different. A floating-rate loan reprices every time the reference rate changes, but it only matures at its contractual maturity date. The difference between the two ladders tells us about our floating-rate book.

I can toggle between the two views. It's worth noticing that these aren't the same ladder read two ways — they're genuinely two different bucket structures. The liquidity ladder breaks the near term into Overnight, 2–7 Days and 8–30 Days; the repricing ladder groups the same window into a single 0–30 Days bucket, because what matters for rate risk is coarser than what matters for cash-flow timing. When I switch to repricing gap, you'll also notice a 'Non-Rate-Sensitive' bucket appears. This captures equity and fixed assets that don't reprice at all — they're routed to their own bucket rather than folded into a tenor bucket, which would understate the true gap.

Comparing the two tables side by side for Nigeria: the contractual liquidity gap in the 8–30 Day bucket is −772.3, while the repricing gap in the roughly equivalent 0–30 Day bucket is −733.5 — close, but not identical. That gap between the two numbers is exactly the floating-rate book made visible: positions whose contractual maturity and next repricing date fall in different places."

### 3. Where to direct their eyes

1. **Maturity/Repricing toggle** — "Switch between cash flow timing and rate reset timing"
2. **Gap chart** — "Assets vs liabilities by time bucket"
3. **Non-rate-sensitive bucket note** — "Appears in repricing view for non-repricing positions"
4. **Gap ladder table** — "The detailed numbers behind the chart"
5. **Bucket rule applied** — "Shows which time bucket rule governs this run"

### 4. Metric-by-metric banking explanation

#### Repricing Gap vs Maturity Gap

**What it means in banking:** Maturity gap is based on when contracts actually end — when principal is repaid. Repricing gap is based on when interest rates reset — when the interest rate on a position can change.

**Why Treasury/Risk cares:** Maturity gap drives liquidity planning (cash flow timing). Repricing gap drives interest rate risk management (earnings sensitivity). The difference between them indicates the size of the floating-rate book.

**How the application calculates it:**
```
Maturity gap: Bucket by actual maturity date
Repricing gap: Bucket by next repricing date, fallback to maturity for fixed-rate
```

**Inputs:**
- Maturity dates for all positions
- Next repricing dates for floating-rate positions
- Rate sensitivity flags (IRRBB rate sensitive field)
- Time bucket definitions

**Assumptions:**
- Fixed-rate instruments reprice only at maturity
- Floating-rate instruments reprice at next repricing date
- Non-rate-sensitive positions are routed to separate bucket
- Bucket definitions are configurable

**Interpretation of this result:** For Nigeria, the front-bucket comparison runs −772.3 (contractual, 8–30 Days) versus −733.5 (repricing, 0–30 Days) — a gap of roughly 38.7. That's a modest floating-rate book relative to the size of the front bucket itself, but it's exactly the kind of number that grows when a bank writes more floating-rate corporate lending: the contractual and repricing ladders would diverge further apart.

**What can change it:**
- Changes in mix of fixed vs floating rate assets/liabilities
- Changes in repricing frequency (e.g., quarterly vs monthly resets)
- Changes in time bucket definitions

#### Cumulative Gap

**Displayed value:** Contractual liquidity ladder — deepens to −772.3 by the 8–30 Day bucket, recovers steadily through later buckets, and closes to (effectively) zero at 5Y+ (Ecobank Nigeria, 31 July 2026)  
**What it means in banking:** Cumulative gap shows the running net position across all time buckets. It indicates whether the institution has a net asset or liability position when considering all time buckets up to each point.

**Why Treasury/Risk cares:** Cumulative gap shows the overall balance sheet structure. A consistently negative cumulative gap indicates a liability-sensitive position (vulnerable to rising rates in the long term). A consistently positive cumulative gap indicates an asset-sensitive position.

**How the application calculates it:**
```
Cumulative gap at bucket N = Σ(Gap for buckets 1 to N)
```

**Inputs:**
- Individual bucket gaps from gap analysis
- Time bucket ordering

**Assumptions:**
- Time buckets are ordered from shortest to longest tenor
- All positions are included in the cumulative

**Interpretation of this result:** Nigeria's cumulative gap is negative from the 8–30 Day bucket onward, meaning that up to any point through the medium term, more has matured on the liability side than the asset side — a liability-sensitive shape in cash-flow terms. It closes to zero at the final bucket, confirming assets equal liabilities plus capital across the full horizon, exactly as the identity requires.

**What can change it:**
- Changes in individual bucket gaps
- Changes in time bucket definitions
- Changes in balance sheet composition

#### Widest Negative Bucket

**Displayed value:** 8–30 Days, gap −772.3 (contractual); 8–30 Days, gap −161.6 (behavioural) (Ecobank Nigeria, 31 July 2026)  
**What it means in banking:** The widest negative bucket identifies the time period with the largest net cash outflow or funding requirement. This is the point of maximum liquidity pressure.

**Why Treasury/Risk cares:** Identifying the point of maximum pressure allows Treasury to plan funding actions in advance. If the widest negative bucket is in the 1-3 month range, near-term funding needs to be arranged.

**How the application calculates it:**
```
Widest negative bucket = min(Bucket gaps, where gap < 0)
```

**Inputs:**
- Individual bucket gaps
- Bucket labels

**Assumptions:**
- Only negative gaps are considered
- Gap is measured in absolute terms

**Interpretation of this result:** Both views agree on where the pressure sits — the 8–30 Day bucket — but disagree sharply on how large it is: −772.3 contractual versus −161.6 behavioural. Treasury should plan funding actions around the behavioural figure (it's the more realistic view of what will actually happen) while keeping the contractual figure on hand as the legally-accurate worst case if every non-maturity deposit genuinely walked.

**What can change it:**
- Changes in maturity profile
- Changes in time bucket definitions
- Changes in behavioural assumptions (for behavioural gap)

### LIVE SCRIPT

"Compare the front buckets on the two tables: −772.3 on the contractual liquidity ladder against −733.5 on the repricing ladder. That roughly 38.7 difference is our floating-rate book made visible — positions that will reprice long before they mature.

This is important because floating-rate positions create earnings volatility even when they don't create immediate liquidity needs. A floating-rate loan might not mature for five years, but its rate could reset next month, affecting earnings immediately.

The bucket rule shown at the bottom tells us exactly which time bucket definition was used for this run. This is versioned and governed — if we change the bucket definition in the future, it won't affect this historical run. That's what makes the figures defensible."

### COACHING / TECHNICAL DETAIL

**Rate sensitivity flagging:** Positions are flagged as rate-sensitive or not via the IRRBB rate sensitive field. Non-rate-sensitive positions (like equity, fixed assets) are routed to a separate bucket rather than being dropped, which prevents understatement of the gap.

**Repricing date fallback:** For fixed-rate instruments, the next repricing date falls back to the maturity date, since fixed-rate instruments only reprice when they mature. This is the standard banking convention.

**Bucket rule versioning:** Time bucket rules are versioned and attached to runs. This ensures that historical runs always use the bucket definition that was current at the time, providing consistency and auditability.

**Gap approximation method:** The repricing gap uses the standard gap approximation method, which assumes full, immediate repricing at the shocked rate. This is the same method used by most banking systems for IRRBB analysis.

### IF THEY ASK

**Q: Why do you use the gap approximation instead of full cash flow analysis?**  
A: The gap approximation is the industry standard for IRRBB analysis when full cash flow data is not available at ledger grain. Oracle and other major systems prescribe the same method for this data shape. Full cash flow analysis would require contract-level cash flow schedules that are typically not available in general ledger systems.

**Q: Can we see the duration gap here?**  
A: Duration gap is shown on the IRRBB screen along with EVE sensitivity. The repricing gap on this screen is more focused on earnings sensitivity (NII), while duration gap is focused on economic value sensitivity (EVE).

**Q: How do you handle prepayments?**  
A: Prepayments can be modelled through behavioural patterns and prepayment rules. The behavioural view applies run-off assumptions that can incorporate prepayment behaviour for loan portfolios.

---

## SCREEN 4 — Behavioural Analysis

### 1. What you are looking at

The Behavioural Analysis screen shows how non-maturity deposits are modelled as core and volatile, the behavioural patterns applied, and the activity adjustments that refine the core/volatile split. This is critical for realistic liquidity and interest rate risk measurement.

### 2. What you say

"Non-maturity deposits like savings accounts don't have fixed maturities, but they do exhibit predictable behaviour. This screen shows how we model that behaviour.

**First, the core share.** This tells us what percentage of our deposits are considered stable (core) versus likely to withdraw under stress (volatile). We're at 68.2% for Nigeria — there's no configured warning threshold on this metric yet in the seed data, so I'd treat 68.2% on its own merits: comfortably majority-core, with real dispersion underneath it worth showing next.

**The balance vs volatile chart** shows the split by behavioural tag. You can see which product types are most stable and which are most volatile. I can group this by tag, by product, or by activity to see different perspectives. On Nigeria's book, Retail Core deposits sit at 95% core, Corporate Operational balances at 85%, Retail Non-Core at 67.5%, and Corporate Non-Operational balances at just 15% — that spread is the whole point of tagging deposits by behaviour rather than assuming one number for the whole book.

**The activity adjustment section** is particularly important. We use account turnover data to refine the core/volatile split. An account with zero movement in the period is classified Dormant and has its *volatile* share cut in half; low-turnover accounts are classified Low and have their volatile share cut by a quarter; a normally active account gets no adjustment at all — activity only ever pulls balance toward core, it never pushes an active account to be treated as more volatile than its product-level pattern already assumes.

**The patterns section** shows exactly which behavioural patterns were applied to this run. Each pattern specifies the core/volatile split by tenor. For example, a pattern might say '80% core at 30 days, 60% core at 90 days, 40% core at 1 year' — reflecting that deposits become less stable the further out you look.

**If we want to recalibrate**, we edit the behaviour pattern rule and re-run. We don't have a slider here because changing the split changes the behavioural gap ladder, the survival horizon, and the NSFR all together. Making it a rule change rather than an ad-hoc adjustment ensures that the figures remain defensible and auditable."

### 3. Where to direct their eyes

1. **Core share metric** — "Overall stability of deposit base"
2. **Total deposits modelled** — "Scope of behavioural modelling"
3. **Unmodelled warning** — "Positions with tags but no matching pattern"
4. **Balance vs volatile chart** — "Visual split by grouping dimension"
5. **Grouping toggle** — "Tag/Product/Activity views"
6. **Split table** — "Detailed numbers by grouping"
7. **Activity adjustment section** — "Core uplifts by activity level"
8. **Patterns applied** — "Exact patterns used in this run"
9. **Recalibration section** — "How to adjust assumptions"
10. **Methodology note** — "Calculation approach"

### 4. Metric-by-metric banking explanation

#### Core Share

**Displayed value:** 68.2% (Ecobank Nigeria, 31 July 2026 — core 866,000 / volatile 404,000 of 1,270,000 total modelled deposits, local currency; no core-share limit is configured in the seed data today, so this reads as an informational figure rather than a graded one)  
**What it means in banking:** Core share is the percentage of non-maturity deposits considered stable (core) versus likely to withdraw under stress (volatile). It's a key assumption in liquidity modelling.

**Why Treasury/Risk cares:** Higher core share indicates more stable funding, reducing liquidity pressure. Lower core share indicates more volatile funding, requiring higher liquidity buffers. This directly impacts LCR, NSFR, and survival horizon calculations.

**How the application calculates it:**
```
Core share = (Total core amount / Total deposits modelled) × 100
Volatile share (pattern) = Σ(pattern tiers tagged Volatile)
Volatile share (adjusted) = Volatile share (pattern) × (1 − activity uplift)
Core share = 100% − Volatile share (adjusted)
```

**Inputs:**
- Deposit balances
- Behavioural pattern rules (core%/volatile% by tenor tier)
- Behavioural tags on positions
- Account activity levels (from turnover data)
- Activity uplift factors

**Assumptions:**
- The volatile share from the pattern is reduced by the activity uplift — activity only ever pulls balance toward core, never the reverse
- Core% is the stable portion, volatile% = 100% − core%
- No turnover data means Unknown activity and no adjustment at all

**Interpretation of this result:** At 68.2%, just over two-thirds of Nigeria's modelled non-maturity deposits are treated as stable. That headline number hides real dispersion — from 95% core on Retail Core deposits down to 15% core on Corporate Non-Operational balances — which is exactly why the tag-level and activity-level breakdowns matter more than the single blended figure.

**What can change it:**
- Changes in behavioural pattern rules
- Changes in account activity
- Changes in behavioural tag assignments
- Changes in deposit mix (more/less stable products)

#### Activity Uplift

**What it means in banking:** Activity uplift adjusts the core/volatile split based on account usage patterns. Dormant accounts (no recent activity) are considered stickier than active accounts, so a larger share of their balance is treated as core than the product-level pattern alone would assume.

**Why Treasury/Risk cares:** Account activity is a leading indicator of deposit behaviour. A customer who hasn't touched their account in months is less likely to withdraw than one who transacts daily. Incorporating this data improves behavioural modelling accuracy without requiring a separate pattern per activity level.

**How the application calculates it:**
```
Adjusted volatile% = Pattern volatile% × (1 − activity uplift)
Adjusted core% = 100% − Adjusted volatile%
Activity uplift by level:
  - Dormant (zero movement in the period): 50% cut to the volatile share
  - Low (movement under 2% of balance): 25% cut to the volatile share
  - Active (movement at or above 2% of balance): no adjustment
  - Unknown (no turnover data loaded): no adjustment
```

**Inputs:**
- Pattern volatile% by tenor tier
- Account activity/turnover data (monthly credit and debit movement)
- Activity level classification, derived from that turnover
- Uplift factors by activity level

**Assumptions:**
- There are four activity levels, not a finer scale — Active and Unknown both receive no adjustment, so the uplift only ever moves balance toward core, never away from it
- No turnover data = Unknown activity = no adjustment, rather than a guess
- Uplift factors (50% / 25% / 0% / 0%) are fixed in the engine today, not yet exposed as a configurable rule

**Interpretation of this result:** On Nigeria's book, the clearest example is the Retail Non-Core deposit line: its pattern alone implies 32.5% volatile, but the account is classified Dormant, cutting that volatile share in half to 16.25% — landing the line at 67.5% core rather than the pattern's unadjusted figure. That's activity data doing real work, not a cosmetic adjustment.

**What can change it:**
- Changes in account activity data
- Changes in activity level classifications
- Changes in uplift factors
- Changes in behavioural pattern base core%

#### Behavioural Pattern Tenor Splits

**What it means in banking:** Behavioural patterns specify how core/volatile splits vary by time horizon. Deposits are typically more stable in the near term (higher core%) and less stable in the longer term (lower core%).

**Why Treasury/Risk cares:** The tenor structure of behavioural patterns captures the reality that deposit behaviour changes over time. A customer might not withdraw tomorrow, but might withdraw over the next year. Different tenor points allow the model to reflect this.

**How the application calculates it:**
```
For each tenor point:
  Core% at tenor = Pattern-specified core% for that tenor
  Volatile% at tenor = 100% - Core% at tenor
```

**Inputs:**
- Behavioural pattern definitions
- Tenor points (e.g., 30 days, 90 days, 1 year, 5 years)
- Core% at each tenor

**Assumptions:**
- Core% declines as tenor increases (standard pattern)
- Patterns are defined per behavioural tag
- Interpolation may be used between defined tenor points

**Interpretation of this result:** The pattern structure shows how deposit stability is expected to change over time. A steep decline in core% over tenor indicates deposits become less stable over longer horizons.

**What can change it:**
- Changes in behavioural pattern definitions
- Calibration against historical run-off data
- Changes in deposit product mix

### LIVE SCRIPT

"The key insight here is that behavioural modelling isn't guesswork — it's based on rules that can be calibrated against historical data. The patterns shown here are the exact patterns applied to this run. If we calibrate them differently in the future, that change won't affect this historical run.

The activity adjustment is particularly powerful. By using actual turnover data, we can refine our assumptions based on real account behaviour rather than generic product-level assumptions.

And notice the unmodelled warning if it appears. This tells us that some positions have behavioural tags but no matching pattern. Rather than defaulting them to some assumption, we report them separately. This prevents silent misapplication of assumptions and ensures data quality issues are visible."

### COACHING / TECHNICAL DETAIL

**Tag-based pattern application:** Patterns are applied based on behavioural tags assigned to positions. This allows fine-grained control — different products can have different behavioural characteristics even if they're in the same broad product class.

**Versioned pattern rules:** Behavioural pattern rules are versioned and attached to runs. This ensures that historical runs always use the patterns that were current at the time, providing auditability and consistency.

**Unmodelled position handling:** Positions with behavioural tags that have no matching pattern are reported as unmodelled rather than being defaulted. This data quality gate prevents silent misapplication of assumptions.

**No slider approach:** The platform doesn't provide ad-hoc sliders for adjusting core/volatile splits because changes would affect multiple downstream calculations (gap, NSFR, survival horizon). Making assumption changes a rule-governed process ensures figures remain defensible.

### IF THEY ASK

**Q: How do you calibrate these patterns?**  
A: Patterns can be calibrated against historical run-off data. The platform supports analysis of historical deposit behaviour to inform pattern settings. Calibration is a rule change process, not an ad-hoc adjustment, ensuring governance.

**Q: What if we don't have turnover data?**  
A: Without turnover data, accounts are classified as "Unknown" activity and receive no uplift. The base pattern core% is used. This is conservative but accurate given the available data.

**Q: Can we have different patterns for different affiliates?**  
A: Yes, behavioural pattern rules can be defined at different scopes. Different affiliates can have different patterns if their deposit behaviour differs, or they can share a common pattern for consistency.

---

## SCREEN 5 — Interest Rate Risk (IRRBB)

### 1. What you are looking at

The IRRBB screen provides comprehensive analysis of interest rate risk in the banking book, including earnings sensitivity (NII), economic value sensitivity (EVE), and the six Basel-prescribed shock scenarios. This is the primary screen for IRRBB monitoring and regulatory reporting.

### 2. What you say

"Interest rate risk in the banking book is one of the most critical risks we manage. This screen gives us the complete picture: both the earnings view and the economic value view.

**First, the six Basel shock scenarios.** Basel prescribes six standard interest rate shocks: parallel up and down, steepener and flattener, and short rate up and down. This chart shows the NII and EVE impact under all six scenarios against our current book.

The dashed lines at ±15% mark the supervisory outlier test. If any scenario shows EVE impact beyond 15% of capital, we trigger the Basel outlier test and need to report it to regulators.

**Second, the earnings view — NII sensitivity.** This shows what a +200 basis-point rate change does to net interest income over a 365-day horizon. Our current sensitivity is −8.06%, meaning that same +200bp move would reduce net interest income by roughly 8%.

The key driver is the repricing gap. If we have more rate-sensitive assets than liabilities repricing within the horizon, a rate rise adds to earnings. If we have more liabilities repricing, a rate rise costs earnings — and that's Nigeria's position today: 419.4 of rate-sensitive assets against 1,000 of rate-sensitive liabilities repricing within the year, a gap of −580.6.

**Third, the economic value view — EVE sensitivity.** This measures the present value change across the whole book via the duration gap. Our current sensitivity is −13.81% of balance-sheet equity under the worst of the six shocks (parallel up), which is inside — but close to — the 15% supervisory outlier threshold.

The duration gap tells us whether assets reprice faster or slower than liabilities. A positive duration gap means assets reprice more slowly than liabilities, so a rate rise reduces economic value. A negative gap means the opposite.

**The yield curve** shows the current market curve for our reporting currency. This is the curve used in the shock calculations.

**The repricing gap analysis** at the bottom shows rate-sensitive assets versus liabilities by repricing bucket. This is the foundation for both the NII and EVE calculations."

### 3. Where to direct their eyes

1. **Basel shock scenarios chart** — "NII and EVE impact under all six shocks"
2. **±15% reference lines** — "Supervisory outlier test thresholds"
3. **Yield curve** — "Current market curve for reporting currency"
4. **NII sensitivity section** — "Earnings view with delta NII"
5. **Repricing gap driver** — "Key driver of NII sensitivity"
6. **EVE sensitivity section** — "Economic value view with delta EVE"
7. **Duration gap** — "Driver of EVE sensitivity"
8. **PV01** — "Present value change per 1bp move"
9. **Capital basis indicator** — "Tier 1 vs balance-sheet equity"
10. **Reading the gap section** — "Interpretation of duration gap"
11. **Scenario detail table** — "Detailed results for all six shocks"

### 4. Metric-by-metric banking explanation

#### NII Sensitivity

**Displayed value:** −8.06% (Ecobank Nigeria, +200bp parallel shock, 365-day horizon)  
**What it means in banking:** Net Interest Income sensitivity measures the percentage change in net interest income resulting from a specified interest rate shock over a specified time horizon. It's the primary earnings-based IRRBB metric.

**Why Treasury/Risk cares:** NII sensitivity directly affects the income statement and earnings volatility. It's critical for budgeting, earnings forecasting, and managing shareholder expectations. Regulators monitor it as part of IRRBB supervision.

**How the application calculates it:**
```
ΔNII = (Rate-sensitive assets - Rate-sensitive liabilities within horizon) × shock
NII sensitivity % = (ΔNII / Base NII) × 100
Rate-sensitive positions = Positions with IRRBB rate sensitive flag AND repricing within horizon
```

**Inputs:**
- Rate-sensitive assets repricing within horizon
- Rate-sensitive liabilities repricing within horizon
- Base net interest income
- Shock magnitude in basis points
- Time horizon (typically 365 days)

**Assumptions:**
- Gap approximation: full, immediate repricing at shocked rate
- No rate caps or floors applied
- 100% deposit pass-through unless beta rules configured
- Fixed-rate instruments reprice only at maturity
- Horizon is typically 1 year

**Interpretation of this result:** A +200bp move against Nigeria's −580.6 repricing gap produces a ΔNII of −11.6 against a base NII of 144.0 — a −8.06% sensitivity. Negative means Nigeria is liability-sensitive over this horizon: liabilities reprice faster than assets, so rising rates cost earnings rather than help them.

**What can change it:**
- Changes in repricing gap profile
- Changes in interest rate levels
- Changes in deposit beta assumptions
- Changes in shock magnitude or horizon

#### EVE Sensitivity

**Displayed value:** −13.81% of balance-sheet equity (Ecobank Nigeria, +200bp parallel shock — the worst of the six Basel scenarios)  
**What it means in banking:** Economic Value of Equity sensitivity measures the percentage change in the economic value of equity resulting from a specified interest rate shock. It's the primary economic value-based IRRBB metric and is subject to Basel's supervisory outlier test.

**Why Treasury/Risk cares:** EVE sensitivity captures long-term economic value risk beyond the earnings horizon. Basel III requires monitoring of EVE sensitivity, with values beyond ±15% of Tier 1 capital triggering supervisory attention.

**How the application calculates it:**
```
Duration gap = D(assets) - (Liabilities/Assets) × D(liabilities)
ΔEVE = -Duration gap × Assets × Δr
EVE sensitivity % = (ΔEVE / Capital) × 100
D(assets) = Weighted average duration of assets
D(liabilities) = Weighted average duration of liabilities
```

**Inputs:**
- Asset duration (weighted average)
- Liability duration (weighted average)
- Total assets
- Total liabilities
- Capital (Tier 1 or balance-sheet equity)
- Shock magnitude in basis points

**Assumptions:**
- Duration is approximated per position, not from full cash flows
- Parallel shift assumption (no curve twisting)
- Linear price sensitivity (no convexity)
- Optionality not modelled
- Duration approximation is standard for ledger-grain data

**Interpretation of this result:** A +200bp shock against a +0.91-year duration gap and 1,470.97 in total assets produces a ΔEVE of −26.73 — −13.81% of the 193.5 balance-sheet equity used as the capital basis (no Tier 1 figure is loaded for Nigeria, so the run falls back to equity and the methodology says so explicitly). That's inside the ±15% Basel outlier line, with about three points of headroom.

**What can change it:**
- Changes in duration profile
- Changes in capital levels
- Changes in shock magnitude
- Changes in balance sheet composition

#### Duration Gap

**Displayed value:** +0.91 years (Ecobank Nigeria, 31 July 2026 — asset duration 1.48 years, liability duration 0.66 years)  
**What it means in banking:** Duration gap measures the difference between the weighted average duration of assets and the weighted average duration of liabilities, adjusted for the leverage ratio. It indicates the balance sheet's sensitivity to interest rate changes.

**Why Treasury/Risk cares:** Duration gap is the primary driver of EVE sensitivity. A positive duration gap means assets reprice more slowly than liabilities, making the balance sheet vulnerable to rising rates. A negative gap means the opposite.

**How the application calculates it:**
```
Duration gap = D(assets) - (Liabilities/Assets) × D(liabilities)
D(assets) = Σ(Asset duration × Asset value) / Total assets
D(liabilities) = Σ(Liability duration × Liability value) / Total liabilities
```

**Inputs:**
- Per-position duration approximations
- Position amounts
- Total assets and liabilities

**Assumptions:**
- Duration is approximated per position (Macaulay or modified duration)
- Approximation is necessary at ledger grain without full cash flows
- Same method used by Oracle and other major systems for this data shape

**Interpretation of this result:** At +0.91 years, Nigeria's assets reprice roughly eleven months more slowly than its liabilities on a value-weighted basis. That's a positive (asset-sensitive) gap: rising rates reduce economic value, which is exactly what shows up as a negative ΔEVE under the parallel-up shock above.

**What can change it:**
- Changes in duration profile of assets/liabilities
- Changes in leverage ratio (liabilities/assets)
- Changes in balance sheet composition

#### PV01

**Displayed value:** −0.134 per 1bp (Ecobank Nigeria, 31 July 2026, in the same book-scale units as the rest of this demo dataset)  
**What it means in banking:** PV01 (Present Value of a 1 basis point move) measures the change in economic value resulting from a 1bp parallel shift in interest rates. It's a standard sensitivity measure used in trading and risk management.

**Why Treasury/Risk cares:** PV01 provides a granular sensitivity measure that's independent of the shock magnitude. It's useful for hedging decisions and for understanding the linear approximation of interest rate risk.

**How the application calculates it:**
```
PV01 = -Duration gap × Assets × 0.0001 (1bp)
```

**Inputs:**
- Duration gap
- Total assets

**Assumptions:**
- Linear approximation (valid for small rate changes)
- Parallel shift assumption

**Interpretation of this result:** PV01 scales linearly with the shock, so it's exactly the +200bp ΔEVE (−26.73) divided by 200 — a 1bp move changes economic value by about −0.134 in this book's units. Because this demo dataset is a small, illustrative 27-position book rather than a full balance sheet, treat the absolute figure as illustrative of the mechanism; the percentage-of-capital figures above are what generalise to a real book of any size.

**What can change it:**
- Changes in duration gap
- Changes in total assets

#### Basel Shock Scenarios

**What it means in banking:** Basel prescribes six standard interest rate shock scenarios for IRRBB analysis: parallel up (+200bp), parallel down (-200bp), steepener (short rates down, long rates up), flattener (short rates up, long rates down), short rate up (+250bp short end), and short rate down (-250bp short end).

**Why Treasury/Risk cares:** These scenarios provide a standardized framework for IRRBB assessment across institutions. Regulators expect analysis under these scenarios, and the worst-case result is used for the supervisory outlier test.

**How the application calculates it:**
```
For each scenario:
  Apply scenario-specific rate shocks by time bucket
  Calculate NII sensitivity using short-end shock
  Calculate EVE sensitivity using average shock across curve
  Report NII and EVE impact
```

**Inputs:**
- Standard shock definitions (Basel prescribed)
- Time bucket definitions
- Position repricing dates and amounts

**Assumptions:**
- Gap approximation for NII
- Duration gap for EVE
- Shock shapes are Basel-prescribed (200bp parallel, etc.)

**Interpretation of this result:** The scenario analysis shows NII and EVE impact under all six standard shocks. The worst-case EVE impact is used for the supervisory outlier test.

**What can change it:**
- Changes in balance sheet structure
- Changes in time bucket definitions
- Changes in shock definitions (custom scenarios in What-If Builder)

### LIVE SCRIPT

"The power here is the integration of earnings and economic value views. The same repricing gap that drives NII sensitivity also drives EVE sensitivity through the duration gap. Everything is consistent.

Notice the capital basis indicator. Nigeria is running on balance-sheet equity today, because no Tier 1 capital figure has been loaded for this affiliate — that's a genuine data gap worth naming, not glossing over. Where Tier 1 capital is loaded, we use it for the supervisory outlier test as Basel prescribes; where it isn't, we fall back to balance-sheet equity and say so explicitly in the methodology, rather than silently presenting one basis as if it were the other.

The six Basel scenarios give us a comprehensive view of rate risk across different curve shapes. We're not just testing parallel shifts — we're testing curve steepening, flattening, and short-rate-specific moves. This is what regulators expect for robust IRRBB management."

### COACHING / TECHNICAL DETAIL

**Duration approximation:** Duration is approximated per position rather than computed from full cash flows. This is the standard approach for ledger-grain data where full cash flow schedules are not available. Oracle and other major systems prescribe the same method for this data shape.

**Capital basis for outlier test:** The supervisory outlier test uses Tier 1 capital where available, falling back to balance-sheet equity where Tier 1 is not supplied. The application clearly indicates which basis is used, ensuring transparency.

**Shock scenario implementation:** The six Basel scenarios are implemented as standard shock shapes applied to the time bucket ladder. Custom scenarios can be created in the What-If Builder for additional analysis.

**Gap approximation for NII:** NII uses the standard gap approximation method, assuming full, immediate repricing at the shocked rate. Deposit betas can be applied to refine this assumption when beta rules are configured.

### IF THEY ASK

**Q: Why use duration approximation instead of full cash flow analysis?**  
A: Full cash flow analysis requires contract-level cash flow schedules that are typically not available in general ledger systems. The duration approximation is the industry standard for this data shape and is prescribed by Oracle and other major systems for ledger-grain data.

**Q: Can we apply deposit betas to NII sensitivity?**  
A: Yes, deposit beta rules can be configured to adjust the pass-through of rate changes to deposit rates. This refines the NII calculation by assuming less than 100% pass-through, which is more realistic for many deposit products.

**Q: How do you handle optionality like prepayments?**  
A: Optionality is not modelled in the current implementation due to data limitations. Prepayments can be approximated through behavioural patterns and run-off assumptions, but full optionality modelling would require contract-level option terms that are typically not available in ledger data.

---

## SCREEN 6 — Concentration & Large Exposures

### 1. What you are looking at

The Concentration & Large Exposures screen analyzes depositor concentration by counterparty, measuring funding diversification and identifying large exposure risks. This is critical for managing funding concentration risk.

### 2. What you say

"Concentration risk is about over-reliance on a few funding sources. This screen shows how our deposits are distributed across counterparties.

**The headline metrics** tell us the story immediately. Our largest depositor holds 52.9% of total deposits. With only four counterparties mapped in this demo book, the top five and top ten shares both round to essentially 100% — a function of counterparty count, not real diversification, which I'll caveat properly in a moment. The Herfindahl index of 3,728 indicates highly concentrated funding by the standard >2,500 band.

**The largest depositors table** shows the detailed breakdown. We flag any depositor above 10% as a large exposure (red badge) and any above 5% as worth monitoring (yellow badge). This aligns with typical regulatory thresholds for large exposure reporting.

**The Herfindahl index** is a standard competition authority measure applied to funding. Below 1500 is diversified, 1500-2500 is moderately concentrated, above 2500 is highly concentrated. It's calculated as the sum of squared percentage-point shares, giving more weight to larger depositors.

**If there are unattributed deposits**, we report them separately rather than dropping them or lumping them into a single bucket. Either approach would distort the concentration measure, so we hold them out and flag them for remediation.

**The concentration analysis** is only meaningful when counterparties are properly mapped. The Counterparties screen lets us map deposit positions to their actual counterparties, which is essential for accurate concentration measurement."

### 3. Where to direct their eyes

1. **Largest depositor metric** — "Single largest concentration"
2. **Top five metric** — "Concentration in top 5 depositors"
3. **Top ten metric** — "Concentration in top 10 depositors"
4. **Herfindahl index** — "Overall concentration measure"
5. **Deposit base total** — "Total deposits in scope"
6. **Above 10% count** — "Number of large exposures"
7. **Largest depositors table** — "Detailed breakdown by counterparty"
8. **Large exposure flags** — "Above 10% (red) and above 5% (yellow)"
9. **Unattributed warning** — "Deposits without counterparty mapping"
10. **Methodology note** — "Calculation approach"

### 4. Metric-by-metric banking explanation

#### Largest Depositor Share

**Displayed value:** 52.9% (Ecobank Nigeria, 31 July 2026 — counterparty CP-NG-RETAIL-POOL; Red against 5%/10%/15% internal thresholds)  
**What it means in banking:** The largest depositor share measures the percentage of total deposits held by the single largest depositor. It's a primary indicator of funding concentration risk.

**Why Treasury/Risk cares:** Over-reliance on a single large depositor creates significant liquidity and reputational risk. If that depositor withdraws, the institution could face immediate funding pressure. Regulators typically set thresholds (often 10%) for large exposure reporting.

**How the application calculates it:**
```
Largest share % = (Largest depositor balance / Total deposits) × 100
```

**Inputs:**
- Individual depositor balances
- Counterparty mappings
- Total deposits

**Assumptions:**
- Counterparty mapping is required for accurate measurement
- Measurement is at the selected scope (Group or affiliate)
- Only customer deposits are included (not interbank)

**Interpretation of this result:** At 52.9%, this is well above the 15% internal red line — but the honest caveat matters here: the largest "depositor" in this demo book is CP-NG-RETAIL-POOL, a pooled counterparty code standing in for the entire retail deposit base, not one institutional client. Real customer-level counterparty mapping would break that pool into thousands of individual depositors, and the genuine largest-single-name figure would very likely look nothing like 52.9%. This is a good moment to talk about why counterparty mapping quality — not just the formula — determines whether this metric means anything.

**What can change it:**
- Changes in depositor balances
- Changes in counterparty mappings
- New large depositors or withdrawals

#### Top Five Share

**Displayed value:** ~100% (Ecobank Nigeria, 31 July 2026 — the book has only four mapped counterparties in total, so top-5 and top-10 both capture the entire deposit base)  
**What it means in banking:** The top five share measures the percentage of total deposits held by the five largest depositors. It indicates concentration in the largest funding sources.

**Why Treasury/Risk cares:** Concentration in the top five depositors shows funding fragility even if no single depositor is dominant. If the top five depositors all withdrew simultaneously, the institution could face severe funding pressure.

**How the application calculates it:**
```
Top five share % = (Sum of top 5 depositor balances / Total deposits) × 100
```

**Inputs:**
- Individual depositor balances
- Counterparty mappings
- Total deposits

**Assumptions:**
- Depositors are ranked by balance
- Measurement is at the selected scope
- Only customer deposits are included

**Interpretation of this result:** With four counterparties on the whole book, top-five and top-ten mechanically capture everything — a demo-data artifact rather than a genuine top-five reading. On a real book with hundreds or thousands of counterparties this figure does real work; here, the largest-single-name figure above is the more honest one to lead with.

**What can change it:**
- Changes in depositor balances
- Changes in ranking of depositors
- New large depositors or withdrawals

#### Herfindahl Index

**Displayed value:** 3,728 (Ecobank Nigeria, 31 July 2026 — highly concentrated, above the 2,500 band)  
**What it means in banking:** The Herfindahl Index is a standard measure of market concentration, calculated as the sum of squared market shares. Applied to funding, it measures overall concentration beyond just the largest depositors.

**Why Treasury/Risk cares:** The Herfindahl Index provides a single number that captures overall concentration structure, giving more weight to larger depositors. It's widely used by competition authorities and regulators.

**How the application calculates it:**
```
Herfindahl Index = Σ(Individual depositor share %)²
```

**Inputs:**
- Individual depositor shares
- Total deposits

**Assumptions:**
- Uses the conventional 0-10,000 scale (percentage points squared)
- Only includes depositors with counterparty mappings
- Unattributed deposits are excluded

**Interpretation of this result:** 3,728 sits well above the 2,500 highly-concentrated threshold — again driven mechanically by having only four counterparty codes rather than genuine funding concentration. This is the clearest of the three concentration metrics for making that caveat explicit to the room, since a Herfindahl index is intuitively understood as "how few names does the funding really depend on," and here the honest answer is "four, because the demo data only models four."

**What can change it:**
- Changes in depositor share distribution
- Changes in counterparty mappings
- Entry or exit of depositors

#### Large Exposure Flags

**What it means in banking:** Large exposure flags identify depositors whose share exceeds regulatory or internal thresholds. Typically, deposits above 10% are considered large exposures requiring specific monitoring and reporting.

**Why Treasury/Risk cares:** Large exposures are a regulatory concern and require specific reporting to supervisors. They also represent funding vulnerability that needs to be managed through diversification or committed funding facilities.

**How the application calculates it:**
```
Large exposure (>10%): Individual share > 10%
Worth monitoring (>5%): Individual share > 5%
```

**Inputs:**
- Individual depositor shares
- Threshold values (10% and 5%)

**Assumptions:**
- Thresholds align with typical regulatory standards
- Flags are based on share of total deposits
- Measurement is at the selected scope

**Interpretation of this result:** Red badges indicate large exposures above 10%, yellow badges indicate concentrations above 5% that warrant monitoring.

**What can change it:**
- Changes in depositor shares
- Changes in threshold values
- Changes in total deposits (denominator effect)

### LIVE SCRIPT

"The concentration analysis is only as good as the counterparty mapping. If we have unattributed deposits, they're reported separately rather than being dropped or lumped together. Dropping them would understate the base, lumping them would invent a very large depositor — either would distort the measure.

The Herfindahl Index is particularly useful because it captures the overall concentration structure, not just the top few. A high Herfindahl can occur even with no single large depositor if the funding base is concentrated in many medium-sized depositors.

For Group-level analysis, concentration is measured across the entire group, showing how funding is distributed across affiliates as well as counterparties. This gives a complete picture of funding diversification."

### COACHING / TECHNICAL DETAIL

**Counterparty mapping requirement:** Accurate concentration measurement requires counterparty mapping at the position level. The platform holds unattributed deposits separate to avoid distorting the measure and to prompt data quality remediation.

**Conservative aggregation:** The aggregate FX position uses absolute values rather than netting long against short across currencies. This is the conservative measure prescribed by regulators for FX risk assessment.

**Scope-based measurement:** Concentration can be measured at Group level (across all affiliates) or at individual affiliate level. The Group view shows overall funding diversification; the affiliate view shows local concentration risk.

**Herfindahl scale:** The Herfindahl Index uses the conventional 0-10,000 scale (percentage points squared). Some implementations use a 0-1 scale (dividing by 100 before squaring), but the 0-10,000 scale is the standard in regulatory contexts.

### IF THEY ASK

**Q: What if we don't have counterparty mappings for all deposits?**  
A: Unattributed deposits are reported separately and excluded from concentration measures. This prevents distortion of the measures and prompts data quality remediation. The Concentration screen will show the unattributed amount with a warning.

**Q: Can we set different thresholds for large exposure flags?**  
A: The current implementation uses standard 10% and 5% thresholds. These can be configured if regulatory requirements or internal risk appetite differ.

**Q: How does this handle group-level concentration?**  
A: At Group level, concentration is measured across all deposits in the group, showing the overall funding diversification. Affiliate-level concentration is also available to identify local concentration risks.

---

## SCREEN 7 — Profitability Ratios

### 1. What you are looking at

The Profitability Ratios screen analyzes earnings, asset quality, and efficiency metrics from the same run used for risk calculations. This integration allows direct analysis of how risk decisions affect profitability.

### 2. What you say

"Profitability analysis is integrated with risk analysis — everything reads from the same run. This lets us see how our risk profile translates into financial performance.

**The earnings section** shows the income statement metrics: total assets, interest income, interest expense, net interest income, and net interest margin. Our NIM is 9.79%, which tells us how efficiently we're earning spreads on our asset base.

**The asset quality section** focuses on credit risk indicators. The NPL ratio reads a clean 0.0% on this run — below the 5% regulatory-style threshold. Coverage isn't a meaningful figure when there's nothing to cover, so it shows as no data rather than a misleading zero. The non-earning asset ratio, at 27.6%, shows what share of assets aren't generating interest income.

**The ratios chart** plots NIM, NPL, and non-earning assets against their thresholds. This gives a visual sense of whether we're within acceptable ranges on all three metrics simultaneously — worth noting that non-earning asset ratio doesn't currently have a configured limit in the seed data, so it displays informationally rather than graded Green/Amber/Red.

**The key insight** is that these profitability metrics are calculated from the same positions and assumptions as the risk metrics. Changes in product characteristics or behavioural assumptions affect both risk and profitability consistently. If we click the Methodology info button on the Asset Quality card, it confirms NPL classification follows the CBN standard — Substandard, Doubtful and Loss are non-performing."

### 3. Where to direct their eyes

1. **Earnings section** — "Income statement metrics"
2. **Net interest margin** — "Efficiency of spread earning"
3. **Asset quality section** — "Credit risk indicators"
4. **NPL ratio** — "Asset quality indicator"
5. **NPL coverage** — "Provisioning adequacy"
6. **Non-earning asset ratio** — "Asset efficiency"
7. **Ratios chart** — "Visual comparison against thresholds"
8. **Methodology info button** — "CBN classification note, on the Asset Quality card"

### 4. Metric-by-metric banking explanation

#### Net Interest Margin (NIM)

**Displayed value:** 9.79% (Ecobank Nigeria, 31 July 2026)  
**What it means in banking:** Net Interest Margin measures the difference between interest income generated and interest paid, expressed as a percentage of interest-earning assets. It's a primary measure of bank profitability and lending efficiency.

**Why Treasury/Risk cares:** NIM indicates how efficiently the bank is earning spreads on its asset base. It's a key driver of profitability and is closely monitored by management, investors, and regulators.

**How the application calculates it:**
```
NIM = (Interest income - Interest expense) / Total assets × 100
```

**Inputs:**
- Interest income from assets
- Interest expense from liabilities
- Total assets

**Assumptions:**
- Calculated from position balances and rates
- All assets are included in denominator
- No allocation of non-interest expenses

**Interpretation of this result:** At 9.79%, Nigeria earns roughly 9.8 cents on every dollar of assets from the interest spread net of funding costs — a healthy margin for this book's mix of Naira lending and deposits.

**What can change it:**
- Changes in interest rate environment
- Changes in asset/liability mix
- Changes in funding costs
- Changes in loan pricing

#### NPL Ratio

**Displayed value:** 0.0% (Ecobank Nigeria, 31 July 2026 — Green; no positions currently classified Substandard, Doubtful or Loss)  
**What it means in banking:** The Non-Performing Loan ratio measures the proportion of the loan book classified as non-performing (typically Substandard, Doubtful, or Loss). It's a key indicator of asset quality and credit risk.

**Why Treasury/Risk cares:** High NPL ratios indicate credit deterioration and potential provisioning needs. Regulators set thresholds (typically 5% in many jurisdictions) beyond which intervention may occur. High NPLs also affect profitability through provisioning expenses.

**How the application calculates it:**
```
NPL ratio = (Non-performing loans / Total loans) × 100
Non-performing = Substandard + Doubtful + Loss (CBN classification)
```

**Inputs:**
- Loan balances classified as Substandard, Doubtful, or Loss
- Total loan portfolio balance

**Assumptions:**
- Classification follows CBN standards
- Classification is per-position, not inferred
- Only customer loans are included (not interbank)

**Interpretation of this result:** With none of Nigeria's 27 seeded positions currently classified Substandard, Doubtful or Loss, this reads a clean 0.0% — comfortably inside the 3%/5%/8% internal thresholds. Worth being direct that this reflects a small, clean illustrative book rather than a claim about Ecobank Nigeria's actual credit quality; the platform's own test suite reclassifies a position to prove the ratio moves correctly when it should (`src/engine/profitability.ts`, `computeProfitability`), which is worth demonstrating live if a credit-risk stakeholder wants to see it react.

**What can change it:**
- Changes in loan classifications
- New NPLs or recoveries
- Changes in total loan book

#### NPL Coverage Ratio

**Displayed value:** No data (Ecobank Nigeria, 31 July 2026 — zero non-performing loans and zero provisions; the platform reports this as unmeasured rather than a misleading 0% or 100%)  
**What it means in banking:** The NPL coverage ratio measures the extent to which loan loss provisions cover the non-performing loan balance. It indicates provisioning adequacy.

**Why Treasury/Risk cares:** Coverage below 100% means provisions don't fully cover the impaired book, potentially indicating under-provisioning. Regulators and auditors monitor coverage as part of asset quality assessment.

**How the application calculates it:**
```
NPL coverage % = (Total provisions / Non-performing loans) × 100
```

**Inputs:**
- Provision amounts on loans
- Non-performing loan balances

**Assumptions:**
- Provisions are captured at position level
- Coverage is null if provisions are zero but NPLs exist
- Only customer loans are included

**Interpretation of this result:** Nigeria currently shows no data for coverage, not zero and not 100% — because there's nothing non-performing to cover. That distinction matters: a naive implementation might show 0%, which would misleadingly read as "zero provisioning against a real problem" rather than "there's no problem to provision for." The moment a position is reclassified Doubtful or Substandard, this figure becomes live and meaningful.

**What can change it:**
- Changes in provision levels
- Changes in NPL balances
- New provision policies

#### Non-Earning Asset Ratio

**Displayed value:** 27.6% (Ecobank Nigeria, 31 July 2026; no limit is currently configured for this metric in the seed data, so it displays informationally)  
**What it means in banking:** The non-earning asset ratio measures the percentage of total assets that don't generate interest income. It indicates asset efficiency and operational drag.

**Why Treasury/Risk cares:** High non-earning ratios indicate inefficient asset utilization — assets that aren't contributing to earnings but still require funding. This can include cash, fixed assets, and other non-interest-earning assets.

**How the application calculates it:**
```
Non-earning asset % = (Non-earning assets / Total assets) × 100
Non-earning assets = Assets with 0% interest rate
```

**Inputs:**
- Asset balances with zero interest rate
- Total assets

**Assumptions:**
- Non-earning is defined as 0% interest rate
- All asset categories are included
- Off-balance sheet items are excluded

**Interpretation of this result:** 27.6% of Nigeria's assets — cash, central bank reserves, fixed and other assets carrying a zero interest rate — generate no interest income at all. There's no configured internal threshold for this metric today (unlike LCR, NSFR, NPL, EVE, NII and concentration, which all have seeded limits), so present it as a useful efficiency indicator rather than implying it's being graded against a governed appetite band.

**What can change it:**
- Changes in asset mix
- Changes in interest-bearing status
- Changes in cash holdings

#### Loan-to-Deposit Ratio

**Displayed value:** 78.6% (Ecobank Nigeria, 31 July 2026 — Amber against the Group's 75%/85%/95% ceiling, Green against Nigeria's own 70%/67%/65% CBN floor)  
**What it means in banking:** The loan-to-deposit ratio measures the proportion of customer loans funded by customer deposits. It's a classic indicator of funding structure and liquidity pressure.

**Why Treasury/Risk cares:** A high ratio indicates heavy reliance on deposits to fund lending, creating potential liquidity pressure if deposits withdraw. It's a key monitoring metric for both internal management and regulators.

**How the application calculates it:**
```
LDR = (Total customer loans / Total customer deposits) × 100
```

**Inputs:**
- Customer loans (identified by account class and product class)
- Customer deposits (identified by account class and product class)

**Assumptions:**
- Classification based on account class, not product names
- Excludes interbank positions
- Excludes internal accounts

**Interpretation of this result:** At 78.6%, this is the same figure and the same nuance as on the Dashboard and Liquidity Risk screens: Amber against the Group ceiling, Green against Nigeria's own CBN floor. Showing the identical number reconciling cleanly across three screens is itself a demonstration of the "one run, one set of figures" architecture.

**What can change it:**
- Changes in loan book growth
- Changes in deposit gathering
- Changes in interbank funding (doesn't affect this ratio)

### LIVE SCRIPT

"The integration of profitability with risk is powerful here. The same positions that drive our LCR and NSFR also drive our NIM and NPL ratio. This means we can analyze the trade-offs between risk and return directly.

For example, if we're considering a change to behavioural assumptions that would improve our liquidity ratios, we can immediately see the impact on profitability metrics. Everything is consistent because everything reads from the same run.

The underlying methodology is important for transparency, even though it now sits behind a small info button rather than an always-visible panel. If we don't have fee income data, that's called out explicitly rather than fabricating a number — you can see that on Nigeria's run right now: interest-income-to-total-income is null, with a note saying it was left null rather than fabricated. And if NPLs exist but provisions don't, coverage is reported as unmeasured rather than a misleading zero. This prevents figures that look precise but aren't."

### COACHING / TECHNICAL DETAIL

**Classification standards:** NPL classification follows CBN standards (Substandard, Doubtful, Loss). Bank of Ghana and BCEAO classifications mirror this closely, making the standard applicable across multiple African jurisdictions.

**Data completeness handling:** When required data is missing (e.g., fee income for total income calculation), the metric is explicitly set to null rather than fabricated. This prevents misleading figures and prompts data quality remediation.

**Integrated calculation:** All profitability metrics are calculated from the same position data used for risk metrics. This ensures consistency and enables direct analysis of risk-return trade-offs.

**Account class-based classification:** Loans and deposits are identified by account class (Customer) rather than product name matching. This is more robust and aligns with general ledger classification standards.

### IF THEY ASK

**Q: Can we include non-interest income in the profitability analysis?**  
A: Yes, if fee and non-interest income data is ingested, it's included in the calculations. The methodology notes will indicate whether this data is available or whether the metric is limited to interest income only.

**Q: How do you handle different NPL classification standards?**  
A: The current implementation follows CBN standards. If other jurisdictions use different classifications, the performing status field can be mapped accordingly. The calculation logic remains the same — whatever is classified as non-performing is included in the NPL ratio.

**Q: Can we analyze profitability by product or customer segment?**  
A: The current implementation provides aggregate profitability ratios. Segment-level analysis would require dimensional analysis capabilities that could be added as an enhancement, using the same underlying position data.

---

## RFP REQUIREMENTS MAPPING

### Typical ALM RFP Requirements Coverage

#### Data Management & Integration
- **General Ledger Integration:** ✅ Supported via connectors and data loading screens
- **Position-Level Data:** ✅ Full position-level granularity maintained
- **Multi-Currency Support:** ✅ FX conversion and multi-currency analysis
- **Data Validation:** ✅ GL reconciliation and validation rules
- **Data Versioning:** ✅ Data vintages and load history tracking

#### Liquidity Risk Management
- **Liquidity Coverage Ratio (LCR):** ✅ Full Basel III implementation with HQLA levels
- **Net Stable Funding Ratio (NSFR):** ✅ Full Basel III implementation with ASF/RSF factors
- **Maturity Gap Analysis:** ✅ Contractual and behavioural views
- **Cash Flow Projections:** ✅ Time-bucketed cash flow analysis
- **Stress Testing:** ✅ What-If Builder with configurable stress scenarios
- **Contingency Funding Planning:** ✅ Survival horizon analysis

#### Interest Rate Risk (IRRBB)
- **Earnings-at-Risk (NII):** ✅ Gap approximation with configurable horizon
- **Economic Value of Equity (EVE):** ✅ Duration gap with supervisory outlier test
- **Repricing Gap:** ✅ Detailed repricing analysis
- **Basel Shock Scenarios:** ✅ All six prescribed scenarios
- **Deposit Beta Modelling:** ✅ Configurable pass-through assumptions
- **Yield Curve Management:** ✅ Curve library and scenario application

#### Behavioural Modelling
- **Non-Maturity Deposit Modelling:** ✅ Core/volatile split with behavioural patterns
- **Prepayment Modelling:** ✅ Configurable prepayment assumptions
- **Activity-Based Adjustments:** ✅ Account turnover-based core uplifts
- **Pattern Versioning:** ✅ Governed and versioned behavioural rules

#### Concentration Risk
- **Depositor Concentration:** ✅ Counterparty-level analysis
- **Large Exposure Reporting:** ✅ Configurable thresholds and flags
- **Herfindahl Index:** ✅ Standard concentration measure
- **Funding Diversification:** ✅ Affiliate-level and Group-level analysis

#### Credit Risk Integration
- **NPL Ratio:** ✅ CBN-classification based NPL measurement
- **Provision Coverage:** ✅ NPL coverage ratio
- **Asset Quality:** ✅ Non-earning asset ratio
- **Loan-to-Deposit:** ✅ Classic funding ratio

#### Profitability Analysis
- **Net Interest Margin:** ✅ NIM calculation
- **Spread Analysis:** ✅ Interest income/expense analysis
- **Funds Transfer Pricing:** ✅ FTP rules and assignment
- **Cost Allocation:** ✅ Configurable adjustments and allocations

#### Regulatory Reporting
- **Basel III Reporting:** ✅ LCR, NSFR, IRRBB metrics
- **Large Exposure Reporting:** ✅ Concentration and large exposure flags
- **ALCO Reporting:** ✅ Executive dashboard and reporting packs
- **Audit Trail:** ✅ Full audit logging and run versioning

#### Governance & Controls
- **Role-Based Access Control:** ✅ User roles and permissions
- **Maker-Checker:** ✅ Approval workflows for critical changes
- **Audit Logging:** ✅ Comprehensive audit trail
- **Rule Versioning:** ✅ All assumptions versioned and governed
- **Data Lineage:** ✅ Complete traceability from positions to results

#### Scenario Analysis & Stress Testing
- **What-If Analysis:** ✅ Configurable scenario builder
- **Historical Comparison:** ✅ Run history and trend analysis
- **Stress Scenario Library:** ✅ Reusable stress scenarios
- **Multi-Dimensional Stress:** ✅ Rate, liquidity, and behavioural stress

#### Technology & Architecture
- **Cloud Deployment:** ✅ Cloud-native architecture
- **API Access:** ✅ RESTful APIs for integration
- **Scalability:** ✅ Designed for multi-affiliate group deployment
- **Security:** ✅ Enterprise-grade security and access controls
- **Performance:** ✅ Optimized for large balance sheets

---

## LIKELY QUESTIONS BY STAKEHOLDER GROUP

### Group Risk

**Q: How does the platform ensure data quality before calculations run?**  
A: The platform includes multiple data quality gates: GL reconciliation compares position totals against General Ledger balances; validation rules can be configured to flag data quality issues; data vintages track load history and enable data lineage analysis. Unattributed or incomplete data is reported separately rather than being defaulted, preventing silent errors.

**Q: How do you validate the behavioural assumptions used in calculations?**  
A: Behavioural patterns are configurable and can be calibrated against historical run-off data. The platform shows exactly which patterns were applied to each run, enabling traceability. Patterns are versioned and governed, requiring approval for changes. Historical runs always use the patterns current at the time, ensuring consistency.

**Q: What Basel III methodologies are implemented?**  
A: The platform implements full Basel III methodologies for LCR (HQLA levels, haircuts, 75% inflow cap), NSFR (ASF/RSF factors), and IRRBB (six prescribed shock scenarios, supervisory outlier test). All calculations follow Basel standards and are clearly documented in the methodology notes for each result.

**Q: How does the platform handle the supervisory outlier test?**  
A: The EVE sensitivity calculation includes the Basel supervisory outlier test, comparing |ΔEVE| against 15% of Tier 1 capital (or balance-sheet equity if Tier 1 is not supplied). Results beyond the threshold are flagged as supervisory outliers. The capital basis used is clearly indicated in the methodology.

### Treasury / Balance Sheet Management

**Q: Can we run what-if scenarios on liquidity and interest rate risk?**  
A: Yes, the What-If Builder allows you to create and run custom stress scenarios. You can apply stress multipliers to runoff rates, HQLA haircuts, inflow suppression, deposit betas, and rate shocks. Scenarios can be saved and reused, and results can be compared against the base case.

**Q: How does the platform support FTP (Funds Transfer Pricing)?**  
A: The platform includes FTP rules and assignment capabilities. You can define FTP rates by product and tenor, assign FTP to positions, and analyze profitability on a transfer-priced basis. FTP assumptions are versioned and governed like other rules.

**Q: Can we analyze liquidity at different time horizons?**  
A: Yes, time bucket definitions are configurable via Time Bucket rules. You can define custom bucket structures for different analysis horizons (e.g., intraday, 1-week, 1-month, 1-year). The maturity and repricing gap analysis uses the active Time Bucket rule.

**Q: How does the platform handle multi-currency liquidity?**  
A: The platform includes FX position analysis showing assets, liabilities, and net positions by currency. All calculations are performed in the reporting currency with FX conversion applied at the position level. The aggregate FX position uses the conservative absolute value method.

### Finance

**Q: How are profitability metrics integrated with risk metrics?**  
A: All metrics read from the same run, ensuring consistency. The same positions that drive LCR and NSFR also drive NIM and NPL ratio. This enables direct analysis of risk-return trade-offs. Changes in assumptions affect both risk and profitability consistently.

**Q: Can we reconcile platform figures with the General Ledger?**  
A: Yes, the GL Reconciliation screen compares position totals against General Ledger balances by account class. Differences are flagged for investigation. This ensures that the platform's position data matches the source of truth.

**Q: How does the platform handle non-interest income?**  
A: If fee and non-interest income data is ingested, it's included in profitability calculations. If not available, metrics that require it (like interest income as a percentage of total income) are explicitly set to null rather than fabricated, preventing misleading figures.

**Q: Can we analyze profitability by business line or product?**  
A: The current implementation provides aggregate profitability ratios. Segment-level analysis would require dimensional analysis capabilities that could be added as an enhancement, using the same underlying position data.

### Technology

**Q: How is the platform deployed?**  
A: The platform is cloud-native and designed for enterprise deployment. It can be deployed in public cloud, private cloud, or on-premise environments. The architecture supports multi-tenant deployment for groups with multiple affiliates.

**Q: What APIs are available for integration?**  
A: The platform provides RESTful APIs for data ingestion, calculation execution, and results retrieval. APIs support integration with core banking systems, data warehouses, and reporting platforms. API access is controlled via the same role-based permissions as the UI.

**Q: How does the platform handle large balance sheets?**  
A: The platform is optimized for performance with large balance sheets. Calculations use efficient algorithms and data structures. The run-based architecture ensures that calculations are performed once and results are stored, enabling fast retrieval for reporting and analysis.

**Q: What security controls are in place?**  
A: The platform includes enterprise-grade security: role-based access control, encryption at rest and in transit, audit logging of all actions, maker-checker workflows for critical changes, and session management. Security is aligned with industry best practices.

### Information Security

**Q: How is access controlled?**  
A: Access is controlled via role-based permissions. Users are assigned one of seven roles (Administrator, Affiliate Administrator, Risk Analyst, Treasury User, Executive Viewer, Control Tester, Reporting User) with specific permissions. Scope isolation ensures non-Group users can only access their own affiliate's data.

**Q: What audit capabilities are available?**  
A: The platform includes comprehensive audit logging: all user actions, rule changes, run executions, and data loads are logged. The Audit Log screen provides searchable access to the audit trail. Audit events are linked to specific users and timestamps.

**Q: How is data protected?**  
A: Data is encrypted at rest and in transit. Access is controlled via role-based permissions with scope isolation. The platform supports data residency requirements through configurable deployment options. Backup and disaster recovery capabilities are included.

**Q: How are regulatory reporting requirements met?**  
A: The platform includes pre-built regulatory reports for Basel III metrics (LCR, NSFR, IRRBB). Report packs can be configured for specific regulatory requirements. All figures are traceable to underlying positions and assumptions, supporting regulatory audit.

### Business

**Q: How long does it take to implement the platform?**  
A: Implementation timelines vary based on data availability and complexity. Typical implementations range from 3-6 months for single affiliates to 6-12 months for multi-affiliate groups. The phased approach allows early value delivery while building toward full functionality.

**Q: What training is required?**  
A: The platform is designed for ease of use with intuitive interfaces. Training typically covers: data loading and validation, rule configuration, run execution, results analysis, and reporting. Administrator training covers user management and system configuration.

**Q: What ongoing support is required?**  
A: Ongoing support requirements are minimal: data loading (often automated), rule updates as business changes, and user management. The platform is designed for low operational overhead with automated calculation and reporting.

**Q: How does the platform scale as the business grows?**  
A: The platform is designed for scalability: it can handle growing balance sheets, additional affiliates, and increased user counts. The cloud-native architecture supports horizontal scaling. The multi-affiliate design supports group expansion.

### Group Transformation

**Q: How does the platform support group consolidation?**  
A: The platform is designed for multi-affiliate groups from the ground up. Group-level aggregation is native, allowing consistent calculation across all affiliates. Affiliate-level autonomy is preserved through scope isolation and affiliate-specific rules.

**Q: Can different affiliates have different configurations?**  
A: Yes, rules (Time Buckets, Behavioural Patterns, Product Characteristics, etc.) can be defined at Group level or affiliate level. This allows standardization where needed and customization where required. The platform shows which rule version was used for each run.

**Q: How does the platform handle intercompany positions?**  
A: Intercompany positions can be handled through mapping and exclusion rules. The platform supports both consolidated views (eliminating intercompany) and standalone views (including intercompany). Treatment is configurable based on reporting requirements.

**Q: What's the migration path from legacy systems?**  
A: The platform supports phased migration: start with risk analytics while keeping legacy systems for operational processes, then migrate functionality over time. The API-first design facilitates integration with existing systems during transition.

---

## MEMORY MAPS

### Liquidity Risk Memory Map

"Are we liquid enough?"
↓ LCR: 30-day stress buffer
↓ NSFR: 1-year funding stability
↓ Survival Horizon: Days without new funding
↓ Loan-to-Deposit: Funding structure
↓ "When does the pressure occur?"
↓ Maturity Gap: Cash flow timing
↓ Behavioural Gap: Realistic cash flow timing
↓ "Who provides the funding?"
↓ Concentration: Depositor diversity
↓ Affiliate Funding: Group diversification
↓ "Are we within appetite?"
↓ LCR Threshold: 100% regulatory, 130% internal
↓ NSFR Threshold: 100% regulatory
↓ "What happens under stress?"
↓ What-If Scenarios: Stress multipliers
↓ Survival Horizon under stress

### Interest Rate Risk Memory Map

"Earnings at risk?"
↓ NII Sensitivity: Earnings impact
↓ Repricing Gap: Driver of NII
↓ Deposit Betas: Refine NII
↓ "Economic value at risk?"
↓ EVE Sensitivity: Capital impact
↓ Duration Gap: Driver of EVE
↓ Supervisory Outlier: ±15% test
↓ "What shocks matter?"
↓ Six Basel Scenarios: Comprehensive view
↓ Worst Case: Regulatory focus
↓ "How do we manage it?"
↓ Hedging: Implied by analysis
↓ Product Mix: Strategic decisions
↓ Funding Mix: Liability management

### Behavioural Modelling Memory Map

"How realistic are our assumptions?"
↓ Core Share: Overall stability
↓ Behavioural Patterns: Tenor-based splits
↓ Activity Adjustments: Usage-based refinement
↓ "What's unmodelled?"
↓ Unattributed Tags: Data quality
↓ Unmodelled Positions: Coverage gaps
↓ "How do we improve?"
↓ Historical Calibration: Data-driven
↓ Pattern Updates: Governed changes
↓ Recalibration: Rule-based process

### Concentration Risk Memory Map

"How diverse is our funding?"
↓ Largest Depositor: Single point of failure
↓ Top Five: Concentration in top few
↓ Herfindahl: Overall structure
↓ "Where are the risks?"
↓ Large Exposures: >10% thresholds
↓ Monitoring: >5% thresholds
↓ "How do we fix it?"
↓ Diversification: Strategic focus
↓ Relationship Management: Large depositor engagement
↓ Funding Alternatives: Reduce dependence

### Profitability Memory Map

"How efficient are we?"
↓ NIM: Spread earning efficiency
↓ Asset Quality: Credit risk impact
↓ NPL Ratio: Asset deterioration
↓ NPL Coverage: Provisioning adequacy
↓ "What's the trade-off?"
↓ Risk vs Return: Integrated analysis
↓ Liquidity Cost: Holding HQLA
↓ Funding Cost: Stable vs volatile
↓ "How do we improve?"
↓ Product Mix: Higher-margin products
↓ Pricing: Risk-adjusted pricing
↓ Cost Management: Non-earning assets

---

## NUMBERS TO REMEMBER

### Key Demonstration Numbers

All figures below are Ecobank Nigeria, run as of 31 July 2026 — the only affiliate with a full, clean position book today (see the Group Aggregation caveat in Section 9). These are real computed outputs of the engine against the seeded demo data, not illustrative ranges.

| Metric | Value | Status | Screen | Meaning | Why It Matters |
|--------|-------|--------|--------|---------|----------------|
| LCR | 168.9% | Green | Dashboard, Liquidity Risk | 30-day stress buffer | Regulatory minimum is 100%; internal target 130% |
| NSFR | 103.6% | Amber | Dashboard, Liquidity Risk | 1-year funding stability | Above the 100% floor, inside our own 100–105% amber band |
| Survival Horizon | 13 days | Red | Dashboard, Stress Testing | Days without new funding under stress | Internal red band starts at 20 days |
| Loan-to-Deposit | 78.6% | Amber (Group) / Green (NG floor) | Dashboard, Liquidity Risk, Profitability | Funding structure | Two limits apply to Nigeria: a Group ceiling and a CBN floor |
| NII Sensitivity | −8.06% | Amber | Dashboard, IRRBB | Earnings impact of a +200bp shock | Internal amber band starts at −8% |
| EVE Sensitivity | −13.81% of equity | Amber, not a Basel outlier | Dashboard, IRRBB, Stress Testing | Capital impact of the worst of six shocks (parallel up) | Basel outlier line is ±15% — three points of headroom |
| Duration Gap | +0.91 years | — | IRRBB | Assets reprice slower than liabilities | Positive = asset-sensitive |
| Core Share | 68.2% | Not yet limit-graded | Behavioural Analysis | Deposit stability | Ranges 95% (Retail Core) down to 15% (Corporate Non-Op) underneath |
| Largest Depositor | 52.9% | Red | Concentration | Single concentration | A pooled retail counterparty bucket, not one institutional name — see caveat |
| Herfindahl Index | 3,728 | Highly concentrated | Concentration | Overall funding concentration | Driven partly by only 4 counterparties in this demo book |
| NPL Ratio | 0.0% | Green | Profitability | Asset quality | No positions currently classified Substandard/Doubtful/Loss |
| NIM | 9.79% | — | Profitability | Earnings efficiency | Interest income 230.1 less expense 86.0, over assets 1,471.0 |
| FX Net Open Position | ~100% of capital | Critical (Red) | FX Position | Currency mismatch | Artifact of a single-currency (NGN) demo book — see caveat |

### Threshold Numbers to Remember

These are the actual limits configured in `src/data/seed/limits.ts` today, not assumed regulatory conventions — several differ from typical industry rules of thumb, which is itself worth knowing before a stakeholder asks "why 105% and not 110%?"

| Threshold | Green / Amber / Red | Metric | Context |
|----------|---------------------|--------|---------|
| LCR | ≥130% / ≥115% / <115% | LCR | Regulatory minimum 100% |
| NSFR | ≥110% / ≥105% / <105% | NSFR | Regulatory minimum 100% |
| Survival Horizon | ≥30 / ≥25 / ≤20 days | Survival Horizon | No regulatory minimum configured |
| Loan-to-Deposit (Group ceiling) | ≤75% / ≤85% / ≤95% | LDR | Applies to every affiliate except Nigeria |
| Loan-to-Deposit (Nigeria, CBN floor) | ≥70% / ≥67% / ≥65% | LDR | A floor, not a ceiling — overrides the Group limit for NG |
| Largest Single Depositor | ≤5% / ≤10% / ≤15% | Concentration | No regulatory minimum configured |
| Top-10 Depositor Concentration | ≤25% / ≤40% / ≤50% | Concentration | No regulatory minimum configured |
| NPL Ratio | ≤3% / ≤5% / ≤8% | NPL Ratio | No regulatory minimum configured |
| NPL Coverage | ≥100% / ≥80% / <80% | NPL Coverage | No regulatory minimum configured |
| EVE Sensitivity | ≥−8% / ≥−12% / ≤−15% | EVE | Basel supervisory outlier test at −15% |
| NII Sensitivity | ≥−5% / ≥−8% / ≤−12% | NII | No regulatory minimum configured |
| Aggregate FX Net Open Position | ≤10% / ≤15% / ≥20% | FX Position | Regulatory ceiling 20% |
| Core Share | — | Core Share | **Not yet configured** — no limit exists for this metric today |
| Non-Earning Asset Ratio | — | Non-Earning Ratio | **Not yet configured** — no limit exists for this metric today |

---

## FINAL QUALITY CHECK

### Verification Checklist

- ✅ Every major screen has been covered (Dashboard, Liquidity Risk, Maturity & Repricing Gap, Behavioural Analysis, IRRBB, Concentration, Profitability)
- ✅ Every important visible metric has been addressed
- ✅ Every metric has a banking interpretation
- ✅ Every important metric has a calculation explanation
- ✅ Actual application implementation is used as source of truth
- ✅ No functionality has been invented
- ✅ The spoken script sounds natural and executive
- ✅ The presenter is told where to point on each screen
- ✅ Acronyms are expanded in spoken language
- ✅ Technical detail is separated from live speech
- ✅ Executive implications are clearly stated
- ✅ Transitions connect the screens logically
- ✅ RFP requirements are mapped to capabilities
- ✅ Timing is realistic for a 45-60 minute demonstration
- ✅ Likely questions are covered for each stakeholder group
- ✅ Memory maps help the presenter remember the story
- ✅ Numbers to remember are provided for key metrics

### Demonstration Pacing

**Introduction & Dashboard (10 minutes):** Set the stage, show the executive view, explain the run-based architecture, cover the four headline metrics.

**Liquidity Deep Dive (10 minutes):** LCR and NSFR breakdown, maturity gap analysis, behavioural vs contractual views, concentration analysis.

**Interest Rate Risk (10 minutes):** NII and EVE sensitivity, six Basel scenarios, duration gap, repricing analysis.

**Behavioural Modelling (5 minutes):** Core/volatile split, behavioural patterns, activity adjustments, recalibration process.

**Concentration & Profitability (5 minutes):** Depositor concentration, large exposures, profitability ratios, asset quality.

**Stress Testing & What-If (5 minutes):** Scenario builder, stress multipliers, historical comparison, decision support.

**Governance & Controls (5 minutes):** Rule versioning, audit trail, access controls, data validation, regulatory reporting.

**Q&A (Remaining time):** Address stakeholder-specific questions, demonstrate additional capabilities as requested.

### Key Messages to Emphasize

1. **Single Source of Truth:** Every metric reads from the same run, ensuring consistency and eliminating reconciliation.

2. **Defensible Figures:** All assumptions are versioned and governed. Historical runs always use the assumptions current at the time.

3. **Executive-Ready:** The dashboard provides the numbers executives need for ALCO meetings and daily monitoring.

4. **Regulatory Alignment:** Full Basel III implementation for LCR, NSFR, and IRRBB with supervisory outlier testing.

5. **Integration:** Risk and profitability are integrated, enabling analysis of risk-return trade-offs.

6. **Transparency:** Every figure is traceable to underlying positions and assumptions. Methodology notes explain calculation approaches.

7. **Governance:** Role-based access, maker-checker workflows, audit logging, and rule versioning provide strong governance.

8. **Scalability:** Designed for multi-affiliate groups with configurable rules at both Group and affiliate levels.

---

This coaching guide provides a comprehensive framework for delivering an executive-ready ALM demonstration. It combines technical depth with business context, ensuring the presenter can answer both "how does it work" and "why does it matter" questions from senior banking executives.

---

# ECOBANK DEMONSTRATION SCRIPT (AGENDA FLOW)

**A note on which script to use:** everything above this line (Screens 1–7) is the compressed, ~45–60 minute version, organized screen-by-screen. What follows is a longer, ~2-hour, section-by-section version covering the same material plus data management, FTP, stress testing, group aggregation and access control in more depth, organized around an Ecobank-specific agenda. Pick one based on the time slot you actually have — don't try to deliver both. The real figures, thresholds and caveats (see "Read This First" near the top of this document) apply identically to both.

## SECTION 1: Opening & Demonstration Rules (5 minutes)

"Good morning, and thank you for the opportunity to demonstrate our ALM solution. You'll see the actual application in action today, not slides — every number I show you is calculated live from real position data, and every one of them is traceable back to the positions and assumptions that produced it.

Our goal is to show how this platform addresses the RFP requirements across data management, liquidity risk, interest rate risk, behavioural modelling, FTP, stress testing and governance, using a multi-affiliate group structure similar to Ecobank's — Group level down to individual country entities, everything reading from a single as-of-date run so the numbers stay consistent with each other.

As we go through each screen, I'll walk it top to bottom and explain every number on it — not just the headline ones — what it means, how it's calculated, and why your teams would actually look at it. Jump in with questions any time.

I'm logged in with full Group access so we can move freely across every screen today. I'll come back at the end and show you exactly what changes when someone logs in with a narrower role — that'll make more sense once you've seen what there is to restrict.

Let's start with the Executive Dashboard."

---

## SECTION 1.5: Platform Navigation & Structure (3 minutes)

[Switch to Executive Dashboard and show sidebar]

"This is the Executive Dashboard, and before we get into the numbers, it's worth a moment on how the whole platform is laid out, because it tells you something about how it's meant to be used. Look at the sidebar: Overview holds just the dashboard. Risk Management groups Liquidity Risk, IRRBB & Behavioural Risk, Stress Testing and Concentration & Risk Monitoring — that's where your Risk team lives. Treasury groups FTP & Profitability and Balance Sheet & Treasury. Then Reporting, Data Management, Execution, Configuration, Group & Affiliate Management, and Administration. That grouping mirrors your own org chart, and it's not cosmetic — a Risk Analyst signs in and simply never sees an administration screen, not because we hid a button, but because their role doesn't carry that permission. The interface adapts to the person, not the other way round.

Now the dashboard itself, from the top. In the top right sits the run selector, and this is the single most important control on the page: every number below it reads from the one run selected there. That's what 'single source of truth' actually means in practice — there's no second query running quietly in the background that could disagree with what you're looking at. Beside it, the scope tells you Group or a specific affiliate, and the as-of date tells you which day's book this is.

Reading left to right across the top row: the **Liquidity Coverage Ratio** — whether we hold enough high-quality liquid assets to survive a 30-day funding stress. It's built from two things every position carries: whether it's tagged as a liquid asset the regulator recognises, and how fast that type of funding is assumed to run off under stress. Basel's floor is 100%; Nigeria is at 168.9%, comfortably above our own internal target of 130% — Green.

Next to it, the **Net Stable Funding Ratio** — the same idea stretched over a full year instead of thirty days: do we have enough stable, long-lasting funding to support the assets we hold. It comes from the same per-position data, just asking a different question of it — how stable is this funding, and how much stable funding does this asset actually need. Again a 100% floor, and we're at 103.6% — above the floor, but inside our own internal amber band, which starts at 105%.

Then **Survival Horizon** — a blunter question than either ratio: if every funding source ran off starting today, how many days could we keep operating using only our liquid assets? That's built by dividing our liquid assets by how fast cash is expected to go out the door each day. We're showing 13 days — inside our internal red band, and the sharpest number on this page.

And **Loan-to-Deposit**, customer loans measured against customer deposits — 78.6% here, built straight from the loan and deposit balances in the position book. Against the Group's own ceiling that's Amber; against the CBN's floor for Nigeria specifically, the same number is Green — both readings are real and both matter.

Below those four cards, the rate-shock chart shows the impact on capital under all six shock scenarios the regulator prescribes — rates moving up in parallel, down in parallel, the curve steepening, flattening, and short-term rates moving up or down on their own — each one applied to the same yield curve and position data as everything else on this page. Dashed lines mark a threshold set at fifteen percent of capital either way; cross it and you trigger a mandatory regulatory review. Beside the chart, the Market & Rate Monitor keeps the whole dashboard tied to today's actual market — policy rates, interbank rates, foreign-exchange benchmarks — so nothing here floats free of reality.

Then a risk snapshot with five more numbers, each fed by the same run and each earning its place: **Net Interest Income sensitivity**, at −8.06% under a +200bp move — how much a rate shock would move this year's earnings, built from which assets and liabilities reprice within that shock horizon; **Economic Value of Equity sensitivity**, at −13.81% of equity under the worst of the six shocks — how much the same kind of move would move the value of our capital over the life of the whole book, built from the average duration of our assets against our liabilities; our **largest depositor's concentration**, at 52.9% — the single biggest funding vulnerability, expressed as that depositor's share of total deposits (a figure I'll caveat properly on the Concentration screen — it's a pooled retail bucket in this demo book, not one institutional name); **the Non-Performing Loan ratio**, a clean 0.0% today — how much of the loan book isn't performing, taken directly from how each loan is classified in the position data; and **net interest margin**, at 9.79% — what we're actually earning on the spread between what we charge and what we pay, as a share of our assets. Those are the five numbers Risk and Treasury check right after the four headline cards.

Below that, **Active Breaches** — any limit that's currently broken, sitting in plain sight rather than something you'd have to go looking for. And at the bottom, the balance sheet shape: total assets, interest income, interest expense and net interest income, the size and earnings profile everything above it sits on top of.

Every one of these is clickable. Click the Liquidity Coverage Ratio, you land on its full breakdown of liquid assets and cash flows. Click concentration, you get the depositor table behind it. Nothing on this page is a dead end — it's a way in.

Let's follow that in — starting with where the data actually comes from."

---

## SECTION 2: Data, Product & Cash-Flow Management (10 minutes)

[Switch to Data Management screens]

"Everything downstream depends on this section, so it's worth the ten minutes.

Start with how data gets in at all, on the Connectors & Data Sources screen. This is a feed map, one row per data domain per affiliate, showing exactly how each one is fed — a system connector or a manual file — so nothing is ambiguous about where a number originated. On the connector side, we ship with the core systems you'd actually run: Oracle Flexcube for core banking, Refinitiv for market rates, Bloomberg as an alternative market-data source, and Calypso for treasury and derivatives — each one configurable with its own connection details, and testable right here before you trust it, with a genuine test-connection check rather than just a saved setting. If a domain isn't fed by a live connector, it falls back to file upload instead, which is what we'll look at next.

Next, how a product actually behaves once it's in the system — that's the Product Characteristics screen, and it's worth walking every column on it, because these fields are what every downstream ratio is actually built from. For each product: which currency it's priced in; its Liquidity Coverage Ratio treatment — which liquid-asset category it sits in, if any, and how fast it's assumed to run off under stress; its funding-stability and asset-stability factors for the Net Stable Funding Ratio; which high-quality-liquid-asset level it falls into, if it qualifies at all; the haircut applied to its value if it does; and its duration, the figure that ultimately rolls up into the duration gap we'll see on the interest-rate-risk screen. Every one of those is a field on the position itself, not a guess based on what the product is called — that precision is what a regulatory number actually needs underneath it.

Each position also carries its own maturity date, next repricing date and interest rate. Fixed-rate positions only reprice at maturity; floating-rate positions reprice on their next reset date — hold onto that distinction, because it's what separates the liquidity gap from the repricing gap you'll see shortly; they're not the same ladder.

For currencies and curves, the Currency & Foreign-Exchange Rates screen holds our foreign-exchange rate library, and Yield Curves holds our interest rate curve library — multiple currencies, multiple tenors, with historical curves available for back-testing.

Now let's actually put a file through the system, on the Data Upload & Staging screen, because this is the step every other number in the platform ultimately rests on. Pick the domain — positions, counterparties, whichever data type we're loading — and the as-of date, then upload the file. It doesn't commit immediately: the rows land in a staging area first, where you can see exactly how many rows were staged, and any validation issues sitting against them — a bad currency code, a missing maturity date, whatever the configured rules catch. There's a balance check too, assets against liabilities and capital, so an obviously broken file gets caught before it goes anywhere near a calculation. Only once that's clean do we commit the batch — and if a domain is already fed automatically by one of the connectors we just looked at, the platform won't even offer a manual upload for it; you'd be feeding the same domain twice from two different sources otherwise, and it's better to make that impossible than to warn about it.

Once committed, we check it against your own books: the General Ledger Reconciliation screen compares our position totals to your General Ledger by account class — instrument data on one side, the ledger on the other — and shows the variance between them. Where a small variance is expected and explainable, it can be approved as a plug; the period is then formally signed off, which is itself a recorded action, not a quiet checkbox.

That's the data side. Now the pivot point of the entire demo: the Process Run screen. This is genuinely the one screen everything else depends on, so it's worth pausing on properly. You choose an as-of date, a scope — Group or a specific affiliate — and which calculation elements to include: liquidity ratios, gap analysis, interest-rate sensitivity, concentration, profitability, whichever combination you need. You also choose whether it's a static run, using the balance sheet exactly as it stands, or a dynamic one that layers in new business assumptions — we'll come back to that distinction later. Before you can execute, the screen tells you plainly whether you're ready or blocked — a missing exchange rate, an unselected rule, no committed data for that date — so a run either succeeds cleanly or fails loudly, never silently with a wrong number. Once it executes, that run becomes the fixed, named snapshot every results screen from here on reads from. Nothing past this point is calculated fresh each time you look at it — it's all reading back what this run already produced.

Last point on data generally, and it applies everywhere from here on: click any figure in any results screen and it drills straight back to the positions that produced it. We never lose that granularity — that traceability is what an audit actually needs.

With the data prepared and a run executed, let's look at what it actually calculated, starting with liquidity."

---

## SECTION 3: Liquidity Risk Management (20 minutes)

[Switch to Liquidity Risk screen]

"This is the biggest block of the demo, and deliberately so — liquidity is where your multi-country footprint and diverse funding base matter most. We'll move through five screens here, each answering a different question about the same underlying liquidity position.

**First, the Liquidity Risk screen itself.** Four cards at the top, reading Nigeria as of 31 July 2026. The **Liquidity Coverage Ratio** — 168.9%, well above both the 100% floor and our 130% internal target — with the full breakdown underneath it: high-quality liquid assets of 348.1 by level (309.7 Level 1, 38.4 Level 2A), gross outflows of 281.3, gross inflows of 75.2, and net outflows of 206.1 after the regulator's 75% cap on how much inflow you're allowed to rely on (we're nowhere near that cap binding today). The **Net Stable Funding Ratio** next to it — 103.6% available stable funding (918.7) against required (886.5), a surplus of roughly 3.6 percentage points, which is real but sits inside our own internal amber band rather than clean Green. Then **Loan-to-Deposit** at 78.6% — Amber against the Group ceiling, Green against Nigeria's own CBN floor. And a fourth card, **largest affiliate deposit share** — how much of the Group's total deposit funding sits with a single affiliate. At single-affiliate scope this trivially reads 100%, since Nigeria is the only affiliate in view; genuinely comparing Nigeria against Ghana and Côte d'Ivoire needs those two affiliates carrying full position books rather than the small onboarding-stub datasets they hold today — worth being upfront about that if the conversation moves to Group scope.

Below the cards, the **Maturity Gap** chart: assets in blue, liabilities in gray, by time bucket, with the net gap in green — when cash is coming in, when it has to go out, built straight from each position's maturity date. A toggle above it switches between Behavioural and Contractual views — Contractual shows cash movement exactly as contracts say it will happen; Behavioural applies our run-off assumptions to non-maturity deposits like savings accounts, which is the more realistic view for actual planning, because a savings balance doesn't really behave the way its contract implies. Beside that chart, **Deposit Concentration by Affiliate** shows each affiliate's share of Group deposit funding as a simple bar. And below both, **Cross-Currency Funding Position** — assets, liabilities and net position broken out by settlement currency, built by converting every position at the run's foreign-exchange rate — this is where a currency mismatch would show up even if the overall book looks balanced in your reporting currency.

**Second, the Liquidity Risk Map.** This is the Group-wide view in one table: every Live affiliate, its severity rating, its Liquidity Coverage Ratio, its share of Group deposits, its net position, and its total assets and liabilities side by side — colour-coded low, medium or high risk, so a Group Risk officer can see in one glance which country needs attention without opening each affiliate individually. Three summary counts sit above it: how many affiliates are currently high, medium and low risk.

**Third, Maturity & Repricing Gap.** This screen exists because two different questions get confused with each other constantly: when does cash actually move, and when does an interest rate reset. A toggle switches the whole screen between the two, and they're genuinely different bucket structures underneath, not one ladder read two ways — the liquidity ladder groups the near term into Overnight, 2–7 Days and 8–30 Days; the repricing ladder groups the same window into a single 0–30 Days bucket. On Nigeria's book, the front bucket runs −772.3 on the contractual liquidity ladder against −733.5 on the repricing ladder — that roughly 38.7 difference is the floating-rate book made visible, and you read it by comparing the two tables rather than from an on-screen indicator. Below the chart, two more figures: the **cumulative gap**, a running total across every bucket in order, telling you whether the balance sheet is net asset- or net liability-heavy at each point in time — for Nigeria it runs negative from the front bucket onward and closes to zero at the far end, as the assets-equal-liabilities-plus-capital identity requires; and the **widest negative bucket**, which simply names the single time period under the most cash-flow pressure — 8–30 Days for Nigeria on both views, though the size of the pressure differs sharply between contractual and behavioural. On the repricing view specifically, you'll also see a non-rate-sensitive bucket appear — equity and fixed assets that never reprice at all, held separately rather than forced into a tenor bucket where they'd distort the picture.

**Fourth, Concentration & Large Exposures** — funding concentration is really a liquidity question in disguise, so it earns its own dedicated screen. At the top: total **deposit base** (903.2 for Nigeria), the **largest depositor** as a percentage of it — 52.9% here — **top five** and **top ten** depositor shares, and the **Herfindahl index** at 3,728 — a single number built by squaring every depositor's percentage share and summing them, so a handful of large depositors move it far more than many small ones. Below 1,500 reads as diversified, 1,500 to 2,500 as moderately concentrated, above 2,500 as highly concentrated — Nigeria is highly concentrated on this run. I'll flag one thing honestly here: Nigeria's demo book only has four counterparty codes mapped, and the largest is a pooled retail-deposit bucket rather than one institutional name, so top-five and top-ten both round to 100% and the largest-depositor figure overstates true single-name risk. It's a genuinely useful moment to talk about why counterparty mapping quality drives whether this metric means anything. Below those headline numbers sits the full largest-depositors table, built from the same position data mapped to each customer, with any depositor above 10% flagged as a large exposure and above 5% flagged as worth watching. If deposits carry no counterparty mapping at all, they're reported separately rather than silently dropped or folded into an average — dropping them would understate the funding base, folding them in would effectively invent one very large fictitious depositor, and either would quietly distort the whole measure.

**Fifth, Stress Testing.** This is where we ask what liquidity looks like on the worst day, not an average one. The screen takes the worst of the regulator's prescribed rate shocks — parallel up, for Nigeria — and shows its impact on the economic value of equity, −13.81% of equity, as the headline figure, then carries the liquidity story through to Survival Horizon: 13 days, the same figure from the dashboard, now shown against its own timeline. Alongside it: counterbalancing capacity of 348.1 — currently HQLA alone, since no committed backup lines or other marketable assets are loaded for this affiliate yet, which is itself worth naming as a gap to close before relying on this figure operationally. A survival timeline chart underneath plots that runway day by day: the buffer is drawn down steadily and the position goes negative on day 14, which is why the survival horizon reads 13 — the last day it's still non-negative.

**And finally, Limits & Breaches.** Every metric we've just walked through has a configured limit sitting behind it — the regulator's own minimum, our internal appetite, and an early-warning threshold set inside both — checked automatically the moment a run completes. If we're in breach anywhere, it's shown here with the current value against the limit, and a note capturing why and what's being done about it.

Every one of these five screens is reading the same run, the same positions, the same behavioural assumptions. None of them can quietly disagree with each other, because none of them is doing its own separate calculation."

---

## SECTION 4: IRRBB, Gap & Duration Analysis (20 minutes)

[Switch to IRRBB screen]

"Interest rate risk in the banking book splits into two questions — what does a rate move do to this year's earnings, and what does it do to the value of everything we hold — and this screen answers both.

At the top, the six-shock chart: all six scenarios the regulator prescribes — parallel up, parallel down, steepener, flattener, short rate up, short rate down — showing the earnings impact and the economic-value impact side by side for each, both introduced a moment ago on the dashboard, with the fifteen-percent line marking the same outlier threshold. This is the same battery of six shocks we saw a moment ago on the Stress Testing screen, just read here through the earnings-and-value lens instead of the survival-days lens. Below it, the yield curve for our reporting currency — the actual curve those six shocks get applied to.

On the earnings side: **Net Interest Income sensitivity** — a move of two hundred basis points changes net interest income by −8.06% over 365 days. The driver underneath it is the **repricing gap**, shown just below — 419.4 of rate-sensitive assets against 1,000 of rate-sensitive liabilities repricing within the year, a gap of −580.6, built from each position's next repricing date rather than its maturity date. This is a different ladder from the maturity gap you saw a moment ago: it's about when a rate resets, not when cash actually moves. A floating-rate loan can sit on the books for five years without maturing, but its rate might reset next month — the gap between those two ladders is effectively your floating-rate book.

On the economic-value side: **Economic Value of Equity sensitivity** — −13.81% of capital under the same +200bp move (and the worst of the six scenarios at that), inside that fifteen-percent threshold but only by about three points. Underneath it, **asset duration** at 1.48 years and **liability duration** at 0.66 years shown separately — the weighted average duration of each side of the balance sheet on its own — and the **duration gap** built directly from the two of them, +0.91 years: positive means our assets reprice more slowly than our liabilities, so we're asset-sensitive and a rate rise reduces value. Beside those, one more figure worth naming properly: the **Present Value of a one-hundredth-of-a-percentage-point move**, often shortened to PV01 — the change in economic value from just that one small a move in rates, built from the same duration gap, and the number a hedging desk actually works from day to day. There's also a capital basis indicator sitting alongside all of this — whether the sensitivity is measured against Tier 1 regulatory capital or plain balance-sheet equity. Nigeria is running on balance-sheet equity today, because no Tier 1 figure has been loaded for this affiliate — worth naming plainly rather than letting it pass as if it were the regulatory figure.

A couple of honest boundaries worth naming while we're here. Basis risk between different reference rates isn't a separate built-in metric — you'd model it as a custom scenario in the What-If Builder, applying different shocks to different segments of the book. And optionality — things like a borrower's right to prepay — isn't modelled as an embedded option directly; the current approach uses duration approximation and approximates prepayment behaviour through behavioural patterns instead. Full option-adjusted modelling needs contract-level cash-flow schedules that most ledger-grain data doesn't carry, so we're honest about that rather than pretending otherwise.

One more lever: deposit betas, configurable elsewhere in the platform, let you assume less than 100% rate pass-through on deposits — usually more realistic than assuming a full pass-through — and they feed directly into the same repricing profile driving both this screen and the liquidity gap.

Now let's actually build one of these shocks from scratch, on the Forecast Scenarios screen under Configuration. Start a new scenario, and you can either take one of the six shocks the regulator prescribes as a starting point — a button click each for parallel up, parallel down, and the rest, prefilled at the standard magnitude, two hundred basis points for a parallel move — or build your own from an empty bucket grid, setting a different rate movement at each tenor point by hand. You can even condition a scenario on an economic indicator, so it only applies under a specific macro assumption rather than unconditionally. Save it, and it's available everywhere a scenario can be selected, versioned like everything else we've configured today.

Every scenario here, regulator-prescribed or custom, is versioned and reusable, and both views on the sensitivity screen — earnings and economic value — come from exactly the same underlying data, not two separate calculations that happen to agree."

---

## SECTION 5: Behavioural Modelling & Assumptions (15 minutes)

[Switch to Behavioural Analysis screen]

"This is genuinely the hardest part of ALM to get right, so let's be explicit about how we handle it rather than waving at a black box.

Starting at the top: **core share** — 68.2% of Nigeria's non-maturity deposits considered core, or stable, versus volatile, or likely to withdraw under stress. There's no configured warning threshold on this particular metric in the seed data today — unlike the ratios we've seen so far — so I'd present 68.2% on its own merits rather than against a specific line. Right beside it, **total deposits modelled** — 1,270,000 for Nigeria, covering all four tagged deposit lines — and, where it applies, an **unmodelled** warning naming any deposits carrying a behavioural tag with no matching pattern; on this run, nothing is unmodelled. That last one matters more than it sounds: rather than silently defaulting an unmatched position to some assumption, we surface it and force someone to look at it, because a silent default is exactly how a model quietly goes wrong.

Below that, a view toggle lets you group the same split three ways — by behavioural tag, by product, or by account activity — so you can see not just the overall core share but which specific products or which specific behaviour cohort is driving it. By tag, Nigeria ranges from 95% core on Retail Core deposits down to 15% core on Corporate Non-Operational balances. The activity view is where dormancy shows up directly: an account with zero movement in the period is classified Dormant and has its volatile share cut in half; low-turnover accounts get a smaller, 25% cut; a normally active account gets no adjustment at all. It's worth being precise here — activity only ever pulls balance toward core, it never pushes an active account to look *more* volatile than its product-level pattern already assumes. On Nigeria's book, the Retail Non-Core line is the clearest example: its pattern alone implies 32.5% volatile, but a Dormant classification halves that to 16.25%, landing the line at 67.5% core.

Below the chart, the patterns table shows exactly which behavioural pattern was applied to this run, broken out by tenor — for example, eighty percent core at thirty days, sixty percent at ninety days, forty percent at a year: deposits get less sticky the further out you look, which matches how people actually behave. Click into one and you're in the pattern editor itself — tenor points down one side, a core-versus-volatile share for each, with a built-in check that the split always sums to a hundred percent so a typo can't quietly leave money unaccounted for. Edit it, save it, and it becomes a new version, sitting alongside every prior version with its own owner and change history, all visible from the Business Rules list this pattern belongs to.

Further down on the main screen, prepayment rules — configurable by product and tenor, adjusting a loan's effective maturity, most material on mortgage books where prepayment risk is real money. And the volatile portion of the deposit split we looked at earlier is also where early-withdrawal risk lives — it can be pushed further under a severe-withdrawal scenario in the What-If Builder.

None of these assumptions are hardcoded. They're configurable, and where historical data exists, calibratable against it. Overrides are supported when genuinely needed, but they go through the same approval workflow and land in the audit trail — our default is always to fix the underlying rule rather than patch around it with a one-off override, because a patch doesn't help the next run.

Every rule, including these behavioural patterns, is versioned. Change one today and it never touches a historical run — each run keeps whichever version was live the moment it executed. That's what lets a figure stay defensible months later when someone asks how you got it, and it's also what makes back-testing possible: the run history lets you compare today's assumptions against how deposits actually behaved in the past.

And every change to a behavioural rule goes through maker-checker, with the audit trail recording who changed what and why. That governance, more than the modelling itself, is usually what gets a behavioural model accepted by a regulator."

---

## SECTION 6: FTP & Profitability (15 minutes)

[Switch to FTP and Profitability screens]

"Funds Transfer Pricing is where risk turns into return — let's see how a position's funding cost gets priced, and what falls out the other side.

Starting on the Funds Transfer Pricing results screen itself: the **total FTP margin** at the top — 181,485.71 (Naira terms) for Nigeria, the net margin earned across the whole book once every position has been charged its internal transfer rate — alongside how many positions were actually **priced** against a rate (all 26 deposit- and loan-bearing lines here) and how many are still **unpriced** (none, on this run), because an unpriced position is a data or configuration gap worth catching, not a number quietly left out of the total. Below that, **margin by business unit** — Nigeria's Lagos retail branch contributes the largest share at roughly 127,028, followed by mid-market corporate at 70,777, large corporates at 46,214, with Treasury negative at roughly −62,533 (Treasury funds the balance sheet at cost, so a negative contribution there is expected, not a red flag) — and an **adjustment stack** showing each add-on layered onto the base rate for a given position (none of the seeded adjustment rules are attached to this particular run, so the stack is empty today — a good prompt to configure one live if the room wants to see it work), and a **transfer rate detail** table giving the fully resolved rate, position by position, for anyone who wants to check the arithmetic themselves.

Where those rates come from: on FTP Rules, transfer pricing curves by product class and tenor, built from market rates, cost of funds, or internal benchmarks, each one versioned and settable per affiliate if your markets need different curves. We support matched-maturity pricing specifically — an asset's transfer price is set against the funding rate of a liability with a matching maturity, which keeps the Treasury book genuinely matched and charges each business unit for the real term structure of its funding, not an approximation of it. On top of that base curve sits the Adjustment Rules screen: a liquidity premium for longer, less-liquid products, so a unit creating liquidity risk is actually charged for it; a basis-risk cost for mismatches between reference rates; a pricing incentive where you deliberately want to steer behaviour — cheaper funding to encourage a product you want more of, for instance; and an adjustment driven directly by our Liquidity Coverage Ratio position, so the transfer price itself tightens automatically when the bank's own liquidity is under pressure, rather than that pressure only showing up after the fact.

Moving to Profitability Ratios: **net interest income**, 144.0 for Nigeria — interest income of 230.1 less interest expense of 86.0 — and **net interest margin** beside it — 9.79%, that same spread expressed as a share of total assets. **NPL ratio** — a clean 0.0% today, the share of the loan book that's non-performing, against the 5%-style threshold most regulators watch — with **NPL coverage** right next to it showing as no data rather than zero, because there's nothing non-performing to cover on this run. And the non-earning asset ratio alongside those at 27.6%, showing what share of assets aren't generating income at all — this one doesn't yet carry a configured internal limit, so it's informational rather than graded. Every graded metric here is plotted against its threshold on the ratios chart, so you can see at a glance whether we're inside acceptable range on all of them at once. All of it calculated from the exact same positions used for the risk metrics — profitability and risk can't quietly disagree, because they're not two separate calculations reading two separate datasets.

The position-level data already supports going finer than product level — customer or business-unit profitability is a matter of allocating FTP results along the right dimension, and the multi-affiliate structure is built to carry that.

Because FTP results sit in the same run as the risk metrics, you can put risk and return side by side and ask directly whether a high-risk activity is actually earning what it should."

---

## SECTION 7: Stress Testing, Scenario Analysis & Balance Sheet Forecasting (15 minutes)

[Switch to What-If Builder and Stress Testing screens]

"Everything so far has told you where things stand. Stress testing tells you what happens to those same numbers under pressure.

On the What-If Builder: build a custom scenario — interest rate shocks, foreign-exchange shocks, liquidity stress, behavioural changes — save it, reuse it, and it becomes part of a structured stress program rather than a one-off exercise. Beyond the six scenarios the regulator prescribes, you can define your own parallel shift, curve twist, or a fully bespoke shape, applied to the repricing gap for the earnings impact and the duration gap for the economic-value impact. On foreign exchange: shock a currency's rate and watch the cross-currency funding position move in response, so the liquidity risk that currency mismatch creates shows up directly rather than staying theoretical. On liquidity specifically: runoff multipliers, bigger haircuts on liquid assets, and inflow suppression each move the coverage ratio, the stable-funding ratio and survival horizon in real time as you adjust them.

Now back to Process Run for a moment, because there's a second mode on it worth showing honestly. Alongside Static — the balance sheet exactly as it stands, which is what every run we've looked at today has used — there's a Dynamic option, which lets you attach a New Business rule to the run. On the New Business screen itself, under Configuration, you can define assumptions for growth, pricing margin and maturity mix — how much new lending you expect to originate, at what margin, over what tenor. There's a companion screen, Transaction Strategies, for modelling a specific strategic move — a Eurobond issuance, an asset sale — as its own defined transaction. Both screens are real and fully configurable today, and selecting one on a run captures your intent and is recorded against that run for governance.

Where I want to be precise with you: right now, selecting a New Business rule or a Transaction Strategy tags the run with that intent, but the calculation engine itself still computes from the static balance sheet — it doesn't yet grow or reshape the book based on those assumptions. That's a genuine, scoped piece of work to close, not something I'd want to demonstrate as if it already changed the numbers. What the static, single-period model does give you today: you can define several different balance sheet configurations as entirely separate scenarios and compare the risk metrics across them side by side, and you can model a specific management action — an asset sale, funding diversification, a hedge — directly, by adjusting the position data itself before running a scenario, to see exactly what that action would do to the numbers."

---

## SECTION 8: Limits, Reporting & Management Information (10 minutes)

[Switch to Limits, Breaches, and Reporting screens]

"Everything we've calculated only matters if it's monitored and reported — that's this section.

Quickly back on Limits & Breaches, since we're on the topic: limits configured across every risk metric we've covered — the two liquidity ratios, concentration, the two rate-sensitivity measures, and more — at three levels: regulatory floor, internal appetite, and an early-warning threshold set inside both, checked automatically every time a run completes. Any breach shows which limit, the current value, the limit value, and when it happened, linked back to the exact run that caught it — that link is what makes a breach auditable rather than just a red flag someone remembers seeing. On Notifications: alerts and escalation rules by severity and how long a breach has been live.

Now, Reporting & ALCO — this is where reporting stops being a static export and becomes something your committee actually works from. Two pack types sit side by side: an ALCO pack and a Management pack, both built the same way — pick a source run through the same run picker you've seen everywhere today, choose which sections to include, and generate. The pack is built from that run's own results, not copied in by hand, so you can view it before it goes anywhere. Once it's ready, you can either email it directly from the screen or mark it distributed once it's gone out through your own channels — either way, that's a tracked step, not an assumption.

Every number in any of this stays drillable — the coverage ratio back to its breakdown, concentration back to the depositor table — because the point of a limit is to lead you somewhere useful, not just to turn red.

And underneath everything, the Audit Log: every entry shows who did it, what module it happened in, and the outcome — a breach note you just wrote, a behavioural rule change from earlier today, a run execution, a data load. That's the record that turns 'we monitor this' into something a regulator can actually verify, not just something we assert."

---

## SECTION 9: Group Aggregation, Regulatory & Architecture (7 minutes)

[Switch to Group/Affiliate Management and Administration screens]

"Last block — the pieces that make this actually work for a group your size and shape, not just a single-entity bank.

Start on the Affiliates screen, the Group directory. Four summary counts up top — how many affiliates exist, how many are Live, how many are still onboarding, how many have stale data — and below that, one row per affiliate: country, regulator, functional currency, current status, and a data-freshness flag showing whether its most recent load is current or ageing. Today that's three affiliates seeded: Nigeria (Live, full position book, 27 lines), and Ghana and Côte d'Ivoire (both still Onboarding — connectors configured, five illustrative position rows each, not yet a full book). An affiliate still onboarding can be resumed exactly where it was left off or cancelled outright, and a brand new one is added the same guided way, one affiliate at a time or in bulk from a template.

**A precise, honest note before switching scope.** The intent — and what the Affiliates screen communicates — is that Live status is what makes an affiliate's data trustworthy enough to roll into Group figures. Today, though, the calculation engine itself doesn't gate on that status field: a Group-scope run aggregates whatever committed position data exists for the selected date, regardless of whether the affiliate is Live or Onboarding. Combined with the fact that Ghana's and Côte d'Ivoire's onboarding datasets are small illustrative stubs — not full position books — running Group Consolidated live today actually produces nonsensical output: negative aggregate deposits, and a null Liquidity Coverage Ratio and Net Stable Funding Ratio, because the stub data carries a sign convention that doesn't net cleanly against Nigeria's book. **I would not run Group scope live in front of this audience until Ghana and Côte d'Ivoire carry real, full position books** — describe Group aggregation narratively instead, the way I'm about to, and treat it as a near-term data-completion item rather than a live click-through.

What *is* real and worth showing: switch scope, top right, to any affiliate and back, and watch the reporting currency and every figure update from the same run architecture — that part of the mechanism is genuinely there. Multi-country consolidation is native here, not bolted on afterward: load each country entity's data, calculate at entity level, aggregate to Group, and drill from a Group-level number straight back down to the specific entity driving it. Regulatory variation between countries is handled the same way we've handled every other assumption today — through configurable rules. Each affiliate can carry its own time-bucket definitions, behavioural patterns, product characteristics and limit structures, while still rolling up into one consistent Group view — once Ghana and Côte d'Ivoire actually have full books loaded, Group Consolidated becomes a live click-through rather than a described capability.

On integration: a set of programmatic interfaces — the same kind of connection point other software systems use to talk to each other automatically, without a person clicking through a screen — cover data ingestion, run execution and results retrieval, gated by the same role-based permissions as the screens themselves. The connectors we saw back in the data section sit on top of this same layer. On security: encryption at rest and in transit, role-based access, session management, full audit logging, and affiliate scoping enforced at the point data is actually queried, not just hidden in a menu somewhere.

And on deployment: cloud-native, fits public cloud, private cloud, or on-premise depending on your data residency needs, and scales horizontally as your balance sheet and user base grow. Adding a new country is configuring a new affiliate and loading its data — it's not a re-architecture.

If you've prepared a separate architecture or regulatory-alignment slide covering today's environment against production and named regulators across your markets, this is the natural point to bring it in — that's supplementary material alongside the application, not a live screen, so speak to it as your own prepared context rather than something I'd script for you here."

---

## SECTION 10: Q&A / Close (3 minutes)

"That's the platform, start to finish — data management, liquidity, interest rate risk, behavioural modelling, FTP, stress testing, limits and reporting, and group aggregation, all live rather than slides.

Five things worth holding onto:

1. **Single source of truth** — every metric you saw today reads from the same run
2. **Defensible figures** — every assumption is versioned and governed, so a number is reproducible months later
3. **Regulatory alignment** — full Basel III implementation for LCR, NSFR and IRRBB
4. **Group-ready** — built for multi-entity groups like Ecobank from the ground up, not retrofitted
5. **Risk and return together** — FTP and profitability read the exact positions risk does, so they never quietly disagree

One thing I promised earlier: exactly how access is scoped for a group your size. That's next, and then I'm entirely happy to take questions."

---

## SECTION 11: User Roles & Access Control (5 minutes)

[Log out and show the sign-in screen, or open Users & Roles if already logged in as Administrator]

"I've been logged in with full Group access all morning so we could move freely — let me show you what actually governs who sees what, which matters a great deal for a multi-country group like Ecobank.

Sign-in itself uses a real email and password checked against the same user register your own administrators manage — there's no separate hardcoded list living somewhere else. I'm signed in today as our Group Administrator account, adaeze.okonkwo@ecobank.com — the sign-in screen itself now shows this demo account and its password right on the page, so there's nothing to look up: every demo account in this environment shares that one password for the session.

On the Users & Roles screen: the platform ships with seven standard roles, and each one maps to a real job rather than a generic permission bundle. **Administrator** has full access across every affiliate and every function — users, rules, runs, all data — and is typically held by Group Risk and Group Treasury leadership. **Affiliate Administrator** has that same administrative depth but scoped to one affiliate only: they provision users and configure rules for their own country, and simply cannot see another affiliate's data or touch Group-level settings — typically Country Risk or Country Treasury heads. **Risk Analyst** views results, executes runs, configures scenarios and *can* edit business rules — but can't manage users. **Treasury User** carries the same viewing rights plus treasury-specific functions — FTP and balance sheet management. **Executive Viewer** is read-only across dashboards and reports, for committee members and executives who need visibility, not control. **Control Tester** is focused on data quality and reconciliation — validation, checking positions against the General Ledger, control remediation, audit visibility. And **Reporting User** generates and distributes reports and packs without broader system access.

The distinction worth dwelling on is Group versus Affiliate: an Affiliate Administrator's control is real, but it's bounded, and that boundary is enforced at the point the data is actually queried — not just hidden in a menu that a determined user could work around. And permission checks are granular per screen, not per section, so a Risk Analyst never sees an administration screen and an Executive Viewer never sees a configuration screen. The interface adapts to whoever's logged in; nobody has to remember what not to click.

That's the full picture. Happy to take any question on anything we've covered — and thank you for your time today."