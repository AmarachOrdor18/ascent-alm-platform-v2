---
name: alm-run-management
description: Build and evolve the Run Management lifecycle — every ingestion becomes an inspectable, immutable Run, with editable Snapshots for what-if/correction workflows that never overwrite history. Use whenever the user mentions runs, run history, uploaded-data visibility, reruns, editable snapshots, or "what would happen if this position were different" for the Ascent ALM platform — even if they don't say "run management".
---

# ALM Run Management

A Run is one controlled processing instance of source data — the audit-grade record of what entered the system, when, by whom, and what happened to it. Assumes the canonical architecture from `alm-product-architecture`; sits downstream of `alm-source-integration` and `alm-data-foundation`; is consumed by `alm-workflow-controls` for approval and `alm-data-lineage-audit` for traceability.

**Do not build a page that lists past uploads.** Run Management controls and exposes the full lifecycle: `Source → Run → Staging → Validation → Mapping → Reconciliation → Admission → Position Book → Calculations → Reporting`.

## Where this already lives in the repo

Before changing anything, read `RUN_MANAGEMENT_IMPLEMENTATION.md` at the repo root — it documents what's built, what's partial, and what's pending as of the last pass. Core files:

- `src/engine/types.ts` — `ProcessRun` (15-state lifecycle, source/submission/metrics/governance fields), `RunSnapshot`, `PositionSnapshot`
- `src/store/db.ts` — `runSnapshots` table (schema v8)
- `src/store/repository.ts` / `src/store/localRepository.ts` — snapshot CRUD (`listRunSnapshots`, `getRunSnapshot`, `upsertRunSnapshot`, `deleteRunSnapshot`)
- `src/lib/snapshotHooks.ts` — `useRunSnapshots`, `useRunSnapshot`, `useCreateSnapshot`, `useUpdateSnapshot`, `useDeleteSnapshot`, `useRecalculateSnapshot`, `useSubmitSnapshot`, `useApproveSnapshot`, `useCommitSnapshot`
- `src/pages/RunDetails.tsx` — run overview, processing summary, uploaded-data table, snapshots list
- `src/pages/SnapshotDetails.tsx` — snapshot view/edit
- `src/pages/RunHistory.tsx` — run list, rerun capability
- `src/engine/validation.ts`, `src/engine/reconciliation.ts`, `src/pages/GlReconciliation.tsx`, `src/engine/run.ts` (`executeRun`) — validation, reconciliation, calculation execution a Run drives

Extend these. Do not create a second `Run` concept, a second snapshot table, or a parallel lifecycle enum.

## Run lifecycle

`ProcessRun.status` already models: `Created (Draft) → Received → Processing → Validating → Validated → (ValidationFailed) → Reconciling → Reconciled → (ReconciliationFailed) → Admitted → Calculating → Completed → (Failed)`.

"File uploaded successfully" is not "run completed." Keep these visibly distinct in the UI: Received, Validated, Reconciled, Admitted, Calculated, Completed. Every stage transition should stamp its timestamp field on `ProcessRun` (`receivedAt`, `validationStartedAt`, `validationCompletedAt`, etc. — already present).

## Run Management screen and Run Details

List screen: Run ID, source, reporting date, submission method, record count, status, submitted by, time — filterable by run ID, source, reporting date, status, method, user, date range, server-side paginated for large datasets.

Detail screen (`RunDetails.tsx`) sections: Overview, Uploaded Data, Validation, Mapping, Reconciliation, Position Book, Calculations, Reports, Audit Trail. A user who uploaded a file must be able to open the run and see the actual records — not just a count — with search, filter, sort, pagination, and per-record validation status/errors (e.g. "Account 001245, field maturityDate, value 2025-01-01: maturity date precedes reporting date"). Where mapping transforms a value, show `Source Value → Mapping Rule → Normalized Value` (e.g. `TB01 → Treasury Bill`), not just the end result.

## Historical runs are immutable

Once completed/admitted, a Run is protected: view, search, filter, download, drill down, or branch into a snapshot — never silently edit. Reruns (`Run #001 validation failed → corrected source → Run #002`) create a **new** Run referencing the parent (`parentRunId`) with the reason recorded; the failed run stays visible, it is never overwritten.

## Editable Snapshot workflow

`Create Snapshot` (from a completed Run) → `Edit` → `Validate` → `Reconcile` → `Recalculate` → `Compare` → optionally `Submit → Approve → Commit → new Position Book version`.

- A snapshot always retains `parentRunId`; multiple snapshots may branch from one run.
- Only edit fields the business purpose justifies — `PositionSnapshot.edits` currently covers amount, maturity date, next repricing date, behavioural tag, HQLA level/haircut, LCR cash-flow role/rate, ASF/RSF factor, interest rate, IRRBB rate-sensitive flag. Every change records field, original value, new value, user, timestamp, reason (`changeReason`, `changedBy`, `changedAt` on `PositionSnapshot`).
- Comparison must show both the position-level diff (original vs snapshot) and the metric-level impact (HQLA, NCO, LCR, NSFR, EVE, etc. — before vs after).
- **A snapshot must never overwrite the original Position Book.** Committing an approved snapshot creates a new Position Book version (`RunSnapshot.newPositionBookVersion`); both versions stay traceable.
- Per `RUN_MANAGEMENT_IMPLEMENTATION.md` §10, the recurring gap across this workflow is UI, not data model — `useUpdateSnapshot`, `useRecalculateSnapshot`, `useSubmitSnapshot`, `useApproveSnapshot`, `useCommitSnapshot` exist and are wired for permissions/audit, but SnapshotDetails needs the editing form, comparison view, and action buttons built out. Check current state before assuming a step is missing — it may just need UI wired to an existing hook.

## Lineage

A user must be able to navigate both directions:

`Run → Position Book → Calculation → Report` and `Report → Calculation → Position → Run → Source`

`ProcessRun.positionBatchIds` links to `LoadBatch`/`Position`; `RunResult[]` links calculation output back to `runId`; `reportIds` on `ProcessRun` is reserved for the report link. Where this lineage is only a data-model field today (no UI drill-down), add the navigation rather than duplicating the linkage in a new field — see `alm-data-lineage-audit` for the full trace requirement.

## Permissions

Respect the existing role/scope model (`hasPermission`, already checked in every snapshot hook) for: run list, run details, uploaded data, downloads, snapshot create/edit/submit/approve/commit, Position Book, calculations, reports. Never rely on hiding a button — enforce at the hook/service layer as the existing hooks do.

## Audit trail

Every hook already records an audit event on mutation. Preserve this for any new action: run created, received, validation started/completed/failed, mapping completed, reconciliation completed, admitted, calculation started/completed, snapshot created/edited/submitted/approved/rejected/committed, data downloaded — who, timestamp, action, object, before/after state.

## Definition of done

Run Management is not "a history of uploads." It succeeds when: every ingestion produces an inspectable Run; a user can see the actual records that entered the system and why any were rejected; historical runs are provably immutable; a snapshot can be branched, edited, recalculated, compared against the original, and — only on approval — committed as a new Position Book version without touching the original; and every one of these steps is permission-checked and audited. Update `RUN_MANAGEMENT_IMPLEMENTATION.md`'s success matrix after material changes rather than leaving it stale.
