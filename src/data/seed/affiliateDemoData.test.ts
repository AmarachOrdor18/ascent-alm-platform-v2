/**
 * Every one of the 33 onboarding demo files, through the real importer.
 *
 * This is the test that would have caught the behaviouralTag defect before
 * a user did: the generator wrote "Stable" / "Less Stable" / "Volatile",
 * plain-English labels rather than the platform's own enum (`Core` /
 * `Non-Core` / `Operational` / `Non-Operational` / `N/A`), and the CSVs
 * looked fine to read. `importPositions` enforces the schema on upload —
 * "\"Stable\" is not one of: Core, Non-Core, Operational, Non-Operational,
 * N/A" is the exact message it produced. Reading every generated file
 * through that same importer here means a schema drift fails in CI, not in
 * front of an audience.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { importPositions, importLedger } from '@/lib/csvImport';

const ROOT = join(process.cwd(), 'demo_data', 'affiliates');
const AS_OF = '2026-07-31';

const folders = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/** The two-letter country code every file inside a folder is prefixed with. */
function codeFor(folder: string, files: string[]): string {
  const positionFile = files.find((f) => f.endsWith('_position_book_2026-07.csv'));
  if (!positionFile) throw new Error(`${folder}: no position book found`);
  return positionFile.split('_')[0]!;
}

describe('affiliate onboarding demo data (33 affiliates)', () => {
  it('discovered all 33 affiliate folders', () => {
    expect(folders).toHaveLength(33);
  });

  for (const folder of folders) {
    describe(folder, () => {
      const files = readdirSync(join(ROOT, folder));
      const code = codeFor(folder, files);

      it('position book imports with zero schema errors', () => {
        const text = readFileSync(join(ROOT, folder, `${code}_position_book_2026-07.csv`), 'utf-8');
        const result = importPositions(text, {
          affiliateCode: code,
          asOfDate: AS_OF,
          batchId: `B-${code}-TEST`,
          defaultCurrency: 'USD',
        });
        expect(result.errors).toEqual([]);
        expect(result.rows.length).toBeGreaterThanOrEqual(30);
      });

      it('position book balances — assets equal liabilities plus capital', () => {
        const text = readFileSync(join(ROOT, folder, `${code}_position_book_2026-07.csv`), 'utf-8');
        const { rows } = importPositions(text, {
          affiliateCode: code,
          asOfDate: AS_OF,
          batchId: `B-${code}-TEST`,
          defaultCurrency: 'USD',
        });
        const sum = (cat: string) => rows.filter((r) => r.category === cat).reduce((s, r) => s + r.amount, 0);
        const assets = sum('Asset');
        const diff = assets - sum('Liability') - sum('Capital');
        // Tolerance scales with book size — a few affiliates run into the
        // millions, where float accumulation alone can move the last cent.
        expect(Math.abs(diff)).toBeLessThan(Math.max(2, assets * 1e-9));
      });

      it('trial balance imports and its debits equal its credits', () => {
        const text = readFileSync(join(ROOT, folder, `${code}_gl_trial_balance_2026-07.csv`), 'utf-8');
        const parsed = importLedger(text, AS_OF, 'USD');
        expect(parsed.errors).toEqual([]);

        // drCr is additive metadata csvImport does not parse — it exists so
        // the file reads as a trial balance on its own, without changing
        // what reconciliation compares against. Read it directly here.
        const rows = text
          .trim()
          .split('\n')
          .slice(1)
          .map((line) => line.split(','));
        const header = text.trim().split('\n')[0]!.split(',');
        const balCol = header.indexOf('endingBalance');
        const sideCol = header.indexOf('drCr');
        expect(sideCol).toBeGreaterThanOrEqual(0);

        const dr = rows.filter((r) => r[sideCol] === 'Dr').reduce((s, r) => s + Number(r[balCol]), 0);
        const cr = rows.filter((r) => r[sideCol] === 'Cr').reduce((s, r) => s + Number(r[balCol]), 0);
        expect(Math.abs(dr - cr)).toBeLessThan(Math.max(2, dr * 1e-9));
      });
    });
  }
});
