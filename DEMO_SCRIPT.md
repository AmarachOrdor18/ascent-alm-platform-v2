# Ascent ALM Platform - Demo Script

## Overview
This demo script walks through the key features of the Ascent ALM Platform, organized by the build phases. The demo showcases a multi-affiliate implementation across Nigeria, Ghana, and Côte d'Ivoire.

## Prerequisites
- Application running at `http://localhost:5173`
- Database seeded with Nigeria, Ghana, and Côte d'Ivoire data
- User logged in as Administrator (Adaeze Okonkwo)

---

## Phase 1: Login & Dashboard

### Step 1: Login
1. Navigate to `http://localhost:5173`
2. Enter credentials:
   - Email: `adaeze.okonkwo@ecobank.com`
   - Password: (any password - demo mode)
3. Click "Sign In"
4. Observe the Ecobank-branded login page with navy/gold color scheme

### Step 2: Dashboard Overview
1. After login, observe the main dashboard
2. Note the reorganized sidebar with new sections:
   - OVERVIEW
   - RISK MANAGEMENT
   - TREASURY
   - REPORTING
   - EXECUTION
   - DATA & CONFIGURATION
   - GROUP MANAGEMENT
   - WORKFLOW
   - ADMINISTRATION
3. Observe the collapsible sections - click on a section header to expand/collapse
4. Navigate to Dashboard to see high-level metrics

---

## Phase 2: Reference Data Management

### Step 3: Dimensions & Hierarchies
1. Navigate to **DATA & CONFIGURATION** → **Dimensions & Hierarchies**
2. Browse the dimension members for Product, Currency, Counterparty, etc.
3. Note the tabbed interface for different dimension types

### Step 4: Rate Management
1. Navigate to **DATA & CONFIGURATION** → **Interest Rates & Curves**
2. View the yield curves for different currencies (USD, NGN, GHS, XOF)
3. Navigate to **Currency & FX Rates** to see FX rate setup
4. Navigate to **Economic Indicators** to view GDP, inflation data

---

## Phase 3: Affiliate Management

### Step 5: Affiliate Overview
1. Navigate to **GROUP MANAGEMENT** → **Affiliates**
2. Observe the three affiliates:
   - **Ecobank Nigeria** (NG) - Status: Live
   - **Ecobank Ghana** (GH) - Status: Live
   - **Ecobank Côte d'Ivoire** (CI) - Status: Live
3. Note the different regulator assignments (CBN, Bank of Ghana, BCEAO)

### Step 6: Onboard New Affiliate
1. Click **Onboard Affiliate** in the sidebar
2. Fill in the onboarding form for a new affiliate (e.g., Senegal)
3. Select regulator: BCEAO
4. Select regulatory minima for LCR/NSFR
5. Save the affiliate configuration

---

## Phase 4: Business Rules Configuration

### Step 7: Time Bucket Rules
1. Navigate to **DATA & CONFIGURATION** → **Business Rules**
2. View the time bucket configuration for liquidity gap analysis
3. Note the standard Basel III buckets (0-30D, 30-90D, etc.)

### Step 8: Product Characteristics
1. Navigate to **Business Rules** → **Product Characteristics**
2. View product-level rules for LCR cashflow roles, ASF/RSF factors
3. Note the behavioral tags (Stable, Less Stable, Volatile)

---

## Phase 5: Execution

### Step 9: Process Run
1. Navigate to **EXECUTION** → **Process Run**
2. Select affiliate: Ecobank Nigeria
3. Select as-of date: 2026-07-31
4. Click "Run Process"
5. Observe the process status and completion

### Step 10: Run History
1. Navigate to **EXECUTION** → **Run History**
2. View the list of completed runs
3. Click on a run to view details

---

## Phase 6: Results & Analysis

### Step 11: Liquidity Risk
1. Navigate to **RISK MANAGEMENT** → **Liquidity Risk**
2. View the LCR calculation for Nigeria
3. Note the gap analysis by time bucket
4. Switch affiliate to Ghana and compare results

### Step 12: Interest Rate Risk (IRRBB)
1. Navigate to **RISK MANAGEMENT** → **Interest Rate Risk (IRRBB)**
2. View the NII and EVE sensitivity analysis
3. Note the repricing gap visualization

### Step 13: Balance Sheet
1. Navigate to **TREASURY** → **Balance Sheet**
2. View the consolidated balance sheet across affiliates
3. Drill down to individual affiliate balance sheets

---

## Phase 7: Monitoring & Control

### Step 14: Limits & Breaches
1. Navigate to **RISK MANAGEMENT** → **Limits & Breaches**
2. View the limit utilization for all affiliates
3. Note the breach indicators (red for breach, amber for warning)
4. Observe the regulatory minima by jurisdiction

### Step 15: Key Risk Indicators (KRI)
1. Navigate to **RISK MANAGEMENT** → **Key Risk Indicators**
2. View the KRI dashboard with trend analysis
3. Note the sparkline charts showing metric trends
4. Observe the Red/Amber/Green status indicators

### Step 16: Control Remediation
1. Navigate to **WORKFLOW** → **Control Remediation**
2. View the remediation issues list
3. Click on an issue to view the stage tracker
4. Note the lifecycle stages: Identified → Assessment → Action Plan → Implementation → Verification → Closed

### Step 17: Approvals
1. Navigate to **WORKFLOW** → **Approvals**
2. View pending approvals
3. Note the approval types: Affiliate Activation, Rule Change, Remediation Closure
4. Click "Approve" or "Reject" on pending items

### Step 18: Liquidity Risk Map
1. Navigate to **RISK MANAGEMENT** → **Liquidity Risk Map**
2. View the affiliate risk matrix (LCR vs Concentration)
3. Note the color-coded risk levels (High/Medium/Low)
4. Hover over points to see affiliate details

### Step 19: Notifications
1. Navigate to **WORKFLOW** → **Notifications**
2. View the notification feed
3. Filter by type: Breaches, Approvals, Audit, System
4. Note the priority indicators and time stamps

---

## Phase 8: Reporting & Administration

### Step 20: ALCO Meetings
1. Navigate to **REPORTING** → **ALCO Meetings**
2. View upcoming and historical ALCO meetings
3. Click on a meeting to view agenda, decisions, and action items
4. View the standard agenda template

### Step 21: Regulatory Reporting
1. Navigate to **REPORTING** → **Regulatory Reporting**
2. Filter by jurisdiction: CBN, Bank of Ghana, BCEAO
3. View regulatory return status (Draft, Submitted, Accepted)
4. Generate a new regulatory return

### Step 22: ALCO Reporting
1. Navigate to **REPORTING** → **ALCO Reporting**
2. Generate a new ALCO pack for the upcoming meeting
3. Select reporting period and affiliate scope
4. Export the pack as PDF

### Step 23: Management Reporting
1. Navigate to **REPORTING** → **Management Reporting**
2. View available report types: Weekly Dashboard, Executive Summary, Trend Analysis
3. Generate a weekly management dashboard
4. Export the report

### Step 24: Ad-Hoc Analysis
1. Navigate to **REPORTING** → **Ad-Hoc Analysis**
2. Select metrics: LCR, NSFR, NII Sensitivity
3. Select affiliates: Nigeria, Ghana, Côte d'Ivoire
4. Choose reporting currency: USD
5. Run the analysis and view results

### Step 25: User Management
1. Navigate to **ADMINISTRATION** → **Users, Roles & Permissions**
2. View the user directory
3. Note the role assignments: ADMIN, RISK_ANALYST, TREASURY_USER, etc.
4. View the role definitions and permission matrix

### Step 26: System Preferences
1. Navigate to **ADMINISTRATION** → **System Preferences**
2. View system configuration settings
3. Modify settings as needed (e.g., session timeout, notification preferences)
4. Save changes

### Step 27: Audit Log
1. Navigate to **ADMINISTRATION** → **Audit Log**
2. View the comprehensive audit trail
3. Filter by event type: Configuration, Data Operations, User Activity
4. Export the audit log

---

## Phase 9: Multi-Affiliate Demo

### Step 28: Affiliate Comparison
1. Navigate to **TREASURY** → **Balance Sheet**
2. Switch between Nigeria, Ghana, and Côte d'Ivoire
3. Compare LCR, NSFR, and other metrics across affiliates
4. Note the different currencies (NGN, GHS, XOF)

### Step 29: Group Consolidation
1. Navigate to **Dashboard**
2. Select scope: "Ecobank Group"
3. View consolidated metrics across all affiliates
4. Note the FX conversion to base currency (USD)

### Step 30: Regulatory Comparison
1. Navigate to **RISK MANAGEMENT** → **Limits & Breaches**
2. Compare regulatory minima across jurisdictions
3. Note the different LCR/NSFR floors (CBN: 100%/100%, BoG: 100%/100%, BCEAO: 100%/100%)

---

## Key Demo Takeaways

1. **Multi-Affiliate Support**: The platform seamlessly handles multiple affiliates with different currencies, regulators, and regulatory requirements.

2. **Regulatory Compliance**: Built-in regulatory minima for CBN (Nigeria), Bank of Ghana, and BCEAO (Côte d'Ivoire) ensure compliance with local regulations.

3. **Real-Time Monitoring**: Limits & Breaches, KRI, and Risk Map provide real-time visibility into risk positions across the group.

4. **Workflow Automation**: Approvals, Remediation, and Notifications provide automated workflow for risk management processes.

5. **Comprehensive Reporting**: ALCO Reporting, Regulatory Reporting, and Management Reporting provide flexible reporting capabilities.

6. **Audit Trail**: Comprehensive audit log tracks all configuration changes, data operations, and user activities.

7. **UX Best Practices**: Reorganized sidebar follows SaaS conventions with clear sectioning and collapsible navigation.

8. **Ecobank Branding**: Navy and gold color scheme aligns with Ecobank corporate identity.

---

## Demo Reset

To reset the demo to initial state:
1. Navigate to **ADMINISTRATION** → **System Preferences**
2. Click "Reset Demo Data" (if available)
3. Or clear browser data and reload the application

---

## Contact

For questions or issues with the demo, contact:
- Ascent ALM Platform Team
- Email: support@ascent-alm.com