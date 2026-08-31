/**
 * `deriveMembersFromFile` — the "map from this file" action on Data Upload.
 *
 * Before this existed, a newly onboarded affiliate could never commit its
 * first position book: `GlAccount` was never seeded per affiliate (seeding
 * it would have overwritten Nigeria's, Ghana's or Côte d'Ivoire's own local
 * chart, which share the same code space), so every one of its GL codes
 * showed up "unmapped" with no in-app way to resolve it short of manually
 * re-typing twenty-odd codes on the Dimensions screen. The file already says
 * what each code is — a product class, a counterparty id — so this reads
 * that back rather than asking a human to retype it.
 */

import { describe, expect, it } from 'vitest';
import { deriveMembersFromFile } from './dimensions';
import { NIGERIA_POSITIONS } from '@/data/seed/nigeria';
import type { Position } from './types';

function position(overrides: Partial<Position>): Position {
  return { ...NIGERIA_POSITIONS[0]!, ...overrides };
}

describe('deriveMembersFromFile', () => {
  it('creates a leaf per unmapped GL code, named from the position that carries it', () => {
    const positions = [
      position({ id: 'P1', glAccountCode: '200601', productClass: 'Loans And Advances - Corporate' }),
      position({ id: 'P2', glAccountCode: '200602', productClass: 'Overdrafts - Corporate' }),
    ];
    const members = deriveMembersFromFile('GlAccount', ['200601', '200602'], positions, 'RW', 'Ecobank Rwanda');

    const loan = members.find((m) => m.code === '200601');
    expect(loan?.name).toBe('Loans And Advances - Corporate');
    expect(loan?.isLeaf).toBe(true);

    const overdraft = members.find((m) => m.code === '200602');
    expect(overdraft?.name).toBe('Overdrafts - Corporate');
  });

  it('creates one root per affiliate and parents every GL leaf under it', () => {
    const positions = [position({ id: 'P1', glAccountCode: '200601', productClass: 'Loans' })];
    const members = deriveMembersFromFile('GlAccount', ['200601'], positions, 'RW', 'Ecobank Rwanda');

    const root = members.find((m) => m.code === 'GL-RW');
    expect(root).toMatchObject({ isLeaf: false, parentCode: null, name: 'Ecobank Rwanda — Local Chart' });
    expect(members.find((m) => m.code === '200601')?.parentCode).toBe('GL-RW');
  });

  it('does not create a GL root at all when there are no GL codes to map', () => {
    const positions = [position({ id: 'P1', counterpartyId: 'CP-CIB-001' })];
    const members = deriveMembersFromFile('Counterparty', ['CP-CIB-001'], positions, 'RW', 'Ecobank Rwanda');
    expect(members.some((m) => m.dimension === 'GlAccount')).toBe(false);
  });

  it('names an org unit or counterparty leaf by its own code, since the file carries no separate name for either', () => {
    const positions = [position({ id: 'P1', orgUnitCode: 'OU-RW-CIB' })];
    const members = deriveMembersFromFile('OrgUnit', ['OU-RW-CIB'], positions, 'RW', 'Ecobank Rwanda');
    expect(members).toEqual([
      { id: 'OrgUnit:RW:OU-RW-CIB', dimension: 'OrgUnit', affiliateCode: 'RW', code: 'OU-RW-CIB', name: 'OU-RW-CIB', parentCode: null, isLeaf: true },
    ]);
  });

  it('refuses to auto-create CommonCoa members — that taxonomy is governed, not inferred', () => {
    const positions = [position({ id: 'P1', commonCoaCode: 'COA-99' })];
    expect(deriveMembersFromFile('CommonCoa', ['COA-99'], positions, 'RW', 'Ecobank Rwanda')).toEqual([]);
  });

  it('falls back to the bare code as a name when no position actually carries it', () => {
    // Should not happen in practice — the codes come from the same file the
    // positions do — but a defensive default beats a crash.
    const members = deriveMembersFromFile('GlAccount', ['999999'], [], 'RW', 'Ecobank Rwanda');
    expect(members.find((m) => m.code === '999999')?.name).toBe('999999');
  });

  it('returns nothing for an empty code list', () => {
    expect(deriveMembersFromFile('GlAccount', [], NIGERIA_POSITIONS, 'RW', 'Ecobank Rwanda')).toEqual([]);
  });

  it('is stable to call twice — ids are deterministic, so a re-run upserts rather than duplicating', () => {
    const positions = [position({ id: 'P1', glAccountCode: '200601', productClass: 'Loans' })];
    const first = deriveMembersFromFile('GlAccount', ['200601'], positions, 'RW', 'Ecobank Rwanda');
    const second = deriveMembersFromFile('GlAccount', ['200601'], positions, 'RW', 'Ecobank Rwanda');
    expect(first).toEqual(second);
  });
});
