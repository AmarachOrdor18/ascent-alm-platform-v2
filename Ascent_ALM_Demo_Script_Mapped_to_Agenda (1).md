# Ascent ALM - Live Demo Script (Mapped to Agenda)

## Prerequisites: what a freshly onboarded affiliate actually needs before Process Run means anything

Verified directly against the current codebase (`ProcessRun.tsx`, `runHooks.ts`, `engine/run.ts`,
`engine/classification.ts`, `engine/schedule.ts`) on 2026-09-03 — including two corrections to guidance
given earlier in this project (marked ⚠️ below). Everything falls into exactly one of four timescales;
confusing "configure once" with "applies automatically forever" is what causes numbers to look broken
when they're actually just unconfigured for *this specific run*.

### A. Onboarding — once per affiliate, ever
**Who:** an Admin (`group.manage`). **Where:** Affiliates → Onboard.

1. Legal entity & profile
2. Currencies & calendar (functional currency, reporting currency, active currencies)
3. Connectivity & data sources
4. Chart of accounts & organisation
5. Assumption inheritance (inherit Group defaults, or fork)
6. Limits & regulatory thresholds
7. Submit → status becomes Testing, and an Activate approval request is raised automatically. A
   **second** Admin - a different login; the person who submitted it cannot approve their own request -
   approves it in Controls → Approvals. Only then does the affiliate become Live.

Nothing below this line is reachable until the affiliate is Live.

### B. Business rules — configured once, kept until someone changes them
**Who:** Risk Analyst / Admin (`rules.edit`). **Where:** affiliate Settings → Business Rules (or the
Group row, for a Group-wide default).

| Rule | Required for the numbers to mean anything? | If never configured |
|---|---|---|
| **Product Characteristics** | **Yes - the one that actually matters** | Every position defaults to 0% ASF/RSF (HQLA "None" unless the position file itself supplied it). LCR/NSFR still *compute* - they just read near-zero. |
| Time Bucket | No | Falls back to a real engine default ladder. |
| Behaviour Pattern | No | Falls back to a real engine default pattern set. |
| FTP Rule | Only if Transfer Pricing/Profitability matters to you | Every position reports "unpriced," not zero-margin. |
| Adjustment Rule | Only alongside an FTP rule | Base curve rate only, no add-ons applied. |
| New Business | Only for a Dynamic run | Ignored by a Static run; a Dynamic run is blocked without one. |
| Forecast Scenario | Only for stress/what-if | Unused by a standard Process Run. |

### C. Per-period — before processing a given as-of date
**Who:** Loans/Deposits/Treasury desks (`data.configure`) for positions; Treasury for FX/curves.
**Where:** Data Management → Data Upload; Settings → Reference Data.

1. Loans, Deposits **and** Treasury position files all committed for that date - the book is only
   complete once every contributing department is in (Data Vintages shows per-department readiness).
2. An FX rate dated on or before that date, for every currency the affiliate transacts in -
   **this one hard-blocks the run** if missing.
3. A yield curve dated on or before that date - not a blocker, but Transfer Pricing/FTP Adjustments
   report positions unpriced without one.
4. GL trial balance uploaded and reconciled for that date - advisory only, never blocks a run or report,
   but shouldn't be skipped for a real sign-off.

### D. Per-run — every single time, no exceptions
**This is almost certainly what's been catching you.** Process Run does not remember rule choices
between runs. Every rule selector (Time Bucket, Product Characteristics, Behaviour Pattern, FTP,
Adjustment) starts **blank** on a fresh run, every time - even if that exact rule was selected and used
on the previous run five minutes ago. Configuring a rule (section B) is a one-time task; *selecting* it
is a per-run task with no memory. Skip the re-selection and the run silently proceeds as if the rule
doesn't exist - no error, just quietly wrong-looking numbers.

1. As-of date
2. Process type (Static / Dynamic)
3. Calculation elements to compute - LCR/NSFR are included by default, but the "Monthly IRRBB" preset
   and a "Custom" run with the boxes unchecked both exclude them
4. Re-select every rule from section B that this run should actually use
5. Execute

### Corrections to earlier guidance in this project
- ⚠️ **Holiday calendars do not affect Process Run's bucket placement.** Verified: `engine/schedule.ts`
  (the module that reads a holiday calendar) is used only by the connector feed scheduler - Batch
  Scheduler's SLA due-dates for automated uploads - never by the calculation engine. The calendar set up
  during onboarding has zero effect on LCR, NSFR, IRRBB, or any other Process Run figure.
- Economic Indicators are not read by a standard Process Run at all. They matter only if a Forecast
  Scenario rule references one, on the separate Forecast page - a stress/what-if feature, not the core
  run pipeline.

---

## 10:00–10:05 | Opening & Demonstration Rules

*Figures below are illustrative placeholders — read the actual numbers live off screen for whichever run is selected; don't recite these values, the platform ships with no pre-loaded demo data any more (see Part 2, Step 1).*

"This is the Executive Dashboard. We're looking at Ecobank Nigeria, reading from [the run selected in the header — call out its as-of date live], with the figures stated in Nigerian Naira. The important thing about this screen is that it gives management a quick view of the bank's overall position from one calculation run.

At the top, we have the four key measures:

Liquidity Coverage Ratio - [read live], showing the bank's available liquid assets against its expected short-term outflows.

Net Stable Funding Ratio - [read live], showing the bank's longer-term funding position.

The Survival Horizon - [read live] days, which tells us how long the available liquidity would last under the selected stress scenario.

And the Loan-to-Deposit Ratio - [read live], showing the relationship between lending and customer deposits.

Just below that, we have the interest-rate sensitivity. This shows how the economic value of the balance sheet changes under different interest-rate scenarios.

We also have the Market and Rate Monitor, which gives us the current reference rates and foreign exchange rates being used by the system.

Then we have a quick Risk Snapshot.

We can immediately see net interest income sensitivity, economic value sensitivity, and the largest depositor's share of the relevant deposit base - [read all three live].

We can also see profitability indicators such as the non-performing loan ratio and net interest margin.

Finally, the dashboard brings attention to areas that need action - any breach currently open, [read live] of them.

So this dashboard is really the management starting point: what is our liquidity position, what is our interest-rate exposure, where are the concentrations, how profitable are we, and where do we need to take action?

And importantly, these aren't isolated dashboard figures. I can click any of these measures and drill directly into the underlying analysis.

So let's take the liquidity position and see exactly what is driving the result."

---

## 10:05–10:15 | Data, Product & Cash-Flow Management

*Trimmed to fit its real 10-minute slot. Full step-by-step detail (all six onboarding sub-steps, every reference-data screen individually, the counterparty and dimensions mechanics) lives in the Prerequisites reference at the top of this file - use it to answer a question in the room, don't try to narrate all of it here.*

Say: "Let me show you where those numbers actually come from - starting from genuinely nothing, the way a new affiliate really would. This platform ships with no pre-loaded data at all: only the Group entity and login accounts. Everything from here gets built live."

**Onboarding, briefly** — Show: Affiliates → Onboard

Say: "Six steps configure a new affiliate - legal entity, currencies and calendar, connectivity, chart-of-accounts mapping, its own business rules or the Group's, and its regulatory limits. Submitting raises an activation request automatically, and here's a real control worth naming on camera: whoever submits it can never approve it themselves, even as an Administrator. A second person has to sign off before the affiliate goes Live and can be selected anywhere data is uploaded."

**Source-system ingestion** — Show: Data Management → Data Upload → select affiliate, domain, as-of date, contributing department → upload CSV

Say: "Positions arrive from three independent desks - Loans, Deposits, Treasury - each submitting its own slice on its own schedule, not one combined file. A single department's upload deliberately doesn't balance on its own, and the screen says so outright; the platform waits until all three are in for that date before checking that assets equal liabilities plus capital."

**Data validation & reconciliation**

Say: "Every file is validated before it commits - required fields, referential integrity, duplicate IDs, and the balance check, which is the one genuine blocker, only once the book above is complete. One advisory always shows on a fresh upload - Basel factors aren't classified yet - and that's expected, not a data error: classification is applied later, at calculation time, never stored back onto the raw file. Restating a file after commit doesn't overwrite it - it versions it, with a reason recorded, and the prior version stays on file. Reconciliation against the general ledger is the next control - advisory, never a blocker, but visibly flagged wherever the numbers are read afterward if it's skipped."

**Currencies and curves**

Say: "Currency rates and yield curves are both dated series now, the same as a position batch - several dates can sit on file for one currency at once, and a calculation always converts or prices using whichever is most recent as of its own date. That's what lets one month's transfer pricing genuinely differ from the next, reading a different curve rather than the same one every time."

**Product configuration, contractual cash flows & repricing characteristics** — Show: Business Rules → Product Characteristics

Say: "Every position already carries its contractual cash-flow and repricing detail - maturity date, next repricing date, rate type - straight from the source file. What it doesn't carry yet is regulatory classification: Product Characteristics is what turns a product code and currency into an LCR role, ASF and RSF factors, HQLA level, duration - one row per product and currency actually in use. Leave it unset and every ratio reads near zero, which looks broken, not merely unconfigured; configure it, and the same book produces real numbers. And the one thing worth never forgetting on camera: this rule is configured once, but has to be re-selected on every single run - nothing here is remembered from the last one."

**Counterparties, the product catalogue, and drilling back to source**

Say: "A counterparty an uploaded position references but that doesn't exist yet gets flagged and created directly from the file, or mapped onto an existing one if it's a rename. Products work the same catalogue logic under Dimensions & Hierarchies - a leaf is a real product a position gets tagged with, a rollup is a pure grouping category nothing is ever booked to directly. And every position, wherever it surfaces - a result, a report, a limit breach - traces straight back to the exact file, department and version that introduced it. Nothing here is a black box."

Key message: "From an empty platform to a fully classified, reconciled, traceable position book - built live, with the same controls a real onboarding would go through. Now let's look at how the platform manages its external data sources before we move into the calculations themselves."

### Data Sources & Connections (affiliate Settings)

"This is the affiliate's Data Sources page, inside that affiliate's Settings. The principle behind this screen is that everything about an affiliate - including how its data arrives - lives in one place.

The top half is the feed wiring. For each data domain - the position book, the general ledger, market rates, FX rates, the counterparty register and economic indicators - we decide how the data arrives: from a system connection or by file substitution where no connection exists. We also set the freshness SLA for the domain and the business owner who is accountable for it. If a feed goes stale past its SLA, the platform flags it and we know exactly who to chase - the owner, not the platform.

Below the wiring is the Connections list. This is where connections are added, tested, configured or retired - one inventory of the systems that feed this affiliate. View details expands a connection to show its endpoint, authentication basis, refresh cadence and which of this affiliate's domains depend on it, without leaving the page.

At Group level, the same section becomes Connection Health. That view is deliberately monitoring-only: a matrix of every affiliate across every domain, showing what feeds each domain, whether the connection behind it is live, who owns it, and how fresh the data is - with a filter to focus on one affiliate and a single click through to that affiliate's own configuration. The Group sees the health of the estate; each affiliate configures its own feeds.

So the split is: the Group owns the inventory view, each affiliate owns its wiring, and a stale feed is always visible with a name attached to it."

*(Interest Rates & Curves, Currency & FX Rates, Economic Indicators and Holiday Calendar - all Reached from: that affiliate's Settings → Reference Data section, or the Group row's Settings for a Group-wide default - were covered in Step 5 above, and Product Characteristics, the Product catalogue and the Counterparty Register were covered in Steps 6-8. This is where the flow rejoins the rest of the configuration layer.)*

"We've now seen how the data is loaded, validated, reconciled, referenced, classified and structured. But none of these rules sit in isolated screens with no record of who put them there. Let me show you where every configurable rule in the platform is actually registered, so we can see, in one place, what's defined, what's active, and who owns each one."

### Business Rules (Configuration Registry)

"This is the Business Rules registry. This is where every configurable rule in the platform is registered - the register a model-governance review reads.

At the top, we can see how many rule kinds exist in total, how many actually have a rule defined against them, how many of those are active, and how many carry an affiliate-specific override rather than simply inheriting the Group default - read the live counts off screen.

Each row tells us what the rule kind governs, how many rules are defined against it, how many are active, its status, and when it last changed. Time Buckets governs how results are bucketed. Product Characteristics - which we just configured - governs the Basel factors per product. Behaviour Patterns governs deposit run-off and betas. Forecast Scenarios governs the rate shocks used in stress scenarios.

Whatever hasn't been configured yet for this affiliate shows plainly as Not configured, rather than requiring someone to open each screen individually to check.

Below that, we have Recent assumption changes. Model governance asks who changed an assumption and when. Every rule save writes here automatically - the screen doesn't have to remember, because the platform records it as part of saving the rule.

So the key message is: this isn't a set of disconnected configuration screens. It's one governed inventory of every rule in the platform, who owns it, and when it last moved."

"That's the rule inventory as a whole. Let's stay in this configuration section and look specifically at the rules that govern data quality - the Validation Rules we already saw fire during upload."

### Validation Rules

"This is the Validation Rules screen, reached from the affiliate's Settings page. Data-quality checks run as a gate before any calculation, and because these are configuration rather than code - the rule set is persisted and versioned like every other rule - a bank can add its own check without waiting for a release.

At the top, we can see the rule inventory for whichever affiliate is selected: how many rules, how many active, how many of those are blocking versus advisory.

Looking at the rules themselves, each one has a check type, a severity, and whether it blocks a commit or is advisory only. Required fields present, the affiliate reference being valid, and position IDs being unique within a batch are all High severity and blocking. Balance-sheet integrity - the check we saw in Step 2 - is Critical and blocking. Amount range, currency format, maturity-date ordering and Basel-factor coverage - the one that always shows on a fresh upload, discussed in Step 3 - are Medium or Low severity and advisory: they flag an issue without stopping the commit, and any one of them can be switched off here if it isn't useful for a given affiliate.

So the key message is: bad data doesn't just get stopped by the balance check alone - it's stopped by a configurable rule set, with each rule visibly scoped to a severity and a blocking decision, and the bank can extend or trim that rule set itself."

"That covers the configuration layer - how rules are registered and how data quality is enforced before anything reaches a calculation. Now let's move into how the platform organises time for the calculations themselves."

### Time Bucket Rules

"This is the Time Bucket Rules screen. This is where we define how the platform groups positions into time periods for its different calculations.

The important point is that we don't use one bucket structure for everything. We have three separate ladders, because liquidity, interest-rate repricing and income projection are asking different questions.

The first is the Liquidity Gap ladder. This is focused on when cash is expected to come in or go out, with more detail around the shorter-term periods.

The second is the Interest Rate Gap ladder. This looks at when interest rates on positions are expected to reset. It also has a separate bucket for positions that are not sensitive to interest-rate changes.

The third is Income Simulation, which is used to organise projected earnings over future reporting periods.

One important thing about these rules is that the buckets are derived from the actual dates on the positions. So the system doesn't simply label a position as '30 days' because someone assigned it that way. It looks at the maturity or repricing date and places the position into the appropriate bucket.

That means if I change the bucket definitions, the allocation of positions genuinely changes. The calculation results will therefore reflect the new structure.

We can also add or remove buckets where the bank's methodology requires it. The current Group Default rule has 23 buckets across the three ladders and is currently active.

So, in simple terms, this screen controls how the platform organises time for the calculations.

And this becomes important when we look at the maturity and repricing analysis, because those results are being driven by the bucket rules configured here."

### Payment & Repricing Patterns

"This is the Payment and Repricing Patterns screen. This is used when a financial instrument has a repayment or interest-rate reset structure that can't be fully described using the standard position fields.

We have two main uses here. Payment patterns describe when principal is repaid, while repricing patterns describe when the interest rate resets.

We can define the pattern as absolute, relative or split. Absolute uses specific dates, relative uses periods, and split allows us to model multiple repayment or repricing legs.

Within the pattern, we can define different phases and the percentage allocated to each phase. The total allocation must equal 100%, so the entire payment or repricing structure is accounted for.

At the moment, there are no saved patterns in this environment, so I won't create a sample just for the demonstration.

The important point is that this gives the platform a way to handle more complex instruments. Instead of forcing everything into a single maturity or repricing date, we can describe the actual schedule and let the calculation engine use that structure.

So, simply put: Payment Patterns tell us how cash is repaid; Repricing Patterns tell us when rates reset."

### Prepayment & Early Redemption

"This is the Prepayment and Early Redemption screen. This is where we define how much principal may be repaid earlier than originally scheduled.

This is particularly relevant for products such as loans, where customers may choose to repay before the contractual maturity date.

For each product class, we can define the expected annual prepayment rate and the penalty associated with early repayment.

The platform uses these assumptions to adjust the expected cash-flow profile. So instead of assuming that every loan runs exactly to its contractual maturity, we can model the possibility that some of the principal comes back earlier.

The penalty is also important because it can reduce the incentive for customers to prepay. So the platform can take both the expected prepayment behaviour and the associated penalty into account.

At the moment, there are no prepayment rules configured in this environment, so I won't create a sample rule just for the demonstration.

The key point is that this gives the bank control over another important behavioural assumption that can affect liquidity, maturity analysis and potentially interest income.

So, simply put: this screen tells the platform how much of a loan may come back early and how the early-redemption penalty affects that behaviour."

### Discount Methods

"This is the Discount Methods screen. This controls how the platform values future cash flows in today's terms for different product classes.

In simple terms, if a cash flow is going to be received in the future, we need a way to determine what that future amount is worth today. The discount method and the relevant yield curve provide that basis.

We can assign a discount method and curve to each product class. This gives the bank control over how different products are treated when calculating their present value.

One important point on this implementation is that the current default is a duration-based approach. Full cash-flow discounting would require detailed contract-level cash-flow schedules, which are outside the current scope.

Because of that, the Economic Value of Equity analysis currently uses the duration gap approach rather than discounting every individual contractual cash flow. The platform makes that methodology explicit in the results rather than presenting it as full cash-flow valuation.

There are currently no custom discount rules configured, so the Group Default approach remains the applicable methodology.

So the key message is: this screen controls how future value is translated into today's value, while being transparent about the valuation methodology currently being used."

---

## 10:15–10:35 | Liquidity Risk Management

"We've seen the headline liquidity position. Let me now go one level deeper and show you where the liquidity pressure actually sits.

This is the Maturity Gap analysis. The platform breaks the balance sheet into maturity buckets, from overnight through five years and beyond.

For each bucket, we can see the assets coming in, the liabilities going out, and the resulting gap.

For example, in the 8 to 30 day bucket, we have about ₦323 thousand of assets against ₦573.5 thousand of liabilities, giving us a negative gap of about ₦250.5 thousand.

That immediately tells us where the short-term pressure is.

I can also switch between the contractual and behavioural views.

Contractual looks at when the positions are legally due based on their original terms.

Behavioural goes further and applies the assumptions we've configured about how customers are actually expected to behave.

This is particularly important for deposits. A deposit may technically be withdrawable today, but historically the customer may keep most of that balance with the bank.

We can see that behaviour in the Deposit Core and Volatile Split below.

Total deposits are ₦1.3 million, of which ₦866 thousand is classified as core and ₦404 thousand as volatile.

We can also see this at product level. For example, retail core deposits have a 95% core assumption, while corporate non-operational deposits have only 15% classified as core.

This is what makes the behavioural view useful. Instead of treating every deposit in exactly the same way, the platform applies the configured customer behaviour and shows how that changes the liquidity profile.

Finally, the behavioural ladder gives us the numbers behind the chart, including the gap and cumulative gap for each maturity bucket.

So the key message here is: the platform doesn't just tell us that there is a liquidity gap; it shows us where that gap occurs and allows us to see how expected customer behaviour changes the picture."

### Maturity and repricing gap

"Now we're in the Maturity and Repricing Gap analysis.

This screen answers two different questions: when does the cash flow happen, and when does the interest rate reset?

I'll start with the maturity view.

The platform places the bank's assets and liabilities into nine maturity buckets, from overnight through five years and beyond.

The key thing I want to highlight here is the 8 to 30 day bucket. We have about ₦323 thousand of assets against ₦1.5 million of liabilities, giving us a negative gap of about ₦1.2 million.

That is currently our widest negative bucket, so it immediately tells management where the biggest short-term liquidity pressure is.

The cumulative gap then shows whether those gaps are being recovered as we move through the maturity ladder.

We can see that the cumulative gap remains negative through the earlier buckets and eventually returns to zero in the five-year-plus bucket."

*(Repricing view continued under IRRBB, Gap & Duration Analysis below.)*

### Stress Testing - severe liquidity run

"Now we move into Stress Testing. This screen takes the same balance sheet we've been analysing and asks a different question: what happens if conditions become significantly worse?

The platform runs two main stress areas here. First, we have the six standardised interest-rate shocks. Second, we have a severe liquidity run."

*(Interest-rate shocks continued under Stress Testing, Scenario Analysis & Balance Sheet Forecasting below.)*

"The second part is the severe liquidity run. Here, the platform starts with ₦484.5 thousand of available high-quality liquid assets and applies a stressed pattern of cash outflows over 30 days.

Under this scenario, the available buffer is exhausted on day five. We can see the buffer moving from positive to negative as the stressed outflows accumulate. The Liquidity Coverage Ratio also falls from 168.9% to 76.7% under the stressed assumptions.

So this gives management a much more useful view than simply saying the bank passes or fails a scenario. We can see which shock is most severe, how quickly liquidity is consumed, and what happens to the key risk measures as the stress develops.

And importantly, these are calculated against the selected run's actual balance sheet. We're not looking at a theoretical sandbox - we're stressing the same book we've been using throughout the analysis."

### What-If Builder

"Now we move from prescribed stress testing into the What-If Builder.

The difference is simple: Stress Testing gives us defined scenarios, while this screen allows the user to change specific assumptions and immediately see what happens to the bank's position.

At the top, we have the current baseline: Liquidity Coverage Ratio of 168.9%, Net Stable Funding Ratio of 103.6%, a survival horizon of 13 days, and no change in net interest income.

We can then use the levers below to create our own scenario. For example, I can increase the rate shock, increase the deposit run-off, apply an additional haircut to high-quality liquid assets, suppress expected inflows, increase deposit attrition for the stable-funding calculation, or apply growth to the loan book.

We also have some ready-made scenarios. For example, I can select a Severe Deposit Run-Off, an Interbank Funding Freeze, or a combined Rate Shock and Funding Stress scenario. There's also a Reverse Stress Test, which allows us to deliberately push the assumptions until we identify where the bank's buffer breaks.

Let me use the deposit run-off as an example. I can increase the run-off multiplier and apply the scenario. The platform then recalculates the key measures rather than requiring me to manually work through the numbers.

Below, I can compare the base case against the scenario for Liquidity Coverage Ratio and Net Stable Funding Ratio. I can also see the effect on the survival horizon and the change in net interest income and economic value.

Another useful feature is that the platform shows the deposit behaviour under the scenario. We can see the same ₦1.3 million deposit base split between ₦866 thousand of core deposits and ₦404 thousand of volatile deposits, with a 68.2% core share.

So this is really a decision-support tool. Instead of asking 'What would happen if deposits run off faster?' and calculating it separately, the user can change the assumption, apply it and immediately see the impact across liquidity, funding, earnings and economic value.

And once we find a scenario that is useful, we can save it as a named scenario for further analysis or discussion."

### Concentration and Large Exposures

"Now we move into Concentration and Large Exposures. The purpose of this screen is to answer a very simple question: how concentrated is the bank's funding, and who is driving that concentration?

At the top, we can immediately see that the largest depositor represents 52.86% of the deposit base. The top five and top ten together represent 100% of the deposit base. We also have a Herfindahl Index of 3,728, which gives us an overall measure of concentration.

The platform then takes us from the headline numbers to the actual counterparties behind them - read the live names and shares off screen for the affiliate you're running. A counterparty here can be registered directly (Step 7 of Data, Product & Cash-Flow Management) or created automatically from an unmapped code the first time a position references it.

This is important because the total deposit balance alone doesn't tell us where the risk is. The counterparty information allows the platform to identify whether funding is broadly distributed or heavily dependent on a small number of names.

And because each counterparty has an identifier and exposure amount, the user can trace the concentration back to the underlying data rather than just seeing a percentage on a dashboard.

So the key message here is: the platform doesn't just tell us that there is concentration; it identifies the counterparties responsible for it and shows how significant each one is."

### Limits & Breaches

"Now we've identified the areas of concentration and risk. This screen takes the next step by comparing the actual results from the selected run against the bank's defined risk appetite and limits.

At the top, we can see that the platform is monitoring 12 limits. Three are currently in breach, three are on watch, and none are below a regulatory minimum.

The important thing here is that these limits are being evaluated against the same calculation run we've been using throughout the demonstration. We're not looking at a separate set of numbers.

The limit framework shows the actual result, the amber and red thresholds, the available headroom and the current status. For example, the Liquidity Coverage Ratio is 168.86%, which is comfortably above its thresholds, so it is green and compliant.

On the other hand, the Economic Value Sensitivity is negative 13.81%. That is within the regulatory limit, but it has crossed the internal amber threshold, so the platform marks it as amber.

We can also see clear internal breaches. The largest single depositor is 52.86%, against an internal threshold of 15%, so that is red. The Liquidity Survival Horizon is 13 days, against an internal minimum of 20 days, which is also red. And Top-10 Depositor Concentration is at 100%, well above its internal threshold.

Another important control is how the platform handles missing information. If a loan is classified as non-performing but carries no provision amount, NPL Coverage Ratio is reported as No Data rather than a misleading 0% or 100% - it only produces a real figure once a provision amount is actually captured against that loan. Rather than incorrectly showing an unset figure as green, the platform is explicit about what it doesn't yet know.

So this screen gives management a very quick control view: what is within appetite, what needs watching, what has breached a limit, and whether the result is regulatory or internally defined.

And from here, we can move into the Key Risk Indicators to look at the wider trend and see whether these risks are improving or deteriorating over time."

### Key Risk Indicators

"This is the Key Risk Indicators Dashboard. While the Limits and Breaches screen tells us where we are today, this screen is designed to show us the direction of travel across previous calculation runs.

We currently have six indicators being monitored, including the Liquidity Coverage Ratio, Net Stable Funding Ratio, Loan-to-Deposit Ratio, Liquidity Survival Horizon, Top-10 Depositor Concentration and Non-Performing Loan Ratio.

The idea is that as more calculation runs are completed and stored, the platform can compare those observations and identify whether an indicator is improving, deteriorating or remaining stable.

For each indicator, the platform can show the change between periods, the rate of change, and the direction if that trend continues. This allows management to move beyond simply asking 'Are we within the limit today?' and ask 'Are we moving in the right direction?'

In this particular demonstration, we only have one usable observation in the history, so the platform correctly shows No Data for the trend and does not claim that anything is improving or deteriorating.

That's an important control. We don't want the system inventing a trend from insufficient history. Once multiple runs are available, this dashboard becomes much more useful for identifying emerging risks before they become actual breaches.

So the distinction is simple: Limits tells us our position today; Key Risk Indicators tells us where that position is heading."

---

## 10:35–10:55 | IRRBB, Gap & Duration Analysis

"The other important capability on this screen is the Repricing view.

Maturity tells us when cash comes in or goes out. Repricing tells us when the interest rate on an asset or liability can change.

So, for example, a loan could have five years remaining before maturity but have its interest rate reset every three months. Maturity analysis alone would not show that interest-rate exposure.

The platform therefore gives us both views so we can understand the liquidity timing and the interest-rate reset timing separately.

So the key message is: maturity tells us when the cash moves; repricing tells us when the rate can change. Together, they give us a much clearer view of balance-sheet risk."

### Interest Rate Risk

"Now we move into Interest Rate Risk. This screen shows us how changes in interest rates could affect both the bank's earnings and the economic value of its balance sheet.

At the top, we have the two key measures. A 200 basis-point increase in rates produces a negative 8.06% sensitivity in net interest income, while the economic value of the balance sheet changes by negative 13.81% of capital.

The platform also gives us the six prescribed interest-rate shock scenarios. Rather than running each scenario separately, I can run all six and immediately compare their impact on earnings and economic value.

For example, under a parallel increase of 200 basis points, net interest income falls by 8.1% and economic value falls by 13.8%. If rates move down by the same amount, the impact reverses.

I can then move from the scenario result into the repricing gap analysis. This shows where our rate-sensitive assets and liabilities are positioned across the different repricing periods. The important point is that we're not just seeing the final sensitivity - we can see the balance-sheet structure that produces it.

The platform also brings in the applicable yield curve for the calculation. So the analysis is based on the market-rate assumptions maintained in the reference data rather than rates being hard-coded into the screen.

Finally, we have two detailed views. The earnings view shows the impact on net interest income over the next 365 days. Here, the bank has ₦650 thousand of rate-sensitive assets against ₦1.6 million of rate-sensitive liabilities, creating a negative repricing gap of ₦900 thousand.

The economic value view looks at the longer-term value of the balance sheet. Here we can see the asset and liability durations, the resulting duration gap and the change in economic value relative to capital.

So the key message is that the platform connects the scenario, the repricing structure and the resulting financial impact in one place. Management can see what happens when rates move, why it happens, and how significant the impact is."

### Forecast Rate Scenarios

"This is the Forecast Rate Scenarios screen. This is where we define and save the interest-rate shocks that can be reused across our calculations.

Worth being precise on what ships out of the box: the platform's Stress Testing screen always applies all six standard shock shapes - Parallel Up, Parallel Down, Steepener, Flattener, Short Rate Up and Short Rate Down - as a computed capability, with no rule needed. This screen is different: it's where a *named, saved, reusable* scenario is defined, and only one ships by default, a Group Default Parallel Up 200 basis-point scenario.

For example, this scenario starts with the Parallel Up shock of 200 basis points. The platform loads the standardised shape across the different maturity buckets, and the user can then adjust the shock for individual buckets if the bank's methodology requires it.

So we're not limited to a single rate change across the whole curve. We can define how the shock behaves across different periods - from 0 to 30 days through five years and beyond.

We can also associate the scenario with relevant economic indicators, such as inflation or monetary policy rates. In this implementation, those indicators provide the economic context for the scenario; the actual rate shock applied by the calculation engine is the bucket-level shock defined here.

Once saved, the scenario becomes a reusable rule that can be selected during a Process Run, Stress Test or other calculation - though worth flagging the control here: a newly saved scenario needs a segregation-of-duties approval (a different user than whoever saved it) before Process Run will let it be selected. The Group Default scenario ships pre-approved, since it's a shipped baseline rather than a user-submitted one.

The key point is that rate scenarios are configurable and reusable. The bank can start with the standardised shock shapes and save additional named scenarios when its own risk methodology requires them, each one going through the same approval control before it's usable in a run."

---

## 10:55–11:10 | Behavioural Modelling & Assumptions

### Behavioral analysis

"This is the Behavioural Analysis screen. The purpose here is to show how the platform treats deposits where the customer does not have a fixed maturity date.

At the top, we can see that the platform has modelled ₦1.3 million of deposits, with 68.2% classified as core and the remaining balance treated as volatile. In this run, there are no unmodelled deposits.

The platform then breaks that result down by behavioural category. For example, Operational deposits have an 85% core assumption, while Non-Operational deposits have 15%. Core deposits are treated as the portion expected to remain with the bank, while the volatile portion represents the balance that is more likely to move.

What makes this useful is that the split isn't necessarily fixed. The platform can also adjust the core share based on customer activity. For example, a dormant account receives a positive adjustment, while a low-activity account receives a smaller adjustment. Active accounts receive no adjustment.

In this particular run, no custom behaviour pattern was attached, so the platform is using its default rules. If the bank wants to use its own behavioural methodology, the user can edit the behaviour pattern and simply re-run the calculation.

So this screen gives us three things: the deposit balance, the behavioural split, and the rule that produced that split.

And that feeds directly back into our liquidity analysis, because changing how much of the deposit base is considered stable or volatile changes when those deposits are expected to leave the bank."

**What the chart is showing**

For each deposit product, the bar is split into:
- Balance → the total deposit amount
- Volatile → the portion of that balance classified as likely to move

This view looks at the same behavioural split, but from an activity perspective. Instead of asking which product the deposits belong to, we're asking how the deposits behave based on whether the accounts are active or dormant.

We can compare the total balance for each activity group against the portion classified as volatile. The activity status can also influence the behavioural assumption applied by the platform. For example, the configured rule gives dormant accounts a 50 percentage-point adjustment to their core share, while active accounts receive no adjustment.

This allows the bank to incorporate customer activity into its behavioural modelling rather than treating every deposit in exactly the same way.

### Behaviour Patterns

"This is the Behaviour Patterns screen. This is where we define how deposits without a fixed maturity are expected to behave over time.

The important point is that the platform doesn't have to assume that every deposit leaves immediately. We can define a behavioural pattern that determines how much of the deposit is expected to remain stable and how much is expected to run off over different periods.

We can create patterns for different deposit types - Core, Non-Core, Operational and Non-Operational.

Within each pattern, we define tenors, the percentage allocated to each tenor, and whether that portion is classified as Core or Volatile. The allocation must add up to 100%, which gives us a controlled and complete distribution.

For example, the screen shows different patterns with core shares of 95%, 35%, 85% and 15%. So different types of deposits can have very different expected behaviour.

This is important because these assumptions feed directly into the liquidity analysis. If we assume more of a deposit is stable, the expected cash outflow is different from a scenario where a larger portion is considered volatile.

We also have Deposit Betas. This controls how much of a change in the bank's policy rate is passed through to deposit rates. In simple terms, not every change in market rates has to be passed on to customers at the same level.

These assumptions are then used when the platform calculates interest-rate sensitivity and behavioural liquidity.

So the key point is: this screen lets the bank configure how deposits behave rather than treating every deposit as if it behaves the same way."

---

## 11:10–11:25 | FTP & Profitability

### Funds Transfer Pricing

"Now we move into Funds Transfer Pricing. This is where the platform takes the funding cost and funding value of the balance sheet and attributes the resulting margin back to the business units that generated it.

At the top, we can see ₦181 thousand of total Funds Transfer Pricing margin. We have 26 positions priced and none left unpriced, so the full position book has been covered.

The first view shows us the margin by business unit. For example, Lagos Region contributes ₦127 thousand, Mid-Market contributes about ₦70.8 thousand, and Large Corporates contributes ₦46.2 thousand. Treasury is showing a negative ₦62.5 thousand because it is effectively carrying the funding and liquidity costs that support the other businesses.

I can then drill into the Transfer Rate Detail. This is where we can see exactly how the rate assigned to each position was determined.

The platform starts with the relevant market yield curve and applies the configured Funds Transfer Pricing methodology. For example, a corporate loan with a one-to-three-month repricing period receives a base rate of 19.41%. A longer-dated position can receive a different rate because it references a different point on the curve.

We can also see the product, the common chart-of-accounts classification, the business unit, currency, base rate, any additional adjustments, the final transfer rate and the resulting margin.

This is important because we're not just assigning one funding rate to everything. The rate is linked to the characteristics of the position - including its product and repricing or maturity profile - and the result can then be attributed to the relevant business unit.

So if management asks, 'How much margin did Retail generate? How much did Corporate generate? And what is Treasury carrying?', the platform can answer that directly from the same position data.

The key value here is performance attribution. The business units can be measured on the economics of the business they generate, while Treasury retains visibility of the central funding cost."

### Profitability Ratios

"Now that we've seen how Funds Transfer Pricing attributes the economics of the balance sheet to the business units, let's look at the overall profitability picture.

This is the Profitability Ratios screen, and it is using the same calculation run as the risk results we've already seen. So we're not introducing a separate set of data.

At the top, we have four key measures - read them live: Net Interest Margin, Non-Performing Loan Ratio, Non-Performing Loan Coverage and the Non-Earning Asset Ratio. NPL Coverage specifically only produces a real figure once a provision amount is captured against a non-performing loan - reports No Data otherwise, rather than a misleading number.

The earnings section gives us the numbers behind the margin. Total assets are ₦2.3 million, with ₦356.6 thousand of interest income and ₦133.4 thousand of interest expense, giving us ₦223.2 thousand of net interest income.

The platform then converts that into the Net Interest Margin of 9.79%, giving management a simple measure of how effectively the balance sheet is generating net interest earnings.

We can also look at asset quality - the Non-Performing Loan Ratio, alongside the Non-Earning Asset Ratio and Loan-to-Deposit Ratio. These measures help us look beyond income and understand the quality and efficiency of the balance sheet. All three are computed from the position book's own category, product classification and performing-status fields - not a separate reporting feed - so they reflect exactly what was uploaded and classified.

Below that, we can compare the ratios against their configured thresholds. This makes it easy to see whether a profitability or asset-quality measure is within the bank's defined range rather than looking at the number in isolation.

Finally, we can break profitability down by product or business unit. For example, we can see that Retail Consumer Loans have a 27% earning rate, while some corporate loan products are generating around 24 to 25%.

On the liability side, deposits and funding positions appear as negative contributions because they represent the cost of funding rather than interest earned.

This is where the earlier Funds Transfer Pricing analysis becomes useful. We can move from the overall profitability result into the products and business units contributing to that result, and understand both the earning side and the funding cost.

So the key message is: the platform connects the balance sheet to earnings and then lets us drill from the overall profitability ratio down to the products and business units driving it."

### Balance Sheet Analytics

"Now let's look at Balance Sheet Analytics. This is the underlying balance sheet that the platform used for the calculation run we've been analysing.

At the top, we immediately have ₦2.3 million of total assets, ₦2 million of liabilities, and ₦300 thousand of capital. The balance check is zero, so the balance sheet is fully balanced.

The important capability here is that I can change how the balance sheet is viewed. I can roll it up by common chart of accounts, organisational unit, product, or local general ledger.

Let me stay with the common chart of accounts. We can immediately see where the balance sheet is concentrated. Customer deposits are about ₦1.4 million, loans and advances are ₦1.1 million, investment securities are ₦630 thousand, and property, equipment and other assets are ₦530 thousand.

I can then expand any of these lines to drill further into the underlying accounts. So we're not limited to a high-level balance-sheet summary. We can move from the Group structure down through the hierarchy and ultimately to the individual account.

This is also where the earlier data-management work becomes important. These aren't numbers entered manually on this screen. They come from the position book that was loaded, validated and reconciled earlier, and this screen is simply giving us different ways to analyse that same book.

At the bottom, the platform also separates the balance sheet into assets, liabilities, capital and off-balance-sheet items. In this run, there are no off-balance-sheet notional amounts included in the totals.

So the key value of this screen is drill-down and flexibility. Management can start with the Group balance sheet, look at the major components, change the view to a business unit or product, and drill down to the underlying account without leaving the platform.

And because this is the same book used by the risk and profitability calculations, we can trace the numbers across the platform rather than having separate versions of the balance sheet in different modules."

### FTP Rules

"This is the Funds Transfer Pricing Rules screen. This is where we define which transfer-pricing method applies to each product class and which yield curve it should reference.

The reason this matters is that we don't want every product to receive the same funding rate. A short-term treasury position, a corporate loan and a long-term funding instrument can have very different funding economics.

Here, the rule can be assigned by product class or common chart-of-accounts classification, with the appropriate transfer-pricing method and yield curve.

One important design choice here is that the platform uses ledger-level transfer-pricing methods rather than requiring detailed contractual cash flows. That is intentional. Where the available data is at ledger or position level, we shouldn't pretend that we have contract-level cash-flow information that isn't actually available.

Another useful control is how the platform handles missing rules. If a position doesn't have an applicable Funds Transfer Pricing rule, it is reported as unpriced. It isn't silently assigned a zero rate.

That gives the user visibility of incomplete configuration before relying on the profitability results.

At the moment, there are no custom Funds Transfer Pricing rules configured in this environment, so I won't create one just to demonstrate it.

So the key message is: this screen controls how funding rates are assigned to products, which curve they reference, and whether every position has actually been priced."

### Adjustment Rules

"This is the Adjustment Rules screen. This is where we define the additional components that can be added to the base Funds Transfer Pricing rate.

The idea is that the base transfer rate doesn't always represent the full economic cost of funding. We may also want to recognise things such as a liquidity premium, basis risk, a specific cost, or a pricing incentive.

These adjustments are kept separate rather than being blended into one unexplained spread. That means if several adjustments apply to the same product, the business user can see exactly what each additional charge represents.

We can also make an adjustment either a fixed number of basis points or make it dependent on the bank's liquidity position.

For example, this preview shows an LCR-driven adjustment. When the Liquidity Coverage Ratio is high, there is no additional charge. As the liquidity buffer becomes thinner, the additional funding cost increases - from 15 basis points at 120%, to 45 basis points at 100%, and 75 basis points at 80%.

This is useful because it allows Treasury to reflect the changing cost of funding within the transfer-pricing methodology.

The values shown here are illustrative policy assumptions in this environment, not calibrated Ecobank parameters.

At the moment, there are no saved adjustment rules, so I won't create one during the demonstration.

So the key point is: the platform separates the base transfer rate from additional funding adjustments, making the economics transparent rather than hiding everything inside one spread."

---

## 11:25–11:40 | Stress Testing, Scenario Analysis & Balance Sheet Forecasting

"Starting with interest rates, the platform applies all six prescribed scenarios to the selected balance sheet. We can immediately see the impact on both earnings and economic value.

The worst economic-value result is the Parallel Up scenario, where rates increase by 200 basis points. The impact is negative 13.81% of balance-sheet equity, which is still within the 15% test. In this run, all six scenarios pass the 15% test.

This is useful because management doesn't have to run each scenario manually. The platform applies the full battery and gives us a side-by-side view of the results, including which scenario creates the greatest impact."

### What-If Builder - additional detail

"The difference is simple: Stress Testing gives us defined scenarios, while this screen allows the user to change specific assumptions and immediately see what happens to the bank's position."

*(Full What-If Builder script is set out under Liquidity Risk Management above.)*

### Forecast

"The final part of Stress Testing is Forecast. While the What-If Builder asks 'What happens if I change an assumption?', Forecast asks a different question: 'What could the bank's position look like over the coming periods?'

Here, the platform projects the position book period by period and runs the same calculation engine we use for the current balance sheet against each projected period.

I can control how far we project, whether the periods are monthly or quarterly, and whether we introduce a new-business rule. In this example, we're projecting six monthly periods, with no new business added, so this is a run-off-only forecast.

The platform then calculates the key measures for each future period. At the top, we can see the Liquidity Coverage Ratio and Net Stable Funding Ratio across the six periods.

We can also see the results in the table below. For example, the first projected period is 31 August 2026, followed by September, October and so on through January 2027. Each period has its own calculation result and status.

This is useful because we're not simply extending today's ratio forward. Each period is processed through the calculation engine against the projected position book, allowing us to see how the risk position develops over time.

We can also introduce a growth plan or other new-business rule where required. That allows management to compare a simple run-off view with a scenario where the bank continues originating new business.

So, in simple terms, What-If tells us what happens when we change a lever today; Forecast tells us how the balance sheet and risk measures could evolve over time."

### New Business Assumptions

"This is the New Business Assumptions screen. This is where we define what the balance sheet could look like when we introduce new business into a forecast.

For example, we can define assumptions for a corporate loan or a corporate deposit. We can specify the currency, how the balance should grow, when the new business is introduced, and the pricing margin.

We can also choose different forecasting methods. For example, we can target an end balance, apply a growth percentage, add a specific amount of new business, or roll existing balances forward.

Another important capability is the maturity mix. For a product such as corporate loans, we can define how the new business is distributed across different maturity periods - from 0 to 30 days through five years and beyond. The mix must add up to 100%.

Nothing ships pre-configured here - a growth plan is built live, the same way every other rule in this demonstration has been.

Worth being exact about where this assumption set actually takes effect: it drives the **Forecast** screen's period-by-period projection - the existing book plus this growth plan, projected forward. It is not currently consumed by Process Run's own Static/Dynamic toggle; a Dynamic Process Run still calculates against the existing book only. If that's a capability the RFP requires inside Process Run itself rather than the separate Forecast screen, that's worth flagging as a gap to close, not something to demonstrate as already working there.

This is particularly useful for forecasting and planning. Management can ask, for example, 'What happens to our liquidity, funding and profitability if we continue growing the corporate loan book?' and the platform can project the impact on the Forecast screen rather than looking only at today's balance sheet.

So the key point is: this screen converts business growth assumptions into a balance-sheet forecast that the Forecast screen's calculation engine can actually analyse."

### Transaction Strategies

"This is the Transaction Strategies screen. This is slightly different from the stress scenarios we've just seen.

A rate scenario asks: 'What happens if the market changes?'

A transaction strategy asks: 'What happens if we take action?'

So instead of simply shocking the balance sheet, we can model a management decision. For example, we could issue additional term funding, sell part of the treasury bill portfolio, or introduce a hedge to reduce the duration exposure.

For each transaction, we can define the action, product, currency, amount, execution date, maturity and rate.

At the moment, there are no transaction strategies configured, so there are no transactions to demonstrate here. And worth being precise rather than overselling it: a strategy can be attached to a Process Run today, but the run's own calculation doesn't yet consume it to produce a combined effect - that combination is a planned capability, not something to demonstrate as computing a number today. What genuinely works now is defining and saving the strategy itself.

The important distinction is that this is a decision-support capability. Stress testing tells us how the balance sheet behaves under a shock. Transaction strategies are designed to let us ask what happens if management responds to that situation.

So, simply put: rate scenarios test the environment; transaction strategies test our response to the environment."

---

## 11:40–11:50 | Limits, Reporting & Management Information

### ALCO Reporting

"Now let's bring the analysis together through Asset Liability Committee Reporting.

This screen is designed to produce the management pack for the committee directly from the platform's calculation results.

At the moment, no packs have been generated in this demonstration environment, so we can see zero generated and zero distributed. However, the platform is already tracking 10 report sections that make up the pack.

The important point is that this isn't a separate reporting database where someone has to manually retype the numbers. The pack is generated from the same calculation run we've been using throughout the demonstration.

That means the committee pack can bring together the key areas we've just reviewed - liquidity, interest-rate risk, stress testing, concentration, limits and breaches, profitability and other management information - using the underlying results from the platform.

So the workflow is very simple: we complete the calculation run, review the results, generate the Asset Liability Committee pack, and then distribute it to the appropriate users.

This gives us a controlled link between the analysis and the management report. If the underlying calculation changes, we're not relying on someone manually updating a spreadsheet or presentation.

In this environment, there is no generated pack yet, so I won't pretend there is one. What we're showing here is the reporting workflow and the fact that the pack is designed to be generated directly from the calculation results."

### Ad-Hoc Analysis

"The final reporting capability I want to show is Ad-Hoc Analysis.

Unlike the standard management or regulatory reports, this screen allows the user to choose exactly which measures and affiliates they want to analyse.

The platform currently has 12 metrics available, including the Liquidity Coverage Ratio, Net Stable Funding Ratio, Loan-to-Deposit Ratio, Liquidity Survival Horizon, depositor concentration, Non-Performing Loan Ratio, Net Interest Margin, net interest income sensitivity, economic value sensitivity and foreign exchange position.

I can then select one or more affiliates and run the analysis. The important point is that these metrics are coming from the platform's own calculation catalogue and register. The analysis reads from the latest completed run for the selected affiliate.

So, for example, if management asks me to compare the Liquidity Coverage Ratio and Net Interest Margin across Nigeria and Ghana, I don't need to build a new report or export the data to Excel. I select the two measures, select the affiliates and run the analysis.

This gives users flexibility without creating another uncontrolled reporting process. They're still using the same definitions and calculation results that power the main dashboards and reports.

So the reporting section gives us three levels: standard management reporting, regulatory reporting, and flexible ad-hoc analysis."

### Custom Metrics

"This is the Custom Metrics screen. This allows the bank to define its own measures using results that have already been produced by the calculation engine.

The important point is that we're not creating a new calculation from raw data here. We're taking named outputs from an existing run and combining them into a formula.

For example, I could create a ratio using high-quality liquid assets divided by net cash outflows and express the result as a percentage.

The platform shows me the available outputs that I can use, such as high-quality liquid assets, net cash outflows, available stable funding, required stable funding, loans, deposits, total assets and equity.

This makes the process flexible. If the bank wants to monitor a management ratio that isn't already part of the standard metric catalogue, the user can define it here rather than waiting for a new application release.

There is also an important control around the formula. The metric can only use outputs that are actually available to the run. If I reference a name the platform doesn't recognise, it won't silently treat that value as zero. It reports the issue instead.

That is important because a metric that quietly produces a result from missing data can be more dangerous than one that refuses to calculate.

At the moment, there are no custom metrics saved, so the screen is showing the configuration capability rather than an active metric.

So the key point is: the bank can create its own reusable management measures from trusted calculation outputs without changing the underlying calculation engine."

### Filters & Expressions

"This is the Filters and Expressions screen. This allows us to create named, reusable filters that can be applied to a calculation run.

Instead of redefining the same conditions every time we want to analyse a subset of the balance sheet, we can define the filter once and reuse it.

For example, I could create a filter that selects positions where the amount is greater than zero. I can also add additional conditions where required.

The conditions are combined using AND, so a position has to meet all the conditions defined in the filter.

We can also create Group filters that can be combined with other filters. This means we can build smaller, reusable selections instead of creating one very long list of conditions every time.

Once created, the filter can be attached to a Process Run to narrow the scope of the calculation without having to redefine the entire run.

At the moment, there are no saved filters in the environment, so this is an example of the configuration capability rather than an active filter.

So, simply put: Filters allow users to define a data selection once and reuse it across calculations."

---

## 11:50–11:57 | Group Aggregation, Regulatory & Architecture

### Regulatory Reporting

"Next is Regulatory Reporting. This is where the platform takes the data and results from the calculation runs and prepares regulatory returns for the relevant affiliate and regulator.

At the moment, we have no returns in the environment, so the counters are all at zero. I won't present a sample return as though it has already been submitted.

The important capability here is that a return is created for a specific affiliate and its regulator, and the figures can be linked back to the calculation run that supplied them.

That gives us traceability. If someone asks where a number in a regulatory return came from, we can identify the underlying run rather than relying on a manually prepared spreadsheet.

The other important control is maker-checker. The person preparing the return is not the same person who approves it for submission. This gives us a clear separation between preparation and approval.

From this screen, we can also monitor the status of returns - whether anything is overdue, currently being processed, or has been accepted.

So the workflow is straightforward: select the affiliate and regulator, prepare the return from the relevant data, link it to the source run, submit it through maker-checker, and track the outcome.

The key value is that regulatory reporting becomes part of the same controlled data and calculation process we've been using throughout the platform."

### X Position & Cross-Currency Funding

"This is the Foreign Exchange Position and Cross-Currency Funding screen. It gives us two related views: first, the bank's net foreign exchange position by currency; and second, whether the bank is relying on foreign-currency funding to support foreign-currency assets.

At the top, we can see that the current book contains one currency, Nigerian Naira. The aggregate net open position is zero at Group level because the position is fully captured within the functional currency view.

When we look at the currency-level detail, Nigerian Naira has ₦2.3 million of assets against ₦2 million of liabilities, leaving ₦300 thousand of capital as a long position. That represents 100% of capital, which is above the configured 10% single-currency threshold.

The important point is that the platform doesn't just show us the total foreign exchange position. It shows the position for each currency and compares that position against capital, so we can immediately identify a currency exposure that requires attention.

The second section looks at cross-currency funding. Here, foreign-currency assets are zero and foreign-currency liabilities are also zero, so there is currently no foreign-currency funding reliance in this run.

In a more diversified Group book, this view would allow us to see whether, for example, foreign-currency assets are being funded with liabilities in the same currency or whether the bank is relying on another currency to fund them.

So the key message is: this screen connects currency exposure with the funding structure behind that exposure. It tells us not only what currencies the bank is exposed to, but whether foreign-currency funding is creating an additional risk."

### Process Run

This is actually one of the most important screens in the whole demo, because it explains how all the numbers we've shown are produced.

"We've now looked at the individual risk, treasury and reporting capabilities. Let me now show you the Process Run, because this is where those calculations actually come together.

The Process Run is essentially where we tell the platform what date we are calculating, what part of the Group we are calculating, which calculations we want, and which rules and scenarios should be applied.

At the top, we have some ready-made presets. For example, I can run a Daily Liquidity Check, a Monthly Interest Rate Risk run, or the Full Asset Liability Committee Pack. This makes the common processes very quick to execute.

If I need more control, I can choose Custom and define the run myself.

Let's look at the run definition. First, I select the as-of date. Only dates where committed position data exists are available, so the platform doesn't allow us to run against a date where there is no approved data.

Next is the process type. A Static run analyses the existing book as it stands today. A Dynamic run requires a New Business rule to be selected here as a precondition - the run will not execute without one. The period-by-period application of that growth plan against the projected book is what the separate Forecast screen produces; a Dynamic Process Run itself still calculates the current elements against the existing book.

I then define the reporting currency. For a Group run, the individual affiliate positions can be consolidated into the Group reporting currency.

The next part is Scope. This is where we decide exactly what part of the organisation the calculation should cover. I can run at Group level, select an affiliate such as Nigeria, or go further down into a particular business unit.

I can also restrict the calculation by product if required. So, for example, I could run the analysis specifically on loans, deposits or treasury positions.

Then we have the Calculation Elements. This is where we choose what we actually want the engine to calculate. We can select liquidity measures, liquidity gaps, repricing gaps, interest-rate sensitivity, survival horizon, Funds Transfer Pricing, profitability, foreign exchange position and the other available calculations.

This is important because the user doesn't have to run everything every time. For a daily liquidity check, I can select the relevant liquidity calculations. For a monthly Asset Liability Committee process, I can select the full set.

The next section is Rules. These determine how the calculation treats the data. For example, we have the time-bucket rules, product characteristics and behavioural patterns. These are maintained centrally, so the person uploading the position data doesn't have to manually provide all of these calculation assumptions. One thing worth stating plainly on camera: every selector here starts blank on every new run, with no memory of what the previous run used - configuring Product Characteristics once (Step 6 earlier) doesn't mean it's automatically applied; it has to be picked from this list on every run that should use it.

We can also select the rate scenarios. For example, we can apply the Group's defined 200 basis-point parallel rate shock. The scenario is visible and editable rather than being hidden inside the calculation.

Finally, we have the Position Book contributors. A Group run can read committed data from the live affiliates. The platform also shows us whether the expected departmental data is complete.

In this particular example, Loans, Deposits and Treasury are showing as missing. The system will still allow the run to proceed, but it clearly warns us that the resulting book is incomplete.

That's an important control because we're not just getting a number - we're also being told about the quality and completeness of the data behind that number.

Once everything is configured, I select Execute Run. The platform then calculates the selected elements and stores the result against that specific run.

And this is important for everything we've seen so far: the dashboards, liquidity analysis, interest-rate risk, stress testing, profitability and reporting are all reading from completed calculation runs.

The results are also immutable and tied to the versions of the data and rules that were used. So if the underlying data changes later, we don't silently rewrite an old result. We create a new run.

So, in simple terms, this is the engine room of the platform:

Data comes in → we define the scope and assumptions → the calculation runs → the results are stored → the other modules consume those results."

### Run History

"Now that we've seen how a run is created, this is Run History. This is where the platform keeps the record of every calculation that has been executed.

At the top, read the live counts off screen - how many runs, how many completed, any failed, any currently sitting on superseded data (a real one to point at deliberately if you re-uploaded a corrected file earlier in the demo, per Step 3's re-upload control).

Each row tells us the important information about the run - what scope was calculated, the as-of date, whether it was static or dynamic, how many calculation elements were included, its status, the data version it used, and when the run was executed.

The picker only ever shows the latest run per as-of date, by design - re-running the same date after a data correction doesn't clutter this list with the superseded attempt, though nothing is deleted; the earlier run is still here in the full history, just not competing for attention in the picker.

The important part is that the run isn't just a result. The platform keeps a record of what the calculation consumed and what it produced. This gives us traceability.

I can also open a run to inspect the underlying details, and where we have multiple runs, we can compare them to understand why a number changed between periods or between different versions of the data.

So, for example, if management asks, 'Why did the Liquidity Coverage Ratio change from one run to another?', we're not trying to reconstruct the calculation manually. We can compare the runs and investigate the underlying data, rules and calculation results.

One other useful control is the data status. The Nigeria run is marked Current - Not reconciled, while the Group run is current. That distinction is visible to the user rather than being hidden.

So this screen gives us the audit trail around the calculation process: what was run, when it was run, what data it used, what came out, and whether that result is still based on current data."

### Batch Scheduler

"This is the Batch Scheduler.

Process Run is where we run a calculation manually. The Batch Scheduler is where we automate calculations that need to happen regularly.

The idea is simple: what should run, who or what it should run for, and how often.

In this environment, we don't have any schedules configured yet, so we have zero schedules and zero active schedules.

From here, I can create a schedule for a Group or an affiliate, select the calculation I want to run, and define the frequency.

For example, we could schedule a daily liquidity check or a monthly Interest Rate Risk in the Banking Book calculation.

Once a schedule is active, the platform tracks each occurrence and can flag anything that becomes overdue.

So, simply put: Process Run is for running a calculation; Batch Scheduler is for making that calculation recurring."

### Affiliates

"This is the Affiliates screen. This gives us the Group footprint and, importantly, shows us the status of each affiliate and whether its data is current.

The platform ships with no affiliates pre-loaded at all - only the Group entity exists until one is onboarded, which is exactly what we built up together in Step 1 of Data, Product & Cash-Flow Management. Read the live count and status of each affiliate off screen - however many have been onboarded so far in this session.

The key control here is that only Live affiliates are included in the Group consolidation. So an affiliate doesn't automatically start contributing to Group figures just because it has been created in the system - it needs the second-Admin approval we saw earlier.

We can also see the data freshness for each affiliate on this screen.

From here, we can either onboard an affiliate individually or use the bulk onboarding option when we need to bring several entities into the Group.

If I open an affiliate, I can continue through its onboarding steps - including its profile, currencies, data sources, chart of accounts, assumptions, limits and initial data load.

So the important point is that Group consolidation is controlled by affiliate status and data readiness, not simply by whether the affiliate exists in the system."

### Onboard Affiliate

This is the Onboard Affiliate workflow. The purpose is to take an affiliate from a new entity all the way to being ready for Group consolidation.

What I like about this workflow is that everything happens in one place. We don't have to jump between different screens for connector setup, data loading and reconciliation.

There are six steps in total - already walked through in full in Step 1 of Data, Product & Cash-Flow Management: legal entity and profile, currencies and calendar, connectivity and data sources, chart of accounts and organisation, assumption inheritance, and limits and regulatory thresholds. Initial data loading is deliberately not one of these steps - it happens afterward, through Data Management, the same way every subsequent month's data does; onboarding's job is to configure the affiliate, not to be a one-time special upload path.

The first step is Legal Entity and Profile. Here we identify who the affiliate is, where it operates and which regulator applies to it.

The regulator is important because it determines the regulatory minimums that are seeded later in the onboarding process. We also give the entity its position within the Group legal-entity structure.

Once the required information is valid, the record saves automatically and we can move to the next step.

The important control is that completing onboarding doesn't immediately make the affiliate part of Group reporting. Activation still goes through maker-checker approval - and specifically, whoever submitted onboarding cannot be the one who approves it, even as an Administrator. Only after a *different* approver signs off and the affiliate is Live can it contribute to Group consolidation.

So this gives us a controlled path from new affiliate → configured → validated → approved → Live.

### Bulk Onboard Affiliates

"This is the Bulk Onboard option. It is designed for situations where we're bringing several affiliates into the Group and don't want to enter them one by one.

The process starts with an Excel template. The template captures the information needed to pre-fill the onboarding process for each affiliate.

We provide the affiliate profile, currencies, connectivity requirements, chart of accounts mapping and organisation structure. The template also includes reference information such as valid regulators, currencies, calendars, data domains and Group chart of accounts nodes, so the user doesn't have to leave the process to look up valid values.

Once the completed workbook is uploaded, the platform uses it to create the affiliate onboarding records.

An important point is that bulk onboarding does not bypass the controls. Each affiliate still enters Onboarding status and must complete its connectivity, initial data load and reconciliation, followed by its own approval before it becomes Live.

So we're making the setup faster without weakening the control framework.

In simple terms: bulk onboarding accelerates setup; it doesn't bypass onboarding and approval."

### Users & Roles

"This is the Users and Roles screen. This is where we control who can access the platform and, more importantly, what they are allowed to do.

The principle is simple: a user's role and scope determine what they can see and what actions they can perform across the application.

We currently have seven active users across seven roles - two of them Administrators specifically, which is deliberate: segregation of duties means the person who submits an onboarding or activation request can never be the one who approves it, so a second Admin genuinely has to exist for that control to be enforceable at all. We can see that users are assigned to different scopes - some are Group-wide, while others are restricted to a specific affiliate.

We also have role-specific responsibilities. For example, the Risk Analyst focuses on liquidity risk, Interest Rate Risk in the Banking Book and stress testing. The Treasury User manages Funds Transfer Pricing, the balance sheet and transaction strategies. The Reporting User focuses on regulatory, Asset Liability Committee and management reporting.

We also have an Affiliate Administrator. This is important in a Group structure because that user can manage their own affiliate without having Group-wide administrative access.

The Administrator has the broadest access, including users, permissions, configuration, connectors and the audit trail. At the other end, the Executive Viewer is read-only and can view Group-level information without changing the underlying configuration.

Permissions within each role can also be edited here. So we're not relying on one fixed access model - the bank can tailor the permissions to its operating structure.

We can also see the multi-factor authentication status for every user. In this environment, all seven users are enrolled.

The key point is that access control is applied across the platform, not just on this screen. The role determines the user's navigation, available actions and what they can actually do.

So, in simple terms: the right person sees the right information and gets the right level of access."

---

## 11:57–12:00 | Q&A / Close
