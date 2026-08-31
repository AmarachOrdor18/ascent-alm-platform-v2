import { describe, it, expect } from 'vitest';
import { applyProductCharacteristics, unclassifiedProducts } from './classification';
import { SEED_PRODUCT_CHARACTERISTIC_RULE } from '@/data/seed/defaultRules';
import { computeLcr } from './liquidity';
import { identityFxTable } from './fx';
import type { Position } from './types';
import type { ProductAssumption } from './ruleTypes';

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'P-1',
    affiliateCode: 'NG',
    asOfDate: '2026-07-31',
    batchId: 'B-1',
    accountNumber: '20220100001',
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: 'HQ001',
    category: 'Asset',
    productCode: 'P-TREASURY-BILLS',
    productClass: 'Treasury Bills',
    currency: 'NGN',
    amount: 1_000_000,
    legalEntityCode: 'LE-NG',
    orgUnitCode: 'OU-TRY',
    glAccountCode: 'GL-1000',
    commonCoaCode: 'COA-TBILL',
    counterpartyId: null,
    originationDate: null,
    maturityDate: '2027-01-01',
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: null,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'N/A',
    interestRatePct: null,
    rateIndexCode: null,
    spreadOverIndexBps: null,
    rateCapLifePct: null,
    rateFloorLifePct: null,
    behaviouralTag: 'N/A',
    // Deliberately unclassified — as a department's own upload would leave it, per the narrower templates.
    hqlaLevel: 'None',
    hqlaHaircutPct: 0,
    lcrCashflowRole: 'None',
    lcrRatePct: null,
    asfFactorPct: null,
    rsfFactorPct: null,
    irrbbRateSensitive: false,
    approxDurationYears: null,
    performingStatus: 'Performing',
    daysPastDue: null,
    provisionAmount: null,
    lienAmount: 0,
    lienReason: null,
    isOffBalanceSheet: false,
    obsType: null,
    notionalAmount: null,
    undrawnAmount: null,
    ccfPct: null,
    turnover: null,
    overdraft: null,
    control: { maker: 'TEST', checker: 'SYSTEM', status: 'ACTIVE', createdAt: '2026-07-31T09:00:00Z', updatedAt: '2026-07-31T09:00:00Z' },
    notes: null,
    ...overrides,
  };
}

describe('applyProductCharacteristics', () => {
  const assumptions: ProductAssumption[] = [
    { productCode: 'P-TREASURY-BILLS', currency: 'NGN', hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', lcrRatePct: null, asfFactorPct: null, rsfFactorPct: 5, approxDurationYears: 0.38, isRateSensitive: true },
  ];

  it('overrides classification for a matching product/currency, leaving everything else untouched', () => {
    const uploaded = position({ productCode: 'P-TREASURY-BILLS', currency: 'NGN', amount: 5_000_000 });
    const [classified] = applyProductCharacteristics([uploaded], assumptions);

    expect(classified!.hqlaLevel).toBe('Level 1');
    expect(classified!.lcrCashflowRole).toBe('HQLA');
    expect(classified!.rsfFactorPct).toBe(5);
    expect(classified!.approxDurationYears).toBe(0.38);
    // Untouched: not part of ProductAssumption.
    expect(classified!.amount).toBe(5_000_000);
    expect(classified!.id).toBe('P-1');
  });

  it('leaves a position unchanged when its product/currency has no configured assumption — a gap to close in the rule, not a run failure', () => {
    const uploaded = position({ productCode: 'P-UNKNOWN-PRODUCT', currency: 'NGN' });
    const [classified] = applyProductCharacteristics([uploaded], assumptions);
    expect(classified).toEqual(uploaded);
  });

  it('is a no-op with no assumptions configured, so a run without a product rule behaves exactly as before this feature existed', () => {
    const uploaded = position();
    expect(applyProductCharacteristics([uploaded], [])).toEqual([uploaded]);
  });

  it('unclassifiedProducts surfaces exactly the products with no matching assumption, deduplicated with a count', () => {
    const known = position({ id: 'P-1', productCode: 'P-TREASURY-BILLS', currency: 'NGN' });
    const unknownA = position({ id: 'P-2', productCode: 'P-NEW-PRODUCT', currency: 'NGN' });
    const unknownB = position({ id: 'P-3', productCode: 'P-NEW-PRODUCT', currency: 'NGN' });

    const gaps = unclassifiedProducts([known, unknownA, unknownB], assumptions);
    expect(gaps).toEqual([{ productCode: 'P-NEW-PRODUCT', currency: 'NGN', count: 2 }]);
  });
});

describe('the seeded Group Default Product Characteristics rule', () => {
  it('reproduces the same LCR as the fully-classified upload it was derived from — a faithful default, not a behaviour change', () => {
    // Two positions shaped like the real Nigeria seed book: a Treasury Bill (HQLA) funded by a Current
    // account (Outflow) — both already fully classified, exactly as today's single-file upload provides.
    const fullyClassified: Position[] = [
      position({
        id: 'P-TB-1', productCode: 'P-TREASURY-BILLS', productClass: 'Treasury Bills', category: 'Asset', amount: 2_000_000_000,
        hqlaLevel: 'Level 1', hqlaHaircutPct: 0, lcrCashflowRole: 'HQLA', rsfFactorPct: 5, approxDurationYears: 0.38, irrbbRateSensitive: true,
      }),
      position({
        id: 'P-CUR-1', productCode: 'P-CURRENT', productClass: 'Current', category: 'Liability', amount: 1_200_000_000,
        hqlaLevel: 'None', hqlaHaircutPct: 0, lcrCashflowRole: 'Outflow', lcrRatePct: 5, asfFactorPct: 90, approxDurationYears: 0.59,
      }),
    ];

    // The same book as a department would actually upload today — unclassified, relying on the rule.
    const asUploaded: Position[] = fullyClassified.map((p) => ({
      ...p,
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'None',
      lcrRatePct: null,
      asfFactorPct: null,
      rsfFactorPct: null,
      approxDurationYears: null,
      irrbbRateSensitive: false,
    }));

    const classified = applyProductCharacteristics(asUploaded, SEED_PRODUCT_CHARACTERISTIC_RULE.assumptions);
    const ctx = { asOfDate: '2026-07-31', reportingCurrency: 'NGN', fx: identityFxTable('NGN', '2026-07-31') };

    const lcrFromRule = computeLcr(classified, ctx);
    const lcrFromUpload = computeLcr(fullyClassified, ctx);

    expect(lcrFromRule.hqla).toBe(lcrFromUpload.hqla);
    expect(lcrFromRule.grossOutflows).toBe(lcrFromUpload.grossOutflows);
    expect(lcrFromRule.lcrPercent).toBe(lcrFromUpload.lcrPercent);
    expect(lcrFromRule.lcrPercent).not.toBeNull();

    // And the previously-unclassified upload, left un-ruled, would have reported zero HQLA — the gap this closes.
    const unruled = computeLcr(asUploaded, ctx);
    expect(unruled.hqla).toBe(0);
  });
});
