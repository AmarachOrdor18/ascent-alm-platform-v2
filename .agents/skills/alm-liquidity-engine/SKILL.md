---
name: alm-liquidity-engine
description: Implement and evolve liquidity-risk calculations — LCR, NSFR, HQLA, liquidity gaps, funding concentration, survival horizon — for the Ascent ALM platform. Use whenever the user mentions LCR, NSFR, HQLA, cash outflows/inflows, liquidity gap, liquidity buffer, funding mix, or liquidity analytics — even if they don't say "liquidity engine".
---

# ALM Liquidity Engine

Build a credible liquidity-risk engine covering LCR, NSFR, liquidity gaps and liquidity analytics. Assumes the canonical architecture from `alm-product-architecture`.

## Principle

The engine consumes only: **Position Book + ALM Rules + market/reference data where required**. It never retrieves raw source-system data itself. Start from `src/engine/liquidity.ts`, `src/engine/buckets.ts`, and `src/lib/metrics.ts` — extend existing calculation services; replace fake/static calculations with reusable services where required.

## LCR

Logical flow: Position Book → HQLA classification → haircuts → Adjusted HQLA → cash-flow classification → inflows → outflows → Net Cash Outflows → LCR. Support Level 1 / 2A / 2B HQLA, haircuts, inflow and outflow/runoff rates, the 30-day horizon, and currency / consolidated / legal-entity views. Show both aggregate metrics and the underlying positions.

## NSFR

Available Stable Funding ÷ Required Stable Funding, using configurable ASF/RSF factors, asset and liability classifications, maturity, funding characteristics, with currency and entity analysis.

## Liquidity gap

Maturity buckets (contractual and behavioural), inflows, outflows, net gap, cumulative gap — by currency, entity, and product.

## Liquidity analytics

Where appropriate: funding concentration, unencumbered assets, liquidity buffer, significant-currency analysis, survival horizon, funding mix.

## Explainability

Every major metric supports drill-down:
- LCR → Net Cash Outflows → outflow category → product → position
- HQLA → level → asset → position

## Data lineage

Every calculation result retains: reporting date, rule version, input dataset (batch/vintage), calculation version, timestamp. This is what makes results auditable and reproducible (`alm-data-lineage-audit`).

## Validation

Provide calculation checks and reconciliation controls; never silently fall back to defaults when inputs are missing.

## UI contract

Present calculations progressively: executives see headline metrics first; risk users can drill into detail. Don't overwhelm users with every underlying field by default (see `alm-enterprise-ui`).

## Implementation

Inspect existing liquidity screens, calculations, and mock data before changing them (`src/pages/results/`, `src/pages/modules/`). Do not invent regulatory requirements — implement only recognized, configured treatments.
