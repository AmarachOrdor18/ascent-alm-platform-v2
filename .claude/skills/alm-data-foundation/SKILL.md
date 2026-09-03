---
name: alm-data-foundation
description: Build and evolve the normalized ALM data foundation — staging, data quality, mapping, reconciliation, and the canonical Position Book. Use whenever the user mentions the Position Book, staging, batches, vintages, data validation, mapping rules, reconciliation, data admission, or data lineage for the Ascent ALM platform — even if they don't say "data foundation".
---

# ALM Data Foundation

Convert heterogeneous banking source data into trusted, normalized ALM positions. Assumes the canonical architecture from `alm-product-architecture`; consumes output of `alm-source-integration`; is consumed by all calculation engines.

## Pipeline

```
Source → Staging → Schema Validation → Data Quality → Mapping
→ Normalization → Reconciliation → Admission → Position Book
```

## Staging

Every incoming dataset enters a staging state first. Track per batch: batch ID, source, upload/integration timestamp, reporting date, record count, submitting user/system, validation status, reconciliation status, admission status. Statuses: Pending, Validated, Rejected, Admitted, Failed. In this repo, start from `src/pages/DataVintages.tsx` and `src/store/db.ts` — extend existing batch/vintage concepts, don't create parallel ones.

## Data quality

Validate: required fields, data types, dates, currency, amounts, account identifiers, duplicates, invalid classifications, invalid maturity/repricing dates, missing reference data. Every failure produces a **meaningful exception** the user can act on (see `src/engine/validation.ts`).

## Mapping

Configurable, versioned, effective-dated mappings for: product, currency, branch, GL, COA, account class, asset/liability, legal entity, counterparty, regulatory classification. Never hard-code mapping assumptions into engines.

## Position Book

The canonical normalized position layer. A position record carries (when available): ID, account number, legacy account number, account class, branch code, category, product class, currency, amount, maturity date, next repricing date, behavioural tag, rate type, interest rate, HQLA level, HQLA haircut, LCR cash-flow role, LCR rate, ASF factor, RSF factor, IRRBB rate sensitivity, approximate duration, legal entity, organizational unit, GL account, common COA, counterparty, performing status, provision amount, lien amount/reason, monthly credit/debit, maker, checker, record status, notes.

Rules:

- **Do not require every source to provide every field.** Distinguish source attributes, derived attributes, regulatory classifications, and calculated values.
- Derive regulatory attributes via `alm-rules-engine`, not inline logic.
- Every record retains source attribution: Position → Batch → Source → original record.
- Design for large datasets: pagination, server-side filtering, batch processing, incremental ingestion. **Never load millions of positions into the browser.**

## Reconciliation

Support reconciliation across Source → Staging → Position Book showing: expected/received/admitted/rejected records, missing records, duplicates, amount differences. Start from `src/engine/reconciliation.ts` and `src/pages/GlReconciliation.tsx`.

## Implementation

Inspect the existing repository and database (`src/store/`) before implementing. Extend existing models rather than creating duplicate Position Book concepts. The Position Book must become the trusted downstream source for all ALM engines — no engine may re-derive positions from raw sources.
