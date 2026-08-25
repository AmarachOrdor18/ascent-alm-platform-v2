/**
 * Group reference data — dimensions, counterparties, curves, FX, indicators
 * and calendars for the three demo affiliates.
 *
 * Set up once at Group level, then inherited by every affiliate during
 * onboarding. That inheritance is what makes onboarding affiliates 4
 * through 33 cheap: they map onto this, rather than rebuilding it.
 *
 * Synthetic data. Calibrated to look like a plausible mid-size African
 * banking group; not sourced from any real institution.
 */

import { PRODUCTS } from './products';
import type {
  Affiliate,
  DimensionMember,
  EconomicIndicator,
  HolidayCalendar,
  StoredCurrency,
  StoredFxRate,
  StoredYieldCurve,
} from '@/engine/types';

export const REFERENCE_AS_OF = '2026-07-31';

// ─────────────────────────────────────────────────────────────────────────
// Affiliates — three lifecycle states, so one demo shows all of them
// ─────────────────────────────────────────────────────────────────────────

export const AFFILIATES: Affiliate[] = [
  {
    code: 'GROUP',
    name: 'Ecobank Group',
    country: 'Pan-African',
    region: 'Group',
    regulator: 'Consolidated',
    functionalCurrency: 'USD',
    reportingCurrency: 'USD',
    activeCurrencies: ['USD', 'NGN', 'GHS', 'XOF'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-GROUP',
    feeds: [],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    code: 'NG',
    name: 'Ecobank Nigeria',
    country: 'Nigeria',
    region: 'Nigeria',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'USD',
    activeCurrencies: ['NGN', 'USD'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: 'CAL-NG',
    legalEntityCode: 'LE-NG',
    feeds: [
      { domain: 'Positions', mode: 'Connector', connectorId: 'C-FLEXCUBE-NG', slaDays: 30, owner: 'Finance Ops' },
      { domain: 'GeneralLedger', mode: 'Connector', connectorId: 'C-FLEXCUBE-NG', slaDays: 30, owner: 'Finance Ops' },
      { domain: 'MarketRates', mode: 'Connector', connectorId: 'C-REUTERS', slaDays: 1, owner: 'Treasury' },
      { domain: 'FxRates', mode: 'Connector', connectorId: 'C-REUTERS', slaDays: 1, owner: 'Treasury' },
      { domain: 'Counterparties', mode: 'File', connectorId: null, slaDays: 90, owner: 'Credit Risk' },
      { domain: 'EconomicIndicators', mode: 'File', connectorId: null, slaDays: 30, owner: 'Group Research' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    code: 'GH',
    name: 'Ecobank Ghana',
    country: 'Ghana',
    region: 'Anglophone West Africa',
    regulator: 'Bank of Ghana',
    functionalCurrency: 'GHS',
    reportingCurrency: 'USD',
    activeCurrencies: ['GHS', 'USD'],
    // Mid-onboarding: connectors configured, awaiting its first data load.
    status: 'Onboarding',
    fiscalYearEnd: '12-31',
    holidayCalendarId: 'CAL-GH',
    legalEntityCode: 'LE-GH',
    feeds: [
      // Flexcube is unreachable at this affiliate, so positions are declared
      // file-fed — a first-class substitution path, not a workaround.
      { domain: 'Positions', mode: 'File', connectorId: null, slaDays: 30, owner: 'Finance Ops' },
      { domain: 'GeneralLedger', mode: 'File', connectorId: null, slaDays: 30, owner: 'Finance Ops' },
      { domain: 'MarketRates', mode: 'Connector', connectorId: 'C-REUTERS', slaDays: 1, owner: 'Treasury' },
      { domain: 'FxRates', mode: 'Connector', connectorId: 'C-REUTERS', slaDays: 1, owner: 'Treasury' },
      { domain: 'Counterparties', mode: 'NotConfigured', connectorId: null, slaDays: 90, owner: null },
      { domain: 'EconomicIndicators', mode: 'File', connectorId: null, slaDays: 30, owner: 'Group Research' },
    ],
    createdAt: '2026-07-15T00:00:00Z',
  },
  {
    code: 'CI',
    name: "Ecobank Côte d'Ivoire",
    country: "Côte d'Ivoire",
    region: 'UEMOA',
    regulator: 'BCEAO',
    functionalCurrency: 'XOF',
    reportingCurrency: 'USD',
    activeCurrencies: ['XOF', 'EUR', 'USD'],
    // Not started: the full seven-step wizard runs from scratch in the demo.
    status: 'Onboarding',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-CI',
    feeds: [],
    createdAt: '2026-07-31T00:00:00Z',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Dimensions
// ─────────────────────────────────────────────────────────────────────────

function member(
  dimension: DimensionMember['dimension'],
  code: string,
  name: string,
  parentCode: string | null,
  isLeaf: boolean,
  attributes?: DimensionMember['attributes'],
): DimensionMember {
  return {
    id: `${dimension}:${code}`,
    dimension,
    code,
    name,
    parentCode,
    isLeaf,
    ...(attributes ? { attributes } : {}),
  };
}

export const LEGAL_ENTITIES: DimensionMember[] = [
  member('LegalEntity', 'LE-GROUP', 'Ecobank Transnational Incorporated', null, false),
  member('LegalEntity', 'LE-NG', 'Ecobank Nigeria Limited', 'LE-GROUP', true, { regulator: 'CBN' }),
  member('LegalEntity', 'LE-GH', 'Ecobank Ghana PLC', 'LE-GROUP', true, { regulator: 'Bank of Ghana' }),
  member('LegalEntity', 'LE-CI', "Ecobank Côte d'Ivoire SA", 'LE-GROUP', true, { regulator: 'BCEAO' }),
];

/** Org units follow a common Group template so affiliates stay comparable. */
export const ORG_UNITS: DimensionMember[] = [
  member('OrgUnit', 'OU-GROUP', 'Ecobank Group', null, false),
  ...['NG', 'GH', 'CI'].flatMap((code) => {
    const label = { NG: 'Nigeria', GH: 'Ghana', CI: "Côte d'Ivoire" }[code]!;
    return [
      member('OrgUnit', `OU-${code}`, label, 'OU-GROUP', false),
      member('OrgUnit', `OU-${code}-RET`, `${label} — Retail Banking`, `OU-${code}`, true),
      member('OrgUnit', `OU-${code}-COR`, `${label} — Corporate Banking`, `OU-${code}`, true),
      member('OrgUnit', `OU-${code}-TSY`, `${label} — Treasury`, `OU-${code}`, true),
    ];
  }),
];

// Product dimension is generated from the workbook alongside the positions,
// so a position can never reference a code the dimension lacks.
export { PRODUCTS } from './products';

/**
 * The Group-standard chart of accounts every local GL maps onto.
 *
 * This mapping is what makes a Nigerian GL and an Ivorian GL comparable at
 * Group level — for a bank whose proposition is "One Bank, One Africa"
 * across 33 balance sheets, it is the platform.
 */
export const COMMON_COA: DimensionMember[] = [
  member('CommonCoa', 'COA-ROOT', 'Group Chart of Accounts', null, false),
  member('CommonCoa', 'COA-ASSET', 'Assets', 'COA-ROOT', true),
  member('CommonCoa', 'COA-LIAB', 'Liabilities', 'COA-ROOT', true),
  member('CommonCoa', 'COA-CAPITAL', 'Capital & Reserves', 'COA-ROOT', true),
];

export const GL_ACCOUNTS: DimensionMember[] = [
  member('GlAccount', 'GL-ROOT', 'General Ledger', null, false),
  ...['NG', 'GH', 'CI'].flatMap((code) => [
    member('GlAccount', `GL-${code}-1000`, `${code} — Assets`, 'GL-ROOT', true, { commonCoa: 'COA-ASSET' }),
    member('GlAccount', `GL-${code}-2000`, `${code} — Liabilities`, 'GL-ROOT', true, { commonCoa: 'COA-LIAB' }),
    member('GlAccount', `GL-${code}-3000`, `${code} — Capital`, 'GL-ROOT', true, { commonCoa: 'COA-CAPITAL' }),
  ]),
];

/** What is being measured, so one results table serves every metric. */
export const FINANCIAL_ELEMENTS: DimensionMember[] = [
  member('FinancialElement', 'FE-ROOT', 'Financial Elements', null, false),
  member('FinancialElement', 'FE-100', 'Ending Balance', 'FE-ROOT', true),
  member('FinancialElement', 'FE-140', 'Average Balance', 'FE-ROOT', true),
  member('FinancialElement', 'FE-430', 'Interest Accrued', 'FE-ROOT', true),
  member('FinancialElement', 'FE-660', 'Repricing Gap', 'FE-ROOT', true),
  member('FinancialElement', 'FE-1660', 'Liquidity Runoff', 'FE-ROOT', true),
];

/**
 * Counterparties, without which depositor concentration is not computable
 * (defect D-04). Ghana deliberately carries one dominant depositor so the
 * demo has a real concentration breach to resolve.
 */
export const COUNTERPARTIES: DimensionMember[] = [
  member('Counterparty', 'CP-ROOT', 'All Counterparties', null, false),
  member('Counterparty', 'CP-SOVEREIGN-NG', 'Federal Government of Nigeria', 'CP-ROOT', true, {
    sector: 'Sovereign',
    rating: 'B-',
  }),
  member('Counterparty', 'CP-NG-INTERBANK', 'Nigerian Interbank Market', 'CP-ROOT', true, {
    sector: 'Financial Institution',
  }),
  member('Counterparty', 'CP-NG-RETAIL-POOL', 'Retail Depositor Pool — Nigeria', 'CP-ROOT', true, {
    sector: 'Retail',
    note: 'Aggregated: no single depositor exceeds reporting threshold',
  }),
  ...[1, 2, 3].map((n) =>
    member(
      'Counterparty',
      `CP-NG-CORP-${String(n).padStart(2, '0')}`,
      `Nigerian Corporate Depositor ${n}`,
      'CP-ROOT',
      true,
      { sector: 'Corporate' },
    ),
  ),
  ...[1, 2, 3, 4, 5].map((n) =>
    member(
      'Counterparty',
      `CP-NG-OBLIGOR-${String(n).padStart(2, '0')}`,
      `Nigerian Corporate Obligor ${n}`,
      'CP-ROOT',
      true,
      { sector: 'Corporate', rating: 'BB' },
    ),
  ),
  member('Counterparty', 'CP-GH-STATE-ENTITY', 'Ghana State Entity — single large depositor', 'CP-ROOT', true, {
    sector: 'Public Sector',
    note: 'Concentration watch: dominant share of Ghana deposits',
  }),
];

export const ALL_DIMENSION_MEMBERS: DimensionMember[] = [
  ...LEGAL_ENTITIES,
  ...ORG_UNITS,
  ...PRODUCTS,
  ...COMMON_COA,
  ...GL_ACCOUNTS,
  ...FINANCIAL_ELEMENTS,
  ...COUNTERPARTIES,
];

// ─────────────────────────────────────────────────────────────────────────
// Currencies and FX
// ─────────────────────────────────────────────────────────────────────────

export const CURRENCIES: StoredCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', role: 'Functional', isActive: true },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', role: 'Reporting', isActive: true },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', role: 'Reporting', isActive: true },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', role: 'Reporting', isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', role: 'Active', isActive: true },
];

/** Rates are units of the base per one USD, the Group functional currency. */
export const FX_RATES: StoredFxRate[] = [
  {
    id: 'FX-NGN-USD',
    base: 'NGN',
    quote: 'USD',
    rate: 1 / 1530,
    asOfDate: REFERENCE_AS_OF,
    source: 'Reuters',
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
  {
    id: 'FX-GHS-USD',
    base: 'GHS',
    quote: 'USD',
    rate: 1 / 12.4,
    asOfDate: REFERENCE_AS_OF,
    source: 'Reuters',
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
  // XOF is pegged to the euro at the fixed parity 655.957.
  {
    id: 'FX-XOF-USD',
    base: 'XOF',
    quote: 'USD',
    rate: 1 / 605.5,
    asOfDate: REFERENCE_AS_OF,
    source: 'BCEAO (EUR peg)',
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
  {
    id: 'FX-EUR-USD',
    base: 'EUR',
    quote: 'USD',
    rate: 1.083,
    asOfDate: REFERENCE_AS_OF,
    source: 'Reuters',
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Yield curves
// ─────────────────────────────────────────────────────────────────────────

function curve(
  code: string,
  name: string,
  currency: string,
  points: Array<[number, string, number]>,
): StoredYieldCurve {
  return {
    id: `IRC-${code}`,
    code,
    name,
    currency,
    rateFormat: 'Zero Coupon',
    compoundingBasis: 'Annual',
    accrualBasis: 'Actual/365',
    terms: points.map(([tenorDays, label, ratePercent]) => ({ tenorDays, label, ratePercent })),
    asOfDate: REFERENCE_AS_OF,
    isActive: true,
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  };
}

export const YIELD_CURVES: StoredYieldCurve[] = [
  // Inverted at the long end, which is the shape Nigeria has actually run.
  curve('NGN-NIBOR', 'NGN Interbank / Sovereign Curve', 'NGN', [
    [1, 'O/N', 18.5],
    [30, '1M', 19.0],
    [90, '3M', 19.8],
    [180, '6M', 20.4],
    [365, '1Y', 21.0],
    [1095, '3Y', 17.5],
    [1825, '5Y', 16.0],
    [3650, '10Y', 15.2],
  ]),
  curve('GHS-GHREF', 'GHS Reference Rate Curve', 'GHS', [
    [1, 'O/N', 26.0],
    [30, '1M', 26.8],
    [90, '3M', 27.5],
    [180, '6M', 27.9],
    [365, '1Y', 28.2],
    [1095, '3Y', 24.0],
    [1825, '5Y', 21.5],
  ]),
  // UEMOA rates track the euro area closely, given the peg.
  curve('XOF-BCEAO', 'XOF BCEAO Curve', 'XOF', [
    [1, 'O/N', 5.5],
    [30, '1M', 5.7],
    [90, '3M', 6.0],
    [180, '6M', 6.3],
    [365, '1Y', 6.6],
    [1095, '3Y', 6.9],
    [1825, '5Y', 7.2],
  ]),
  curve('USD-SOFR', 'USD SOFR Curve', 'USD', [
    [1, 'O/N', 4.35],
    [30, '1M', 4.38],
    [90, '3M', 4.42],
    [180, '6M', 4.4],
    [365, '1Y', 4.3],
    [1095, '3Y', 4.05],
    [1825, '5Y', 4.0],
    [3650, '10Y', 4.15],
  ]),
];

// ─────────────────────────────────────────────────────────────────────────
// Economic indicators
// ─────────────────────────────────────────────────────────────────────────

function monthly(startIso: string, values: number[]): Array<{ asOfDate: string; value: number }> {
  const [y, m] = startIso.split('-').map(Number);
  return values.map((value, i) => {
    const date = new Date(Date.UTC(y!, m! - 1 + i + 1, 0));
    return { asOfDate: date.toISOString().slice(0, 10), value };
  });
}

function indicator(
  code: string,
  name: string,
  countryCode: string,
  unit: string,
  valueType: EconomicIndicator['valueType'],
  values: number[],
): EconomicIndicator {
  return {
    id: `EI-${code}`,
    code,
    name,
    countryCode,
    frequency: 'Monthly',
    valueType,
    unit,
    observations: monthly('2026-02', values),
    isActive: true,
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  };
}

export const ECONOMIC_INDICATORS: EconomicIndicator[] = [
  indicator(
    'NG-CPI',
    'Nigeria — Headline Inflation',
    'NG',
    '% y/y',
    'Percentage',
    [31.7, 32.4, 33.2, 33.7, 34.2, 33.4],
  ),
  indicator(
    'NG-MPR',
    'Nigeria — Monetary Policy Rate',
    'NG',
    '%',
    'Percentage',
    [22.75, 24.75, 26.25, 26.25, 26.75, 27.25],
  ),
  // Nigeria's fiscal and FX position tracks the oil price closely, which
  // makes it a genuine driver of deposit behaviour rather than decoration.
  indicator(
    'NG-BRENT',
    'Brent Crude (Nigeria fiscal driver)',
    'NG',
    'USD/bbl',
    'Amount',
    [82.1, 86.4, 83.2, 79.8, 76.5, 74.2],
  ),
  indicator('GH-CPI', 'Ghana — Headline Inflation', 'GH', '% y/y', 'Percentage', [23.5, 25.8, 23.1, 22.8, 20.9, 19.4]),
  indicator('GH-MPR', 'Ghana — Monetary Policy Rate', 'GH', '%', 'Percentage', [29.0, 29.0, 29.0, 28.0, 27.0, 27.0]),
  indicator(
    'CI-CPI',
    "Côte d'Ivoire — Headline Inflation",
    'CI',
    '% y/y',
    'Percentage',
    [4.2, 4.0, 3.8, 3.6, 3.5, 3.4],
  ),
];

// ─────────────────────────────────────────────────────────────────────────
// Holiday calendars
// ─────────────────────────────────────────────────────────────────────────

export const HOLIDAY_CALENDARS: HolidayCalendar[] = [
  {
    id: 'CAL-NG',
    code: 'NG',
    name: 'Nigeria Banking Calendar',
    countryCode: 'NG',
    weekendDays: [0, 6],
    holidays: [
      { date: '2026-01-01', name: "New Year's Day", isException: false },
      { date: '2026-04-03', name: 'Good Friday', isException: false },
      { date: '2026-04-06', name: 'Easter Monday', isException: false },
      { date: '2026-05-01', name: "Workers' Day", isException: false },
      { date: '2026-06-12', name: 'Democracy Day', isException: false },
      { date: '2026-10-01', name: 'Independence Day', isException: false },
      { date: '2026-12-25', name: 'Christmas Day', isException: false },
      { date: '2026-12-26', name: 'Boxing Day', isException: false },
    ],
    isActive: true,
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
  {
    id: 'CAL-GH',
    code: 'GH',
    name: 'Ghana Banking Calendar',
    countryCode: 'GH',
    weekendDays: [0, 6],
    holidays: [
      { date: '2026-01-01', name: "New Year's Day", isException: false },
      { date: '2026-03-06', name: 'Independence Day', isException: false },
      { date: '2026-04-03', name: 'Good Friday', isException: false },
      { date: '2026-05-01', name: 'May Day', isException: false },
      { date: '2026-07-01', name: 'Republic Day', isException: false },
      { date: '2026-12-25', name: 'Christmas Day', isException: false },
    ],
    isActive: true,
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
  {
    id: 'CAL-CI',
    code: 'CI',
    name: "Côte d'Ivoire Banking Calendar",
    countryCode: 'CI',
    weekendDays: [0, 6],
    holidays: [
      { date: '2026-01-01', name: 'Jour de l’An', isException: false },
      { date: '2026-04-06', name: 'Lundi de Pâques', isException: false },
      { date: '2026-05-01', name: 'Fête du Travail', isException: false },
      { date: '2026-08-07', name: "Fête de l'Indépendance", isException: false },
      { date: '2026-12-25', name: 'Noël', isException: false },
    ],
    isActive: true,
    updatedBy: 'system-seed',
    updatedAt: `${REFERENCE_AS_OF}T06:00:00Z`,
  },
];
