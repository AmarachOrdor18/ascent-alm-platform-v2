import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildDefaultsWorkbook, readDefaultsWorkbook } from './affiliateDefaultsWorkbook';

describe('affiliate defaults workbook', () => {
  it('round-trips: what is changed in Excel is read back', async () => {
    const buffer = buildDefaultsWorkbook(
      [
        {
          key: 'ftp.method',
          label: 'Transfer pricing method',
          organisationValue: 'Matched maturity',
          yourValue: '',
          canChange: true,
          options: ['Matched maturity', 'Duration'],
        },
      ],
      [
        {
          key: 'lcr',
          label: 'LCR',
          organisationAmber: 115,
          organisationRed: 105,
          amber: 115,
          red: 105,
          minimum: 100,
        },
      ],
    );
    // Simulate the user editing the file in Excel.
    const wb = XLSX.read(buffer, { type: 'array' });
    wb.Sheets['Defaults']!['D2'] = { t: 's', v: 'Duration' };
    wb.Sheets['Risk thresholds']!['E2'] = { t: 'n', v: 120 };
    const edited = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const read = await readDefaultsWorkbook(edited);
    expect(read.problems).toEqual([]);
    expect(read.settings['ftp.method']).toBe('Duration');
    expect(read.thresholds['lcr']).toEqual({ amber: 120, red: 105 });
  });
});
