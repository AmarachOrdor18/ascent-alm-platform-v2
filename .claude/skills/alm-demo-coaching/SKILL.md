---
name: alm-demo-coaching
description: >
  Creates executive-ready Asset and Liability Management demonstration
  coaching guides from the actual application implementation. Use when
  preparing vendor-led ALM demonstrations, walkthroughs, RFP demonstrations,
  screen-by-screen presentation scripts, metric explanations, banking
  interpretations, calculation explanations, or executive demo preparation.
---

# ALM Executive Demonstration Coaching

## Purpose

Turn the actual ALM application into a professional, executive-facing
vendor demonstration.

The objective is not simply to describe the UI.

The objective is to help the presenter:

1. Guide the audience's eyes through the screen.
2. Explain every important metric visible on the screen.
3. Explain what each metric means in banking.
4. Explain how each metric is calculated.
5. Explain what is driving the displayed result.
6. Explain why the metric matters to Treasury, Risk, Finance, ALCO and executives.
7. Demonstrate the business value of the platform.
8. Transition naturally to the next capability.

The final output should sound like a senior ALM solution consultant presenting
to a major international bank.

It must NOT sound like a developer explaining code.

---

# SOURCE OF TRUTH

The actual application implementation is the primary source of truth.

Before generating a demonstration script, inspect the relevant application
screens and, where necessary:

- components
- pages
- hooks
- services
- calculation engines
- calculation functions
- APIs
- database schemas
- seeded data
- configuration
- scenario definitions
- product characteristics
- behavioural assumptions
- process-run logic
- limits
- stress-testing logic
- reporting logic
- aggregation logic
- data-versioning logic
- audit logic

Trace displayed metrics back to the implementation whenever possible.

Do not invent functionality.

Do not assume that a UI label means the underlying calculation is fully
implemented.

If the application implementation differs from standard banking practice,
describe the application's actual behaviour and clearly distinguish it from
the standard banking definition.

---

# METRIC-FIRST ANALYSIS

For every screen, identify ALL meaningful metrics.

Do not only explain headline cards.

If a screen contains a headline metric plus supporting metrics, explain all
of them.

For every metric determine:

- Full name
- Acronym, if applicable
- Banking definition
- Business purpose
- Source data
- Formula
- Calculation logic
- Assumptions
- Configuration
- Scope
- Time horizon
- Currency
- Scenario
- Aggregation
- What increases the metric
- What decreases the metric
- What a high value means
- What a low value means
- What management should infer from it
- What decision it supports
- Exact displayed value

---

# REQUIRED SCREEN STRUCTURE

Every screen must use this structure.

## SCREEN X — [SCREEN NAME]

### 1. What you are looking at

Brief explanation of what the screen represents.

### 2. What you say

Write the actual spoken presentation script.

The speech must:

- sound natural when spoken
- sound executive
- guide the audience through the screen
- introduce the business purpose
- point to the metrics in logical order
- interpret the values
- connect the metrics to banking decisions
- transition naturally to the next capability

Do not turn the spoken script into a technical essay.

---

### 3. Where to direct their eyes

List the UI elements in the exact order the presenter should point to them.

Example:

1. Reporting scope
2. Reporting date
3. Headline metric
4. Supporting metric
5. Chart
6. Table
7. Warning
8. Breach
9. Drill-down

Every important visible metric must appear in this section.

---

### 4. Metric-by-metric banking explanation

For EACH important metric use:

#### [Full Metric Name]

**Displayed value:**
[Actual value shown by the application]

**What it means in banking:**
Explain the banking concept in clear executive language.

**Why Treasury/Risk cares:**
Explain the management significance.

**How the application calculates it:**
Describe the actual implementation.

**Formula:**
Provide the mathematical formula where appropriate.

**Inputs:**
List the underlying inputs.

**Assumptions:**
List relevant assumptions.

**Interpretation of this result:**
Explain what the actual number on the screen is telling management.

**What can change it:**
Explain the major drivers.

---

# EXECUTIVE TRANSLATION

After explaining the technical metric, always translate it into executive
language.

Use language such as:

"What this tells management is..."

"From a Treasury perspective..."

"From a Group Risk perspective..."

"The important point here is..."

"What matters operationally is..."

"The risk implication is..."

"The management decision this supports is..."

Do not over-explain basic banking concepts to an audience of experienced
bankers.

The audience understands banking.

The job is to connect the application's numbers to management decisions.

---

# LIVE SCRIPT VS TECHNICAL DETAIL

Separate what the presenter says from what the presenter needs to know.

The LIVE SCRIPT should be concise enough to deliver during the demonstration.

The technical explanation should provide enough depth to answer questions.

Use:

### LIVE SCRIPT

What the presenter says.

### COACHING / TECHNICAL DETAIL

What the presenter needs to understand.

### IF THEY ASK

The deeper answer to likely technical questions.

Never force the presenter to read formulas aloud unless useful.

---

# ACRONYM RULE

Never rely on unexplained acronyms in the spoken presentation.

Use the full banking term.

Examples:

Liquidity Coverage Ratio instead of only LCR.

Net Stable Funding Ratio instead of only NSFR.

Economic Value of Equity instead of only EVE.

Net Interest Income instead of only NII.

Funds Transfer Pricing instead of only FTP.

General Ledger instead of only GL.

Foreign Exchange instead of only FX.

High-Quality Liquid Assets instead of only HQLA.

Available Stable Funding instead of only ASF.

Required Stable Funding instead of only RSF.

Non-Maturity Deposits instead of only NMD.

Interest Rate Risk in the Banking Book instead of only IRRBB.

Present Value of a One Basis Point movement instead of only PV01.

The acronym may be shown in parentheses in the coaching notes:

Liquidity Coverage Ratio (LCR)

but the spoken script should normally use the full term.

---

# DEMONSTRATION STORY

The demonstration should feel like one continuous business story.

Use the following logical progression where appropriate:

DATA

Where does the data come from?

↓

VALIDATION

Can we trust the data?

↓

PRODUCT BEHAVIOUR

How does each product behave?

↓

LIQUIDITY

Do we have enough liquidity?

↓

MATURITY

When does cash come in and go out?

↓

REPRICING

When do interest rates reset?

↓

BEHAVIOURAL MODELLING

How realistic are contractual assumptions?

↓

CONCENTRATION

How dependent are we on particular funding sources?

↓

LIMITS

Are we within risk appetite?

↓

STRESS

What happens when conditions deteriorate?

↓

PROFITABILITY

How does risk translate into economics?

↓

GROUP AGGREGATION

How does management see the entire group?

↓

GOVERNANCE

Can we prove how every number was produced?

Use this progression to make transitions logical.

---

# BANKING CALCULATION DEPTH

For every important metric, explain both:

1. Standard banking meaning.
2. Actual application implementation.

Never confuse the two.

For example:

If explaining Liquidity Coverage Ratio:

First explain the banking concept.

Then explain the application's actual calculation.

Then explain what the displayed result means.

If the application's calculation is simplified, state that internally in the
coaching notes and do not falsely present it as a complete regulatory
implementation.

---

# FORMULA REQUIREMENT

Where a metric has a meaningful formula, include it.

Explain the formula first in plain English.

Then provide the mathematical representation.

Then explain the inputs.

Then explain how the application derives each input.

The presenter should be able to answer:

"How did the system arrive at this number?"

without needing to inspect the source code during the meeting.

---

# EXECUTIVE AUDIENCE

The primary audience includes:

- Group Risk
- Treasury
- Balance Sheet Management
- Finance
- Corporate & Investment Banking
- Corporate & Commercial Banking
- Technology
- Information Security
- Group Transformation
- Business Services
- Senior executives

Adapt explanations accordingly.

For Risk:

Emphasise measurement, limits, scenarios, controls and governance.

For Treasury:

Emphasise liquidity, funding, gaps, repricing, concentration and management
actions.

For Finance:

Emphasise profitability, balance-sheet impact and reconciliation.

For Technology:

Be precise about architecture, integrations, data flow and scalability.

For Information Security:

Be precise about access control, roles, permissions, interfaces and auditability.

For executives:

Focus on what the numbers mean, where the risk is and what decision the
platform enables.

---

# RFP ALIGNMENT

When an RFP or demonstration agenda is provided, map the application
capabilities to the agenda.

For every demonstration section identify:

- RFP requirement
- Application screen
- Capability demonstrated
- Metrics demonstrated
- Business value
- Evidence in the application
- Questions likely to arise

Do not force the application to claim capabilities it does not actually have.

---

# TIMING

The demonstration is live.

Respect the allocated time.

For every major section provide:

- Number of screens
- Recommended time per screen
- MUST SAY
- IF TIME ALLOWS
- IF ASKED

Prioritise the business-critical metrics.

The presenter must be able to shorten the section without losing the main
story.

---

# LIKELY QUESTIONS

For every major section include likely questions from:

- Group Risk
- Treasury / Balance Sheet Management
- Finance
- Technology
- Information Security
- Business
- Group Transformation

Answers must be based on the actual implementation.

Never invent functionality merely to make an answer sound impressive.

---

# MEMORY MAP

At the end of each major section, provide a short presenter memory map.

Example:

Liquidity:

"Are we liquid enough?"

↓

"When does the pressure occur?"

↓

"When do our rates reset?"

↓

"Who provides the funding?"

↓

"Are we within appetite?"

↓

"What happens under stress?"

The memory map should help the presenter remember the story rather than
memorise paragraphs.

---

# NUMBERS TO REMEMBER

At the end of the complete guide, provide a table containing the important
demonstration numbers.

Include:

- Metric
- Value
- Screen
- Meaning
- Why it matters

Use actual values from the application.

Do not fabricate numbers.

---

# CALCULATION REFERENCE

If `docs/ALM_DEMO_CALCULATION_REFERENCE.md` exists in this repository, treat
it as the pre-verified technical bible for every metric's banking
definition, formula, source fields, calculation function, assumptions,
configuration, worked example and displaying screen.

Do not blindly trust it. Whenever the reference and the current code appear
to disagree — a field that no longer exists, a formula that reads
differently in `src/engine/*`, a screen that no longer shows the metric —
re-verify against the current implementation and treat the code as
authoritative. Note the discrepancy so the reference file can be corrected,
rather than silently presenting the stale version as fact.

If the file does not exist, build the demonstration guide directly from the
application implementation, and mention that a calculation reference could
be generated as a follow-up.

---

# FINAL QUALITY CHECK

Before returning the demonstration guide, verify:

- Every major screen has been covered.
- Every important visible metric has been addressed.
- Every metric has a banking interpretation.
- Every important metric has a calculation explanation.
- Actual application values are used.
- No functionality has been invented.
- The spoken script sounds natural.
- The presenter is told where to point.
- Acronyms are expanded in spoken language.
- Technical detail is separated from live speech.
- Executive implications are clearly stated.
- Transitions connect the screens.
- The RFP requirements are addressed.
- Timing is realistic.
- Likely questions are covered.
- The document is usable during a live demonstration.

The final result should feel like a senior ALM consultant's private
demonstration coaching guide for a high-stakes banking RFP.
