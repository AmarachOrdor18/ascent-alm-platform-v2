# Ascent ALM Platform

Asset & Liability Management for Ecobank Group - liquidity risk, IRRBB, funds transfer pricing, stress testing, limits, KRIs and regulatory reporting across the Group's African footprint.

A self-contained front-end application: the calculation engine runs in the browser and state persists to IndexedDB, so it opens instantly with no backend to provision and nothing to warm up before a demo.

> **Scope and rationale** live in `ecobank_ALM/ASCENT_V2_BUILD_PLAN.md` - including the three defect registers (functional, engineering, practitioner) that this build exists to answer.

---

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | development server with HMR |
| `npm run build` | typecheck, then production build |
| `npm test` | run the test suite |
| `npm run test:watch` | tests in watch mode |
| `npm run test:coverage` | tests with coverage; fails below the `engine/` thresholds |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run format` | Prettier write |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | typecheck + lint + test - what CI runs |

---

## Architecture

```
src/
├── engine/     pure TypeScript - calculations, zero I/O
├── store/      repository interface → Dexie/IndexedDB
├── components/ layout, ui primitives, icons
├── context/    auth (roles/permissions), scope (affiliate/as-of/run)
├── pages/      screens
└── lib/        formatting and class helpers
```

Three rules hold this together.

**1. `engine/` is pure.** Every module takes data in and returns results out - no fetch, no storage, no React. This is enforced mechanically, not by convention: `.eslintrc.cjs` has an override that fails the build if anything under `src/engine/` imports React, Dexie, the store or the UI, or reaches for `fetch`/`localStorage`/`indexedDB`. It means the engine is trivially testable, and it can be lifted into the microservices build verbatim later.

**2. `store/` is behind an interface.** Pages depend on `Repository`, never on Dexie. Swapping `LocalRepository` for an `HttpRepository` is one new file, with no change to any page or engine module.

**3. Nothing is faked.** Every figure on screen is computed by `engine/` from data in `store/`. Where a value genuinely cannot be computed, it returns `null` with a stated reason rather than a plausible-looking invention, and every calculation carries a `methodology` string describing its simplifications.

---

## Conventions the component library enforces

These exist because the previous build got each one wrong, screen by screen. Making them components means a screen cannot opt out by accident.

| Component | Convention |
|---|---|
| `<Amount>` | currency-aware. `formatUsd` does not exist - currency is a required argument, so a Nigerian balance sheet can never render with a dollar sign |
| `<RatioChart>` | thresholds are a **required** prop. Every ratio chart draws its regulatory floor and internal trigger |
| `<ResultTable>` | prior-period variance and drill-through to constituent rows are built in |
| `<Commentary>` | analyst narrative plus review sign-off, with maker ≠ checker enforced |
| `<ModuleHeader>` | `asOfDate` is a **required** prop. No screen can display undated figures |
| `<ErrorBoundary>` | wraps every route, so one render failure cannot blank the application |

`ScopeContext` carries the affiliate, as-of date and selected run. Changing the affiliate or date clears the selected run, because a run belongs to exactly one of each - carrying it across would show one affiliate's numbers under another's name.

---

## Testing

Vitest with jsdom, and `fake-indexeddb` so the store is exercised for real rather than mocked.

Coverage thresholds apply to `src/engine/` only - 90% lines, functions and statements, 80% branches - and CI fails below them. The engine computes regulatory ratios; the UI does not.

---

## Status

**Phase 0 - Foundation. Complete.**

Repo, build, quality gates, persistence layer, component library, auth and scope, routing with per-route lazy loading and error boundaries. All 57 screens appear in navigation with honest placeholders naming the phase that builds them.

Phase 1 is the engine, gated on reproducing the Ecobank mock workbook's own computed figures exactly.
