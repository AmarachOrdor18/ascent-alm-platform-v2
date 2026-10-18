// The Group's current assumptions written out as the assumptions workbook - the same layout
// parseGroupAssumptions reads - so an affiliate can download them, change what differs for it in Excel and
// upload the file back as its own rules.
import * as XLSX from 'xlsx';
import type { RuleMeta } from '@/engine/types';
import type { AdjustmentLine, FtpAssignment, ProductAssumption } from '@/engine/ruleTypes';
import type { CostPool } from '@/engine/profitabilityLayers';

type Cell = string | number;

const METHOD_WORDS: Record<string, string> = {
  MatchedMaturity: 'Matched maturity',
  DurationMatched: 'Duration matched',
  AverageLife: 'Average life',
  RepricingTerm: 'Repricing term',
  Pooled: 'Pooled',
};
const ADJ_WORDS: Record<string, string> = {
  LiquidityPremium: 'Liquidity premium',
  CurrencyBasis: 'Currency basis',
  BasisSpread: 'Basis spread',
  PricingIncentive: 'Pricing incentive',
  BasisRiskCost: 'Basis risk cost',
};
const DRIVER_WORDS: Record<string, string> = {
  Balance: 'Balance',
  AccountCount: 'Account count',
  Headcount: 'Headcount',
  Fixed: 'Fixed share',
};

type R = RuleMeta & Record<string, unknown>;

/** One sheet per assumption the Group has, in the layout the upload reads. */
export function assumptionSheets(rules: RuleMeta[]): Record<string, Cell[][]> {
  const of = (kind: string) => rules.find((r) => r.kind === kind) as R | undefined;
  const sheets: Record<string, Cell[][]> = {
    'Read me': [
      ['How to use this file'],
      ['Change the values that differ for your affiliate. Keep the sheet names and the first column as they are.'],
      ['Upload the file back on the same screen - it is saved as your affiliate’s own assumptions.'],
      ['Rules that need approval wait for an approver; until then the Group values keep applying.'],
    ],
  };

  const ftp = of('FtpRule');
  if (ftp) {
    const assignments = (ftp.assignments as FtpAssignment[] | undefined) ?? [];
    sheets['1 FTP method'] = [
      ['Field', 'Value', 'Note'],
      ['Rule name', ftp.name, ''],
      ['Default method', METHOD_WORDS[String(ftp.defaultMethod ?? 'MatchedMaturity')] ?? 'Matched maturity', ''],
      ...assignments.map((a) => [
        `Assignment: product class ${a.commonCoaCode}`,
        `${METHOD_WORDS[a.method] ?? a.method} · Curve: ${a.curveCode ?? '- affiliate default -'}`,
        '',
      ]),
    ];
  }

  const adj = of('AdjustmentRule');
  if (adj) {
    const lines = (adj.adjustments as AdjustmentLine[] | undefined) ?? [];
    sheets['2 FTP add-ons'] = [
      ['Type', 'Applies to', 'Method', 'Value', 'Note'],
      [`Rule name: ${adj.name}`, '', '', '', ''],
      ...lines.map((l) => [
        ADJ_WORDS[l.type] ?? 'Other',
        l.currency ? `Currency ${l.currency}` : (l.commonCoaCode ?? 'All'),
        'Fixed',
        `${l.fixedBps} bps`,
        '',
      ]),
    ];
  }

  const cost = of('CostAllocation');
  if (cost) {
    const pools = (cost.pools as CostPool[] | undefined) ?? [];
    sheets['3 Cost allocation'] = [
      ['Pool name', 'Annual amount', 'Driver', 'Targets', 'Note'],
      [`Rule name: ${cost.name}  ·  Currency: ${String(cost.currency ?? 'USD')}`, '', '', '', ''],
      ...pools.map((p) => [p.name, p.amount, DRIVER_WORDS[p.driver] ?? p.driver, 'All', '']),
    ];
  }

  const ecl = of('CreditLoss');
  if (ecl) {
    const pd = (ecl.pdByProduct as Record<string, number> | undefined) ?? {};
    const lgd = (ecl.lgdByProduct as Record<string, number> | undefined) ?? {};
    const products = Array.from(new Set([...Object.keys(pd), ...Object.keys(lgd)])).sort();
    sheets['4 Credit loss'] = [
      ['Field / product', 'PD %', 'LGD %', 'Note'],
      [
        `Rule name: ${ecl.name}  ·  Method: ${ecl.method === 'ProvisionChange' ? 'Provision change' : 'PD × LGD'}`,
        '',
        '',
        '',
      ],
      ['Default (any product not listed)', Number(ecl.defaultPdPct ?? ''), Number(ecl.defaultLgdPct ?? ''), ''],
      ...products.map((c) => [c, pd[c] ?? '', lgd[c] ?? '', '']),
      ['Use booked provisions for non-performing loans', ecl.useProvisionAmount === false ? 'Off' : 'On', '', ''],
    ];
  }

  const cap = of('CapitalAllocation');
  if (cap) {
    const weights = (cap.riskWeightByProductClass as Record<string, number> | undefined) ?? {};
    sheets['5 Capital'] = [
      ['Field / product class', 'Value', 'Note'],
      ['Rule name', cap.name, ''],
      ['Capital ratio', Number(cap.capitalRatioPct ?? 12.5), '%'],
      ['Cost of capital', Number(cap.costOfCapitalPct ?? 15), '%'],
      ['Tax rate', cap.taxRatePct === undefined ? '' : Number(cap.taxRatePct), '%'],
      ['Default risk weight', Number(cap.defaultRiskWeightPct ?? 100), '%'],
      ...Object.entries(weights).map(([code, w]) => [code, w, '% risk weight']),
    ];
  }

  const pc = of('ProductCharacteristic');
  if (pc && ((pc.assumptions as ProductAssumption[] | undefined) ?? []).length > 0) {
    const list = (pc.assumptions as ProductAssumption[] | undefined) ?? [];
    sheets['6 Product characteristics'] = [
      ['Product', 'Currency', 'LCR role', 'LCR rate %', 'ASF %', 'RSF %', 'HQLA level', 'Haircut %'],
      ...list.map((a) => [
        a.commonCoaCode ? `Common account: ${a.commonCoaCode}` : a.productCode,
        a.currency === '*' ? 'Any' : a.currency,
        a.lcrCashflowRole,
        a.lcrRatePct ?? '',
        a.asfFactorPct ?? '',
        a.rsfFactorPct ?? '',
        a.hqlaLevel === 'None' ? '' : a.hqlaLevel,
        a.hqlaHaircutPct ?? '',
      ]),
    ];
  }
  return sheets;
}

export function buildAssumptionsWorkbook(rules: RuleMeta[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(assumptionSheets(rules))) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 46 },
      { wch: 30 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Save a workbook the browser built. */
export function downloadWorkbook(buffer: ArrayBuffer, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
