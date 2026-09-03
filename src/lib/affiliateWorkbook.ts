import * as XLSX from 'xlsx';
import type { DataDomain, DomainFeed, FeedMode } from '@/engine/types';

export interface CoaMappingRow {
  commonCoaCode: string;
  localCode: string;
  localName: string;
}

export interface BulkAffiliateRow {
  rowNumber: number; // 1-based row in the Affiliate Profile sheet, for error messages
  code: string;
  name: string;
  country: string;
  region: string;
  regulator: string;
  legalEntityCode: string;
  functionalCurrency: string;
  reportingCurrency: string;
  fiscalYearEnd: string;
  holidayCalendarId: string | null;
  activeCurrencies: string[];
  feeds: DomainFeed[];
  coaMappings: CoaMappingRow[];
  createOrgTemplate: boolean;
  errors: string[];
}

const DOMAINS: DataDomain[] = ['Positions', 'GeneralLedger', 'MarketRates', 'FxRates', 'Counterparties', 'EconomicIndicators'];
const FEED_MODES: FeedMode[] = ['NotConfigured', 'Connector', 'File'];

const PROFILE_HEADERS = [
  'Affiliate Code*', 'Legal Name*', 'Country*', 'Region*', 'Regulator*',
  'Legal Entity Code', 'Functional Currency*', 'Reporting Currency*', 'Fiscal Year End (MM-DD)', 'Holiday Calendar ID',
];
const CURRENCY_HEADERS = ['Affiliate Code*', 'Other Active Currency*'];
const CONNECTIVITY_HEADERS = ['Affiliate Code*', 'Domain*', 'Mode* (NotConfigured/Connector/File)', 'Connector Name (if Mode=Connector)', 'SLA Days*', 'Owner'];
const COA_HEADERS = ['Affiliate Code*', 'Group COA Node Code*', 'Local GL Code*', 'Local GL Name'];
const ORG_HEADERS = ['Affiliate Code*', 'Create Standard Org Template? (Y/N)*'];

/** Reference data the template ships with, so a user can build their own row without opening the app to look anything up. */
export interface WorkbookReferenceData {
  regulators: string[];
  regions: string[];
  currencyCodes: string[];
  calendarIds: string[];
  commonCoaNodes: Array<{ code: string; name: string }>;
  connectorNames: string[];
}

export function generateAffiliateTemplate(ref: WorkbookReferenceData): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const profileExample = [
    'ZM', 'Ecobank Zambia Limited', 'Zambia', 'Southern Africa', 'Bank of Zambia',
    'LE-ZM', 'ZMW', 'USD', '12-31', '',
  ];
  const profileSheet = XLSX.utils.aoa_to_sheet([PROFILE_HEADERS, profileExample]);
  profileSheet['!cols'] = PROFILE_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, profileSheet, 'Affiliate Profile');

  const currencySheet = XLSX.utils.aoa_to_sheet([CURRENCY_HEADERS, ['ZM', 'USD']]);
  currencySheet['!cols'] = CURRENCY_HEADERS.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, currencySheet, 'Currencies');

  const connectivityRows = DOMAINS.map((d) => ['ZM', d, 'File', '', d === 'MarketRates' || d === 'FxRates' ? '1' : '30', '']);
  const connectivitySheet = XLSX.utils.aoa_to_sheet([CONNECTIVITY_HEADERS, ...connectivityRows]);
  connectivitySheet['!cols'] = CONNECTIVITY_HEADERS.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, connectivitySheet, 'Connectivity');

  const coaExample = ref.commonCoaNodes.slice(0, 3).map((n) => ['ZM', n.code, `ZM-${n.code.replace('COA-', '')}`, n.name]);
  const coaSheet = XLSX.utils.aoa_to_sheet([COA_HEADERS, ...coaExample]);
  coaSheet['!cols'] = COA_HEADERS.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, coaSheet, 'COA Mapping');

  const orgSheet = XLSX.utils.aoa_to_sheet([ORG_HEADERS, ['ZM', 'Y']]);
  orgSheet['!cols'] = ORG_HEADERS.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, orgSheet, 'Organisation');

  const instructionsRows: (string | number)[][] = [
    ['Ascent ALM - Bulk Affiliate Onboarding Template'],
    [],
    ['One row per affiliate on "Affiliate Profile". "Currencies", "Connectivity" and "COA Mapping" take one row per (Affiliate Code, value) pair - repeat the Affiliate Code on each of that affiliate\'s rows.'],
    ['Every affiliate is created in Onboarding status only. Chart-of-accounts mapping, connectivity, initial data load and approval are not bulk-created - complete them per affiliate after import, same as onboarding one affiliate at a time.'],
    ['Local GL structures genuinely differ by affiliate - Nigeria numeric, Ghana letter-prefixed, UEMOA SYSCOHADA. Map each affiliate\'s own local codes on the COA Mapping sheet; do not assume one scheme fits every row.'],
    [],
    ['Valid Regulators'], ...ref.regulators.map((r) => [r]),
    [],
    ['Valid Regions'], ...ref.regions.map((r) => [r]),
    [],
    ['Valid Currency Codes'], ...ref.currencyCodes.map((c) => [c]),
    [],
    ['Valid Holiday Calendar IDs (optional)'], ...ref.calendarIds.map((c) => [c]),
    [],
    ['Valid Domains (Connectivity sheet)'], ...DOMAINS.map((d) => [d]),
    [],
    ['Existing Connectors (Connectivity sheet, only if Mode = Connector)'], ...ref.connectorNames.map((c) => [c]),
    [],
    ['Group Common COA nodes (COA Mapping sheet)'], ...ref.commonCoaNodes.map((n) => [`${n.code} - ${n.name}`]),
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows);
  instructionsSheet['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions & Reference');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? '' : String(v).trim();
}

export interface ParseAffiliateWorkbookContext {
  existingCodes: Set<string>;
  validRegulators: Set<string>;
  validCurrencies: Set<string>;
  validCalendarIds: Set<string>;
  commonCoaCodes: Set<string>;
  activeConnectorNamesByDomain: Map<DataDomain, Set<string>>;
}

export function parseAffiliateWorkbook(buffer: ArrayBuffer, ctx: ParseAffiliateWorkbookContext): BulkAffiliateRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });

  const profileRows = sheetRows(wb, 'Affiliate Profile');
  const currencyRows = sheetRows(wb, 'Currencies');
  const connectivityRows = sheetRows(wb, 'Connectivity');
  const coaRows = sheetRows(wb, 'COA Mapping');
  const orgRows = sheetRows(wb, 'Organisation');

  const seenInWorkbook = new Set<string>();
  const rows: BulkAffiliateRow[] = [];

  profileRows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    const code = str(raw, 'Affiliate Code*').toUpperCase();
    const errors: string[] = [];

    if (!code) {
      // Skip a fully blank trailing row rather than reporting an error for nothing.
      if (!str(raw, 'Legal Name*') && !str(raw, 'Country*')) return;
      errors.push('Affiliate Code is required.');
    }
    const name = str(raw, 'Legal Name*');
    const country = str(raw, 'Country*');
    const region = str(raw, 'Region*');
    const regulator = str(raw, 'Regulator*');
    const functionalCurrency = str(raw, 'Functional Currency*');
    const reportingCurrency = str(raw, 'Reporting Currency*') || 'USD';
    const legalEntityCode = str(raw, 'Legal Entity Code') || (code ? `LE-${code}` : '');
    const fiscalYearEnd = str(raw, 'Fiscal Year End (MM-DD)') || '12-31';
    const holidayCalendarId = str(raw, 'Holiday Calendar ID') || null;

    if (!name) errors.push('Legal Name is required.');
    if (!country) errors.push('Country is required.');
    if (!region) errors.push('Region is required.');
    if (!regulator) errors.push('Regulator is required.');
    else if (!ctx.validRegulators.has(regulator)) errors.push(`Regulator "${regulator}" is not one of the valid regulators - see Instructions & Reference.`);
    if (!functionalCurrency) errors.push('Functional Currency is required.');
    else if (!ctx.validCurrencies.has(functionalCurrency)) errors.push(`Functional Currency "${functionalCurrency}" is not a known currency code.`);
    if (reportingCurrency && !ctx.validCurrencies.has(reportingCurrency)) errors.push(`Reporting Currency "${reportingCurrency}" is not a known currency code.`);
    if (holidayCalendarId && !ctx.validCalendarIds.has(holidayCalendarId)) errors.push(`Holiday Calendar ID "${holidayCalendarId}" was not found.`);

    if (code) {
      if (seenInWorkbook.has(code)) errors.push(`Affiliate Code "${code}" appears more than once in Affiliate Profile.`);
      seenInWorkbook.add(code);
      if (ctx.existingCodes.has(code)) errors.push(`Affiliate Code "${code}" already exists.`);
    }

    const activeCurrencies = currencyRows
      .filter((r) => str(r, 'Affiliate Code*').toUpperCase() === code)
      .map((r) => str(r, 'Other Active Currency*'))
      .filter(Boolean);
    for (const c of activeCurrencies) {
      if (!ctx.validCurrencies.has(c)) errors.push(`Currencies: "${c}" is not a known currency code.`);
    }

    const feeds: DomainFeed[] = DOMAINS.map((domain) => ({ domain, mode: 'NotConfigured', connectorId: null, slaDays: 30, owner: null }));
    connectivityRows
      .filter((r) => str(r, 'Affiliate Code*').toUpperCase() === code)
      .forEach((r) => {
        const domain = str(r, 'Domain*') as DataDomain;
        const mode = str(r, 'Mode* (NotConfigured/Connector/File)') as FeedMode;
        const connectorName = str(r, 'Connector Name (if Mode=Connector)');
        const slaDays = Number(str(r, 'SLA Days*') || '30');
        const owner = str(r, 'Owner') || null;

        if (!DOMAINS.includes(domain)) { errors.push(`Connectivity: "${domain}" is not a valid domain.`); return; }
        if (!FEED_MODES.includes(mode)) { errors.push(`Connectivity (${domain}): "${mode}" is not a valid mode.`); return; }
        if (mode === 'Connector') {
          const known = ctx.activeConnectorNamesByDomain.get(domain) ?? new Set();
          if (!connectorName) errors.push(`Connectivity (${domain}): Mode is Connector but no Connector Name was given.`);
          else if (!known.has(connectorName)) errors.push(`Connectivity (${domain}): connector "${connectorName}" was not found for that domain.`);
        }
        if (!Number.isFinite(slaDays) || slaDays <= 0) errors.push(`Connectivity (${domain}): SLA Days must be a positive number.`);

        const idx = feeds.findIndex((f) => f.domain === domain);
        if (idx >= 0) feeds[idx] = { domain, mode, connectorId: null, slaDays: Number.isFinite(slaDays) ? slaDays : 30, owner };
      });

    const coaMappings: CoaMappingRow[] = [];
    const coaSeen = new Set<string>();
    coaRows
      .filter((r) => str(r, 'Affiliate Code*').toUpperCase() === code)
      .forEach((r) => {
        const commonCoaCode = str(r, 'Group COA Node Code*');
        const localCode = str(r, 'Local GL Code*');
        const localName = str(r, 'Local GL Name') || localCode;
        if (!commonCoaCode || !localCode) { errors.push('COA Mapping: both Group COA Node Code and Local GL Code are required.'); return; }
        if (!ctx.commonCoaCodes.has(commonCoaCode)) { errors.push(`COA Mapping: "${commonCoaCode}" is not a Group COA node.`); return; }
        const key = `${commonCoaCode}:${localCode}`;
        if (coaSeen.has(key)) { errors.push(`COA Mapping: "${localCode}" mapped to "${commonCoaCode}" more than once.`); return; }
        coaSeen.add(key);
        coaMappings.push({ commonCoaCode, localCode, localName });
      });

    const orgRow = orgRows.find((r) => str(r, 'Affiliate Code*').toUpperCase() === code);
    const orgFlag = orgRow ? str(orgRow, 'Create Standard Org Template? (Y/N)*').toUpperCase() : '';
    if (orgRow && orgFlag !== 'Y' && orgFlag !== 'N') errors.push(`Organisation: "${orgFlag}" must be Y or N.`);
    const createOrgTemplate = orgFlag === 'Y';

    rows.push({
      rowNumber, code, name, country, region, regulator, legalEntityCode,
      functionalCurrency, reportingCurrency, fiscalYearEnd, holidayCalendarId,
      activeCurrencies, feeds, coaMappings, createOrgTemplate, errors,
    });
  });

  return rows;
}
