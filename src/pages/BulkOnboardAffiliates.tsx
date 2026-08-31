import { useRef, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useCurrencies,
  useDimensionMembers,
  useHolidayCalendars,
  useSaveAffiliate,
  useSaveDimensionMembers,
} from '@/lib/hooks';
import { useConnectors } from '@/lib/connectorHooks';
import {
  generateAffiliateTemplate,
  parseAffiliateWorkbook,
  type BulkAffiliateRow,
} from '@/lib/affiliateWorkbook';
import { REGULATORY_MINIMA } from '@/engine/limits';
import type { Affiliate, DataDomain, DimensionMember } from '@/engine/types';

const REGULATORS = Object.keys(REGULATORY_MINIMA);
const REGIONS = ['West Africa', 'Anglophone West Africa', 'UEMOA', 'Central Africa', 'East Africa', 'Southern Africa', 'Nigeria'];
const SEGMENTS = [
  { suffix: 'RET', name: 'Retail Banking' },
  { suffix: 'COR', name: 'Corporate & Investment Banking' },
  { suffix: 'TSY', name: 'Treasury' },
  { suffix: 'WLT', name: 'Wealth Management' },
];

export function BulkOnboardAffiliates() {
  const { user, hasPermission } = useAuth();
  const canOnboard = hasPermission('group.manage');
  const { data: affiliates = [] } = useAffiliates();
  const { data: currencies = [] } = useCurrencies();
  const { data: calendars = [] } = useHolidayCalendars();
  const { data: connectors = [] } = useConnectors();
  // Common COA is affiliate-owned, not Group-wide — NG's copy (identical to GH's and CI's today) is used as
  // the reference/template shown to a bulk-onboarded affiliate, and copied into each new affiliate's own list.
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa', 'NG');

  const save = useSaveAffiliate();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveCommonCoa = useSaveDimensionMembers('CommonCoa');

  const [showTemplate, setShowTemplate] = useState(false);
  const [rows, setRows] = useState<BulkAffiliateRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const commonCoaLeaves = commonCoa.filter((m) => m.isLeaf);

  const downloadTemplate = () => {
    const buffer = generateAffiliateTemplate({
      regulators: REGULATORS,
      regions: REGIONS,
      currencyCodes: currencies.map((c) => c.code),
      calendarIds: calendars.map((c) => c.id),
      commonCoaNodes: commonCoaLeaves.map((n) => ({ code: n.code, name: n.name })),
      connectorNames: connectors.filter((c) => c.isActive && c.status === 'Available').map((c) => c.name),
    });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ascent-alm-bulk-affiliate-onboarding-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (file: File) => {
    setFileName(file.name);
    setImported(null);
    const buffer = await file.arrayBuffer();
    const activeConnectorNamesByDomain = new Map<DataDomain, Set<string>>();
    for (const c of connectors) {
      if (!c.isActive || c.status !== 'Available') continue;
      for (const d of c.domains) {
        if (!activeConnectorNamesByDomain.has(d)) activeConnectorNamesByDomain.set(d, new Set());
        activeConnectorNamesByDomain.get(d)!.add(c.name);
      }
    }
    const parsed = parseAffiliateWorkbook(buffer, {
      existingCodes: new Set(affiliates.map((a) => a.code)),
      validRegulators: new Set(REGULATORS),
      validCurrencies: new Set(currencies.map((c) => c.code)),
      validCalendarIds: new Set(calendars.map((c) => c.id)),
      commonCoaCodes: new Set(commonCoaLeaves.map((n) => n.code)),
      activeConnectorNamesByDomain,
    });
    setRows(parsed);
  };

  const validRows = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = rows?.filter((r) => r.errors.length > 0) ?? [];

  const confirmImport = async () => {
    if (!user || validRows.length === 0) return;
    setImporting(true);
    const created: string[] = [];
    try {
      for (const row of validRows) {
        const affiliate: Affiliate = {
          code: row.code,
          name: row.name,
          country: row.country,
          region: row.region,
          regulator: row.regulator,
          functionalCurrency: row.functionalCurrency,
          reportingCurrency: row.reportingCurrency,
          activeCurrencies: row.activeCurrencies.length > 0 ? row.activeCurrencies : [row.functionalCurrency],
          status: 'Onboarding',
          fiscalYearEnd: row.fiscalYearEnd,
          holidayCalendarId: row.holidayCalendarId,
          legalEntityCode: row.legalEntityCode,
          feeds: row.feeds,
          inheritGroupRules: true,
          internalThresholds: {},
          limitsConfirmed: false,
          createdAt: new Date().toISOString(),
        };
        await save.mutateAsync(affiliate);

        // Every new affiliate gets its own copy of the Common COA reference (there's no Group-wide list to
        // point at instead) before its GL mappings, which reference these codes, are created.
        if (commonCoa.length > 0) {
          await saveCommonCoa.mutateAsync(
            commonCoa.map((m) => ({ ...m, id: `CommonCoa:${row.code}:${m.code}`, affiliateCode: row.code })),
          );
        }

        if (row.coaMappings.length > 0) {
          const rootCode = `GL-${row.code}`;
          const members: DimensionMember[] = [
            { id: `GlAccount:${row.code}:${rootCode}`, dimension: 'GlAccount' as const, affiliateCode: row.code, code: rootCode, name: `${row.name} — Local Chart`, parentCode: null, isLeaf: false },
            ...row.coaMappings.map((m) => ({
              id: `GlAccount:${row.code}:${m.localCode}`,
              dimension: 'GlAccount' as const,
              affiliateCode: row.code,
              code: m.localCode,
              name: m.localName,
              parentCode: rootCode,
              isLeaf: true,
              attributes: { commonCoa: m.commonCoaCode },
            })),
          ];
          await saveGlAccounts.mutateAsync(members);
        }

        if (row.createOrgTemplate) {
          const orgRootCode = `OU-${row.code}`;
          await saveOrgUnits.mutateAsync([
            { id: `OrgUnit:${row.code}:${orgRootCode}`, dimension: 'OrgUnit', affiliateCode: row.code, code: orgRootCode, name: row.name, parentCode: 'OU-GROUP', isLeaf: false },
            ...SEGMENTS.map((s) => ({
              id: `OrgUnit:${row.code}:${orgRootCode}-${s.suffix}`,
              dimension: 'OrgUnit' as const,
              affiliateCode: row.code,
              code: `${orgRootCode}-${s.suffix}`,
              name: `${row.name} — ${s.name}`,
              parentCode: orgRootCode,
              isLeaf: true,
            })),
          ]);
        }

        created.push(row.code);
      }
      setImported(created);
      setRows(null);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <ModuleHeader
        title="Bulk Onboard Affiliates"
        description="Upload a completed workbook to pre-fill a batch of affiliates at once — each still lands in Onboarding status and needs its own connectivity, data load and approval, same as onboarding one at a time."
        asOfDate={null}
        scope="Ecobank Group"
      />

      {!canOnboard ? (
        <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
          <p className="mt-1 text-[12px] text-gray-500">Your role doesn&rsquo;t have access to bulk onboarding.</p>
        </div>
      ) : (
        <>
          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">1. Get the template</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowTemplate((v) => !v)} className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700">
                {showTemplate ? 'Hide template preview' : 'View template'}
              </button>
              <button type="button" onClick={downloadTemplate} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">
                Download Excel template
              </button>
            </div>

            {showTemplate && (
              <div className="mt-4 space-y-3 rounded-lg bg-gray-50 p-4 text-[12px]">
                <TemplateSheetPreview name="Affiliate Profile" cols={['Affiliate Code*', 'Legal Name*', 'Country*', 'Region*', 'Regulator*', 'Legal Entity Code', 'Functional Currency*', 'Reporting Currency*', 'Fiscal Year End', 'Holiday Calendar ID']} note="One row per affiliate." />
                <TemplateSheetPreview name="Currencies" cols={['Affiliate Code*', 'Other Active Currency*']} note="One row per (affiliate, currency)." />
                <TemplateSheetPreview name="Connectivity" cols={['Affiliate Code*', 'Domain*', 'Mode*', 'Connector Name', 'SLA Days*', 'Owner']} note="One row per (affiliate, domain) — six rows per affiliate." />
                <TemplateSheetPreview name="COA Mapping" cols={['Affiliate Code*', 'Group COA Node Code*', 'Local GL Code*', 'Local GL Name']} note={`One row per local code mapped. ${commonCoaLeaves.length} Group COA nodes exist today.`} />
                <TemplateSheetPreview name="Organisation" cols={['Affiliate Code*', 'Create Standard Org Template? (Y/N)*']} note="One row per affiliate." />
                <TemplateSheetPreview name="Instructions & Reference" cols={['(free text + valid-value lists)']} note="Regulators, regions, currencies, calendars, domains, connectors and Group COA nodes, so you don't need to open the app to look anything up." />
              </div>
            )}
          </section>

          <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">2. Upload the completed template</h2>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
              className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
            />
            {fileName && <p className="mt-2 text-[11px] text-gray-500">{fileName}</p>}
          </section>

          {rows && rows.length > 0 && (
            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">3. Validate & preview</h2>
              <p className="mb-4 text-[12px] text-gray-600">
                {rows.length} affiliate{rows.length === 1 ? '' : 's'} detected — <span className="font-bold text-success">{validRows.length} valid</span>, <span className="font-bold text-danger">{invalidRows.length} with errors</span>.
              </p>

              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 px-3 font-bold">Row</th>
                    <th className="py-2 px-3 font-bold">Code</th>
                    <th className="py-2 px-3 font-bold">Name</th>
                    <th className="py-2 px-3 font-bold">Status</th>
                    <th className="py-2 px-3 font-bold">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className="border-b border-gray-100 align-top">
                      <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{r.rowNumber}</td>
                      <td className="py-2 px-3 font-mono text-[11px]">{r.code || '—'}</td>
                      <td className="py-2 px-3 text-navy-900">{r.name || '—'}</td>
                      <td className="py-2 px-3">
                        <StatusBadge status={r.errors.length === 0 ? 'Valid' : 'Error'} tone={r.errors.length === 0 ? 'success' : 'danger'} />
                      </td>
                      <td className="py-2 px-3 text-[11px] text-danger">
                        {r.errors.length > 0 && (
                          <ul className="list-disc space-y-0.5 pl-4">
                            {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={validRows.length === 0 || importing}
                  onClick={() => void confirmImport()}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  {importing ? 'Importing…' : `Confirm import — create ${validRows.length} affiliate${validRows.length === 1 ? '' : 's'}`}
                </button>
                {invalidRows.length > 0 && (
                  <span className="text-[11px] text-gray-500">Rows with errors are skipped, not partially created — fix and re-upload to include them.</span>
                )}
              </div>
            </section>
          )}

          {imported && (
            <section className="rounded-2xl border border-success/20 bg-success-bg p-8 text-center">
              <h2 className="text-[16px] font-bold text-navy-900">✓ {imported.length} affiliate{imported.length === 1 ? '' : 's'} created</h2>
              <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-600">
                {imported.join(', ')} — all in <span className="font-bold">Onboarding</span> status. Open each from
                Affiliates to finish connectivity, initial data load and submit for approval.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}

function TemplateSheetPreview({ name, cols, note }: { name: string; cols: string[]; note: string }) {
  return (
    <div>
      <p className="font-bold text-navy-900">{name}</p>
      <p className="mb-1 text-[11px] text-gray-500">{note}</p>
      <div className="flex flex-wrap gap-1.5">
        {cols.map((c) => (
          <span key={c} className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-[10px] text-gray-600">{c}</span>
        ))}
      </div>
    </div>
  );
}
