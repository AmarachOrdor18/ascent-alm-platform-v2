import { PRODUCTS } from './products';
import {
  CORE_DIMENSIONS,
  COMMON_COA,
  COUNTERPARTIES,
  FINANCIAL_ELEMENTS,
  GL_ACCOUNTS,
  LEGAL_ENTITIES,
  LOCAL_GL,
  ORG_UNITS,
} from './dimensions';
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
// Affiliates
// ─────────────────────────────────────────────────────────────────────────

// Only the Group pseudo-entity ships pre-seeded. Real affiliates (Nigeria, Ghana, etc.) are onboarded
// through the actual Onboarding wizard, not pre-populated with fake business activity - a fresh platform
// should have nothing to un-configure before someone can onboard a real one.
export const AFFILIATES: Affiliate[] = [
  {
    code: 'GROUP',
    name: 'Ecobank Group',
    country: 'Pan-African',
    region: 'Group',
    regulator: 'Consolidated',
    functionalCurrency: 'USD',
    reportingCurrency: 'USD',
    activeCurrencies: ['USD'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-GROUP',
    feeds: [],
    inheritGroupRules: true,
    internalThresholds: {},
    limitsConfirmed: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Dimensions
// ─────────────────────────────────────────────────────────────────────────

// Product is generated from the workbook, so a position can never cite a code the dimension lacks.
export { PRODUCTS } from './products';

export { COMMON_COA, COUNTERPARTIES, FINANCIAL_ELEMENTS, GL_ACCOUNTS, LEGAL_ENTITIES, LOCAL_GL, ORG_UNITS };

export const ALL_DIMENSION_MEMBERS: DimensionMember[] = [...CORE_DIMENSIONS, ...PRODUCTS];

// ─────────────────────────────────────────────────────────────────────────
// Currencies and FX
// ─────────────────────────────────────────────────────────────────────────

export const CURRENCIES: StoredCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', role: 'Functional', isActive: true },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', role: 'Reporting', isActive: true },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵', role: 'Reporting', isActive: true },
  { code: 'XOF', name: 'West African CFA Franc', symbol: 'CFA', role: 'Reporting', isActive: true },
  { code: 'EUR', name: 'Euro', symbol: '€', role: 'Active', isActive: true },
  { code: 'ZMW', name: 'Zambian Kwacha', symbol: 'ZK', role: 'Active', isActive: true },
  // No rate seeded on purpose - Ecobank Kenya is a freshly onboarded affiliate, and adding its first
  // FX rate is one of the manual-entry steps the demo walks through.
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', role: 'Active', isActive: true },
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
  {
    id: 'FX-KES-USD',
    base: 'KES',
    quote: 'USD',
    rate: 1 / 129,
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
  curve('KES-TBILL', 'KES Treasury Bill / Interbank Curve', 'KES', [
    [1, 'O/N', 11.0],
    [30, '1M', 11.3],
    [90, '3M', 11.8],
    [180, '6M', 12.4],
    [365, '1Y', 13.0],
    [1095, '3Y', 13.8],
    [1825, '5Y', 14.2],
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
    'Nigeria - Headline Inflation',
    'NG',
    '% y/y',
    'Percentage',
    [31.7, 32.4, 33.2, 33.7, 34.2, 33.4],
  ),
  indicator(
    'NG-MPR',
    'Nigeria - Monetary Policy Rate',
    'NG',
    '%',
    'Percentage',
    [22.75, 24.75, 26.25, 26.25, 26.75, 27.25],
  ),
  // Proxy for Nigeria's fiscal/FX position, a real driver of deposit behaviour.
  indicator(
    'NG-BRENT',
    'Brent Crude (Nigeria fiscal driver)',
    'NG',
    'USD/bbl',
    'Amount',
    [82.1, 86.4, 83.2, 79.8, 76.5, 74.2],
  ),
  indicator('GH-CPI', 'Ghana - Headline Inflation', 'GH', '% y/y', 'Percentage', [23.5, 25.8, 23.1, 22.8, 20.9, 19.4]),
  indicator('GH-MPR', 'Ghana - Monetary Policy Rate', 'GH', '%', 'Percentage', [29.0, 29.0, 29.0, 28.0, 27.0, 27.0]),
  indicator(
    'CI-CPI',
    "Côte d'Ivoire - Headline Inflation",
    'CI',
    '% y/y',
    'Percentage',
    [4.2, 4.0, 3.8, 3.6, 3.5, 3.4],
  ),
  indicator('KE-CPI', 'Kenya - Headline Inflation', 'KE', '% y/y', 'Percentage', [6.8, 6.3, 5.8, 5.1, 4.6, 4.1]),
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
