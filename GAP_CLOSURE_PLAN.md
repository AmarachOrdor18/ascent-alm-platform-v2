# Gap Closure Plan - Ascent ALM Platform

## Executive Summary
This document outlines the gaps between the current implementation and the Ecobank ALM RFP requirements, along with a prioritized plan to address them.

---

## Part 1: UI/UX Standardization Gaps

### Current State
- CSS and core components (ModuleHeader, StatusBadge) are aligned with Ecobank branding
- New Phase 7-8 pages use custom table styling instead of standardized `.table-datagrid` classes
- Inconsistent table container and cell styling across new pages

### Required Changes

#### 1.1 Table Standardization (Priority: HIGH)
**Affected Pages:** Limits, Kri, Remediation, Approvals, RiskMap, Notifications, AlcoMeetings, RegulatoryReporting, AlcoReporting, ManagementReporting, AdHoc, AdminUsers, AdminAudit

**Changes Required:**
- Replace custom table classes with `.table-datagrid`
- Replace custom table containers with `.table-datagrid-container`
- Use `.table-frameless` for simpler tables without sticky headers
- Apply density variants (`density-compact`, `density-tall`) where appropriate
- Implement row selection with `.is-selected` class for interactive tables

**Example Transformation:**
```tsx
// BEFORE (current implementation)
<div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
  <table className="w-full border-separate border-spacing-0">
    <thead>
      <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
        <th className="py-2.5 px-3 font-bold">Column</th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-gray-50 py-3 px-3 text-[13px] text-gray-700 font-medium">
        <td>Data</td>
      </tr>
    </tbody>
  </table>
</div>

// AFTER (standardized)
<div className="table-datagrid-container">
  <table className="table-datagrid">
    <thead>
      <tr>
        <th>Column</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Estimated Effort:** 2-3 hours to update all 14 pages

#### 1.2 ModuleHeader Consistency (Priority: MEDIUM)
**Current Issue:** New pages use different ModuleHeader props than reference

**Changes Required:**
- Ensure all pages pass `asOfDate` (or `null` for config screens)
- Ensure all pages pass `scope` for affiliate context
- Remove custom metric styling that differs from reference
- Standardize metric tone prop usage

**Estimated Effort:** 1 hour

#### 1.3 Card Component Standardization (Priority: LOW)
**Current Issue:** Inconsistent card styling across pages

**Changes Required:**
- Use `.glass-card` for overlay/transparent cards
- Use standard rounded-xl instead of rounded-2xl for data cards
- Standardize shadow usage (shadow-sm for cards, shadow-md for elevated cards)

**Estimated Effort:** 1 hour

---

## Part 2: RFP Functional Gaps

### Critical Gaps (Must Address for Demo)

#### 2.1 Behavioral Modeling Enhancements (Priority: CRITICAL)
**RFP Requirement:** NMD modelling, deposit decay/stickiness, prepayments, early withdrawals, model assumptions, overrides, versioning, back-testing and governance

**Current State:**
- Basic behavioral tags exist (Stable, Less Stable, Volatile)
- Behavioral patterns configuration exists
- Audit trail provides versioning

**Gap:**
- No explicit deposit decay curves
- No prepayment rate modeling
- No override workflow with approval
- No back-testing framework

**Implementation Plan:**
1. **Deposit Decay Modeling**
   - Add decay curve configuration per product/affiliate
   - Implement decay factor calculation (e.g., 10% decay in first 30 days)
   - Add decay curve visualization in behavioral patterns screen
   - Effort: 4 hours

2. **Prepayment Modeling**
   - Add prepayment rate configuration (CPR - Constant Prepayment Rate)
   - Implement prepayment cashflow projection
   - Add prepayment sensitivity analysis
   - Effort: 3 hours

3. **Override Workflow**
   - Add override request/approval workflow
   - Integrate with existing Approvals module
   - Add override reason tracking and audit trail
   - Effort: 3 hours

4. **Back-testing Framework**
   - Add historical data comparison view
   - Implement model accuracy metrics (MAE, RMSE)
   - Add back-testing report generation
   - Effort: 4 hours

**Total Effort:** 14 hours

#### 2.2 Dynamic Balance Sheet Forecasting (Priority: CRITICAL)
**RFP Requirement:** What-if scenarios, interest-rate/FX/liquidity shocks, dynamic balance-sheet assumptions, business growth scenarios, management actions, multi-period forecasting

**Current State:**
- What-If Builder exists for ad-hoc analysis
- Stress Testing module exists
- Batch Scheduler exists

**Gap:**
- No dynamic balance sheet projection over multiple periods
- No business growth scenario modeling
- No management action impact simulation
- No multi-period forecasting (single as-of date only)

**Implementation Plan:**
1. **Multi-Period Forecasting Engine**
   - Add forecasting horizon configuration (3, 6, 12, 24 months)
   - Implement balance sheet projection logic
   - Add cashflow projection across forecast periods
   - Effort: 6 hours

2. **Business Growth Scenarios**
   - Add growth rate configuration by product category
   - Implement growth scenario templates (Conservative, Base, Aggressive)
   - Add growth scenario comparison view
   - Effort: 4 hours

3. **Management Actions Simulation**
   - Add action library (e.g., increase HQLA, reduce loan growth)
   - Implement action impact calculation
   - Add action scenario builder
   - Effort: 4 hours

4. **Forecasting Results Visualization**
   - Add multi-period trend charts
   - Implement scenario comparison tables
   - Add forecast variance analysis
   - Effort: 3 hours

**Total Effort:** 17 hours

#### 2.3 Advanced IRRBB Features (Priority: HIGH)
**RFP Requirement:** PV01, optionality, basis risk, regulatory and internal IRRBB scenarios

**Current State:**
- NII sensitivity exists
- EVE sensitivity exists
- Duration exists in position data
- Yield curve shocks exist

**Gap:**
- No explicit PV01 calculation
- No optionality modeling (caps, floors, call options)
- No basis risk modeling
- Limited scenario library

**Implementation Plan:**
1. **PV01 Calculation**
   - Add PV01 per position calculation
   - Implement portfolio-level PV01 aggregation
   - Add PV01 reporting in IRRBB module
   - Effort: 2 hours

2. **Optionality Modeling**
   - Add option type to position data (cap, floor, call, put)
   - Implement option value calculation (Black-Scholes or binomial)
   - Add optionality sensitivity analysis
   - Effort: 5 hours

3. **Basis Risk Modeling**
   - Add basis spread configuration
   - Implement basis risk scenario (parallel shift, twist)
   - Add basis risk reporting
   - Effort: 3 hours

4. **Scenario Library Expansion**
   - Add regulatory scenario templates (CBN, BoG, BCEAO)
   - Add internal scenario library
   - Implement scenario comparison
   - Effort: 3 hours

**Total Effort:** 13 hours

#### 2.4 FTP Enhancements (Priority: HIGH)
**RFP Requirement:** FTP curves, matched-maturity FTP, liquidity premiums, basis/currency adjustments, product/customer/business-unit profitability

**Current State:**
- FTP rules exist
- FTP module exists
- Product profitability exists

**Gap:**
- No explicit liquidity premium calculation
- No basis adjustment
- No currency adjustment
- No customer-level profitability
- No business-unit profitability

**Implementation Plan:**
1. **Liquidity Premium Calculation**
   - Add liquidity premium configuration by product
   - Implement premium calculation logic
   - Add premium reporting in FTP module
   - Effort: 3 hours

2. **Basis & Currency Adjustments**
   - Add basis spread configuration
   - Add currency adjustment factors
   - Implement adjustment calculation
   - Effort: 2 hours

3. **Customer & BU Profitability**
   - Add customer hierarchy configuration
   - Add business unit structure
   - Implement profitability roll-up
   - Add customer/BU profitability views
   - Effort: 6 hours

**Total Effort:** 11 hours

### Medium Priority Gaps

#### 2.5 Liquidity Ladders (Priority: MEDIUM)
**RFP Requirement:** Liquidity ladders

**Current State:** Gap analysis covers this conceptually

**Gap:** No explicit ladder visualization with cumulative cashflows

**Implementation Plan:**
- Add ladder chart visualization in Liquidity Risk module
- Implement cumulative cashflow calculation
- Add ladder report generation
- Effort: 3 hours

#### 2.6 Survival Horizon (Priority: MEDIUM)
**RFP Requirement:** Survival horizon

**Current State:** Implicit in LCR calculation

**Gap:** No explicit survival horizon analysis beyond 30-day LCR

**Implementation Plan:**
- Add survival horizon configuration (30, 60, 90, 180 days)
- Implement multi-horizon liquidity analysis
- Add survival horizon reporting
- Effort: 3 hours

### Low Priority Gaps

#### 2.7 API/Interfaces (Priority: LOW)
**RFP Requirement:** APIs/interfaces

**Current State:** Frontend-only implementation

**Gap:** No backend API documentation or interface specifications

**Implementation Plan:**
- Document API endpoints (if backend exists)
- Create API documentation
- Add integration guides
- Effort: 4 hours (documentation only)

#### 2.8 Deployment Architecture (Priority: LOW)
**RFP Requirement:** Deployment architecture

**Current State:** Frontend-only implementation

**Gap:** No architecture documentation

**Implementation Plan:**
- Create architecture diagram
- Document deployment options
- Add security and scaling recommendations
- Effort: 4 hours (documentation only)

---

## Part 3: Prioritized Implementation Timeline

### Phase 1: UI Standardization (Week 1)
- **Day 1-2:** Table standardization across all 14 new pages
- **Day 3:** ModuleHeader consistency
- **Day 4:** Card component standardization
- **Day 5:** Testing and refinement

**Deliverable:** All new pages using standardized Ecobank UI components

### Phase 2: Critical RFP Gaps (Week 2-3)
- **Week 2:**
  - Behavioral Modeling Enhancements (14 hours)
  - Dynamic Balance Sheet Forecasting (17 hours)
- **Week 3:**
  - Advanced IRRBB Features (13 hours)
  - FTP Enhancements (11 hours)

**Deliverable:** Critical RFP requirements implemented

### Phase 3: Medium Priority Gaps (Week 4)
- **Day 1-2:** Liquidity Ladders (3 hours)
- **Day 3-4:** Survival Horizon (3 hours)
- **Day 5:** Testing and refinement

**Deliverable:** Medium priority RFP requirements implemented

### Phase 4: Documentation (Week 5)
- **Day 1-2:** API/Interface documentation
- **Day 3-4:** Deployment architecture documentation
- **Day 5:** Final testing and demo preparation

**Deliverable:** Complete documentation package

---

## Part 4: Demo Strategy Recommendations

### Before the Demo (Must Complete)
1. ✅ UI Standardization (Phase 1)
2. ✅ Multi-affiliate seed data (already done)
3. ✅ Regulatory minima configuration (already done)
4. ✅ Basic limits and monitoring (already done)

### Demo Focus Areas (Address Strengths)
1. **Multi-jurisdiction capability** - Show Nigeria/Ghana/CI with different regulators
2. **Regulatory compliance** - Demonstrate CBN/BoG/BCEAO configurations
3. **End-to-end workflow** - From data ingestion to monitoring to reporting
4. **Audit trail** - Show comprehensive governance
5. **Role-based access** - Demonstrate security

### Demo Acknowledgments (Address Gaps Honestly)
1. **Behavioral Modeling** - "We use proven behavioral tags for deposit stickiness. Complex decay modeling is available as an enhancement."
2. **Dynamic Forecasting** - "Our current implementation focuses on single as-of date analysis. Multi-period forecasting is available as an enhancement."
3. **Advanced IRRBB** - "We cover NII and EVE sensitivity comprehensively. PV01 and optionality are available as enhancements."
4. **FTP** - "We have matched-maturity FTP with curves. Liquidity premiums and customer-level profitability are available as enhancements."

### Demo Script Updates
Update DEMO_SCRIPT.md to:
- Focus on strengths (multi-affiliate, regulatory compliance)
- Add acknowledgments for gaps
- Provide time estimates for enhancements
- Include roadmap slide in presentation

---

## Part 5: Resource Requirements

### Development Resources
- **Frontend Developer:** 1 FTE for 5 weeks (UI + critical features)
- **Backend Developer:** 0.5 FTE for 2 weeks (if API documentation needed)
- **QA Tester:** 0.5 FTE for 1 week (testing and validation)

### Total Effort Estimate
- **UI Standardization:** 5 hours
- **Critical RFP Gaps:** 55 hours
- **Medium Priority Gaps:** 6 hours
- **Documentation:** 8 hours
- **Testing & Refinement:** 8 hours

**Total:** ~82 hours (~2 weeks with 1 FTE, or 1 week with 2 FTE)

---

## Part 6: Risk Mitigation

### Timeline Risks
- **Risk:** Underestimation of effort for complex features
- **Mitigation:** Implement in priority order, defer non-critical features if needed

### Demo Risks
- **Risk:** Questions about missing features
- **Mitigation:** Prepare enhancement roadmap, be transparent about current vs. future capabilities

### Quality Risks
- **Risk:** Rushed implementation introduces bugs
- **Mitigation:** Allocate adequate testing time, prioritize UI standardization first

---

## Conclusion

The current implementation provides a solid foundation covering ~75-80% of RFP requirements. The primary gaps are:

1. **UI Standardization** (quick win, 5 hours) - Must do for professional demo
2. **Critical RFP Features** (55 hours) - Behavioral modeling, dynamic forecasting, advanced IRRBB, FTP enhancements
3. **Medium Priority Features** (6 hours) - Liquidity ladders, survival horizon
4. **Documentation** (8 hours) - API and architecture

**Recommendation:** Prioritize UI standardization immediately (1 day), then focus on critical RFP gaps that demonstrate the platform's advanced capabilities for the demo. Medium priority features and documentation can be addressed post-demo or presented as part of the enhancement roadmap.