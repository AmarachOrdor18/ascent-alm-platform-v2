---
name: alm-flow-audit
description: End-to-end usability audit of the Ascent ALM platform — walk realistic user journeys (executive, risk, treasury, reporting, data, admin) through the running app, find broken/incomplete/disconnected workflows, and fix them. Use when the user asks to audit, test, or verify that ALM workflows actually work end-to-end, or mentions dead ends, broken flows, or "can a user actually do X" — even if they don't say "flow audit".
---

# ALM Flow Audit

Act as a senior enterprise banking product analyst, business-process analyst and QA engineer. Systematically walk the application as a real user and identify broken, incomplete, disconnected or confusing workflows. This is not a superficial UI review — a feature is complete only when the user can successfully perform the intended business process.

## Critical instruction

Before auditing: inspect the existing application, its architecture, modules, roles, data flows, workflows, integrations, calculations and reporting. **Do not assume a feature is complete because a screen exists.**

**Inspect first. Do not rebuild working functionality. Identify gaps. Reuse existing components. Fix the root cause at the correct architectural layer. Test every change.**

## How to audit

- Run the app (`npm run dev`) and walk it as a real user — use browser automation (`control-browser` / `web-gui-tester` skills) for GUI-based verification, plus code inspection for what the clicks should do.
- Login as different roles (see `src/context/AuthContext.tsx`, seeded users in `src/data/seed/`) and as different scopes (Group vs affiliate, `src/context/ScopeContext.tsx`).

## User journeys to walk

1. **Executive**: Login → Dashboard → review LCR/NSFR/IRRBB → investigate a breach → drill into driver → review report.
2. **Risk analyst**: Login → Liquidity Risk → LCR → HQLA → Net Cash Outflows → position drilldown → investigate exception → review stress scenario.
3. **Treasury**: Login → Liquidity → Funding → FX Position → Balance Sheet → FTP → analyze funding position.
4. **Reporting user**: Login → Reporting → select cycle → check data readiness → validate report → review → submit for approval → export.
5. **Data user**: Login → Data Management → select source → upload/import → validate → review exceptions → reconcile → admit.
6. **Administrator**: Login → Users/Roles → Configuration → Reference Data → Workflow → Audit Trail.

## For every journey, check

Can the user start? Is the next action obvious? Are dependencies satisfied? Does each button work? Does navigation make sense? Is feedback given? Loading/error/empty states? Permissions enforced? Does the data actually change? Does the next screen reflect the previous action? Can the user recover from errors and go back? Can the task be completed without workarounds?

## Flag

Dead ends, broken links, missing screens/actions, placeholder functionality, fake buttons, static values, disconnected modules, inconsistent workflows, missing confirmation/validation/error handling/permissions, duplicate functionality, unexpected navigation, inconsistent terminology.

## Banking process validation

Pay special attention to whether this chain is actually represented and operable in the app: Data ingestion → Validation → Reconciliation → Position Book → Calculation → Reporting → Approval → Archive.

## Fixes

When a clear issue is found: explain the problem, identify root cause, determine the appropriate layer, fix using existing architecture, test the fix (`npm run verify` + re-walk the journey), ensure nothing else breaks. **Do not patch UI symptoms when the real problem is in the data or service layer.**

## Output

Per issue: Journey / Expected behavior / Actual behavior / Gap / Severity (Critical–High–Medium–Low) / Root cause / Fix / Verification. Final report: journey coverage, critical blockers, high-priority gaps, fixed issues, remaining issues, recommended next steps. **Do not mark a journey complete simply because the relevant pages exist.**
