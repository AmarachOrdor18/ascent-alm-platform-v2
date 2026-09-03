# Ascent ALM - Live Product Demo Script
## For: Ecobank Group ALM System RFP
## Format: live software walkthrough, ~90–120 minutes, adjust timing to the room

---

## How to use this script

This is a **product demo**, not a slide pitch. Every claim below is something you can actually click through in the running app - nothing here describes a roadmap item as if it's already built. Where a capability genuinely isn't built yet (an API layer, live core-banking connectors, enforced multi-factor login), this script says so plainly and turns it into an honest, confident answer rather than a dodge. A prospect's technical team may probe hard - better they hear the true state from you, in a good light, than discover a gap themselves mid-demo.

Speak in plain language first, banking-technical second. Assume some people in the room are not ALM specialists.

---

### Suggested Agenda

| Time | Area |
|---|---|
| 0:00–0:05 | Opening |
| 0:05–0:10 | Executive Dashboard - the one-screen answer |
| 0:10–0:20 | Getting data in - upload, validate, reconcile |
| 0:20–0:35 | Liquidity - are we liquid enough? |
| 0:35–0:50 | Interest rate risk - what happens when rates move? |
| 0:50–1:00 | Behavioural assumptions - why the numbers are realistic, not just contractual |
| 1:00–1:15 | Funds transfer pricing & profitability - the true economics |
| 1:15–1:30 | Stress testing, reverse stress, and forecasting |
| 1:30–1:40 | Limits, breaches, and closing the loop |
| 1:40–1:50 | Multi-affiliate consolidation, roles, and how it's built |
| 1:50–2:00 | Q&A / close |

---

## 0:00–0:05 | Opening

### SCRIPT

"Thanks for the time today. Rather than talk you through slides, I'm going to show you the actual software - live, in the browser, working through a real bank's data. Everything I click is real: the numbers you see are computed from the positions loaded in, not hardcoded for the demo.

Three things I want you to walk away knowing:
1. **The calculation engine is the hard part, and it's done.** LCR, NSFR, IRRBB, stress testing, funds transfer pricing - all of it is real, tested logic, not a mockup.
2. **The data-quality and governance discipline a bank actually needs is built in** - validation before anything is trusted, GL reconciliation, maker-checker approvals, an audit trail, and a real issue-tracking workflow.
3. **I'll be straight with you about what's proven today versus what's normal next-stage engineering** - a production API layer, live core-banking connectors, enforced multi-factor login. None of that is mysterious or risky work; it's the kind of integration engineering every vendor does after the hard calculation logic is validated, which is exactly what you're about to see."

### WHAT TO SHOW
- Log in, land on the Executive Dashboard
- Point out the affiliate switcher at the top - this single control is what drives every screen in the app

---

## 0:05–0:10 | Executive Dashboard - the one-screen answer

### SCRIPT

"This is the first thing anyone opens: **Overview → Executive Dashboard**.

In plain terms, this answers four questions a treasurer asks every morning:
- **Do we have enough liquid assets to survive a bad month?** - that's LCR.
- **Is our funding structurally stable, not just liquid today?** - that's NSFR.
- **How many days could we actually survive a severe run?** - Survival Horizon.
- **Are we too reliant on customer deposits versus wholesale funding?** - Loan-to-Deposit.

Every tile links straight to the detail behind it - click LCR, you're on the Liquidity Risk screen with the full breakdown, not just a bigger version of the same number.

At the top is the affiliate switcher. I can look at one country's book, or switch to **Group**, which genuinely consolidates every affiliate's positions and converts every currency through to one reporting currency - it isn't a second, separately-maintained 'Group' number, it's the same engine running against everyone's data at once."

### WHAT TO SHOW
- The four headline tiles
- Click into one tile to show the drill-through to its detail screen
- Switch the affiliate scope from one country to Group and back

### IF THEY ASK
**Q: How current is this data?**
A: It reflects whatever the last completed calculation run used. Runs are on-demand today - you upload data, you run it, you see results immediately, no overnight batch wait.

**Q: Can we change which metrics show here?**
A: The dashboard's metric set is defined in code today, not a drag-and-drop configuration screen. Making it user-configurable is a small, well-understood addition, not a redesign.

---

## 0:10–0:20 | Getting data in - upload, validate, reconcile

### SCRIPT

"Every ALM number is only as good as what feeds it, so let me show you how data actually gets into the system, and - just as important - how the system stops bad data before it ever reaches a calculation.

I'm in **Data Management**. Today, every domain - positions, general ledger, counterparties, FX rates, market data - comes in as a file upload, either dragged onto the screen or picked from a browser dialog, with a downloadable template so you know exactly what columns are expected before you build your extract.

I want to be direct about one thing: the screens you'll see for connecting to Flexcube, Calypso, Bloomberg, or Reuters are **configuration screens for that future integration, not live connections today**. That's a deliberate sequencing choice, not an accident - you don't want a vendor spending the first three months of a project wiring up your core banking feed before anyone has verified the risk numbers those feeds would drive are even correct. File upload gets us to a verified, trusted calculation engine fastest; the connector work plugs into the exact same validated pipeline once it's built, because the file-upload path and a future live-feed path both land in the identical intake step.

Now - the important part for a bank isn't the click, it's the trust. Watch what happens when I upload a position file for one department, say Loans:
- Every row is validated on the spot - required fields, valid currency codes, no duplicate IDs, the balance sheet has to actually balance. A file with a genuine error gets blocked from committing, not silently accepted.
- Positions load per department - Loans, Deposits, Treasury each submit their own slice for the same date, so no one department can silently overwrite another's numbers.
- Once loaded, it goes through **GL Reconciliation** - the position book gets checked against your general ledger trial balance, with a configurable tolerance, and someone has to explicitly sign off before that data is considered clean.

That sign-off, that per-department separation, that blocking validation - that's the control discipline a bank's internal audit actually asks for, and it's real, working logic, not a checkbox that always shows green."

### WHAT TO SHOW
- Data Management → Load Data → drag a CSV onto the upload zone
- Show the validation exceptions panel when a bad file is used, and show it genuinely blocking commit
- GL Reconciliation screen: upload a trial balance, show the variance, sign off
- Data Management → Reference Data → Connectors & Data Sources, being upfront that these are configuration cards, not live sockets, today

### IF THEY ASK
**Q: What formats do you support today?**
A: CSV is fully supported and is the primary path. Excel import exists for one specific onboarding workflow, not yet for day-to-day position/GL loading. XML and JSON aren't wired up yet. If your source systems only export XML, that's a defined, scoped piece of integration work, not a fundamental limitation of the architecture.

**Q: When would a live Flexcube/Calypso connector actually be ready?**
A: That depends on your environment access and IT security process more than our engineering - once we have a test connection to your core banking sandbox, wiring it into this same validated intake pipeline is standard integration work, typically weeks, not months.

---

## 0:20–0:35 | Liquidity - are we liquid enough?

### SCRIPT

"Now the core risk question. I'm on **Risk Management → Liquidity Risk**.

**Liquidity Coverage Ratio (LCR), in plain terms:** if a genuinely bad 30 days hit the bank - deposits leaving, credit lines drying up - do we have enough high-quality liquid assets to cover it? Below 100% is a regulatory breach. The screen shows exactly what counts as high-quality (with the standard Basel haircuts applied), and exactly what outflow assumptions are driving the denominator - nothing here is a black box.

**Net Stable Funding Ratio (NSFR):** the longer-horizon version of the same question - is our lending backed by funding that's actually going to still be there in a year, not short-term money that could vanish? Available stable funding over required stable funding, both built from real per-position factors, not a top-of-house estimate.

**Loan-to-Deposit** - how reliant are we on customer deposits versus wholesale funding, computed from the same book.

**Depositor concentration** - genuinely computed from your actual deposit book: who your largest depositors are, what the top-10 share looks like, and a concentration index, not a placeholder. If one client is 15% of your funding, that's a real vulnerability this screen surfaces on its own, without anyone having to go looking for it.

**Survival Horizon** - under a severe outflow scenario, how many days does the counterbalancing capacity - your liquid buffer - actually last before it runs out? This isn't a guess; it's a real day-by-day depletion calculation, and I'll come back to it with something new in the Stress Testing section - the ability to run it backwards.

**Maturity gap** - the contractual liquidity ladder, real Basel-style time buckets, showing exactly where a structural mismatch between what matures and what's due sits on the calendar."

### WHAT TO SHOW
- LCR and NSFR figures with their breakdowns
- Concentration screen - largest depositor, top-10 share
- Survival Horizon with its day-by-day timeline
- Maturity/repricing gap ladder
- Switch affiliate scope to show the same book recompute for a different country

### IF THEY ASK
**Q: How do you handle HQLA haircuts?**
A: Standard Basel haircuts by asset level, applied automatically - configurable if your internal methodology differs.

**Q: Is there a behavioural version of the liquidity gap, not just contractual?**
A: The calculation engine already applies behavioural assumptions - non-maturity deposit runoff, for instance - to the liquidity and rate-risk numbers you see. A dedicated side-by-side "contractual vs. behavioural" gap ladder view is a near-term addition to the Gap Analysis screen specifically, not new math - the behavioural engine is already computing it.

---

## 0:35–0:50 | Interest rate risk - what happens when rates move?

### SCRIPT

"Now the second pillar: what happens to the bank if interest rates move against us. I'm on **Risk Management → IRRBB & Behavioural Risk**.

**NII Sensitivity, in plain terms:** if rates move, how does that hit this year's earnings? Not a valuation exercise - the actual income-statement impact, from repricing the real book.

**EVE Sensitivity:** the longer-run version - if rates move today, how does that change the economic value of the whole balance sheet? This is the one regulators watch most closely: Basel's supervisory test is whether that swing exceeds 15% of your capital.

Both of these run against **all six of the Basel-prescribed shock scenarios** - parallel up, parallel down, steepener, flattener, short-rate up, short-rate down - and I mean six genuinely different curve shapes, not one shock relabeled six times. You can see each one's impact side by side, and which ones would actually fail the 15% outlier test.

Beyond the standard six, you can build a **custom rate shock** - pick your own curve shape - and see the impact live in the What-If Builder, which I'll come back to shortly."

### WHAT TO SHOW
- NII and EVE sensitivity figures
- The six BCBS shock table, with the outlier flag on any that breach 15%
- Jump into What-If Builder to build one custom shock live

### IF THEY ASK
**Q: How do you handle non-maturity deposits in this?**
A: Through the same behavioural assumptions covered next - deposit decay and repricing-lag assumptions feed both the liquidity numbers and the rate-risk numbers, so the two stay consistent with each other rather than each having their own separate guess.

---

## 0:50–1:00 | Behavioural assumptions - why the numbers are realistic

### SCRIPT

"Contractual terms lie about how a bank's balance sheet actually behaves - a savings account has no maturity date on paper, but in practice a meaningful share of it never leaves. That's what this section handles.

I'm in the rules for **Behaviour Patterns**. Deposits are tagged Core, Non-Core, Operational, or Non-Operational, and each tag carries its own configured run-off assumption - how much of that balance the model assumes leaves under stress. On the asset side, there's a separate prepayment model for loans - a constant-prepayment-rate assumption by product, capturing that a mortgage book pays down faster than its contractual schedule implies.

I want to be precise about what this is: these are **configurable, transparent assumption tables**, not a statistical model that fits itself to your historical withdrawal data. If your RFP language specifically calls for regression-fitted behavioural coefficients, that's a distinguishable, larger piece of work - a genuine data-science exercise requiring historical time series most banks don't have clean yet - separate from what's built today, which is assumption-driven and fully auditable, the way most banks actually run this in practice."

### WHAT TO SHOW
- Behaviour Patterns rule screen - Core/Non-Core segmentation and decay assumptions
- Behavioural Analysis results screen showing the applied tags against the actual book

### IF THEY ASK
**Q: Can different affiliates use different assumptions?**
A: Yes - rules can be Group-wide defaults or affiliate-specific overrides, and an affiliate-specific rule takes precedence automatically.

---

## 1:00–1:15 | Funds transfer pricing & profitability - the true economics

### SCRIPT

"Risk numbers tell you if you're safe. FTP tells you if you're actually making money, product by product.

I'm on **Treasury → FTP & Profitability**. The idea in plain terms: a loan's headline rate doesn't tell you its real margin - you have to know what it actually cost to fund it. This engine prices every position against a real yield curve at its own maturity - matched-maturity transfer pricing - then stacks named, visible add-ons on top: a liquidity premium for longer-dated assets, and whatever else your policy calls for. Nothing is one opaque blended spread; every component is broken out.

The results roll up **by business unit** - you can see a negative margin on Treasury's own book is expected, since Treasury funds the balance sheet at cost rather than earning a lending spread, and that's exactly the kind of insight this view is built to surface honestly rather than hide.

On the **Profitability** tab, the standard ratio set - net interest margin, non-performing loan ratio, non-earning asset ratio, interest income and interest expense as a share of total income, interest-bearing assets to liabilities - computed from the same book, and now breakable down by product or by business unit, not just one number for the whole bank."

### WHAT TO SHOW
- Transfer Pricing screen - margin by business unit, then drill into one line's rate breakdown
- Profitability screen - flip the segmentation toggle between Product and Business Unit

### IF THEY ASK
**Q: Can we price different business lines with different methodologies?**
A: Yes - the adjustment stack (liquidity premium and any other named add-on) is configurable per Common-COA classification, so different product families can carry different pricing treatment.

---

## 1:15–1:30 | Stress testing, reverse stress, and forecasting

### SCRIPT

"This is where I'd point to two things that go beyond a standard ALM checklist.

First, the standard stress test: **Risk Management → Stress Testing** runs the prescribed severe liquidity scenario - a real, day-by-day depletion of your counterbalancing capacity against a front-loaded outflow assumption - and shows exactly which day the buffer would run out, if it does at all.

Second - and this is the interesting part - **reverse stress testing**. Instead of only asking 'if this shock happens, what's the damage,' you can ask it backwards: 'how severe would a deposit run have to get before we'd only survive five days?' The system solves for that automatically. That's a genuinely useful board-level question - not 'are we okay under this one scenario,' but 'exactly how much stress can we actually take before we're in trouble' - and I don't often see it built into ALM tooling as a real, working feature rather than a slide.

Third - **multi-period forecasting**, in Stress Testing → Forecast. Pick a growth or rollover assumption - say, 'grow the loan book 2% a month, roll deposits forward with 10% growth' - set how many months out, and the engine projects the balance sheet forward period by period, recomputing LCR, NSFR, and NII sensitivity at each future point using the exact same calculation engine as today's numbers, not a separate simplified projection model. You can see, month by month, whether a growth plan would still keep you inside your regulatory floors a year from now.

One honest caveat: this projects off configured growth assumptions, not full scenario modelling of specific management actions like a bond issuance or an asset sale - that's meaningfully further scope, and I'd rather tell you that directly than let the forecast screen imply more than it does."

### WHAT TO SHOW
- Stress Testing: the severe scenario timeline
- Toggle to Reverse Stress, set a target survival day, show the solved outflow magnitude
- Forecast tab: pick a growth rule, run 6 months forward, show the LCR/NSFR trend chart

### IF THEY ASK
**Q: Can we save and reuse scenarios?**
A: Yes - rate-shock scenarios and growth assumptions are both saved, named rules you can reuse across runs, not re-entered each time.

---

## 1:30–1:40 | Limits, breaches, and closing the loop

### SCRIPT

"Numbers without a threshold don't tell you when to act. I'm on **Risk Management → Limits & Breaches**.

Every metric you've seen today can carry a limit - a regulatory floor and a tighter internal trigger, with genuine three-tier status: green, amber, red, and a separate flag specifically for breaching the regulatory minimum, not just your internal appetite. Temporary limits are supported too, with a real expiry date - if someone grants a relaxation, it silently reverts the moment it expires, it doesn't just sit there forgotten.

Here's the part I actually want to highlight: when a limit is breached, there's a button right there - **'Raise a remediation issue'** - that creates a tracked issue with an owner, a due date, and a genuine multi-stage lifecycle: Identified, Assessed, Planned, In Progress, Verified, Closed. And there's a real control most tools skip: the person who owns an issue **cannot close it themselves** - someone else has to verify it, with every stage change timestamped in an audit trail. That's segregation of duties actually enforced in the workflow, not just described in a policy document."

### WHAT TO SHOW
- A breached limit, red status
- Click "Raise a remediation issue," land on the Remediation screen with it pre-filled
- Advance a different issue through its stages, showing the audit trail and the self-close block

### IF THEY ASK
**Q: How do you handle limit overrides?**
A: Temporary limits require an explicit expiry date and are visible on the Limits screen the entire time they're in force - no silent, permanent relaxation.

---

## 1:40–1:50 | Multi-affiliate consolidation, roles, and how it's built

### SCRIPT

"Two last things, then I want to be straightforward with you about the architecture.

**Consolidation:** every screen you've seen works identically whether you're looking at one affiliate or the whole Group - the Group view genuinely aggregates every affiliate's own positions and converts every currency through, computed by the exact same engine, not a separately-maintained roll-up number.

**Roles:** seven distinct roles today - Administrator, Risk Analyst, Treasury User, Executive Viewer, Control Tester, Reporting User, and Affiliate Administrator - each with its own permission set, and every screen and action in the app is gated by role: if you can't do something, the control is disabled or the screen isn't reachable, not just hidden with a workaround available.

Now, the honest architecture picture. **This is built as a client-side application today** - the entire calculation engine runs in the browser, backed by local browser storage, with no server component yet. That was a deliberate choice for this stage: it let us prove the calculation logic - every metric you've seen - is genuinely correct, fast, and testable, without the cost and time of standing up a full backend before we knew the numbers were right. What that means concretely for where we are:

- **Real-time API access, single sign-on, and enforced multi-factor login are not live yet.** They're normal integration engineering on top of a proven core, not an open question about whether the platform can do it.
- **Sign-in today is genuine credential-based authentication** - not a role picker - but it's a first pass, not yet hardened to enterprise identity-provider standards.
- **Every configuration change is logged**, but audit coverage isn't yet complete across every single record type - that's a known, prioritized punch-list item, not a design gap.

I'd rather hand you that list directly than have your technical team find it in a deep-dive and wonder what else wasn't disclosed. None of it changes the core claim: the hardest part of an ALM platform - getting the risk math right, consistently, across every product and every affiliate, with real governance around it - is done and in front of you right now."

### WHAT TO SHOW
- Switch between an affiliate view and Group view on the same screen
- Administration → Users, showing the role list and permission differences
- (Optional, only if asked) a quick look at the audit log

### IF THEY ASK
**Q: What would it take to get this production-ready for Ecobank?**
A: Three genuinely separable workstreams, which can run in parallel: (1) a backend/API layer wrapping this same calculation engine - the engine itself doesn't need to change to do this, (2) live connectors to your actual core banking and treasury systems, replacing file upload for those domains, (3) enterprise authentication - SSO and enforced MFA. None of these are open engineering questions; they're scoped, standard work.

**Q: Why show us something that isn't finished?**
A: Because the part that's genuinely hard to build correctly - and the part every ALM vendor's sales pitch claims to have nailed - is the calculation engine and the governance discipline around it. That's what you should be evaluating hardest today, and it's real. The remaining work is the part every serious enterprise software vendor does as a matter of course.

---

## 1:50–2:00 | Q&A / Close

### SCRIPT

"That's the platform. To summarise what's real, working, and in front of you today:

- LCR, NSFR, loan-to-deposit, and genuine depositor concentration
- IRRBB - NII and EVE sensitivity, all six Basel shocks, plus custom shocks
- Behavioural assumptions driving both liquidity and rate-risk numbers
- Funds transfer pricing with a real matched-maturity engine and a liquidity premium
- Stress testing, including reverse stress testing and multi-period forecasting
- Limits with real three-tier escalation and a genuine remediation workflow with segregation of duties
- True multi-affiliate consolidation, not a mocked-up roll-up
- Data validation and GL reconciliation gating what's trusted before any number is calculated

And straight talk on what's next: an API layer, live core-system connectors, and enterprise authentication - all normal follow-on engineering on a foundation that's already proven to compute the numbers correctly.

Where would you like to go deeper?"

### WHAT TO SHOW
- Back to the Executive Dashboard
- Open floor
