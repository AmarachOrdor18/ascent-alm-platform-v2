---
name: alm-ui-review
description: UX polish review of the Ascent ALM platform — review every major screen for hierarchy, progressive disclosure, tables, forms, states, accessibility and visual consistency, then fix significant issues. Use when the user asks to review or polish the UI, make screens look professional, reduce clutter/complexity, or improve usability — even if they don't say "UI review".
---

# ALM UI Review

Act as a senior enterprise UX designer, banking application designer and frontend engineer. Make the application sophisticated but easy to operate. The result should feel **professional, calm, structured, trustworthy, enterprise-grade, easy to navigate**.

## Critical principle

Do not simplify by removing important functionality. **Reduce cognitive load through hierarchy, progressive disclosure, grouping and clear workflows.** Do not redesign the whole application — prioritize changes that significantly improve usability, reuse the existing design system (`src/components/ui/`, Radix + Tailwind), and never sacrifice data correctness for visual polish.

## Critical instruction

Inspect first: existing components, design-system patterns, duplicated components, working functionality. Improve rather than rewrite. Verify each fix in the running app (`npm run dev`, browser automation via `control-browser`/`web-gui-tester` where visual confirmation is needed) and run `npm run verify`.

## Review every major screen for

Information hierarchy, navigation, page structure, typography, spacing, cards, tables, forms, filters, charts, status indicators, buttons, modals, tabs, drill-down, empty/loading/error states, accessibility, responsiveness.

## ALM-specific UX

For complex metrics (LCR, NSFR, HQLA, Liquidity Gap, IRRBB, EVE, NII, Stress Testing, Funding Concentration) apply progressive disclosure: first show metric, status, trend, key drivers, exceptions — then Metric → Category → Position → Source.

## Role-based complexity

Executive: headline metrics and exceptions. Risk: metrics plus detailed analysis. Treasury: funding, liquidity, market views. Reporting: cycles, validation, submission. Administrator: configuration and controls.

## Tables

Check tables show the right columns, hide unnecessary fields by default, and support search, filtering, sorting, pagination, export, drill-down. Users must not scan 30+ columns when 6 suffice.

## Forms

Field grouping, required fields, validation, defaults, tooltips, error messages, dependencies, confirmation. Complex regulatory concepts need contextual explanations.

## Visual consistency

Identify inconsistencies in buttons, colors, icons, typography, spacing, cards, status badges, tables, forms, modals, navigation. Reuse existing patterns; do not introduce arbitrary new ones.

## Accessibility

Keyboard navigation, focus states, labels, contrast, semantic controls, screen-reader-friendly structure, non-color-only status communication.

## Fixing issues

For each significant issue: explain the UX problem, why it matters, affected users; then fix it and verify the result.

## Output

Critical UX problems, high-priority improvements, medium improvements, fixes completed, remaining recommendations.
