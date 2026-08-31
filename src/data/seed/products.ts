import type { DimensionMember } from '@/engine/types';

function node(affiliateCode: string, code: string, name: string, parentCode: string | null, isLeaf: boolean): DimensionMember {
  return { id: `Product:${affiliateCode}:${code}`, dimension: 'Product', affiliateCode, code, name, parentCode, isLeaf };
}

function leaf(affiliateCode: string, code: string, name: string, parentCode: string): DimensionMember {
  return node(affiliateCode, code, name, parentCode, true);
}

// Every affiliate owns its own product catalog (no Group-wide list). NG, GH and CI — the three affiliates
// with committed demo position data — start from the same catalog, since that's what their seeded books
// actually reference; a country can diverge from here without affecting anyone else's.
// Regenerate with scratchpad/genproducts.py if the workbook changes.
function productsFor(affiliateCode: string): DimensionMember[] {
  const n = (code: string, name: string, parentCode: string | null, isLeaf: boolean) =>
    node(affiliateCode, code, name, parentCode, isLeaf);
  const l = (code: string, name: string, parentCode: string) => leaf(affiliateCode, code, name, parentCode);
  return [
    n('P-ROOT', 'All Products', null, false),
    n('P-ASSETS', 'Assets', 'P-ROOT', false),
    n('P-LIABILITIES', 'Liabilities', 'P-ROOT', false),
    n('P-CAPITAL', 'Capital', 'P-ROOT', false),
    l('P-CASH---CENTRAL-BANK-RESERVES', 'Cash & Central Bank Reserves', 'P-ASSETS'),
    l('P-FGN-BONDS--3-5Y', 'FGN Bonds (3-5Y)', 'P-ASSETS'),
    l('P-FGN-TREASURY-BILLS---30D-RES', 'FGN Treasury Bills (≤30D residual)', 'P-ASSETS'),
    l('P-FGN-TREASURY-BILLS--1-3M-RES', 'FGN Treasury Bills (1-3M residual)', 'P-ASSETS'),
    l('P-FIXED---OTHER-ASSETS', 'Fixed & Other Assets', 'P-ASSETS'),
    l('P-INTERBANK-PLACEMENTS--0-30D', 'Interbank Placements (0-30D)', 'P-ASSETS'),
    l('P-LOANS---CORPORATE--1-3Y', 'Loans — Corporate (1-3Y)', 'P-ASSETS'),
    l('P-LOANS---CORPORATE--3-5Y', 'Loans — Corporate (3-5Y)', 'P-ASSETS'),
    l('P-LOANS---CORPORATE--FLOATING', 'Loans — Corporate, Floating (0-30D)', 'P-ASSETS'),
    l('P-LOANS---RETAIL-CONSUMER--1-3', 'Loans — Retail Consumer (1-3Y)', 'P-ASSETS'),
    l('P-LOANS---RETAIL-MORTGAGE--5Y', 'Loans — Retail Mortgage (5Y+)', 'P-ASSETS'),
    l('P-STATE-GOVERNMENT-BONDS--1-3Y', 'State Government Bonds (1-3Y)', 'P-ASSETS'),
    l('P-SHAREHOLDERS--EQUITY', "Shareholders' Equity", 'P-CAPITAL'),
    l('P-CORPORATE-DEPOSITS---NON-OPE', 'Corporate Deposits — Non-Operational', 'P-LIABILITIES'),
    l('P-CORPORATE-DEPOSITS---OPERATI', 'Corporate Deposits — Operational', 'P-LIABILITIES'),
    l('P-EUROBOND---LONG-TERM-DEBT--3', 'Eurobond / Long-Term Debt (3-5Y)', 'P-LIABILITIES'),
    l('P-INTERBANK-BORROWING--0-30D', 'Interbank Borrowing (0-30D)', 'P-LIABILITIES'),
    l('P-INTERBANK-BORROWING--1-3M', 'Interbank Borrowing (1-3M)', 'P-LIABILITIES'),
    l('P-LONG-TERM-DEBT--5Y', 'Long-Term Debt (5Y+)', 'P-LIABILITIES'),
    l('P-OTHER-LIABILITIES---PROVISIO', 'Other Liabilities & Provisions', 'P-LIABILITIES'),
    l('P-RETAIL-DEPOSITS---CORE', 'Retail Deposits — Core', 'P-LIABILITIES'),
    l('P-RETAIL-DEPOSITS---NON-CORE', 'Retail Deposits — Non-Core', 'P-LIABILITIES'),
    l('P-TERM-DEPOSITS---CORPORATE--1', 'Term Deposits — Corporate (1-3M)', 'P-LIABILITIES'),
    l('P-TERM-DEPOSITS---CORPORATE--3', 'Term Deposits — Corporate (3-6M)', 'P-LIABILITIES'),
  ];
}

export const PRODUCTS: DimensionMember[] = ['NG', 'GH', 'CI'].flatMap(productsFor);
