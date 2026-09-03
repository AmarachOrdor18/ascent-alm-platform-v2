import { describe, it, expect, beforeEach } from 'vitest';
import { AscentDb } from '@/store/db';
import { LocalRepository } from '@/store/localRepository';
import { executeRun, draftRun, ALL_ELEMENTS } from '@/engine/run';
import { buildFxTable } from '@/engine/fx';
import { defaultLadder } from '@/engine/buckets';
import { DEFAULT_PATTERNS } from '@/engine/behavioural';
import type { RunInputs } from '@/engine/run';
import type { Affiliate, LoadBatch, Position, PositionSnapshot } from '@/engine/types';

// Exercises the same data flow src/lib/snapshotHooks.ts drives from React
// (useCreateSnapshot → edit → useRecalculateSnapshot → useCommitSnapshot),
// but against the repository and engine directly - proving the underlying
// mechanism (not just that the hooks compile) without a browser: a
// committed batch's positions can be cloned into an editable snapshot,
// edited, recalculated against the real LCR/NSFR engine, and - once
// approved - committed as a new Position Book version that supersedes the
// original without altering it.

let db: AscentDb;
let repo: LocalRepository;
let dbCounter = 0;

beforeEach(async () => {
  db = new AscentDb(`ascent-snapshot-test-${dbCounter++}`);
  await db.open();
  repo = new LocalRepository(db);
});

function affiliate(overrides: Partial<Affiliate> = {}): Affiliate {
  return {
    code: 'NG',
    name: 'Ecobank Nigeria',
    country: 'NG',
    region: 'West Africa',
    regulator: 'CBN',
    functionalCurrency: 'NGN',
    reportingCurrency: 'USD',
    activeCurrencies: ['NGN'],
    status: 'Live',
    fiscalYearEnd: '12-31',
    holidayCalendarId: null,
    legalEntityCode: 'LE-NG',
    feeds: [],
    inheritGroupRules: true,
    internalThresholds: {},
    limitsConfirmed: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function batch(overrides: Partial<LoadBatch> = {}): LoadBatch {
  return {
    id: 'B-NG-2026-07-31-v1',
    affiliateCode: 'NG',
    domain: 'Positions',
    contributor: 'Treasury',
    asOfDate: '2026-07-31',
    version: 1,
    fileName: 'positions.csv',
    fileHash: 'hash-1',
    rowCount: 1,
    rowsAccepted: 1,
    rowsRejected: 0,
    status: 'Committed',
    supersedesBatchId: null,
    supersededReason: null,
    uploadedBy: 'tester',
    uploadedAt: '2026-07-31T09:00:00Z',
    committedBy: 'tester',
    committedAt: '2026-07-31T09:05:00Z',
    reconciledBy: null,
    reconciledAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectedReason: null,
    ...overrides,
  };
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'P-1',
    affiliateCode: 'NG',
    asOfDate: '2026-07-31',
    batchId: 'B-NG-2026-07-31-v1',
    accountNumber: '20220100001',
    legacyAccountNumber: null,
    accountClass: 'Customer',
    branchCode: 'HQ001',
    category: 'Asset',
    productCode: 'P-BOND',
    productClass: 'Government Bonds',
    currency: 'NGN',
    amount: 1_000_000_000,
    legalEntityCode: 'LE-NG',
    orgUnitCode: 'OU-TRY',
    glAccountCode: 'GL-1000',
    commonCoaCode: 'COA-BOND',
    counterpartyId: null,
    originationDate: null,
    maturityDate: '2027-01-01',
    nextRepricingDate: null,
    lastRepricingDate: null,
    amortizationType: 'Non-Amortising',
    paymentFrequencyMonths: null,
    repricingFrequencyMonths: null,
    accrualBasis: 'Actual/365',
    rateType: 'Fixed',
    interestRatePct: 12,
    rateIndexCode: null,
    spreadOverIndexBps: null,
    rateCapLifePct: null,
    rateFloorLifePct: null,
    behaviouralTag: 'N/A',
    hqlaLevel: 'Level 1',
    hqlaHaircutPct: 0,
    lcrCashflowRole: 'HQLA',
    lcrRatePct: null,
    asfFactorPct: 100,
    rsfFactorPct: 5,
    irrbbRateSensitive: true,
    approxDurationYears: 1,
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

async function runInputsFor(): Promise<RunInputs> {
  const positions = await repo.queryPositions({});
  const fxRates = await repo.listFxRates();
  return {
    positions,
    fx: buildFxTable('USD', fxRates, '2026-07-31'),
    liquidityLadder: defaultLadder('LiquidityGap'),
    repricingLadder: defaultLadder('RepricingGap'),
    behaviourPatterns: DEFAULT_PATTERNS,
    orgUnitMembers: [],
    productMembers: [],
    tier1Capital: 500_000_000,
  };
}

describe('editable snapshot data flow', () => {
  it('round-trips a snapshot through the repository, preserving the parent batch untouched', async () => {
    await repo.upsertAffiliate(affiliate());
    await repo.upsertBatch(batch());
    await repo.insertPositions([position()]);

    const snapshot: PositionSnapshot = {
      id: 'SNAP-1',
      name: 'Test snapshot',
      parentBatchId: 'B-NG-2026-07-31-v1',
      parentRunId: null,
      affiliateCode: 'NG',
      asOfDate: '2026-07-31',
      status: 'Draft',
      reason: 'Investigating a maturity date typo',
      positions: [position()],
      changes: [],
      createdBy: 'analyst',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      lastRecalculatedAt: null,
      committedBatchId: null,
    };
    await repo.upsertSnapshot(snapshot);

    const fetched = await repo.getSnapshot('SNAP-1');
    expect(fetched?.status).toBe('Draft');
    expect(fetched?.positions[0]?.amount).toBe(1_000_000_000);

    // Parent batch and its committed positions are unaffected by the snapshot's existence.
    const parentBatch = await repo.getBatch('B-NG-2026-07-31-v1');
    expect(parentBatch?.status).toBe('Committed');
    const parentPositions = await repo.queryPositions({ batchIds: ['B-NG-2026-07-31-v1'] });
    expect(parentPositions).toHaveLength(1);
    expect(parentPositions[0]?.amount).toBe(1_000_000_000);

    const list = await repo.listSnapshots('NG');
    expect(list.map((s) => s.id)).toContain('SNAP-1');
  });

  it('recalculating an edited snapshot against the real engine produces a different LCR than the original', async () => {
    await repo.upsertAffiliate(affiliate());
    await repo.upsertBatch(batch());
    const original = position();
    // A funding liability so net cash outflows - and therefore LCR - are non-zero and the HQLA edit has
    // something to move against; an HQLA-only book divides by zero and the assertion below would be moot.
    const deposit = position({
      id: 'P-2',
      category: 'Liability',
      productClass: 'Retail Deposits',
      hqlaLevel: 'None',
      hqlaHaircutPct: 0,
      lcrCashflowRole: 'Outflow',
      lcrRatePct: 10,
      asfFactorPct: 90,
      rsfFactorPct: null,
      amount: 800_000_000,
    });
    await repo.insertPositions([original, deposit]);

    // Edit: halve the HQLA position's amount - a real, governed field change, not a mock.
    const edited: Position = { ...original, amount: original.amount / 2 };

    const compareRun = draftRun({
      id: 'SNAP-1-COMPARE',
      name: 'Snapshot comparison',
      asOfDate: '2026-07-31',
      affiliateCode: 'NG',
      reportingCurrency: 'NGN',
      timeBucketRuleId: '',
      batchIds: ['B-NG-2026-07-31-v1'],
      createdBy: 'system',
      createdAt: '2026-08-01T00:00:00Z',
      elements: ALL_ELEMENTS,
    });

    const inputs = await runInputsFor();
    const now = '2026-08-01T00:00:00Z';

    const baseline = executeRun(compareRun, inputs, now);
    expect(baseline.run.status).toBe('Completed');

    const editedInputs = { ...inputs, positions: inputs.positions.map((p) => (p.id === edited.id ? edited : p)) };
    const editedOutcome = executeRun({ ...compareRun, id: 'SNAP-1-COMPARE-EDITED' }, editedInputs, now);
    expect(editedOutcome.run.status).toBe('Completed');

    const baselineLcr = baseline.results.find((r) => r.element === 'Lcr')?.payload as { lcrPercent: number | null };
    const editedLcr = editedOutcome.results.find((r) => r.element === 'Lcr')?.payload as { lcrPercent: number | null };

    expect(baselineLcr.lcrPercent).not.toBeNull();
    expect(editedLcr.lcrPercent).not.toBeNull();
    // Halving the only HQLA position materially lowers LCR - the comparison isn't a no-op.
    expect(editedLcr.lcrPercent!).toBeLessThan(baselineLcr.lcrPercent!);
  });

  it('committing an approved snapshot creates a new superseding batch and leaves the original batch preserved', async () => {
    await repo.upsertAffiliate(affiliate());
    const parent = batch();
    await repo.upsertBatch(parent);
    await repo.insertPositions([position()]);

    const editedPosition: Position = { ...position(), amount: 1_500_000_000, maturityDate: '2028-01-01' };
    const snapshot: PositionSnapshot = {
      id: 'SNAP-2',
      name: 'Correction snapshot',
      parentBatchId: parent.id,
      parentRunId: null,
      affiliateCode: 'NG',
      asOfDate: '2026-07-31',
      status: 'PendingApproval',
      reason: 'Restating after month-end true-up',
      positions: [editedPosition],
      changes: [
        { positionId: editedPosition.id, field: 'amount', oldValue: 1_000_000_000, newValue: 1_500_000_000, changedBy: 'analyst', changedAt: '2026-08-01T00:00:00Z' },
      ],
      createdBy: 'analyst',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      lastRecalculatedAt: '2026-08-01T00:05:00Z',
      committedBatchId: null,
    };
    await repo.upsertSnapshot(snapshot);

    // Mirrors useCommitSnapshot's mutationFn in src/lib/snapshotHooks.ts.
    const now = '2026-08-02T00:00:00Z';
    const newBatch: LoadBatch = {
      ...parent,
      id: `${parent.id}-ADJ-1`,
      version: parent.version + 1,
      fileName: `${snapshot.name} (adjustment)`,
      fileHash: `snapshot:${snapshot.id}`,
      rowCount: snapshot.positions.length,
      rowsAccepted: snapshot.positions.length,
      rowsRejected: 0,
      status: 'Committed',
      supersedesBatchId: parent.id,
      supersededReason: `Editable snapshot approved: ${snapshot.reason}`,
      uploadedBy: snapshot.createdBy,
      uploadedAt: snapshot.createdAt,
      committedBy: 'checker-user',
      committedAt: now,
      reconciledBy: null,
      reconciledAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectedReason: null,
    };
    // Mirrors the id-collision fix in useCommitSnapshot: positions are keyed by id alone, so a committed
    // snapshot position must get a new id, never the parent position's id, or it would overwrite that row.
    const adjustedPositions = snapshot.positions.map((p) => ({ ...p, id: `${p.id}-v${newBatch.version}`, batchId: newBatch.id }));

    await repo.upsertBatch({ ...parent, status: 'Superseded', supersededReason: newBatch.supersededReason });
    await repo.insertPositions(adjustedPositions);
    await repo.upsertBatch(newBatch);
    await repo.upsertSnapshot({ ...snapshot, status: 'Committed', committedBatchId: newBatch.id, updatedAt: now });

    // The original batch is preserved, marked Superseded, never deleted or mutated in place.
    const reloadedParent = await repo.getBatch(parent.id);
    expect(reloadedParent?.status).toBe('Superseded');
    const originalPositions = await repo.queryPositions({ batchIds: [parent.id] });
    expect(originalPositions).toHaveLength(1);
    expect(originalPositions[0]?.amount).toBe(1_000_000_000); // untouched

    // The new version is a distinct, committed batch carrying the edited values.
    const committedNewBatch = await repo.getBatch(newBatch.id);
    expect(committedNewBatch?.status).toBe('Committed');
    expect(committedNewBatch?.supersedesBatchId).toBe(parent.id);
    const newPositions = await repo.queryPositions({ batchIds: [newBatch.id] });
    expect(newPositions).toHaveLength(1);
    expect(newPositions[0]?.amount).toBe(1_500_000_000);
    expect(newPositions[0]?.maturityDate).toBe('2028-01-01');

    // Position Book at this affiliate/date now surfaces both rows - old (superseded, still queryable by
    // batch id for lineage) and new (current) - never a silent overwrite.
    const allForDate = await repo.queryPositions({ affiliateCode: 'NG', asOfDate: '2026-07-31' });
    expect(allForDate.map((p) => p.batchId).sort()).toEqual([newBatch.id, parent.id].sort());

    const committedSnapshot = await repo.getSnapshot('SNAP-2');
    expect(committedSnapshot?.status).toBe('Committed');
    expect(committedSnapshot?.committedBatchId).toBe(newBatch.id);
  });
});
