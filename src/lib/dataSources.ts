// Data sources (Phase 4): what each kind of source delivers, the fields a new source starts with, and
// the pure helpers the upload screens use to read a file against a source's fields - header matching,
// alias renaming, routing a dropped file to the right source, and reading the as-of date from the file.
// No storage and no React here.
import { normaliseDate } from './dates';
import { parseCsv } from './csvImport';
import { tableToCsv } from './fileImport';
import { POSITION_TEMPLATES } from './positionTemplates';
import { ACCOUNT_HISTORY_COLUMNS, BALANCE_HISTORY_COLUMNS } from './historyImport';
import { ALL_CONTRIBUTORS } from '@/engine/vintage';
import type {
  Affiliate,
  DataSource,
  DataSourceDomain,
  PositionContributor,
  SourceConnectorType,
  SourceField,
  SourceFieldType,
  SourceFrequency,
} from '@/engine/types';

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Plain-language name of what a source carries. */
export const SOURCE_DOMAIN_LABEL: Record<DataSourceDomain, string> = {
  Positions: 'Balance sheet positions',
  GeneralLedger: 'General ledger',
  Counterparties: 'Counterparties',
  FxRates: 'FX rates',
  MarketRates: 'Yield curves',
  EconomicIndicators: 'Economic indicators',
  BalanceHistory: 'Balance history',
  AccountHistory: 'Account history',
  MarketData: 'Market data (FX, curves, rates)',
};

/** What a source carries, in plain words - a position source names its contributor ("Loans positions"). */
export function sourceKindLabel(source: { domain: DataSourceDomain; contributor?: string | null }): string {
  return source.contributor ? `${source.contributor} positions` : SOURCE_DOMAIN_LABEL[source.domain];
}

export const ALL_SOURCE_DOMAINS: DataSourceDomain[] = [
  'Positions',
  'GeneralLedger',
  'Counterparties',
  'BalanceHistory',
  'AccountHistory',
  'FxRates',
  'MarketRates',
  'EconomicIndicators',
  'MarketData',
];

/** Market data is organisation-wide: always owned and loaded by GROUP, never by an affiliate. */
export const MARKET_DATA_DOMAINS: DataSourceDomain[] = ['FxRates', 'MarketRates', 'EconomicIndicators', 'MarketData'];

export const isMarketDataDomain = (d: DataSourceDomain) => MARKET_DATA_DOMAINS.includes(d);

export const CONNECTOR_TYPE_LABEL: Record<SourceConnectorType, string> = {
  ManualUpload: 'Upload',
  SFTP: 'SFTP',
  API: 'API',
  Database: 'Database',
};

export const SOURCE_FREQUENCIES: SourceFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'As needed'];

/** Which calculations read a source's data - shown on the source's overview so nobody has to guess. */
export const SOURCE_USED_BY: Record<DataSourceDomain, string[]> = {
  Positions: [
    'Liquidity (LCR, NSFR, gaps)',
    'Interest rate risk (NII, EVE)',
    'Transfer pricing & profitability',
    'Stress testing',
    'Reports',
  ],
  GeneralLedger: ['Ledger check of the position book (sign-off before runs)'],
  Counterparties: ['Concentration & large exposures', 'Deposit and funding concentration'],
  FxRates: ['Group consolidation', 'FX position', 'Every multi-currency calculation'],
  MarketRates: ['Interest rate risk (NII, EVE)', 'Transfer pricing', 'Discounting & valuation'],
  EconomicIndicators: ['Behavioural models (deposit pass-through)', 'Stress scenarios'],
  BalanceHistory: ['Behavioural models (deposit run-off, core balances)'],
  AccountHistory: ['Behavioural models (prepayment, rollover, early withdrawal)'],
  MarketData: [
    'Group consolidation and every multi-currency calculation',
    'Interest rate risk (NII, EVE)',
    'Transfer pricing',
    'Behavioural models and stress scenarios',
  ],
};

// ─── Default fields ─────────────────────────────────────────────────────────

/** Extra headers a bank file commonly uses for a canonical field. Matching already ignores case, spaces, _ - and . */
const COMMON_ALIASES: Record<string, string[]> = {
  id: ['position id', 'record id', 'deal id', 'contract id'],
  accountNumber: ['account no', 'acct no', 'acct number', 'account'],
  amount: ['balance', 'outstanding balance', 'outstanding', 'principal outstanding'],
  currency: ['ccy', 'currency code'],
  category: ['asset liability', 'side', 'bs category'],
  productClass: ['product', 'product name', 'product type'],
  glAccountCode: ['gl code', 'gl account', 'gl', 'ledger code'],
  orgUnitCode: ['branch unit', 'business unit', 'cost centre', 'cost center'],
  counterpartyId: ['customer id', 'cif', 'customer number', 'counterparty'],
  maturityDate: ['maturity', 'end date'],
  interestRatePct: ['interest rate', 'rate'],
  asOfDate: ['as at', 'as of', 'as at date', 'business date', 'report date', 'value date'],
  endingBalance: ['closing balance', 'balance', 'ending bal'],
  code: ['counterparty code', 'customer code', 'cif'],
  name: ['counterparty name', 'customer name'],
  base: ['base currency', 'from currency', 'from'],
  quote: ['quote currency', 'to currency', 'to'],
  rate: ['fx rate', 'mid rate', 'exchange rate'],
  curveCode: ['curve', 'curve name', 'index'],
  tenorDays: ['tenor', 'term days', 'days'],
  ratePercent: ['yield', 'rate pct', 'rate percent'],
  indicatorCode: ['indicator', 'series', 'series code'],
  countryCode: ['country'],
  value: ['observation', 'reading'],
  balance: ['closing balance', 'outstanding balance'],
  department: ['dept', 'contributor', 'business line'],
  dataType: ['type', 'data type', 'kind', 'sheet'],
};

function inferType(name: string): SourceFieldType {
  if (/date$/i.test(name)) return 'Date';
  if (/^(rolledOver|withdrawnEarly|irrbbRateSensitive)$/.test(name)) return 'YesNo';
  if (
    /(amount|balance|rate|pct|percent|bps|months|days|count|value|due|credit|debit)$/i.test(name) &&
    !/code$/i.test(name)
  ) {
    return 'Number';
  }
  return 'Text';
}

function field(name: string, required = false, key = false, type?: SourceFieldType): SourceField {
  return {
    name,
    type: type ?? inferType(name),
    required,
    ...(key ? { key: true } : {}),
    aliases: COMMON_ALIASES[name] ?? [],
  };
}

const uniq = (names: string[]) => Array.from(new Set(names));

/** The fields a new source of this kind starts with - the platform's own column names, derived from the templates and importers. */
export function defaultFieldsFor(domain: DataSourceDomain, contributor?: PositionContributor): SourceField[] {
  switch (domain) {
    case 'Positions': {
      const columns = contributor
        ? POSITION_TEMPLATES[contributor].columns
        : uniq(ALL_CONTRIBUTORS.flatMap((c) => POSITION_TEMPLATES[c].columns));
      return [
        ...uniq(columns).map((c) => field(c, ['id', 'category', 'amount'].includes(c), c === 'id')),
        field('asOfDate'),
        // Optional: which department a row came from (Loans, Deposits, Treasury) - informational only.
        ...(contributor ? [] : [field('department')]),
      ];
    }
    case 'GeneralLedger':
      return [
        field('glAccountCode', true, true),
        field('orgUnitCode', false, true),
        field('currency'),
        field('endingBalance', true),
        field('asOfDate'),
      ];
    case 'Counterparties':
      return [field('code', true, true), field('name', true), field('sector'), field('parentCode')];
    case 'FxRates':
      return [
        field('base', true, true),
        field('quote', true, true),
        field('rate', true),
        field('asOfDate', false, true),
      ];
    case 'MarketRates':
      return [
        field('currency', true, true),
        field('curveCode', false, true),
        field('asOfDate', false, true),
        field('tenorDays', true, true),
        field('ratePercent', true),
      ];
    case 'EconomicIndicators':
      return [
        field('indicatorCode', true, true),
        field('countryCode', false, true),
        field('asOfDate', true, true),
        field('value', true),
      ];
    case 'BalanceHistory': {
      const required = ['asOfDate', 'productCode', 'currency', 'balance'];
      const keys = ['asOfDate', 'productCode', 'customerType', 'currency', 'tenorBand'];
      return BALANCE_HISTORY_COLUMNS.map((c) => field(c, required.includes(c), keys.includes(c)));
    }
    case 'AccountHistory': {
      const required = ['accountNumber', 'asOfDate', 'productCode', 'currency', 'balance'];
      const keys = ['accountNumber', 'asOfDate'];
      return ACCOUNT_HISTORY_COLUMNS.map((c) => field(c, required.includes(c), keys.includes(c)));
    }
    case 'MarketData':
      // One file (or one workbook, a sheet per kind) carrying FX rates, curve points and policy/economic rates.
      // Each row is read by the columns it fills: base+quote+rate = FX, tenorDays+ratePercent = curve point,
      // indicatorCode+value = indicator. Nothing is required file-wide.
      return [
        field('dataType'),
        field('asOfDate'),
        field('base'),
        field('quote'),
        field('rate'),
        field('currency'),
        field('curveCode'),
        field('tenorDays'),
        field('ratePercent'),
        field('indicatorCode'),
        field('countryCode'),
        field('value'),
      ];
  }
}

/** The field a new source of this kind reads its as-of date from. */
export function defaultBusinessDateField(domain: DataSourceDomain): string | undefined {
  return domain === 'Counterparties' ? undefined : 'asOfDate';
}

// ─── Default sources ────────────────────────────────────────────────────────

/** Stable id for a default source - the database migration backfills with the same ids. */
export function defaultSourceId(affiliateCode: string, slug: string): string {
  return `DS-${affiliateCode}-${slug}`;
}

interface DefaultSpec {
  slug: string;
  name: string;
  domain: DataSourceDomain;
  contributor?: PositionContributor;
  frequency: SourceFrequency;
}

// Six standard sources per affiliate, created with the affiliate (Manual upload; switchable to SFTP/API/Database
// later): the three position contributors - Loans, Deposits and Treasury, each its own file and its own
// readiness line - the general ledger, and the two behavioural-model history files.
const AFFILIATE_DEFAULTS: DefaultSpec[] = [
  { slug: 'LOANS', name: 'Loans', domain: 'Positions', contributor: 'Loans', frequency: 'Monthly' },
  { slug: 'DEPOSITS', name: 'Deposits', domain: 'Positions', contributor: 'Deposits', frequency: 'Monthly' },
  { slug: 'TREASURY', name: 'Treasury', domain: 'Positions', contributor: 'Treasury', frequency: 'Monthly' },
  { slug: 'GL', name: 'General ledger', domain: 'GeneralLedger', frequency: 'Monthly' },
  { slug: 'BALHIST', name: 'Balance history', domain: 'BalanceHistory', frequency: 'Monthly' },
  { slug: 'ACCTHIST', name: 'Account history', domain: 'AccountHistory', frequency: 'Monthly' },
];

/** The standard source slugs every affiliate has - readiness and the smart drop zone key off these. */
export const STANDARD_AFFILIATE_SOURCE_SLUGS = AFFILIATE_DEFAULTS.map((d) => d.slug);

// One Group source: a single market-data file or workbook with FX rates, yield curves and policy rates.
const GROUP_DEFAULTS: DefaultSpec[] = [
  { slug: 'MARKET', name: 'Market data', domain: 'MarketData', frequency: 'Monthly' },
];

function fromSpec(affiliateCode: string, spec: DefaultSpec, by: string, at: string): DataSource {
  return {
    id: defaultSourceId(affiliateCode, spec.slug),
    affiliateCode,
    name: spec.name,
    domain: spec.domain,
    ...(spec.contributor ? { contributor: spec.contributor } : {}),
    connectorType: 'ManualUpload',
    connectorId: null,
    owner: spec.contributor
      ? `${spec.contributor} team`
      : affiliateCode === 'GROUP'
        ? 'Group Treasury'
        : spec.domain === 'GeneralLedger'
          ? 'Finance'
          : 'ALM team',
    frequency: spec.frequency,
    // The three contributor files share one column layout, so each contributor source accepts every position column.
    fields:
      spec.domain === 'Positions'
        ? defaultFieldsFor('Positions').filter((f) => f.name !== 'department')
        : defaultFieldsFor(spec.domain, spec.contributor),
    ...(defaultBusinessDateField(spec.domain) ? { businessDateField: defaultBusinessDateField(spec.domain) } : {}),
    autoAdmit: false,
    isActive: true,
    createdAt: at,
    createdBy: by,
  };
}

/** The six manual-upload sources every new affiliate starts with (Loans, Deposits, Treasury, GL, Balance history, Account history). */
export function defaultAffiliateSources(
  affiliate: Pick<Affiliate, 'code' | 'requiredContributors'>,
  by: string,
  at = new Date().toISOString(),
): DataSource[] {
  return AFFILIATE_DEFAULTS.map((spec) => fromSpec(affiliate.code, spec, by, at));
}

/** GROUP's one market-data source: FX rates, yield curves and policy/economic rates in one file. */
export function defaultGroupSources(by: string, at = new Date().toISOString()): DataSource[] {
  return GROUP_DEFAULTS.map((spec) => fromSpec('GROUP', spec, by, at));
}

// ─── Reading a file against a source ───────────────────────────────────────

/** Header comparison key: case, spaces and _ - . / are ignored. */
export const normHeader = (s: string) => s.toLowerCase().replace(/[\s_\-./]/g, '');

export interface HeaderMatch {
  /** Each source field and the file header that feeds it (null = not in the file). */
  fields: Array<{ field: string; header: string | null; required: boolean }>;
  missingRequired: string[];
  /** File headers no field asked for - ignored on load. */
  ignored: string[];
}

function fieldColumn(f: SourceField, headers: string[]): number {
  const names = [f.name, ...f.aliases].map(normHeader);
  // The field's own name wins over an alias, so "balance" in a file with both "amount" and "balance" maps sensibly.
  const exact = headers.findIndex((h) => normHeader(h) === normHeader(f.name));
  if (exact >= 0) return exact;
  return headers.findIndex((h) => names.includes(normHeader(h)));
}

export function matchHeaders(headers: string[], fields: SourceField[]): HeaderMatch {
  const used = new Set<number>();
  const out = fields.map((f) => {
    const col = fieldColumn(f, headers);
    const free = col >= 0 && !used.has(col) ? col : -1;
    if (free >= 0) used.add(free);
    return { field: f.name, header: free >= 0 ? headers[free]! : null, required: f.required };
  });
  return {
    fields: out,
    missingRequired: out.filter((m) => m.required && !m.header).map((m) => m.field),
    ignored: headers.filter((h, i) => h.trim() !== '' && !used.has(i)),
  };
}

/** The file's header row (first row of the CSV text). */
export function fileHeaders(csvText: string): string[] {
  const table = parseCsv(csvText);
  return (table[0] ?? []).map((h) => h.trim());
}

/**
 * Rewrites the header row so every column that matches a source field (by its name or an alias) carries the
 * field's own name - after which the platform's ordinary importers read the file unchanged.
 */
export function applySourceAliases(csvText: string, fields: SourceField[]): string {
  const table = parseCsv(csvText);
  if (table.length === 0) return csvText;
  const headers = table[0]!.map((h) => h.trim());
  const match = matchHeaders(headers, fields);
  const renamed = headers.map((h) => match.fields.find((m) => m.header === h)?.field ?? h);
  if (renamed.every((h, i) => h === headers[i])) return csvText;
  return tableToCsv([renamed, ...table.slice(1)]);
}

/** How well a file's headers fit a source: higher is better; a file missing a required field scores below any that has them all. */
export function routeScore(headers: string[], source: DataSource): number {
  const m = matchHeaders(headers, source.fields);
  const matchedRequired = m.fields.filter((f) => f.required && f.header).length;
  const matchedOptional = m.fields.filter((f) => !f.required && f.header).length;
  const share = source.fields.length > 0 ? (matchedRequired + matchedOptional) / source.fields.length : 0;
  return (
    (m.missingRequired.length === 0 ? 1000 : 0) +
    matchedRequired * 10 +
    matchedOptional * 2 +
    share * 5 -
    m.ignored.length * 0.5
  );
}

/** The best source for a file among `candidates`, or null when none has every required field. */
export function bestSourceFor(headers: string[], candidates: DataSource[]): DataSource | null {
  let best: DataSource | null = null;
  let bestScore = -Infinity;
  for (const s of candidates) {
    const score = routeScore(headers, s);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best && matchHeaders(headers, best.fields).missingRequired.length === 0 ? best : null;
}

/** What a file name says it is - "loans.csv", "gl_ledger.csv", "market_data_2026-07-31.xlsx" ... */
function nameHint(fileName: string): { domain: DataSourceDomain; contributor?: PositionContributor } | null {
  const n = fileName.toLowerCase();
  if (/balance[\s_-]*hist/.test(n)) return { domain: 'BalanceHistory' };
  if (/account[\s_-]*hist/.test(n)) return { domain: 'AccountHistory' };
  if (/market|fx[\s_-]*rate|yield|curve|policy[\s_-]*rate|indicator/.test(n)) return { domain: 'MarketData' };
  if (/(^|[^a-z])gl([^a-z]|$)|ledger|trial[\s_-]*balance/.test(n)) return { domain: 'GeneralLedger' };
  if (/loan|advance|lending/.test(n)) return { domain: 'Positions', contributor: 'Loans' };
  if (/deposit|casa|savings/.test(n)) return { domain: 'Positions', contributor: 'Deposits' };
  if (/treasury|t[\s_-]*bill|bond|invest|money[\s_-]*market/.test(n))
    return { domain: 'Positions', contributor: 'Treasury' };
  return null;
}

/**
 * The smart drop zone's router: the source a dropped file belongs to, from its name first (loans / deposits /
 * treasury go to their contributor, gl to the ledger, history files to the history sources, a market workbook
 * to Group market data), then from its headers. A file routed by name is routed even when some of its columns
 * do not match yet - the upload then asks the user to confirm those columns once, and remembers them.
 * `preferAffiliate` breaks ties when the user can see several affiliates' sources.
 */
export function routeFile(
  fileName: string,
  headers: string[],
  candidates: DataSource[],
  preferAffiliate?: string | null,
): DataSource | null {
  const active = candidates.filter((s) => s.isActive);
  const preferred =
    preferAffiliate && preferAffiliate !== 'GROUP'
      ? active.filter((s) => s.affiliateCode === preferAffiliate || s.affiliateCode === 'GROUP')
      : active;
  const pool = preferred.length > 0 ? preferred : active;
  const hint = nameHint(fileName);
  if (hint) {
    const named = pool.filter(
      (s) => s.domain === hint.domain && (!hint.contributor || s.contributor === hint.contributor),
    );
    if (named.length === 1) return named[0]!;
    if (named.length > 1) return bestSourceFor(headers, named) ?? named[0]!;
  }
  return bestSourceFor(headers, pool) ?? (pool !== active ? bestSourceFor(headers, active) : null);
}

function toIsoDate(v: string): string | null {
  return normaliseDate(v);
}

/**
 * The as-of date the file itself carries: the most common date in the source's business-date field (the
 * latest one, for a history or market-data series spanning many dates). Null when the file has no such column.
 */
export function businessDateInFile(csvText: string, source: DataSource): string | null {
  if (!source.businessDateField) return null;
  const table = parseCsv(applySourceAliases(csvText, source.fields));
  if (table.length < 2) return null;
  const col = table[0]!.findIndex((h) => normHeader(h) === normHeader(source.businessDateField!));
  if (col < 0) return null;
  const counts = new Map<string, number>();
  for (const row of table.slice(1)) {
    const d = toIsoDate(row[col] ?? '');
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const series = [
    'FxRates',
    'MarketRates',
    'EconomicIndicators',
    'BalanceHistory',
    'AccountHistory',
    'MarketData',
  ].includes(source.domain);
  if (series) return [...counts.keys()].sort().at(-1) ?? null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]![0];
}

/** Rows whose key fields repeat an earlier row's (1-based data-row numbers). */
export function duplicateKeyRows(csvText: string, source: DataSource): number[] {
  const keys = source.fields.filter((f) => f.key).map((f) => f.name);
  if (keys.length === 0) return [];
  const table = parseCsv(applySourceAliases(csvText, source.fields));
  if (table.length < 2) return [];
  const header = table[0]!.map(normHeader);
  const cols = keys.map((k) => header.indexOf(normHeader(k))).filter((c) => c >= 0);
  if (cols.length === 0) return [];
  const seen = new Set<string>();
  const dupes: number[] = [];
  table.slice(1).forEach((row, i) => {
    const k = cols.map((c) => (row[c] ?? '').trim()).join('\u0001');
    if (seen.has(k)) dupes.push(i + 1);
    else seen.add(k);
  });
  return dupes;
}

/**
 * Suggests aliases from a sample file: each file header that isn't already a field name or alias is offered
 * as an alias of the field whose name it most resembles. The user reviews before saving.
 */
export function suggestAliases(headers: string[], fields: SourceField[]): SourceField[] {
  const match = matchHeaders(headers, fields);
  const unmatchedHeaders = new Set(match.ignored);
  return fields.map((f) => {
    if (match.fields.find((m) => m.field === f.name)?.header) return f;
    const target = normHeader(f.name);
    const candidate = [...unmatchedHeaders].find((h) => {
      const n = normHeader(h);
      return n.length >= 3 && (n.includes(target) || target.includes(n));
    });
    if (!candidate) return f;
    unmatchedHeaders.delete(candidate);
    return { ...f, aliases: [...f.aliases, candidate] };
  });
}

/** A sample CSV (header row only) for a source - its field names in order. */
export function sourceTemplateCsv(source: DataSource): string {
  return tableToCsv([source.fields.map((f) => f.name)]);
}

// ─── Column mapping (plain-language field help + saving a confirmed mapping) ──

/** Plain words for each standard field: what it is and what it is used for. Unlisted fields fall back to the name. */
export const FIELD_HELP: Record<string, { label: string; usedFor: string }> = {
  id: { label: 'Position ID', usedFor: 'Identifies each row, so duplicates are caught.' },
  accountNumber: { label: 'Account number', usedFor: 'Links a position to the customer account.' },
  accountClass: { label: 'Account class', usedFor: 'Customer, interbank or internal - used for regulatory treatment.' },
  branchCode: { label: 'Branch', usedFor: 'Branch-level reporting.' },
  category: { label: 'Asset or liability', usedFor: 'Puts the row on the right side of the balance sheet.' },
  productClass: {
    label: 'Product',
    usedFor: 'Picks the product assumptions (liquidity, behaviour, transfer pricing).',
  },
  currency: { label: 'Currency', usedFor: 'Currency of the balance; converted to Group currency with FX rates.' },
  amount: { label: 'Balance', usedFor: 'The outstanding amount every calculation uses.' },
  legalEntityCode: { label: 'Legal entity', usedFor: 'Legal-entity reporting.' },
  orgUnitCode: { label: 'Business unit', usedFor: 'Profitability and transfer pricing by business unit.' },
  glAccountCode: { label: 'GL account', usedFor: 'Ties positions to the general ledger for the ledger check.' },
  commonCoaCode: { label: 'Common chart of accounts code', usedFor: 'Group-wide account grouping in reports.' },
  notes: { label: 'Notes', usedFor: 'Free text, kept for reference.' },
  counterpartyId: { label: 'Customer / counterparty', usedFor: 'Concentration and large-exposure checks.' },
  originationDate: { label: 'Start date', usedFor: 'Loan age; prepayment and transfer-pricing term.' },
  maturityDate: { label: 'Maturity date', usedFor: 'Places the cash flow in the right time bucket.' },
  nextRepricingDate: { label: 'Next repricing date', usedFor: 'Interest rate risk (when the rate next changes).' },
  rateType: { label: 'Fixed or floating', usedFor: 'Interest rate risk and repricing.' },
  interestRatePct: { label: 'Interest rate (%)', usedFor: 'Interest income/expense and profitability.' },
  rateIndexCode: { label: 'Rate index', usedFor: 'Which benchmark a floating rate follows.' },
  spreadOverIndexBps: { label: 'Spread over index (bps)', usedFor: 'Floating-rate margin.' },
  amortizationType: { label: 'Repayment type', usedFor: 'How principal is repaid over time (cash-flow schedule).' },
  paymentFrequencyMonths: { label: 'Payment frequency (months)', usedFor: 'Cash-flow schedule for amortising loans.' },
  performingStatus: { label: 'Performing status', usedFor: 'Non-performing loans are excluded from inflows.' },
  daysPastDue: { label: 'Days past due', usedFor: 'Credit quality and expected credit loss.' },
  provisionAmount: { label: 'Provision', usedFor: 'Net exposure and expected credit loss.' },
  lienAmount: { label: 'Lien / pledged amount', usedFor: 'Encumbered assets are excluded from liquid assets.' },
  lienReason: { label: 'Lien reason', usedFor: 'Kept for reference.' },
  behaviouralTag: { label: 'Behaviour tag', usedFor: 'Stable or volatile deposits.' },
  monthlyCredit: { label: 'Monthly credits', usedFor: 'Deposit behaviour (money in).' },
  monthlyDebit: { label: 'Monthly debits', usedFor: 'Deposit behaviour (money out).' },
  asOfDate: { label: 'As-of date', usedFor: 'The date the data describes; can also be chosen on upload.' },
  department: { label: 'Department', usedFor: 'Which team sent the row (Loans, Deposits, Treasury) - for reference.' },
  endingBalance: { label: 'Closing balance', usedFor: 'Compared with the positions total in the ledger check.' },
  code: { label: 'Code', usedFor: 'Identifies each row.' },
  name: { label: 'Name', usedFor: 'Shown on screens and reports.' },
  base: { label: 'From currency', usedFor: 'FX rate - currency converted from.' },
  quote: { label: 'To currency', usedFor: 'FX rate - currency converted to.' },
  rate: { label: 'FX rate', usedFor: 'Converts balances between currencies.' },
  curveCode: { label: 'Curve name', usedFor: 'Which yield curve a point belongs to.' },
  tenorDays: { label: 'Tenor (days)', usedFor: 'Point on the yield curve.' },
  ratePercent: { label: 'Yield (%)', usedFor: 'Discounting, transfer pricing and interest rate risk.' },
  indicatorCode: { label: 'Indicator', usedFor: 'Which policy or economic rate the value is for.' },
  countryCode: { label: 'Country', usedFor: 'Which country an indicator belongs to.' },
  value: { label: 'Value', usedFor: 'The indicator reading.' },
  dataType: { label: 'Data type / sheet', usedFor: 'Tells FX, curve and indicator rows apart.' },
  balance: { label: 'Balance', usedFor: 'Behavioural models.' },
  productCode: { label: 'Product code', usedFor: 'Product rules, behavioural models and profitability by product.' },
  hqlaLevel: { label: 'HQLA level', usedFor: 'Liquid-asset level for the LCR buffer (Level 1, 2A, 2B).' },
  hqlaHaircutPct: { label: 'HQLA haircut %', usedFor: 'Haircut applied to the liquid asset in the LCR.' },
  lcrCashflowRole: { label: 'LCR role', usedFor: 'Whether the position is an LCR inflow, outflow or liquid asset.' },
  irrbbRateSensitive: { label: 'Rate sensitive', usedFor: 'Included in interest-rate risk (NII and EVE).' },
  approxDurationYears: {
    label: 'Approx. duration (years)',
    usedFor: 'Rate risk where no cash-flow schedule is given.',
  },
};

/** "interestRatePct" -> "Interest rate pct" for fields without help text. */
export function fieldLabel(name: string): string {
  if (FIELD_HELP[name]) return FIELD_HELP[name]!.label;
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Applies a confirmed mapping (field name -> chosen file header, or null for "not in this file") to a source's
 * fields: each chosen header becomes an alias of its field (and stops being an alias of any other field), and a
 * header the user un-matched stops being an alias. The fields themselves never change.
 */
export function applyColumnMapping(
  fields: SourceField[],
  chosen: Record<string, string | null>,
  autoMatched: Record<string, string | null>,
): SourceField[] {
  const claimed = new Set(
    Object.values(chosen)
      .filter((h): h is string => !!h)
      .map(normHeader),
  );
  return fields.map((f) => {
    const pick = chosen[f.name];
    let aliases = f.aliases.filter((a) => !claimed.has(normHeader(a)) || (pick && normHeader(pick) === normHeader(a)));
    const auto = autoMatched[f.name];
    if (pick === null && auto && normHeader(auto) !== normHeader(f.name))
      aliases = aliases.filter((a) => normHeader(a) !== normHeader(auto));
    if (pick && normHeader(pick) !== normHeader(f.name) && !aliases.some((a) => normHeader(a) === normHeader(pick)))
      aliases = [...aliases, pick];
    return { ...f, aliases };
  });
}
