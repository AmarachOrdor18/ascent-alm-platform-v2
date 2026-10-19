// Tests for lib/productTreatment.ts - the covered/uncovered book check and the COA-family default
// derivation that pre-fills onboarding's guided liquidity-treatment rows.
import type { ApprovalRequest, Position, RuleMeta } from '@/engine/types';
import type { ProductCharacteristicRule } from '@/engine/ruleTypes';
import { effectiveProductRule, proposedAssumptions, defaultTreatment } from './productTreatment';
import { SEED_AUTHOR } from './ruleApproval';

const AS_OF = '2026-07-31';

const pos = (over: Partial<Position> = {}): Position => ({
  id: 'P-1',
  asOfDate: AS_OF,
  affiliateCode: 'NG',
  category: 'Asset',
  obsType: 'Balance',
  productCode: 'P-LOANS---RETAIL-MORTGAGE',
  productClass: 'Loans - Retail Mortgage',
  currency: 'NGN',
  amount: 1_000,
  interestRatePct: 10,
  behaviouralTag: 'N/A',
  hqlaLevel: 'None',
  hqlaHaircutPct: 0,
  lcrCashflowRole: 'None',
  lcrRatePct: null,
  asfFactorPct: null,
  rsfFactorPct: null,
  approxDurationYears: null,
  irrbbRateSensitive: false,
  commonCoaCode: 'COA-14',
  isOffBalanceSheet: false,
  isHeldForTrading: false,
  ...over,
} as Position);

const rule = (assumptions: ProductCharacteristicRule['assumptions'], affiliateCode: string | null = null): ProductCharacteristicRule & RuleMeta => ({
  id: 'RULE-PC',
  kind: 'ProductCharacteristic',
  name: 'PC',
  description: '',
  folder: 'Group Default',
  accessType: 'Read-Write',
  affiliateCode,
  version: 1,
  isActive: true,
  createdBy: SEED_AUTHOR,
  createdAt: '2026-01-01T00:00:00Z',
  updatedBy: null,
  updatedAt: null,
  assumptions,
});

const APPROVED: ApprovalRequest = {
  id: 'APR-1',
  module: 'Business Rules',
  entityType: 'ProductCharacteristic',
  entityId: 'RULE-PC',
  entityLabel: 'PC',
  entityVersion: 1,
  action: 'Create',
  summary: '',
  affiliateCode: null,
  status: 'Approved',
  requestedBy: 'maker',
  requestedAt: AS_OF,
  decidedBy: 'checker',
  decidedAt: AS_OF,
  decisionNote: null,
};

describe('effectiveProductRule', () => {
  it('picks the approved rule a run would use, picking the affiliate over the Group', () => {
    const group = rule([], null);
    expect(effectiveProductRule([group], 'NG', [APPROVED])).toBe(group);
    expect(effectiveProductRule([group], 'NG', [])).toBe(group); // untouched seed counts as approved
    const own = rule([], 'NG');
    expect(effectiveProductRule([group, own], 'NG', [{ ...APPROVED, entityId: 'RULE-PC' }])).toBe(own);
  });
});

describe('proposedAssumptions', () => {
  it('proposes one product-keyed row per uncovered product, pre-filled from its COA family', () => {
    const book = [pos(), pos({ productCode: 'P-RETAIL-SAVINGS-DEPOSITS', productClass: 'Retail Savings Deposits', category: 'Liability', commonCoaCode: 'COA-22' })];
    const coaNames: Record<string, string> = { 'COA-14': 'Loans', 'COA-22': 'Customer deposits' };
    const proposals = proposedAssumptions(book, [], (code) => coaNames[code]);
    expect(proposals).toHaveLength(2);
    const loans = proposals.find((a) => a.productCode === 'P-LOANS---RETAIL-MORTGAGE')!;
    expect(loans).toMatchObject({ currency: 'NGN', commonCoaCode: undefined, lcrCashflowRole: 'Inflow', lcrRatePct: 50, rsfFactorPct: 85, asfFactorPct: null });
    const deposits = proposals.find((a) => a.productCode === 'P-RETAIL-SAVINGS-DEPOSITS')!;
    expect(deposits).toMatchObject({ lcrCashflowRole: 'Outflow', lcrRatePct: 10, asfFactorPct: 90, rsfFactorPct: null });
  });

  it('prefers the organisation default row for the common account over the keyword baseline, and accepts an any-currency row', () => {
    const orgRows = [{ ...proposedAssumptions([pos()], [])[0]!, commonCoaCode: 'COA-14', currency: '*', productCode: '', rsfFactorPct: 75, lcrRatePct: 40 }];
    const treatment = defaultTreatment(pos(), orgRows as ProductCharacteristicRule['assumptions'], 'Loans');
    expect(treatment).toMatchObject({ lcrRatePct: 40, rsfFactorPct: 75, hqlaLevel: 'None' });
  });

  it('keeps a capital-family product out of the LCR cashflows with full ASF availability', () => {
    const treatment = defaultTreatment(
      pos({ productCode: 'P-SHARE-CAPITAL', productClass: 'Share Capital', commonCoaCode: 'COA-31', category: 'Liability' }),
      [],
      'Capital',
    );
    expect(treatment).toMatchObject({ lcrCashflowRole: 'None', asfFactorPct: 100, rsfFactorPct: null, isRateSensitive: false });
  });
});
