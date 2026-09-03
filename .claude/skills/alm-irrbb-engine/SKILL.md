---
name: alm-irrbb-engine
description: Implement and evolve Interest Rate Risk in the Banking Book (IRRBB) — repricing gap, NII, EVE, rate shocks, yield curves, behavioural assumptions — for the Ascent ALM platform. Use whenever the user mentions IRRBB, EVE, NII, repricing, rate shocks, yield curves, duration, or interest-rate scenarios — even if they don't say "IRRBB engine".
---

# ALM IRRBB Engine

Build an explainable IRRBB engine based on normalized Position Book data, interest-rate assumptions, behavioural assumptions and configurable scenarios. Assumes the canonical architecture from `alm-product-architecture`.

## Core inputs (from the Position Book)

Position, amount, currency, interest rate, rate type, next repricing date, maturity date, behavioural tag, rate-sensitive flag, duration, product, legal entity. Start from `src/engine/irrbb.ts` and `src/engine/repricing.test.ts` — extend the existing engine.

## Repricing gap

Repricing buckets, rate-sensitive assets, rate-sensitive liabilities, gap, cumulative gap — by currency, entity, product.

## NII and EVE

Support configurable interest-rate scenarios and estimate the impact on Net Interest Income; support Economic Value of Equity analysis with scenario-based valuation impact.

## Rate shocks

Configurable scenarios: parallel up, parallel down, steepener, flattener, short-rate shock, long-rate shock. **Do not hard-code scenario assumptions** — they come from the rules engine (`alm-rules-engine`) and are versioned and effective-dated.

## Yield curves

Base curve and scenario curve, by currency and tenor, with effective dates (see `src/pages/YieldCurves.tsx`).

## Behavioural assumptions

Configurable, versioned, effective-dated assumptions for non-maturity deposits, prepayments, and early withdrawals. Start from `src/engine/behavioural.ts`.

## Explainability

Users can move from IRRBB metric → scenario → repricing bucket → product → position.

## Auditability

Store per result: scenario, assumption version, calculation timestamp, reporting date, input dataset, result.

## Implementation

Inspect existing IRRBB functionality before modifying it. Keep calculation logic separate from presentation. Do not introduce unsupported regulatory claims or assumptions.
