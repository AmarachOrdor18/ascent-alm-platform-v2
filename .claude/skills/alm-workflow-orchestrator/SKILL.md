---
name: alm-workflow-orchestrator
description: Evaluate and implement a coherent, dependency-aware workflow architecture across the entire Ascent ALM platform — discover real business dependencies between modules, build a reusable dependency resolver, add workflow-status and stale-result detection, connect orphaned screens with role-aware contextual "next step" guidance, and enforce/expose cross-module handoffs (data lineage, affiliate/group scope, permissions). Distinct from an audit or a simplification pass — this designs and builds the missing structural architecture, not just finds or trims friction. Use when the user asks to make the app feel like one connected platform, wants dependencies between modules actually enforced or explained (not just documented), mentions building a workflow engine, "what should I do next", stale/out-of-date results, or orphaned/disconnected screens needing a structural fix — even if they don't say "workflow orchestrator".
---

# ALM Workflow Orchestrator — Full Application Dependency & Journey Audit + Implementation

You are acting as a **Senior ALM Product Architect, Banking Workflow Designer, UX Architect, and Senior Full-Stack Engineer**.

Your task is to evaluate and then implement a **coherent workflow/dependency architecture across the ENTIRE ALM application**.

This is NOT a request to redesign individual screens.

The problem we are solving is:

> The application currently feels like a collection of disconnected modules. Users can navigate almost anywhere and perform actions without understanding what must happen first, what depends on what, what becomes available after a previous action, or where they should go next.

The objective is to make the application feel like **one connected ALM platform**, while still allowing experienced users to navigate directly when appropriate.

---

# CORE PRINCIPLE

Do NOT assume that every module needs to depend on another module.

Instead, determine for every meaningful action:

**Does a dependency actually exist?**

If YES:

* identify the prerequisite
* identify the dependent action
* enforce or communicate the dependency
* connect the screens
* guide the user to the next step
* prevent invalid execution where appropriate

If NO:

* leave the modules independent
* do not manufacture artificial workflows

If a dependency SHOULD exist from a real ALM/business perspective but does not currently exist in the application:

**IMPLEMENT THE MISSING DEPENDENCY.**

The goal is not simply to document problems.

The goal is to **discover → validate → design → implement → test**.

---

# IMPORTANT: DO NOT START CODING IMMEDIATELY

First inspect the entire application.

Understand:

* routes
* modules
* screens
* components
* contexts
* permissions
* roles
* affiliate/group scope
* data models
* API/service layer
* state management
* process runs
* configuration
* reference data
* uploads
* calculations
* reporting
* workflow
* navigation
* existing validation
* existing notifications
* existing modals/popups
* existing empty states
* existing dependencies

Search the codebase rather than assuming how the application works.

Build an internal map of the application before modifying anything.

---

# PHASE 1 — APPLICATION DEPENDENCY DISCOVERY

Create a complete dependency map.

For every major module, determine:

### INPUTS

What does this module consume?

Examples:

* GL data
* positions
* product definitions
* counterparties
* currencies
* affiliates
* interest-rate curves
* behavioural assumptions
* maturity buckets
* scenarios
* limits
* historical data
* process runs

### OUTPUTS

What does the module produce?

Examples:

* calculated positions
* liquidity gaps
* stress results
* breaches
* FTP rates
* profitability results
* reports
* regulatory outputs

### PREREQUISITES

What must exist before this module/action can meaningfully execute?

### DOWNSTREAM DEPENDENCIES

What uses its outputs?

### CONFIGURATION DEPENDENCIES

Does it depend on:

* reference data?
* product configuration?
* behavioural assumptions?
* limits?
* scenarios?
* curves?
* mappings?

### DATA DEPENDENCIES

Does it require:

* uploaded data?
* mapped GL?
* validated positions?
* reconciled balances?
* processed data?

### ROLE DEPENDENCIES

Who is expected to perform this action?

---

# PHASE 2 — BUILD A REAL APPLICATION DEPENDENCY GRAPH

Create a dependency graph conceptually similar to:

Reference Data
↓
Product / Instrument Configuration
↓
GL / Account Mapping
↓
Data Sources
↓
Data Upload / Integration
↓
Validation
↓
Reconciliation
↓
Position Processing
↓
Process Run
↓
Risk Calculations
↓
Liquidity / IRRBB / Stress Testing
↓
Limits & Breaches
↓
Reporting
↓
ALCO / Management / Regulatory Outputs

BUT:

**DO NOT blindly implement this exact sequence.**

Validate each relationship against the actual application and real ALM operating model.

Some branches should run independently.

For example:

Data
├── Liquidity Risk
├── IRRBB
├── Stress Testing
├── FX Position
└── Balance Sheet

Determine where shared prerequisites exist and where they do not.

---

# PHASE 3 — IDENTIFY "ORPHAN SCREENS"

Find screens that currently feel disconnected.

For every screen ask:

1. Where did the user come from?
2. Why would the user come here?
3. What must exist before this screen is useful?
4. What action normally happens before this?
5. What action normally happens after this?
6. What module consumes this screen's output?
7. Does the application communicate any of this?
8. Can the user execute an action that should technically be impossible?
9. Is the screen accessible even when its prerequisites are missing?

Flag these as:

* CONNECTED
* PARTIALLY CONNECTED
* DISCONNECTED
* INCORRECTLY CONNECTED

---

# PHASE 4 — USER JOURNEYS BY ROLE

Do NOT create one universal workflow.

Different users should experience different journeys.

Evaluate at minimum:

## Administrator

Typical journey:

Configuration
→ Reference Data
→ Affiliates
→ Users/Roles
→ Permissions
→ Workflow Configuration

## Data / Operations User

Typical journey:

Data Sources
→ Upload / Integration
→ Mapping
→ Validation
→ Reconciliation
→ Processing

## Risk Analyst

Typical journey:

Validated Data
→ Process Run
→ Liquidity Risk
→ IRRBB
→ Stress Testing
→ Limits & Breaches
→ KRI
→ Reporting

## Treasury User

Typical journey:

Positions
→ Balance Sheet
→ FX Position
→ FTP
→ What-If Analysis
→ Treasury Reporting

## Reporting User

Typical journey:

Processed Results
→ Management Reports
→ ALCO Reports
→ Regulatory Reports
→ Ad-Hoc Reports

## Executive Viewer

This role should NOT be forced through operational workflows.

Their journey should be:

Dashboard
→ KPIs
→ Exceptions
→ Trends
→ Drill-down
→ Reports

They should not see irrelevant setup or operational actions.

---

# PHASE 5 — ROLE-AWARE WORKFLOW ENGINE

Do not hardcode workflows directly into individual screens.

Create a reusable workflow/dependency architecture.

Conceptually:

Workflow
├── prerequisite
├── condition
├── allowed roles
├── required status
├── next actions
├── blocked actions
├── completion state
└── navigation target

Example:

Liquidity Risk Analysis

Prerequisite:
"Latest Process Run completed successfully"

If TRUE:

Allow:
"Run Liquidity Analysis"

Show:
"View Results"

Next recommended action:
"Review Limits & Breaches"

If FALSE:

Disable:
"Run Liquidity Analysis"

Show:
"Complete Process Run first"

CTA:
"Go to Process Run"

---

# PHASE 6 — STATUS-DRIVEN APPLICATION

Introduce meaningful workflow states where necessary.

Examples:

NOT_CONFIGURED
READY
IN_PROGRESS
VALIDATION_REQUIRED
VALIDATION_FAILED
RECONCILIATION_REQUIRED
RECONCILIATION_FAILED
READY_FOR_PROCESSING
PROCESSING
PROCESSING_FAILED
COMPLETED
STALE
REQUIRES_REVIEW
BREACH_DETECTED

Do not introduce statuses simply for visual complexity.

Only create statuses where they represent a real business/application state.

---

# PHASE 7 — SMART USER GUIDANCE

Introduce lightweight contextual guidance.

The application should sometimes tell the user:

### Example

**Liquidity Risk**

"Your data has not been processed for the current reporting date."

[Run Process]

---

After completion:

**Process completed successfully.**

"Liquidity analysis is now ready."

[Go to Liquidity Risk]

---

If configuration is missing:

**Liquidity Risk is not ready**

"Interest-rate curves have not been configured."

[Configure Curves]

---

If reconciliation fails:

**Liquidity analysis unavailable**

"GL reconciliation contains unresolved differences."

[Review Reconciliation]

---

IMPORTANT:

Do not turn the application into a tutorial.

Guidance should be:

* short
* contextual
* dismissible when appropriate
* actionable
* relevant to the user's role
* shown only when useful

---

# PHASE 8 — "WHAT NEXT?" EXPERIENCE

Where a workflow has a natural next step, provide a clear next action.

Possible UI patterns:

* contextual CTA
* success banner
* lightweight modal
* inline recommendation
* "Next step" card
* workflow progress indicator
* breadcrumb showing workflow position

Example:

┌────────────────────────────────────┐
│ Process Run Completed              │
│                                    │
│ 12,450 positions processed         │
│ 99.8% successfully validated       │
│                                    │
│ Next step                          │
│ Review Liquidity Risk               │
│                                    │
│ [Review Liquidity Risk →]          │
└────────────────────────────────────┘

Do NOT show this everywhere.

Only show it when a meaningful workflow transition exists.

---

# PHASE 9 — BLOCK INVALID ACTIONS

Do not rely exclusively on navigation restrictions.

If a user tries to execute an action without its prerequisites:

Explain:

**Why it is unavailable**

and

**What they need to do**

Example:

> "Stress Testing cannot be run because no base scenario exists."

[Configure Scenario]

NOT:

> Error 400.

---

# PHASE 10 — NAVIGATION SHOULD REFLECT THE WORKFLOW

The sidebar should remain usable as global navigation.

Do NOT turn the sidebar into a rigid wizard.

Instead:

* keep global access
* visually indicate readiness where useful
* show badges/status where meaningful
* allow experienced users to jump directly to modules
* prevent invalid actions at execution level
* provide contextual guidance when prerequisites are missing

The application should support both:

### Guided user

"Tell me what I should do next."

AND

### Expert user

"I know exactly where I'm going."

---

# PHASE 11 — CROSS-MODULE HANDOFFS

Every major module should know what happens before and after it.

Examples:

Data Upload
→ Validation

Validation
→ Reconciliation

Reconciliation
→ Processing

Processing
→ Risk Analysis

Risk Analysis
→ Limits

Limits
→ Reporting

Do not merely link the screens.

Pass useful context where appropriate.

For example:

If the user arrives at Liquidity Risk from Process Run:

* preserve affiliate
* preserve reporting date
* preserve process run
* preserve relevant dataset/version

Avoid making users re-select information they already selected.

---

# PHASE 12 — DATA LINEAGE

For important calculations, establish:

SOURCE
→ TRANSFORMATION
→ CALCULATION
→ RESULT
→ REPORT

Example:

GL Account
→ GL Mapping
→ Position
→ Liquidity Bucket
→ Maturity Gap
→ Liquidity Risk Result
→ ALCO Report

Users should be able to understand where important results came from.

This does NOT mean exposing technical database details.

It means providing meaningful business lineage.

---

# PHASE 13 — STALE DATA DETECTION

Identify situations where a downstream result is no longer valid because an upstream dependency changed.

Example:

Process Run completed
↓
Liquidity calculation completed
↓
New GL data uploaded
↓
Liquidity calculation is now STALE

The application should communicate:

> "This result is based on an earlier dataset."

Possible CTA:

[Re-run Analysis]

This is critical.

A dependency system is not complete if it only checks whether something exists.

It must also understand whether the dependency is **current**.

---

# PHASE 14 — GROUP / AFFILIATE AWARENESS

The workflow engine must respect:

* Group scope
* Affiliate scope
* User permissions
* Role
* Reporting date

Do not allow a user to accidentally complete a prerequisite for one affiliate and have the application treat it as valid for another affiliate.

Example:

Nigeria Process Run ≠ Ghana Process Run

unless the application's business rules explicitly say otherwise.

Similarly:

Affiliate-level results should not automatically become Group-level results unless the required aggregation process has occurred.

---

# PHASE 15 — IMPLEMENTATION ARCHITECTURE

Create reusable mechanisms rather than screen-specific hacks.

Consider implementing concepts such as:

### Workflow Definition

```text
workflow
workflow_step
workflow_dependency
workflow_status
workflow_transition
workflow_action
```

### Dependency Resolver

Responsible for answering:

```text
Can this action be performed?
Why?
What prerequisite is missing?
What should the user do next?
```

Conceptually:

```text
canExecute(action, context)

getBlockingDependencies(action, context)

getNextRecommendedAction(context)

getWorkflowStatus(context)
```

### Context

The dependency resolver should understand:

```text
user
role
permissions
affiliate
group
reportingDate
dataset
processRun
configuration
status
```

---

# PHASE 16 — DO NOT OVERENGINEER

This is extremely important.

Do NOT create a giant workflow framework if simple application logic is sufficient.

Prefer:

* simple rules
* reusable components
* centralized dependency definitions
* clear state
* minimal abstraction
* easy debugging

Avoid:

* excessive configuration
* unnecessary state machines
* complicated event systems
* dozens of microservices
* workflow logic duplicated across components

The objective is **clarity**, not architectural complexity.

---

# PHASE 17 — UI DESIGN PRINCIPLES

The existing application UI should be preserved and improved.

Do NOT redesign the entire application.

Use the current visual language.

Improve:

* contextual CTAs
* disabled states
* empty states
* status indicators
* breadcrumbs
* progress indicators
* success states
* warnings
* dependency messages
* cross-module navigation
* "Next step" guidance

Avoid:

* popups everywhere
* excessive modals
* giant onboarding tours
* unnecessary animations
* excessive tooltips
* clutter
* repetitive instructions

---

# PHASE 18 — POPUP / MODAL RULE

Use a popup/modal ONLY when the dependency requires immediate user attention.

Good:

> "This analysis cannot run yet."

> "GL reconciliation has unresolved differences."

> "Continue to reconciliation?"

Bad:

> "Welcome to Liquidity Risk!"

> "This page allows you to..."

> "Did you know...?"

The application should feel like a professional banking platform, not a tutorial application.

---

# PHASE 19 — FIND MISSING DEPENDENCIES

This is one of the most important parts.

For every module ask:

> "If I were a real bank using this system, what would I reasonably expect this module to depend on?"

Compare:

### Business dependency

vs.

### Current application dependency

If:

Business dependency = YES
Current dependency = NO

Then:

**IMPLEMENT IT.**

Do not merely report it.

---

# PHASE 20 — FIND FALSE DEPENDENCIES

Also identify dependencies that should NOT exist.

For example:

If Report A does not actually require Module B, do not force the user through Module B merely because it appears earlier in the sidebar.

The final system should be:

**dependency-driven, NOT menu-order-driven.**

---

# PHASE 21 — CREATE A DEPENDENCY MATRIX

Before implementation, produce an internal matrix similar to:

| Module         | Prerequisite       | Why                        | Required?   | Role       | Next Step      |
| -------------- | ------------------ | --------------------------- | ----------- | ---------- | -------------- |
| Data Upload    | Data Source        | Source must exist          | Yes         | Operations | Validation     |
| Validation     | Uploaded Data      | Data must exist            | Yes         | Operations | Reconciliation |
| Reconciliation | Validated Data     | Ensure integrity           | Conditional | Operations | Processing     |
| Liquidity Risk | Process Run        | Requires current positions | Yes         | Risk       | Limits         |
| Stress Testing | Scenario           | Scenario required          | Yes         | Risk       | Results        |
| FTP            | Positions + Config | Required for pricing       | Yes         | Treasury   | Profitability  |
| Reporting      | Completed Analysis | Needs results               | Conditional | Reporting  | Publish        |

This matrix is an architectural artifact.

Use it to drive implementation.

---

# PHASE 22 — USER JOURNEY TESTING

After implementation, test complete journeys.

Do not only test screens.

Test scenarios such as:

### Scenario 1 — New affiliate

Can a newly configured affiliate realistically move from:

Configuration
→ Data
→ Validation
→ Processing
→ Risk
→ Reporting?

### Scenario 2 — Missing prerequisite

What happens if the user tries to skip a required step?

### Scenario 3 — Failed prerequisite

What happens if validation fails?

### Scenario 4 — Updated upstream data

Does downstream analysis become stale?

### Scenario 5 — Different role

Does the workflow change appropriately?

### Scenario 6 — Expert user

Can an experienced user navigate directly without unnecessary friction?

### Scenario 7 — Group user

Can the user correctly move between affiliate and Group-level workflows?

---

# PHASE 23 — DO NOT STOP AT AUDITING

The final deliverable must NOT simply be:

"Here are 37 workflow problems."

You must implement the appropriate fixes.

For each identified issue classify:

### FIX

Dependency exists but UI/application does not expose it.

### BUILD

Dependency should exist but doesn't.

### REMOVE

Dependency incorrectly exists.

### LEAVE

No meaningful dependency exists.

Then implement all appropriate:

FIX + BUILD + REMOVE

items.

---

# PHASE 24 — FINAL ACCEPTANCE CRITERIA

The application should now answer these questions naturally:

### "What do I need to do first?"

The application should make this clear.

### "Why can't I do this?"

The application should explain the dependency.

### "Where do I go next?"

The application should provide an actionable next step.

### "What did this result depend on?"

The application should provide meaningful lineage/context.

### "Is this result still current?"

The application should communicate stale state.

### "What can I do as this role?"

The application should respect role and permissions.

### "Can I skip a step?"

Only if the business dependency allows it.

### "Can I jump directly to a module?"

Yes, where appropriate — but invalid actions should still be protected.

### "Does this work for different affiliates?"

Dependencies must respect scope.

---

# MOST IMPORTANT DESIGN PRINCIPLE

Do not build:

```text
Screen A → Screen B → Screen C
```

just because that is visually convenient.

Build:

```text
Business Dependency
        ↓
Application State
        ↓
Available Actions
        ↓
Recommended Next Step
        ↓
Downstream Result
```

The application should feel like the system understands the **banking process**, not just the screens.

---

# EXECUTION ORDER

Follow this order:

1. Inspect the entire codebase.
2. Map modules and screens.
3. Map roles and permissions.
4. Map data dependencies.
5. Map configuration dependencies.
6. Map process dependencies.
7. Map cross-module outputs/inputs.
8. Build the dependency matrix.
9. Identify existing dependencies.
10. Identify missing dependencies.
11. Identify false dependencies.
12. Identify disconnected screens.
13. Identify role-specific journeys.
14. Design the minimum workflow architecture required.
15. Implement the dependency resolver.
16. Implement workflow/status handling where required.
17. Implement contextual "next step" guidance.
18. Implement blocking states for invalid actions.
19. Implement stale-state handling where required.
20. Implement cross-module handoffs.
21. Respect Group/Affiliate scope.
22. Test complete journeys.
23. Test every major role.
24. Fix discovered workflow gaps.
25. Perform a second full-app dependency audit.

Do not consider the task complete after the first implementation pass.

---

# FINAL OUTPUT

At the end provide:

## 1. Dependency Architecture

What the application now depends on.

## 2. Workflow Map

Major user journeys by role.

## 3. Dependencies Found

Existing dependencies discovered.

## 4. Dependencies Added

Business dependencies that were missing and implemented.

## 5. Dependencies Removed

Incorrect/artificial dependencies removed.

## 6. Disconnected Screens Fixed

Screens that were previously orphaned.

## 7. New Workflow Components

Reusable components/services created.

## 8. Role-Based Differences

How journeys differ by role.

## 9. User Guidance

Where contextual next-step guidance was added.

## 10. Remaining Gaps

Only genuine unresolved gaps.

## 11. Test Results

Show the complete journeys tested and whether they pass.

---

# QUALITY BAR

Think like:

* Senior ALM Product Manager
* Senior Banker
* Treasury practitioner
* Risk practitioner
* Enterprise UX Architect
* Senior software architect
* QA lead

Do not optimize for the easiest code change.

Optimize for:

**"If I were a bank employee using this system every day, would the application feel like one coherent ALM platform?"**

The final product should feel:

**connected, intentional, role-aware, dependency-aware, guided, but not restrictive.**
