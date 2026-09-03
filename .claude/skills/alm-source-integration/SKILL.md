---
name: alm-source-integration
description: Implement source-system integration (FLEXCUBE, Calypso, GL, market data, APIs, databases, SFTP, file uploads) for the Ascent ALM platform via a connector/adapter architecture. Use whenever the user mentions connectors, integrations, data feeds, FLEXCUBE/Calypso, file uploads, ingestion scheduling, or feed monitoring/failures — even if they don't say "integration".
---

# ALM Source Integration

Build a flexible integration architecture that lets the ALM platform receive data from many banking systems **without coupling the ALM application to any individual source**. Assumes the canonical architecture from `alm-product-architecture`; the output of this skill feeds staging and the Position Book (`alm-data-foundation`).

## Supported sources

Design adapters/connectors for: FLEXCUBE/core banking, Calypso, General Ledger, credit, deposit, loan and treasury systems, Reuters/Refinitiv/LSEG market data, APIs, relational databases, SFTP, CSV, Excel, and manual departmental feeds. **Do not assume every source exposes an API** — file-based feeds are first-class citizens.

## Integration architecture

```
Source System → Source Adapter → Integration Service → Staging
→ Validation → Mapping → Reconciliation → Admission → Position Book
```

Downstream ALM code must not care whether data came from an API, database, SFTP drop, or a file upload.

## Adapter pattern

Define one common connector interface. Each connector records: source name, source type, connection configuration, authentication method, data entities, schedule, last successful run, last attempted run, record count, status, error state, and retry capability. In this repo, start from `src/pages/Connectors.tsx`, `src/components/connectors`, and `src/lib/connectorHooks.ts` — extend, don't duplicate.

## File-based integration (departmental feeds)

Workflow: Upload → Validate file → Detect schema → Validate records → Stage → Reconcile → Admit → Position Book. **Never treat an uploaded file as immediately live production data** — it enters staging first (see `src/pages/DataUpload.tsx`, `src/lib/csvImport.ts`).

## API integration

Support manual trigger, scheduled execution, incremental and full extraction, retry, timeout handling, authentication, logging, and success/failure monitoring.

## Database integration

Read-only extraction from external databases where appropriate. **External source systems must never directly manipulate the Position Book.**

## Market data

Support FX rates, interest rates, yield curves, security prices, reference rates. Each observation carries: observation date/time, source, currency, instrument/reference, value, and snapshot/version identifier. See `src/pages/FxRates.tsx`, `src/pages/YieldCurves.tsx`, `src/pages/EconomicIndicators.tsx`.

## Data ownership

Every source/feed has an owner (Treasury, Finance, Credit, Risk, Operations). Track responsibility for missing or delayed feeds.

## Monitoring

Provide a source monitoring view: connected, processing, successful, failed, delayed, missing, last received, record count.

## Failure handling

Define explicit behavior for: API timeout, authentication failure, invalid file, schema mismatch, duplicate file, duplicate records, partial ingestion, source unavailable, unexpected record count. **Never silently fail** — surface exceptions to the exception management model (`alm-workflow-controls`).

## Implementation rules

1. Inspect the existing data model (`src/store/db.ts`, `src/store/repository.ts`).
2. Inspect existing APIs/services and current mock data.
3. Inspect current upload mechanisms.
4. Reuse existing infrastructure; do not create a duplicate integration system.
5. The integration layer must feed the shared data foundation and Position Book — no screen-level shortcuts.
