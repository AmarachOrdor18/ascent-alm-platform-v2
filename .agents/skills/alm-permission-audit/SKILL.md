---
name: alm-permission-audit
description: Security audit of authorization, RBAC and data-scope enforcement in the Ascent ALM platform — verify users can only access authorized functionality and data at navigation, UI, route, service and export layers, then fix gaps at the backend layer. Use when the user asks to audit or harden permissions, roles, scopes, affiliate access, or mentions users seeing data they shouldn't, API authorization, or segregation of duties — even if they don't say "permission audit".
---

# ALM Permission Audit

Act as a senior banking security architect and application security tester. Verify that users can only access the functionality and data they are authorized for. **Hiding a button is NOT sufficient security.** This is defensive security review of the user's own application.

## Critical instruction

Inspect first. Do not rebuild working functionality. Fix authorization at the correct backend/service layer, then re-test both the bypass path and legitimate access. Run `npm run verify` after every change.

## Roles to test

Inspect all existing roles from `src/context/AuthContext.tsx` and seed data — Administrator, Risk Analyst, Treasury User, Executive Viewer, Control Tester, Reporting User, country/affiliate/group users — **do not assume this list is complete; inspect the application.**

## Test layers

1. Navigation 2. UI controls 3. Page/route access (direct URL entry) 4. Service/API layer (call repository/service functions directly with an unauthorized user's context) 5. Data/query layer (`src/store/repository.ts` filters) 6. Export 7. Cached data.

## Data scope testing

Test scope enforcement across Group / Country / Legal entity / Affiliate / Branch / Business unit / Currency (`src/lib/scope.ts`, `src/context/ScopeContext.tsx`). For restricted users, verify they cannot retrieve unauthorized data by: changing filters, changing URL parameters, calling services directly, manipulating IDs, exporting, searching, using drill-down.

## Horizontal access

User A (own affiliate) → attempt access to Affiliate B. The system must deny it — not merely display it differently.

## Vertical access

Test whether lower-privilege users can reach administrative capabilities (configuration, user management, rule management, reference data, report templates, approval, audit logs) through indirect routes.

## Maker/checker

Verify segregation of duties: a maker must not approve their own controlled submission, at the service layer.

## Export security

Exports must respect the same data scope as the UI. A user must not be able to export data they cannot view.

## Audit trail

Security-sensitive actions (denied attempts included) should be logged: user, role, action, object, timestamp, result.

## Fixes

For each vulnerability: identify the attack path and root cause, fix authorization at the backend/service layer, add UI restrictions where appropriate, re-test the bypass path, re-test legitimate access, ensure no regression.

## Output

Role matrix; permission gaps; data-scope gaps; API/service authorization gaps; export gaps; segregation-of-duty gaps; fixes completed; remaining risks. Classify each Critical / High / Medium / Low. **Never consider a permission issue resolved merely because the UI hides the control.**
