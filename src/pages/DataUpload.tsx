import { useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { InfoButton } from '@/components/ui/InfoButton';
import { DataLoadPanel, type DataLoadPanelState } from '@/components/data/DataLoadPanel';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates } from '@/lib/hooks';
import { accessibleAffiliates } from '@/lib/scope';
import type { DataDomain } from '@/engine/types';

export function DataUpload() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  // Confined to one affiliate can only stage and commit data for that affiliate here. Live-only: an
  // affiliate isn't ready for real data work until its onboarding configuration has been approved -
  // uploading here before then would build a book nobody has signed off the setup for yet.
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission).filter((a) => a.status === 'Live');

  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const [domain, setDomain] = useState<DataDomain>('Positions');
  const [panelState, setPanelState] = useState<DataLoadPanelState>({
    rowsStaged: null, parseErrors: null, validation: null, balanceCheck: null,
  });

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  // At Group scope there is no single affiliate to default to - silently picking one would mean staging
  // or committing data for an affiliate nobody actually chose.
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (affiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, affiliateCode));

  return (
    <>
      <ModuleHeader
        title="Data Upload & Staging"
        description="Upload, stage, correct, validate, commit. Staged rows are editable; committed rows are not - after commit the only routes are a new version or a reasoned adjustment."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate selected'}
        currency={affiliate?.functionalCurrency}
        metrics={[
          { label: 'Rows staged', value: panelState.rowsStaged !== null ? String(panelState.rowsStaged) : '-', about: 'Rows parsed from the uploaded file and sitting in staging - editable, not yet committed.' },
          {
            label: 'Parse errors',
            value: panelState.parseErrors !== null ? String(panelState.parseErrors) : '-',
            tone: panelState.parseErrors && panelState.parseErrors > 0 ? 'danger' : 'neutral',
            about: 'Rows that failed to parse into the expected schema at all.',
          },
          {
            label: 'Validation',
            value: panelState.validation ?? '-',
            tone: panelState.validation === 'Blocked' ? 'danger' : panelState.validation === 'Passed' ? 'success' : 'neutral',
            about: 'Whether the staged rows pass the configured Validation Rules - a blocking finding prevents commit.',
          },
          {
            label: 'Combined book balance',
            value: domain === 'Positions' ? (panelState.balanceCheck ?? 'Awaiting other departments') : (panelState.balanceCheck ?? '-'),
            tone: panelState.balanceCheck === 'Balances' ? 'success' : panelState.balanceCheck ? 'danger' : 'neutral',
            about: 'Whether assets equal liabilities plus capital across every department’s file for this date, not just the one being staged right now - Loans, Deposits and Treasury each submit their own one-sided slice, so this only has a real answer once all of them are in.',
          },
        ]}
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode}>
        <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
        <label htmlFor="up-domain" className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Domain
        </label>
        <select
          id="up-domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value as DataDomain)}
          className="rounded border border-gray-200 px-2 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
        >
          {(['Positions', 'Counterparties'] as DataDomain[]).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="up-asof" className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            As-of date
            <InfoButton label="Where GL trial balances go">
              General ledger trial balances upload on{' '}
              <Link href="/gl-reconciliation" className="font-bold text-navy-700 hover:underline">
                GL Reconciliation
              </Link>
              , not here - that screen compares the ledger against committed positions rather than staging it on its
              own.
            </InfoButton>
          </label>
          <input
            id="up-asof"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
          />
        </div>
      </AffiliateSelector>

      {affiliate ? (
        <DataLoadPanel affiliate={affiliate} domain={domain} asOfDate={asOfDate} onStateChange={setPanelState} />
      ) : (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No affiliate selected</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Pick an affiliate above to upload data for it.
          </p>
        </section>
      )}
    </>
  );
}
