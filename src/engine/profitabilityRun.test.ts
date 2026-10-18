/**
 * Multi-layer profitability wired through the run: the ProfitabilityLayers element reads the run's own
 * transfer-pricing lines, its three rules, and fails - naming what to configure - when any is missing.
 */

import { describe, expect, it } from 'vitest';
import { executeRun, draftRun, type RunInputs } from './run';
import { defaultLadder } from './buckets';
import { DEFAULT_PATTERNS } from './behavioural';
import { identityFxTable } from './fx';
import { NIGERIA_POSITIONS, NIGERIA_AS_OF, NIGERIA_BATCH_ID } from '@/data/seed/nigeria';
import type { FtpResult, YieldCurve } from './ftp';
import type { ProfitabilityLayersResult } from './profitabilityLayers';
import type { DimensionMember } from './types';

const NGN_CURVE: YieldCurve = {
  currency: 'NGN',
  indexCode: 'NGN-INTERBANK',
  points: [
    { tenorDays: 30, ratePercent: 12 },
    { tenorDays: 365, ratePercent: 15 },
    { tenorDays: 1825, ratePercent: 18 },
  ],
  asOfDate: NIGERIA_AS_OF,
};

const BASE_INPUTS: RunInputs = {
  positions: NIGERIA_POSITIONS,
  fx: identityFxTable('NGN', NIGERIA_AS_OF),
  liquidityLadder: defaultLadder('LiquidityGap'),
  repricingLadder: defaultLadder('RepricingGap'),
  behaviourPatterns: DEFAULT_PATTERNS,
  orgUnitMembers: [] as DimensionMember[],
  productMembers: [] as DimensionMember[],
  tier1Capital: null,
  yieldCurves: [NGN_CURVE],
};

const PROFITABILITY_INPUTS: Pick<RunInputs, 'costAllocation' | 'creditLoss' | 'capital'> = {
  costAllocation: {
    currency: 'NGN',
    pools: [
      { id: 'BR', name: 'Branch network', amount: 2_000_000_000, driver: 'Balance' },
      { id: 'IT', name: 'IT', amount: 500_000_000, driver: 'AccountCount' },
    ],
    headcountByOrgUnit: {},
  },
  creditLoss: { method: 'PdLgd', defaultPdPct: 3, defaultLgdPct: 45, useProvisionAmount: true },
  capital: {
    riskWeightByProductClass: { 'COA-13': 0 },
    defaultRiskWeightPct: 100,
    capitalRatioPct: 12.5,
    costOfCapitalPct: 18,
    taxRatePct: 30,
  },
};

const RUN = {
  ...draftRun({
    id: 'R-PROF',
    name: 'July close',
    asOfDate: NIGERIA_AS_OF,
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    timeBucketRuleId: 'TB-1',
    batchIds: [NIGERIA_BATCH_ID],
    createdBy: 'tester',
    createdAt: '2026-08-01T09:00:00Z',
    elements: ['Lcr', 'TransferPricing', 'ProfitabilityLayers'],
  }),
  ftpRuleId: 'FTP-1',
  costAllocationRuleId: 'COST-1',
  creditLossRuleId: 'ECL-1',
  capitalRuleId: 'CAP-1',
};

const NOW = '2026-08-01T09:01:00Z';
const payload = <T>(outcome: ReturnType<typeof executeRun>, element: string) =>
  outcome.results.find((r) => r.element === element)?.payload as T | undefined;

describe('run - ProfitabilityLayers element', () => {
  it('computes from the three rules and reconciles to the run’s own FTP margin', () => {
    const outcome = executeRun(RUN, { ...BASE_INPUTS, ...PROFITABILITY_INPUTS }, NOW);
    expect(outcome.errors).toEqual([]);
    const layers = payload<ProfitabilityLayersResult>(outcome, 'ProfitabilityLayers')!;
    const ftp = payload<FtpResult>(outcome, 'TransferPricing')!;
    expect(layers).toBeDefined();
    expect(ftp).toBeDefined();

    const group = layers.nodes[layers.rootId]!;
    // Client interest + FTP over priced positions is exactly the transfer-pricing margin of the same run.
    expect(group.netInterestAfterFtp).toBeCloseTo(ftp.totalMarginContribution, 2);
    expect(group.ftp).not.toBeNull();
    // Every in-scope position the FTP element priced appears as a profitability line.
    expect(layers.lines.map((l) => l.positionId).sort()).toEqual(ftp.lines.map((l) => l.positionId).sort());

    // Opex: allocated + residual = pool, and the Group carries all of it.
    expect(layers.totalOpexPool).toBe(2_500_000_000);
    expect(layers.totalOpexAllocated + layers.totalOpexResidual).toBeCloseTo(layers.totalOpexPool, 2);
    expect(group.opex).toBeCloseTo(-layers.totalOpexAllocated, 2);

    // The layers add up to risk-adjusted profit.
    expect(group.riskAdjustedProfit).toBeCloseTo(
      group.clientNetInterest + (group.ftp ?? 0) + group.opex + group.ecl + group.capitalCharge,
      2,
    );
    // Sovereign bonds (COA-13) take the 0% weight; everything else the 100% default.
    expect(layers.lines.filter((l) => l.category === 'Asset' && l.riskWeightPct === 0).length).toBeGreaterThan(0);
    expect(group.allocatedCapital).toBeCloseTo(group.rwa * 0.125, 2);
    expect(group.capitalCharge).toBeCloseTo(-group.allocatedCapital * 0.18, 2);

    // The affiliate node is the Group for a one-affiliate run, and children sum to parents.
    const affiliate = layers.nodes[group.childIds[0]!]!;
    expect(affiliate.riskAdjustedProfit).toBeCloseTo(group.riskAdjustedProfit, 2);
    const buTotal = affiliate.childIds.reduce((s, id) => s + layers.nodes[id]!.riskAdjustedProfit, 0);
    expect(buTotal).toBeCloseTo(affiliate.riskAdjustedProfit, 2);
  });

  it('reads the same transfer rates even when the Transfer Pricing element is not selected', () => {
    const withTp = executeRun(RUN, { ...BASE_INPUTS, ...PROFITABILITY_INPUTS }, NOW);
    const alone = executeRun(
      { ...RUN, elements: ['ProfitabilityLayers'] },
      { ...BASE_INPUTS, ...PROFITABILITY_INPUTS },
      NOW,
    );
    const a = payload<ProfitabilityLayersResult>(withTp, 'ProfitabilityLayers')!;
    const b = payload<ProfitabilityLayersResult>(alone, 'ProfitabilityLayers')!;
    expect(b).toBeDefined();
    expect(b.nodes[b.rootId]!.ftp).toBeCloseTo(a.nodes[a.rootId]!.ftp!, 2);
  });

  it('fails the element - and only that element - naming every missing rule', () => {
    const outcome = executeRun(RUN, { ...BASE_INPUTS, costAllocation: null, creditLoss: null, capital: null }, NOW);
    expect(outcome.run.status).toBe('Completed');
    expect(payload(outcome, 'ProfitabilityLayers')).toBeUndefined();
    expect(payload(outcome, 'TransferPricing')).toBeDefined();
    const error = outcome.errors.find((e) => e.code === 'ProfitabilityLayers_FAILED')!;
    expect(error.message).toContain('Cost Allocation rule');
    expect(error.message).toContain('Credit Loss rule');
    expect(error.message).toContain('Capital rule');
  });

  it('names only the rule that is missing', () => {
    const outcome = executeRun(RUN, { ...BASE_INPUTS, ...PROFITABILITY_INPUTS, capital: null }, NOW);
    const error = outcome.errors.find((e) => e.code === 'ProfitabilityLayers_FAILED')!;
    expect(error.message).toContain('Capital rule');
    expect(error.message).not.toContain('Cost Allocation rule');
  });

  it('refuses cost pools entered in a currency other than the run’s reporting currency', () => {
    const outcome = executeRun(
      RUN,
      {
        ...BASE_INPUTS,
        ...PROFITABILITY_INPUTS,
        costAllocation: { ...PROFITABILITY_INPUTS.costAllocation!, currency: 'USD' },
      },
      NOW,
    );
    const error = outcome.errors.find((e) => e.code === 'ProfitabilityLayers_FAILED')!;
    expect(error.message).toMatch(/USD.*NGN/);
  });
});
