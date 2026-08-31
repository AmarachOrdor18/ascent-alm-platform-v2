import type { CurrencyCode, DimensionMember, StoredCurrency, StoredFxRate } from '@/engine/types';

const STAMP = { source: 'Seed', updatedBy: 'SEED', updatedAt: '2026-01-01T00:00:00.000Z' };
const FX_AS_OF = '2026-07-31';

// (code, affiliate name, currency, symbol, units per USD). Rates are indicative, not a live fixing.
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
  affiliateCode: string,
  code: string,
  name: string,
  parentCode: string | null,
  isLeaf: boolean,
): DimensionMember {
  return { id: `${dimension}:${affiliateCode}:${code}`, dimension, affiliateCode, code, name, parentCode, isLeaf };
}

// Treasury, Corporate & Investment Bank, and Retail — seeded so roll-ups don't hit unmapped codes.
export const AFFILIATE_ORG_UNITS: DimensionMember[] = AFFILIATES.flatMap(([code, name]) => [
  node('OrgUnit', code, `OU-${code}`, name, 'OU-GROUP', false),
  node('OrgUnit', code, `OU-${code}-TSY`, `${name} — Treasury`, `OU-${code}`, true),
  node('OrgUnit', code, `OU-${code}-CIB`, `${name} — Corporate & Investment Bank`, `OU-${code}`, true),
  node('OrgUnit', code, `OU-${code}-RTL`, `${name} — Retail`, `OU-${code}`, true),
]);

// NG, GH and CI already have entities with subsidiaries seeded elsewhere; recreating them here would collide with those (now affiliate-namespaced) ids.
const ALREADY_SEEDED_ENTITIES = new Set(['NG', 'GH', 'CI']);

export const AFFILIATE_LEGAL_ENTITIES: DimensionMember[] = AFFILIATES
  .filter(([code]) => !ALREADY_SEEDED_ENTITIES.has(code))
  .map(([code, name]) => node('LegalEntity', code, `LE-${code}`, name, 'LE-GROUP', true));

// The general ledger is deliberately not seeded here — GL Account is genuinely different data per affiliate
// (different chart, different scheme), not filler.
//
// The corporate/retail depositor pool below IS filler — a generic, identical placeholder every affiliate's
// generated demo book references — but every dimension is affiliate-owned now, so each affiliate gets its own
// copy rather than one shared list.
function counterpartyPoolFor(affiliateCode: string): DimensionMember[] {
  const cp = (code: string, name: string, parentCode: string | null, isLeaf: boolean) =>
    node('Counterparty', affiliateCode, code, name, parentCode, isLeaf);
  return [
    cp('CP-ROOT', 'All counterparties', null, false),
    cp('CP-SOVEREIGN', 'Sovereign — government securities', 'CP-ROOT', true),
    cp('CP-INTERBANK-01', 'Interbank market counterparties', 'CP-ROOT', true),
    cp('CP-CORRESPONDENT-01', 'Correspondent banking network', 'CP-ROOT', true),
    cp('CP-DFI-01', 'Development finance institutions', 'CP-ROOT', true),
    cp('CP-BONDHOLDERS', 'Note holders — senior unsecured', 'CP-ROOT', true),
    cp('CP-CORP-ISSUER-01', 'Corporate bond issuers', 'CP-ROOT', true),
    // Corporate and retail depositors, numbered as the generated books reference them.
    ...Array.from({ length: 70 }, (_, i) => cp(`CP-CIB-${String(i + 1).padStart(3, '0')}`, `Corporate depositor ${i + 1}`, 'CP-ROOT', true)),
    ...Array.from({ length: 70 }, (_, i) => cp(`CP-RTL-${String(i + 1).padStart(3, '0')}`, `Retail portfolio ${i + 1}`, 'CP-ROOT', true)),
  ];
}

export const AFFILIATE_COUNTERPARTIES: DimensionMember[] = AFFILIATES.flatMap(([code]) => counterpartyPoolFor(code));

export const ALL_AFFILIATE_REFERENCE: DimensionMember[] = [
  ...AFFILIATE_LEGAL_ENTITIES,
  ...AFFILIATE_ORG_UNITS,
  ...AFFILIATE_COUNTERPARTIES,
];
