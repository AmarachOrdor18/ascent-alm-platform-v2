/**
 * `resolveSingleAffiliate`'s fallback.
 *
 * `listAffiliates()` orders by primary key (Dexie's `orderBy('code')`), so
 * a plain `array.find(a => a.code !== 'GROUP')` silently picked whichever
 * affiliate's code sorted first alphabetically — Côte d'Ivoire over Nigeria,
 * with nothing to do with which affiliate was actually meant. These hold
 * the deterministic-by-onboarding-date fallback that replaced it.
 */

import { describe, expect, it } from 'vitest';
import { resolveSingleAffiliate } from './hooks';

interface Fixture {
  code: string;
  createdAt: string;
}

const NG: Fixture = { code: 'NG', createdAt: '2026-01-01T00:00:00.000Z' };
const GH: Fixture = { code: 'GH', createdAt: '2026-02-01T00:00:00.000Z' };
const CI: Fixture = { code: 'CI', createdAt: '2026-03-01T00:00:00.000Z' };
const GROUP: Fixture = { code: 'GROUP', createdAt: '2025-01-01T00:00:00.000Z' };

// Deliberately in alphabetical order (CI, GH, GROUP, NG) — matching what
// Dexie's orderBy('code') actually returns, rather than onboarding order.
const ALPHABETICAL = [CI, GH, GROUP, NG];

describe('resolveSingleAffiliate', () => {
  it('returns the exact match when scope names a real affiliate', () => {
    expect(resolveSingleAffiliate(ALPHABETICAL, 'GH')).toBe(GH);
  });

  it('never returns the GROUP row itself, even when scope literally is GROUP', () => {
    const result = resolveSingleAffiliate(ALPHABETICAL, 'GROUP');
    expect(result?.code).not.toBe('GROUP');
  });

  it('falls back to the earliest-onboarded affiliate, not whichever sorts first alphabetically', () => {
    // NG was onboarded first (2026-01-01) despite "CI" sorting before "NG".
    // The old fallback — a plain array.find — returned CI here.
    expect(resolveSingleAffiliate(ALPHABETICAL, 'GROUP')?.code).toBe('NG');
  });

  it('falls back the same way when scope names an affiliate that no longer exists', () => {
    expect(resolveSingleAffiliate(ALPHABETICAL, 'ZZ')?.code).toBe('NG');
  });

  it('returns undefined when nothing has been onboarded', () => {
    expect(resolveSingleAffiliate([GROUP], 'GROUP')).toBeUndefined();
  });

  it('is stable regardless of the input array order', () => {
    const shuffled = [NG, GROUP, CI, GH];
    expect(resolveSingleAffiliate(shuffled, 'GROUP')?.code).toBe('NG');
  });
});
