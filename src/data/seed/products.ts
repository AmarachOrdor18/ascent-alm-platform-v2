/**
 * Product dimension.
 *
 * Generated from the same workbook sheet as the positions, using the same
 * code-derivation rule, so a position can never reference a product code
 * the dimension does not contain. Hand-maintaining these two lists let them
 * drift, and every product lookup silently missed.
 *
 * Regenerate with scratchpad/genproducts.py if the workbook changes.
 */

import type { DimensionMember } from '@/engine/types';

function node(code: string, name: string, parentCode: string | null, isLeaf: boolean): DimensionMember {
  return { id: `Product:${code}`, dimension: 'Product', code, name, parentCode, isLeaf };
}

function leaf(code: string, name: string, parentCode: string): DimensionMember {
  return node(code, name, parentCode, true);
}

export const PRODUCTS: DimensionMember[] = [
  node('P-ROOT', 'All Products', null, false),
  node('P-ASSETS', 'Assets', 'P-ROOT', false),
  node('P-LIABILITIES', 'Liabilities', 'P-ROOT', false),
  node('P-CAPITAL', 'Capital', 'P-ROOT', false),
  leaf('P-CASH---CENTRAL-BANK-RESERVES', 'Cash & Central Bank Reserves', 'P-ASSETS'),
  leaf('P-FGN-BONDS--3-5Y', 'FGN Bonds (3-5Y)', 'P-ASSETS'),
  leaf('P-FGN-TREASURY-BILLS---30D-RES', 'FGN Treasury Bills (≤30D residual)', 'P-ASSETS'),
  leaf('P-FGN-TREASURY-BILLS--1-3M-RES', 'FGN Treasury Bills (1-3M residual)', 'P-ASSETS'),
  leaf('P-FIXED---OTHER-ASSETS', 'Fixed & Other Assets', 'P-ASSETS'),
  leaf('P-INTERBANK-PLACEMENTS--0-30D', 'Interbank Placements (0-30D)', 'P-ASSETS'),
  leaf('P-LOANS---CORPORATE--1-3Y', 'Loans — Corporate (1-3Y)', 'P-ASSETS'),
  leaf('P-LOANS---CORPORATE--3-5Y', 'Loans — Corporate (3-5Y)', 'P-ASSETS'),
  leaf('P-LOANS---CORPORATE--FLOATING', 'Loans — Corporate, Floating (0-30D)', 'P-ASSETS'),
  leaf('P-LOANS---RETAIL-CONSUMER--1-3', 'Loans — Retail Consumer (1-3Y)', 'P-ASSETS'),
  leaf('P-LOANS---RETAIL-MORTGAGE--5Y', 'Loans — Retail Mortgage (5Y+)', 'P-ASSETS'),
  leaf('P-STATE-GOVERNMENT-BONDS--1-3Y', 'State Government Bonds (1-3Y)', 'P-ASSETS'),
  leaf('P-SHAREHOLDERS--EQUITY', "Shareholders' Equity", 'P-CAPITAL'),
  leaf('P-CORPORATE-DEPOSITS---NON-OPE', 'Corporate Deposits — Non-Operational', 'P-LIABILITIES'),
  leaf('P-CORPORATE-DEPOSITS---OPERATI', 'Corporate Deposits — Operational', 'P-LIABILITIES'),
  leaf('P-EUROBOND---LONG-TERM-DEBT--3', 'Eurobond / Long-Term Debt (3-5Y)', 'P-LIABILITIES'),
  leaf('P-INTERBANK-BORROWING--0-30D', 'Interbank Borrowing (0-30D)', 'P-LIABILITIES'),
  leaf('P-INTERBANK-BORROWING--1-3M', 'Interbank Borrowing (1-3M)', 'P-LIABILITIES'),
  leaf('P-LONG-TERM-DEBT--5Y', 'Long-Term Debt (5Y+)', 'P-LIABILITIES'),
  leaf('P-OTHER-LIABILITIES---PROVISIO', 'Other Liabilities & Provisions', 'P-LIABILITIES'),
  leaf('P-RETAIL-DEPOSITS---CORE', 'Retail Deposits — Core', 'P-LIABILITIES'),
  leaf('P-RETAIL-DEPOSITS---NON-CORE', 'Retail Deposits — Non-Core', 'P-LIABILITIES'),
  leaf('P-TERM-DEPOSITS---CORPORATE--1', 'Term Deposits — Corporate (1-3M)', 'P-LIABILITIES'),
  leaf('P-TERM-DEPOSITS---CORPORATE--3', 'Term Deposits — Corporate (3-6M)', 'P-LIABILITIES'),
];
