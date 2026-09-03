Yes. I’d make these **10 builder skills** first, and keep the audit/demo skills separate. The prompts below are written so you can give them to Claude/Antigravity to **create the actual `SKILL.md` files**, not to build the application immediately.

I’ve also made them deliberately interconnected so the skills don't cause Claude to build 10 disconnected features.

---

# 1. `alm-product-architecture`

Use this first. It establishes the rules every other skill must follow.

# Skill: ALM Product Architecture

Create a reusable engineering skill named `alm-product-architecture` for building an enterprise Asset & Liability Management (ALM) platform for a large African commercial bank such as Ecobank.

## Objective

Define the canonical architecture, boundaries, data flow, module relationships, UX principles, security principles, and engineering standards that all other ALM skills must follow.

The skill must prevent the application from becoming a collection of disconnected screens or hard-coded demo functionality.

## Canonical Architecture

The platform must follow this logical flow:

Source Systems
→ Integration Layer
→ Staging
→ Data Validation / Mapping / Reconciliation
→ Position Book
→ ALM Rules Engine
→ ALM Calculation Engines
→ Reporting Data Sets
→ Reporting / Ascent Reporting Layer
→ Approval / Submission / Archive

## Source Systems

The architecture must support:

* FLEXCUBE / core banking
* Calypso / treasury and capital markets
* General Ledger
* Credit systems
* Treasury systems
* Deposit systems
* Loan systems
* Market data providers such as Reuters / Refinitiv / LSEG
* APIs
* Databases
* SFTP
* CSV / Excel files
* Manual departmental uploads

Never allow individual ALM screens to connect directly to source systems.

All source data must pass through the integration/data foundation.

## Core Principle

The Position Book is the canonical normalized ALM position layer.

Downstream calculations must consume the Position Book rather than independently retrieving data from source systems.

## Modules

Define the architecture for:

* Dashboard
* Liquidity Risk
* IRRBB
* Stress Testing
* Limits & Breaches
* KRI
* FTP
* Balance Sheet
* FX Position
* Reporting
* Data Management
* Reference Data
* Configuration
* Group Management
* Workflow
* Administration

## Separation of Concerns

Clearly separate:

1. Source connectivity
2. Data ingestion
3. Data validation
4. Data mapping
5. Position normalization
6. Regulatory/business rules
7. ALM calculations
8. Reporting datasets
9. Report presentation
10. Workflow and controls
11. UI

Do not place business logic inside UI components when it belongs in a service, rules engine, calculation layer, or database.

## Configuration Over Hard-Coding

Regulatory and banking rules must be configurable wherever appropriate.

Examples:

* HQLA classifications
* Haircuts
* LCR rates
* ASF factors
* RSF factors
* Maturity buckets
* Behavioural assumptions
* Rate shocks
* Product classifications
* Reporting frequencies
* Report templates
* Mapping rules

Support effective dates and versioning.

## Data Lineage

Every important ALM metric must be traceable:

Source
→ Staging
→ Position
→ Rule
→ Calculation
→ Reporting Dataset
→ Report

The architecture must make it possible to answer:

"Where did this number come from?"

## Multi-Entity / Multi-Affiliate

Support:

* Group
* Country
* Legal entity
* Affiliate
* Branch
* Business unit
* Currency

Design data access so users only see data they are authorized to access.

## Workflow

Support:

* Maker/checker
* Approval
* Rejection
* Adjustment
* Period close
* Period reopen
* Audit trail
* Exception management

## Engineering Standards

The skill must instruct the coding agent to:

* Inspect the existing repository before modifying it.
* Reuse existing architecture and components where appropriate.
* Avoid unnecessary rewrites.
* Avoid fake functionality.
* Avoid hard-coded dashboard numbers.
* Ensure UI data originates from the appropriate data layer.
* Maintain backward compatibility.
* Build reusable components.
* Keep calculations testable independently of the UI.
* Add meaningful validation and error handling.
* Preserve existing working functionality.

## Output

When invoked, this skill should first inspect the existing application and produce:

1. Current architecture
2. Architecture gaps
3. Recommended target architecture
4. Affected modules
5. Data-flow changes
6. Implementation plan

Only then should it implement changes.

Every implementation must preserve the canonical architecture above.

---

# 2. `alm-source-integration`

This is your **FLEXCUBE + Calypso + market data + files/API** skill.

# Skill: ALM Source Integration

Create a reusable engineering skill named `alm-source-integration` for implementing enterprise source-system integration for an ALM platform.

## Objective

Build a flexible integration architecture that allows the ALM platform to receive data from multiple banking systems without coupling the ALM application directly to any individual source.

## Supported Sources

Design adapter/connectors for:

* FLEXCUBE / core banking
* Calypso
* General Ledger
* Credit systems
* Deposit systems
* Loan systems
* Treasury systems
* Reuters / Refinitiv / LSEG market data
* APIs
* Relational databases
* SFTP
* CSV
* Excel
* Manual departmental feeds

Do not assume every source will expose an API.

## Integration Architecture

Use:

Source System
→ Source Adapter
→ Integration Service
→ Staging
→ Validation
→ Mapping
→ Reconciliation
→ Admission
→ Position Book

The downstream ALM system must not care whether data originated from an API, database, SFTP or file upload.

## Adapter Pattern

Create a common interface for connectors.

Each connector should define:

* Source name
* Source type
* Connection configuration
* Authentication method
* Data entities
* Schedule
* Last successful run
* Last attempted run
* Record count
* Status
* Error state
* Retry capability

## File-Based Integration

Support departmental feeds where APIs are unavailable.

Workflow:

Upload
→ Validate file
→ Detect schema
→ Validate records
→ Stage
→ Reconcile
→ Admit
→ Position Book

Never treat an uploaded file as immediately live production data.

## API Integration

Support:

* Manual trigger
* Scheduled execution
* Incremental extraction
* Full extraction
* Retry
* Timeout handling
* Authentication
* Logging
* Success/failure monitoring

## Database Integration

Support read-only extraction from external databases where appropriate.

Do not allow external source systems to directly manipulate the Position Book.

## Market Data

Support market data required by ALM calculations, including where applicable:

* FX rates
* Interest rates
* Yield curves
* Security prices
* Reference rates

Market data must have:

* Observation date/time
* Source
* Currency
* Instrument/reference
* Value
* Version or snapshot identifier

## Data Ownership

Each source/feed must have an owner such as:

* Treasury
* Finance
* Credit
* Risk
* Operations

Track responsibility for missing or delayed feeds.

## Monitoring

Build a source monitoring view showing:

* Connected
* Processing
* Successful
* Failed
* Delayed
* Missing
* Last received
* Record count

## Failure Handling

Define behavior for:

* API timeout
* Authentication failure
* Invalid file
* Schema mismatch
* Duplicate file
* Duplicate records
* Partial ingestion
* Source unavailable
* Unexpected record count

Never silently fail.

## Implementation Rules

Before implementing:

1. Inspect the existing data model.
2. Inspect existing APIs/services.
3. Identify current mock data.
4. Identify current upload mechanisms.
5. Reuse existing infrastructure where appropriate.
6. Do not create duplicate integration systems.

The resulting integration layer must feed the shared ALM data foundation and Position Book.

---

# 3. `alm-data-foundation`

This one combines **staging, mapping, data quality, reconciliation and Position Book**.

# Skill: ALM Data Foundation

Create a reusable engineering skill named `alm-data-foundation` for building the normalized data foundation of an enterprise ALM platform.

## Objective

Build the layer that converts heterogeneous banking source data into trusted, normalized ALM positions.

## Pipeline

Source
→ Staging
→ Schema Validation
→ Data Quality
→ Mapping
→ Normalization
→ Reconciliation
→ Admission
→ Position Book

## Staging

Every incoming dataset must first enter a staging state.

Track:

* Batch ID
* Source
* Upload/integration timestamp
* Reporting date
* Record count
* User/system that submitted it
* Validation status
* Reconciliation status
* Admission status

Support:

* Pending
* Validated
* Rejected
* Admitted
* Failed

## Data Quality

Validate:

* Required fields
* Data types
* Dates
* Currency
* Amount
* Account identifiers
* Duplicate records
* Invalid classifications
* Invalid maturity dates
* Invalid repricing dates
* Missing reference data

Provide meaningful exceptions.

## Mapping

Support configurable mappings for:

* Product
* Currency
* Branch
* GL
* COA
* Account class
* Asset/liability
* Legal entity
* Counterparty
* Regulatory classification

Mappings must be versioned and effective-dated.

## Position Book

Create a canonical Position Book capable of representing:

* ID
* Account number
* Legacy account number
* Account class
* Branch code
* Category
* Product class
* Currency
* Amount
* Maturity date
* Next repricing date
* Behavioural tag
* Rate type
* Interest rate
* HQLA level
* HQLA haircut
* LCR cash flow role
* LCR rate
* ASF factor
* RSF factor
* IRRBB rate sensitivity
* Approximate duration
* Legal entity
* Organizational unit
* GL account
* Common COA
* Counterparty
* Performing status
* Provision amount
* Lien amount
* Lien reason
* Monthly credit
* Monthly debit
* Maker
* Checker
* Record status
* Notes

Do not require every source system to provide every field.

Distinguish:

1. Source attributes
2. Derived attributes
3. Regulatory classifications
4. Calculated values

## Reconciliation

Support reconciliation between:

Source
→ Staging
→ Position Book

Show:

* Expected records
* Received records
* Admitted records
* Rejected records
* Missing records
* Duplicates
* Amount differences

## Data Lineage

Every Position Book record must retain source attribution.

A user should be able to trace:

Position
→ Batch
→ Source
→ Original record

## Performance

Design for large banking datasets.

Use:

* Pagination
* Server-side filtering
* Indexed queries
* Batch processing
* Incremental ingestion
* Asynchronous processing where necessary

Do not load millions of positions into the browser.

## Implementation

Inspect the existing repository and database before implementing.

Extend existing models where possible rather than creating duplicate Position Book concepts.

The Position Book must become the trusted downstream source for ALM engines.

---

# 4. `alm-rules-engine`

# Skill: ALM Rules Engine

Create a reusable engineering skill named `alm-rules-engine` for implementing configurable ALM, regulatory and banking business rules.

## Objective

Ensure regulatory and ALM treatment is configurable, versioned, effective-dated and auditable rather than hard-coded into screens.

## Rule Categories

Support configurable rules for:

* HQLA classification
* HQLA haircuts
* LCR cash-flow treatment
* LCR inflow/outflow rates
* ASF factors
* RSF factors
* Maturity buckets
* Behavioural assumptions
* Rate sensitivity
* Product classification
* Asset/liability classification
* Currency classification
* Regulatory reporting classification
* Stress scenarios

## Rule Structure

Each rule should support:

* Rule ID
* Name
* Description
* Category
* Conditions
* Result
* Priority
* Effective date
* Expiry date
* Version
* Status
* Created by
* Approved by
* Audit history

## Rule Lifecycle

Draft
→ Maker Review
→ Checker Approval
→ Effective
→ Superseded
→ Archived

## Example

A position should flow through:

Position
→ Classification
→ Applicable Rule
→ Regulatory Treatment
→ Factor
→ Calculation

## Effective Dating

Do not overwrite historical rules.

If a haircut changes:

Old rule remains available for historical reporting.

New rule becomes effective on its configured date.

Historical reports must remain reproducible.

## Explainability

For every derived regulatory attribute, provide an explanation:

Example:

"HQLA Level 1 because product classification = sovereign security and eligibility rule X was effective on reporting date."

## Configuration UI

Provide appropriate configuration screens for authorized users.

Do not expose complex regulatory configuration to ordinary users.

## Safety

Prevent unauthorized rule changes.

Require approval where appropriate.

Never silently change a regulatory calculation.

## Implementation

Inspect existing hard-coded ALM rules and migrate them into the rules architecture where practical.

Do not change regulatory formulas merely for UI convenience.

Keep rule evaluation independently testable.

---

# 5. `alm-liquidity-engine`

# Skill: ALM Liquidity Engine

Create a reusable engineering skill named `alm-liquidity-engine` for implementing liquidity-risk calculations and analytics using the Position Book and configurable ALM rules.

## Objective

Build a credible liquidity-risk engine covering LCR, NSFR, liquidity gaps and liquidity analytics.

## Principle

The liquidity engine must consume:

Position Book
+
ALM Rules
+
Market/Reference Data where required

It must not independently retrieve raw source-system data.

## LCR

Implement the logical flow:

Position Book
→ HQLA classification
→ Haircuts
→ Adjusted HQLA
→ Cash-flow classification
→ Inflows
→ Outflows
→ Net Cash Outflows
→ LCR

Support:

* Level 1 HQLA
* Level 2A
* Level 2B
* HQLA haircuts
* Inflow rates
* Outflow/runoff rates
* 30-day horizon
* Currency views
* Consolidated views
* Legal entity views

Show both aggregate metrics and underlying positions.

## NSFR

Implement:

Available Stable Funding
/
Required Stable Funding

Support:

* ASF factors
* RSF factors
* Asset classifications
* Liability classifications
* Maturity
* Funding characteristics
* Currency/entity analysis

## Liquidity Gap

Support:

* Maturity buckets
* Contractual maturity
* Behavioural maturity
* Inflows
* Outflows
* Net gap
* Cumulative gap
* Currency
* Entity
* Product

## Liquidity Analytics

Support where appropriate:

* Funding concentration
* Unencumbered assets
* Liquidity buffer
* Significant currency analysis
* Survival horizon
* Funding mix

## Explainability

Every major metric must support drill-down.

Example:

LCR
→ Net Cash Outflows
→ Outflow category
→ Product
→ Position

HQLA
→ Level
→ Asset
→ Position

## Data Lineage

Every calculation must retain:

* Reporting date
* Rule version
* Input dataset
* Calculation version
* Timestamp

## Validation

Provide calculation checks and reconciliation controls.

## UI

Present complex calculations progressively.

Executives should see headline metrics first.

Risk users should be able to drill into detailed calculations.

Do not overwhelm users with every underlying field by default.

## Implementation

Inspect existing ALM liquidity screens, calculations and mock data before changing them.

Replace fake/static calculations with reusable calculation services where required.

Do not invent regulatory requirements.

---

# 6. `alm-irrbb-engine`

# Skill: ALM IRRBB Engine

Create a reusable engineering skill named `alm-irrbb-engine` for implementing Interest Rate Risk in the Banking Book functionality.

## Objective

Build an explainable IRRBB engine based on normalized Position Book data, interest-rate assumptions, behavioural assumptions and configurable scenarios.

## Core Data

Consume:

* Position
* Amount
* Currency
* Interest rate
* Rate type
* Next repricing date
* Maturity date
* Behavioural tag
* Rate-sensitive flag
* Duration
* Product
* Legal entity

## Repricing Gap

Calculate and present:

* Repricing buckets
* Rate-sensitive assets
* Rate-sensitive liabilities
* Gap
* Cumulative gap
* Currency
* Entity
* Product

## NII

Support configurable interest-rate scenarios and estimate impact on Net Interest Income.

## EVE

Support Economic Value of Equity analysis and scenario-based valuation impact.

## Rate Shocks

Provide configurable scenarios such as:

* Parallel up
* Parallel down
* Steepener
* Flattener
* Short-rate shock
* Long-rate shock

Do not hard-code scenario assumptions.

## Yield Curves

Support:

* Base curve
* Scenario curve
* Currency
* Tenor
* Effective date

## Behavioural Assumptions

Support configurable assumptions for relevant products such as:

* Non-maturity deposits
* Prepayments
* Early withdrawals

All assumptions must be versioned and effective-dated.

## Explainability

Allow users to move from:

IRRBB metric
→ scenario
→ repricing bucket
→ product
→ position

## Auditability

Store:

* Scenario
* Assumption version
* Calculation timestamp
* Reporting date
* Input dataset
* Result

## Implementation

Inspect existing IRRBB functionality before modifying it.

Keep calculation logic separate from presentation.

Do not introduce unsupported regulatory claims or assumptions.

---

# 7. `alm-stress-scenario-engine`

# Skill: ALM Stress & Scenario Engine

Create a reusable engineering skill named `alm-stress-scenario-engine` for building configurable ALM stress testing and what-if analysis.

## Objective

Allow users to assess how changes in assumptions affect liquidity, funding, interest-rate risk and other ALM metrics.

## Scenario Model

A scenario should contain:

* Scenario ID
* Name
* Description
* Scenario type
* Assumptions
* Effective date
* Owner
* Status
* Base period
* Created by
* Approved by

## Scenario Types

Support:

* Liquidity stress
* Deposit runoff
* Funding withdrawal
* Market-value shock
* HQLA haircut shock
* Interest-rate shock
* FX shock
* Combined stress
* Reverse stress testing
* User-defined what-if analysis

## Scenario Workflow

Baseline
→ Apply assumptions
→ Recalculate
→ Compare
→ Analyze impact

## Examples

Deposit runoff:

Retail deposits -10%
Corporate deposits -15%

Interest-rate scenario:

+100 bps
+200 bps

HQLA scenario:

Haircuts increase by configured amount.

## Outputs

Show impact on:

* LCR
* NSFR
* Liquidity gap
* Funding concentration
* Survival horizon
* NII
* EVE
* Other relevant ALM metrics

## Comparison

Always allow:

Baseline vs Scenario

with:

* Absolute difference
* Percentage difference
* Direction of impact

## Scenario Governance

Support:

* Save
* Clone
* Edit
* Approve
* Archive

Approved scenarios must be reproducible.

## Explainability

Show which assumptions caused each material change.

## UI

Make scenario construction understandable to Treasury/Risk users.

Do not expose unnecessary technical implementation details.

## Implementation

Use the existing calculation engines rather than duplicating LCR/NSFR/IRRBB formulas inside the scenario module.

---

# 8. `alm-reporting-framework`

This is the **Ascent Reporting-inspired skill**.

# Skill: ALM Regulatory Reporting Framework

Create a reusable engineering skill named `alm-reporting-framework` for implementing an enterprise regulatory, ALCO, management and ad-hoc reporting framework inspired by the architecture of Ascent Reporting.

## Objective

Build reporting as a configurable reporting lifecycle rather than a collection of hard-coded report pages.

## Architecture

ALM Position Book
→ ALM Calculation Results
→ Reporting Data Sets
→ Report Template
→ Validation
→ Approval
→ Output
→ Submission
→ Archive

## Reporting Data Sets

Support reusable datasets such as:

* LCR_DATA
* NSFR_DATA
* IRRBB_DATA
* LIQUIDITY_GAP_DATA
* ALCO_LIQUIDITY_DATA
* MANAGEMENT_ALM_DATA

A reporting dataset must have:

* Dataset ID
* Version
* Reporting date
* Source
* Transformation logic
* Business rules
* Data lineage
* Validation status

## Report Catalogue

Each report should contain:

* Report code
* Report name
* Purpose
* Regulator
* Frequency
* Owner
* Due date
* Template
* Output format
* Status
* Effective date
* Version

## Reporting Frequencies

Support configurable:

* Daily
* Weekly
* Monthly
* Quarterly
* Semiannual
* Annual
* Ad-hoc

Do not hard-code a frequency into the application architecture.

## Templates

Support configurable report templates.

A template should define:

* Sections
* Rows
* Columns
* Data fields
* Calculations
* Formatting
* Validation rules
* Output format

Support versioning.

Example:

CBN Report v1
CBN Report v2
CBN Report v3

Historical reports must remain reproducible.

## Report Types

Support:

### Regulatory

CBN and other regulatory reporting requirements.

### ALCO

Liquidity, funding, interest-rate and balance-sheet packs.

### Management

Executive and management reporting.

### Ad-Hoc

User-configured reports using approved datasets.

## Output

Support where required:

* Excel
* CSV
* XML
* PDF
* Structured/API submission

Do not assume every regulator uses the same format.

## Adjustments

Allow authorized users to make controlled report adjustments.

Record:

* Original value
* New value
* User
* Timestamp
* Reason
* Approval
* Related report cycle

Never silently overwrite data.

## Drilldown

A report value must be traceable:

Report cell
→ Reporting dataset
→ ALM calculation
→ Position Book
→ Source

## Reporting Calendar

Provide visibility of:

* Upcoming reports
* Reporting period
* Due date
* Data readiness
* Validation status
* Approval status
* Submission status

## Implementation

Inspect the existing Ascent-inspired reporting functionality before replacing it.

Preserve reusable report infrastructure.

Do not create one-off report logic for each screen.

The objective is to build a reusable reporting framework capable of supporting changing bank and regulatory report formats.

---

# 9. `alm-workflow-controls`

# Skill: ALM Workflow & Controls

Create a reusable engineering skill named `alm-workflow-controls` for implementing banking-grade operational controls across ALM data, calculations and reporting.

## Objective

Ensure ALM processes are controlled, auditable and reproducible.

## Maker/Checker

Support:

Maker
→ Submit
→ Checker
→ Approve / Reject

Apply to appropriate:

* Data admission
* Reference data changes
* Regulatory rules
* Adjustments
* Reports
* Period close

## Reporting Cycle

Support:

Open
→ Data Collection
→ Validation
→ Reconciliation
→ Calculation
→ Review
→ Approval
→ Close
→ Archive

## Period Close

A reporting period should support:

* Reporting date
* Cut-off
* Data completeness
* Validation
* Reconciliation
* Calculation
* Approval
* Close
* Reopen with authorization

## Audit Trail

Track:

* User
* Role
* Action
* Timestamp
* Object
* Previous value
* New value
* Reason
* Approval status

## Exceptions

Create an exception management model for:

* Failed feeds
* Data quality issues
* Reconciliation breaks
* Calculation failures
* Report validation failures
* Approval rejection

## Reconciliation

Support controls between:

Source
→ Position Book
→ ALM Calculation
→ Report

## Segregation of Duties

Ensure users cannot perform conflicting activities where the role model prohibits it.

Example:

A maker should not automatically approve their own submission.

## Security

Enforce authorization at both UI and backend/API level.

Never rely only on hidden buttons.

## Implementation

Inspect existing role and workflow functionality before implementing.

Reuse existing RBAC and audit infrastructure where possible.

Controls must be functional, not merely visual.

---

# 10. `alm-enterprise-ui`

This one is particularly important because you've already identified **complexity as a user problem**.

# Skill: ALM Enterprise UI

Create a reusable engineering skill named `alm-enterprise-ui` for designing and implementing a sophisticated but simple-to-use ALM application for banking users.

## Objective

Make the underlying ALM platform powerful while reducing cognitive load for users.

The UI must feel like an enterprise banking product rather than a technical data-management application.

## Core Principle

Sophisticated underneath.
Simple on the surface.

Do not remove important functionality merely to make the interface simpler.

Instead:

* Progressive disclosure
* Role-based experiences
* Clear hierarchy
* Drill-down
* Contextual actions
* Good defaults
* Consistent navigation

## User Personas

Design appropriate experiences for:

* Executive
* Treasury user
* Risk analyst
* ALM analyst
* Finance/reporting user
* Control tester
* Administrator

Do not expose every capability to every role.

## Navigation

Maintain a logical hierarchy across:

Dashboard
Risk Management
Treasury
Reporting
Data Management
Reference Data
Configuration
Group Management
Workflow
Administration

Avoid unnecessary duplication.

## Dashboard

Prioritize:

* LCR
* NSFR
* Liquidity position
* Liquidity gap
* IRRBB indicators
* Limits & breaches
* KRI
* Alerts
* Data freshness

Use progressive disclosure.

## Complex Screens

For screens such as LCR, NSFR and IRRBB:

First show:

1. Headline metric
2. Status
3. Key drivers
4. Trend
5. Exceptions

Then allow:

Metric
→ Category
→ Position
→ Source

## Tables

Use:

* Appropriate column prioritization
* Sticky headers where useful
* Filtering
* Search
* Pagination
* Column visibility
* Sorting
* Export
* Drill-down

Do not display 30+ fields by default when only 6 are relevant.

## Forms

Forms should:

* Group related fields
* Use clear labels
* Explain complex regulatory concepts
* Validate immediately
* Show dependencies
* Prevent invalid submission

## States

Every major page must support:

* Loading
* Empty
* Error
* Success
* Partial data
* Permission denied
* Stale data

Do not leave blank screens.

## Accessibility

Follow appropriate accessibility principles:

* Keyboard navigation
* Clear focus
* Semantic controls
* Sufficient contrast
* Meaning not conveyed by color alone
* Accessible labels

## Visual Consistency

Maintain consistent:

* Typography
* Spacing
* Cards
* Buttons
* Tables
* Forms
* Status indicators
* Charts
* Navigation
* Modal behavior

## Banking Context

The interface should make complex concepts understandable.

For example, don't simply show:

"LCR: 132%"

Also provide:

* Regulatory status
* HQLA
* Net cash outflows
* Change from previous period
* Key drivers
* Drill-down

## Implementation

Before modifying UI:

1. Inspect existing components.
2. Identify design-system patterns.
3. Identify duplicated components.
4. Preserve working functionality.
5. Improve rather than unnecessarily rewrite.

Never sacrifice data correctness for visual polish.

The final UI should feel calm, structured, trustworthy and professional.

---

# Then keep your original five as **supporting skills**

I would still create these:

```text
alm-flow-audit
alm-ui-review
alm-rfp-compliance
alm-permission-audit
alm-demo-script
```

But **don't let them build the core architecture**.

Their job is to inspect and improve what the 10 builder skills produce.

---

# The order I'd actually give Claude/Antigravity

Don't dump all 15 skills on it and say "build everything."

Do this:

### Phase 1 - Foundation

```text
alm-product-architecture
alm-source-integration
alm-data-foundation
```

### Phase 2 - ALM intelligence

```text
alm-rules-engine
alm-liquidity-engine
alm-irrbb-engine
alm-stress-scenario-engine
```

### Phase 3 - Reporting

```text
alm-reporting-framework
alm-workflow-controls
```

### Phase 4 - Experience

```text
alm-enterprise-ui
```

### Phase 5 - Validation

```text
alm-flow-audit
alm-permission-audit
alm-ui-review
alm-rfp-compliance
alm-demo-script
```

### One very important instruction

When you give these skills to Claude, **don't ask it to blindly rebuild the application according to the skills**.

Tell it:

> **"First inspect the existing application and map what already exists against these skills. Do not rebuild working functionality. Identify gaps, reuse existing components and progressively implement the target architecture."**

That is particularly important for your current Ecobank demo because you already have a substantial application. You want Claude to **evolve it into the architecture**, not throw away what you've already built.

Absolutely. Since the **builder skills create the product**, these audit skills should act like a **senior banking product/engineering review team**. They should inspect what Claude actually built, find gaps, and then **fix them where appropriate**, not just give you a report.

I’d use these **5 audit skills**:

1. `alm-flow-audit`
2. `alm-ui-review`
3. `alm-rfp-compliance`
4. `alm-permission-audit`
5. `alm-demo-script`

I would also add **`alm-data-lineage-audit`** because your ALM demo will be much stronger if every number can be traced back to a source.

---

# 1. `alm-flow-audit`

This is the skill that asks: **"Can someone actually use this system from beginning to end?"**

# Skill: ALM Flow Audit

Create a reusable engineering skill named `alm-flow-audit`.

## Role

Act as a senior enterprise banking product analyst, business process analyst and QA engineer reviewing an ALM platform.

Your responsibility is to systematically walk through the entire application as a real user and identify broken, incomplete, disconnected or confusing workflows.

This is not a superficial UI review.

You must test whether the application actually works as a coherent ALM platform.

## Critical Instruction

Before auditing:

1. Inspect the existing application.
2. Understand its architecture.
3. Identify all available modules.
4. Identify user roles.
5. Identify major data flows.
6. Identify available workflows.
7. Identify existing integrations.
8. Identify existing calculations.
9. Identify reporting functionality.

Do not assume a feature is complete because a screen exists.

A feature is complete only when the user can successfully perform the intended business process.

## User Journeys

Walk through realistic journeys including:

### Executive

Login
→ Dashboard
→ Review LCR
→ Review NSFR
→ Review IRRBB
→ Investigate breach
→ Drill into driver
→ Review report

### Risk Analyst

Login
→ Liquidity Risk
→ LCR
→ HQLA
→ Net Cash Outflows
→ Position drilldown
→ Investigate exception
→ Review stress scenario

### Treasury

Login
→ Liquidity
→ Funding
→ FX Position
→ Balance Sheet
→ FTP
→ Analyze funding position

### Reporting User

Login
→ Reporting
→ Select cycle
→ Check data readiness
→ Validate report
→ Review report
→ Submit for approval
→ Export

### Data User

Login
→ Data Management
→ Select source
→ Upload/import data
→ Validate
→ Review exceptions
→ Reconcile
→ Admit

### Administrator

Login
→ Users/Roles
→ Configuration
→ Reference Data
→ Workflow
→ Audit Trail

## Audit Every Journey

For every journey check:

* Can the user start?
* Is the next action obvious?
* Are dependencies satisfied?
* Does each button work?
* Does navigation make sense?
* Does the system provide feedback?
* Are loading states present?
* Are errors handled?
* Are empty states handled?
* Are permissions enforced?
* Does the data actually change?
* Does the next screen reflect the previous action?
* Can the user recover from an error?
* Can the user go back?
* Can the user complete the task without workarounds?

## Identify

Flag:

* Dead ends
* Broken links
* Missing screens
* Missing actions
* Placeholder functionality
* Fake buttons
* Static values
* Disconnected modules
* Inconsistent workflows
* Missing confirmation
* Missing validation
* Missing error handling
* Missing permissions
* Duplicate functionality
* Unexpected navigation
* Inconsistent terminology

## Banking Process Validation

Pay special attention to:

Data ingestion
→ Validation
→ Reconciliation
→ Position Book
→ Calculation
→ Reporting
→ Approval
→ Archive

Ensure this chain is actually represented in the application.

## Fixes

When a clear issue is found:

1. Explain the problem.
2. Identify the root cause.
3. Determine the appropriate layer.
4. Fix it using existing architecture.
5. Test the fix.
6. Ensure no existing functionality is broken.

Do not patch symptoms in the UI if the actual problem is in the data or service layer.

## Output

Produce:

### Journey

### Expected behavior

### Actual behavior

### Gap

### Severity

### Root cause

### Fix

### Verification

Severity:

* Critical
* High
* Medium
* Low

## Final Report

Provide:

1. Journey coverage
2. Critical blockers
3. High-priority gaps
4. Fixed issues
5. Remaining issues
6. Recommended next steps

Do not mark a journey complete simply because the relevant pages exist.

---

# 2. `alm-ui-review`

This is your **"make it look and feel like a serious banking product"** skill.

# Skill: ALM UI Review

Create a reusable engineering skill named `alm-ui-review`.

## Role

Act as a senior enterprise UX designer, banking application designer and frontend engineer reviewing an ALM platform.

The objective is to make the application sophisticated but easy to operate.

## Critical Principle

Do not simplify the application by removing important functionality.

Instead:

**Reduce cognitive load through hierarchy, progressive disclosure, grouping and clear workflows.**

## Inspect

Review every major screen for:

* Information hierarchy
* Navigation
* Page structure
* Typography
* Spacing
* Cards
* Tables
* Forms
* Filters
* Charts
* Status indicators
* Buttons
* Modals
* Tabs
* Drill-down
* Empty states
* Loading states
* Error states
* Accessibility
* Responsiveness

## ALM-Specific UX

For complex metrics such as:

* LCR
* NSFR
* HQLA
* Liquidity Gap
* IRRBB
* EVE
* NII
* Stress Testing
* Funding Concentration

use progressive disclosure.

The user should first see:

1. Metric
2. Status
3. Trend
4. Key drivers
5. Exceptions

Then:

Metric
→ Category
→ Position
→ Source

## Role-Based Complexity

Do not give every user the same level of complexity.

Executive:

Headline metrics and exceptions.

Risk:

Metrics plus detailed analysis.

Treasury:

Funding, liquidity and market views.

Reporting:

Cycles, validation and submission.

Administrator:

Configuration and controls.

## Tables

Review whether tables:

* Show the right columns
* Hide unnecessary fields by default
* Support search
* Support filtering
* Support sorting
* Support pagination
* Support export
* Support drill-down

Do not force users to scan 30+ columns when 6 are sufficient for the task.

## Forms

Check:

* Field grouping
* Required fields
* Validation
* Defaults
* Tooltips
* Error messages
* Dependencies
* Confirmation

Complex regulatory concepts should have contextual explanations.

## Visual Consistency

Identify inconsistencies in:

* Buttons
* Colors
* Icons
* Typography
* Spacing
* Cards
* Status badges
* Tables
* Forms
* Modals
* Navigation

Reuse the existing design system where possible.

Do not introduce arbitrary new patterns.

## Accessibility

Check:

* Keyboard navigation
* Focus states
* Labels
* Contrast
* Semantic controls
* Screen-reader-friendly structure
* Non-color-only status communication

## Fixing Issues

For each significant issue:

1. Explain the UX problem.
2. Explain why it matters.
3. Identify affected users.
4. Fix it.
5. Verify the result.

Do not redesign the whole application unnecessarily.

Prioritize changes that significantly improve usability.

## Final Output

Provide:

* Critical UX problems
* High-priority improvements
* Medium improvements
* Fixes completed
* Remaining recommendations

The final application should feel:

**Professional
Calm
Structured
Trustworthy
Enterprise-grade
Easy to navigate**

---

# 3. `alm-rfp-compliance`

This is probably your **most important audit skill for the Ecobank demo**.

# Skill: ALM RFP Compliance

Create a reusable engineering skill named `alm-rfp-compliance`.

## Role

Act as a senior banking ALM solution architect and RFP compliance reviewer evaluating an ALM platform against the client's requirements.

The objective is to determine whether the actual implemented application satisfies the intended business, functional, technical and control requirements.

## Critical Principle

Do not mark a requirement as complete simply because:

* A page exists.
* A button exists.
* A chart exists.
* Mock data is displayed.
* A feature is described in documentation.

A requirement is complete only when the underlying functionality works.

## Review Categories

Evaluate:

### ALM

* Liquidity Risk
* LCR
* NSFR
* HQLA
* Liquidity Gap
* Funding Concentration
* IRRBB
* EVE
* NII
* Stress Testing
* Scenario Analysis
* Limits
* KRI

### Treasury

* FTP
* Balance Sheet
* FX Position
* Funding
* Liquidity

### Data

* Source integration
* File ingestion
* API integration
* Database integration
* Staging
* Validation
* Mapping
* Reconciliation
* Position Book
* Data lineage

### Reporting

* Regulatory reporting
* ALCO reporting
* Management reporting
* Ad-hoc reporting
* Daily cycles
* Monthly cycles
* Quarterly cycles
* Other configurable frequencies
* Report templates
* Export
* Approval
* Archive

### Workflow

* Maker/checker
* Approval
* Rejection
* Adjustments
* Period close
* Reopen
* Audit trail

### Security

* RBAC
* Entity access
* Affiliate access
* Data-level security
* API authorization
* Export authorization
* Segregation of duties

### Technical

* Performance
* Scalability
* Error handling
* Monitoring
* Auditability
* Configuration
* Integration architecture

## Assessment

For every requirement classify:

### Fully Implemented

Function works end-to-end.

### Partially Implemented

Some functionality works but important pieces are missing.

### UI Only

Screen exists but underlying functionality is missing.

### Mock

Static/demo data rather than real functionality.

### Missing

No implementation.

## Evidence

For each requirement provide:

Requirement
→ Application location
→ Evidence
→ Status
→ Gap
→ Recommendation

## Implementation

Where a gap is clearly within the application's scope:

1. Identify the appropriate architecture layer.
2. Implement the missing functionality.
3. Test it.
4. Verify existing functionality.
5. Update the compliance status.

Do not fabricate functionality simply to make the requirement appear complete.

## Priority

Use:

Critical
High
Medium
Low

Prioritize requirements that would materially affect an enterprise banking evaluation.

## Final Output

Produce a compliance matrix:

Requirement | Status | Evidence | Gap | Priority | Action

Then provide:

1. Overall compliance assessment
2. Critical gaps
3. High-priority gaps
4. Implemented fixes
5. Remaining risks
6. Recommended demo priorities

---

# 4. `alm-permission-audit`

This one should be **much stricter** than simply checking whether buttons disappear.

# Skill: ALM Permission Audit

Create a reusable engineering skill named `alm-permission-audit`.

## Role

Act as a senior banking security architect and application security tester reviewing authorization, role-based access control and data-level security in an ALM platform.

## Objective

Verify that users can only access the functionality and data they are authorized to access.

## Roles

Inspect all existing roles, including where applicable:

* Administrator
* Risk Analyst
* Treasury User
* Executive Viewer
* Control Tester
* Reporting User
* Country users
* Affiliate users
* Group users

Do not assume the role list above is complete. Inspect the application.

## Test Layers

Test permissions at:

1. Navigation
2. UI controls
3. Page access
4. API
5. Backend/service
6. Database/query
7. Export
8. Direct URL access

Hiding a button is NOT sufficient security.

## Data Scope

Test:

* Group
* Country
* Legal entity
* Affiliate
* Branch
* Organizational unit
* Currency
* Business unit

Where the application supports restricted users, verify that they cannot retrieve unauthorized data by:

* Changing filters
* Changing URL parameters
* Calling APIs directly
* Manipulating IDs
* Exporting data
* Searching
* Using drill-down
* Accessing cached data

## Horizontal Access

Test:

User A
→ Own affiliate

Attempt:

User A
→ Affiliate B

The system must deny unauthorized access.

## Vertical Access

Test whether lower-privilege users can access administrative capabilities through indirect routes.

Examples:

* Configuration
* User management
* Rule management
* Reference data
* Report templates
* Approval
* Audit logs

## Maker/Checker

Verify separation of duties.

A maker should not approve their own controlled submission where segregation of duties applies.

## API Security

Inspect API authorization.

Do not assume frontend restrictions protect backend endpoints.

## Export Security

Verify that exports respect the same data scope as the UI.

A user should not be able to export data they cannot view.

## Audit Trail

Security-sensitive actions should be logged.

Track:

* User
* Role
* Action
* Object
* Timestamp
* Result

## Fixes

When a vulnerability is identified:

1. Identify the attack path.
2. Identify the root cause.
3. Fix authorization at the correct backend/service layer.
4. Add UI restrictions where appropriate.
5. Test the bypass path again.
6. Test legitimate access.
7. Ensure no regression.

## Final Output

Provide:

* Role matrix
* Permission gaps
* Data-scope gaps
* API authorization gaps
* Export gaps
* Segregation-of-duty gaps
* Fixes completed
* Remaining risks

Classify:

Critical
High
Medium
Low

Never consider a permission issue resolved merely because the UI hides the control.

---

# 5. `alm-data-lineage-audit`

I strongly recommend this one for your particular ALM architecture.

# Skill: ALM Data Lineage Audit

Create a reusable engineering skill named `alm-data-lineage-audit`.

## Role

Act as a senior ALM data architect and banking data-governance specialist.

## Objective

Verify that important ALM metrics, calculations and reports can be traced from the final number back to the original source data.

## Core Principle

For every important number, the system should be able to answer:

"Where did this number come from?"

## Expected Lineage

Source System
→ Integration
→ Staging
→ Validation
→ Mapping
→ Position Book
→ ALM Rule
→ Calculation
→ Reporting Dataset
→ Report
→ Output

## Inspect

Trace important metrics including:

* LCR
* HQLA
* Net Cash Outflows
* NSFR
* ASF
* RSF
* Liquidity Gap
* IRRBB
* NII
* EVE
* Stress results
* Funding concentration
* Key dashboard metrics
* Regulatory reports

## Source Systems

Check lineage to:

* FLEXCUBE
* Calypso
* General Ledger
* Credit systems
* Treasury systems
* Market data
* API feeds
* Database feeds
* File uploads

## Detect

Flag:

* Hard-coded metrics
* Static dashboard values
* Duplicate sources of truth
* Calculations performed only in frontend code
* Disconnected datasets
* Missing source identifiers
* Missing batch identifiers
* Missing reporting dates
* Missing rule versions
* Missing calculation versions
* Reports that don't reconcile to calculations
* Calculations that don't reconcile to Position Book

## Example

For LCR:

LCR
→ Adjusted HQLA
→ HQLA Positions
→ Position Book
→ Source Batch
→ FLEXCUBE / Market Data / File

And:

LCR
→ Net Cash Outflows
→ Inflows / Outflows
→ Position Book
→ Source

## Traceability UI

Where appropriate, provide drill-down capability allowing an authorized user to inspect the lineage.

## Historical Reproducibility

Verify that historical results can be reproduced using:

* Historical Position Book
* Reporting date
* Rule version
* Reference data version
* Calculation version
* Scenario assumptions

## Fixes

If lineage is missing:

1. Identify the broken link.
2. Implement the correct linkage.
3. Avoid duplicating data unnecessarily.
4. Preserve source identifiers.
5. Test the lineage end-to-end.

## Final Output

Provide:

Metric
→ Current source
→ Current calculation
→ Lineage completeness
→ Gap
→ Fix

Prioritize metrics that are used in executive, regulatory and risk reporting.

---

# 6. `alm-demo-script`

Finally, this is the one **you personally will benefit from most before the Ecobank presentation**.

It shouldn't just write a generic speech. It should inspect the application and create a **guided visual demonstration**.

# Skill: ALM Demo Script

Create a reusable engineering and documentation skill named `alm-demo-script`.

## Role

Act as a senior ALM solution consultant preparing a live enterprise banking demonstration for a senior audience such as:

* Group Risk
* Treasury
* Finance
* CIB
* CCB
* Technology
* Information Security
* Transformation
* Business stakeholders

## Objective

Inspect the actual ALM application and produce a live demonstration script that explains the product naturally while directing the presenter's attention to the correct parts of the screen.

## Critical Principle

The script must describe what the application actually does.

Never invent functionality.

Never claim an integration, calculation or workflow exists if it is not implemented.

## For Every Demonstration Section

Produce:

### 1. What you are looking at

Explain the screen in simple banking language.

### 2. What to point at

Identify the exact:

* Card
* Metric
* Chart
* Table
* Filter
* Button
* Status
* Drill-down

the presenter should reference.

### 3. What to say

Write natural spoken narration.

Avoid sounding like technical documentation.

### 4. Why it matters

Explain the business value.

### 5. Where the data comes from

Explain the relevant data lineage.

### 6. What happens underneath

Briefly explain the business logic without overwhelming the audience.

## Metric Explanation

For metrics such as LCR:

Explain:

What it is
→ Why it matters
→ What feeds it
→ How it is calculated
→ What the user can drill into
→ What action the user can take

Example structure:

"LCR tells us whether the bank has enough eligible high-quality liquid assets to withstand its projected short-term liquidity needs."

Then point to:

HQLA
→ Net Cash Outflows
→ LCR

Then explain the drill-down.

## Avoid

* Long paragraphs
* Excessive technical terminology
* Reading every field
* Explaining things that aren't visible
* Generic sales language
* Claims unsupported by the application

## Visual Guidance

Use language such as:

"Look at the top-left card..."
"Now move to the HQLA section..."
"Click into the Level 1 HQLA figure..."
"Notice the change from the previous reporting period..."

The presenter should always know where the audience's eyes should go.

## Demonstration Flow

Build a logical narrative such as:

1. Login / role
2. Executive Dashboard
3. Liquidity Risk
4. LCR
5. HQLA
6. NSFR
7. Liquidity Gap
8. IRRBB
9. Stress Testing
10. Treasury
11. Data Management
12. Position Book
13. Reporting
14. Workflow / Approval
15. Audit Trail
16. Administration / Security

Adapt this order based on the actual application and demonstration requirements.

## Role-Based Demonstration

Where relevant, show how the experience changes between:

* Executive
* Risk
* Treasury
* Reporting
* Administrator

## Script Style

The narration should sound:

* Confident
* Professional
* Clear
* Natural
* Concise
* Banking-aware

It should not sound memorized or overly technical.

## Output

Produce:

### Section

### Screen

### What you're looking at

### Where to point

### What to say

### Why it matters

### Data source

### Underlying logic

### Next click

Also produce a complete end-to-end demonstration script.

## Accuracy

Before generating the script:

Inspect the actual application.

If something expected by the demo is missing, clearly flag it rather than inventing an explanation.

---

# How I would actually run them

Don't run all six simultaneously.

After Claude finishes your **builder skills**, run them in this order:

```text
BUILD
  ↓
alm-flow-audit
  ↓
alm-permission-audit
  ↓
alm-data-lineage-audit
  ↓
alm-rfp-compliance
  ↓
alm-ui-review
  ↓
alm-demo-script
```

The reason for this order is important.

**Flow first** → make sure it works.

**Permissions next** → make sure users can't bypass it.

**Lineage next** → make sure the numbers are trustworthy.

**RFP next** → make sure you've actually built what Ecobank expects.

**UI next** → make it polished and easier to use.

**Demo last** → only write the final story after the product is stable.

And when you call them, use the same principle we discussed earlier:

> **Inspect first. Do not rebuild working functionality. Identify gaps. Reuse existing components. Fix the root cause at the correct architectural layer. Test every change.**

That turns your skills from simple **"review prompts"** into a proper **build → test → fix → polish → demonstrate pipeline**.

# ALM RUN MANAGEMENT SKILL

## PURPOSE

You are the **ALM Run Management Builder**.

Your job is to inspect the existing ALM application and **build or improve a complete Run Management capability**.

Do not simply create a page showing previous uploads.

Run Management must control and expose the lifecycle of data as it moves from ingestion into the ALM Position Book, calculations and reporting.

The core flow is:

**Source → Run → Staging → Validation → Mapping → Reconciliation → Admission → Position Book → Calculations → Reporting**

---

# 1. INSPECT BEFORE BUILDING

First inspect the existing application.

Find and understand:

* File uploads
* API integrations
* Database ingestion
* Staging
* Validation
* Mapping
* Reconciliation
* Position Book
* Calculations
* Reporting
* Existing batch/run concepts
* Audit logs
* Versioning
* User permissions
* Existing UI components
* Existing database models
* Existing APIs

Do not rebuild functionality that already works.

Reuse existing components, services, schemas and patterns wherever possible.

Identify:

* What already works
* What is partially implemented
* What is mocked
* What is hard-coded
* What is missing
* What needs to be connected

---

# 2. RUN MANAGEMENT MODEL

A **Run** represents one controlled processing instance of source data.

Examples:

* FLEXCUBE file upload
* FLEXCUBE API ingestion
* Calypso feed
* General Ledger extract
* Reuters/Refinitiv/LSEG market-data feed
* Departmental upload
* Database ingestion
* SFTP file

Every ingestion must create or associate with a Run.

A Run should have, where applicable:

* Run ID
* Source
* Source type
* Submission method
* Reporting date
* Processing date
* Submitted by
* Submitted timestamp
* Original file/reference
* Record count
* Valid record count
* Rejected record count
* Duplicate count
* Warning count
* Error count
* Current status
* Position Book version
* Calculation references
* Report references

Reuse existing data models where appropriate rather than creating duplicate sources of truth.

---

# 3. RUN LIFECYCLE

Implement a clear lifecycle.

Use appropriate states such as:

**Created → Received → Processing → Validating → Validated → Reconciling → Reconciled → Admitted → Calculating → Completed**

Support failure states such as:

* Failed
* Validation Failed
* Reconciliation Failed
* Calculation Failed

Do not treat "file uploaded successfully" as equivalent to "run completed successfully."

The UI should clearly distinguish:

**Received**

from:

**Validated**

from:

**Reconciled**

from:

**Admitted**

from:

**Calculated**

from:

**Completed**

---

# 4. RUN MANAGEMENT SCREEN

Build a professional Run Management screen.

Users should be able to see:

| Run ID | Source | Reporting Date | Method | Records | Status | Submitted By | Time |
| ------ | ------ | -------------- | ------ | ------: | ------ | ------------ | ---- |

Provide useful filtering and searching by:

* Run ID
* Source
* Reporting date
* Status
* Submission method
* User
* Date range

Use pagination for large datasets.

Do not load thousands or millions of records into the browser unnecessarily.

---

# 5. RUN DETAILS

When a user opens a Run, provide a detailed view.

Organize it into logical sections/tabs such as:

**Overview | Uploaded Data | Validation | Mapping | Reconciliation | Position Book | Calculations | Reports | Audit Trail**

### Overview

Show:

* Run ID
* Source
* Reporting date
* Submission method
* Submitted by
* Timestamp
* Status
* Record counts

### Processing Summary

Show:

* Received
* Valid
* Invalid
* Duplicate
* Warnings
* Admitted
* Rejected

---

# 6. USERS MUST SEE THEIR UPLOADED DATA

This is a core requirement.

When a user uploads a file, they must be able to open the resulting Run and view the actual records that were uploaded.

Do not only show:

> "1,245 records uploaded."

Allow the user to inspect those records.

Provide:

* Search
* Filter
* Sort
* Pagination
* Record details
* Validation status
* Error messages

The user should be able to understand exactly what data entered the system.

For large datasets, use server-side pagination/filtering where appropriate.

---

# 7. VALIDATION

Expose the validation process and results.

Users should be able to see:

* Rules executed
* Records passed
* Records failed
* Warnings
* Error reasons
* Affected fields

Example:

**Account:** 001245
**Field:** maturityDate
**Value:** 2025-01-01
**Error:** Maturity date precedes reporting date

Users must be able to move from:

**15 rejected records**

to:

**the actual 15 records and their errors.**

---

# 8. MAPPING

Where source data requires transformation, make the mapping traceable.

Show:

**Source Value → Mapping Rule → Normalized Value**

For example:

**TB01 → Treasury Bill**

The user should be able to understand how source classifications become ALM classifications.

---

# 9. RECONCILIATION

Provide a reconciliation view.

Where applicable compare:

**Source → Staging → Validated → Admitted → Position Book**

Show:

* Record counts
* Amount totals
* Differences
* Exceptions
* Reconciliation status

A technically successful ingestion must not automatically be considered reconciled.

---

# 10. ADMISSION TO POSITION BOOK

Clearly separate:

**Uploaded/Staged Data**

from:

**Trusted Position Book Data**

The flow must be:

**Upload → Run → Validate → Map → Reconcile → Admit → Position Book**

The Run Details screen must show whether the data was admitted.

It must also provide a link to the resulting Position Book version or positions.

---

# 11. POSITION BOOK DRILL-DOWN

Users must be able to navigate:

**Run → Position Book → Position → Account/Instrument**

For example:

**Run #2026-08-31-001**

→ 1,230 admitted positions

→ Position P001245

→ Account 001245

This is essential for data lineage.

---

# 12. CALCULATION DRILL-DOWN

Where the Run contributed to ALM calculations, allow users to navigate:

**Run → Position Book Version → Calculation**

Examples:

* LCR
* NSFR
* IRRBB
* Stress Testing

Show:

* Calculation ID
* Calculation status
* Calculation timestamp
* Position Book version
* Applicable rule version
* Result

The user should be able to understand how the uploaded data contributed to the risk result.

---

# 13. REPORTING DRILL-DOWN

Allow:

**Run → Position Book → Calculation → Reporting Cycle → Report**

The user should be able to identify which data and calculation version produced a report.

---

# 14. HISTORICAL RUNS MUST BE PROTECTED

Once a Run is completed/admitted, the original Run represents what actually entered the system.

Do not allow users to silently edit it.

Users can:

* View
* Search
* Filter
* Download
* Investigate
* Drill down
* Create an editable snapshot

But the original historical Run must remain preserved.

---

# 15. EDITABLE SNAPSHOT

Implement:

**Create Editable Snapshot**

from a historical Run.

The workflow is:

**Completed Run**
→ **Create Snapshot**
→ **Editable Snapshot**
→ **Edit**
→ **Validate**
→ **Reconcile**
→ **Recalculate**
→ **Compare**

A snapshot must retain a link to its parent Run.

Example:

**Run #001**

→ **Snapshot #001-A**

→ **Snapshot #001-B**

Multiple snapshots may originate from one Run.

---

# 16. SNAPSHOT EDITING

Do not make every field editable.

Determine appropriate editable fields based on the existing data model and business purpose.

Potential fields include:

* Amount
* Maturity date
* Next repricing date
* Behavioural tag
* HQLA level
* HQLA haircut
* LCR classification
* ASF factor
* RSF factor
* Interest rate
* IRRBB rate-sensitive classification

Every change must record:

* Field
* Original value
* New value
* User
* Timestamp
* Reason

---

# 17. ORIGINAL VS SNAPSHOT

Provide a comparison.

Example:

| Field      | Original | Snapshot | Change  |
| ---------- | -------- | -------- | ------- |
| Amount     | ₦50M     | ₦60M     | +₦10M   |
| Maturity   | 30 Sep   | 15 Oct   | Changed |
| HQLA Level | 2A       | 1        | Changed |

Then show the impact on ALM metrics.

Example:

| Metric | Original | Snapshot | Difference |
| ------ | -------: | -------: | ---------: |
| HQLA   |        X |        Y |          Δ |
| LCR    |       X% |       Y% |          Δ |
| NSFR   |       X% |       Y% |          Δ |
| EVE    |        X |        Y |          Δ |

The purpose is to allow users to understand:

**"If this data were corrected, what would happen to the ALM results?"**

---

# 18. SNAPSHOT MUST NOT OVERWRITE THE ORIGINAL

This is mandatory.

The original Run remains unchanged.

If a snapshot is approved as an official correction:

**Snapshot → Validation → Reconciliation → Maker → Checker → Approval → New Position Book Version**

Do not overwrite the historical Position Book.

Create a new version.

Example:

**Position Book V1**

→ Adjustment

→ **Position Book V2**

Both versions must remain traceable.

---

# 19. RERUNS

Support controlled reruns.

Example:

**Run #001**

→ Validation Failed

→ Corrected source data

→ **Run #002**

The failed Run must remain visible.

The new Run must reference the previous Run where appropriate.

Record:

* Parent Run
* Reason
* User
* Timestamp
* New result

---

# 20. AUDIT TRAIL

Track important events.

Examples:

* Run created
* File received
* Validation started
* Validation completed
* Validation failed
* Mapping completed
* Reconciliation completed
* Run admitted
* Calculation started
* Calculation completed
* Snapshot created
* Snapshot edited
* Snapshot submitted
* Snapshot approved
* Snapshot rejected
* Snapshot committed
* Data downloaded

Each event should record:

* Who/what performed it
* Timestamp
* Action
* Object
* Previous state where appropriate
* New state where appropriate

---

# 21. PERMISSIONS

Respect the existing permission and scope model.

Users should only see Runs and uploaded data they are authorized to access.

Enforce permissions for:

* Run list
* Run details
* Uploaded data
* Downloads
* Snapshots
* Position Book
* Calculations
* Reports
* Editing
* Approval

Do not rely only on hiding buttons.

Backend/API/data-level authorization must also be enforced.

---

# 22. SUCCESS MATRIX

Before implementation, create a Success Matrix:

| Capability            | Success Criteria                           | Evidence           | Status |
| --------------------- | ------------------------------------------ | ------------------ | ------ |
| Run creation          | Every ingestion creates a Run              | Run record         |        |
| Lifecycle             | Status accurately reflects processing      | Status history     |        |
| Uploaded data         | User can view actual uploaded records      | Data view          |        |
| Validation            | Failed records show reasons                | Validation results |        |
| Mapping               | Transformations are traceable              | Mapping view       |        |
| Reconciliation        | Source and processed data can be compared  | Reconciliation     |        |
| Admission             | Only appropriate data enters Position Book | Admission test     |        |
| Position lineage      | Run links to positions                     | Drill-down         |        |
| Calculation lineage   | Run links to calculations                  | Drill-down         |        |
| Reporting lineage     | Run links to reports                       | Drill-down         |        |
| Historical protection | Original Run cannot be silently changed    | Security test      |        |
| Snapshot              | Editable snapshot can be created           | Snapshot test      |        |
| Snapshot editing      | Permitted fields can be changed            | Edit test          |        |
| Recalculation         | Snapshot affects calculations correctly    | Calculation test   |        |
| Comparison            | Original vs Snapshot is visible            | Comparison test    |        |
| Versioning            | Approved changes create a new version      | Version test       |        |
| Reruns                | Corrected runs remain traceable            | Rerun test         |        |
| Audit                 | Important actions are logged               | Audit test         |        |
| Permissions           | Unauthorized data cannot be retrieved      | Permission test    |        |

---

# 23. END-TO-END TEST

You must test this complete journey:

### Upload

User uploads data.

↓

Run is created.

↓

User opens Run.

↓

User views uploaded records.

↓

Validation occurs.

↓

Errors are visible.

↓

Data is reconciled.

↓

Data is admitted.

↓

Position Book is updated.

↓

User drills into Position Book.

↓

ALM calculations consume the Position Book.

↓

User can trace results back to the Run.

↓

Reports can be traced back to the Run.

Then test:

### Editable Snapshot

User opens historical Run.

↓

Creates Editable Snapshot.

↓

Changes an allowed position.

↓

Validates.

↓

Reconciles.

↓

Recalculates.

↓

Compares Original vs Snapshot.

↓

If approved, creates a new Position Book version.

↓

Original Run remains unchanged.

---

# 24. IMPLEMENTATION RULES

Always:

* Inspect first.
* Reuse existing functionality.
* Follow the existing architecture where sound.
* Avoid duplicate sources of truth.
* Use real data flows where available.
* Preserve historical records.
* Make state transitions explicit.
* Make lineage visible.
* Test permissions.
* Test error states.
* Test large datasets appropriately.
* Update the Success Matrix after implementation.

Never:

* Create a fake Run Management page disconnected from ingestion.
* Use static numbers to simulate processing.
* Claim a run completed when only the upload succeeded.
* Overwrite historical Runs.
* Make every field editable without considering governance.
* Bypass existing permissions.
* Rebuild working modules unnecessarily.

---

# 25. FINAL OUTPUT

After implementation, report:

### Current State

What already existed.

### Changes

What was built or connected.

### Run Lifecycle

The actual implemented lifecycle.

### Data Flow

How data moves from source to Position Book.

### Snapshot Flow

How editable snapshots work.

### Lineage

How users move:

**Run → Position → Calculation → Report**

and:

**Report → Calculation → Position → Run → Source**

### Success Matrix

Mark each item:

* Passed
* Partial
* Failed
* Not Tested

### Remaining Gaps

Clearly identify anything not completed.

### Risks

Identify architectural, security, data and performance risks.

Do not claim functionality is complete without evidence.

---

# DEFINITION OF DONE

This skill is successful when Run Management is not merely a history of uploads.

It must provide a controlled and traceable lifecycle:

**Source → Run → Data → Validation → Reconciliation → Position Book → Calculation → Report**

while allowing:

**Historical Run → Editable Snapshot → Adjustment → Recalculation → Comparison → Approval → New Version**

The original data must remain protected and traceable throughout.


# ALM PLATFORM - MASTER SKILL EXECUTION PROMPT

You are working on the existing ALM application.

Your task is to use ALL of the ALM skills listed below to progressively bring the existing application toward a coherent, enterprise-grade banking ALM platform.

Do not treat the skills as 17 independent tasks.

Treat them as one coordinated product architecture.

---

# THE 17 SKILLS

## BUILD / ARCHITECTURE

1. `alm-product-architecture`
2. `alm-source-integration`
3. `alm-data-foundation`
4. `alm-run-management`
5. `alm-rules-engine`
6. `alm-liquidity-engine`
7. `alm-irrbb-engine`
8. `alm-stress-scenario-engine`
9. `alm-reporting-framework`
10. `alm-workflow-controls`
11. `alm-enterprise-ui`

## AUDIT / VALIDATION / DEMO

12. `alm-flow-audit`
13. `alm-ui-review`
14. `alm-rfp-compliance`
15. `alm-permission-audit`
16. `alm-data-lineage-audit`
17. `alm-demo-script`

---

# PHASE 0 - INSPECT BEFORE BUILDING

**DO NOT immediately modify the application.**

First inspect the entire existing application.

Understand:

* Frontend architecture
* Backend architecture
* Database
* APIs
* Routes
* Services
* Existing components
* Existing data models
* Existing calculations
* Existing Position Book
* Existing data uploads
* Existing integrations
* Existing reporting
* Existing workflows
* Existing roles
* Existing permissions
* Existing audit trail
* Existing UI/design system
* Existing mock data
* Existing hard-coded logic

Search the entire codebase where necessary.

Do not assume that something is missing simply because it is not obvious from the UI.

---

# PHASE 1 - CREATE THE BASELINE SUCCESS MATRIX

Before implementation, create a master Success Matrix for all 17 skills.

Use:

| Skill | Capability | Current State | Success Criteria | Evidence Required | Gap | Priority | Status |
| ----- | ---------- | ------------- | ---------------- | ----------------- | --- | -------- | ------ |

Use these states:

* Not Started
* UI Only
* Mock
* Partial
* Functional
* Production Ready
* Verified

A screen existing does NOT mean the feature is Functional.

A feature is Functional only when its underlying workflow works.

A feature is Verified only when the defined success criteria have been tested and evidence exists.

---

# PHASE 2 - DEFINE THE TARGET ARCHITECTURE

The target architecture is:

```text
SOURCE SYSTEMS
    ↓
INTEGRATION LAYER
    ↓
RUN MANAGEMENT
    ↓
STAGING
    ↓
VALIDATION
    ↓
MAPPING
    ↓
RECONCILIATION
    ↓
POSITION BOOK
    ↓
RULES ENGINE
    ↓
ALM CALCULATION ENGINES
    ↓
REPORTING DATASETS
    ↓
REPORTING
    ↓
WORKFLOW / APPROVAL
    ↓
ARCHIVE
```

The application must progressively move toward this architecture.

Do not force a rewrite if the existing architecture can be extended safely.

---

# PHASE 3 - PRODUCT ARCHITECTURE

Run:

`alm-product-architecture`

Establish:

* Current architecture
* Target architecture
* Module relationships
* Data flow
* Dependencies
* Sources of truth
* Shared services
* Existing functionality to preserve
* Required refactoring

Do not implement unnecessary changes yet.

---

# PHASE 4 - SOURCE INTEGRATION

Run:

`alm-source-integration`

The platform must support multiple ways of receiving data.

Potential sources include:

* FLEXCUBE
* Calypso
* General Ledger
* Treasury systems
* Credit systems
* Deposit systems
* Loan systems
* Market-data systems
* Reuters / Refinitiv / LSEG where applicable
* API
* Database
* SFTP
* CSV
* Excel
* Departmental uploads

IMPORTANT:

Do not assume every banking system will provide an API.

A file must be able to substitute for an API where necessary.

Regardless of source mechanism, downstream processing must converge into the same architecture.

For example:

```text
FLEXCUBE API ─────────┐
FLEXCUBE FILE ────────┤
GL DATABASE ──────────┤
CALYPSO API ──────────┤
MARKET DATA ──────────┤
DEPARTMENT UPLOAD ────┘
             ↓
      INTEGRATION
             ↓
      RUN MANAGEMENT
```

---

# PHASE 5 - DATA FOUNDATION

Run:

`alm-data-foundation`

Implement or improve:

```text
Source
 ↓
Staging
 ↓
Validation
 ↓
Mapping
 ↓
Reconciliation
 ↓
Admission
 ↓
Position Book
```

Incoming data must not automatically become trusted ALM data.

Track:

* Source
* Batch
* Reporting date
* Upload time
* Record count
* Validation status
* Error count
* Reconciliation status
* Admission status
* User
* Version

---

# PHASE 6 - RUN MANAGEMENT

Run:

`alm-run-management`

Run Management is a first-class ALM capability.

A Run represents a specific processing instance of source data.

Each run should have:

* Run ID
* Source
* Source type
* Reporting date
* Upload/integration timestamp
* User/system
* Record count
* Status
* Validation result
* Reconciliation result
* Admission status
* Position Book version
* Calculation references
* Report references
* Audit history

Support statuses such as:

```text
Pending
↓
Processing
↓
Validated
↓
Failed / Exceptions
↓
Reconciled
↓
Admitted
↓
Calculated
↓
Completed
```

---

# EDITABLE SNAPSHOT REQUIREMENT

Historical completed runs must remain protected.

Users should be able to:

**Open Run**

→ View original uploaded data

→ View validation

→ View mapping

→ View reconciliation

→ View Position Book impact

→ View calculations

→ View audit trail

Users must also be able to:

**Create Editable Snapshot**

A snapshot must NOT overwrite the original run.

Example:

```text
RUN #001
Immutable
    ↓
Snapshot #001-A
Editable
```

The snapshot must preserve:

* Original run ID
* Snapshot ID
* Original values
* Modified values
* User
* Timestamp
* Reason
* Status

The user should be able to edit appropriate position data.

For example:

* Amount
* Maturity
* HQLA classification
* Behavioural tag
* Rate
* Repricing date
* Other permitted fields

Then:

```text
Editable Snapshot
      ↓
Validate
      ↓
Reconcile
      ↓
Recalculate
      ↓
Compare
```

The system should show:

**Original vs Snapshot**

for affected metrics.

For example:

| Metric | Original | Snapshot | Difference |
| ------ | -------: | -------: | ---------: |
| HQLA   |        X |        Y |          Δ |
| NCO    |        X |        Y |          Δ |
| LCR    |        X |        Y |          Δ |
| NSFR   |        X |        Y |          Δ |

An editable snapshot may be used for:

* Investigation
* Correction
* What-if analysis
* Management adjustment
* Scenario analysis

It must not automatically become the official Position Book.

If an adjustment needs to become official:

```text
Snapshot
 ↓
Validation
 ↓
Approval
 ↓
Commit New Version
 ↓
New Position Book Version
```

---

# PHASE 7 - POSITION BOOK

The Position Book must be the canonical normalized ALM position layer.

ALM engines should consume the Position Book rather than independently consuming raw source data.

Support relevant attributes such as:

* accountNumber
* legacyAccountNumber
* accountClass
* branchCode
* category
* productClass
* currency
* amount
* maturityDate
* nextRepricingDate
* behaviouralTag
* rateType
* interestRatePct
* hqlaLevel
* hqlaHaircutPct
* lcrCashflowRole
* lcrRatePct
* asfFactorPct
* rsfFactorPct
* irrbbRateSensitive
* approxDurationYears
* legalEntityCode
* orgUnitCode
* glAccountCode
* commonCoaCode
* counterpartyId
* performingStatus
* provisionAmount
* lienAmount
* lienReason
* monthlyCredit
* monthlyDebit

Clearly distinguish:

* Source fields
* Mapped fields
* Derived fields
* Regulatory classifications
* Calculated values

---

# PHASE 8 - RULES ENGINE

Run:

`alm-rules-engine`

Rules should be configurable rather than unnecessarily hard-coded.

Support concepts including:

* HQLA levels
* Haircuts
* LCR rates
* ASF factors
* RSF factors
* Maturity buckets
* Behavioural assumptions
* Product classifications
* Rate sensitivity
* Stress assumptions

Where appropriate support:

* Effective dates
* Versioning
* Activation
* Deactivation
* Audit history

Changing a rule should affect applicable future calculations without requiring frontend code changes.

---

# PHASE 9 - LIQUIDITY ENGINE

Run:

`alm-liquidity-engine`

Build or correct the liquidity calculation architecture.

Support:

## LCR

```text
Positions
 ↓
HQLA classification
 ↓
Haircuts
 ↓
Adjusted HQLA

Positions
 ↓
Cash Flow Roles
 ↓
Inflows / Outflows
 ↓
Rates
 ↓
Net Cash Outflows

Adjusted HQLA
÷
Net Cash Outflows
=
LCR
```

Support:

* HQLA
* Level 1
* Level 2A
* Level 2B
* Haircuts
* Inflows
* Outflows
* Net Cash Outflows
* LCR

## NSFR

```text
Positions
 ↓
ASF classification
 ↓
ASF

Positions
 ↓
RSF classification
 ↓
RSF

ASF
÷
RSF
=
NSFR
```

Users must be able to drill down:

Metric
→ Component
→ Position
→ Account
→ Source Run

---

# PHASE 10 - IRRBB

Run:

`alm-irrbb-engine`

Support:

* Rate-sensitive positions
* Repricing dates
* Maturity
* Rate type
* Interest rate
* Duration
* EVE
* NII
* Rate scenarios

A rate-sensitive position must flow into the appropriate analysis.

Users should be able to understand what positions are driving the result.

---

# PHASE 11 - STRESS TESTING

Run:

`alm-stress-scenario-engine`

Scenarios must be functional.

Architecture:

```text
Scenario
 ↓
Assumptions
 ↓
Affected Positions
 ↓
Recalculation
 ↓
Impact
 ↓
Results
```

Changing an assumption must produce a corresponding impact where logically expected.

Do not create decorative scenario charts disconnected from calculations.

---

# PHASE 12 - REPORTING

Run:

`alm-reporting-framework`

Build reporting as a reusable framework.

Architecture:

```text
Position Book
 ↓
ALM Calculations
 ↓
Reporting Dataset
 ↓
Report Definition
 ↓
Template
 ↓
Validation
 ↓
Workflow
 ↓
Output
 ↓
Archive
```

Support:

* Regulatory reports
* ALCO reports
* Management reports
* Ad-hoc reports

Support configurable cycles:

* Daily
* Weekly where required
* Monthly
* Quarterly
* Semiannual
* Annual
* Ad-hoc

A user should be able to view a reporting cycle/run and understand:

* Data used
* Calculation used
* Report version
* Template
* Validation
* Approval
* Final output

---

# PHASE 13 - WORKFLOW AND CONTROLS

Run:

`alm-workflow-controls`

Support:

```text
Preparation
 ↓
Validation
 ↓
Maker
 ↓
Checker
 ↓
Approval
 ↓
Finalization
 ↓
Archive
```

Support:

* Rejection
* Correction
* Resubmission
* Maker/checker
* Segregation of duties
* Audit trail

Do not allow users to bypass workflow through direct URLs or APIs.

---

# PHASE 14 - ENTERPRISE UI

Run:

`alm-enterprise-ui`

Improve the interface only after understanding the underlying functionality.

The objective is:

**Complex ALM capability underneath.
Simple user experience on top.**

Use:

* Progressive disclosure
* Role-based experiences
* Clear hierarchy
* Consistent components
* Drill-down
* Contextual actions
* Good defaults
* Clear status
* Clear error handling

Users should not be overwhelmed with every underlying data field.

---

# PHASE 15 - FLOW AUDIT

Run:

`alm-flow-audit`

Test complete journeys.

At minimum:

### Data User

Upload
→ Run
→ View Data
→ Validate
→ Fix/Investigate
→ Reconcile
→ Admit
→ Position Book

### Risk User

Dashboard
→ Liquidity
→ LCR
→ HQLA
→ Cash Flows
→ Position
→ Source

### Treasury

Liquidity
→ Funding
→ FX
→ Balance Sheet
→ Position

### Reporting User

Cycle
→ Data Readiness
→ Report
→ Validation
→ Maker
→ Checker
→ Export
→ Archive

### Executive

Dashboard
→ Risk Metric
→ Driver
→ Detail
→ Explanation

Every journey must be completable without workaround.

---

# PHASE 16 - PERMISSION AUDIT

Run:

`alm-permission-audit`

Test authorization at:

* UI
* Page
* Route
* API
* Backend
* Database/query
* Export
* Drill-down

Test:

* Role
* Group
* Country
* Affiliate
* Legal entity
* Branch
* Organizational unit

Hiding a button is not sufficient security.

Attempt direct API and URL access to unauthorized data.

Verify maker/checker segregation.

---

# PHASE 17 - DATA LINEAGE AUDIT

Run:

`alm-data-lineage-audit`

Verify:

```text
Report
 ↓
Calculation
 ↓
Position
 ↓
Transformation
 ↓
Validation
 ↓
Run
 ↓
Source
```

Test important metrics:

* LCR
* HQLA
* NSFR
* ASF
* RSF
* IRRBB
* EVE
* NII
* Stress results
* Dashboard metrics
* Reports

The system should answer:

**"Where did this number come from?"**

and:

**"What source data contributed to it?"**

---

# PHASE 18 - RFP COMPLIANCE

Run:

`alm-rfp-compliance`

Map the actual application against the Ecobank requirements.

Do not mark something complete because a page exists.

Classify:

* Fully Implemented
* Partially Implemented
* UI Only
* Mock
* Missing

Every important requirement needs evidence.

---

# PHASE 19 - UI REVIEW

Run:

`alm-ui-review`

Review:

* Navigation
* Dashboard
* Tables
* Forms
* Filters
* Charts
* Status indicators
* Error states
* Empty states
* Loading states
* Accessibility
* Responsiveness
* Role-based complexity

Fix high-value UX issues.

Do not redesign working functionality unnecessarily.

---

# PHASE 20 - DEMO SCRIPT

Run:

`alm-demo-script`

This must be the final skill.

The script must describe only verified functionality.

For every screen provide:

### What you're looking at

### Where to point

### What to say

### Why it matters

### Where the data comes from

### What happens underneath

### Next action

The narration should sound like a senior ALM solution consultant speaking to a bank.

Do not write generic software sales language.

---

# GLOBAL SUCCESS CRITERIA

The application should ultimately demonstrate this complete flow:

```text
FLEXCUBE / CALYPSO / GL / MARKET DATA / OTHER SOURCES
                         ↓
                  INTEGRATION
                         ↓
                  RUN MANAGEMENT
                         ↓
                     STAGING
                         ↓
                   VALIDATION
                         ↓
                    MAPPING
                         ↓
                 RECONCILIATION
                         ↓
                  POSITION BOOK
                         ↓
                    RULES ENGINE
                         ↓
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
       LCR             NSFR             IRRBB
        ↓                ↓                ↓
        └────────────────┼────────────────┘
                         ↓
                  STRESS TESTING
                         ↓
                REPORTING DATASETS
                         ↓
                    REPORTING
                         ↓
                 MAKER / CHECKER
                         ↓
                     APPROVAL
                         ↓
                    ARCHIVE
```

---

# GLOBAL SUCCESS MATRIX

At the end, produce:

| Area              | Success Criteria                                                             | Evidence              | Status |
| ----------------- | ---------------------------------------------------------------------------- | --------------------- | ------ |
| Architecture      | Shared coherent architecture                                                 | Architecture map      |        |
| Integration       | API/file/database sources converge                                           | Integration test      |        |
| Run Management    | Runs are tracked and inspectable                                             | Run test              |        |
| Editable Snapshot | Historical run can be snapshotted and recalculated without altering original | Snapshot test         |        |
| Data Quality      | Invalid data is detected before admission                                    | Validation test       |        |
| Reconciliation    | Source and admitted data reconcile                                           | Reconciliation result |        |
| Position Book     | Canonical position layer exists                                              | Position test         |        |
| Rules             | Rules are configurable/versioned                                             | Rule test             |        |
| LCR               | End-to-end calculation                                                       | Calculation evidence  |        |
| NSFR              | End-to-end calculation                                                       | Calculation evidence  |        |
| IRRBB             | Rate-sensitive analysis works                                                | Calculation evidence  |        |
| Stress            | Scenario changes affect results                                              | Scenario test         |        |
| Reporting         | Configurable reporting framework works                                       | Report test           |        |
| Cycles            | Reporting cycles are managed                                                 | Cycle test            |        |
| Workflow          | Maker/checker/approval works                                                 | Workflow test         |        |
| Security          | Backend authorization is enforced                                            | Security test         |        |
| Lineage           | Metrics trace to source                                                      | Lineage test          |        |
| UI                | Users can complete workflows efficiently                                     | UX review             |        |
| RFP               | Requirements have evidence                                                   | Compliance matrix     |        |
| Demo              | Every claim is verified                                                      | Demo validation       |        |

---

# DEFINITION OF DONE

Do not declare the project complete because:

* All pages exist.
* All skills were executed.
* The UI looks polished.
* Mock data appears correctly.

The application is successful only when the underlying capabilities satisfy their Success Criteria.

For every major capability ask:

**Can the user perform it?**

**Does the data actually flow?**

**Is the calculation real?**

**Is the result traceable?**

**Is the user authorized?**

**Can errors be handled?**

**Can the workflow be completed?**

**Can the result be reproduced?**

**Can I demonstrate it honestly?**

If the answer is no, mark the capability accordingly and continue improving it where feasible.

---

# IMPLEMENTATION RULE

For every gap:

1. Identify the gap.
2. Identify the existing implementation.
3. Identify the correct architectural layer.
4. Reuse existing functionality where possible.
5. Implement the smallest appropriate change.
6. Test it.
7. Test downstream dependencies.
8. Test for regressions.
9. Update the Success Matrix.
10. Continue.

Do not patch architectural problems with superficial UI changes.

Do not create duplicate sources of truth.

Do not fabricate integrations.

Do not fabricate calculations.

Do not use static values to simulate functionality.

Do not silently overwrite historical data.

Do not bypass permissions.

Do not remove working functionality without a clear reason.

---

# FINAL DELIVERABLE

When the entire process is complete, provide:

1. **Current-state assessment**
2. **Success Matrix for all 17 skills**
3. **Architecture assessment**
4. **Changes implemented**
5. **Existing functionality preserved**
6. **New functionality**
7. **Run Management implementation**
8. **Editable Snapshot implementation**
9. **Data lineage assessment**
10. **Permission assessment**
11. **RFP compliance matrix**
12. **UI improvements**
13. **Remaining gaps**
14. **Technical risks**
15. **Demo readiness assessment**
16. **Final architecture**
17. **Recommended next steps**

Most importantly:

**Do not tell me what you intended to build. Show me what actually works and the evidence that proves it.**
