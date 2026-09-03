---
name: alm-stress-scenario-engine
description: Implement configurable ALM stress testing and what-if analysis (deposit runoff, funding withdrawal, rate/FX/HQLA shocks, combined stress, reverse stress) for the Ascent ALM platform. Use whenever the user mentions stress testing, scenarios, what-if, shocks, sensitivity, or baseline-vs-scenario comparison — even if they don't say "scenario engine".
---

# ALM Stress & Scenario Engine

Let users assess how changed assumptions affect liquidity, funding, interest-rate risk and other ALM metrics. Assumes the canonical architecture from `alm-product-architecture`. Start from `src/engine/stress.ts`, `src/engine/shocks.test.ts`, `src/pages/StressTesting.tsx`, and `src/pages/WhatIf.tsx` — extend, don't duplicate.

## Scenario model

A scenario contains: scenario ID, name, description, scenario type, assumptions, effective date, owner, status, base period, created by, approved by.

## Scenario types

Liquidity stress, deposit runoff, funding withdrawal, market-value shock, HQLA haircut shock, interest-rate shock, FX shock, combined stress, reverse stress testing, user-defined what-if.

Examples: retail deposits −10% / corporate deposits −15%; +100 bps / +200 bps; haircuts increased by a configured amount.

## Scenario workflow

Baseline → Apply assumptions → Recalculate → Compare → Analyze impact.

## Outputs

Impact on LCR, NSFR, liquidity gap, funding concentration, survival horizon, NII, EVE, and other relevant ALM metrics. Always show **baseline vs scenario** with absolute difference, percentage difference, and direction of impact.

## Governance

Support save, clone, edit, approve, archive. Approved scenarios must be reproducible (assumptions, base dataset, and rule versions stored with results).

## Explainability

Show which assumptions caused each material change — assumptions map to metric movements, not just a final number.

## UI

Make scenario construction understandable to Treasury/Risk users; hide technical implementation details (`alm-enterprise-ui`).

## Critical implementation rule

**Reuse the existing calculation engines.** The scenario module must not contain its own copies of LCR/NSFR/IRRBB formulas — it applies assumptions to the inputs and re-invokes `src/engine` services. A divergence between scenario results and baseline results for identical inputs is a bug.
