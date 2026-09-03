import type {
  AccountClass,
  AccrualBasis,
  AmortizationType,
  BehaviouralTag,
  DimensionMember,
  HqlaLevel,
  IndicatorObservation,
  IsoDate,
  LcrCashflowRole,
  PerformingStatus,
  Position,
  PositionCategory,
  RateType,
  RecordStatus,
} from '@/engine/types';
import type { LedgerBalance } from '@/engine/reconciliation';
import type { StoredFxRate } from '@/engine/types';

export interface RowError {
  /** 1-based line number in the file, counting the header. */
  line: number;
  column: string;
  message: string;
}

export interface ImportResult<T> {
  rows: T[];
  errors: RowError[];
  /** Columns present in the file that the importer does not use. */
  ignoredColumns: string[];
  headerColumns: string[];
}

/** Split CSV text into rows, handling quoted fields and both line-ending conventions. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel writes and which otherwise corrupts the
  // first column name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Trailing newlines produce a single empty field; drop those rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ─────────────────────────────────────────────────────────────────────────
// Field coercion
// ─────────────────────────────────────────────────────────────────────────

const TRUTHY = new Set(['yes', 'true', 'y', '1']);
const FALSY = new Set(['no', 'false', 'n', '0', '']);

function optionalText(value: string | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' || t === 'N/A' || t === '-' ? null : t;
}

function optionalNumber(value: string | undefined, column: string, line: number, errors: RowError[]): number | null {
  const t = (value ?? '').trim();
  if (t === '' || t === 'N/A' || t === '-') return null;
  // Tolerate thousands separators, which Excel adds on export.
  const n = Number(t.replace(/,/g, ''));
  if (Number.isNaN(n)) {
    errors.push({ line, column, message: `"${t}" is not a number` });
    return null;
  }
  return n;
}

function requiredNumber(value: string | undefined, column: string, line: number, errors: RowError[]): number {
  return optionalNumber(value, column, line, errors) ?? 0;
}

function boolean(value: string | undefined, column: string, line: number, errors: RowError[]): boolean {
  const t = (value ?? '').trim().toLowerCase();
  if (TRUTHY.has(t)) return true;
  if (FALSY.has(t)) return false;
  errors.push({ line, column, message: `"${t}" is not a yes/no value` });
  return false;
}

function isoDate(value: string | undefined, column: string, line: number, errors: RowError[]): IsoDate | null {
  const t = (value ?? '').trim();
  if (t === '' || t === 'N/A' || t === '-') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    errors.push({ line, column, message: `"${t}" is not an ISO date (YYYY-MM-DD)` });
    return null;
  }
  return t;
}

/** Coerce to one of a known set, reporting rather than silently defaulting. */
function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  column: string,
  line: number,
  errors: RowError[],
): T {
  const t = (value ?? '').trim();
  if (t === '') return fallback;
  const match = allowed.find((a) => a.toLowerCase() === t.toLowerCase());
  if (match) return match;
  errors.push({ line, column, message: `"${t}" is not one of: ${allowed.join(', ')}` });
  return fallback;
}

const CATEGORIES: PositionCategory[] = ['Asset', 'Liability', 'Capital'];
const ACCOUNT_CLASSES: AccountClass[] = ['Customer', 'Internal', 'Suspense', 'Nostro', 'Vostro'];
const BEHAVIOURAL: BehaviouralTag[] = ['Core', 'Non-Core', 'Operational', 'Non-Operational', 'N/A'];
const RATE_TYPES: RateType[] = ['Fixed', 'Floating', 'N/A'];
const HQLA_LEVELS: HqlaLevel[] = ['Level 1', 'Level 2A', 'Level 2B', 'None'];
const LCR_ROLES: LcrCashflowRole[] = ['HQLA', 'Inflow', 'Outflow', 'None'];
const PERFORMING: PerformingStatus[] = ['Performing', 'Special Mention', 'Substandard', 'Doubtful', 'Loss'];
const AMORTIZATION: AmortizationType[] = ['Conventional', 'Level Principal', 'Non-Amortising', 'Pattern'];
const ACCRUAL: AccrualBasis[] = ['30/360', 'Actual/360', 'Actual/Actual', '30/365', 'Actual/365', '30/Actual'];
const STATUSES: RecordStatus[] = ['ACTIVE', 'INACTIVE', 'PENDING', 'CLOSED', 'DORMANT'];

/** Every column the importer reads. Anything else is reported as ignored. */
export const KNOWN_COLUMNS = [
  'id',
  'accountnumber',
  'legacyaccountnumber',
  'accountclass',
  'branchcode',
  'category',
  'productcode',
  'productclass',
  'currency',
  'amount',
  'maturitydate',
  'nextrepricingdate',
  'originationdate',
  'lastrepricingdate',
  'behaviouraltag',
  'ratetype',
  'interestratepct',
  'rateindexcode',
  'spreadoverindexbps',
  'hqlalevel',
  'hqlahaircutpct',
  'lcrcashflowrole',
  'lcrratepct',
  'asffactorpct',
  'rsffactorpct',
  'irrbbratesensitive',
  'approxdurationyears',
  'legalentitycode',
  'orgunitcode',
  'glaccountcode',
  'commoncoacode',
  'counterpartyid',
  'performingstatus',
  'daysdue',
  'dayspastdue',
  'provisionamount',
  'lienamount',
  'lienreason',
  'amortizationtype',
  'paymentfrequencymonths',
  'repricingfrequencymonths',
  'accrualbasis',
  'monthlycredit',
  'monthlydebit',
  'dailycredit',
  'dailydebit',
  'totalcredit',
  'totaldebit',
  'maker',
  'checker',
  'recordstatus',
  'notes',
];

export interface PositionImportContext {
  affiliateCode: string;
  asOfDate: IsoDate;
  batchId: string;
  /** Defaults for columns a lighter file may omit. */
  defaultCurrency?: string;
  defaultLegalEntityCode?: string;
}

/** Parse a position book. */
export function importPositions(text: string, ctx: PositionImportContext): ImportResult<Position> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, column: '', message: 'File is empty' }],
      ignoredColumns: [],
      headerColumns: [],
    };
  }

  const header = table[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const ignoredColumns = header.filter((h) => !KNOWN_COLUMNS.includes(h.trim().toLowerCase()));

  const errors: RowError[] = [];
  const rows: Position[] = [];

  const missing = ['id', 'category', 'amount'].filter((c) => !index.has(c));
  if (missing.length > 0) {
    errors.push({ line: 1, column: missing.join(', '), message: `Required column(s) missing: ${missing.join(', ')}` });
    return { rows, errors, ignoredColumns, headerColumns: header };
  }

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r]!;
    const get = (name: string): string | undefined => {
      const i = index.get(name);
      return i === undefined ? undefined : cells[i];
    };

    const category = oneOf(get('category'), CATEGORIES, 'Asset', 'category', line, errors);
    const rawAmount = requiredNumber(get('amount'), 'amount', line, errors);
    const glAccountCode = optionalText(get('glaccountcode')) ?? '';
    const id = optionalText(get('id')) ?? `ROW-${line}`;

    const monthlyCredit = optionalNumber(get('monthlycredit'), 'monthlyCredit', line, errors);
    const monthlyDebit = optionalNumber(get('monthlydebit'), 'monthlyDebit', line, errors);
    const hasTurnover = monthlyCredit !== null || monthlyDebit !== null;

    rows.push({
      id,
      affiliateCode: ctx.affiliateCode,
      asOfDate: ctx.asOfDate,
      batchId: ctx.batchId,
      accountNumber: optionalText(get('accountnumber')) ?? `${glAccountCode}${String(r).padStart(5, '0')}`,
      legacyAccountNumber: optionalText(get('legacyaccountnumber')),
      accountClass: oneOf(get('accountclass'), ACCOUNT_CLASSES, 'Customer', 'accountClass', line, errors),
      branchCode: optionalText(get('branchcode')),
      category,
      productCode: optionalText(get('productcode')) ?? productCodeFrom(optionalText(get('productclass')) ?? ''),
      productClass: optionalText(get('productclass')) ?? 'Unclassified',
      currency: (optionalText(get('currency')) ?? ctx.defaultCurrency ?? 'USD').toUpperCase(),
      // Sign convention: liabilities often export negative; normalise to a magnitude since category carries the direction.
      amount: Math.abs(rawAmount),
      legalEntityCode: optionalText(get('legalentitycode')) ?? ctx.defaultLegalEntityCode ?? `LE-${ctx.affiliateCode}`,
      orgUnitCode: optionalText(get('orgunitcode')) ?? '',
      glAccountCode,
      commonCoaCode: optionalText(get('commoncoacode')) ?? '',
      counterpartyId: optionalText(get('counterpartyid')),
      originationDate: isoDate(get('originationdate'), 'originationDate', line, errors),
      maturityDate: isoDate(get('maturitydate'), 'maturityDate', line, errors),
      nextRepricingDate: isoDate(get('nextrepricingdate'), 'nextRepricingDate', line, errors),
      lastRepricingDate: isoDate(get('lastrepricingdate'), 'lastRepricingDate', line, errors),
      amortizationType: oneOf(
        get('amortizationtype'),
        AMORTIZATION,
        'Non-Amortising',
        'amortizationType',
        line,
        errors,
      ),
      paymentFrequencyMonths: optionalNumber(get('paymentfrequencymonths'), 'paymentFrequencyMonths', line, errors),
      repricingFrequencyMonths: optionalNumber(
        get('repricingfrequencymonths'),
        'repricingFrequencyMonths',
        line,
        errors,
      ),
      accrualBasis: oneOf(get('accrualbasis'), ACCRUAL, 'Actual/365', 'accrualBasis', line, errors),
      rateType: oneOf(get('ratetype'), RATE_TYPES, 'N/A', 'rateType', line, errors),
      interestRatePct: optionalNumber(get('interestratepct'), 'interestRatePct', line, errors),
      rateIndexCode: optionalText(get('rateindexcode')),
      spreadOverIndexBps: optionalNumber(get('spreadoverindexbps'), 'spreadOverIndexBps', line, errors),
      rateCapLifePct: null,
      rateFloorLifePct: null,
      behaviouralTag: oneOf(get('behaviouraltag'), BEHAVIOURAL, 'N/A', 'behaviouralTag', line, errors),
      hqlaLevel: oneOf(get('hqlalevel'), HQLA_LEVELS, 'None', 'hqlaLevel', line, errors),
      hqlaHaircutPct: optionalNumber(get('hqlahaircutpct'), 'hqlaHaircutPct', line, errors) ?? 0,
      lcrCashflowRole: oneOf(get('lcrcashflowrole'), LCR_ROLES, 'None', 'lcrCashflowRole', line, errors),
      lcrRatePct: optionalNumber(get('lcrratepct'), 'lcrRatePct', line, errors),
      asfFactorPct: optionalNumber(get('asffactorpct'), 'asfFactorPct', line, errors),
      rsfFactorPct: optionalNumber(get('rsffactorpct'), 'rsfFactorPct', line, errors),
      irrbbRateSensitive: boolean(get('irrbbratesensitive'), 'irrbbRateSensitive', line, errors),
      approxDurationYears: optionalNumber(get('approxdurationyears'), 'approxDurationYears', line, errors),
      performingStatus: oneOf(get('performingstatus'), PERFORMING, 'Performing', 'performingStatus', line, errors),
      daysPastDue: optionalNumber(get('dayspastdue'), 'daysPastDue', line, errors),
      provisionAmount: optionalNumber(get('provisionamount'), 'provisionAmount', line, errors),
      lienAmount: optionalNumber(get('lienamount'), 'lienAmount', line, errors) ?? 0,
      lienReason: optionalText(get('lienreason')),
      isOffBalanceSheet: false,
      obsType: null,
      notionalAmount: null,
      undrawnAmount: null,
      ccfPct: null,
      turnover: hasTurnover
        ? {
            dailyCredit: optionalNumber(get('dailycredit'), 'dailyCredit', line, errors) ?? 0,
            dailyDebit: optionalNumber(get('dailydebit'), 'dailyDebit', line, errors) ?? 0,
            monthlyCredit: monthlyCredit ?? 0,
            monthlyDebit: monthlyDebit ?? 0,
            totalCredit: optionalNumber(get('totalcredit'), 'totalCredit', line, errors) ?? 0,
            totalDebit: optionalNumber(get('totaldebit'), 'totalDebit', line, errors) ?? 0,
          }
        : null,
      overdraft: null,
      control: {
        maker: optionalText(get('maker')) ?? 'FILE-IMPORT',
        checker: optionalText(get('checker')),
        status: oneOf(get('recordstatus'), STATUSES, 'ACTIVE', 'recordStatus', line, errors),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      notes: optionalText(get('notes')),
    });
  }

  return { rows, errors, ignoredColumns, headerColumns: header };
}

/** Same derivation the seed generator uses, so codes agree across sources. */
function productCodeFrom(productClass: string): string {
  return (
    'P-' +
    Array.from(productClass.toUpperCase())
      .map((ch) => (/[A-Z0-9]/.test(ch) ? ch : '-'))
      .join('')
      .slice(0, 28)
      .replace(/^-+|-+$/g, '')
  );
}

/** Parse a bulk series of dated observations for one economic indicator - an alternative to adding them one at a time. */
export function importIndicatorObservations(text: string): ImportResult<IndicatorObservation> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, column: '', message: 'File is empty' }],
      ignoredColumns: [],
      headerColumns: [],
    };
  }

  const header = table[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const errors: RowError[] = [];
  const rows: IndicatorObservation[] = [];

  const dateColumn = index.has('asofdate') ? 'asofdate' : index.has('date') ? 'date' : null;
  if (!dateColumn || !index.has('value')) {
    errors.push({ line: 1, column: '', message: 'Required column(s) missing: asOfDate (or date), value' });
    return { rows, errors, ignoredColumns: [], headerColumns: header };
  }

  const used = new Set([dateColumn, 'value']);
  const ignoredColumns = header.filter((h) => !used.has(h.trim().toLowerCase()));

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r]!;
    const get = (name: string) => {
      const i = index.get(name);
      return i === undefined ? undefined : cells[i];
    };

    const asOfDate = isoDate(get(dateColumn), 'asOfDate', line, errors);
    const value = optionalNumber(get('value'), 'value', line, errors);
    if (asOfDate === null || value === null) continue;
    rows.push({ asOfDate, value });
  }

  // Re-observing the same date replaces it rather than duplicating - agencies revise history, and the
  // last row for a given date in the file wins, matching how a single manual re-entry already behaves.
  const byDate = new Map(rows.map((o) => [o.asOfDate, o]));

  return { rows: [...byDate.values()], errors, ignoredColumns, headerColumns: header };
}

/** Parse a general-ledger trial balance for reconciliation. */
export function importLedger(text: string, asOfDate: IsoDate, defaultCurrency = 'USD'): ImportResult<LedgerBalance> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, column: '', message: 'File is empty' }],
      ignoredColumns: [],
      headerColumns: [],
    };
  }

  const header = table[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const errors: RowError[] = [];
  const rows: LedgerBalance[] = [];

  if (!index.has('glaccountcode') || !index.has('endingbalance')) {
    errors.push({ line: 1, column: '', message: 'Required column(s) missing: glAccountCode, endingBalance' });
    return { rows, errors, ignoredColumns: [], headerColumns: header };
  }

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r]!;
    const get = (name: string) => {
      const i = index.get(name);
      return i === undefined ? undefined : cells[i];
    };

    rows.push({
      glAccountCode: optionalText(get('glaccountcode')) ?? '',
      orgUnitCode: optionalText(get('orgunitcode')),
      currency: (optionalText(get('currency')) ?? defaultCurrency).toUpperCase(),
      endingBalance: requiredNumber(get('endingbalance'), 'endingBalance', line, errors),
      asOfDate: isoDate(get('asofdate'), 'asOfDate', line, errors) ?? asOfDate,
    });
  }

  return { rows, errors, ignoredColumns: [], headerColumns: header };
}

const COUNTERPARTY_SECTORS = ['Corporate', 'Retail', 'Sovereign', 'Public Sector', 'Financial Institution'];
const COUNTERPARTY_COLUMNS = ['code', 'name', 'sector', 'parentcode'];

/** Parse a counterparty register file. Every entry is owned by the uploading affiliate - no Group-wide list. */
export function importCounterparties(text: string, affiliateCode: string): ImportResult<DimensionMember> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, column: '', message: 'File is empty' }],
      ignoredColumns: [],
      headerColumns: [],
    };
  }

  const header = table[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const ignoredColumns = header.filter((h) => !COUNTERPARTY_COLUMNS.includes(h.trim().toLowerCase()));
  const errors: RowError[] = [];
  const rows: DimensionMember[] = [];

  const missing = ['code', 'name'].filter((c) => !index.has(c));
  if (missing.length > 0) {
    errors.push({ line: 1, column: missing.join(', '), message: `Required column(s) missing: ${missing.join(', ')}` });
    return { rows, errors, ignoredColumns, headerColumns: header };
  }

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r]!;
    const get = (name: string): string | undefined => {
      const i = index.get(name);
      return i === undefined ? undefined : cells[i];
    };

    const code = optionalText(get('code'));
    const name = optionalText(get('name'));
    if (!code || !name) {
      errors.push({ line, column: 'code, name', message: 'code and name are both required' });
      continue;
    }

    rows.push({
      id: `Counterparty:${affiliateCode}:${code}`,
      dimension: 'Counterparty',
      affiliateCode,
      code,
      name,
      parentCode: optionalText(get('parentcode')) ?? 'CP-ROOT',
      isLeaf: true,
      attributes: { sector: oneOf(get('sector'), COUNTERPARTY_SECTORS, 'Corporate', 'sector', line, errors) },
    });
  }

  return { rows, errors, ignoredColumns, headerColumns: header };
}

const FX_RATE_COLUMNS = ['base', 'quote', 'rate', 'asofdate'];

/** Parse a bulk FX rate file - one row per currency pair, quoted against a base. */
export function importFxRates(text: string, defaultAsOfDate: IsoDate, updatedBy: string): ImportResult<StoredFxRate> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return {
      rows: [],
      errors: [{ line: 1, column: '', message: 'File is empty' }],
      ignoredColumns: [],
      headerColumns: [],
    };
  }

  const header = table[0]!.map((h) => h.trim());
  const index = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  const ignoredColumns = header.filter((h) => !FX_RATE_COLUMNS.includes(h.trim().toLowerCase()));
  const errors: RowError[] = [];
  const rows: StoredFxRate[] = [];

  const missing = ['base', 'quote', 'rate'].filter((c) => !index.has(c));
  if (missing.length > 0) {
    errors.push({ line: 1, column: missing.join(', '), message: `Required column(s) missing: ${missing.join(', ')}` });
    return { rows, errors, ignoredColumns, headerColumns: header };
  }

  for (let r = 1; r < table.length; r += 1) {
    const line = r + 1;
    const cells = table[r]!;
    const get = (name: string): string | undefined => {
      const i = index.get(name);
      return i === undefined ? undefined : cells[i];
    };

    const base = optionalText(get('base'))?.toUpperCase();
    const quote = optionalText(get('quote'))?.toUpperCase();
    const rate = requiredNumber(get('rate'), 'rate', line, errors);
    if (!base || !quote) {
      errors.push({ line, column: 'base, quote', message: 'base and quote are both required' });
      continue;
    }
    if (rate <= 0) {
      errors.push({ line, column: 'rate', message: 'rate must be a positive number' });
      continue;
    }

    const rowAsOfDate = isoDate(get('asofdate'), 'asOfDate', line, errors) ?? defaultAsOfDate;
    rows.push({
      // Dated, not just keyed by pair - a rate is a series like a yield curve or a Position batch, so a
      // new date adds a row alongside prior ones instead of silently overwriting that pair's history.
      id: `FX-${base}-${quote}-${rowAsOfDate}`,
      base,
      quote,
      rate,
      asOfDate: rowAsOfDate,
      source: 'File upload',
      updatedBy,
      updatedAt: new Date().toISOString(),
    });
  }

  return { rows, errors, ignoredColumns, headerColumns: header };
}
