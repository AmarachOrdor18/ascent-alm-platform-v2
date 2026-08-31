import type { DimensionMember, DimensionType, GlLevel } from '@/engine/types';

/** The literal affiliate code for a genuinely cross-affiliate construct — a consolidation-tree root, a
 * connected-exposure group spanning countries. An ordinary, filterable affiliate value, not a bypass. */
const GROUP = 'GROUP';

function node(
  dimension: DimensionType,
  affiliateCode: string,
  code: string,
  name: string,
  parentCode: string | null,
  isLeaf: boolean,
  attributes?: DimensionMember['attributes'],
): DimensionMember {
  return {
    id: `${dimension}:${affiliateCode}:${code}`,
    dimension,
    affiliateCode,
    code,
    name,
    parentCode,
    isLeaf,
    ...(attributes ? { attributes } : {}),
  };
}

// Legal Entity — each affiliate owns its own entity, plus subsidiaries. LE-GROUP is the consolidation root,
// owned by the literal 'GROUP' affiliate; a country's entities reference it as `parentCode` without needing
// it in their own affiliate-scoped list — buildHierarchy() treats an out-of-scope parent as a root.

export const LEGAL_ENTITIES: DimensionMember[] = [
  node('LegalEntity', GROUP, 'LE-GROUP', 'Ecobank Transnational Incorporated', null, false, {
    incorporation: 'Togo',
    consolidationBasis: 'Full',
  }),

  node('LegalEntity', 'NG', 'LE-NG', 'Ecobank Nigeria Limited', 'LE-GROUP', false, {
    regulator: 'CBN',
    licence: 'Commercial Banking — International',
    consolidationBasis: 'Full',
  }),
  node('LegalEntity', 'NG', 'LE-NG-AM', 'EDC Asset Management Limited', 'LE-NG', true, {
    regulator: 'SEC Nigeria',
    licence: 'Fund Management',
    consolidationBasis: 'Full',
    note: 'Not a deposit-taker — outside the LCR perimeter',
  }),
  node('LegalEntity', 'NG', 'LE-NG-SEC', 'EDC Securities Limited', 'LE-NG', true, {
    regulator: 'SEC Nigeria',
    licence: 'Broker-Dealer',
    consolidationBasis: 'Full',
    note: 'Not a deposit-taker — outside the LCR perimeter',
  }),

  node('LegalEntity', 'GH', 'LE-GH', 'Ecobank Ghana PLC', 'LE-GROUP', false, {
    regulator: 'Bank of Ghana',
    licence: 'Universal Banking',
    consolidationBasis: 'Full',
    listing: 'Ghana Stock Exchange',
  }),
  node('LegalEntity', 'GH', 'LE-GH-IB', 'EDC Investment Banking (Ghana) Limited', 'LE-GH', true, {
    regulator: 'SEC Ghana',
    licence: 'Investment Banking',
    consolidationBasis: 'Full',
  }),

  node('LegalEntity', 'CI', 'LE-CI', "Ecobank Côte d'Ivoire SA", 'LE-GROUP', false, {
    regulator: 'BCEAO',
    licence: 'Banque Universelle (UEMOA)',
    consolidationBasis: 'Full',
    listing: 'BRVM',
  }),
  node('LegalEntity', 'CI', 'LE-CI-SGI', 'EDC Investment Corporation SGI', 'LE-CI', true, {
    regulator: 'CREPMF',
    licence: 'Société de Gestion et d’Intermédiation',
    consolidationBasis: 'Full',
  }),

  node('LegalEntity', 'KE', 'LE-KE', 'Ecobank Kenya Limited', 'LE-GROUP', true, {
    regulator: 'Central Bank of Kenya',
    licence: 'Commercial Banking',
    consolidationBasis: 'Full',
  }),
];

// Organisational Unit — Retail / Corporate / Treasury / Wealth, with branch/region beneath

const SEGMENTS: Array<{ suffix: string; name: string }> = [
  { suffix: 'RET', name: 'Retail Banking' },
  { suffix: 'COR', name: 'Corporate & Investment Banking' },
  { suffix: 'TSY', name: 'Treasury' },
  { suffix: 'WLT', name: 'Wealth Management' },
];

const REGIONS: Record<string, string[]> = {
  NG: ['Lagos', 'South-West', 'North Central', 'South-South', 'South-East'],
  GH: ['Greater Accra', 'Ashanti', 'Northern'],
  CI: ['Abidjan', 'Intérieur'],
};

const CORPORATE_DESKS = ['Large Corporates', 'Mid-Market', 'Public Sector'];

const AFFILIATE_LABEL: Record<string, string> = { NG: 'Nigeria', GH: 'Ghana', CI: "Côte d'Ivoire" };

export const ORG_UNITS: DimensionMember[] = [
  node('OrgUnit', GROUP, 'OU-GROUP', 'Ecobank Group', null, false),
  ...Object.keys(AFFILIATE_LABEL).flatMap((code) => {
    const label = AFFILIATE_LABEL[code]!;
    const units: DimensionMember[] = [node('OrgUnit', code, `OU-${code}`, label, 'OU-GROUP', false)];

    for (const segment of SEGMENTS) {
      const segmentCode = `OU-${code}-${segment.suffix}`;
      const hasChildren = segment.suffix === 'RET' || segment.suffix === 'COR';
      units.push(node('OrgUnit', code, segmentCode, `${label} — ${segment.name}`, `OU-${code}`, !hasChildren));

      if (segment.suffix === 'RET') {
        for (const region of REGIONS[code] ?? []) {
          units.push(
            node('OrgUnit', code, `${segmentCode}-${slug(region)}`, `${region} Region`, segmentCode, true, {
              segment: 'Retail Banking',
            }),
          );
        }
      }
      if (segment.suffix === 'COR') {
        for (const desk of CORPORATE_DESKS) {
          units.push(
            node('OrgUnit', code, `${segmentCode}-${slug(desk)}`, desk, segmentCode, true, {
              segment: 'Corporate & Investment Banking',
            }),
          );
        }
      }
    }
    return units;
  }),
];

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Common Chart of Accounts — every affiliate that reconciles to it owns its own copy of the same standard
// (no Group-wide list). The three affiliates below share identical content today because it genuinely is one
// standard; a country that needs to diverge just edits its own copy without touching anyone else's.

function commonCoaFor(affiliateCode: string): DimensionMember[] {
  const c = (code: string, name: string, parentCode: string | null, isLeaf: boolean) =>
    node('CommonCoa', affiliateCode, code, name, parentCode, isLeaf);
  return [
    c('COA-ROOT', 'Ecobank Group Chart of Accounts', null, false),

    c('COA-1', 'Assets', 'COA-ROOT', false),
    c('COA-11', 'Cash & Balances with Central Banks', 'COA-1', true),
    c('COA-12', 'Due from Banks', 'COA-1', true),
    c('COA-13', 'Investment Securities', 'COA-1', true),
    c('COA-14', 'Loans & Advances to Customers', 'COA-1', true),
    c('COA-15', 'Property, Equipment & Other Assets', 'COA-1', true),

    c('COA-2', 'Liabilities', 'COA-ROOT', false),
    c('COA-21', 'Due to Banks', 'COA-2', true),
    c('COA-22', 'Customer Deposits', 'COA-2', true),
    c('COA-23', 'Debt Securities Issued', 'COA-2', true),
    c('COA-24', 'Other Liabilities & Provisions', 'COA-2', true),

    c('COA-3', 'Capital & Reserves', 'COA-ROOT', false),
    c('COA-31', 'Share Capital', 'COA-3', true),
    c('COA-32', 'Reserves & Retained Earnings', 'COA-3', true),
  ];
}

export const COMMON_COA: DimensionMember[] = ['NG', 'GH', 'CI'].flatMap(commonCoaFor);

// General Ledger Account — the affiliate's local chart (two-digit category /
// four-digit group / six-digit account). Category codes: 10 Fixed assets,
// 20 Current assets, 30 Equity, 40 Liabilities, 50 Income, 60 Expenses.

export interface LocalGlAccount {
  code: string;
  name: string;
  commonCoa: string;
  level: GlLevel;
  parent: string;
}

/** Nigeria — three-level numeric, the structure a core system emits. */
const NG_GL: LocalGlAccount[] = [
  { code: '10', name: 'Fixed Assets', commonCoa: 'COA-15', level: 'Category', parent: 'GL-NG' },
  { code: '1001', name: 'Property & Equipment', commonCoa: 'COA-15', level: 'Level1', parent: '10' },
  { code: '100101', name: 'FIXED AND OTHER ASSETS', commonCoa: 'COA-15', level: 'Level2', parent: '1001' },

  { code: '20', name: 'Current Assets', commonCoa: 'COA-1', level: 'Category', parent: 'GL-NG' },
  { code: '2001', name: 'Cash and Balances', commonCoa: 'COA-11', level: 'Level1', parent: '20' },
  { code: '200101', name: 'CASH AND CBN BALANCES', commonCoa: 'COA-11', level: 'Level2', parent: '2001' },
  { code: '2002', name: 'Due from Banks', commonCoa: 'COA-12', level: 'Level1', parent: '20' },
  { code: '200201', name: 'INTERBANK PLACEMENTS', commonCoa: 'COA-12', level: 'Level2', parent: '2002' },
  { code: '2003', name: 'Investment Securities', commonCoa: 'COA-13', level: 'Level1', parent: '20' },
  { code: '200301', name: 'FGN TREASURY BILLS', commonCoa: 'COA-13', level: 'Level2', parent: '2003' },
  { code: '200302', name: 'FGN AND STATE BONDS', commonCoa: 'COA-13', level: 'Level2', parent: '2003' },
  { code: '2009', name: 'Other Assets', commonCoa: 'COA-15', level: 'Level1', parent: '20' },
  { code: '200901', name: 'SUNDRY DEBTORS AND SUSPENSE', commonCoa: 'COA-15', level: 'Level2', parent: '2009' },
  { code: '2022', name: 'Corporate Lending', commonCoa: 'COA-14', level: 'Level1', parent: '20' },
  { code: '202201', name: 'LOANS - CORPORATE', commonCoa: 'COA-14', level: 'Level2', parent: '2022' },
  { code: '2026', name: 'Retail Lending', commonCoa: 'COA-14', level: 'Level1', parent: '20' },
  { code: '202601', name: 'LOANS - INDIVIDUAL', commonCoa: 'COA-14', level: 'Level2', parent: '2026' },
  { code: '202602', name: 'LOANS - MORTGAGE', commonCoa: 'COA-14', level: 'Level2', parent: '2026' },

  { code: '30', name: 'Equity', commonCoa: 'COA-3', level: 'Category', parent: 'GL-NG' },
  { code: '3001', name: 'Share Capital and Reserves', commonCoa: 'COA-31', level: 'Level1', parent: '30' },
  { code: '300101', name: 'SHARE CAPITAL', commonCoa: 'COA-31', level: 'Level2', parent: '3001' },

  { code: '40', name: 'Liabilities', commonCoa: 'COA-2', level: 'Category', parent: 'GL-NG' },
  { code: '4001', name: 'Customer Demand Deposits', commonCoa: 'COA-22', level: 'Level1', parent: '40' },
  { code: '400102', name: 'CURRENT AND SAVINGS', commonCoa: 'COA-22', level: 'Level2', parent: '4001' },
  { code: '400103', name: 'CORPORATE DEPOSITS', commonCoa: 'COA-22', level: 'Level2', parent: '4001' },
  { code: '4002', name: 'Customer Term Deposits', commonCoa: 'COA-22', level: 'Level1', parent: '40' },
  { code: '400201', name: 'FIXED DEPOSITS', commonCoa: 'COA-22', level: 'Level2', parent: '4002' },
  { code: '4003', name: 'Due to Banks', commonCoa: 'COA-21', level: 'Level1', parent: '40' },
  { code: '400301', name: 'INTERBANK TAKINGS', commonCoa: 'COA-21', level: 'Level2', parent: '4003' },
  { code: '4004', name: 'Debt Issued', commonCoa: 'COA-23', level: 'Level1', parent: '40' },
  { code: '400401', name: 'EUROBOND AND LONG-TERM DEBT', commonCoa: 'COA-23', level: 'Level2', parent: '4004' },
  { code: '4009', name: 'Other Liabilities', commonCoa: 'COA-24', level: 'Level1', parent: '40' },
  { code: '400901', name: 'SUNDRY CREDITORS AND PROVISIONS', commonCoa: 'COA-24', level: 'Level2', parent: '4009' },
];

/** Ghana — letter-prefixed, a completely different shape. */
const GH_GL: LocalGlAccount[] = [
  { code: 'GH-A', name: 'Assets', commonCoa: 'COA-1', level: 'Category', parent: 'GL-GH' },
  { code: 'GH-A-100', name: 'Cash and BoG Balances', commonCoa: 'COA-11', level: 'Level2', parent: 'GH-A' },
  { code: 'GH-A-200', name: 'Interbank Placements', commonCoa: 'COA-12', level: 'Level2', parent: 'GH-A' },
  { code: 'GH-A-300', name: 'Government Securities', commonCoa: 'COA-13', level: 'Level2', parent: 'GH-A' },
  { code: 'GH-A-400', name: 'Customer Loans', commonCoa: 'COA-14', level: 'Level2', parent: 'GH-A' },
  { code: 'GH-A-900', name: 'Other Assets', commonCoa: 'COA-15', level: 'Level2', parent: 'GH-A' },
  { code: 'GH-L', name: 'Liabilities', commonCoa: 'COA-2', level: 'Category', parent: 'GL-GH' },
  { code: 'GH-L-100', name: 'Interbank Takings', commonCoa: 'COA-21', level: 'Level2', parent: 'GH-L' },
  { code: 'GH-L-200', name: 'Customer Deposits', commonCoa: 'COA-22', level: 'Level2', parent: 'GH-L' },
  { code: 'GH-L-300', name: 'Borrowings', commonCoa: 'COA-23', level: 'Level2', parent: 'GH-L' },
  { code: 'GH-L-900', name: 'Other Liabilities', commonCoa: 'COA-24', level: 'Level2', parent: 'GH-L' },
  { code: 'GH-E', name: 'Equity', commonCoa: 'COA-3', level: 'Category', parent: 'GL-GH' },
  { code: 'GH-E-100', name: 'Stated Capital', commonCoa: 'COA-31', level: 'Level2', parent: 'GH-E' },
  { code: 'GH-E-200', name: 'Income Surplus', commonCoa: 'COA-32', level: 'Level2', parent: 'GH-E' },
];

/** Côte d'Ivoire — SYSCOHADA, the UEMOA regional standard. */
const CI_GL: LocalGlAccount[] = [
  { code: 'CI-1', name: 'Classe 1 — Ressources durables', commonCoa: 'COA-3', level: 'Category', parent: 'GL-CI' },
  { code: 'CI-101000', name: 'Capital social', commonCoa: 'COA-31', level: 'Level2', parent: 'CI-1' },
  { code: 'CI-102000', name: 'Réserves et report à nouveau', commonCoa: 'COA-32', level: 'Level2', parent: 'CI-1' },
  { code: 'CI-2', name: 'Classe 2 — Actif immobilisé', commonCoa: 'COA-1', level: 'Category', parent: 'GL-CI' },
  { code: 'CI-201000', name: 'Immobilisations', commonCoa: 'COA-15', level: 'Level2', parent: 'CI-2' },
  { code: 'CI-5', name: 'Classe 5 — Trésorerie', commonCoa: 'COA-1', level: 'Category', parent: 'GL-CI' },
  { code: 'CI-501000', name: 'Caisse et BCEAO', commonCoa: 'COA-11', level: 'Level2', parent: 'CI-5' },
  { code: 'CI-502000', name: 'Créances interbancaires', commonCoa: 'COA-12', level: 'Level2', parent: 'CI-5' },
  { code: 'CI-503000', name: "Titres d'investissement", commonCoa: 'COA-13', level: 'Level2', parent: 'CI-5' },
  { code: 'CI-4', name: 'Classe 4 — Tiers', commonCoa: 'COA-2', level: 'Category', parent: 'GL-CI' },
  { code: 'CI-401000', name: 'Crédits à la clientèle', commonCoa: 'COA-14', level: 'Level2', parent: 'CI-4' },
  { code: 'CI-402000', name: 'Dépôts de la clientèle', commonCoa: 'COA-22', level: 'Level2', parent: 'CI-4' },
  { code: 'CI-403000', name: 'Dettes interbancaires', commonCoa: 'COA-21', level: 'Level2', parent: 'CI-4' },
  { code: 'CI-404000', name: 'Emprunts obligataires', commonCoa: 'COA-23', level: 'Level2', parent: 'CI-4' },
  { code: 'CI-409000', name: 'Autres passifs', commonCoa: 'COA-24', level: 'Level2', parent: 'CI-4' },
];

export const LOCAL_GL: Record<string, LocalGlAccount[]> = { NG: NG_GL, GH: GH_GL, CI: CI_GL };

const GL_SCHEME: Record<string, string> = {
  NG: 'Three-level numeric (category / group / account)',
  GH: 'Letter-prefixed by category',
  CI: 'SYSCOHADA (UEMOA regional standard)',
};

// GL Account was already, in effect, affiliate-owned data pretending to be Group-wide — the codes above show
// Nigeria (numeric), Ghana (letter-prefixed) and Côte d'Ivoire (SYSCOHADA) are three unrelated schemes that
// happened to share one bare-code namespace. Every affiliate now owns its chart for real.
export const GL_ACCOUNTS: DimensionMember[] = Object.entries(LOCAL_GL).flatMap(([affiliate, accounts]) => [
  node('GlAccount', affiliate, `GL-${affiliate}`, `${AFFILIATE_LABEL[affiliate]} — Local Chart`, null, false, {
    scheme: GL_SCHEME[affiliate] ?? 'Local',
  }),
  ...accounts.map((a) =>
    node('GlAccount', affiliate, a.code, a.name, a.parent, a.level === 'Level2', {
      commonCoa: a.commonCoa,
      glLevel: a.level,
    }),
  ),
]);

// Financial Element — what is being measured. Not tied to any one country's data, so it's owned by the
// literal 'GROUP' affiliate rather than duplicated identically per country.

export const FINANCIAL_ELEMENTS: DimensionMember[] = [
  node('FinancialElement', GROUP, 'FE-ROOT', 'Financial Elements', null, false),

  node('FinancialElement', GROUP, 'FE-BAL', 'Balances', 'FE-ROOT', false),
  node('FinancialElement', GROUP, 'FE-100', 'Ending Balance', 'FE-BAL', true),
  node('FinancialElement', GROUP, 'FE-140', 'Average Balance', 'FE-BAL', true),

  node('FinancialElement', GROUP, 'FE-INC', 'Income & Expense', 'FE-ROOT', false),
  node('FinancialElement', GROUP, 'FE-430', 'Interest Accrued', 'FE-INC', true),
  node('FinancialElement', GROUP, 'FE-450', 'Transfer Rate Charge/Credit', 'FE-INC', true),

  node('FinancialElement', GROUP, 'FE-GAP', 'Gap Measures', 'FE-ROOT', false),
  node('FinancialElement', GROUP, 'FE-660', 'Repricing Gap', 'FE-GAP', true),
  node('FinancialElement', GROUP, 'FE-1660', 'Liquidity Runoff', 'FE-GAP', true),
  node('FinancialElement', GROUP, 'FE-1680', 'Cumulative Liquidity Gap', 'FE-GAP', true),
];

// Counterparty — obligor or depositor, with a group-exposure link for
// single-obligor limit aggregation (related names count as one exposure)

interface Cp {
  code: string;
  name: string;
  sector: string;
  affiliate?: string;
  /** Parent group for connected-exposure aggregation. Null for a standalone name. */
  group?: string;
  rating?: string;
  note?: string;
}

const COUNTERPARTY_GROUPS: Cp[] = [
  { code: 'CPG-DANGOTE', name: 'Dangote-style Industrial Group', sector: 'Conglomerate' },
  { code: 'CPG-SOVEREIGN', name: 'Sovereign & Public Sector', sector: 'Sovereign' },
  { code: 'CPG-INTERBANK', name: 'Interbank Market', sector: 'Financial Institution' },
  { code: 'CPG-RETAIL', name: 'Retail Depositor Pool', sector: 'Retail' },
];

const COUNTERPARTY_LEAVES: Cp[] = [
  {
    code: 'CP-SOVEREIGN-NG',
    name: 'Federal Government of Nigeria',
    sector: 'Sovereign',
    group: 'CPG-SOVEREIGN',
    rating: 'B-',
    affiliate: 'NG',
  },
  {
    code: 'CP-SOVEREIGN-GH',
    name: 'Government of Ghana',
    sector: 'Sovereign',
    group: 'CPG-SOVEREIGN',
    rating: 'CCC+',
    affiliate: 'GH',
  },
  {
    code: 'CP-NG-INTERBANK',
    name: 'Nigerian Interbank Market',
    sector: 'Financial Institution',
    group: 'CPG-INTERBANK',
    affiliate: 'NG',
  },
  {
    code: 'CP-GH-INTERBANK',
    name: 'Ghanaian Interbank Market',
    sector: 'Financial Institution',
    group: 'CPG-INTERBANK',
    affiliate: 'GH',
  },
  {
    code: 'CP-NG-RETAIL-POOL',
    name: 'Retail Depositor Pool — Nigeria',
    sector: 'Retail',
    group: 'CPG-RETAIL',
    affiliate: 'NG',
    note: 'Aggregated: no single retail depositor reaches the reporting threshold',
  },
  {
    code: 'CP-GH-RETAIL-POOL',
    name: 'Retail Depositor Pool — Ghana',
    sector: 'Retail',
    group: 'CPG-RETAIL',
    affiliate: 'GH',
    note: 'Aggregated: no single retail depositor reaches the reporting threshold',
  },
  {
    code: 'CP-NG-OBLIGOR-01',
    name: 'Industrial Group — Cement Division',
    sector: 'Corporate',
    group: 'CPG-DANGOTE',
    rating: 'BB',
    affiliate: 'NG',
  },
  {
    code: 'CP-NG-OBLIGOR-02',
    name: 'Industrial Group — Refining Division',
    sector: 'Corporate',
    group: 'CPG-DANGOTE',
    rating: 'BB',
    affiliate: 'NG',
  },
  {
    code: 'CP-NG-OBLIGOR-03',
    name: 'Industrial Group — Logistics Division',
    sector: 'Corporate',
    group: 'CPG-DANGOTE',
    rating: 'BB-',
    affiliate: 'NG',
  },
  { code: 'CP-NG-OBLIGOR-04', name: 'Nigerian Manufacturing PLC', sector: 'Corporate', rating: 'B+', affiliate: 'NG' },
  { code: 'CP-NG-OBLIGOR-05', name: 'Nigerian Telecoms Limited', sector: 'Corporate', rating: 'BB', affiliate: 'NG' },
  { code: 'CP-NG-CORP-01', name: 'Nigerian Corporate Depositor 1', sector: 'Corporate', affiliate: 'NG' },
  { code: 'CP-NG-CORP-02', name: 'Nigerian Corporate Depositor 2', sector: 'Corporate', affiliate: 'NG' },
  { code: 'CP-NG-CORP-03', name: 'Nigerian Corporate Depositor 3', sector: 'Corporate', affiliate: 'NG' },
  { code: 'CP-GH-CORP-01', name: 'Ghanaian Corporate Depositor 1', sector: 'Corporate', affiliate: 'GH' },
  { code: 'CP-GH-CORP-02', name: 'Ghanaian Corporate Depositor 2', sector: 'Corporate', affiliate: 'GH' },
  { code: 'CP-GH-OBLIGOR-01', name: 'Ghanaian Mining Company', sector: 'Corporate', rating: 'B', affiliate: 'GH' },
  { code: 'CP-GH-OBLIGOR-02', name: 'Ghanaian Cocoa Processor', sector: 'Corporate', rating: 'B-', affiliate: 'GH' },
  { code: 'CP-GH-OBLIGOR-03', name: 'Ghanaian Energy Company', sector: 'Corporate', rating: 'B', affiliate: 'GH' },
  {
    code: 'CP-GH-OBLIGOR-04',
    name: 'Ghanaian Trading Company (impaired)',
    sector: 'Corporate',
    rating: 'CCC',
    affiliate: 'GH',
  },
  {
    code: 'CP-GH-STATE-ENTITY',
    name: 'Ghana State Entity — single large depositor',
    sector: 'Public Sector',
    group: 'CPG-SOVEREIGN',
    affiliate: 'GH',
    note: 'Concentration watch: dominant share of Ghana deposits',
  },
];

// CPG-* connected-exposure groups aggregate obligors across countries (e.g. a sovereign group spanning NG
// and GH), so they're owned by the literal 'GROUP' affiliate; each leaf obligor/depositor is owned by the
// country it actually belongs to.
export const COUNTERPARTIES: DimensionMember[] = [
  node('Counterparty', GROUP, 'CP-ROOT', 'All Counterparties', null, false),
  ...COUNTERPARTY_GROUPS.map((g) =>
    node('Counterparty', GROUP, g.code, g.name, 'CP-ROOT', false, {
      sector: g.sector,
      isExposureGroup: true,
    }),
  ),
  ...COUNTERPARTY_LEAVES.map((c) =>
    node('Counterparty', c.affiliate ?? GROUP, c.code, c.name, c.group ?? 'CP-ROOT', true, {
      sector: c.sector,
      ...(c.group ? { groupExposureCode: c.group } : {}),
      ...(c.rating ? { rating: c.rating } : {}),
      ...(c.note ? { note: c.note } : {}),
    }),
  ),
];

/** Every dimension except Product, which is generated from the workbook. */
export const CORE_DIMENSIONS: DimensionMember[] = [
  ...LEGAL_ENTITIES,
  ...ORG_UNITS,
  ...COMMON_COA,
  ...GL_ACCOUNTS,
  ...FINANCIAL_ELEMENTS,
  ...COUNTERPARTIES,
];
