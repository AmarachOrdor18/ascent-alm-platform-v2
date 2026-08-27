# Good optimization — already shipped in this codebase

## Current (before this session)
Sidebar → ALCO Reporting (separate screen) and Sidebar → Management Reporting (separate
screen) — two nearly-identical report-pack screens, same actions (generate, download,
email), different data source, no shared code.

## Problem
NAVIGATION-ONLY split: both screens performed the same task (produce and distribute a
report pack) with the same permission (`reporting.view` to see, `reporting.generate` to
act) and the same UI shape. The only real difference was which report-pack type was
selected — a filter, not a separate screen.

## Proposed and implemented
`ReportPacks.tsx` — one screen, tab-switched between ALCO and Management, both rendering
the shared `ReportPackScreen.tsx`. One sidebar entry (`Report Packs`, `/alco-reporting`)
instead of two.

## Removed / Combined
- One sidebar entry removed (REDUNDANT navigation).
- `canEdit` logic and the PDF export path (`src/lib/pdfExport.ts`) shared instead of
  duplicated across two files.

## Preserved controls
- `reporting.view` still required to see either tab.
- `reporting.generate` (or `reporting.manage`/`run.execute`) still required for
  Generate/Download/Email — unchanged, just centralized in one `canEdit` check instead of
  two copies that could have drifted.

## Role impact
| Role | Impact |
|---|---|
| Reporting User | One less sidebar entry to scan; same two report types, one tab click away instead of one nav click away — net navigation unchanged, cognitive load down (one screen to learn, not two). |
| Executive Viewer | Same — `reporting.view` only, read-only either way. |
| Admin | No change — already had access to both. |

## Expected improvement
Screens: 2 → 1 (with 2 tabs) · Sidebar entries: 2 → 1 · Duplicated `canEdit`/export logic:
2 copies → 1 shared component.
