/**
 * Group reference data for all 33 affiliates.
 *
 * Onboarding Rwanda used to stall at step 2: the functional-currency field is
 * a dropdown of currencies that already exist, and RWF was not one of them.
 * Nothing in the wizard could create it, so the affiliate could not be set up
 * at all without a detour to another screen.
 *
 * Currencies, FX rates, the chart of accounts and the counterparty register
 * are Group-level reference data. A bank onboarding its thirty-fourth
 * affiliate does not invent the Rwandan franc — it already exists. What the
 * affiliate genuinely brings is its own org structure and its own balances,
 * and those still come in through onboarding.
 *
 * The org units are seeded too, because otherwise every roll-up reports
 * unmapped codes: the platform correctly refuses to invent a hierarchy, so
 * one has to exist.
 */

import type { CurrencyCode, DimensionMember, StoredCurrency, StoredFxRate } from '@/engine/types';

const STAMP = { source: 'Seed', updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z' };
const FX_AS_OF = '2026-07-31';

/**
 * (code, affiliate name, currency, symbol, units per USD).
 *
 * Rates are indicative mid-market levels for the period, not a live fixing —
 * they exist so consolidation works, and the FX Rates screen is where a real
 * one is loaded.
 */
const AFFILIATES: Array<[string, string, CurrencyCode, string, number]> = [
  ['CI', 'Ecobank Côte d’Ivoire', 'XOF', 'CFA', 605],
  ['SN', 'Ecobank Senegal', 'XOF', 'CFA', 605],
  ['ML', 'Ecobank Mali', 'XOF', 'CFA', 605],
  ['BF', 'Ecobank Burkina Faso', 'XOF', 'CFA', 605],
  ['BJ', 'Ecobank Benin', 'XOF', 'CFA', 605],
  ['TG', 'Ecobank Togo', 'XOF', 'CFA', 605],
  ['NE', 'Ecobank Niger', 'XOF', 'CFA', 605],
  ['GW', 'Ecobank Guinea-Bissau', 'XOF', 'CFA', 605],
  ['CM', 'Ecobank Cameroon', 'XAF', 'FCFA', 605],
  ['GA', 'Ecobank Gabon', 'XAF', 'FCFA', 605],
  ['CG', 'Ecobank Congo', 'XAF', 'FCFA', 605],
  ['TD', 'Ecobank Chad', 'XAF', 'FCFA', 605],
  ['CF', 'Ecobank Centrafrique', 'XAF', 'FCFA', 605],
  ['GQ', 'Ecobank Guinée Équatoriale', 'XAF', 'FCFA', 605],
  ['NG', 'Ecobank Nigeria', 'NGN', '₦', 1550],
  ['GH', 'Ecobank Ghana', 'GHS', 'GH₵', 12.4],
  ['GN', 'Ecobank Guinea', 'GNF', 'FG', 8600],
  ['SL', 'Ecobank Sierra Leone', 'SLE', 'Le', 22.8],
  ['LR', 'Ecobank Liberia', 'LRD', 'L$', 193],
  ['GM', 'Ecobank Gambia', 'GMD', 'D', 71],
  ['CV', 'Ecobank Cabo Verde', 'CVE', '$', 101],
  ['CD', 'Ecobank RD Congo', 'CDF', 'FC', 2800],
  ['ST', 'Ecobank São Tomé', 'STN', 'Db', 22.5],
  ['KE', 'Ecobank Kenya', 'KES', 'KSh', 129],
  ['UG', 'Ecobank Uganda', 'UGX', 'USh', 3680],
  ['TZ', 'Ecobank Tanzania', 'TZS', 'TSh', 2600],
  ['RW', 'Ecobank Rwanda', 'RWF', 'FRw', 1410],
  ['BI', 'Ecobank Burundi', 'BIF', 'FBu', 2950],
  ['SS', 'Ecobank South Sudan', 'SSP', 'SSP', 1300],
  ['MW', 'Ecobank Malawi', 'MWK', 'MK', 1740],
  ['ZM', 'Ecobank Zambia', 'ZMW', 'ZK', 26.5],
  ['ZW', 'Ecobank Zimbabwe', 'USD', '$', 1],
  ['MZ', 'Ecobank Mozambique', 'MZN', 'MT', 63.9],
];

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  XOF: 'West African CFA Franc', XAF: 'Central African CFA Franc', NGN: 'Nigerian Naira',
  GHS: 'Ghanaian Cedi', GNF: 'Guinean Franc', SLE: 'Sierra Leonean Leone', LRD: 'Liberian Dollar',
  GMD: 'Gambian Dalasi', CVE: 'Cape Verdean Escudo', CDF: 'Congolese Franc',
  STN: 'São Tomé and Príncipe Dobra', KES: 'Kenyan Shilling', UGX: 'Ugandan Shilling',
  TZS: 'Tanzanian Shilling', RWF: 'Rwandan Franc', BIF: 'Burundian Franc',
  SSP: 'South Sudanese Pound', MWK: 'Malawian Kwacha', ZMW: 'Zambian Kwacha',
  MZN: 'Mozambican Metical', USD: 'United States Dollar',
};

/** One row per distinct currency, since eight UEMOA affiliates share the XOF. */
export const AFFILIATE_CURRENCIES: StoredCurrency[] = Array.from(
  new Map(
    AFFILIATES.map(([, , ccy, symbol]) => [
      ccy,
      {
        code: ccy,
        name: CURRENCY_NAMES[ccy] ?? ccy,
        symbol,
        role: ccy === 'USD' ? ('Reporting' as const) : ('Active' as const),
        isActive: true,
      },
    ]),
  ).values(),
);

export const AFFILIATE_FX_RATES: StoredFxRate[] = Array.from(
  new Map(
    AFFILIATES.filter(([, , ccy]) => ccy !== 'USD').map(([, , ccy, , rate]) => [
      ccy,
      { id: `FX-USD-${ccy}`, base: 'USD', quote: ccy, rate, asOfDate: FX_AS_OF, ...STAMP },
    ]),
  ).values(),
);

function node(
  dimension: DimensionMember['dimension'],
  code: string,
  name: string,
  parentCode: string | null,
  isLeaf: boolean,
): DimensionMember {
  return { id: `${dimension}:${code}`, dimension, code, name, parentCode, isLeaf };
}

/**
 * Three business units per affiliate, beneath the Group root.
 *
 * Treasury, Corporate & Investment Bank, and Retail — the split the position
 * books are booked against, and the grain FTP attributes margin to.
 */
export const AFFILIATE_ORG_UNITS: DimensionMember[] = AFFILIATES.flatMap(([code, name]) => [
  node('OrgUnit', `OU-${code}`, name, 'OU-GROUP', false),
  node('OrgUnit', `OU-${code}-TSY`, `${name} — Treasury`, `OU-${code}`, true),
  node('OrgUnit', `OU-${code}-CIB`, `${name} — Corporate & Investment Bank`, `OU-${code}`, true),
  node('OrgUnit', `OU-${code}-RTL`, `${name} — Retail`, `OU-${code}`, true),
]);

/**
 * Legal entities for the affiliates that do not already have one.
 *
 * NG, GH and CI are seeded elsewhere with subsidiaries beneath them.
 * Re-creating them here would overwrite those parents as leaves and orphan
 * their children, since a member's id is derived from its code.
 */
const ALREADY_SEEDED_ENTITIES = new Set(['NG', 'GH', 'CI']);

export const AFFILIATE_LEGAL_ENTITIES: DimensionMember[] = AFFILIATES
  .filter(([code]) => !ALREADY_SEEDED_ENTITIES.has(code))
  .map(([code, name]) => node('LegalEntity', `LE-${code}`, name, 'LE-GROUP', true));

/**
 * The general ledger is deliberately NOT seeded here.
 *
 * `GlAccount` members are keyed by bare code, and the code space is not
 * scoped by affiliate: Nigeria's chart already owns `100101`, `200101`,
 * `300101` and five others. Adding a second chart with the same codes would
 * overwrite those members and reparent them under the wrong tree, so the
 * fix would be worse than the gap.
 *
 * The consequence is honest and worth showing rather than hiding: rolling the
 * balance sheet up by *local GL* is partial for a newly onboarded affiliate,
 * while rolling up by **Common Chart of Accounts** ties completely — because
 * every position carries its own `commonCoaCode`. That is exactly the problem
 * the Common COA exists to solve, and the reason consolidation does not
 * require thirty-three reconciled local charts.
 *
 * Scoping the GL dimension per affiliate is the real fix and is a schema
 * change, not a seeding change.
 */

/**
 * Counterparties referenced by the generated books.
 *
 * Depositor concentration groups by this identifier, so the figure is right
 * without the register — but the screen shows a code rather than a name, and
 * a large exposure with no name attached is not much of a finding.
 */
export const AFFILIATE_COUNTERPARTIES: DimensionMember[] = [
  node('Counterparty', 'CP-GROUP', 'All counterparties', null, false),
  node('Counterparty', 'CP-SOVEREIGN', 'Sovereign — government securities', 'CP-GROUP', true),
  node('Counterparty', 'CP-INTERBANK-01', 'Interbank market counterparties', 'CP-GROUP', true),
  node('Counterparty', 'CP-CORRESPONDENT-01', 'Correspondent banking network', 'CP-GROUP', true),
  node('Counterparty', 'CP-DFI-01', 'Development finance institutions', 'CP-GROUP', true),
  node('Counterparty', 'CP-BONDHOLDERS', 'Note holders — senior unsecured', 'CP-GROUP', true),
  node('Counterparty', 'CP-CORP-ISSUER-01', 'Corporate bond issuers', 'CP-GROUP', true),
  // Corporate depositors, numbered as the generated books reference them.
  ...Array.from({ length: 70 }, (_, i) =>
    node('Counterparty', `CP-CIB-${String(i + 1).padStart(3, '0')}`, `Corporate depositor ${i + 1}`, 'CP-GROUP', true),
  ),
  ...Array.from({ length: 70 }, (_, i) =>
    node('Counterparty', `CP-RTL-${String(i + 1).padStart(3, '0')}`, `Retail portfolio ${i + 1}`, 'CP-GROUP', true),
  ),
];

export const ALL_AFFILIATE_REFERENCE: DimensionMember[] = [
  ...AFFILIATE_LEGAL_ENTITIES,
  ...AFFILIATE_ORG_UNITS,
  ...AFFILIATE_COUNTERPARTIES,
];
