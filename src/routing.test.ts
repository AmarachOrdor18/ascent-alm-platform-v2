/**
 * Route ordering.
 *
 * `Switch` renders the first route that matches, so declaration order is a
 * correctness property, not a style choice. `/affiliates/:code` matches every
 * literal path beneath `/affiliates` — declared before the nav routes it
 * swallowed `/affiliates/onboard` and rendered a blank page. The click did
 * nothing and there was no error to follow, which is the worst shape a bug
 * can take.
 *
 * These tests assert the invariant directly against the array the router
 * renders from, so they cannot drift away from what actually ships.
 */

import { describe, expect, it } from 'vitest';
import { buildRouteOrder } from './App';
import { ALL_NAV_ITEMS } from './components/layout/navigation';

const ROUTES = buildRouteOrder();

/** Does a wouter-style pattern match a concrete path? */
function matches(pattern: string, path: string): boolean {
  const source = pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}$`).test(path);
}

/** What the router would actually render for a path. */
function firstMatch(path: string) {
  return ROUTES.find((r) => matches(r.path, path)) ?? null;
}

describe('matches — the helper itself', () => {
  it('treats a parameter segment as a wildcard for one segment', () => {
    expect(matches('/affiliates/:code', '/affiliates/NG')).toBe(true);
    expect(matches('/affiliates/:code', '/affiliates/onboard')).toBe(true);
    expect(matches('/affiliates/:code', '/affiliates')).toBe(false);
    expect(matches('/affiliates/:code', '/affiliates/NG/detail')).toBe(false);
  });

  it('matches a literal path exactly', () => {
    expect(matches('/affiliates', '/affiliates')).toBe(true);
    expect(matches('/affiliates', '/affiliates/NG')).toBe(false);
  });
});

describe('route order', () => {
  it('reaches the onboarding wizard rather than the affiliate detail wildcard', () => {
    // The regression. Before the fix this resolved to /affiliates/:code,
    // whose handler returned null — a blank page under a working nav link.
    expect(firstMatch('/affiliates/onboard')?.path).toBe('/affiliates/onboard');
  });

  it('still reaches affiliate detail for a real affiliate code', () => {
    expect(firstMatch('/affiliates/NG')?.path).toBe('/affiliates/:code');
    expect(firstMatch('/affiliates/GH')?.screenName).toBe('Affiliate Detail');
  });

  it('resolves every navigable path to its own route', () => {
    // Any nav item shadowed by an earlier pattern is a dead link in the
    // sidebar, which is exactly how this defect presented.
    const shadowed = ALL_NAV_ITEMS.filter((item) => firstMatch(item.path)?.path !== item.path);
    expect(shadowed.map((i) => `${i.name} (${i.path})`)).toEqual([]);
  });

  it('declares every literal path before any parameterised one', () => {
    const firstParameterised = ROUTES.findIndex((r) => r.path.includes(':'));
    if (firstParameterised === -1) return;
    const literalsAfter = ROUTES.slice(firstParameterised).filter((r) => !r.path.includes(':'));
    expect(literalsAfter.map((r) => r.path)).toEqual([]);
  });

  it('has no duplicate paths, since only the first would ever render', () => {
    const seen = new Set<string>();
    const duplicates = ROUTES.filter((r) => (seen.has(r.path) ? true : (seen.add(r.path), false)));
    expect(duplicates.map((r) => r.path)).toEqual([]);
  });

  it('gives every route a component and a screen name for its error boundary', () => {
    // React.lazy components are objects with $$typeof Symbol(react.lazy), not plain functions
    const hasValidComponent = (r: typeof ROUTES[0]) => {
      return typeof r.Component === 'function' || 
             (r.Component && typeof r.Component === 'object' && '$$typeof' in r.Component);
    };
    expect(ROUTES.every(hasValidComponent)).toBe(true);
    expect(ROUTES.every((r) => r.screenName.length > 0)).toBe(true);
  });

  it('keeps the sidebar to the ~13 module-level items the navigation redesign intends', () => {
    // Deliberately small on purpose — individual screens are tabs inside a
    // module (see src/pages/modules/*), not standing sidebar rows. This is
    // the inverse of the pre-redesign invariant here (which asserted > 30).
    expect(ALL_NAV_ITEMS.length).toBeGreaterThanOrEqual(10);
    expect(ALL_NAV_ITEMS.length).toBeLessThanOrEqual(15);
  });

  it('registers every module tab path exactly once and gives it a real permission', () => {
    const moduleTabRoutes = ROUTES.filter((r) => !ALL_NAV_ITEMS.some((i) => i.path === r.path) && r.path.includes('/'));
    expect(moduleTabRoutes.length).toBeGreaterThan(0);
    expect(moduleTabRoutes.every((r) => typeof r.permission === 'string' && r.permission.length > 0)).toBe(true);
  });
});

describe('route-level permission gating', () => {
  // Regression for: the sidebar hid a link a role couldn't reach, but
  // nothing stopped that role from rendering the full screen anyway via a
  // typed URL or an already-open tab — permission only ever gated the edit
  // buttons inside a page. Every route must now carry a real permission
  // string the router actually enforces (see RouteGate in App.tsx).

  it('gives every route a non-empty permission', () => {
    expect(ROUTES.every((r) => typeof r.permission === 'string' && r.permission.length > 0)).toBe(true);
  });

  it('matches each nav-listed route\'s permission to its sidebar entry — the two must never drift apart', () => {
    for (const item of ALL_NAV_ITEMS) {
      const route = ROUTES.find((r) => r.path === item.path);
      expect(route?.permission).toBe(item.permission);
    }
  });

  it('gates every /rules/* sub-editor behind rules.edit, matching the Business Rules hub itself', () => {
    const ruleSubRoutes = ROUTES.filter((r) => r.path.startsWith('/rules/'));
    expect(ruleSubRoutes.length).toBeGreaterThan(0);
    expect(ruleSubRoutes.every((r) => r.permission === 'rules.edit')).toBe(true);
  });
});
