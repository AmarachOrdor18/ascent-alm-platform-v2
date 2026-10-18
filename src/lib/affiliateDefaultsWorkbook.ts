// The affiliate's defaults as an Excel workbook: download it, change "Your value" columns in Excel, upload it
// back into onboarding. Two sheets - Defaults (settings the organisation lets affiliates choose) and Risk
// thresholds. Nothing is saved by reading it; the step shows the values and saves them on Save & continue.
import * as XLSX from 'xlsx';

export interface DefaultsSheetSetting {
  key: string;
  label: string;
  organisationValue: string;
  yourValue: string;
  canChange: boolean;
  /** Labels accepted in "Your value" (blank = organisation default). */
  options: string[];
}

export interface DefaultsSheetThreshold {
  key: string;
  label: string;
  organisationAmber: number;
  organisationRed: number;
  amber: number;
  red: number;
  minimum: number | null;
}

const SETTING_HEADERS = ['Key', 'Setting', 'Organisation value', 'Your value', 'Allowed values', 'Can change'];
const THRESHOLD_HEADERS = [
  'Key',
  'Measure',
  'Organisation amber %',
  'Organisation red %',
  'Your amber %',
  'Your red %',
  'Regulatory minimum %',
];

export function buildDefaultsWorkbook(
  settings: DefaultsSheetSetting[],
  thresholds: DefaultsSheetThreshold[],
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const s = XLSX.utils.aoa_to_sheet([
    SETTING_HEADERS,
    ...settings.map((r) => [
      r.key,
      r.label,
      r.organisationValue,
      r.canChange ? r.yourValue : '',
      r.canChange ? r.options.join(' / ') : '-',
      r.canChange ? 'Yes' : 'No - set by the organisation',
    ]),
  ]);
  s['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 22 }, { wch: 22 }, { wch: 40 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, s, 'Defaults');
  const t = XLSX.utils.aoa_to_sheet([
    THRESHOLD_HEADERS,
    ...thresholds.map((r) => [r.key, r.label, r.organisationAmber, r.organisationRed, r.amber, r.red, r.minimum ?? '']),
  ]);
  t['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, t, 'Risk thresholds');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export interface ReadDefaults {
  /** key -> label written in "Your value" (empty string = back to the organisation value). */
  settings: Record<string, string>;
  thresholds: Record<string, { amber: number; red: number }>;
  problems: string[];
}

export async function readDefaultsWorkbook(file: File | ArrayBuffer): Promise<ReadDefaults> {
  const wb = XLSX.read(file instanceof ArrayBuffer ? file : await file.arrayBuffer(), { type: 'array' });
  const out: ReadDefaults = { settings: {}, thresholds: {}, problems: [] };
  const rows = (name: string) =>
    wb.Sheets[name]
      ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]!, { defval: '', raw: true })
      : null;
  const settings = rows('Defaults');
  const thresholds = rows('Risk thresholds');
  if (!settings && !thresholds) {
    out.problems.push('This is not the defaults workbook - download it from this step first.');
    return out;
  }
  for (const r of settings ?? []) {
    const key = String(r['Key'] ?? '').trim();
    if (key) out.settings[key] = String(r['Your value'] ?? '').trim();
  }
  for (const r of thresholds ?? []) {
    const key = String(r['Key'] ?? '').trim();
    if (!key) continue;
    const amber = Number(r['Your amber %']);
    const red = Number(r['Your red %']);
    if (!Number.isFinite(amber) || !Number.isFinite(red)) {
      out.problems.push(`${String(r['Measure'] ?? key)}: amber and red must be numbers.`);
      continue;
    }
    out.thresholds[key] = { amber, red };
  }
  return out;
}
