---
name: alm-workflow-controls
description: Implement banking-grade maker/checker, approvals, period close/reopen, audit trail, exception management, reconciliation controls and segregation of duties for the Ascent ALM platform. Use whenever the user mentions approvals, maker/checker, period close, audit trail, exceptions, segregation of duties, submission, or operational controls — even if they don't say "workflow".
---

# ALM Workflow & Controls

Ensure ALM processes are **controlled, auditable and reproducible**. Assumes the canonical architecture from `alm-product-architecture`. Start from `src/pages/Approvals.tsx`, `src/lib/governanceHooks.ts`, `src/context/AuthContext.tsx` (roles), and `src/pages/AdminAudit.tsx` — reuse existing RBAC and audit infrastructure wherever possible.

## Maker/checker

Maker → Submit → Checker → Approve/Reject. Apply to: data admission, reference-data changes, regulatory rules, adjustments, reports, period close. **A maker must not be able to approve their own submission** (segregation of duties).

## Reporting cycle

Open → Data Collection → Validation → Reconciliation → Calculation → Review → Approval → Close → Archive.

## Period close

A reporting period supports: reporting date, cut-off, data completeness, validation, reconciliation, calculation, approval, close, and reopen **with authorization**. Reopening a closed period is a privileged, audited action.

## Audit trail

Track: user, role, action, timestamp, object, previous value, new value, reason, approval status. Security-sensitive actions must be logged.

## Exceptions

An exception management model covering: failed feeds, data-quality issues, reconciliation breaks, calculation failures, report-validation failures, approval rejections. Exceptions are actionable (assign, resolve, escalate) — not just log lines. See `src/pages/Remediation.tsx` and `src/pages/Notifications.tsx`.

## Reconciliation controls

Support controls between Source → Position Book → ALM Calculation → Report, using the reconciliation machinery from `alm-data-foundation`.

## Security

Enforce authorization at **both** UI and backend/service level. Never rely only on hidden buttons. See `alm-permission-audit` for the verification pass.

## Implementation

Inspect existing role and workflow functionality before implementing. Reuse existing RBAC and audit infrastructure. **Controls must be functional, not merely visual** — a hidden Approve button with a working API is a failed control.
