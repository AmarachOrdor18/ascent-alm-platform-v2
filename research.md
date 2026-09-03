Yes. If you are actually **building the ALM system**, the PRD should be much more than a list of features. It should describe **who uses the system, what they do, what the system does in response, what happens when something fails, and how the process ends in a report/decision**.

Based on the Ecobank RFP and the technical proposal you uploaded, I would structure the PRD around the **end-to-end ALM operating cycle** rather than simply copying the RFP modules. The RFP describes the platform as a centralized system for identifying, measuring, monitoring and reporting Liquidity Risk and IRRBB across entities. 

# ALM System - Product Requirements Document

## 1. Document Overview

### 1.1 Product Name

**Enterprise Asset & Liability Management Platform**

### 1.2 Product Objective

The system will provide a centralized platform through which banking entities can:

> **Collect → Validate → Process → Calculate → Analyze → Monitor → Act → Report**

on asset, liability, liquidity and interest-rate risk.

The platform should support both **individual affiliates** and **Group-level consolidation**. The proposed solution explicitly includes multi-entity processing and Group/affiliate-level risk calculations. 

---

# 2. The Most Important Part: Overall User Flow

This is the flow I would put near the beginning of the PRD.

```text
                    ┌──────────────────────┐
                    │      USER LOGIN      │
                    │     SSO + MFA        │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │     SELECT SCOPE     │
                    │ Group / Affiliate    │
                    │ Date / Currency      │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │    DATA INGESTION    │
                    │ Flexcube / Calypso   │
                    │ Bloomberg / Reuters  │
                    │ CSV / Excel / JSON   │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │ DATA VALIDATION      │
                    │ Completeness         │
                    │ Duplicates           │
                    │ Referential checks   │
                    │ Range checks         │
                    └──────────┬───────────┘
                               ↓
                       ┌───────┴────────┐
                       │                │
                    PASS             FAIL
                       │                │
                       ↓                ↓
              ┌──────────────┐   ┌───────────────┐
              │ CALCULATION  │   │ EXCEPTION     │
              │ / PROCESSING │   │ MANAGEMENT    │
              └──────┬───────┘   └───────┬───────┘
                     │                    │
                     │             Resolve / Re-run
                     │                    │
                     └──────────┬─────────┘
                                ↓
                    ┌──────────────────────┐
                    │    RISK ENGINES      │
                    │                      │
                    │ Liquidity            │
                    │ IRRBB                │
                    │ FTP                  │
                    │ Behavioural          │
                    │ Profitability        │
                    │ Stress Testing       │
                    └──────────┬───────────┘
                               ↓
                    ┌──────────────────────┐
                    │ RISK MONITORING      │
                    │ Limits / KRIs        │
                    │ Risk Map             │
                    └──────────┬───────────┘
                               ↓
                       ┌───────┴────────┐
                       │                │
                     NORMAL          BREACH
                       │                │
                       ↓                ↓
                 ┌───────────┐   ┌──────────────┐
                 │ REPORTING │   │ ESCALATION & │
                 │ & DASHBOARD│  │ REMEDIATION  │
                 └─────┬─────┘   └──────┬───────┘
                       │                 │
                       └────────┬────────┘
                                ↓
                    ┌──────────────────────┐
                    │ MANAGEMENT DECISION  │
                    │ / REGULATORY REPORT  │
                    └──────────────────────┘
```

That is the **core product flow**.

The proposal supports this general lifecycle: ingestion and validation exceptions occur before computation; computation engines produce risk results; workflow manages breaches/remediation; reporting consumes the resulting data.  

---

# 3. User Personas

The PRD should then define **exactly who interacts with the system**.

| User                 | What they do                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| **Administrator**    | Configure system, users, permissions and parameters                     |
| **Risk Analyst**     | Run/analyze risk metrics, stress tests, limits and behavioural analysis |
| **Treasury User**    | Analyze FTP, liquidity and funding positions                            |
| **Control Tester**   | Test controls and manage remediation                                    |
| **Reporting User**   | Generate reports and perform ad-hoc analysis                            |
| **Executive Viewer** | View Group-level risk dashboards                                        |

These roles are explicitly identified in the technical proposal. 

---

# 4. Functional Architecture of the Product

I would divide the application into these major areas:

### A. Dashboard

* Group risk overview
* Affiliate risk overview
* Key metrics
* Breaches
* KRIs
* Liquidity Risk Map
* Recent alerts
* Pending actions

### B. Data Management

* Data sources
* Data ingestion
* Data validation
* Data quality exceptions
* Data lineage
* Processing status

### C. Risk Management

* Liquidity Risk
* Maturity Gap
* Repricing Gap
* LCR
* NSFR
* Liquidity Ratio
* Loan-to-Deposit Ratio
* Deposit Limits
* Depositor Concentration
* Cross-Currency Funding

### D. IRRBB

* NII Sensitivity
* EVE
* Basel shock scenarios
* Custom scenarios
* Interest-rate gap analysis

### E. Behavioural Analysis

* Deposit run-off
* Core/non-core deposits
* Asset pay-off
* Regression modelling

### F. Stress Testing

* Liquidity stress
* IRRBB stress
* Combined scenarios
* Affiliate stress
* Group stress

### G. FTP

* Pooled funding cost
* Base FTP
* Liquidity premium
* Net revenue funding
* Product/business-segment allocation

### H. Monitoring

* Limits
* Limit utilization
* Breaches
* KRIs
* Alerts
* Escalations

### I. Controls

* Control testing
* Issues
* Remediation
* Verification
* Audit trail

### J. Reporting

* Regulatory reports
* Risk reports
* Executive reports
* Custom reports
* Ad-hoc reporting
* Scheduled reports
* Export

---

# 5. Core User Journey - Daily ALM Run

This should probably be the **most detailed user flow in the PRD**.

## User Story

> As a Risk Analyst, I want to process the latest balance-sheet and market data so that I can calculate the bank's current liquidity and IRRBB position and identify risks requiring action.

### Step 1 - Login

**User:** Risk Analyst

```text
Login
 ↓
SSO
 ↓
MFA
 ↓
Authorization
 ↓
Dashboard
```

The RFP requires RBAC and MFA, while the proposal specifies SSO, MFA and immutable audit trails.  

---

## Step 2 - Select Reporting Context

User selects:

* Entity
* Group / Affiliate
* Reporting date
* Currency
* Reporting period
* Reporting scenario

Example:

```text
Entity:       Ecobank Ghana
Reporting Date: 31-Aug-2026
Currency:     GHS
Scope:        Affiliate
```

For Group reporting:

```text
Scope
 ├── Group
 ├── Region
 └── Affiliate
```

---

# 6. Data Ingestion Flow

The system obtains:

### Core Banking

**Flexcube**

* Positions
* Transactions
* GL data

### Treasury

**Calypso**

* Trade positions
* Market rates
* Treasury instruments

### Market Data

* Bloomberg
* Reuters

### Files

* CSV
* XML
* JSON
* Excel

These integrations and formats are explicitly described in both documents. 

---

# 7. Data Validation Flow

Once data arrives:

```text
Data Received
      ↓
Schema Validation
      ↓
Completeness Check
      ↓
Duplicate Check
      ↓
Referential Integrity
      ↓
Range Check
      ↓
Cross-field Consistency
      ↓
     PASS?
    /     \
  YES      NO
   ↓        ↓
Process   Exception
           Queue
             ↓
       User investigates
             ↓
       Correct / Resubmit
             ↓
          Revalidate
```

This is important because the proposal specifically states that validation exceptions are **logged, categorized and routed for resolution before computation runs**. 

### PRD requirement example

**FR-DATA-001**

> The system shall validate incoming ALM data before allowing risk calculations to execute.

**Acceptance Criteria**

* Given valid data, processing can proceed.
* Given missing mandatory fields, processing is blocked.
* Given duplicate records, an exception is generated.
* Given invalid values, the record is rejected.
* Every exception receives an identifier.
* The user can view and resolve the exception.
* All actions are audited.

---

# 8. Calculation Flow

Once data passes validation:

```text
Validated Positions
        ↓
Standardized Position Store
        ↓
        ├────────→ Liquidity Engine
        │
        ├────────→ IRRBB Engine
        │
        ├────────→ FTP Engine
        │
        ├────────→ Behavioural Engine
        │
        ├────────→ Profitability Engine
        │
        └────────→ Stress Testing Engine
```

The proposal describes independently deployable engines for liquidity, IRRBB, FTP, stress testing, behavioural modelling and profitability. 

---

# 9. Liquidity Risk User Flow

For example:

```text
Risk Analyst
     ↓
Liquidity Risk
     ↓
Select Entity
     ↓
Select Date
     ↓
Select Metric
     ↓
Run Calculation
     ↓
LCR / NSFR / Gap / Liquidity Ratio
     ↓
View Result
     ↓
Drill Down
     ↓
Underlying Positions
     ↓
Identify Risk Driver
```

The RFP requires liquidity metrics including LCR, NSFR, liquidity ratio, loan-to-deposit ratio, deposit limits, depositor concentration and cross-currency funding. 

---

# 10. IRRBB User Flow

```text
Risk Analyst
      ↓
IRRBB
      ↓
Select Entity
      ↓
Select Reporting Date
      ↓
Select Scenario
      ↓
     ┌──────────────────┐
     │ Basel Scenario    │
     │ Custom Scenario   │
     └─────────┬────────┘
               ↓
        Run Calculation
               ↓
       ┌───────┴────────┐
       ↓                ↓
 NII Sensitivity       EVE
       ↓                ↓
       └───────┬────────┘
               ↓
        View Exposure
               ↓
        Drill to Positions
```

The RFP explicitly requires NII sensitivity, EVE, six prescribed IRRBB shock scenarios and custom scenarios. 

---

# 11. Stress Testing Flow

This deserves its own workflow because it is not simply another report.

```text
Risk Analyst
     ↓
Stress Testing
     ↓
Create Scenario
     ↓
Select Scope
     ↓
Select Stress Variables
     ↓
Configure Assumptions
     ↓
Submit Scenario
     ↓
Approval / Workflow
     ↓
Execute Stress Test
     ↓
Calculate Impact
     ↓
Compare:
Base Case vs Stress Case
     ↓
Assess Survival Horizon
     ↓
Review Results
     ↓
Save / Report
```

For liquidity stress testing, the RFP specifically identifies deposit run-off, liquid-asset assumptions, emergency/interbank funding shocks and survival horizon. 

---

# 12. Limit Monitoring Flow

This is where the ALM system becomes an **active risk-management system**, rather than merely an analytics dashboard.

```text
Risk Metric Calculated
        ↓
Compare Against Limit
        ↓
     Utilization
        ↓
 ┌──────┼─────────┐
 ↓      ↓         ↓
Green  Amber      Red
 ↓      ↓         ↓
Normal Warning   Breach
        ↓         ↓
     Alert     Escalation
                  ↓
           Assign Owner
                  ↓
          Investigate Cause
                  ↓
        Remediation Action
                  ↓
          Resolve / Extend
                  ↓
             Close
```

The RFP requires escalation as utilization approaches/breaches limits and tracking of resolution actions, temporary limits, expiry timelines and notes. 

---

# 13. Breach Resolution User Flow

For example:

### Scenario

LCR falls below the configured limit.

```text
LCR Calculation
      ↓
Limit Engine
      ↓
LCR < Limit
      ↓
Create Breach
      ↓
Notify Risk Analyst
      ↓
Escalate to Treasury
      ↓
Treasury Investigates
      ↓
Select Action
 ┌──────────────┬──────────────┐
 │              │              │
Remediate   Temporary Limit   Escalate
 │              │              │
 ↓              ↓              ↓
Record Action  Set Expiry    Senior User
 │              │              │
 └──────────────┴──────────────┘
                ↓
           Monitor Breach
                ↓
          Resolved?
          /       \
        No         Yes
        ↓           ↓
   Continue       Close
   Escalation     Breach
```

Every action should be auditable.

---

# 14. Behavioural Analysis Flow

```text
Historical Data
      ↓
Select Product / Deposit Type
      ↓
Select Historical Period
      ↓
Run Regression
      ↓
Identify Behaviour
      ↓
Core / Non-Core
Deposit Profile
      ↓
Run-off Pattern
      ↓
Model Assumption
      ↓
Feed Result Into
Liquidity / Stress Testing
```

The RFP specifically requires regression analysis for deposit run-off and asset pay-off behaviour. 

---

# 15. Liquidity Risk Map Flow

```text
Risk Metrics
     +
KRIs
     +
Limit Status
     +
Stress Results
        ↓
Liquidity Assessment
        ↓
Risk Scoring
        ↓
Liquidity Risk Map
        ↓
Group
  ↓
Region
  ↓
Affiliate
  ↓
Risk Driver
```

The proposed platform describes a colour-coded interactive risk map with Group-to-affiliate drill-down. 

---

# 16. KRI Flow

```text
Risk Metric
     ↓
KRI Definition
     ↓
Thresholds
 ┌──────┬───────┬─────┐
Green  Amber    Red
     ↓
Continuous Monitoring
     ↓
Threshold Crossed?
     ↓
Alert
     ↓
Dashboard
     ↓
Investigation
```

KRIs should be configurable and linked back to the underlying risk metrics. 

---

# 17. Control Remediation Flow

This should be treated as another workflow, not simply another screen.

```text
Control Issue Identified
          ↓
Create Issue
          ↓
Categorize
          ↓
Assign Owner
          ↓
Define Action Plan
          ↓
Set Due Date
          ↓
Implement Action
          ↓
Control Tester Reviews
          ↓
     Effective?
      /      \
    No        Yes
    ↓          ↓
Rework      Close
    ↓
Retest
```

The proposal defines the remediation lifecycle as **identification → assignment → action planning → implementation → verification**, with audit logging. 

---

# 18. FTP User Flow

```text
Treasury User
      ↓
FTP
      ↓
Select Entity
      ↓
Select Product / Business Segment
      ↓
Select Funding Pool
      ↓
Configure / Retrieve
     ├── Base FTP
     ├── Liquidity Premium
     └── Funding Cost
      ↓
Calculate FTP
      ↓
Allocation
      ↓
Net Revenue Funding
      ↓
Analyze Results
      ↓
Export / Report
```

The RFP requires pooled funding cost, Base FTP, liquidity premium and net revenue funding. 

---

# 19. Reporting Flow

The reporting process should sit **at the end of almost every workflow**.

```text
Calculated Results
       ↓
Reporting Engine
       ↓
Select Report
       ↓
Select Scope
       ↓
Select Period
       ↓
Generate
       ↓
Review
       ↓
 ┌─────┴─────┐
 ↓           ↓
Export     Schedule
 ↓           ↓
PDF/Excel   Distribution
/CSV
```

The proposal includes standardized reports, customizable dashboards, drill-down, ad-hoc reporting, scheduled distribution and PDF/Excel/CSV exports. 

---

# 20. The PRD Should Define Every Screen Like This

For each screen, don't just write:

> "Liquidity Risk Dashboard"

Instead:

### Screen: Liquidity Risk Dashboard

**Purpose**

Allow Risk Analysts and Treasury Users to assess current liquidity exposure.

**User Roles**

* Risk Analyst
* Treasury User
* Executive Viewer

**Inputs**

* Entity
* Reporting date
* Currency
* Metric
* Period

**Outputs**

* LCR
* NSFR
* Liquidity Ratio
* Loan-to-Deposit Ratio
* Gap
* Concentration
* Cross-currency funding

**Actions**

* Filter
* Drill down
* Compare periods
* View underlying positions
* Export
* Create report

**System Behaviour**

When the user selects an affiliate and date, the system retrieves the latest validated calculations for that scope and displays the results.

**Exceptions**

* No data available
* Data validation failed
* Calculation unavailable
* Stale data

**Audit**

Record:

* User
* Timestamp
* Entity
* Action
* Parameters
* Result/run ID

---

# 21. The PRD Should Also Have a "Run" Concept

This is something I would strongly recommend if you're actually developing it.

Don't think:

> "User clicks LCR and we calculate something."

Think:

> **User creates a calculation run.**

For example:

```text
RUN-2026-08-31-GHA-001

Entity: Ghana
Date: 31-Aug-2026
Type: ALM Daily Run
Status: Completed

Data
 ├── Flexcube ✓
 ├── Calypso ✓
 ├── Market Data ✓
 └── Validation ✓

Calculations
 ├── LCR ✓
 ├── NSFR ✓
 ├── Gap ✓
 ├── IRRBB ✓
 ├── FTP ✓
 └── Behavioural ✓

Monitoring
 ├── Limits evaluated ✓
 ├── KRIs evaluated ✓
 └── Breaches: 3

Reports
 ├── ALM Report ✓
 └── Regulatory Report ✓
```

This makes the platform much easier to audit, reproduce and troubleshoot.

It also aligns with the proposal's architecture where data is processed through independent engines and workflow events are traceable. 

---

# 22. System State Model

I would put this directly into the PRD:

```text
CREATED
   ↓
DATA_LOADING
   ↓
VALIDATING
   ↓
VALIDATION_FAILED ──→ CORRECTION
   │                       ↓
   └────────────────── VALIDATING
                           ↓
                     VALIDATED
                           ↓
                     PROCESSING
                           ↓
                     CALCULATING
                           ↓
                      COMPLETED
                           ↓
                     MONITORING
                           ↓
              ┌────────────┴───────────┐
              ↓                        ↓
          NO BREACH                  BREACH
              ↓                        ↓
          REPORTING              ESCALATION
                                       ↓
                                  REMEDIATION
                                       ↓
                                    CLOSED
```

This is extremely useful for developers because it tells them **what states the application must support**, not just what buttons exist.

---

# 23. What the Actual PRD Structure Should Look Like

I would create the document in this order:

### 1. Product Overview

* Purpose
* Problem statement
* Objectives
* Scope
* Out of scope
* Success criteria

### 2. Users & Roles

* Personas
* Permissions
* Role matrix

### 3. End-to-End User Journey

* Login
* Select entity
* Data ingestion
* Validation
* Calculation
* Monitoring
* Exception
* Reporting
* Decision

### 4. Information Architecture

```text
Dashboard
Data Management
Risk Management
   ├── Liquidity
   ├── IRRBB
   ├── Behavioural
   ├── Stress Testing
   └── Profitability
Treasury
   └── FTP
Monitoring
   ├── Limits
   ├── KRIs
   └── Risk Map
Controls
   └── Remediation
Reporting
Administration
```

### 5. Functional Requirements

Then each module gets:

* Objective
* User
* Preconditions
* Inputs
* Workflow
* Business rules
* Calculations
* Outputs
* Exceptions
* Permissions
* Audit requirements
* Acceptance criteria

### 6. Data Requirements

* Position data
* GL data
* Transaction data
* Market data
* Reference data
* Configuration
* Assumptions
* Historical data

### 7. Integration Requirements

* Flexcube
* Calypso
* Bloomberg
* Reuters
* File ingestion
* APIs

### 8. Calculation Engine Requirements

* Liquidity
* IRRBB
* FTP
* Behavioural
* Stress
* Profitability

### 9. Workflow Requirements

* Data exceptions
* Stress approval
* Limit breaches
* Remediation
* Escalation

### 10. Reporting Requirements

### 11. Security & Access

### 12. Audit & Compliance

### 13. Non-Functional Requirements

### 14. API Requirements

### 15. Data Model

### 16. Acceptance Criteria

### 17. MVP Definition

### 18. Future Releases

---

# 24. And I Would Make the MVP Much Smaller

Don't build all of this at once.

The documents describe a very large enterprise platform, including 12+ independently deployable services in the proposal. 

For a first working version, I'd build:

```text
                 MVP
                  │
      ┌───────────┴────────────┐
      │                        │
 Data Management          User Management
      │                        │
      ↓                        ↓
Ingestion → Validation     RBAC + MFA
      │
      ↓
 Position Store
      │
      ├───────────┐
      ↓           ↓
 Liquidity      IRRBB
 Engine         Engine
      │           │
      └─────┬─────┘
            ↓
       Risk Dashboard
            ↓
       Limit Monitoring
            ↓
        Reporting
            ↓
       Audit Trail
```

Then Release 2:

* Stress testing
* Behavioural analysis
* FTP
* KRIs
* Liquidity Risk Map
* Control remediation

Then Release 3:

* Advanced analytics
* AI/ML
* advanced scenario modelling
* broader affiliate rollout
* advanced regulatory reporting

The proposal itself follows a phased approach: core engines first, then analytics/monitoring, then integration/UAT, followed by rollout and stabilization. 

---

## The key idea

If you're building this system, **the PRD should not be organized primarily as "18 requirements from the RFP."**

It should describe the **ALM operating cycle**:

> **1. Get data → 2. Validate data → 3. Create a calculation run → 4. Calculate risk → 5. Monitor limits/KRIs → 6. Detect problems → 7. Investigate → 8. Remediate/escalate → 9. Generate reports → 10. Preserve the entire audit trail.**

Then the individual modules-**Liquidity, IRRBB, FTP, Stress Testing, Behavioural Analysis, Limits, KRIs, Risk Map, Controls and Reporting**-fit into that lifecycle.

That gives you a PRD that a **BA can write requirements from, a UX designer can create screens from, an architect can design services from, and developers can actually build from**, while staying aligned with the source RFP and proposal. 

The **position book should generally not be manually created inside the ALM system**. It should be **fed into the platform from the affiliate’s source systems**, then validated and stored as the ALM position book.

Based on the solution documents we’ve been using, the flow would be:

```text
AFFILIATE
   │
   ▼
SOURCE SYSTEMS
   │
   ├── Core Banking / Flexcube
   ├── Treasury / Calypso
   ├── Market Data
   └── Files (CSV / Excel / XML / JSON)
   │
   ▼
DATA INGESTION
   │
   ▼
DATA VALIDATION
   │
   ├── ❌ Errors → Exception Queue → Correct → Re-submit
   │
   └── ✅ Passed
          │
          ▼
     POSITION STORE
          │
          ▼
       ALM ENGINES
```

### So what exactly is the "Position Book"?

Think of it as the **ALM-ready inventory of the bank's financial positions at a particular point in time**.

For example:

| Account | Product | Currency | Amount | Maturity   | Repricing  | Rate |
| ------- | ------- | -------- | -----: | ---------- | ---------- | ---: |
| 001234  | Loan    | GHS      |    50M | 2030-05-10 | 2027-05-10 |  15% |
| 005678  | Deposit | GHS      |    20M | 2027-01-15 | 2027-01-15 |   8% |
| 009876  | Bond    | USD      |    10M | 2028-09-20 | -          |   5% |

Your position data model already contains fields such as:

`accountNumber`, `accountClass`, `branchCode`, `productClass`, `currency`, `amount`, `maturityDate`, `nextRepricingDate`, `behaviouralTag`, `rateType`, `interestRatePct`, `hqlaLevel`, `lcrCashflowRole`, `asfFactorPct`, `rsfFactorPct`, `irrbbRateSensitive`, and `approxDurationYears`.

Those fields are what allow the different ALM engines to use the same underlying position data.

---

## How would Ecobank actually get it?

There are **two main routes** in the proposed solution.

### 1. Automated source-system integration

For an affiliate such as Ghana:

```text
Flexcube / Calypso
       │
       ▼
Integration Adapter
       │
       ▼
ALM Data Ingestion
       │
       ▼
Validation
       │
       ▼
Position Book
```

The proposal specifically identifies integrations with **Flexcube, Calypso, Bloomberg/Reuters**, as well as file-based inputs such as CSV, XML, JSON and Excel.

So the preferred production model would be **automated ingestion from the affiliate's source systems**.

---

### 2. File upload

For an affiliate that isn't yet integrated:

```text
Affiliate
    │
    ▼
Export Position Data
    │
    ▼
CSV / Excel / XML / JSON
    │
    ▼
Upload to ALM
    │
    ▼
Field Mapping
    │
    ▼
Validation
    │
    ▼
Position Book
```

This is particularly useful during **implementation, onboarding, testing, or where a source system integration isn't available yet**.

---

# The important part: validation happens BEFORE it becomes the position book

I wouldn't let raw data immediately become an ALM position.

For example:

```text
Raw Flexcube Data
       ↓
   INGESTION
       ↓
   VALIDATION
       ↓
 ┌─────┴─────┐
 │           │
FAIL        PASS
 │           │
 ▼           ▼
Exception   Position
Queue       Book
             │
             ▼
       ALM Calculations
```

The proposed solution includes validation checks such as:

* Completeness
* Duplicate detection
* Referential integrity
* Range checks
* Cross-field consistency
* Data-quality exceptions

So if an account has:

> `maturityDate = NULL`

but the product requires a maturity date, the system shouldn't silently calculate with it. It should be flagged for resolution.

---

# And this is where Affiliate Management connects

Remember the affiliate structure we discussed?

Suppose the administrator creates:

**Ecobank Ghana**

The administrator configures:

```text
Ecobank Ghana
│
├── Legal Entity Code
├── Currency
├── Data Sources
│     ├── Flexcube
│     └── Calypso
│
├── Data Mapping
│
└── ALM Configuration
```

Then when data arrives, the system knows:

> **These positions belong to Ecobank Ghana.**

The `legalEntityCode` in the position record can help establish that relationship.

So you could have:

```text
                 ECOBANK GROUP
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Ghana        Nigeria      Côte d'Ivoire
          │            │            │
          ▼            ▼            ▼
      Position      Position      Position
        Book           Book          Book
          │            │            │
          └────────────┼────────────┘
                       ▼
              GROUP CONSOLIDATION
```

---

## One thing I would add to the PRD

I would make **Position Book Management** a distinct module rather than hiding it inside Data Management.

The user flow becomes:

**Affiliate → Data Sources → Ingestion → Validation → Position Book → ALM Run**

And the Position Book screen should allow the user to see:

**Position Book**

* Affiliate
* As-of date
* Number of positions
* Total balance
* Currencies
* Data status
* Source
* Last ingestion
* Validation status

Then:

**View Positions → Filter → Drill Down → Trace to Source**

That last piece is important because the proposal emphasizes **data lineage from source through processing to output**.

### In simple terms

The answer to **"Where does the position book come from?"** is:

> **The affiliate's underlying banking/treasury source systems provide the raw positions. The ALM platform ingests and validates those positions, transforms them into a standardized ALM position structure, and stores that validated dataset as the Position Book.**

So the **Position Book is an output of the data-ingestion and validation process**, not something the ALM analyst should manually type in.

Yes. The key is to understand that **data mapping sits between the raw affiliate data and the standardized ALM data model**. It is what allows Flexcube, Calypso, Excel files, etc. to all feed the same ALM engines.

Based on the solution documents, the overall concept is:

```text
SOURCE SYSTEMS
Flexcube / Calypso / Files / Market Data
                 │
                 ▼
          DATA INGESTION
                 │
                 ▼
          DATA MAPPING  ◄──── Configuration
                 │
                 ▼
       STANDARD ALM DATA MODEL
                 │
                 ▼
          DATA VALIDATION
                 │
          ┌──────┴──────┐
          │             │
        FAIL           PASS
          │             │
          ▼             ▼
     Exception       POSITION BOOK
       Queue              │
                          ▼
                    ALM CALCULATION
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
         Liquidity      IRRBB          FTP
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                   Risk / Reporting
```

The important distinction is:

> **Mapping does not calculate risk. Mapping converts source data into the structure that the ALM system understands.**

---

# 1. What exactly is being mapped?

Imagine Ecobank Ghana's source system gives you:

```text
ACCT_NO
PROD_CODE
CCY
BALANCE
MAT_DT
RATE
BR_CODE
```

But your ALM platform expects:

```text
accountNumber
productClass
currency
amount
maturityDate
interestRatePct
branchCode
```

The mapping says:

| Source field | ALM field         | Transformation        |
| ------------ | ----------------- | --------------------- |
| `ACCT_NO`    | `accountNumber`   | Direct                |
| `PROD_CODE`  | `productClass`    | Lookup                |
| `CCY`        | `currency`        | Code conversion       |
| `BALANCE`    | `amount`          | Numeric conversion    |
| `MAT_DT`     | `maturityDate`    | Date conversion       |
| `RATE`       | `interestRatePct` | Percentage conversion |
| `BR_CODE`    | `branchCode`      | Direct                |

So:

```text
ACCT_NO ───────────────► accountNumber
CCY ───────────────────► currency
BALANCE ───────────────► amount
MAT_DT ────────────────► maturityDate
```

But some mappings are more complicated.

---

# 2. There are different types of mapping

I would design the mapping framework around roughly **five types**.

## A. Direct mapping

The source field already means exactly the same thing.

```text
Source: ACCOUNT_NO
       ↓
ALM: accountNumber
```

No transformation required.

---

## B. Code/value mapping

This is very common.

Suppose the source system says:

```text
PROD_CODE = SAV
```

But ALM needs:

```text
productClass = Savings Deposit
```

You need a reference table:

| Source value | ALM value           |
| ------------ | ------------------- |
| SAV          | Savings Deposit     |
| CUR          | Current Account     |
| TML          | Term Loan           |
| GOV          | Government Security |

So the mapping engine performs:

```text
SAV
 ↓
Lookup
 ↓
Savings Deposit
```

---

# 3. Account/product classification mapping

This becomes particularly important for ALM.

The source system may simply identify an account as:

> `GL/Product Code 410203`

But ALM needs to understand its **risk characteristics**.

For example:

```text
Source Product
      ↓
Product Mapping
      ↓
ALM Product Class
      ↓
Risk Attributes
```

Which can eventually support things like:

* Deposit vs loan
* Asset vs liability
* Rate-sensitive vs non-rate-sensitive
* HQLA classification
* LCR cash-flow role
* ASF factor
* RSF factor
* Behavioural treatment

**Important:** the exact mapping rules for these classifications are **not fully specified in the source documents**. The documents establish that data mapping/configuration and validation are required, but they don't provide a complete Ecobank field-by-field mapping specification.

So in the PRD I would mark these as:

> **Mapping rules to be defined during data discovery/source-system mapping workshops.**

---

# 4. Derived fields

Some ALM fields might not exist directly in the source.

For example, you may receive:

```text
amount
maturityDate
asOfDate
```

and derive:

```text
remainingMaturity
```

Conceptually:

```text
maturityDate - asOfDate
        ↓
Remaining maturity
        ↓
Maturity bucket
```

Then:

```text
0–1 month
1–3 months
3–6 months
6–12 months
1–2 years
...
```

However, don't automatically assume every derived field should be created during mapping.

A good architecture distinguishes:

**Mapping/transformation**

from

**ALM calculation logic.**

For example:

```text
SOURCE
  ↓
Mapping
  ↓
Standard Position
  ↓
ALM Calculation
  ↓
Maturity Gap
```

The **maturity gap calculation belongs to the ALM engine**, not necessarily the mapping layer.

---

# 5. Where does the mapping happen?

This is the part that is often confusing.

I would create a dedicated **Data Mapping / Data Configuration area**.

Not something the Risk Analyst uses every day.

The typical flow would be:

### Administrator / Data Administrator

```text
Administration
      ↓
Data Management
      ↓
Data Sources
      ↓
Data Mapping
```

Then they select:

> **Affiliate: Ecobank Ghana**

> **Source: Flexcube**

> **Data Type: Positions**

And configure:

```text
Source Field        Target Field
----------------------------------
ACCT_NO             accountNumber
PROD_CODE            productClass
CCY                 currency
BALANCE             amount
MAT_DT              maturityDate
RATE                 interestRatePct
BR_CODE             branchCode
```

---

# 6. But mapping shouldn't be repeated for every run

This is important.

You configure the mapping **once**, then reuse it.

For example:

```text
                  CONFIGURATION
                       │
                 Data Mapping
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
          Ghana      Nigeria   Togo
          Flexcube   Flexcube  Flexcube
             │         │         │
             ▼         ▼         ▼
          Mapping   Mapping   Mapping
             │         │         │
             └─────────┼─────────┘
                       ▼
                  ALM STANDARD
```

If the source structure doesn't change, you shouldn't need to remap it every day.

---

# 7. This is where Affiliate Management becomes important

Remember our previous discussion.

When you create an affiliate:

> **Ecobank Ghana**

you also establish its data environment.

For example:

```text
ECOBANK GHANA
│
├── Data Sources
│     ├── Flexcube
│     ├── Calypso
│     └── File Upload
│
├── Data Mapping
│     ├── Position Mapping
│     ├── GL Mapping
│     └── Reference Data Mapping
│
└── ALM Configuration
      ├── Limits
      ├── Behavioural Rules
      ├── FTP Rules
      └── Stress Scenarios
```

So **Affiliate Management tells the system which mapping configuration applies to that affiliate.**

---

# 8. Where does the GL Trial Balance fit?

This is another important mapping.

Your GL data might arrive as:

```text
glAccountCode
orgUnitCode
currency
endingBalance
drCr
asOfDate
```

The ALM platform needs to understand how these fields relate to the standardized data model.

For example:

```text
Source GL
   │
   ├── glAccountCode
   ├── orgUnitCode
   ├── currency
   ├── endingBalance
   └── drCr
          │
          ▼
      GL Mapping
          │
          ▼
 Standard GL Structure
          │
          ▼
GL Reconciliation
```

Then you can compare the **position book** against the **GL trial balance**.

Conceptually:

```text
                 POSITION DATA
                      │
                      ▼
                Position Book
                      │
                      │
                      ▼
                 RECONCILIATION
                      ▲
                      │
                      │
                  GL DATA
                      │
                      ▼
              GL Trial Balance
```

So mapping is what makes sure you're comparing **like-for-like data**.

---

# 9. The complete flow I would put in your PRD

I would actually structure the ALM data journey like this:

```text
                    AFFILIATE
                       │
                       ▼
                SOURCE SYSTEMS
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Flexcube       Calypso       Files/API
        │              │              │
        └──────────────┼──────────────┘
                       ▼
                1. INGESTION
                       │
                       ▼
                2. RAW DATA
                       │
                       ▼
                3. DATA MAPPING
                       │
              ┌────────┴────────┐
              ▼                 ▼
        Field Mapping      Transformations
              │                 │
              └────────┬────────┘
                       ▼
              4. STANDARD ALM DATA
                       │
                       ▼
                5. VALIDATION
                       │
                ┌──────┴──────┐
                ▼             ▼
              FAIL           PASS
                │             │
                ▼             ▼
          EXCEPTION QUEUE   POSITION BOOK
                │             │
                │             ▼
                │       GL RECONCILIATION
                │             │
                └──────►      ▼
                         6. ALM RUN
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
          Liquidity          IRRBB             FTP
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                     7. RISK MONITORING
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                   Normal            Breach
                     │                 │
                     ▼                 ▼
                  Reporting       Escalation
                                         │
                                         ▼
                                  Remediation
```

---

# 10. The UI should therefore have TWO different places

This is an important design decision for your PRD.

### **A. Data Mapping - Configuration**

Used by:

* Data Administrator
* System Administrator
* Implementation team

They configure:

> "How does Ghana's Flexcube data translate into our ALM data model?"

---

### **B. Position Book - Operations**

Used by:

* Risk Analyst
* Treasury
* Reporting User
* Control/Test users

They see:

> "What positions did we receive for Ghana on 31 August?"

They **shouldn't normally be configuring mappings here.**

---

# 11. And the mapping configuration needs versioning

This is especially important for an auditable ALM system.

Suppose:

**Mapping Version 1**

was used in August.

Then someone changes the product classification in September.

You don't want August's historical ALM result to suddenly change because the mapping was edited.

So:

```text
Mapping V1
   │
   ├── Aug 2026 runs
   │
   └── Locked

Mapping V2
   │
   └── Sep 2026 onwards
```

Every ALM Run should therefore record:

```text
Run ID
Affiliate
As-of Date
Data Source
Data Version
Mapping Version
Configuration Version
Calculation Version
Results
```

This gives you the audit trail:

> **"Exactly what data and rules produced this number?"**

---

## The simplest way to explain this when you're presenting

If someone asks you **"What is data mapping?"**, say:

> **"Data mapping is the translation layer between each affiliate's source systems and our standardized ALM data model. Each affiliate may provide data using different field names, codes, formats and classifications. We configure those mappings so that, once ingested and validated, all positions are represented consistently in the ALM position book and can then be processed by the liquidity, IRRBB, FTP and other engines."**

And the one-line architecture is:

**Source Systems → Ingestion → Mapping → Standard ALM Data → Validation → Position Book → ALM Engines → Risk & Reporting**

That is where **data mapping fits into the overall system**.


The **position book should generally not be manually created inside the ALM system**. It should be **fed into the platform from the affiliate’s source systems**, then validated and stored as the ALM position book.

Based on the solution documents we’ve been using, the flow would be:

```text
AFFILIATE
   │
   ▼
SOURCE SYSTEMS
   │
   ├── Core Banking / Flexcube
   ├── Treasury / Calypso
   ├── Market Data
   └── Files (CSV / Excel / XML / JSON)
   │
   ▼
DATA INGESTION
   │
   ▼
DATA VALIDATION
   │
   ├── ❌ Errors → Exception Queue → Correct → Re-submit
   │
   └── ✅ Passed
          │
          ▼
     POSITION STORE
          │
          ▼
       ALM ENGINES
```

### So what exactly is the "Position Book"?

Think of it as the **ALM-ready inventory of the bank's financial positions at a particular point in time**.

For example:

| Account | Product | Currency | Amount | Maturity   | Repricing  | Rate |
| ------- | ------- | -------- | -----: | ---------- | ---------- | ---: |
| 001234  | Loan    | GHS      |    50M | 2030-05-10 | 2027-05-10 |  15% |
| 005678  | Deposit | GHS      |    20M | 2027-01-15 | 2027-01-15 |   8% |
| 009876  | Bond    | USD      |    10M | 2028-09-20 | -          |   5% |

Your position data model already contains fields such as:

`accountNumber`, `accountClass`, `branchCode`, `productClass`, `currency`, `amount`, `maturityDate`, `nextRepricingDate`, `behaviouralTag`, `rateType`, `interestRatePct`, `hqlaLevel`, `lcrCashflowRole`, `asfFactorPct`, `rsfFactorPct`, `irrbbRateSensitive`, and `approxDurationYears`.

Those fields are what allow the different ALM engines to use the same underlying position data.

---

## How would Ecobank actually get it?

There are **two main routes** in the proposed solution.

### 1. Automated source-system integration

For an affiliate such as Ghana:

```text
Flexcube / Calypso
       │
       ▼
Integration Adapter
       │
       ▼
ALM Data Ingestion
       │
       ▼
Validation
       │
       ▼
Position Book
```

The proposal specifically identifies integrations with **Flexcube, Calypso, Bloomberg/Reuters**, as well as file-based inputs such as CSV, XML, JSON and Excel.

So the preferred production model would be **automated ingestion from the affiliate's source systems**.

---

### 2. File upload

For an affiliate that isn't yet integrated:

```text
Affiliate
    │
    ▼
Export Position Data
    │
    ▼
CSV / Excel / XML / JSON
    │
    ▼
Upload to ALM
    │
    ▼
Field Mapping
    │
    ▼
Validation
    │
    ▼
Position Book
```

This is particularly useful during **implementation, onboarding, testing, or where a source system integration isn't available yet**.

---

# The important part: validation happens BEFORE it becomes the position book

I wouldn't let raw data immediately become an ALM position.

For example:

```text
Raw Flexcube Data
       ↓
   INGESTION
       ↓
   VALIDATION
       ↓
 ┌─────┴─────┐
 │           │
FAIL        PASS
 │           │
 ▼           ▼
Exception   Position
Queue       Book
             │
             ▼
       ALM Calculations
```

The proposed solution includes validation checks such as:

* Completeness
* Duplicate detection
* Referential integrity
* Range checks
* Cross-field consistency
* Data-quality exceptions

So if an account has:

> `maturityDate = NULL`

but the product requires a maturity date, the system shouldn't silently calculate with it. It should be flagged for resolution.

---

# And this is where Affiliate Management connects

Remember the affiliate structure we discussed?

Suppose the administrator creates:

**Ecobank Ghana**

The administrator configures:

```text
Ecobank Ghana
│
├── Legal Entity Code
├── Currency
├── Data Sources
│     ├── Flexcube
│     └── Calypso
│
├── Data Mapping
│
└── ALM Configuration
```

Then when data arrives, the system knows:

> **These positions belong to Ecobank Ghana.**

The `legalEntityCode` in the position record can help establish that relationship.

So you could have:

```text
                 ECOBANK GROUP
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Ghana        Nigeria      Côte d'Ivoire
          │            │            │
          ▼            ▼            ▼
      Position      Position      Position
        Book           Book          Book
          │            │            │
          └────────────┼────────────┘
                       ▼
              GROUP CONSOLIDATION
```

---

## One thing I would add to the PRD

I would make **Position Book Management** a distinct module rather than hiding it inside Data Management.

The user flow becomes:

**Affiliate → Data Sources → Ingestion → Validation → Position Book → ALM Run**

And the Position Book screen should allow the user to see:

**Position Book**

* Affiliate
* As-of date
* Number of positions
* Total balance
* Currencies
* Data status
* Source
* Last ingestion
* Validation status

Then:

**View Positions → Filter → Drill Down → Trace to Source**

That last piece is important because the proposal emphasizes **data lineage from source through processing to output**.

### In simple terms

The answer to **"Where does the position book come from?"** is:

> **The affiliate's underlying banking/treasury source systems provide the raw positions. The ALM platform ingests and validates those positions, transforms them into a standardized ALM position structure, and stores that validated dataset as the Position Book.**

So the **Position Book is an output of the data-ingestion and validation process**, not something the ALM analyst should manually type in.


Exactly - **this is the right question**, because saying “the position book comes from Flexcube” is an oversimplification.

A bank's financial position is **distributed across multiple source systems**. The ALM platform doesn't simply copy one position book. It needs to **assemble a unified ALM view from multiple systems and reference structures**.

The way I would think about it is:

> **ALM is the consumer of a standardized financial position model. The source systems remain the systems of record.**

### 1. Think of the source landscape first

A simplified bank environment might look like:

```text
                    BANK
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
   CORE BANKING   TREASURY       OTHER
   / FLEXCUBE     / CALYPSO      SYSTEMS
       │             │             │
       │             │             ├── Counterparty data
       │             │             ├── Customer data
       │             │             └── Reference data
       │             │
       └─────────────┼─────────────┘
                     ▼
                ALM PLATFORM
```

And then you have **GL / Chart of Accounts** sitting across the accounting landscape.

The important thing is that these aren't necessarily separate "positions." They are **different representations and attributes of the bank's financial activity**.

---

# 2. The ALM platform needs a canonical model

This is the concept that makes everything click.

You don't want:

```text
Flexcube → ALM
Calypso → ALM
GL → ALM
Counterparty → ALM
```

as completely independent structures.

Instead, create a **Canonical ALM Data Model**.

Think of it as the ALM platform's common language.

```text
Flexcube ──────┐
               │
Calypso ───────┤
               │
GL ────────────┤
               ├──► CANONICAL ALM MODEL
Counterparty ──┤
               │
Market Data ───┘
```

Then every ALM engine speaks this common language.

---

# 3. So what is actually being mapped?

There are really **three different mapping problems**.

## A. Structural mapping

"What does this source field mean?"

Example:

```text
Flexcube:
ACCT_NO

       ↓ mapping

ALM:
accountNumber
```

That's straightforward.

---

## B. Reference/master-data mapping

This is where your **Chart of Accounts, product codes, currencies, branches, counterparties, etc.** come in.

Suppose Flexcube says:

```text
Product Code = 10045
```

The ALM platform doesn't necessarily know what 10045 means.

So you maintain a reference mapping:

```text
Source Product Code
        ↓
10045
        ↓
ALM Product
        ↓
Corporate Term Loan
```

Similarly:

```text
Source GL Account
        ↓
410203
        ↓
ALM GL Classification
        ↓
Loans & Advances
```

This is not merely field mapping.

It's **semantic mapping**.

You're telling ALM:

> "This thing in the source system represents this business/risk concept in ALM."

---

# 4. Chart of Accounts is particularly important

Think about the **Chart of Accounts (CoA)** as the bank's accounting classification system.

You might have:

```text
100000–199999     Assets
200000–299999     Liabilities
300000–399999     Equity
400000–499999     Income
500000–599999     Expenses
```

The exact structure would obviously depend on the bank.

The ALM system doesn't necessarily replace the bank's CoA.

Instead, you create a mapping between:

**Bank's CoA → ALM classification**

For example:

```text
GL Account       ALM Classification
------------------------------------
110203           Cash
120405           Government Securities
130501           Corporate Loans
210301           Current Deposits
220405           Term Deposits
```

Now ALM can understand:

> "This GL account represents a liability/deposit."

That classification can then feed the appropriate ALM treatment.

**The exact CoA mapping is institution-specific and would need to be defined during implementation. It is not provided in the source documents.**

---

# 5. Now consider counterparties

Counterparty is slightly different.

Suppose Calypso gives you:

```text
Counterparty ID = CP00125
```

But another system identifies the same institution as:

```text
Institution Code = BANK-007
```

You don't want ALM to think they're two different counterparties.

So you need a **Counterparty Master / Cross-reference**.

```text
                  COUNTERPARTY MASTER
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
        Calypso ID              Other System ID
         CP00125                  BANK-007
             │                       │
             └───────────┬───────────┘
                         ▼
                 ALM Counterparty
                    BANK ABC
```

Then the ALM platform can aggregate exposure correctly.

For example:

> How much exposure does the Group have to Bank ABC?

It shouldn't matter whether that exposure originated in Flexcube, Calypso, or another source.

---

# 6. This means you need master/reference data

This is the missing layer in the previous explanation.

I'd put it explicitly in the architecture:

```text
                         ALM PLATFORM
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
 SOURCE DATA            MASTER DATA           CONFIGURATION
       │                      │                      │
       │                 ┌────┼────┐          ┌──────┼─────┐
       │                 │    │    │          │      │     │
       │                CoA Product Counterparty Limits FTP
       │                │    │    │
       │                Currency Branch
       │
       ▼
  DATA MAPPING
       │
       ▼
 CANONICAL ALM MODEL
       │
       ▼
 POSITION BOOK
       │
       ▼
 ALM ENGINES
```

This is much closer to how I would design the actual system.

---

# 7. Then what IS the Position Book?

This is the part that usually causes confusion.

The Position Book is **not necessarily a copy of any one source system**.

It is the **ALM-normalized representation of financial positions assembled from the relevant source data**.

For example:

### Flexcube provides

```text
Account
Balance
Product
Customer
Branch
Currency
Rate
Maturity
```

### Calypso provides

```text
Trade
Instrument
Counterparty
Notional
Market value
Maturity
Rate
```

### Reference data provides

```text
Product classification
GL classification
Counterparty identity
Currency
Organizational hierarchy
```

### ALM combines them

```text
              SOURCE DATA
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    Flexcube    Calypso      GL
        │          │          │
        └──────────┼──────────┘
                   ▼
             DATA MAPPING
                   │
                   ▼
          MASTER DATA LOOKUPS
                   │
                   ▼
          CANONICAL POSITION
                   │
                   ▼
             POSITION BOOK
```

---

# 8. Here's a concrete example

Imagine the bank has a corporate loan.

Flexcube says:

```text
Account:       123456
Product:       LN_CORP
Balance:       50,000,000
Currency:      GHS
Rate:          15%
Maturity:      2030-05-10
Branch:        025
GL:            130501
```

Now the ALM system needs to understand what all of that means.

### Mapping layer

```text
LN_CORP
   ↓
Corporate Loan

130501
   ↓
Loans & Advances

025
   ↓
Accra Branch

GHS
   ↓
Ghanaian Cedi
```

Then the standardized ALM position becomes something like:

```text
Position
────────────────────────
Account Number       123456
Affiliate            GH
Branch               025
Product Class        Corporate Loan
GL Class             Loans & Advances
Currency             GHS
Amount               50M
Interest Rate        15%
Maturity Date        2030-05-10
```

Now the ALM engines can consume it.

---

# 9. But notice something important

**Not everything becomes a position.**

This is crucial.

You shouldn't try to shove your entire Chart of Accounts or entire Counterparty Master into the Position Book.

Instead:

### Position

The financial instrument/exposure.

### Account

The accounting/customer account associated with it.

### Product

What type of financial product it is.

### GL

How it is represented in accounting.

### Counterparty

Who the bank has exposure to / who the transaction involves.

### Affiliate

Which legal entity owns the position.

### Reference data

Provides the classifications that allow ALM to interpret the position.

So conceptually:

```text
                    POSITION
                       │
       ┌───────────────┼────────────────┐
       ▼               ▼                ▼
     Account         Product        Counterparty
       │               │                │
       ▼               ▼                ▼
      GL            Classification    Master ID
       │
       ▼
  Chart of Accounts
```

The Position Book **references these things** rather than duplicating them unnecessarily.

---

# 10. Now add the Affiliate

This makes the architecture even more interesting.

Imagine:

```text
Ghana Flexcube
Nigeria Flexcube
Ghana Calypso
Nigeria Calypso
Ghana GL
Nigeria GL
```

They may all have different codes.

So:

```text
GH Flexcube ───┐
GH Calypso ────┤
GH GL ─────────┤
               │
               ▼
          GH MAPPING
               │
               ▼
         ALM CANONICAL MODEL
               │
               ▼
          GH POSITION BOOK
```

and:

```text
NG Flexcube ───┐
NG Calypso ────┤
NG GL ─────────┤
               │
               ▼
          NG MAPPING
               │
               ▼
         ALM CANONICAL MODEL
               │
               ▼
          NG POSITION BOOK
```

Then:

```text
GH Position Book ───┐
                    ├──► GROUP ALM VIEW
NG Position Book ───┤
                    │
Other Affiliates ───┘
```

That's how you get **affiliate-level and Group-level ALM** without forcing all affiliates to use the same source systems.

---

# 11. So I would change the PRD architecture

Instead of just:

**Sources → Mapping → Position Book**

I would define **four layers**:

### Layer 1 - Source Systems

Where the original information lives.

* Core banking
* Treasury
* GL
* Market data
* Files/API sources

### Layer 2 - Integration & Mapping

Where you:

* Ingest
* Transform
* Map fields
* Map codes
* Standardize formats
* Resolve source identifiers

### Layer 3 - ALM Data Foundation

Where you maintain:

* Canonical positions
* GL/account relationships
* Product master
* Counterparty master
* Currency/reference data
* Affiliate/legal entity
* Data lineage
* Data quality status

### Layer 4 - ALM Engines

Which consume the standardized data:

* Liquidity
* IRRBB
* FTP
* Behavioural
* Stress Testing
* Limits/KRIs
* Reporting

So:

```text
┌──────────────────────────────────────────────────────────┐
│                    SOURCE SYSTEMS                         │
│                                                          │
│ Flexcube │ Calypso │ GL │ Market Data │ Files/APIs       │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              INTEGRATION & MAPPING LAYER                 │
│                                                          │
│ Ingestion │ Field Mapping │ Code Mapping │ Transformation│
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                 ALM DATA FOUNDATION                      │
│                                                          │
│ Position Book │ CoA │ Products │ Counterparties          │
│ Affiliates │ Reference Data │ Data Lineage │ GL          │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│                     ALM ENGINES                           │
│                                                          │
│ Liquidity │ IRRBB │ FTP │ Behavioural │ Stress Testing  │
└─────────────────────────┬────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│              RISK / MONITORING / REPORTING               │
└──────────────────────────────────────────────────────────┘
```

## And this is the key mental model

Don't think:

> **"How do I put Flexcube + GL + Calypso into one position book?"**

Think:

> **"How do I create a common ALM language that allows positions originating from different systems to be consistently identified, classified, enriched and calculated?"**

That's the real purpose of **data integration + mapping + master/reference data**.

And one important caveat for your PRD: the source documents support **multi-source ingestion, validation, data mapping/transformation, position storage, lineage, and integrations with Flexcube/Calypso/Bloomberg/Reuters and file formats**, but they **do not provide the actual Ecobank Chart of Accounts mapping, counterparty cross-reference rules, or detailed source-to-target mappings**. Those would need to be defined during **data discovery and implementation workshops**, rather than invented in the PRD.
