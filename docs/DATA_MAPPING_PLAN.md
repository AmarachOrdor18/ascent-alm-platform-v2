# Data Mapping Layer - Design Plan

How source-system data becomes the standardized ALM data model, mapped against what the platform already has.

## 1. Where mapping sits in this application today

The platform's ingestion already enforces part of the chain: **Ingestion → Staging → Validation → Admission → Position Book**. What it lacks is the **explicit mapping layer** between raw source data and the canonical model. Today translation happens implicitly:

| Concern | Where it lives today | Nature |
|---|---|---|
| Field names | `src/lib/csvImport.ts` expects canonical column names (`accountNumber`, `maturityDate`…) | Hard-coded "already-mapped" contract - a FLEXCUBE extract (`ACCT_NO`, `MAT_DT`) cannot be loaded without pre-transformation |
| Product codes | `productCodeFrom(productClass)` deterministic slug; Product dimension in `dimensionMembers` | Implicit |
| GL / CoA | `commonCoaCode` carried per position; per-affiliate local GL hierarchies in seed with `COMMON_COA` crosswalk | Master data exists; the *mapping of an unmapped source GL* is manual (auto-derive) |
| Counterparties | `dimensionMembers` (Counterparty) + `counterpartyId` per position; CSV register import | Single identity namespace - no cross-system cross-reference |
| Validation | `engine/validation.ts` + persisted rule set | Complete (gates admission) |
| Exception queue | Validation exceptions on the load panel; `remediationIssues` table | Partially connected (failures don't raise remediation items automatically) |

## 2. The three mapping problems (all three need a home)

**A. Structural (field) mapping** - source column → canonical field, with transformation type: direct, numeric conversion, date conversion, percentage conversion. This is what lets a raw FLEXCUBE extract load without preprocessing.

**B. Reference (semantic) mapping** - source codes → ALM concepts:
- Product code → ALM product class → risk attributes (via the existing Product dimension + `ProductCharacteristic` rule)
- Source GL → ALM GL classification → Common CoA (the existing GL hierarchy + crosswalk, formalised as mappable reference tables)
- Counterparty cross-reference: Calypso `CP00125` and core-banking `BANK-007` → one ALM counterparty (a master cross-reference table, not a new namespace)

**C. Derived fields** - deliberately **out of mapping scope**. Remaining maturity, buckets, gap: these belong to the engines (`buckets.ts`, `run.ts`). Mapping standardises; it does not calculate.

## 3. Design: mapping as versioned configuration (rules, not code)

Mapping definitions become stored rules reusing the existing `rules` infrastructure (versioned, effective-dated, maker/checker metadata, dependency-checked deletion - all already built):

- **`FieldMappingRule`** (kind: `FieldMapping`, affiliate-scoped like every rule): source system, data domain, ordered list of `{ sourceField, targetField, transform: 'Direct'|'Number'|'Date'|'Percent'|'Lookup', lookupRuleId? }`. The importer applies them before the canonical `Position` shape is produced.
- **`CodeMappingRule`** (kind: `CodeMapping`): reference tables `{ sourceValue → targetCode }` per dimension (Product, GlAccount, CommonCoa, Counterparty, Currency). Unmapped codes already **block admission** today (`unmappedCodes` gate in `DataLoadPanel`) - with explicit code mappings, the gate resolves from configuration instead of manual member creation.
- **Counterparty cross-reference**: rows `{ system, sourceId → counterpartyId }` against the existing Counterparty dimension. One master identity, many source aliases.

**Versioning and lineage**: a batch records the mapping rule IDs **and versions** used at admission; a run already pins `positionBatchIds` - the chain *source → mapping version → batch → run → report* becomes complete. Historical results stay reproducible because old mapping versions are never overwritten, only superseded (same model as data vintages).

## 4. Where it lives in the UI

Two places, per the two audiences:

- **Affiliate Settings → Data Sources** gains a **Mapping** action per domain: "how Ghana's Flexcube feed translates into the ALM model" (affiliate-scoped field + code mappings). Configuration stays with the entity it describes.
- **Data Management → Data Structure** holds the cross-affiliate view: which mappings exist, which affiliates use which versions (the Rule Coverage pattern already built for business rules).
- **Position Book** stays operational: analysts see *mapped* positions and lineage ("mapped by FieldMappingRule v3 from batch B-GH-…-v2"), never editors.

## 5. The end-to-end flow after implementation

```
Source (FLEXCUBE / Calypso / file / API)
  → Ingestion (connector or upload)
  → Staging (raw rows kept as received)
  → Field Mapping (FieldMappingRule vN)     ← configuration
  → Code Mapping (CodeMappingRule vN + master lookups)  ← configuration
  → Canonical ALM data (existing Position shape)
  → Validation (existing rule set; failures → exception queue)
  → Admission (existing commit gate)
  → Position Book (union of current feed batches)
  → Runs (pin batches + mapping versions) → Engines → Reporting
```

## 6. Implementation phases

1. **Field mapping engine** (`lib/fieldMapping.ts`): apply a `FieldMappingRule` to a raw CSV → canonical rows; extend the upload flow to accept a raw source file + mapping selection (canonical files keep working unmapped).
2. **Code mapping tables** + admission-gate integration: `unmappedCodes` offers "create from mapping" before "create from file".
3. **Counterparty cross-reference** on the register screen.
4. **Version stamping**: batch + run record mapping versions; lineage display on batch detail.
5. **UI**: Mapping editor on affiliate Settings (reusing `RuleEditor` shell); coverage view in Data Structure.
6. **Exception queue wiring**: validation failures raise remediation issues automatically.

*Explicit non-goals:* Ecobank's actual CoA mapping, product crosswalks and counterparty aliases are institution-specific - the platform ships the mechanism and seed examples (NG/GH local GL crosswalks); the real tables come from data-discovery workshops.
