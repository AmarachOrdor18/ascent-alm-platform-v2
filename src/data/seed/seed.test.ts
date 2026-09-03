/**
 * Seed integrity.
 *
 * A fresh platform ships only the Group entity - no pre-populated country
 * affiliates, no fake position books, no login confined to one. Real
 * affiliates come from the Onboarding wizard, not the seed. These checks
 * confirm that stays true, and that the Nigeria fixture data still used by
 * the engine's own tests (nigeria.ts) is internally consistent even though
 * it's no longer written into the seeded database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AscentDb } from '@/store/db';
import { LocalRepository } from '@/store/localRepository';
import { ensureSeeded, reseed } from './bootstrap';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF } from './nigeria';
import {
  AFFILIATES,
  ALL_DIMENSION_MEMBERS,
  FX_RATES,
  YIELD_CURVES,
  ECONOMIC_INDICATORS,
  HOLIDAY_CALENDARS,
} from './reference';
import { buildFxTable, missingRates } from '@/engine/fx';
import { unmappedCodes } from '@/engine/dimensions';
import { interpolateCurve } from '@/engine/ftp';
import { validatePositions } from '@/engine/validation';

let repo: LocalRepository;
let counter = 0;

beforeEach(async () => {
  const db = new AscentDb(`seed-test-${counter++}`);
  await db.open();
  repo = new LocalRepository(db);
});

describe('bootstrap', () => {
  it('seeds an empty database with only the Group entity, no fake business data', async () => {
    expect(await ensureSeeded(repo)).toBe(true);
    const affiliates = await repo.listAffiliates();
    expect(affiliates).toHaveLength(AFFILIATES.length);
    expect(affiliates.map((a) => a.code)).toEqual(['GROUP']);
    expect(await repo.queryPositions({})).toHaveLength(0);
    expect(await repo.listBatches()).toHaveLength(0);
  });

  it('is idempotent - a refresh never discards work', async () => {
    await ensureSeeded(repo);
    const group = (await repo.getAffiliate('GROUP'))!;
    await repo.upsertAffiliate({ ...group, name: 'Edited by the user' });

    expect(await ensureSeeded(repo)).toBe(false);
    const after = (await repo.getAffiliate('GROUP'))!;
    expect(after.name).toBe('Edited by the user');
  });

  it('reseed discards edits and restores the shipped state', async () => {
    await ensureSeeded(repo);
    const group = (await repo.getAffiliate('GROUP'))!;
    const shippedName = group.name;
    await repo.upsertAffiliate({ ...group, name: 'Edited' });
    await reseed(repo);
    const after = (await repo.getAffiliate('GROUP'))!;
    expect(after.name).toBe(shippedName);
  });
});

describe('no affiliate ships pre-onboarded', () => {
  it('has nothing for a restricted seed login to be confined to', async () => {
    await ensureSeeded(repo);
    const users = await repo.listUsers();
    // Every seed login is Group-scoped - none references an affiliate that doesn't exist.
    for (const u of users) expect(u.affiliateCode).toBe('GROUP');
  });

  it('starts every domain feed unconfigured, since there is no affiliate to configure one for', async () => {
    await ensureSeeded(repo);
    const affiliates = await repo.listAffiliates();
    for (const a of affiliates) expect(a.feeds).toHaveLength(0);
  });

  it('seeds no FX rate, yield curve, holiday calendar or economic indicator - that is Treasury/Risk\'s own setup', async () => {
    await ensureSeeded(repo);
    expect(await repo.listFxRates()).toHaveLength(0);
    expect(await repo.listYieldCurves()).toHaveLength(0);
    expect(await repo.listHolidayCalendars()).toHaveLength(0);
    expect(await repo.listEconomicIndicators()).toHaveLength(0);
    // Currency *definitions* still ship, so onboarding's functional-currency picker isn't empty.
    expect((await repo.listCurrencies()).length).toBeGreaterThan(0);
  });

  it('seeds no country-specific org unit, legal entity, GL account or counterparty', async () => {
    await ensureSeeded(repo);
    const members = (
      await Promise.all(
        (['LegalEntity', 'OrgUnit', 'Product', 'GlAccount', 'Counterparty'] as const).map((d) =>
          repo.listDimensionMembers(d),
        ),
      )
    ).flat();
    for (const m of members) expect(m.affiliateCode, `${m.dimension} ${m.code}`).toBe('GROUP');
  });

  it('still gives Onboarding a Group chart of accounts to clone from', async () => {
    await ensureSeeded(repo);
    const commonCoa = await repo.listDimensionMembers('CommonCoa');
    const groupLeaves = commonCoa.filter((m) => m.affiliateCode === 'GROUP' && m.isLeaf);
    expect(groupLeaves.length).toBeGreaterThan(0);
  });
});

describe('referential integrity', () => {
  it('resolves every position org unit, product, GL account and COA code', () => {
    for (const dimension of ['OrgUnit', 'Product', 'GlAccount', 'CommonCoa'] as const) {
      const missing = unmappedCodes(NIGERIA_POSITIONS, dimension, ALL_DIMENSION_MEMBERS);
      expect(missing, `${dimension} has unmapped codes: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('resolves every counterparty referenced by a position', () => {
    const known = new Set(ALL_DIMENSION_MEMBERS.filter((m) => m.dimension === 'Counterparty').map((m) => m.code));
    const referenced = NIGERIA_POSITIONS.map((p) => p.counterpartyId).filter((c): c is string => c !== null);
    for (const code of referenced) expect(known.has(code), `unknown counterparty ${code}`).toBe(true);
  });

  it('points every affiliate at a legal entity that exists', () => {
    const entities = new Set(ALL_DIMENSION_MEMBERS.filter((m) => m.dimension === 'LegalEntity').map((m) => m.code));
    for (const a of AFFILIATES) expect(entities.has(a.legalEntityCode), `${a.code} → ${a.legalEntityCode}`).toBe(true);
  });

  it('points every affiliate holiday calendar at one that exists', () => {
    const calendars = new Set(HOLIDAY_CALENDARS.map((c) => c.id));
    for (const a of AFFILIATES) {
      if (a.holidayCalendarId) expect(calendars.has(a.holidayCalendarId), `${a.code}`).toBe(true);
    }
  });
});

describe('FX coverage', () => {
  const table = buildFxTable('USD', FX_RATES, NIGERIA_AS_OF);

  it('can convert every currency any affiliate transacts in', () => {
    const required = Array.from(new Set(AFFILIATES.flatMap((a) => [a.functionalCurrency, ...a.activeCurrencies])));
    expect(missingRates(required, 'USD', table)).toEqual([]);
  });

  it('holds XOF near its euro peg', () => {
    // XOF is fixed to EUR at 655.957. Cross-checking through USD should land
    // close to that, and a seed drifting far from it is a data error.
    const xofPerEur = (1 / table.toPivot.XOF!) * table.toPivot.EUR!;
    expect(xofPerEur).toBeGreaterThan(600);
    expect(xofPerEur).toBeLessThan(700);
  });
});

describe('yield curves', () => {
  it('covers every affiliate functional currency', () => {
    const covered = new Set(YIELD_CURVES.map((c) => c.currency));
    for (const a of AFFILIATES) {
      if (a.code === 'GROUP') continue;
      expect(covered.has(a.functionalCurrency), `no curve for ${a.functionalCurrency}`).toBe(true);
    }
  });

  // Not written into the seeded database (see 'no affiliate ships pre-onboarded' above) - a fresh
  // platform's Treasury team sets these up themselves - but the reference constant itself must still be
  // internally sound, since it's the starting point an affiliate's own curve is built from.
  it('stores term points in ascending tenor order', () => {
    for (const curve of YIELD_CURVES) {
      const tenors = curve.terms.map((t) => t.tenorDays);
      expect(tenors).toEqual([...tenors].sort((a, b) => a - b));
    }
  });

  it('interpolates the NGN curve to a sensible mid-tenor rate', () => {
    const ngn = YIELD_CURVES.find((c) => c.currency === 'NGN')!;
    const rate = interpolateCurve(
      { currency: 'NGN', indexCode: ngn.code, points: ngn.terms, asOfDate: ngn.asOfDate },
      197,
    );
    // Between the 6M (20.4%) and 1Y (21.0%) points.
    expect(rate!).toBeGreaterThan(20.4);
    expect(rate!).toBeLessThan(21.0);
  });

  it('models the Nigerian curve as inverted, which is the shape it has run', () => {
    const ngn = YIELD_CURVES.find((c) => c.currency === 'NGN')!;
    expect(ngn.terms[ngn.terms.length - 1]!.ratePercent).toBeLessThan(ngn.terms[0]!.ratePercent);
  });
});

describe('economic indicators and calendars', () => {
  it('gives at least one indicator to the markets Ecobank actually operates in, ready for whenever one is onboarded', () => {
    for (const code of ['NG', 'GH', 'CI']) {
      expect(
        ECONOMIC_INDICATORS.some((i) => i.countryCode === code),
        code,
      ).toBe(true);
    }
  });

  // Not written into the seeded database either - same reasoning as the yield curve above.
  it('orders observations ascending in the reference constant', () => {
    for (const indicator of ECONOMIC_INDICATORS) {
      const dates = indicator.observations.map((o) => o.asOfDate);
      expect(dates).toEqual([...dates].sort());
    }
  });

  it('defines a weekend and holidays for every calendar', () => {
    for (const c of HOLIDAY_CALENDARS) {
      expect(c.weekendDays.length).toBeGreaterThan(0);
      expect(c.holidays.length).toBeGreaterThan(0);
    }
  });
});

describe('the Nigeria engine-test fixture passes its own validation rules', () => {
  // NIGERIA_POSITIONS is no longer written into the seeded database (see 'no affiliate ships
  // pre-onboarded' above), but engine.test.ts, ftpAssignment.test.ts, shocks.test.ts and others still
  // use it as realistic sample data - it must stay internally valid on its own terms.
  it('commits without a blocking exception', () => {
    const result = validatePositions(NIGERIA_POSITIONS, {
      asOfDate: NIGERIA_AS_OF,
      knownAffiliateCodes: ['NG'],
    });
    expect(result.blocked, result.exceptions.map((e) => e.description).join('; ')).toBe(false);
  });
});
