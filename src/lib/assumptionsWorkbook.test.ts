import { describe, expect, it } from 'vitest';
import { shippedConfiguration } from '@/data/seed/bootstrap';
import { assumptionSheets } from './assumptionsWorkbook';
import { parseGroupAssumptions } from './groupAssumptions';
import type { RuleMeta } from '@/engine/types';

const asText = (sheets: ReturnType<typeof assumptionSheets>) =>
  Object.fromEntries(Object.entries(sheets).map(([n, rows]) => [n, rows.map((r) => r.map((c) => String(c)))]));

describe('assumptions workbook', () => {
  const rules = shippedConfiguration().rules as unknown as RuleMeta[];
  const groupRules = rules.filter((r) => r.affiliateCode === null);

  it('reads back what it writes - an affiliate downloading the Group values and uploading them unchanged', () => {
    const parsed = parseGroupAssumptions(asText(assumptionSheets(groupRules)));
    for (const item of parsed.items) {
      const original = groupRules.find((r) => r.kind === item.kind) as unknown as Record<string, unknown>;
      for (const [field, value] of Object.entries(item.content)) {
        if (field === 'pools' && item.kind === 'FtpRule') continue;
        if (value === undefined || original[field] === undefined) continue;
        // Line ids are renumbered on read, and a fixed-rate add-on's dormant LCR-scaling settings are not in the
        // file; compare everything else.
        const SKIP = new Set(['id', 'lcrCapBps', 'lcrMultiplier', 'lcrThresholdPercent']);
        const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (SKIP.has(k) ? undefined : x)));
        expect({ kind: item.kind, field, value: strip(value) }).toEqual({
          kind: item.kind,
          field,
          value: strip(original[field]),
        });
      }
    }
    expect(parsed.warnings).toEqual([]);
  });
});
