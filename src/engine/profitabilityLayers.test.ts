/**
 * Multi-layer profitability. A five-position book, hand-computed:
 *
 *   FX: NGN pivot, 1 GHS = 100 NGN. Reporting NGN.
 *
 *   id  aff  BU      product  ccy  amount     NGN bal    client  FTP   customer
 *   P1  NG   CORP    LOAN     NGN  1,000,000  1,000,000  20%     15%   C1
 *   P2  NG   RETAIL  DEP      NGN  2,000,000  2,000,000   5%     10%   C2   (liability)
 *   P3  GH   CORP    LOAN     GHS     10,000  1,000,000  25%     20%   C1   (Substandard, provision 50 GHS)
 *   P4  GH   RETAIL  DEP      GHS      5,000    500,000   4%     12%   C3   (liability)
 *   P5  NG   RETAIL  LOAN     NGN    500,000    500,000  18%     -     none (unpriced)
 *   P6  NG   CORP    EQUITY   NGN  9,999,999  capital - out of scope
 */

import { describe, expect, it } from 'vitest';
import {
  allocateCostPool,
  computeProfitability,
  layersFor,
  CUSTOMERS_NODE_ID,
  GROUP_NODE_ID,
  NO_COUNTERPARTY,
  type CapitalConfig,
  type CostPool,
  type CreditLossConfig,
  type ProfitabilityLayersInput,
  type ProfitabilityLayersResult,
  type ProfitabilityNode,
} from './profitabilityLayers';
import type { TransferRateLine } from './ftp';
import type { FxTable } from './fx';
import type { Position } from './types';

const AS_OF = '2026-09-30';

function position(overrides: Partial<Position> & Pick<Position, 'id'>): Position {
  return {
    affiliateCode: 'NG',
    asOfDate: AS_OF,
    batchId: 'B1',
    accountNumber: overrides.id,
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: null,
    category: 'Asset',
    productCode: 'LOAN',
    productClass: 'Loans',
    currency: 'NGN',
    amount: 0,
    legalEntityCode: 'LE',
    orgUnitCode: 'CORP',
    glAccountCode: 'GL',
    commonCoaCode: 'COA',
    counterpartyId: null,
    originationDate: null,
    maturityDate: null,
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: null,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'Fixed',
    interestRatePct: null,
    rateIndexCode: null,
    spreadOverIndexBps: null,
    rateCapLifePct: null,
    rateFloorLifePct: null,
    behaviouralTag: 'N/A',
    hqlaLevel: 'None',
    hqlaHaircutPct: 0,
    lcrCashflowRole: 'None',
    lcrRatePct: null,
    asfFactorPct: null,
    rsfFactorPct: null,
    irrbbRateSensitive: true,
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
    control: { maker: 'm', checker: 'c', status: 'ACTIVE', createdAt: AS_OF, updatedAt: AS_OF },
    notes: null,
    ...overrides,
  };
}

const POSITIONS: Position[] = [
  position({ id: 'P1', amount: 1_000_000, interestRatePct: 20, counterpartyId: 'C1', provisionAmount: 10_000 }),
  position({
    id: 'P2',
    category: 'Liability',
    productCode: 'DEP',
    productClass: 'Deposits',
    orgUnitCode: 'RETAIL',
    amount: 2_000_000,
    interestRatePct: 5,
    counterpartyId: 'C2',
  }),
  position({
    id: 'P3',
    affiliateCode: 'GH',
    currency: 'GHS',
    amount: 10_000,
    interestRatePct: 25,
    counterpartyId: 'C1',
    performingStatus: 'Substandard',
    provisionAmount: 50,
  }),
  position({
    id: 'P4',
    affiliateCode: 'GH',
    category: 'Liability',
    productCode: 'DEP',
    productClass: 'Deposits',
    orgUnitCode: 'RETAIL',
    currency: 'GHS',
    amount: 5_000,
    interestRatePct: 4,
    counterpartyId: 'C3',
  }),
  position({ id: 'P5', orgUnitCode: 'RETAIL', amount: 500_000, interestRatePct: 18 }),
  position({ id: 'P6', category: 'Capital', productCode: 'EQUITY', productClass: 'Equity', amount: 9_999_999 }),
];

const FX: FxTable = { pivot: 'NGN', toPivot: { NGN: 1, GHS: 100 }, asOfDate: AS_OF };

function ftpLine(p: Position, allIn: number | null): TransferRateLine {
  return {
    positionId: p.id,
    productCode: p.productCode,
    productClass: p.productClass,
    orgUnitCode: p.orgUnitCode,
    affiliateCode: p.affiliateCode,
    commonCoaCode: p.commonCoaCode,
    currency: p.currency,
    tenorDays: 365,
    tenorBasis: 'Contractual',
    baseTransferRatePercent: allIn,
    adjustments: [],
    totalAdjustmentBps: 0,
    allInTransferRatePercent: allIn,
    method: 'SpreadFromInterestRateCode',
    marginContribution: null,
    marginContributionReporting: null,
  };
}

const byId = (id: string) => POSITIONS.find((p) => p.id === id)!;
const FTP_LINES: TransferRateLine[] = [
  ftpLine(byId('P1'), 15),
  ftpLine(byId('P2'), 10),
  ftpLine(byId('P3'), 20),
  ftpLine(byId('P4'), 12),
  // P5 has a line but no rate - the curve was missing.
  ftpLine(byId('P5'), null),
];

const BALANCE_POOL: CostPool = { id: 'A', name: 'Branch network', amount: 100_000, driver: 'Balance' };

const PD_LGD: CreditLossConfig = {
  method: 'PdLgd',
  pdByProduct: { LOAN: 2 },
  lgdByProduct: { LOAN: 50 },
  useProvisionAmount: false,
};

const CAPITAL: CapitalConfig = {
  riskWeightByProductClass: { Loans: 100 },
  defaultRiskWeightPct: 100,
  capitalRatioPct: 10,
  costOfCapitalPct: 15,
};

function run(overrides: Partial<ProfitabilityLayersInput> = {}): ProfitabilityLayersResult {
  return computeProfitability({
    positions: POSITIONS,
    ftpLines: FTP_LINES,
    fx: FX,
    reportingCurrency: 'NGN',
    asOfDate: AS_OF,
    horizon: 'Annualised',
    costRules: { pools: [BALANCE_POOL] },
    creditLoss: PD_LGD,
    capital: CAPITAL,
    ...overrides,
  });
}

const line = (r: ProfitabilityLayersResult, id: string) => r.lines.find((l) => l.positionId === id)!;

describe('computeProfitability - line layers', () => {
  it('converts every balance to the reporting currency before any layer', () => {
    const r = run();
    expect(line(r, 'P3').balance).toBe(1_000_000);
    expect(line(r, 'P4').balance).toBe(500_000);
    expect(line(r, 'P3').clientNetInterest).toBeCloseTo(250_000);
    expect(r.excludedPositionIds).toEqual(['P6']);
    expect(r.lines.map((l) => l.positionId)).not.toContain('P6');
  });

  it('charges FTP on assets and credits it on liabilities', () => {
    const r = run();
    expect(line(r, 'P1').clientNetInterest).toBeCloseTo(200_000);
    expect(line(r, 'P1').ftp).toBeCloseTo(-150_000);
    expect(line(r, 'P1').netInterestAfterFtp).toBeCloseTo(50_000);

    expect(line(r, 'P2').clientNetInterest).toBeCloseTo(-100_000);
    expect(line(r, 'P2').ftp).toBeCloseTo(200_000);
    expect(line(r, 'P2').netInterestAfterFtp).toBeCloseTo(100_000);

    expect(line(r, 'P4').ftp).toBeCloseTo(60_000); // 500,000 × 12%
  });

  it('flags a position with no transfer rate as unpriced with a null FTP layer, not zero', () => {
    const r = run();
    const p5 = line(r, 'P5');
    expect(p5.priced).toBe(false);
    expect(p5.unpricedReasons).toEqual(['NoTransferRate']);
    expect(p5.ftp).toBeNull();
    expect(p5.netInterestAfterFtp).toBeNull();
    expect(p5.riskAdjustedProfit).toBeNull();
    expect(p5.rarocPercent).toBeNull();
    // The client rate is still known and reported.
    expect(p5.clientNetInterest).toBeCloseTo(90_000);

    // Missing FTP line altogether is the same.
    const r2 = run({ ftpLines: FTP_LINES.filter((l) => l.positionId !== 'P1') });
    expect(line(r2, 'P1').ftp).toBeNull();
    expect(line(r2, 'P1').priced).toBe(false);
  });

  it('computes capital charge, risk-adjusted profit and RAROC', () => {
    const r = run();
    const p1 = line(r, 'P1');
    // Balance pool: 100,000 × 1m / 5m total absolute balance.
    expect(p1.opex).toBeCloseTo(-20_000);
    expect(p1.ecl).toBeCloseTo(-10_000); // 1m × 2% × 50%
    expect(p1.rwa).toBeCloseTo(1_000_000);
    expect(p1.allocatedCapital).toBeCloseTo(100_000);
    expect(p1.capitalCharge).toBeCloseTo(-15_000);
    // 50,000 − 20,000 − 10,000 − 15,000
    expect(p1.riskAdjustedProfit).toBeCloseTo(5_000);
    // (50,000 − 20,000 − 10,000) / 100,000
    expect(p1.rarocPercent).toBeCloseTo(20);

    // Liabilities attract no capital, so RAROC is undefined.
    expect(line(r, 'P2').rwa).toBe(0);
    expect(line(r, 'P2').rarocPercent).toBeNull();

    const taxed = run({ capital: { ...CAPITAL, taxRatePct: 30 } });
    expect(line(taxed, 'P1').rarocPercent).toBeCloseTo(14);
    expect(line(taxed, 'P1').riskAdjustedProfit).toBeCloseTo(5_000);
  });
});

describe('computeProfitability - opex allocation', () => {
  const balanceOf = (p: Position) => (p.currency === 'GHS' ? p.amount * 100 : p.amount);
  const book = POSITIONS.filter((p) => p.category !== 'Capital');

  it('Balance driver - pro rata to absolute reporting-currency balance', () => {
    const r = run();
    expect(line(r, 'P2').opex).toBeCloseTo(-40_000);
    expect(line(r, 'P3').opex).toBeCloseTo(-20_000);
    expect(line(r, 'P4').opex).toBeCloseTo(-10_000);
    expect(line(r, 'P5').opex).toBeCloseTo(-10_000);
    expect(r.totalOpexAllocated).toBeCloseTo(100_000);
    expect(r.totalOpexResidual).toBeCloseTo(0);
  });

  it('AccountCount driver - equal per position, honouring product targets', () => {
    const pool: CostPool = {
      id: 'B',
      name: 'Ops',
      amount: 50_000,
      driver: 'AccountCount',
      targets: { productCodes: ['DEP'] },
    };
    const { byPosition, allocated } = allocateCostPool(pool, book, balanceOf);
    expect(byPosition.get('P2')).toBeCloseTo(25_000);
    expect(byPosition.get('P4')).toBeCloseTo(25_000);
    expect(byPosition.has('P1')).toBe(false);
    expect(allocated).toBeCloseTo(50_000);
  });

  it('Headcount driver - by org-unit headcount, then balance within the unit', () => {
    const pool: CostPool = { id: 'C', name: 'HR', amount: 60_000, driver: 'Headcount' };
    const { byPosition, allocated } = allocateCostPool(pool, book, balanceOf, { CORP: 2, RETAIL: 1 });
    expect(byPosition.get('P1')).toBeCloseTo(20_000);
    expect(byPosition.get('P3')).toBeCloseTo(20_000);
    // RETAIL 20,000 over 2m / 0.5m / 0.5m
    expect(byPosition.get('P2')).toBeCloseTo(13_333.333);
    expect(byPosition.get('P4')).toBeCloseTo(3_333.333);
    expect(byPosition.get('P5')).toBeCloseTo(3_333.333);
    expect(allocated).toBeCloseTo(60_000);

    const missing = run({ costRules: { pools: [pool] } });
    expect(missing.costPools[0]!.allocated).toBe(0);
    expect(missing.costPools[0]!.residual).toBe(60_000);
    expect(missing.totalOpexResidual).toBe(60_000);
  });

  it('Fixed driver - set shares, residual reported for a key with no positions', () => {
    const pool: CostPool = {
      id: 'D',
      name: 'Head office',
      amount: 30_000,
      driver: 'Fixed',
      fixedShares: { CORP: 50, RETAIL: 30, OPS: 20 },
    };
    const r = run({ costRules: { pools: [pool] } });
    expect(line(r, 'P1').opex).toBeCloseTo(-7_500);
    expect(line(r, 'P3').opex).toBeCloseTo(-7_500);
    expect(line(r, 'P2').opex).toBeCloseTo(-6_000);
    expect(line(r, 'P4').opex).toBeCloseTo(-1_500);
    expect(r.costPools[0]!.allocated).toBeCloseTo(24_000);
    expect(r.costPools[0]!.residual).toBeCloseTo(6_000);
    expect(r.costPools[0]!.note).toContain('OPS');
    // Allocated opex in the tree equals the pool less residual.
    expect(-r.nodes[GROUP_NODE_ID]!.opex).toBeCloseTo(24_000);
  });

  it('sums every pool to its total across multiple pools', () => {
    const pools: CostPool[] = [
      BALANCE_POOL,
      { id: 'B', name: 'Ops', amount: 50_000, driver: 'AccountCount', targets: { productCodes: ['DEP'] } },
      { id: 'C', name: 'HR', amount: 60_000, driver: 'Headcount' },
    ];
    const r = run({ costRules: { pools }, headcountByOrgUnit: { CORP: 2, RETAIL: 1 } });
    expect(r.totalOpexPool).toBe(210_000);
    expect(r.totalOpexAllocated).toBeCloseTo(210_000);
    expect(-r.lines.reduce((s, l) => s + l.opex, 0)).toBeCloseTo(210_000);
    expect(line(r, 'P2').opexByPool).toEqual({
      A: expect.closeTo(-40_000),
      B: expect.closeTo(-25_000),
      C: expect.closeTo(-13_333.333),
    });
  });
});

describe('computeProfitability - expected credit loss', () => {
  it('PdLgd - balance × PD × LGD, converted; provision used for non-performing when asked', () => {
    const r = run();
    expect(line(r, 'P3').ecl).toBeCloseTo(-10_000); // 10,000 GHS × 1% = 100 GHS = 10,000 NGN
    expect(line(r, 'P5').ecl).toBeCloseTo(-5_000);
    expect(line(r, 'P2').ecl).toBe(0);

    const withProvision = run({ creditLoss: { ...PD_LGD, useProvisionAmount: true } });
    expect(line(withProvision, 'P3').ecl).toBeCloseTo(-5_000); // 50 GHS
    expect(line(withProvision, 'P1').ecl).toBeCloseTo(-10_000); // performing - still PD × LGD
  });

  it('PdLgd - a product with no PD/LGD is null, not zero', () => {
    const r = run({ creditLoss: { method: 'PdLgd', useProvisionAmount: false } });
    expect(line(r, 'P1').ecl).toBeNull();
    expect(line(r, 'P1').riskAdjustedProfit).toBeNull();
    expect(r.nodes[GROUP_NODE_ID]!.eclMissingCount).toBe(3);
  });

  it('ProvisionChange - current less prior provision, converted', () => {
    const r = run({
      creditLoss: { method: 'ProvisionChange', useProvisionAmount: true, priorProvisionByPositionId: { P1: 4_000 } },
    });
    expect(line(r, 'P1').ecl).toBeCloseTo(-6_000);
    expect(line(r, 'P3').ecl).toBeCloseTo(-5_000);
    expect(line(r, 'P5').ecl).toBe(0);

    const release = run({
      creditLoss: { method: 'ProvisionChange', useProvisionAmount: true, priorProvisionByPositionId: { P1: 12_000 } },
    });
    expect(line(release, 'P1').ecl).toBeCloseTo(2_000);

    const stock = run({ creditLoss: { method: 'ProvisionChange', useProvisionAmount: true } });
    expect(line(stock, 'P1').ecl).toBeCloseTo(-10_000);

    const none = run({ creditLoss: { method: 'ProvisionChange', useProvisionAmount: false } });
    expect(line(none, 'P1').ecl).toBeNull();
  });
});

describe('computeProfitability - aggregation', () => {
  const LAYER_KEYS = [
    'assetBalance',
    'liabilityBalance',
    'clientNetInterest',
    'ftp',
    'netInterestAfterFtp',
    'opex',
    'ecl',
    'rwa',
    'allocatedCapital',
    'capitalCharge',
    'riskAdjustedProfit',
    'unpricedCount',
    'unpricedBalance',
    'unpricedClientNetInterest',
  ] as const;

  function expectReconciles(r: ProfitabilityLayersResult, node: ProfitabilityNode) {
    if (node.childIds.length === 0) {
      // Leaf: equals the sum of its position lines.
      const lines = r.lines.filter((l) => node.positionIds.includes(l.positionId));
      expect(node.opex).toBeCloseTo(lines.reduce((s, l) => s + l.opex, 0));
      expect(node.capitalCharge).toBeCloseTo(lines.reduce((s, l) => s + l.capitalCharge, 0));
      expect(node.clientNetInterest).toBeCloseTo(
        lines.filter((l) => l.priced).reduce((s, l) => s + l.clientNetInterest!, 0),
      );
      return;
    }
    const children = node.childIds.map((id) => r.nodes[id]!);
    for (const key of LAYER_KEYS) {
      const sum = children.reduce((s, c) => s + (c[key] ?? 0), 0);
      expect(node[key] ?? 0, `${node.id}.${key}`).toBeCloseTo(sum);
    }
    expect(children.flatMap((c) => c.positionIds).sort()).toEqual([...node.positionIds].sort());
    children.forEach((c) => expectReconciles(r, c));
  }

  const pools: CostPool[] = [
    BALANCE_POOL,
    { id: 'D', name: 'Head office', amount: 30_000, driver: 'Fixed', fixedShares: { CORP: 50, RETAIL: 50 } },
  ];

  it('builds Group → affiliate → business unit → product, every node the sum of its children', () => {
    const r = run({ costRules: { pools } });
    const group = r.nodes[GROUP_NODE_ID]!;
    expect(group.childIds.sort()).toEqual(['AFF:GH', 'AFF:NG']);
    expect(r.nodes['AFF:NG']!.childIds.sort()).toEqual(['BU:NG|CORP', 'BU:NG|RETAIL']);
    expect(r.nodes['BU:NG|RETAIL']!.childIds.sort()).toEqual(['PRD:NG|RETAIL|DEP', 'PRD:NG|RETAIL|LOAN']);
    expect(r.nodes['PRD:NG|RETAIL|LOAN']!.positionIds).toEqual(['P5']);
    expectReconciles(r, group);
    expectReconciles(r, r.nodes[CUSTOMERS_NODE_ID]!);
  });

  it('hand-computed Group totals, with unpriced positions disclosed and kept out of the margin', () => {
    const g = run().nodes[GROUP_NODE_ID]!;
    expect(g.assetBalance).toBeCloseTo(2_500_000);
    expect(g.liabilityBalance).toBeCloseTo(2_500_000);
    expect(g.clientNetInterest).toBeCloseTo(330_000); // 200k − 100k + 250k − 20k
    expect(g.ftp).toBeCloseTo(-90_000); // −150k + 200k − 200k + 60k
    expect(g.netInterestAfterFtp).toBeCloseTo(240_000);
    expect(g.unpricedCount).toBe(1);
    expect(g.unpricedBalance).toBeCloseTo(500_000);
    expect(g.unpricedClientNetInterest).toBeCloseTo(90_000);
    expect(g.opex).toBeCloseTo(-100_000);
    expect(g.ecl).toBeCloseTo(-25_000); // P1 10k + P3 10k + P5 5k
    expect(g.allocatedCapital).toBeCloseTo(250_000);
    expect(g.capitalCharge).toBeCloseTo(-37_500);
    expect(g.riskAdjustedProfit).toBeCloseTo(77_500); // 240k − 100k − 25k − 37.5k
    expect(g.rarocPercent).toBeCloseTo(46); // 115k / 250k
    expect(g.shareOfRiskAdjustedProfit).toBe(1);
  });

  it('a node holding only unpriced positions reports FTP as null', () => {
    const r = run();
    expect(r.nodes['PRD:NG|RETAIL|LOAN']!.ftp).toBeNull();
    expect(r.nodes['PRD:NG|CORP|LOAN']!.ftp).toBeCloseTo(-150_000);
  });

  it('groups the by-customer view on counterparty, with a No counterparty bucket', () => {
    const r = run();
    const customers = r.nodes[CUSTOMERS_NODE_ID]!;
    expect(customers.childIds.sort()).toEqual(['CUST:C1', 'CUST:C2', 'CUST:C3', `CUST:${NO_COUNTERPARTY}`]);
    const c1 = r.nodes['CUST:C1']!;
    expect(c1.positionIds.sort()).toEqual(['P1', 'P3']);
    expect(c1.clientNetInterest).toBeCloseTo(450_000);
    expect(r.nodes[`CUST:${NO_COUNTERPARTY}`]!.positionIds).toEqual(['P5']);
    expect(customers.riskAdjustedProfit).toBeCloseTo(r.nodes[GROUP_NODE_ID]!.riskAdjustedProfit);
  });

  it('waterfall steps run in order and foot to risk-adjusted profit', () => {
    const g = run().nodes[GROUP_NODE_ID]!;
    const steps = layersFor(g);
    expect(steps.map((s) => s.label)).toEqual([
      'Net interest income (client rates)',
      'Funding cost / credit (FTP)',
      'Operating expenses',
      'Expected credit loss',
      'Capital charge',
      'Risk-adjusted profit',
    ]);
    expect(steps[4]!.cumulative).toBeCloseTo(g.riskAdjustedProfit);
    expect(steps[5]!.value).toBeCloseTo(77_500);
    expect(steps[5]!.isTotal).toBe(true);
  });

  it('throws rather than summing a currency it cannot convert', () => {
    expect(() => run({ fx: { pivot: 'NGN', toPivot: { NGN: 1 }, asOfDate: AS_OF } })).toThrow(/GHS/);
  });
});
