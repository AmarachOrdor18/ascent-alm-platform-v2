import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readUploadAsCsvText } from './fileImport';
import { parseCsv } from './csvImport';

const CSV_EQUIVALENT = 'id,category,amount\nA1,Asset,100\nA2,Liability,200\n';
const EXPECTED_TABLE = parseCsv(CSV_EQUIVALENT);

// jsdom's built-in File/Blob don't implement text()/arrayBuffer() in this environment, so build a
// minimal duck-typed stand-in with just what readUploadAsCsvText actually calls.
function file(name: string, content: string | ArrayBuffer | Uint8Array): File {
  return {
    name,
    text: async () => (typeof content === 'string' ? content : new TextDecoder().decode(content)),
    arrayBuffer: async () =>
      typeof content === 'string'
        ? new TextEncoder().encode(content).buffer
        : content instanceof Uint8Array
          ? content.buffer
          : content,
  } as unknown as File;
}

describe('readUploadAsCsvText - CSV passthrough', () => {
  it('returns the file text unchanged for a .csv file', async () => {
    const text = await readUploadAsCsvText(file('rows.csv', CSV_EQUIVALENT));
    expect(text).toBe(CSV_EQUIVALENT);
  });

  it('treats an unrecognized extension as plain text too', async () => {
    const text = await readUploadAsCsvText(file('rows.txt', CSV_EQUIVALENT));
    expect(text).toBe(CSV_EQUIVALENT);
  });
});

describe('readUploadAsCsvText - JSON', () => {
  it('parses a bare array of row-objects into the same table as the CSV equivalent', async () => {
    const json = JSON.stringify([
      { id: 'A1', category: 'Asset', amount: '100' },
      { id: 'A2', category: 'Liability', amount: '200' },
    ]);
    const text = await readUploadAsCsvText(file('rows.json', json));
    expect(parseCsv(text)).toEqual(EXPECTED_TABLE);
  });

  it('accepts a { rows: [...] } wrapper', async () => {
    const json = JSON.stringify({ rows: [{ id: 'A1', category: 'Asset', amount: '100' }] });
    const text = await readUploadAsCsvText(file('rows.json', json));
    expect(parseCsv(text)).toEqual([
      ['id', 'category', 'amount'],
      ['A1', 'Asset', '100'],
    ]);
  });

  it('accepts a { data: [...] } wrapper', async () => {
    const json = JSON.stringify({ data: [{ id: 'A1', category: 'Asset', amount: '100' }] });
    const text = await readUploadAsCsvText(file('rows.json', json));
    expect(parseCsv(text)).toEqual([
      ['id', 'category', 'amount'],
      ['A1', 'Asset', '100'],
    ]);
  });

  it('throws a descriptive error for malformed JSON', async () => {
    await expect(readUploadAsCsvText(file('rows.json', '{not json'))).rejects.toThrow(/could not be parsed/i);
  });

  it('throws a descriptive error when the JSON is not an array of rows', async () => {
    await expect(readUploadAsCsvText(file('rows.json', '{"foo":"bar"}'))).rejects.toThrow(/array of rows/i);
  });
});

describe('readUploadAsCsvText - XML', () => {
  it('parses any root/row/field element structure into the same table as the CSV equivalent', async () => {
    const xml =
      '<?xml version="1.0"?>' +
      '<positions>' +
      '<position><id>A1</id><category>Asset</category><amount>100</amount></position>' +
      '<position><id>A2</id><category>Liability</category><amount>200</amount></position>' +
      '</positions>';
    const text = await readUploadAsCsvText(file('rows.xml', xml));
    expect(parseCsv(text)).toEqual(EXPECTED_TABLE);
  });

  it('throws a descriptive error for malformed XML', async () => {
    await expect(readUploadAsCsvText(file('rows.xml', '<unclosed>'))).rejects.toThrow(/could not be parsed/i);
  });
});

describe('readUploadAsCsvText - Excel', () => {
  it('parses the first sheet, first row as header, into the same table as the CSV equivalent', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['id', 'category', 'amount'],
      ['A1', 'Asset', 100],
      ['A2', 'Liability', 200],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const text = await readUploadAsCsvText(file('rows.xlsx', buffer));
    expect(parseCsv(text)).toEqual(EXPECTED_TABLE);
  });
});
