---
name: alm-enterprise-ui
description: Design and implement the enterprise ALM user experience — sophisticated underneath, simple on the surface. Use whenever building or refining ALM screens, dashboards, tables, forms, navigation, drill-downs, loading/empty/error states, or reducing UI complexity for the Ascent ALM platform — even if the user just says "make this simpler" or "improve this screen".
---

# ALM Enterprise UI

Make the platform powerful while reducing cognitive load. The UI must feel like an enterprise banking product, not a technical data-management tool. **Sophisticated underneath, simple on the surface.** Never remove important functionality to simplify — reduce load through hierarchy, progressive disclosure, grouping and clear workflows. Assumes `alm-product-architecture`.

## User personas

Design appropriate experiences per role — Executive, Treasury user, Risk analyst, ALM analyst, Finance/reporting user, Control tester, Administrator. Do not expose every capability to every role. Role/scope plumbing: `src/context/AuthContext.tsx`, `src/context/ScopeContext.tsx`.

## Navigation

Logical hierarchy across Dashboard, Risk Management, Treasury, Reporting, Data Management, Reference Data, Configuration, Group Management, Workflow, Administration. Avoid duplicated entry points to the same function.

## Dashboard

Prioritize LCR, NSFR, liquidity position, liquidity gap, IRRBB indicators, limits & breaches, KRI, alerts, data freshness — with progressive disclosure.

## Complex screens (LCR, NSFR, IRRBB, Stress)

First show: headline metric, status, key drivers, trend, exceptions. Then allow: Metric → Category → Position → Source. Don't show every underlying field by default.

## Tables

Column prioritization, sticky headers where useful, filtering, search, pagination, column visibility, sorting, export, drill-down. **Never display 30+ columns by default when 6 are relevant.** Use the shared table components in `src/components/`.

## Forms

Group related fields, clear labels, immediate validation, show dependencies, prevent invalid submission, explain complex regulatory concepts (tooltips/info buttons — the app already has an info-button pattern).

## States

Every major page supports: loading, empty, error, success, partial data, permission denied, stale data. **No blank screens.**

## Accessibility

Keyboard navigation, clear focus, semantic controls, sufficient contrast, meaning not conveyed by color alone, accessible labels.

## Visual consistency

Consistent typography, spacing, cards, buttons, tables, forms, status indicators, charts, navigation, modals. Reuse the existing design system (Radix-based `src/components/ui/`); do not introduce arbitrary new patterns.

## Banking context

Don't just show "LCR: 132%". Also provide regulatory status, HQLA, net cash outflows, change vs previous period, key drivers, and a way in.

## Implementation

Before modifying UI: inspect existing components, identify design-system patterns, identify duplicated components, preserve working functionality, improve rather than rewrite. **Never sacrifice data correctness for visual polish.** The result should feel calm, structured, trustworthy and professional.
