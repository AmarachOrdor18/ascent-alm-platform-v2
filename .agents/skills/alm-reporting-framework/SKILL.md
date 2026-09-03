---
name: alm-reporting-framework
description: Implement the Ascent-Reporting-style regulatory/ALCO/management/ad-hoc reporting lifecycle — reporting datasets, report catalogue, templates, cycles, adjustments, export, archive — for the Ascent ALM platform. Use whenever the user mentions reports, reporting packs, CBN/regulatory submissions, ALCO packs, report templates, reporting calendars, cycles, or report export — even if they don't say "reporting framework".
---

# ALM Regulatory Reporting Framework

Build reporting as a **configurable reporting lifecycle**, not a collection of hard-coded report pages. Inspired by the architecture of Ascent Reporting. Assumes the canonical architecture from `alm-product-architecture`. Start from `src/pages/ReportPacks.tsx`, `src/pages/ReportPackScreen.tsx`, `src/pages/RegulatoryReporting.tsx`, and `src/pages/AdHoc.tsx` — extend the existing reporting infrastructure, don't create one-off report logic per screen.

## Architecture

```
Position Book → ALM Calculation Results → Reporting Data Sets → Report Template
→ Validation → Approval → Output → Submission → Archive
```

## Reporting datasets

Reusable datasets such as LCR_DATA, NSFR_DATA, IRRBB_DATA, LIQUIDITY_GAP_DATA, ALCO_LIQUIDITY_DATA, MANAGEMENT_ALM_DATA. Each has: dataset ID, version, reporting date, source, transformation logic, business rules, data lineage, validation status. Datasets are built from engine results — never re-implement calculations inside reporting.

## Report catalogue

Each report: report code, name, purpose, regulator, frequency, owner, due date, template, output format, status, effective date, version.

## Frequencies

Configurable: daily, weekly, monthly, quarterly, semiannual, annual, ad-hoc. **Do not hard-code a frequency into the application architecture.**

## Templates

A template defines sections, rows, columns, data fields, calculations, formatting, validation rules, and output format — and is versioned (CBN Report v1, v2, v3…). Historical reports must remain reproducible with their template version.

## Report types

- **Regulatory** — CBN and other regulator requirements
- **ALCO** — liquidity, funding, interest-rate and balance-sheet packs
- **Management** — executive and management reporting
- **Ad-hoc** — user-configured reports built only from approved datasets

## Output formats

Excel, CSV, XML, PDF, structured/API submission — as required. Do not assume every regulator uses the same format. Existing PDF export lives in `src/lib/pdfExport.ts`.

## Adjustments

Authorized users may make controlled adjustments. Record: original value, new value, user, timestamp, reason, approval, related report cycle. **Never silently overwrite data.**

## Drilldown

A report value must be traceable: report cell → reporting dataset → ALM calculation → Position Book → source (`alm-data-lineage-audit` verifies this chain).

## Reporting calendar

Visibility of upcoming reports, reporting period, due dates, data readiness, validation status, approval status, submission status. Cycle state transitions are governed by `alm-workflow-controls`.

## Implementation

Inspect the existing Ascent-inspired reporting functionality before replacing anything. Preserve reusable report infrastructure. The objective is a framework that survives changing bank and regulatory report formats.
