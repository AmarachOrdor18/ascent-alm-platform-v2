import * as XLSX from 'xlsx';

/**
 * Every upload input in the app should share this so CSV, Excel, JSON and XML
 * are all accepted consistently.
 */
export const UPLOAD_ACCEPT =
  '.csv,.json,.xml,.xlsx,.xls,text/csv,application/json,text/xml,application/xml,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

/**
 * Normalize an uploaded file of any supported format to CSV text, so every
 * importer in csvImport.ts (which only ever reads CSV) keeps working unchanged
 * regardless of what format the user actually uploaded.
 *
 * - .csv / .txt / anything unrecognized: passed through as-is.
 * - .json: a bare array of flat row-objects, or a `{ rows: [...] }` /
 *   `{ data: [...] }` wrapper around one. Column names are matched
 *   case-insensitively downstream, same as a CSV header.
 * - .xml: any root element containing any row elements, each holding any
 *   field elements - tag names are read as column names, `textContent` as
 *   the value. Nesting deeper than one row/field level is not supported.
 * - .xlsx / .xls: the first sheet, first row treated as the header - same
 *   layout as the CSV templates.
 */
export async function readUploadAsCsvText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'json') {
    return tableToCsv(jsonToTable(await file.text()));
  }
  if (ext === 'xml') {
    return tableToCsv(xmlToTable(await file.text()));
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return tableToCsv(excelToTable(await file.arrayBuffer()));
  }
  return file.text();
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Build a header (union of keys, first-seen order) + rows table from flat row-objects. */
function objectsToTable(objects: Array<Record<string, unknown>>): string[][] {
  const header: string[] = [];
  const seen = new Set<string>();
  for (const obj of objects) {
    for (const key of Object.keys(obj)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
      }
    }
  }
  const rows = objects.map((obj) => header.map((h) => stringifyCell(obj[h])));
  return [header, ...rows];
}

function jsonToTable(text: string): string[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This JSON file could not be parsed - check it is valid JSON.');
  }

  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object'
      ? ((parsed as Record<string, unknown>).rows ?? (parsed as Record<string, unknown>).data)
      : undefined;

  if (!Array.isArray(candidate)) {
    throw new Error('This JSON file must be an array of rows, or an object with a "rows" or "data" array.');
  }
  if (candidate.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Every row in the JSON file must be a flat object of field name to value.');
  }

  return objectsToTable(candidate as Array<Record<string, unknown>>);
}

/**
 * Every direct child element of the document root is one row; every child
 * element of a row is one column, keyed by tag name.
 */
function xmlToTable(text: string): string[][] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, 'application/xml');
  } catch {
    throw new Error('This XML file could not be parsed.');
  }
  if (doc.querySelector('parsererror')) {
    throw new Error('This XML file could not be parsed - check it is well-formed.');
  }

  const root = doc.documentElement;
  if (!root) {
    throw new Error('This XML file has no root element.');
  }

  const rowElements = Array.from(root.children);
  const objects = rowElements.map((rowEl) => {
    const obj: Record<string, unknown> = {};
    for (const field of Array.from(rowEl.children)) {
      obj[field.tagName] = field.textContent ?? '';
    }
    return obj;
  });

  return objectsToTable(objects);
}

function excelToTable(buffer: ArrayBuffer): string[][] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new Error('This Excel file could not be read.');
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new Error('This Excel file has no readable worksheet.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  return rows.map((row) => row.map(stringifyCell));
}

/** Mirrors parseCsv's own quoting convention, so the round trip is lossless. */
export function tableToCsv(table: string[][]): string {
  return table
    .map((row) =>
      row
        .map((cell) => {
          const needsQuoting = /[",\n\r]/.test(cell);
          const escaped = cell.replace(/"/g, '""');
          return needsQuoting ? `"${escaped}"` : escaped;
        })
        .join(','),
    )
    .join('\n');
}
