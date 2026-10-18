/**
 * Behavioural assumptions wired through the run: multi-currency FTP roll-ups, behavioural-tenor
 * pricing of non-maturity deposits, deposit betas in NII, prepayment re-dating, and a severe run
 * derived from the behaviour pattern rule rather than constants.
 */

import { describe, expect, it } from 'vitest';
import { computeFtp, type YieldCurve } from './ftp';
import { computeNiiSensitivity } from './irrbb';
import { applyPrepayment, DEFAULT_BETAS, DEFAULT_PATTERNS, type BehaviourPattern } from './behavioural';
import { DEFAULT_STRESS_SEVERITY, deriveSevereRun } from './stress';
import { draftRun, executeRun, type RunInputs } from './run';
import { defaultLadder } from './buckets';
import { buildFxTable, identityFxTable } from './fx';
import { NIGERIA_AS_OF, NIGERIA_BATCH_ID, NIGERIA_POSITIONS } from '@/data/seed/nigeria';
import type { Position } from './types';

const AS_OF = NIGERIA_AS_OF;

function position(overrides: Partial<Position>): Position {
  return {
    ...NIGERIA_POSITIONS[0]!,
    asOfDate: AS_OF,
    batchId: NIGERIA_BATCH_ID,
    isOffBalanceSheet: false,
    lienAmount: 0,
    turnover: null,
    ...overrides,
  };
}

function curve(currency: string, ratePercent: (days: number) => number): YieldCurve {
  return {
    currency,
    indexCode: `${currency}-CURVE`,
    points: [30, 365, 1095, 1825].map((tenorDays) => ({ tenorDays, ratePercent: ratePercent(tenorDays) })),
    asOfDate: AS_OF,
  };
}

const FLAT_10 = (c: string) => curve(c, () => 10);
const UPWARD = (c: string) => curve(c, (d) => 5 + d / 365);

describe('computeFtp - FX conversion and roll-ups', () => {
  // 1 USD = 1000 NGN, so 1 NGN = 0.001 USD.
  const fx = buildFxTable('USD', [{ base: 'USD', quote: 'NGN', rate: 1000, asOfDate: AS_OF }], AS_OF);
  const ngnLoan = position({
    id: 'NG-LOAN',
    category: 'Asset',
    currency: 'NGN',
    amount: 1_000_000,
    interestRatePct: 12,
    affiliateCode: 'NG',
    productCode: 'P-LOAN',
    productClass: 'Loans',
    orgUnitCode: 'OU-RETAIL',
    maturityDate: '2027-07-31',
    nextRepricingDate: null,
    behaviouralTag: 'N/A',
  });
  const usdLoan = position({
    id: 'GH-LOAN',
    category: 'Asset',
    currency: 'USD',
    amount: 1_000,
    interestRatePct: 12,
    affiliateCode: 'GH',
    productCode: 'P-LOAN',
    productClass: 'Loans',
    orgUnitCode: 'OU-CORP',
    maturityDate: '2027-07-31',
    nextRepricingDate: null,
    behaviouralTag: 'N/A',
  });

  const result = computeFtp([ngnLoan, usdLoan], [FLAT_10('NGN'), FLAT_10('USD')], [], {
    asOfDate: AS_OF,
    currentLcrPercent: null,
    reportingCurrency: 'USD',
    fx,
  });

  it('keeps each line in its own currency but sums the reporting-currency figure', () => {
    const ng = result.lines.find((l) => l.positionId === 'NG-LOAN')!;
    expect(ng.marginContribution).toBeCloseTo(20_000); // 2% of 1m NGN
    expect(ng.marginContributionReporting).toBeCloseTo(20); // in USD
    // 20 USD (from NGN) + 20 USD - not 20,020 of mixed currency.
    expect(result.totalMarginContribution).toBeCloseTo(40);
    expect(result.currency).toBe('USD');
  });

  it('rolls up by product, org unit and affiliate, with drill-down keys on every line', () => {
    expect(result.byProduct).toEqual([
      { productCode: 'P-LOAN', productClass: 'Loans', marginContribution: expect.closeTo(40) },
    ]);
    expect(result.byAffiliate.map((a) => a.affiliateCode).sort()).toEqual(['GH', 'NG']);
    expect(result.byOrgUnit).toHaveLength(2);
    const line = result.lines[0]!;
    expect(line).toMatchObject({
      positionId: 'NG-LOAN',
      productCode: 'P-LOAN',
      orgUnitCode: 'OU-RETAIL',
      affiliateCode: 'NG',
    });
  });
});

describe('computeFtp - non-maturity deposits at behavioural tenor', () => {
  const nmd = position({
    id: 'NMD',
    category: 'Liability',
    currency: 'NGN',
    amount: 1_000_000,
    interestRatePct: 2,
    behaviouralTag: 'Core',
    maturityDate: null,
    nextRepricingDate: null,
  });

  it('prices off the pattern tiers rather than day 0 when patterns are supplied', () => {
    const contractual = computeFtp([nmd], [UPWARD('NGN')], [], { asOfDate: AS_OF, currentLcrPercent: null });
    const behavioural = computeFtp([nmd], [UPWARD('NGN')], [], {
      asOfDate: AS_OF,
      currentLcrPercent: null,
      behaviourPatterns: DEFAULT_PATTERNS,
    });
    expect(contractual.lines[0]!.tenorBasis).toBe('Contractual');
    expect(contractual.lines[0]!.tenorDays).toBe(0);
    expect(behavioural.lines[0]!.tenorBasis).toBe('Behavioural');
    expect(behavioural.lines[0]!.tenorDays).toBeGreaterThan(365);
    // An upward curve credits sticky core funding more than the overnight point.
    expect(behavioural.lines[0]!.baseTransferRatePercent!).toBeGreaterThan(
      contractual.lines[0]!.baseTransferRatePercent!,
    );
  });
});

describe('computeNiiSensitivity - deposit betas', () => {
  const ctx = { asOfDate: AS_OF, reportingCurrency: 'NGN', fx: identityFxTable('NGN', AS_OF), tier1Capital: null };
  const book = [
    position({
      id: 'A',
      category: 'Asset',
      amount: 1_000,
      irrbbRateSensitive: true,
      behaviouralTag: 'N/A',
      maturityDate: '2026-12-31',
      nextRepricingDate: null,
    }),
    position({
      id: 'D',
      category: 'Liability',
      amount: 1_000,
      irrbbRateSensitive: true,
      behaviouralTag: 'Core',
      maturityDate: null,
      nextRepricingDate: null,
    }),
  ];

  it('leaves the plain gap untouched when no betas are supplied', () => {
    const r = computeNiiSensitivity(book, ctx, 100);
    expect(r.depositBetasApplied).toBe(false);
    expect(r.deltaNii).toBeCloseTo(10); // 1,000 assets × 1%, deposit outside the gap
    expect(r.deltaNii).toBe(r.unadjustedDeltaNii);
  });

  it('brings the administered-rate deposit in at its beta', () => {
    const r = computeNiiSensitivity(book, { ...ctx, depositBetas: DEFAULT_BETAS }, 100);
    expect(r.depositBetasApplied).toBe(true);
    expect(r.unadjustedDeltaNii).toBeCloseTo(0); // full pass-through: 1,000 − 1,000
    // Core beta 0.35: only 350 of the deposit reprices.
    expect(r.liabilityRepricingReduction).toBeCloseTo(650);
    expect(r.deltaNii).toBeCloseTo(6.5);
  });
});

describe('applyPrepayment', () => {
  const loan = position({
    id: 'L',
    category: 'Asset',
    amount: 1_000,
    commonCoaCode: 'COA-MORTGAGE',
    maturityDate: '2029-07-31',
    nextRepricingDate: null,
  });

  it('re-dates prepaid principal earlier without changing the balance', () => {
    const out = applyPrepayment([loan], AS_OF, [{ commonCoaCode: 'COA-MORTGAGE', cpr: 0.2 }]);
    expect(out.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1_000);
    const first = out.find((p) => p.id === 'L#PRE1')!;
    expect(first.amount).toBeCloseTo(200);
    expect(first.maturityDate! < loan.maturityDate!).toBe(true);
    expect(first.nextRepricingDate).toBe(first.maturityDate);
    expect(out.find((p) => p.id === 'L#PRE-REMAINING')!.maturityDate).toBe(loan.maturityDate);
  });

  it('leaves assets with no rule, and every liability, alone', () => {
    const deposit = position({ id: 'D', category: 'Liability', commonCoaCode: 'COA-MORTGAGE' });
    expect(applyPrepayment([deposit], AS_OF, [{ commonCoaCode: 'COA-MORTGAGE', cpr: 0.2 }])).toEqual([deposit]);
    expect(applyPrepayment([loan], AS_OF, [{ commonCoaCode: 'OTHER', cpr: 0.2 }])).toEqual([loan]);
  });
});

describe('deriveSevereRun', () => {
  const ctx = { asOfDate: AS_OF, reportingCurrency: 'NGN', fx: identityFxTable('NGN', AS_OF) };
  const volatileHalf: BehaviourPattern[] = [
    {
      id: 'P',
      name: 'Half volatile',
      appliesTo: ['Non-Core'],
      tiers: [
        { tenorDays: 30, percent: 50, type: 'Volatile' },
        { tenorDays: 365, percent: 50, type: 'Core' },
      ],
    },
  ];
  const book = [
    position({
      id: 'DEP',
      category: 'Liability',
      amount: 1_000,
      behaviouralTag: 'Non-Core',
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 10,
    }),
    position({
      id: 'WHOLESALE',
      category: 'Liability',
      amount: 1_000,
      behaviouralTag: 'N/A',
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 25,
    }),
  ];

  it("runs the rule's volatile share fast and scales other outflows by the severity", () => {
    const r = deriveSevereRun(book, volatileHalf, ctx);
    expect(r.severityMultiplier).toBe(DEFAULT_STRESS_SEVERITY);
    expect(r.depositRunoff).toBeCloseTo(1_000); // 50% × 2, capped at 100%
    expect(r.otherOutflows).toBeCloseTo(500); // 25% × 2 - the patterned deposit is not double-counted
    expect(r.profile.totalOutflow).toBeCloseTo(1_500);
    expect(r.profile.frontLoadedPercent).toBeCloseTo((1_000 / 1_500) * 100);
  });

  it('responds to the configured severity', () => {
    const mild = deriveSevereRun(book, volatileHalf, ctx, { severityMultiplier: 1 });
    expect(mild.depositRunoff).toBeCloseTo(500);
    expect(mild.otherOutflows).toBeCloseTo(250);
  });
});

describe('executeRun - behavioural inputs reach the elements', () => {
  const base = draftRun({
    id: 'R-BEH',
    name: 'Behavioural wiring',
    asOfDate: AS_OF,
    affiliateCode: 'NG',
    reportingCurrency: 'NGN',
    timeBucketRuleId: 'TB',
    batchIds: [NIGERIA_BATCH_ID],
    createdBy: 'tester',
    createdAt: '2026-08-01T09:00:00Z',
    elements: ['NiiSensitivity', 'LiquidityGap', 'SurvivalHorizon', 'RepricingGap'],
  });
  const inputs: RunInputs = {
    positions: NIGERIA_POSITIONS,
    fx: identityFxTable('NGN', AS_OF),
    liquidityLadder: defaultLadder('LiquidityGap'),
    repricingLadder: defaultLadder('RepricingGap'),
    behaviourPatterns: DEFAULT_PATTERNS,
    orgUnitMembers: [],
    productMembers: [],
    tier1Capital: null,
  };
  const payload = <T>(outcome: ReturnType<typeof executeRun>, element: string) =>
    outcome.results.find((r) => r.element === element)!.payload as T;

  it('applies betas to NII only when the rule supplies them', () => {
    const without = executeRun(base, inputs, 'now');
    const withBetas = executeRun(base, { ...inputs, depositBetas: DEFAULT_BETAS }, 'now');
    expect(payload<{ depositBetasApplied: boolean }>(without, 'NiiSensitivity').depositBetasApplied).toBe(false);
    expect(payload<{ depositBetasApplied: boolean }>(withBetas, 'NiiSensitivity').depositBetasApplied).toBe(true);
  });

  it('derives the survival-horizon outflow from the behaviour pattern rule', () => {
    const outcome = executeRun(base, { ...inputs, stressSeverityMultiplier: 3 }, 'now');
    const survival = payload<{ severeRun: { severityMultiplier: number } | null }>(outcome, 'SurvivalHorizon');
    expect(survival.severeRun?.severityMultiplier).toBe(3);
  });

  it('reports prepayment alongside the behavioural gap when a rule is supplied', () => {
    const coa = NIGERIA_POSITIONS.find((p) => p.category === 'Asset' && p.maturityDate)!.commonCoaCode;
    const outcome = executeRun(base, { ...inputs, prepaymentRules: [{ commonCoaCode: coa, cpr: 0.1 }] }, 'now');
    const gap = payload<{ prepayment: { totalProjectedPayoff: number } | null }>(outcome, 'LiquidityGap');
    expect(gap.prepayment?.totalProjectedPayoff).toBeGreaterThan(0);
    expect(payload<{ prepayment: unknown }>(executeRun(base, inputs, 'now'), 'LiquidityGap').prepayment).toBeNull();
  });
});
