import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { DataLoadPanel, type DataLoadPanelState } from '@/components/data/DataLoadPanel';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates } from '@/lib/hooks';
import type { DataDomain } from '@/engine/types';

export function DataUpload() {
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();

  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const [domain, setDomain] = useState<DataDomain>('Positions');
  const [panelState, setPanelState] = useState<DataLoadPanelState>({
    rowsStaged: null, parseErrors: null, validation: null, balanceCheck: null,
  });

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate = affiliates.find((a) => a.code === pickedCode) ?? resolveSingleAffiliate(affiliates, affiliateCode);

  return (
    <>
      <ModuleHeader
        title="Data Upload & Staging"
        description="Upload, stage, correct, validate, commit. Staged rows are editable; committed rows are not — after commit the only routes are a new version or a reasoned adjustment."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate selected'}
        currency={affiliate?.functionalCurrency}
        metrics={[
          { label: 'Rows staged', value: panelState.rowsStaged !== null ? String(panelState.rowsStaged) : '—', about: 'Rows parsed from the uploaded file and sitting in staging — editable, not yet committed.' },
          {
            label: 'Parse errors',
            value: panelState.parseErrors !== null ? String(panelState.parseErrors) : '—',
            tone: panelState.parseErrors && panelState.parseErrors > 0 ? 'danger' : 'neutral',
            about: 'Rows that failed to parse into the expected schema at all.',
          },
          {
            label: 'Validation',
            value: panelState.validation ?? '—',
            tone: panelState.validation === 'Blocked' ? 'danger' : panelState.validation === 'Passed' ? 'success' : 'neutral',
            about: 'Whether the staged rows pass the configured Validation Rules — a blocking finding prevents commit.',
          },
          {
            label: 'Balance check',
            value: panelState.balanceCheck ?? '—',
            tone: panelState.balanceCheck === 'Balances' ? 'success' : panelState.balanceCheck ? 'danger' : 'neutral',
            about: 'Whether staged assets equal liabilities plus capital — catches an obviously broken file before it reaches a calculation.',
          },
        ]}
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode} />

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-100 bg-white p-4">
        <div>
          <label htmlFor="up-domain" className="mb-1 block text-[11px] text-gray-600">
            Domain
          </label>
          <select
            id="up-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value as DataDomain)}
            className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
          >
            {(['Positions', 'GeneralLedger', 'Counterparties'] as DataDomain[]).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="up-asof" className="mb-1 block text-[11px] text-gray-600">
            As-of date
          </label>
          <input
            id="up-asof"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
          />
        </div>
      </div>

      {affiliate ? (
        <DataLoadPanel affiliate={affiliate} domain={domain} asOfDate={asOfDate} onStateChange={setPanelState} />
      ) : (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No affiliate selected</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Pick an affiliate above to upload data for it.
          </p>
          <p className="mt-3 font-mono text-[11px] text-gray-400">demo_data/ghana_position_book_2026-07.csv</p>
        </section>
      )}
    </>
  );
}
