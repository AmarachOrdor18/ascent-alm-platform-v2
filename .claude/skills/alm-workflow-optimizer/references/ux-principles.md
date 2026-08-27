# UX principles

These govern *how* a REQUIRED step is presented, never *whether* it stays. If a principle
below and a control in `protected-controls.md` point in different directions, the control
wins — reduce the friction around it, don't remove it (see `workflow-rules.md` R6).

**Progressive disclosure.** Show required fields first, common options second, advanced
configuration only on demand. `ShockCurveEditor.tsx` and `BucketTimeline.tsx` already do
this — only the controls relevant to the chosen shock/bucket shape render. A new
configuration screen should follow the same pattern rather than exposing every field at
once, the way the pre-refactor Onboarding Connectivity table did before it was simplified.

**Context preservation.** Once `useScope()` has an `affiliateCode`/`asOfDate`, or `useAuth()`
has a `user`, don't make the user re-supply it. `ScopeContext`'s auto-sync to
`user.affiliateCode` on login is the reference implementation. When a screen deliberately
needs a *different* affiliate than the current scope (a report generator picking one to
report on, an Admin comparing two), that's a legitimate exception — say so explicitly in the
proposal rather than silently treating it as a bug.

**Information hierarchy.** Lead with what needs attention, not with everything the screen
has. `RiskMap.tsx`'s severity-badge table and the Risk Snapshot's 6 tiles (including
"In breach") are the pattern: state before detail, exception before normal.

**Exception-first design.** A breach, a red KRI, an unmapped COA node, an "Access
restricted" panel — surface these ahead of the routine data around them. Limits & Breaches
and KRI should read as "here's what's wrong" first, "here's everything" second.

**Direct access to important actions.** `ModuleHeader`'s `actions` slot is the one place a
screen's primary action belongs (Download PDF, Email pack, Onboard affiliate, Submit for
approval). One clear primary action per screen — don't give three buttons equal visual
weight when only one is used in the actual workflow.

**Reducing repeated data entry.** If two adjacent steps in the same wizard ask for
overlapping information (e.g. an affiliate code entered once at step 1 shouldn't be
re-typed at step 4), that's an AUTOMATABLE finding.

**Sensible defaults, never silent ones for controls.** Defaulting `reportingCurrency` to
`'USD'` or `fiscalYearEnd` to `'12-31'` in `OnboardAffiliate.tsx`'s `EMPTY` draft is fine —
these are editable conveniences. Never default a *control* field (a permission, an approval
decision, a status) to the more-permissive value; those must be explicit user actions or
system-computed from unambiguous context, never a silent form default.

**Conditional fields.** Don't render fields irrelevant to the current selection — see
Progressive disclosure above; same mechanism, applied per-field rather than per-screen.

**Drill-down from summary to detail.** A summary number (Risk Snapshot tile, KRI, a Limits
breach count) should have a path to the exposure behind it. `RiskMap.tsx`'s conversion from
cards to a table with `renderDetail` is the shipped example.

**Consistency across modules.** Filters, date/scope selection, export, and drill-down
should behave the same way on every screen that has them — reuse `TableToolbar` /
`TablePagination` / `useTableControls` / `InfoButton` / `ModuleHeader` rather than
reinventing a variant per screen.

**Reducing unnecessary page transitions.** Prefer keeping a user on one screen for a single
logical task (see `good-optimization.md`'s ALCO/Management Reporting merge) over spreading
one task across pages purely because of route structure.

**Reducing cognitive load.** Fewer simultaneous decisions, clearer labels ("Report User",
not "reporting.generate holder"), and status made visible via `StatusBadge` rather than
requiring the user to infer it.

**Avoiding unnecessary configuration exposure.** A role without `data.configure` or
`admin.manage` shouldn't see configuration surface just because a screen happens to be
reachable — this is enforced by `RouteGate` today; a UX proposal should never work around it
by, say, putting an admin action inline on a screen a non-admin role can reach.
