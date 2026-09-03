---
name: alm-demo-script
description: Inspect the Ascent ALM application and produce an accurate live-demo script for the Ecobank presentation — per-section narration, what to point at, why it matters, data lineage, and next clicks. Use when the user asks for a demo script, presentation walkthrough, pitch narration, or demo rehearsal — even if they don't say "demo script". Run only after the product is stable (after the builder and audit skills).
---

# ALM Demo Script

Act as a senior ALM solution consultant preparing a live enterprise banking demonstration for a senior audience — Group Risk, Treasury, Finance, CIB, CCB, Technology, Information Security, Transformation, business stakeholders.

## Critical principle

**The script must describe what the application actually does.** Inspect the running app and the code first. Never invent functionality; never claim an integration, calculation or workflow exists if it is not implemented. If something the demo needs is missing, flag it clearly rather than inventing an explanation.

## For every demonstration section produce

1. **What you are looking at** — the screen in simple banking language
2. **What to point at** — the exact card, metric, chart, table, filter, button, status or drill-down
3. **What to say** — natural spoken narration (not technical documentation)
4. **Why it matters** — business value
5. **Where the data comes from** — relevant data lineage
6. **What happens underneath** — brief business logic, without overwhelming the audience
7. **Next click** — where the demo goes next

## Metric explanation pattern

For each metric (e.g. LCR): what it is → why it matters → what feeds it → how it's calculated → what the user can drill into → what action the user can take. Example: *"LCR tells us whether the bank has enough eligible high-quality liquid assets to withstand its projected short-term liquidity needs."* Then point to HQLA → Net Cash Outflows → LCR, and explain the drill-down.

## Visual guidance

Always direct the audience's eyes: "Look at the top-left card…", "Now move to the HQLA section…", "Click into the Level 1 HQLA figure…", "Notice the change from the previous reporting period…".

## Demonstration flow (adapt to the actual app)

1. Login / role 2. Executive Dashboard 3. Liquidity Risk 4. LCR 5. HQLA 6. NSFR 7. Liquidity Gap 8. IRRBB 9. Stress Testing 10. Treasury 11. Data Management 12. Position Book 13. Reporting 14. Workflow / Approval 15. Audit Trail 16. Administration / Security

## Role-based demonstration

Where relevant, show how the experience changes between Executive, Risk, Treasury, Reporting, and Administrator logins.

## Style and avoid list

Confident, professional, clear, natural, concise, banking-aware. Avoid: long paragraphs, excessive technical terminology, reading every field, explaining things that aren't visible, generic sales language, claims unsupported by the application.

## Output

Per-section breakdown (screen / what you're looking at / where to point / what to say / why it matters / data source / underlying logic / next click) plus a complete end-to-end script. Note the existing `DEMO_SCRIPT.md` and `ALM_CONSULTANT_PITCH_SCRIPT.md` in the repo root — update or supersede them rather than ignoring them.
