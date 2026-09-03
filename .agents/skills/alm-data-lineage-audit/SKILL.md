---
name: alm-data-lineage-audit
description: Data-lineage audit of the Ascent ALM platform — verify key metrics (LCR, NSFR, HQLA, gap, IRRBB, stress results, report cells) trace from the final number back through calculations, rules and the Position Book to source data, flagging hard-coded values and broken links, then fix the lineage. Use when the user asks where a number comes from, to verify traceability/reproducibility, or mentions hard-coded metrics or drill-down lineage — even if they don't say "lineage audit".
---

# ALM Data Lineage Audit

Act as a senior ALM data architect and banking data-governance specialist. Verify that important ALM metrics, calculations and reports can be traced from the final number back to the original source data. For every important number, the system should be able to answer: **"Where did this number come from?"**

## Expected lineage

Source System → Integration → Staging → Validation → Mapping → Position Book → ALM Rule → Calculation → Reporting Dataset → Report → Output.

## Critical instruction

Inspect first. Do not rebuild working functionality. When lineage is missing: identify the broken link, implement the correct linkage, avoid duplicating data, preserve source identifiers, and test the lineage end-to-end. Run `npm run verify` after changes.

## Trace these metrics

LCR, HQLA, Net Cash Outflows, NSFR, ASF, RSF, Liquidity Gap, IRRBB, NII, EVE, stress results, funding concentration, key dashboard metrics, regulatory reports. Verify lineage reaches: FLEXCUBE, Calypso, GL, credit/treasury systems, market data, API/database feeds, file uploads (as represented by connectors and batches in `src/store/db.ts`).

## Detect and flag

Hard-coded metrics; static dashboard values; duplicate sources of truth; calculations performed only in frontend code; disconnected datasets; missing source/batch identifiers; missing reporting dates; missing rule versions; missing calculation versions; reports that don't reconcile to calculations; calculations that don't reconcile to the Position Book.

For each metric, trace in code (`src/engine/`, `src/lib/metrics.ts`) and in the running app: does drill-down actually reach positions, and do positions carry batch/source attribution?

## Example trace to verify

LCR → Adjusted HQLA → HQLA positions → Position Book → source batch → FLEXCUBE/market data/file. And: LCR → Net Cash Outflows → inflows/outflows → Position Book → source.

## Traceability UI

Where appropriate, verify drill-down lets an authorized user inspect lineage (position → batch → source → original record). Flag screens where the drill-down stops short.

## Historical reproducibility

Verify historical results can be reproduced using: historical Position Book/vintage, reporting date, rule version, reference-data version, calculation version, scenario assumptions. If a result can't be re-derived from stored inputs, that's a lineage gap.

## Output

Per metric: current source → current calculation → lineage completeness → gap → fix. Prioritize metrics used in executive, regulatory and risk reporting.
