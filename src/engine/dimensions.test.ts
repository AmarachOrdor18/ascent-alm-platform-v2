import { describe, it, expect } from 'vitest';
import { applyCodeMappings } from './dimensions';
import { importPositions } from '@/lib/csvImport';
import type { CodeMappingRule } from './ruleTypes';

function makeRule(dimension: CodeMappingRule['dimension'], mappings: CodeMappingRule['mappings']): CodeMappingRule {
  return {
    id: `CM-${dimension}`,
    kind: 'CodeMapping',
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
    dimension,
    sourceSystem: 'Flexcube',
    mappings,
  };
}

function positionsFrom(csv: string) {
  return importPositions(csv, { affiliateCode: 'GH', asOfDate: '2026-07-31', batchId: 'B-TEST' }).rows;
}

describe('applyCodeMappings', () => {
  it('translates a matched source code to the target code', () => {
    const positions = positionsFrom('id,category,amount,glaccountcode\nP-1,Asset,100,410203\n');
    const rule = makeRule('GlAccount', [{ sourceValue: '410203', targetCode: 'GL-LOANS' }]);
    const out = applyCodeMappings(positions, [rule]);
    expect(out[0]!.glAccountCode).toBe('GL-LOANS');
  });

  it('leaves a position with no matching entry unchanged', () => {
    const positions = positionsFrom('id,category,amount,glaccountcode\nP-1,Asset,100,999999\n');
    const rule = makeRule('GlAccount', [{ sourceValue: '410203', targetCode: 'GL-LOANS' }]);
    const out = applyCodeMappings(positions, [rule]);
    expect(out[0]!.glAccountCode).toBe('999999');
  });

  it('composes multiple rules across different dimensions', () => {
    const positions = positionsFrom('id,category,amount,glaccountcode,orgunitcode\nP-1,Asset,100,410203,BR-01\n');
    const rules = [
      makeRule('GlAccount', [{ sourceValue: '410203', targetCode: 'GL-LOANS' }]),
      makeRule('OrgUnit', [{ sourceValue: 'BR-01', targetCode: 'OU-GH-LAGOS' }]),
    ];
    const out = applyCodeMappings(positions, rules);
    expect(out[0]).toMatchObject({ glAccountCode: 'GL-LOANS', orgUnitCode: 'OU-GH-LAGOS' });
  });

  it('returns the same array reference when no rules are given', () => {
    const positions = positionsFrom('id,category,amount\nP-1,Asset,100\n');
    expect(applyCodeMappings(positions, [])).toBe(positions);
  });
});
