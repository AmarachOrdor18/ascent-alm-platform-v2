---
name: alm-product-architecture
description: Canonical architecture, boundaries and engineering standards for the Ascent ALM platform (Ecobank). Use before ANY ALM feature work — whenever the user asks to build, change, extend, or fix any ALM module (Position Book, liquidity, IRRBB, stress, reporting, data management, connectors, workflow), even if they don't say "architecture". This skill establishes the rules every other alm-* skill must follow.
---

# ALM Product Architecture

You are implementing work on an enterprise Asset & Liability Management platform for a large African banking group (Ecobank). This skill defines the canonical architecture and standards that all other `alm-*` skills inherit. Load it first; other skills assume its rules.

## Critical instruction: inspect before building

**Never rebuild working functionality.** Before any change:

1. Inspect the existing application (`src/` — pages, engine, store, lib, components, context).
2. Map what already exists against the target architecture below.
3. Identify gaps, reuse existing components and services, and progressively implement.
4. Run `npm run verify` (typecheck + lint + tests) before and after changes.
5. Preserve existing working functionality and maintain backward compatibility.

The goal is to **evolve the existing app into this architecture**, not to start over.

## Canonical architecture

All data and logic must follow this flow:

```
Source Systems → Integration Layer → Staging → Validation / Mapping / Reconciliation
→ Position Book → ALM Rules Engine → ALM Calculation Engines
→ Reporting Data Sets → Reporting Layer → Approval / Submission / Archive
```

**Core principle: the Position Book is the canonical normalized ALM position layer.** Downstream calculations consume the Position Book — they never query source systems directly, and no screen may bypass the data foundation to reach a source.

### Source systems (integrated only via the integration layer)

FLEXCUBE/core banking, Calypso, GL, credit, treasury, deposit and loan systems, market data (Reuters/Refinitiv/LSEG), APIs, databases, SFTP, CSV/Excel, manual departmental uploads.

### Modules

Dashboard, Liquidity Risk, IRRBB, Stress Testing, Limits & Breaches, KRI, FTP, Balance Sheet, FX Position, Reporting, Data Management, Reference Data, Configuration, Group Management, Workflow, Administration.

## Separation of concerns

Keep these layers distinct; never place business logic in UI components when it belongs in a service, engine, rules layer, or the database:

1. Source connectivity (connectors) 2. Ingestion 3. Validation 4. Mapping 5. Position normalization (Position Book) 6. Regulatory/business rules 7. ALM calculations (`src/engine`) 8. Reporting datasets 9. Report presentation 10. Workflow and controls 11. UI (`src/pages`, `src/components`)

## Configuration over hard-coding

Regulatory and banking rules are **configurable, versioned and effective-dated** — never hard-coded into screens. Configurable: HQLA classifications, haircuts, LCR rates, ASF/RSF factors, maturity buckets, behavioural assumptions, rate shocks, product classifications, reporting frequencies, report templates, mapping rules.

## Data lineage

Every important ALM metric must be traceable: Source → Staging → Position → Rule → Calculation → Reporting Dataset → Report. The architecture must always be able to answer: *"Where did this number come from?"*

## Multi-entity / multi-affiliate

Support Group → Country → Legal entity → Affiliate → Branch → Business unit, plus Currency. Enforce scope-based data access so users only see authorized data (see `src/context/ScopeContext.tsx`, `src/lib/scope.ts`).

## Workflow

Maker/checker, approval, rejection, adjustment, period close and reopen, audit trail, exception management. Controls must be functional, not merely visual (see `alm-workflow-controls`).

## Engineering standards for the coding agent

- Inspect the existing repository before modifying it; reuse existing architecture and components.
- Avoid fake functionality, hard-coded dashboard numbers, and mock data presented as live.
- Ensure UI data originates from the appropriate data layer (engine/repository), not constants.
- Keep calculations testable independently of the UI (pure functions in `src/engine`).
- Add meaningful validation and error handling; no silent failures.
- Build reusable components; avoid duplicating existing ones.
- Never change regulatory formulas merely for UI convenience.

## Output when invoked

Before implementing, produce: (1) current architecture, (2) architecture gaps, (3) recommended target architecture, (4) affected modules, (5) data-flow changes, (6) implementation plan. Then implement, preserving the canonical flow above.

## Related skills

Builder: `alm-source-integration`, `alm-data-foundation`, `alm-rules-engine`, `alm-liquidity-engine`, `alm-irrbb-engine`, `alm-stress-scenario-engine`, `alm-reporting-framework`, `alm-workflow-controls`, `alm-enterprise-ui`.
Audit (inspect, don't build): `alm-flow-audit`, `alm-permission-audit`, `alm-data-lineage-audit`, `alm-rfp-compliance`, `alm-ui-review`, `alm-demo-script`.
