import { beforeEach, describe, expect, it } from 'vitest';
import { AscentDb } from './db';
import { LocalRepository } from './localRepository';
import { toStoredAccountRows, toStoredBalanceRows } from '@/lib/modelRegistry';
import type { StoredModelRun } from './repository';
import type { BalanceObservation, AccountObservation } from '@/engine/behaviouralModels';

let repo: LocalRepository;
let counter = 0;

beforeEach(async () => {
  const db = new AscentDb(`model-history-test-${counter++}`);
  await db.open();
  repo = new LocalRepository(db);
});

const meta = (uploadId: string) => ({
  uploadId,
  fileName: `${uploadId}.csv`,
  uploadedBy: 'Tester',
  uploadedAt: `2026-10-0${uploadId.slice(-1)}T00:00:00Z`,
});

const bal = (affiliateCode: string, asOfDate: string, balance: number, productCode = 'SAV'): BalanceObservation => ({
  affiliateCode,
  asOfDate,
  productCode,
  currency: 'NGN',
  balance,
});

const acct = (affiliateCode: string, accountNumber: string, asOfDate: string): AccountObservation => ({
  affiliateCode,
  accountNumber,
  asOfDate,
  productCode: 'MORT',
  currency: 'NGN',
  balance: 100,
});

function run(id: string, affiliateCode: string, createdAt: string): StoredModelRun {
  return {
    id,
    modelType: 'RepricingBeta',
    segment: { segmentId: 'ALL', key: {}, currency: 'NGN' },
    window: { from: '2025-01', to: '2025-12', observations: 12 },
    params: { beta: 0.4 },
    fitStats: { rSquared: 0.8 },
    confidenceIntervals: {},
    backtest: null,
    outputs: {},
    methodology: 'OLS',
    createdAt,
    version: 1,
    status: 'Draft',
    affiliateCode,
    createdBy: 'Tester',
    calibrationOptions: {},
    historyUploadIds: [],
    chart: [],
    chartUnit: 'percent',
  };
}

describe('balance history storage', () => {
  it('stores rows with their upload metadata and lists them per affiliate', async () => {
    await repo.insertBalanceHistory(
      toStoredBalanceRows([bal('NG', '2025-01-31', 10), bal('NG', '2025-02-28', 11)], meta('U1')),
    );
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('GH', '2025-01-31', 5)], meta('U2')));
    const ng = await repo.listBalanceHistory('NG');
    expect(ng).toHaveLength(2);
    expect(ng.every((r) => r.uploadId === 'U1' && r.fileName === 'U1.csv' && r.uploadedBy === 'Tester')).toBe(true);
    expect(await repo.listBalanceHistory('GH')).toHaveLength(1);
  });

  it('replaces a row with the same natural key instead of double-counting it', async () => {
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('NG', '2025-01-31', 10)], meta('U1')));
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('NG', '2025-01-31', 12)], meta('U2')));
    const rows = await repo.listBalanceHistory('NG');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.balance).toBe(12);
    expect(rows[0]!.uploadId).toBe('U2');
  });

  it('deletes one upload, or everything for the affiliate', async () => {
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('NG', '2025-01-31', 10)], meta('U1')));
    await repo.insertBalanceHistory(
      toStoredBalanceRows([bal('NG', '2025-02-28', 10), bal('NG', '2025-03-31', 10)], meta('U2')),
    );
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('GH', '2025-02-28', 10)], meta('U3')));
    expect(await repo.deleteBalanceHistory('NG', 'U2')).toBe(2);
    expect((await repo.listBalanceHistory('NG')).map((r) => r.uploadId)).toEqual(['U1']);
    expect(await repo.deleteBalanceHistory('NG')).toBe(1);
    expect(await repo.listBalanceHistory('NG')).toHaveLength(0);
    expect(await repo.listBalanceHistory('GH')).toHaveLength(1);
  });
});

describe('account history storage', () => {
  it('keys by account and date, and deletes by upload', async () => {
    await repo.insertAccountHistory(
      toStoredAccountRows([acct('NG', 'A1', '2025-01-31'), acct('NG', 'A2', '2025-01-31')], meta('U1')),
    );
    await repo.insertAccountHistory(
      toStoredAccountRows([acct('NG', 'A1', '2025-01-31'), acct('NG', 'A1', '2025-02-28')], meta('U2')),
    );
    const rows = await repo.listAccountHistory('NG');
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.uploadId === 'U2')).toHaveLength(2);
    expect(await repo.deleteAccountHistory('NG', 'U1')).toBe(1);
    expect((await repo.listAccountHistory('NG')).map((r) => r.accountNumber).sort()).toEqual(['A1', 'A1']);
  });
});

describe('model register storage', () => {
  it('upserts, gets and lists newest first, optionally per affiliate', async () => {
    await repo.upsertModelRun(run('R1', 'NG', '2026-01-01T00:00:00Z'));
    await repo.upsertModelRun(run('R2', 'NG', '2026-02-01T00:00:00Z'));
    await repo.upsertModelRun(run('R3', 'GH', '2026-03-01T00:00:00Z'));
    expect((await repo.listModelRuns('NG')).map((r) => r.id)).toEqual(['R2', 'R1']);
    expect((await repo.listModelRuns()).map((r) => r.id)).toEqual(['R3', 'R2', 'R1']);
    await repo.upsertModelRun({
      ...run('R1', 'NG', '2026-01-01T00:00:00Z'),
      status: 'Proposed',
      proposedRuleId: 'X',
      proposedRuleVersion: 2,
    });
    const r1 = await repo.getModelRun('R1');
    expect(r1?.status).toBe('Proposed');
    expect(r1?.proposedRuleVersion).toBe(2);
    expect(await repo.getModelRun('missing')).toBeNull();
  });

  it('reset clears history and the register', async () => {
    await repo.insertBalanceHistory(toStoredBalanceRows([bal('NG', '2025-01-31', 10)], meta('U1')));
    await repo.upsertModelRun(run('R1', 'NG', '2026-01-01T00:00:00Z'));
    await repo.reset();
    expect(await repo.listBalanceHistory('NG')).toHaveLength(0);
    expect(await repo.listModelRuns()).toHaveLength(0);
  });
});
