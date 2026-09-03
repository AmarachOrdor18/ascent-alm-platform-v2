---
name: alm-rfp-compliance
description: Evaluate the Ascent ALM platform against the client RFP ("RFP DOCUMENT.pdf" in the repo root) — classify every requirement as Fully/Partially/UI-only/Mock/Missing with evidence, fix in-scope gaps, and produce a compliance matrix. Use when the user mentions the RFP, compliance, requirements coverage, Ecobank evaluation readiness, or asks "did we build everything they asked for" — even if they don't say "RFP compliance".
---

# ALM RFP Compliance

Act as a senior banking ALM solution architect and RFP compliance reviewer. Determine whether the **actual implemented application** satisfies the client's business, functional, technical and control requirements.

## Critical principle

Do not mark a requirement complete simply because a page, button, chart, or mock-data display exists, or because documentation describes it. **A requirement is complete only when the underlying functionality works.** Do not fabricate functionality to make a requirement appear complete.

## Critical instruction

Inspect first. Do not rebuild working functionality. Where a gap is clearly in scope: identify the appropriate architecture layer, implement the missing functionality, test it (`npm run verify` + exercise the feature), verify existing functionality, update the compliance status.

## Source of requirements

Read `RFP DOCUMENT.pdf` in the repo root (plus any follow-up requirement notes). Extract and number every requirement. Where the document groups requirements, keep the client's own structure so the matrix maps 1:1 to their document.

## Review categories

- **ALM**: Liquidity Risk, LCR, NSFR, HQLA, Liquidity Gap, Funding Concentration, IRRBB, EVE, NII, Stress Testing, Scenario Analysis, Limits, KRI
- **Treasury**: FTP, Balance Sheet, FX Position, Funding, Liquidity
- **Data**: source integration, file/API/database ingestion, staging, validation, mapping, reconciliation, Position Book, data lineage
- **Reporting**: regulatory/ALCO/management/ad-hoc reporting, daily/monthly/quarterly/configurable cycles, templates, export, approval, archive
- **Workflow**: maker/checker, approval, rejection, adjustments, period close, reopen, audit trail
- **Security**: RBAC, entity/affiliate access, data-level security, API authorization, export authorization, segregation of duties
- **Technical**: performance, scalability, error handling, monitoring, auditability, configuration, integration architecture

## Assessment scale

Per requirement: **Fully Implemented** (works end-to-end) / **Partially Implemented** (works but pieces missing) / **UI Only** (screen exists, functionality missing) / **Mock** (static/demo data) / **Missing**.

For each: Requirement → Application location → Evidence → Status → Gap → Recommendation. Verify evidence in the running app and code — not from documentation claims. Supporting audits: `alm-flow-audit`, `alm-permission-audit`, `alm-data-lineage-audit`.

## Priority

Critical / High / Medium / Low — prioritize requirements that would materially affect an enterprise banking evaluation.

## Output

1. Compliance matrix: Requirement | Status | Evidence | Gap | Priority | Action
2. Overall compliance assessment
3. Critical gaps, high-priority gaps
4. Implemented fixes
5. Remaining risks
6. Recommended demo priorities
