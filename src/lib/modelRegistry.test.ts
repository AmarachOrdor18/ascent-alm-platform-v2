import { describe, expect, it } from 'vitest';
import {
  accountCoverage,
  balanceCoverage,
  buildProposal,
  canPropose,
  commonCoaByProduct,
  describeFitError,
  effectiveModelStatus,
  patternIdFor,
  ProposalError,
  runCalibration,
  summariseUploads,
  toStoredBalanceRows,
  toStoredModelRun,
  type CalibrationData,
} from './modelRegistry';
import { DEFAULT_BETAS, DEFAULT_PATTERNS } from '@/engine/behavioural';
import type { AccountObservation, BalanceObservation } from '@/engine/behaviouralModels';
import type { BehaviourPatternRule, PrepaymentRule } from '@/engine/ruleTypes';
import type { ApprovalRequest, EconomicIndicator, RuleMeta } from '@/engine/types';
import type { StoredModelRun } from '@/store/repository';

// Synthetic, deterministic series - test fixtures only, never shipped as app data.
const dateAt = (i: number) => {
  const y = 2024 + Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-28`;
};

const decaying = (n = 24): BalanceObservation[] =>
  Array.from({ length: n }, (_, t) => ({
    affiliateCode: 'NG',
    asOfDate: dateAt(t),
    productCode: 'SAV',
    currency: 'NGN',
    balance: (1000 + 500 * Math.exp(-0.1 * t)) * (1 + 0.002 * Math.sin(t)),
    ratePercent: 3 + 0.4 * (policyAt(t) - 10) + 0.01 * Math.sin(t * 1.7),
  }));

const growing = (n = 24): BalanceObservation[] =>
  Array.from({ length: n }, (_, t) => ({
    affiliateCode: 'NG',
    asOfDate: dateAt(t),
    productCode: 'CUR',
    currency: 'NGN',
    balance: 1000 * (1 + 0.02 * t) * (1 + 0.03 * Math.sin(t * 2.1)),
  }));

function policyAt(t: number): number {
  const k = t % 6;
  return 10 + (k < 3 ? k : 6 - k) * 0.5;
}

const policy = {
  id: 'IND-MPR',
  code: 'MPR',
  name: 'Monetary policy rate',
  countryCode: 'NG',
  frequency: 'Monthly',
  valueType: 'Rate',
  unit: '%',
  observations: Array.from({ length: 30 }, (_, t) => ({ asOfDate: dateAt(t), value: policyAt(t) })),
  isActive: true,
  updatedBy: 'test',
  updatedAt: '2026-01-01T00:00:00Z',
} as unknown as EconomicIndicator;

const loans = (): AccountObservation[] =>
  Array.from({ length: 20 }, (_, a) =>
    Array.from({ length: 14 }, (_, t) => ({
      affiliateCode: 'NG',
      accountNumber: `L${a}`,
      asOfDate: dateAt(t),
      productCode: 'MORT',
      currency: 'NGN',
      scheduledBalance: 1000 - 10 * t,
      balance: 1000 - 10 * t - (t === 0 ? 0 : 5),
      maturityDate: '2035-01-01',
    })),
  ).flat();

const NOW = '2026-10-17T10:00:00.000Z';
const data = (over: Partial<CalibrationData> = {}): CalibrationData => ({
  balances: [...decaying(), ...growing()],
  accounts: loans(),
  indicators: [policy],
  now: NOW,
  ...over,
});

const runoffSpec = {
  modelType: 'DepositRunoff' as const,
  segmentation: ['productCode' as const, 'currency' as const],
  segmentId: 'productCode=SAV|currency=NGN',
  coreMethod: 'MinimumBalance' as const,
  windowMonths: 12,
  coreConfidence: 0.99,
  decayMethod: 'DecayFit' as const,
  outflowConfidence: 0.95,
  appliesTo: ['Non-Core' as const],
  patternName: 'Savings - fitted',
  holdoutMonths: 3,
  tolerance: 10,
};

const store = (outcome: ReturnType<typeof runCalibration>, existing: StoredModelRun[] = []) =>
  toStoredModelRun(outcome, { affiliateCode: 'NG', createdBy: 'Maker', existing });

const ctx = (rules: RuleMeta[] = [], requests: ApprovalRequest[] = [], coaByProduct?: Record<string, string>) => ({
  rules,
  requests,
  userName: 'Maker',
  now: NOW,
  ...(coaByProduct ? { coaByProduct } : {}),
});

function envelope(kind: RuleMeta['kind'], over: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id: `${kind}-1`,
    kind,
    name: `${kind} rule`,
    description: '',
    folder: 'Group Default',
    accessType: 'Read-Write',
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy: 'system-seed',
    createdAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    ...over,
  };
}

describe('coverage', () => {
  it('reports months, gaps and usability per segment', () => {
    const rows = decaying(14).filter((_, i) => i !== 5);
    const cov = balanceCoverage(rows, ['productCode', 'currency']);
    expect(cov.error).toBeNull();
    const s = cov.segments[0]!;
    expect(s.months).toBe(13);
    expect(s.gaps).toEqual(['2024-06']);
    expect(s.usable).toBe(true);
    expect(s.ratedMonths).toBe(13);
  });

  it('flags a segmentation that mixes currencies instead of throwing', () => {
    const rows = [...decaying(3), { ...decaying(1)[0]!, currency: 'USD', asOfDate: '2024-05-28' }];
    const cov = balanceCoverage(rows, ['productCode']);
    expect(cov.error).toMatch(/mixes currencies/);
  });

  it('summarises account pools and uploads', () => {
    const pools = accountCoverage(loans());
    expect(pools).toHaveLength(1);
    expect(pools[0]!).toMatchObject({
      productCode: 'MORT',
      accounts: 20,
      months: 14,
      usable: true,
      withScheduledBalance: 280,
    });
    const stored = toStoredBalanceRows(decaying(3), {
      uploadId: 'U1',
      fileName: 'a.csv',
      uploadedBy: 'T',
      uploadedAt: '2026-01-01',
    });
    expect(summariseUploads(stored)).toEqual([
      expect.objectContaining({ uploadId: 'U1', rows: 3, firstDate: '2024-01-28', lastDate: '2024-03-28' }),
    ]);
  });
});

describe('runCalibration', () => {
  it('fits deposit run-off with a back-test and a chart of actual vs fitted', () => {
    const out = runCalibration(runoffSpec, data());
    expect(out.run.modelType).toBe('DepositRunoff');
    expect(Number(out.run.params.lambdaMonthly)).toBeGreaterThan(0);
    expect(out.run.backtest?.points).toHaveLength(3);
    expect(out.run.outputs.behaviourPattern?.id).toBe(patternIdFor('productCode=SAV|currency=NGN'));
    expect(out.chart).toHaveLength(24);
    expect(out.chart.every((p) => p.fitted !== null)).toBe(true);
  });

  it('refuses a decay fit on a growing book and offers outflow percentile, which then works', () => {
    const spec = { ...runoffSpec, segmentId: 'productCode=CUR|currency=NGN' };
    let caught: unknown;
    try {
      runCalibration(spec, data());
    } catch (e) {
      caught = e;
    }
    const view = describeFitError(caught);
    expect(view.suggestOutflowPercentile).toBe(true);
    const out = runCalibration({ ...spec, decayMethod: 'OutflowPercentile' }, data());
    expect(out.run.params.decayMethod).toBe('OutflowPercentile');
    expect(out.run.backtest).toBeNull();
  });

  it('explains insufficient history', () => {
    let caught: unknown;
    try {
      runCalibration({ ...runoffSpec, holdoutMonths: 0 }, data({ balances: decaying(8) }));
    } catch (e) {
      caught = e;
    }
    expect(describeFitError(caught).title).toMatch(/Not enough history/);
  });

  it('fits a repricing beta against the policy series', () => {
    const out = runCalibration(
      {
        modelType: 'RepricingBeta',
        segmentation: ['productCode', 'currency'],
        segmentId: 'productCode=SAV|currency=NGN',
        policyIndicatorId: 'IND-MPR',
        behaviouralTag: 'Non-Core',
        maxLagMonths: 2,
        holdoutMonths: 3,
        tolerance: 0.25,
      },
      data(),
    );
    expect(Number(out.run.params.beta)).toBeCloseTo(0.4, 1);
    expect(out.run.params.lagMonths).toBe(0);
    expect(out.run.confidenceIntervals.beta).toBeDefined();
    expect(out.run.backtest?.passed).toBe(true);
  });

  it('fits prepayment from account snapshots', () => {
    const out = runCalibration(
      {
        modelType: 'Prepayment',
        productCode: 'MORT',
        currency: 'NGN',
        minSnapshots: 12,
        holdoutMonths: 3,
        tolerance: 0.005,
      },
      data(),
    );
    expect(Number(out.run.params.smm)).toBeGreaterThan(0.004);
    expect(Number(out.run.params.smm)).toBeLessThan(0.007);
    expect(out.chart.length).toBe(13);
  });
});

describe('toStoredModelRun', () => {
  it('numbers versions per affiliate, model and segment and starts as Draft', () => {
    const out = runCalibration(runoffSpec, data());
    const v1 = store(out);
    expect(v1).toMatchObject({ version: 1, status: 'Draft', affiliateCode: 'NG', createdBy: 'Maker' });
    const v2 = store(runCalibration(runoffSpec, data({ now: '2026-10-18T00:00:00.000Z' })), [v1]);
    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(v1.id);
  });
});

describe('buildProposal - ModelRun to rule body', () => {
  const runoff = () => store(runCalibration(runoffSpec, data()));

  it('creates an affiliate rule from engine defaults, replacing the pattern for the fitted tag', () => {
    const run = runoff();
    const p = buildProposal(run, ctx());
    const rule = p.rule as BehaviourPatternRule;
    expect(p.basis).toBe('NewFromEngineDefaults');
    expect(rule).toMatchObject({
      kind: 'BehaviourPattern',
      affiliateCode: 'NG',
      version: 1,
      createdBy: 'Maker',
      sourceModelRunIds: [run.id],
    });
    expect(rule.patterns.filter((x) => x.appliesTo.includes('Non-Core')).map((x) => x.id)).toEqual([
      run.outputs.behaviourPattern!.id,
    ]);
    expect(rule.patterns.some((x) => x.id === 'BP-RETAIL-NONCORE')).toBe(false);
    expect(rule.patterns).toHaveLength(DEFAULT_PATTERNS.length);
    expect(rule.betas).toEqual(DEFAULT_BETAS);
  });

  it('forks the Group default when the affiliate has no rule of its own', () => {
    const group = {
      ...envelope('BehaviourPattern'),
      patterns: DEFAULT_PATTERNS,
      betas: DEFAULT_BETAS,
      stressSeverityMultiplier: 1.5,
    } as BehaviourPatternRule;
    const p = buildProposal(runoff(), ctx([group]));
    expect(p.basis).toBe('ForkGroupDefault');
    expect(p.rule.id).not.toBe(group.id);
    expect(p.rule).toMatchObject({ affiliateCode: 'NG', version: 1, folder: 'NG', stressSeverityMultiplier: 1.5 });
  });

  it('makes the next version of the affiliate’s own rule, keeping lineage and warning about a pending version', () => {
    const own = {
      ...envelope('BehaviourPattern', { id: 'BP-NG', affiliateCode: 'NG', version: 2, createdBy: 'Someone' }),
      patterns: DEFAULT_PATTERNS,
      betas: DEFAULT_BETAS,
      sourceModelRunIds: ['older-run'],
    } as BehaviourPatternRule;
    const pending = {
      id: 'APR',
      entityId: 'BP-NG',
      entityType: 'BehaviourPattern',
      entityVersion: 2,
      status: 'Pending',
      requestedAt: NOW,
    } as ApprovalRequest;
    const run = runoff();
    const p = buildProposal(run, ctx([own], [pending]));
    expect(p.basis).toBe('NewVersion');
    expect(p.rule).toMatchObject({ id: 'BP-NG', version: 3, updatedBy: 'Maker' });
    expect((p.rule as BehaviourPatternRule).sourceModelRunIds).toEqual(['older-run', run.id]);
    expect(p.warnings[0]).toMatch(/awaiting approval/);
  });

  it('merges a fitted beta into the existing betas', () => {
    const out = runCalibration(
      {
        modelType: 'RepricingBeta',
        segmentation: ['productCode', 'currency'],
        segmentId: 'productCode=SAV|currency=NGN',
        policyIndicatorId: 'IND-MPR',
        behaviouralTag: 'Non-Core',
        maxLagMonths: 0,
        holdoutMonths: 0,
        tolerance: 0.25,
      },
      data(),
    );
    const rule = buildProposal(store(out), ctx()).rule as BehaviourPatternRule;
    const nonCore = rule.betas.find((b) => b.behaviouralTag === 'Non-Core')!;
    expect(nonCore.beta).toBeCloseTo(0.4, 1);
    expect(rule.betas.find((b) => b.behaviouralTag === 'Core')).toEqual(
      DEFAULT_BETAS.find((b) => b.behaviouralTag === 'Core'),
    );
    expect(rule.patterns).toEqual(DEFAULT_PATTERNS);
  });

  it('adds term-deposit behaviour to the rule', () => {
    const td = {
      ...runoff(),
      modelType: 'TermDeposit',
      segment: {
        segmentId: 'productCode=TD|currency=NGN',
        key: { productCode: 'TD', currency: 'NGN' },
        currency: 'NGN',
      },
      params: { renewalRate: 0.62, earlyWithdrawalRate: 0.04, earlyWithdrawalRateAnnualised: 0.05 },
      outputs: {},
    } as StoredModelRun;
    const rule = buildProposal(td, ctx()).rule as BehaviourPatternRule;
    expect(rule.termDepositBehaviour).toEqual([
      { productCode: 'TD', currency: 'NGN', renewalRate: 0.62, earlyWithdrawalRate: 0.04 },
    ]);
    expect(() =>
      buildProposal({ ...td, params: { renewalRate: null, earlyWithdrawalRate: 0.04 } } as StoredModelRun, ctx()),
    ).toThrow(ProposalError);
  });

  it('maps a prepayment CPR onto the Common CoA code from committed positions', () => {
    const out = runCalibration(
      {
        modelType: 'Prepayment',
        productCode: 'MORT',
        currency: 'NGN',
        minSnapshots: 12,
        holdoutMonths: 0,
        tolerance: 0.005,
      },
      data(),
    );
    const run = store(out);
    const coa = commonCoaByProduct([
      { productCode: 'MORT', commonCoaCode: 'COA-MORT' },
      { productCode: 'MORT', commonCoaCode: 'COA-MORT' },
      { productCode: 'MORT', commonCoaCode: 'COA-OTHER' },
    ]);
    expect(coa).toEqual({ MORT: 'COA-MORT' });
    const group = {
      ...envelope('Prepayment'),
      assumptions: [{ commonCoaCode: 'COA-MORT', method: 'RateDependent', cpr: 0.1, sensitivityPer100bp: 0.02 }],
    } as PrepaymentRule;
    const p = buildProposal(run, ctx([group], [], coa));
    const rule = p.rule as PrepaymentRule;
    expect(p.basis).toBe('ForkGroupDefault');
    expect(rule.assumptions).toHaveLength(1);
    expect(rule.assumptions[0]).toMatchObject({
      commonCoaCode: 'COA-MORT',
      method: 'RateDependent',
      sensitivityPer100bp: 0.02,
    });
    expect(rule.assumptions[0]!.cpr).toBeCloseTo(Number(run.params.cpr), 5);
    expect(() => buildProposal(run, ctx([group], [], {}))).toThrow(/Common Chart of Accounts/);
  });
});

describe('effectiveModelStatus', () => {
  const base = {
    status: 'Proposed' as const,
    proposedRuleId: 'BP-NG',
    proposedRuleVersion: 3,
    proposedRuleKind: 'BehaviourPattern' as const,
  };
  const req = (status: ApprovalRequest['status'], version = 3) =>
    ({
      id: `A-${status}`,
      entityId: 'BP-NG',
      entityType: 'BehaviourPattern',
      entityVersion: version,
      status,
      requestedAt: NOW,
    }) as ApprovalRequest;

  it('derives Approved / Rejected / Superseded from the linked rule version’s request', () => {
    expect(effectiveModelStatus(base, [req('Pending')]).status).toBe('Proposed');
    expect(effectiveModelStatus(base, [req('Approved')]).status).toBe('Approved');
    expect(effectiveModelStatus(base, [req('Rejected')]).status).toBe('Rejected');
    expect(effectiveModelStatus(base, [req('Withdrawn')]).status).toBe('Superseded');
    expect(effectiveModelStatus(base, [req('Approved', 2)]).status).toBe('Proposed');
  });

  it('follows a fit carried into a later version of the rule instead of calling it superseded', () => {
    const run = { ...base, id: 'RUN-1' };
    const carrier = {
      id: 'BP-NG',
      kind: 'BehaviourPattern',
      version: 4,
      sourceModelRunIds: ['RUN-1'],
    } as unknown as RuleMeta;
    const dropped = { ...carrier, sourceModelRunIds: ['RUN-2'] } as unknown as RuleMeta;
    expect(effectiveModelStatus(run, [req('Withdrawn'), req('Pending', 4)], [carrier]).status).toBe('Proposed');
    expect(effectiveModelStatus(run, [req('Withdrawn'), req('Approved', 4)], [carrier]).status).toBe('Approved');
    expect(effectiveModelStatus(run, [req('Withdrawn'), req('Approved', 4)], [dropped]).status).toBe('Superseded');
  });

  it('keeps Draft and Retired as stored, and only lets drafts and failed proposals be proposed', () => {
    expect(effectiveModelStatus({ status: 'Draft' }, []).status).toBe('Draft');
    expect(effectiveModelStatus({ ...base, status: 'Retired' }, [req('Approved')]).status).toBe('Retired');
    expect(canPropose('Draft')).toBe(true);
    expect(canPropose('Rejected')).toBe(true);
    expect(canPropose('Proposed')).toBe(false);
    expect(canPropose('Approved')).toBe(false);
  });
});
