// Per-department starter CSV templates for the Positions domain (DataLoadPanel.tsx). Deliberately narrower
// than the full Position schema: HQLA level, haircuts, LCR role/rate and ASF/RSF factors are excluded from
// every template because they're no longer typed in by hand - engine/classification.ts derives them from
// productClass/currency via the Product Characteristics rule at run time. A Loans, Deposits or Treasury
// analyst should never need to know what "HQLA Level 2A" means to submit their book.
import type { PositionContributor } from '@/engine/types';
import { csvTemplateText, downloadCsvTemplate } from './csvTemplates';

export interface PositionTemplate {
  columns: string[];
  /** One realistic example row, in the same order as `columns`, so a first-time uploader sees the expected shape. */
  sampleRow: string[];
}

const CORE_COLUMNS = ['id', 'accountNumber', 'accountClass', 'branchCode', 'category', 'productClass', 'currency', 'amount', 'legalEntityCode', 'orgUnitCode', 'glAccountCode', 'commonCoaCode', 'notes'];

export const POSITION_TEMPLATES: Record<PositionContributor, PositionTemplate> = {
  Loans: {
    columns: [
      ...CORE_COLUMNS,
      'counterpartyId',
      'originationDate',
      'maturityDate',
      'nextRepricingDate',
      'rateType',
      'interestRatePct',
      'rateIndexCode',
      'spreadOverIndexBps',
      'amortizationType',
      'paymentFrequencyMonths',
      'performingStatus',
      'daysPastDue',
      'provisionAmount',
      'lienAmount',
      'lienReason',
    ],
    sampleRow: [
      'NG-LN-00001', '20220100001', 'Customer', 'HQ001', 'Asset', 'Loans And Advances - Corporate', 'NGN', '150000000', 'LE-NG', 'OU-NG-CRD', '300101', 'COA-LOAN',
      '',
      'CP-00042', '2024-03-01', '2027-03-01', '2026-09-01', 'Floating', '24.5', 'MPR', '350', 'Conventional', '1', 'Performing', '0', '0', '0', '',
    ],
  },
  Deposits: {
    columns: [
      ...CORE_COLUMNS,
      'behaviouralTag',
      'maturityDate',
      'rateType',
      'interestRatePct',
      'monthlyCredit',
      'monthlyDebit',
    ],
    sampleRow: [
      'NG-DP-00001', '20030200001', 'Customer', 'HQ001', 'Liability', 'Savings', 'NGN', '4500000', 'LE-NG', 'OU-NG-RET', '210101', 'COA-DEP-SAV',
      '',
      'Core', '', 'Fixed', '4.2', '620000', '580000',
    ],
  },
  Treasury: {
    columns: [
      ...CORE_COLUMNS,
      'counterpartyId',
      'maturityDate',
      'nextRepricingDate',
      'rateType',
      'interestRatePct',
      'rateIndexCode',
      'spreadOverIndexBps',
    ],
    sampleRow: [
      'NG-TR-00001', '20050100001', 'Internal', 'HQ001', 'Asset', 'Treasury Bills', 'NGN', '2000000000', 'LE-NG', 'OU-NG-TSY', '150102', 'COA-TBILL',
      '',
      '', '2026-11-15', '', 'Fixed', '18.75', '', '',
    ],
  },
};

export function positionTemplateCsv(contributor: PositionContributor): string {
  const { columns, sampleRow } = POSITION_TEMPLATES[contributor];
  return csvTemplateText(columns, sampleRow);
}

export function downloadPositionTemplate(contributor: PositionContributor): void {
  const { columns, sampleRow } = POSITION_TEMPLATES[contributor];
  downloadCsvTemplate(columns, sampleRow, `${contributor.toLowerCase()}_positions_template.csv`);
}
