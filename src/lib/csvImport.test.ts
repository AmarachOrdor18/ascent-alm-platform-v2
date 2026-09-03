/**
 * The demo files, loaded end to end through the real importer and engine.
 *
 * These read `demo_data/` off disk rather than using inline fixtures, so the
 * files a demo actually uses are the files under test. A file that drifts
 * from the schema fails here rather than in front of an audience.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { importPositions, importLedger, parseCsv } from './csvImport';
import { validatePositions } from '@/engine/validation';
import { identityFxTable } from '@/engine/fx';
import { computeLcr, computeLoanToDeposit, computeConcentration } from '@/engine/liquidity';
import { computeProfitability } from '@/engine/profitability';
import { computeDepositRunoff, classifyActivity } from '@/engine/behavioural';
import { computeRepricingGap } from '@/engine/irrbb';
import { computeLiquidityGap } from '@/engine/liquidity';
import { reconcile } from '@/engine/reconciliation';
import { defaultLadder } from '@/engine/buckets';
import { ALL_DIMENSION_MEMBERS } from '@/data/seed/reference';
import { unmappedCodes } from '@/engine/dimensions';
import { AFFILIATES } from '@/data/seed/reference';

const DEMO = join(process.cwd(), 'demo_data');
const AS_OF = '2026-07-31';
const fx = identityFxTable('GHS', AS_OF);
const ctx = { asOfDate: AS_OF, reportingCurrency: 'GHS', fx };

const importCtx = { affiliateCode: 'GH', asOfDate: AS_OF, batchId: 'B-GH-2026-07', defaultCurrency: 'GHS' };

function loadPositions(file: string) {
  return importPositions(readFileSync(join(DEMO, file), 'utf-8'), importCtx);
}

describe('CSV parsing', () => {
  it('handles quoted fields, embedded commas and escaped quotes', () => {
    const rows = parseCsv('a,b\n"Smith, John","He said ""hello"""\n');
    expect(rows[1]).toEqual(['Smith, John', 'He said "hello"']);
  });

  it('strips a BOM, which Excel writes and which corrupts the first column', () => {
    const rows = parseCsv('﻿id,amount\nX-1,100\n');
    expect(rows[0]![0]).toBe('id');
  });

  it('handles both line-ending conventions', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('ignores trailing blank lines rather than emitting an empty row', () => {
    expect(parseCsv('a,b\n1,2\n\n\n')).toHaveLength(2);
  });
});

describe('Ghana position book', () => {
  const result = loadPositions('ghana_position_book_2026-07.csv');

  it('imports every row without a parse error', () => {
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(20);
  });

  it('recognises every column in the file', () => {
    expect(result.ignoredColumns).toEqual([]);
  });

  it('balances: assets equal liabilities plus capital', () => {
    const total = (c: string) => result.rows.filter((p) => p.category === c).reduce((s, p) => s + p.amount, 0);
    expect(total('Asset')).toBeCloseTo(total('Liability') + total('Capital'), 6);
  });

  it('passes validation without a blocking exception', () => {
    const v = validatePositions(result.rows, {
      asOfDate: AS_OF,
      knownAffiliateCodes: AFFILIATES.map((a) => a.code),
    });
    expect(v.blocked, v.exceptions.map((e) => e.description).join('; ')).toBe(false);
  });

  it('resolves every dimensional code against the seeded hierarchy', () => {
    for (const dimension of ['OrgUnit', 'GlAccount', 'CommonCoa', 'Counterparty'] as const) {
      const missing = unmappedCodes(result.rows, dimension, ALL_DIMENSION_MEMBERS);
      expect(missing, `${dimension}: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it("carries Ghana's own letter-prefixed chart, not Nigeria's numeric one", () => {
    const codes = new Set(result.rows.map((p) => p.glAccountCode));
    expect([...codes].every((c) => /^GH-[ALE]-\d{3}$/.test(c))).toBe(true);
  });

  it('reaches the branch level, not just the segment', () => {
    const orgUnits = new Set(result.rows.map((p) => p.orgUnitCode));
    expect(orgUnits.has('OU-GH-RET-GREATER-ACCRA')).toBe(true);
    expect(orgUnits.has('OU-GH-COR-LARGE-CORPORATES')).toBe(true);
  });

  it('includes the investment-banking subsidiary as a separate legal entity', () => {
    const entities = new Set(result.rows.map((p) => p.legalEntityCode));
    expect(entities).toContain('LE-GH');
    expect(entities).toContain('LE-GH-IB');
  });

  it('embeds the GL code in the account number, as core systems do', () => {
    const row = result.rows.find((p) => p.glAccountCode === 'GH-A-100')!;
    expect(row.accountNumber.startsWith('GH-A-100')).toBe(true);
    expect(row.legacyAccountNumber).toMatch(/^GHS\d{7}$/);
  });
});

describe('what the Ghana book is built to demonstrate', () => {
  const { rows } = loadPositions('ghana_position_book_2026-07.csv');

  it('nets partial liens rather than excluding whole positions', () => {
    const lcr = computeLcr(rows, ctx);
    // GH-A04 fully pledged, GH-A03 half pledged: both are netted, and the
    // half-pledged holding still contributes.
    expect(lcr.excludedEncumbered).toBeGreaterThan(0);
    const pledged = rows.filter((p) => p.lienAmount > 0);
    expect(pledged.length).toBeGreaterThanOrEqual(2);
    expect(pledged.some((p) => p.lienAmount < p.amount)).toBe(true);
  });

  it('trips the depositor concentration warning', () => {
    const conc = computeConcentration(rows, ctx);
    expect(conc.largestSharePercent!).toBeGreaterThan(25);
    expect(conc.unattributedAmount).toBe(0);
  });

  it('produces a live NPL ratio, which the previous platform returned as null', () => {
    const p = computeProfitability(rows, { reportingCurrency: 'GHS', fx });
    expect(p.nplRatioPercent!).toBeGreaterThan(3);
    expect(p.nplCoverageRatioPercent!).toBeGreaterThan(0);
  });

  it('carries dormant balances the behavioural model can find', () => {
    const dormant = rows.filter((p) => classifyActivity(p) === 'Dormant');
    expect(dormant.length).toBeGreaterThan(0);

    // A dormant deposit is classified stickier than an equivalent active one.
    const runoff = computeDepositRunoff(rows);
    const dormantLine = runoff.lines.find((l) => l.activity === 'Dormant' && l.patternName !== null);
    const activeLine = runoff.lines.find(
      (l) => l.activity === 'Active' && l.behaviouralTag === dormantLine?.behaviouralTag,
    );
    if (dormantLine && activeLine) {
      expect(dormantLine.corePercent).toBeGreaterThan(activeLine.corePercent);
    }
  });

  it('demonstrates repricing separately from maturity, which Nigeria cannot', () => {
    const repricing = computeRepricingGap(rows, { ...ctx, tier1Capital: null }, defaultLadder('RepricingGap'));
    const liquidity = computeLiquidityGap(rows, ctx, defaultLadder('LiquidityGap'));

    // The quarterly-reset loans sit near the front on the repricing ladder
    // and years out on the liquidity one.
    const repricingNear = repricing.buckets
      .filter((b) => ['0-30D', '1-3M', '3-6M'].includes(b.bucket))
      .reduce((s, b) => s + b.assets, 0);
    const liquidityFar = liquidity.buckets
      .filter((b) => ['1-3Y', '3-5Y', '5Y+'].includes(b.bucket))
      .reduce((s, b) => s + b.assets, 0);

    expect(repricingNear).toBeGreaterThan(0);
    expect(liquidityFar).toBeGreaterThan(0);
  });

  it('classifies non-customer balances as internal', () => {
    // Cash, fixed assets, own debt and capital are the bank's own money, not
    // a customer's.
    const internal = rows.filter((p) => p.accountClass !== 'Customer');
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((p) => !/deposits|loans/i.test(p.productClass))).toBe(true);
  });

  it('excludes a suspense account carrying a deposit product from customer ratios', () => {
    // The dangerous case: a suspense account whose product *is* described as
    // customer deposits. Product-name matching alone would count it; the
    // account class is what keeps it out.
    const suspense = {
      ...rows.find((p) => p.category === 'Liability')!,
      id: 'GH-SUSPENSE-1',
      accountClass: 'Suspense' as const,
      productClass: 'Customer Deposits - unapplied credits suspense',
      amount: 4_000,
      counterpartyId: null,
    };

    const baseline = computeLoanToDeposit(rows, ctx);
    const withSuspense = computeLoanToDeposit([...rows, suspense], ctx);
    expect(withSuspense.deposits).toBeCloseTo(baseline.deposits, 6);
    expect(withSuspense.ratioPercent).toBeCloseTo(baseline.ratioPercent!, 6);

    // And the distortion it would have caused, had the class been ignored.
    const misclassified = computeLoanToDeposit([...rows, { ...suspense, accountClass: 'Customer' as const }], ctx);
    expect(misclassified.deposits).toBeGreaterThan(baseline.deposits);
    expect(misclassified.ratioPercent!).toBeLessThan(baseline.ratioPercent!);
  });

  it('keeps a suspense account out of depositor concentration too', () => {
    const suspense = {
      ...rows.find((p) => p.category === 'Liability')!,
      id: 'GH-SUSPENSE-2',
      accountClass: 'Suspense' as const,
      productClass: 'Customer Deposits - suspense',
      amount: 9_000,
      counterpartyId: null,
    };
    const baseline = computeConcentration(rows, ctx);
    const withSuspense = computeConcentration([...rows, suspense], ctx);
    expect(withSuspense.totalDeposits).toBeCloseTo(baseline.totalDeposits, 6);
    // Without the exclusion this would land in `unattributed` and dilute
    // every counterparty share.
    expect(withSuspense.unattributedAmount).toBe(0);
  });
});

describe('Ghana GL trial balance', () => {
  const positions = loadPositions('ghana_position_book_2026-07.csv').rows;
  const ledger = importLedger(readFileSync(join(DEMO, 'ghana_gl_trial_balance_2026-07.csv'), 'utf-8'), AS_OF, 'GHS');

  it('imports without error', () => {
    expect(ledger.errors).toEqual([]);
    expect(ledger.rows.length).toBeGreaterThan(5);
  });

  it('reconciles with one immaterial variance, yielding a plug to approve', () => {
    const result = reconcile(positions, ledger.rows, {
      reportingCurrency: 'GHS',
      fx,
      level: 'GlAccount',
      toleranceAmount: 1000,
      tolerancePercent: 5,
    });
    expect(result.suggestedPlugs).toHaveLength(1);
    expect(result.suggestedPlugs[0]!.glAccountCode).toBe('GH-A-400');
    // The ledger is 420 lighter than the loan book, so the instrument side
    // carries +420 of variance and the plug posted against it is -420 -
    // an adjustment to the instrument data to agree with the ledger, which
    // is the direction Oracle's reconciliation works in.
    expect(result.lines.find((l) => l.glAccountCode === 'GH-A-400')!.variance).toBeCloseTo(420, 6);
    expect(result.suggestedPlugs[0]!.amount).toBeCloseTo(-420, 6);
    expect(result.canSignOff).toBe(true);
  });

  it('blocks sign-off once the tolerance is tightened below the variance', () => {
    const result = reconcile(positions, ledger.rows, {
      reportingCurrency: 'GHS',
      fx,
      level: 'GlAccount',
      toleranceAmount: 100,
      tolerancePercent: 0.1,
    });
    expect(result.canSignOff).toBe(false);
  });
});

describe('the validation-failure file fails, deliberately and specifically', () => {
  const { rows } = loadPositions('ghana_validation_failures.csv');
  const v = validatePositions(rows, { asOfDate: AS_OF, knownAffiliateCodes: AFFILIATES.map((a) => a.code) });

  it('blocks the commit', () => {
    expect(v.blocked).toBe(true);
  });

  it('catches the duplicate identifier', () => {
    expect(v.exceptions.some((e) => e.checkType === 'Duplicate')).toBe(true);
  });

  it('catches an HQLA classification with no level', () => {
    expect(v.exceptions.some((e) => e.description.includes('no HQLA level'))).toBe(true);
  });

  it('catches a maturity date before the as-of date', () => {
    expect(v.exceptions.some((e) => e.description.includes('precedes the as-of date'))).toBe(true);
  });

  it('catches the unmapped org unit and GL account', () => {
    expect(unmappedCodes(rows, 'OrgUnit', ALL_DIMENSION_MEMBERS)).toContain('OU-GH-RET-KUMASI');
    expect(unmappedCodes(rows, 'GlAccount', ALL_DIMENSION_MEMBERS)).toContain('GH-Z-999');
  });
});

describe('importer robustness', () => {
  it('reports a missing required column instead of importing partial rows', () => {
    const result = importPositions('id,productClass\nX-1,Loans\n', importCtx);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]!.message).toContain('Required column(s) missing');
  });

  it('reports an unparseable number rather than coercing it to zero', () => {
    const result = importPositions('id,category,amount\nX-1,Asset,not-a-number\n', importCtx);
    expect(result.errors.some((e) => e.column === 'amount')).toBe(true);
  });

  it('normalises a negative liability to a magnitude, since the category carries the sign', () => {
    const result = importPositions('id,category,amount\nX-1,Liability,-5000\n', importCtx);
    expect(result.rows[0]!.amount).toBe(5000);
  });

  it('tolerates thousands separators, which Excel adds on export', () => {
    const result = importPositions('id,category,amount\nX-1,Asset,"1,234,567"\n', importCtx);
    expect(result.rows[0]!.amount).toBe(1_234_567);
  });

  it('reports an unknown enum value rather than silently defaulting', () => {
    const result = importPositions('id,category,amount,accountClass\nX-1,Asset,100,Nonsense\n', importCtx);
    expect(result.errors.some((e) => e.column === 'accountClass')).toBe(true);
  });

  it('lists columns it does not understand, so a mapping gap is visible', () => {
    const result = importPositions('id,category,amount,someBankSpecificField\nX-1,Asset,100,x\n', importCtx);
    expect(result.ignoredColumns).toEqual(['someBankSpecificField']);
  });
});
