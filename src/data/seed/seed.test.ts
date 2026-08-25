/**
 * Seed integrity.
 *
 * These are the checks that catch a broken demo before a demo does: every
 * position resolves to a real dimension member, every affiliate currency is
 * convertible, and the three lifecycle states the demo depends on are
 * actually present.
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
  it('seeds an empty database', async () => {
    expect(await ensureSeeded(repo)).toBe(true);
    expect(await repo.listAffiliates()).toHaveLength(AFFILIATES.length);
    expect(await repo.queryPositions({ affiliateCode: 'NG' })).toHaveLength(NIGERIA_POSITIONS.length);
  });

  it('is idempotent — a refresh never discards work', async () => {
    await ensureSeeded(repo);
    await repo.upsertYieldCurve({ ...YIELD_CURVES[0]!, name: 'Edited by the user' });

    expect(await ensureSeeded(repo)).toBe(false);
    const curve = await repo.getYieldCurve(YIELD_CURVES[0]!.id);
    expect(curve!.name).toBe('Edited by the user');
  });

  it('reseed discards edits and restores the shipped state', async () => {
    await ensureSeeded(repo);
    await repo.upsertYieldCurve({ ...YIELD_CURVES[0]!, name: 'Edited' });
    await reseed(repo);
    const curve = await repo.getYieldCurve(YIELD_CURVES[0]!.id);
    expect(curve!.name).toBe(YIELD_CURVES[0]!.name);
  });
});

describe('demo narrative depends on three lifecycle states', () => {
  it('ships one Live affiliate, one mid-onboarding and one not started', async () => {
    await ensureSeeded(repo);
    const affiliates = await repo.listAffiliates();

    const ng = affiliates.find((a) => a.code === 'NG')!;
    const gh = affiliates.find((a) => a.code === 'GH')!;
    const ci = affiliates.find((a) => a.code === 'CI')!;

    expect(ng.status).toBe('Live');
    expect(gh.status).toBe('Onboarding');
    expect(ci.status).toBe('Onboarding');

    // Ghana has connectors configured but no data; Côte d'Ivoire has nothing.
    expect(gh.feeds.length).toBeGreaterThan(0);
    expect(ci.feeds).toHaveLength(0);
  });

  it('declares Ghana file-fed for positions, since its Flexcube is unreachable', async () => {
    await ensureSeeded(repo);
    const gh = (await repo.getAffiliate('GH'))!;
    expect(gh.feeds.find((f) => f.domain === 'Positions')!.mode).toBe('File');
  });

  it('provides position data for all three affiliates', async () => {
    await ensureSeeded(repo);
    expect((await repo.queryPositions({ affiliateCode: 'GH' })).length).toBeGreaterThan(0);
    expect((await repo.queryPositions({ affiliateCode: 'CI' })).length).toBeGreaterThan(0);
    expect((await repo.queryPositions({ affiliateCode: 'NG' })).length).toBeGreaterThan(0);
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

  it('stores term points in ascending tenor order', async () => {
    await ensureSeeded(repo);
    for (const curve of await repo.listYieldCurves()) {
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
  it('gives every demo affiliate at least one indicator', () => {
    for (const code of ['NG', 'GH', 'CI']) {
      expect(
        ECONOMIC_INDICATORS.some((i) => i.countryCode === code),
        code,
      ).toBe(true);
    }
  });

  it('orders observations ascending on write', async () => {
    await ensureSeeded(repo);
    for (const indicator of await repo.listEconomicIndicators()) {
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

describe('the seed passes its own validation rules', () => {
  it('commits without a blocking exception', () => {
    const result = validatePositions(NIGERIA_POSITIONS, {
      asOfDate: NIGERIA_AS_OF,
      knownAffiliateCodes: AFFILIATES.map((a) => a.code),
    });
    expect(result.blocked, result.exceptions.map((e) => e.description).join('; ')).toBe(false);
  });
});
