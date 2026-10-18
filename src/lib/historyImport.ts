import type { IsoDate } from '@/engine/types';
import type { AccountObservation, BalanceObservation } from '@/engine/behaviouralModels';
import { parseCsv, type ImportResult, type RowError } from './csvImport';

/**
 * CSV import for behavioural-model history: aggregate balance history and
 * account-level snapshot history. Follows csvImport.ts conventions -
 * case-insensitive headers, BOM-tolerant parsing, thousands separators,
 * row-level errors with 1-based line numbers.
 *
 * Unlike the position importer, a row with any error is dropped rather than
 * defaulted: a fabricated zero balance or wrong date would silently bias a
 * fitted model, so every row that reaches the estimators is exactly as filed.
 */

export const BALANCE_HISTORY_COLUMNS = [
  'affiliateCode',
  'asOfDate',
  'productCode',
  'customerType',
  'currency',
  'tenorBand',
  'balance',
  'ratePercent',
  'accountCount',
] as const;

export const ACCOUNT_HISTORY_COLUMNS = [
  'affiliateCode',
  'accountNumber',
  'asOfDate',
  'productCode',
  'currency',
  'balance',
  'maturityDate',
  'scheduledBalance',
  'rolledOver',
  'withdrawnEarly',
] as const;

/** Header rows for downloadable templates. */
export const BALANCE_HISTORY_TEMPLATE = BALANCE_HISTORY_COLUMNS.join(',');
export const ACCOUNT_HISTORY_TEMPLATE = ACCOUNT_HISTORY_COLUMNS.join(',');

export interface HistoryImportContext {
  /** Used when the file has no affiliateCode column (or a blank cell). */
  defaultAffiliateCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Coercion - mirrors csvImport.ts, which keeps its helpers module-private
// ─────────────────────────────────────────────────────────────────────────

function text(value: string | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' || t === 'N/A' || t === '-' ? null : t;
}

function num(value: string | undefined, column: string, line: number, errors: RowError[]): number | null {
  const t = text(value);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    errors.push({ line, column, message: `"${t}" is not a number` });
    return null;
  }
  return n;
}

function date(value: string | undefined, column: string, line: number, errors: RowError[]): IsoDate | null {
  const t = text(value);
  if (t === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(Date.parse(`${t}T00:00:00Z`))) {
    errors.push({ line, column, message: `"${t}" is not an ISO date (YYYY-MM-DD)` });
    return null;
  }
  return t;
}

const TRUTHY = new Set(['yes', 'true', 'y', '1']);
const FALSY = new Set(['no', 'false', 'n', '0']);

function flag(value: string | undefined, column: string, line: number, errors: RowError[]): boolean | undefined {
  const t = text(value)?.toLowerCase();
  if (t === undefined) return undefined;
  if (TRUTHY.has(t)) return true;
  if (FALSY.has(t)) return false;
  errors.push({ line, column, message: `"${t}" is not a yes/no value` });
  return undefined;
}

interface Table {
  header: string[];
  index: Map<string, number>;
  rows: string[][];
}

function readTable<T>(
  csv: string,
  known: readonly string[],
  required: readonly string[],
): { table: Table; early: ImportResult<T> | null; ignoredColumns: string[] } {
  const parsed = parseCsv(csv);
  if (parsed.length === 0) {
    return {
      table: { header: [], index: new Map(), rows: [] },
      early: {
        rows: [],
        errors: [{ line: 1, column: '', message: 'File is empty' }],
        ignoredColumns: [],
        headerColumns: [],
      },
      ignoredColumns: [],
    };
  }
  const header = parsed[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  const knownLower = known.map((k) => k.toLowerCase());
  const ignoredColumns = header.filter((h) => !knownLower.includes(h.toLowerCase()));
  const missing = required.filter((c) => !index.has(c.toLowerCase()));
  const table = { header, index, rows: parsed.slice(1) };
  if (missing.length > 0) {
    return {
      table,
      early: {
        rows: [],
        errors: [{ line: 1, column: missing.join(', '), message: `Required column(s) missing: ${missing.join(', ')}` }],
        ignoredColumns,
        headerColumns: header,
      },
      ignoredColumns,
    };
  }
  return { table, early: null, ignoredColumns };
}

function getter(table: Table, cells: string[]) {
  return (name: string): string | undefined => {
    const i = table.index.get(name.toLowerCase());
    return i === undefined ? undefined : cells[i];
  };
}

/** Flags a blank required cell. A present-but-malformed value already carries its own error, so it is not reported twice. */
function requireValue<T>(value: T | null, column: string, line: number, errors: RowError[]): T | null {
  if (value === null && !errors.some((e) => e.line === line && e.column === column)) {
    errors.push({ line, column, message: `${column} is required` });
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────
// Balance history
// ─────────────────────────────────────────────────────────────────────────

/** Parse aggregate balance history - one row per segment per date. */
export function importBalanceHistory(csv: string, ctx: HistoryImportContext = {}): ImportResult<BalanceObservation> {
  const required = [
    'asOfDate',
    'productCode',
    'currency',
    'balance',
    ...(ctx.defaultAffiliateCode ? [] : ['affiliateCode']),
  ];
  const { table, early, ignoredColumns } = readTable<BalanceObservation>(csv, BALANCE_HISTORY_COLUMNS, required);
  if (early) return early;

  const errors: RowError[] = [];
  const rows: BalanceObservation[] = [];
  const seen = new Map<string, number>();

  table.rows.forEach((cells, r) => {
    const line = r + 2;
    const rowErrors: RowError[] = [];
    const get = getter(table, cells);

    const affiliateCode = requireValue(
      text(get('affiliateCode')) ?? ctx.defaultAffiliateCode ?? null,
      'affiliateCode',
      line,
      rowErrors,
    );
    const asOfDate = requireValue(date(get('asOfDate'), 'asOfDate', line, rowErrors), 'asOfDate', line, rowErrors);
    const productCode = requireValue(text(get('productCode')), 'productCode', line, rowErrors);
    const currency = requireValue(text(get('currency'))?.toUpperCase() ?? null, 'currency', line, rowErrors);
    const balance = requireValue(num(get('balance'), 'balance', line, rowErrors), 'balance', line, rowErrors);
    const ratePercent = num(get('ratePercent'), 'ratePercent', line, rowErrors);
    const accountCount = num(get('accountCount'), 'accountCount', line, rowErrors);
    if (accountCount !== null && (accountCount < 0 || !Number.isInteger(accountCount))) {
      rowErrors.push({ line, column: 'accountCount', message: 'accountCount must be a non-negative whole number' });
    }
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
      rowErrors.push({ line, column: 'currency', message: `"${currency}" is not a 3-letter currency code` });
    }

    const customerType = text(get('customerType'));
    const tenorBand = text(get('tenorBand'));
    if (rowErrors.length === 0) {
      const key = [affiliateCode, asOfDate, productCode, customerType, currency, tenorBand].join('|');
      const dup = seen.get(key);
      if (dup !== undefined) {
        rowErrors.push({ line, column: '', message: `Duplicate of line ${dup} - same segment and date` });
      } else seen.set(key, line);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      affiliateCode: affiliateCode!,
      asOfDate: asOfDate!,
      productCode: productCode!,
      currency: currency!,
      // Liabilities often export negative; the balance is a magnitude, as in importPositions.
      balance: Math.abs(balance!),
      ...(customerType !== null ? { customerType } : {}),
      ...(tenorBand !== null ? { tenorBand } : {}),
      ...(ratePercent !== null ? { ratePercent } : {}),
      ...(accountCount !== null ? { accountCount } : {}),
    });
  });

  return { rows, errors, ignoredColumns, headerColumns: table.header };
}

// ─────────────────────────────────────────────────────────────────────────
// Account history
// ─────────────────────────────────────────────────────────────────────────

/** Parse account-level snapshot history - one row per account per date. */
export function importAccountHistory(csv: string, ctx: HistoryImportContext = {}): ImportResult<AccountObservation> {
  const required = [
    'accountNumber',
    'asOfDate',
    'productCode',
    'currency',
    'balance',
    ...(ctx.defaultAffiliateCode ? [] : ['affiliateCode']),
  ];
  const { table, early, ignoredColumns } = readTable<AccountObservation>(csv, ACCOUNT_HISTORY_COLUMNS, required);
  if (early) return early;

  const errors: RowError[] = [];
  const rows: AccountObservation[] = [];
  const seen = new Map<string, number>();

  table.rows.forEach((cells, r) => {
    const line = r + 2;
    const rowErrors: RowError[] = [];
    const get = getter(table, cells);

    const affiliateCode = requireValue(
      text(get('affiliateCode')) ?? ctx.defaultAffiliateCode ?? null,
      'affiliateCode',
      line,
      rowErrors,
    );
    const accountNumber = requireValue(text(get('accountNumber')), 'accountNumber', line, rowErrors);
    const asOfDate = requireValue(date(get('asOfDate'), 'asOfDate', line, rowErrors), 'asOfDate', line, rowErrors);
    const productCode = requireValue(text(get('productCode')), 'productCode', line, rowErrors);
    const currency = requireValue(text(get('currency'))?.toUpperCase() ?? null, 'currency', line, rowErrors);
    const balance = requireValue(num(get('balance'), 'balance', line, rowErrors), 'balance', line, rowErrors);
    const maturityDate = date(get('maturityDate'), 'maturityDate', line, rowErrors);
    const scheduledBalance = num(get('scheduledBalance'), 'scheduledBalance', line, rowErrors);
    const rolledOver = flag(get('rolledOver'), 'rolledOver', line, rowErrors);
    const withdrawnEarly = flag(get('withdrawnEarly'), 'withdrawnEarly', line, rowErrors);
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
      rowErrors.push({ line, column: 'currency', message: `"${currency}" is not a 3-letter currency code` });
    }
    if (rolledOver === true && withdrawnEarly === true) {
      rowErrors.push({
        line,
        column: 'rolledOver, withdrawnEarly',
        message: 'An account cannot both roll over and be withdrawn early',
      });
    }

    if (rowErrors.length === 0) {
      const key = [affiliateCode, accountNumber, asOfDate].join('|');
      const dup = seen.get(key);
      if (dup !== undefined) {
        rowErrors.push({ line, column: '', message: `Duplicate of line ${dup} - same account and date` });
      } else seen.set(key, line);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      affiliateCode: affiliateCode!,
      accountNumber: accountNumber!,
      asOfDate: asOfDate!,
      productCode: productCode!,
      currency: currency!,
      balance: Math.abs(balance!),
      ...(maturityDate !== null ? { maturityDate } : {}),
      ...(scheduledBalance !== null ? { scheduledBalance: Math.abs(scheduledBalance) } : {}),
      ...(rolledOver !== undefined ? { rolledOver } : {}),
      ...(withdrawnEarly !== undefined ? { withdrawnEarly } : {}),
    });
  });

  return { rows, errors, ignoredColumns, headerColumns: table.header };
}
