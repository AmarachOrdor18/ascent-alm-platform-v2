# Ascent ALM Skills

16 project skills for building, auditing and demonstrating the Ascent ALM platform. Each lives in `.agents/skills/<name>/SKILL.md` and is discovered automatically by ZCode in this workspace.

## Builder skills (build the product)

Run in phases. **Every skill inspects the existing app first and evolves it — none may rebuild working functionality.**

### Phase 1 — Foundation
- `alm-product-architecture` — canonical architecture and standards; load this first, always
- `alm-source-integration` — connectors: FLEXCUBE, Calypso, GL, market data, APIs, DB, SFTP, files
- `alm-data-foundation` — staging, validation, mapping, reconciliation, Position Book

### Phase 2 — ALM intelligence
- `alm-rules-engine` — configurable, versioned, effective-dated regulatory rules
- `alm-liquidity-engine` — LCR, NSFR, HQLA, liquidity gap, analytics
- `alm-irrbb-engine` — repricing gap, NII, EVE, rate shocks, yield curves
- `alm-stress-scenario-engine` — stress testing and what-if analysis

### Phase 3 — Reporting & controls
- `alm-reporting-framework` — datasets, templates, cycles, adjustments, export, archive
- `alm-workflow-controls` — maker/checker, period close, audit trail, exceptions

### Phase 4 — Experience
- `alm-enterprise-ui` — progressive disclosure, role-based UX, states, accessibility

## Audit skills (inspect and fix, don't build)

Run after the builders, in this order:

1. `alm-flow-audit` — does it work end-to-end?
2. `alm-permission-audit` — can users bypass it?
3. `alm-data-lineage-audit` — are the numbers trustworthy?
4. `alm-rfp-compliance` — did we build what the RFP asks for?
5. `alm-ui-review` — is it polished and usable?
6. `alm-demo-script` — write the story last, once the product is stable

## Standing instruction for every invocation

> First inspect the existing application and map what already exists against the skill. Do not rebuild working functionality. Identify gaps, reuse existing components and progressively implement the target architecture. Test every change (`npm run verify`).
