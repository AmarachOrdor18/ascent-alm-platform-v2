import { describe, it, expect } from 'vitest';
import { applyFieldMapping } from './fieldMapping';
import { parseCsv, importPositions } from './csvImport';
import type { FieldMappingRule } from '@/engine/ruleTypes';

function makeRule(columns: FieldMappingRule['columns']): FieldMappingRule {
  return {
    id: 'FM-TEST',
    kind: 'FieldMapping',
    name: 'Test mapping',
    description: '',
    folder: 'Group Default',
    accessType: 'Read-Write',
    affiliateCode: null,
    version: 1,
    isActive: true,
    createdBy: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
    updatedAt: null,
    domain: 'Positions',
    sourceSystem: 'Flexcube',
    columns,
  };
}

describe('applyFieldMapping', () => {
  it('rewrites mapped headers and leaves unmapped ones untouched', () => {
    const rule = makeRule([{ sourceField: 'ACCT_NO', targetField: 'accountnumber', transform: 'Direct' }]);
    const out = parseCsv(applyFieldMapping('ACCT_NO,amount\nX-1,100\n', rule));
    expect(out[0]).toEqual(['accountnumber', 'amount']);
    expect(out[1]).toEqual(['X-1', '100']);
  });

  it('matches source column names case-insensitively', () => {
    const rule = makeRule([{ sourceField: 'acct_no', targetField: 'accountnumber', transform: 'Direct' }]);
    const out = parseCsv(applyFieldMapping('ACCT_NO\nX-1\n', rule));
    expect(out[0]).toEqual(['accountnumber']);
  });

  it('Number transform strips thousands separators and a currency prefix', () => {
    const rule = makeRule([{ sourceField: 'BAL', targetField: 'amount', transform: 'Number' }]);
    const out = parseCsv(applyFieldMapping('BAL\n"GHS 50,000,000"\n', rule));
    expect(out[1]).toEqual(['50000000']);
  });

  it('Percent transform strips a trailing %', () => {
    const rule = makeRule([{ sourceField: 'RATE', targetField: 'interestratepct', transform: 'Percent' }]);
    const out = parseCsv(applyFieldMapping('RATE\n15.5%\n', rule));
    expect(out[1]).toEqual(['15.5']);
  });

  it('Date transform normalizes day-first slash dates to ISO', () => {
    const rule = makeRule([{ sourceField: 'MAT_DT', targetField: 'maturitydate', transform: 'Date' }]);
    const out = parseCsv(applyFieldMapping('MAT_DT\n10/05/2030\n', rule));
    expect(out[1]).toEqual(['2030-05-10']);
  });

  it('Date transform normalizes DD-MMM-YYYY dates to ISO', () => {
    const rule = makeRule([{ sourceField: 'MAT_DT', targetField: 'maturitydate', transform: 'Date' }]);
    const out = parseCsv(applyFieldMapping('MAT_DT\n10-MAY-2030\n', rule));
    expect(out[1]).toEqual(['2030-05-10']);
  });

  it('Date transform leaves an already-ISO date and an unrecognized one untouched', () => {
    const rule = makeRule([{ sourceField: 'MAT_DT', targetField: 'maturitydate', transform: 'Date' }]);
    expect(parseCsv(applyFieldMapping('MAT_DT\n2030-05-10\n', rule))[1]).toEqual(['2030-05-10']);
    expect(parseCsv(applyFieldMapping('MAT_DT\nnot a date\n', rule))[1]).toEqual(['not a date']);
  });

  it('produces output importPositions can read as canonical', () => {
    const rule = makeRule([
      { sourceField: 'ACCT_NO', targetField: 'accountnumber', transform: 'Direct' },
      { sourceField: 'MAT_DT', targetField: 'maturitydate', transform: 'Date' },
      { sourceField: 'BAL', targetField: 'amount', transform: 'Number' },
    ]);
    const raw = 'id,category,ACCT_NO,MAT_DT,BAL\nP-1,Asset,ACCT-001,10/05/2030,"1,000,000"\n';
    const mapped = applyFieldMapping(raw, rule);
    const result = importPositions(mapped, { affiliateCode: 'GH', asOfDate: '2026-07-31', batchId: 'B-TEST' });
    expect(result.errors).toEqual([]);
    expect(result.ignoredColumns).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ accountNumber: 'ACCT-001', maturityDate: '2030-05-10', amount: 1000000 });
  });
});
