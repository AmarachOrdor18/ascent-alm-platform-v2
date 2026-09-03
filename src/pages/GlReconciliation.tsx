import { useMemo, useRef, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates, useBatches, usePositions, useSaveBatch } from '@/lib/hooks';
import { accessibleAffiliates } from '@/lib/scope';
import { importLedger } from '@/lib/csvImport';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import { downloadCsvTemplate } from '@/lib/csvTemplates';
import { referenceLoadBatch } from '@/lib/referenceBatch';

const LEDGER_TEMPLATE_COLUMNS = ['glAccountCode', 'orgUnitCode', 'currency', 'endingBalance', 'asOfDate'];
const LEDGER_TEMPLATE_SAMPLE = ['200601', '', 'NGN', '150000000', '2026-07-31'];
import { identityFxTable } from '@/engine/fx';
import {
  reconcile,
  type LedgerBalance,
  type ReconciliationLevel,
  type ReconciliationLine,
} from '@/engine/reconciliation';
import { formatPct } from '@/lib/format';

export function GlReconciliation() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  // Confined to one affiliate can only reconcile that affiliate's own book here.
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission);
  const canSignOff = hasPermission('data.configure');
  const fileInput = useRef<HTMLInputElement>(null);

  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const [level, setLevel] = useState<ReconciliationLevel>('GlAccount');
  const [toleranceAmount, setToleranceAmount] = useState(1000);
  const [tolerancePercent, setTolerancePercent] = useState(5);
  const [ledger, setLedger] = useState<LedgerBalance[] | null>(null);
  const [ledgerName, setLedgerName] = useState<string | null>(null);
  const [ledgerFileError, setLedgerFileError] = useState<string | null>(null);
  const [approvedPlugs, setApprovedPlugs] = useState<Set<string>>(new Set());

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  // At Group scope there is no single affiliate to default to - silently picking one would mean
  // reconciling (and potentially signing off) an affiliate's book nobody actually chose. Leaving
  // affiliate undefined here also matters for usePositions below: an undefined code, unlike 'GROUP',
  // is read as "no filter" and would otherwise pull every affiliate's positions into the count.
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (affiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, affiliateCode));
  const currency = affiliate?.functionalCurrency ?? 'USD';
  const { data: positions = [] } = usePositions(affiliate?.code, asOfDate);
  const { data: batches = [] } = useBatches();
  const saveBatch = useSaveBatch();

  // Sign-off is recorded on the Position Book batch(es) this affiliate/date actually consumed - same field
  // and pattern OnboardAffiliate uses - so it survives a refresh and shows up wherever reconciledAt is read,
  // rather than living only in this screen's own state.
  const positionsBatchesForDate = affiliate
    ? batches.filter(
        (b) => b.affiliateCode === affiliate.code && b.domain === 'Positions' && b.status === 'Committed' && b.asOfDate === asOfDate,
      )
    : [];
  const signedOff = positionsBatchesForDate.length > 0 && positionsBatchesForDate.every((b) => !!b.reconciledAt);

  const result = useMemo(() => {
    if (!ledger || !affiliate) return null;
    return reconcile(positions, ledger, {
      reportingCurrency: currency,
      fx: identityFxTable(currency, asOfDate),
      level,
      toleranceAmount,
      tolerancePercent,
    });
  }, [ledger, positions, affiliate, currency, asOfDate, level, toleranceAmount, tolerancePercent]);

  const lineControls = useTableControls(result?.lines ?? [], 25, ['glAccountCode', 'orgUnitCode']);

  const handleLedgerFile = async (file: File) => {
    setLedgerFileError(null);
    let text: string;
    try {
      text = await readUploadAsCsvText(file);
    } catch (err) {
      setLedgerFileError(err instanceof Error ? err.message : 'This file could not be read.');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    const parsed = importLedger(text, asOfDate, currency);
    setLedger(parsed.rows);
    setLedgerName(file.name);
    setApprovedPlugs(new Set());
    if (fileInput.current) fileInput.current.value = '';
    // GeneralLedger is genuinely per-affiliate, unlike the Group-wide reference domains - but same
    // underlying gap: Data Sources' freshness page only reads LoadBatch rows, so without recording one
    // here it reads "Never loaded" for this affiliate no matter how current the trial balance actually is.
    if (affiliate && user) {
      saveBatch.mutate(
        referenceLoadBatch({
          domain: 'GeneralLedger',
          affiliateCode: affiliate.code,
          asOfDate,
          label: file.name,
          uploadedBy: user.name,
          rowCount: parsed.rows.length,
        }),
      );
    }
  };

  const handleSignOff = () => {
    if (!canComplete || !user) return;
    for (const b of positionsBatchesForDate) {
      void saveBatch.mutateAsync({ ...b, reconciledBy: user.name, reconciledAt: new Date().toISOString() });
    }
  };

  const togglePlug = (key: string) => {
    setApprovedPlugs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allPlugsApproved = result !== null && result.suggestedPlugs.every((p) => approvedPlugs.has(p.key));
  const canComplete =
    result !== null && result.canSignOff && allPlugsApproved && canSignOff && positionsBatchesForDate.length > 0;

  const columns: ResultColumn<ReconciliationLine>[] = [
    {
      key: 'gl',
      header: 'GL account',
      render: (l) => <span className="font-mono text-[11px] text-navy-900">{l.glAccountCode}</span>,
    },
    ...(level === 'GlAccountByOrgUnit'
      ? [
          {
            key: 'ou',
            header: 'Org unit',
            render: (l: ReconciliationLine) => (
              <span className="font-mono text-[11px] text-gray-500">{l.orgUnitCode ?? '-'}</span>
            ),
          },
        ]
      : []),
    {
      key: 'instrument',
      header: 'Instrument data',
      align: 'right',
      render: (l) => <Amount value={l.instrumentBalance} currency={currency} />,
    },
    {
      key: 'ledger',
      header: 'General ledger',
      align: 'right',
      render: (l) => <Amount value={l.ledgerBalance} currency={currency} />,
    },
    {
      key: 'variance',
      header: 'Variance',
      align: 'right',
      render: (l) =>
        Math.abs(l.variance) < 0.005 ? (
          <span className="font-mono text-gray-300">-</span>
        ) : (
          <Amount value={l.variance} currency={currency} colorBySign />
        ),
    },
    {
      key: 'variancePct',
      header: '% of ledger',
      align: 'right',
      render: (l) => <span className="font-mono text-gray-500">{formatPct(l.variancePercent, 3)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) =>
        Math.abs(l.variance) < 0.005 ? (
          <StatusBadge status="Agrees" tone="success" />
        ) : l.withinTolerance ? (
          <StatusBadge status="Plug required" tone="warning" />
        ) : (
          <StatusBadge status="Out of tolerance" tone="danger" />
        ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="GL Reconciliation"
        description="Instrument balances against the general ledger. Variances inside tolerance produce a plug to approve; anything outside blocks the period."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate selected'}
        currency={currency}
        metrics={[
          { label: 'Positions', value: String(positions.length), about: 'Instrument-level positions loaded for this affiliate and as-of date - one side of the reconciliation.' },
          { label: 'Ledger accounts', value: ledger ? String(ledger.length) : '-', about: 'Accounts in the uploaded trial balance - the other side of the reconciliation.' },
          {
            label: 'Out of tolerance',
            value: result ? String(result.linesOutOfTolerance) : '-',
            tone: result ? (result.linesOutOfTolerance > 0 ? 'danger' : 'success') : 'neutral',
            about: 'Accounts whose variance exceeds both the absolute and percentage tolerance - these block sign-off rather than being plugged.',
          },
          {
            label: 'Sign-off',
            value: signedOff ? 'Complete' : result ? (result.canSignOff ? 'Available' : 'Blocked') : '-',
            tone: signedOff ? 'success' : result?.canSignOff ? 'warning' : 'danger',
            about: 'Whether the period can be signed off - requires every line within tolerance and every suggested plug approved.',
          },
        ]}
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode} />

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Reconciliation basis</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="rec-asof" className="mb-1 block text-[11px] text-gray-600">
              As-of date
            </label>
            <input
              id="rec-asof"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </div>
          <div>
            <label htmlFor="rec-level" className="mb-1 block text-[11px] text-gray-600">
              Level
            </label>
            <select
              id="rec-level"
              value={level}
              onChange={(e) => setLevel(e.target.value as ReconciliationLevel)}
              className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            >
              <option value="GlAccount">GL account</option>
              <option value="GlAccountByOrgUnit">GL account within org unit</option>
            </select>
          </div>
          <div>
            <label htmlFor="rec-tol-amt" className="mb-1 block text-[11px] text-gray-600">
              Tolerance (amount)
            </label>
            <input
              id="rec-tol-amt"
              type="number"
              value={toleranceAmount}
              onChange={(e) => setToleranceAmount(Number(e.target.value))}
              className="w-28 rounded border border-gray-200 px-2 py-1.5 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </div>
          <div>
            <label htmlFor="rec-tol-pct" className="mb-1 block text-[11px] text-gray-600">
              Tolerance (%)
            </label>
            <input
              id="rec-tol-pct"
              type="number"
              step="0.1"
              value={tolerancePercent}
              onChange={(e) => setTolerancePercent(Number(e.target.value))}
              className="w-24 rounded border border-gray-200 px-2 py-1.5 text-right font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </div>
          <div>
            <label htmlFor="rec-file" className="mb-1 block text-[11px] text-gray-600">
              Trial balance (CSV, Excel, JSON or XML)
            </label>
            <input
              id="rec-file"
              ref={fileInput}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleLedgerFile(file);
              }}
              className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
            />
            {ledgerFileError && <p className="mt-1 max-w-xs text-[11px] text-red-700">{ledgerFileError}</p>}
            <button
              type="button"
              onClick={() => downloadCsvTemplate(LEDGER_TEMPLATE_COLUMNS, LEDGER_TEMPLATE_SAMPLE, 'gl_ledger_template.csv')}
              className="mt-1 block text-[10px] font-bold text-navy-700 hover:underline"
            >
              Download CSV template
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
          Both tolerances must pass. A variance small in absolute terms can still be large for the account it sits on,
          which is why the percentage limit exists alongside the amount.
        </p>
      </section>

      {!affiliate ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Select an affiliate</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Group scope has no single affiliate to default to. Pick one above to reconcile its book.
          </p>
        </section>
      ) : !ledger ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No trial balance loaded</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Upload the trial balance above to reconcile against {positions.length} position{positions.length === 1 ? '' : 's'}.
          </p>
        </section>
      ) : (
        result && (
          <>
            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Reconciliation - {ledgerName}
                  </h2>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Total variance{' '}
                    <span className="font-mono">
                      <Amount value={result.totalVariance} currency={currency} colorBySign />
                    </span>{' '}
                    across {result.lines.length} account{result.lines.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOff}
                  disabled={!canComplete || signedOff}
                  title={
                    !canSignOff
                      ? 'Your role does not have permission to sign off a reconciliation'
                      : !result.canSignOff
                        ? 'Resolve the out-of-tolerance lines first'
                        : !allPlugsApproved
                          ? 'Approve every suggested plug first'
                          : positionsBatchesForDate.length === 0
                            ? 'No committed Position Book batch for this affiliate and date to sign off'
                            : undefined
                  }
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  {signedOff ? 'Signed off' : 'Sign off period'}
                </button>
              </div>

              <TableToolbar
                searchValue={lineControls.search}
                onSearchChange={lineControls.setSearch}
                exportData={() => lineControls.filtered}
                exportFilename={`gl-reconciliation-${affiliate.code}-${asOfDate}`}
                density={lineControls.density}
                onDensityChange={lineControls.setDensity}
              />
              <ResultTable rows={lineControls.paged} columns={columns} rowKey={(l) => l.key} className="mt-4" />
              <TablePagination
                currentPage={lineControls.page}
                totalItems={lineControls.totalItems}
                pageSize={lineControls.pageSize}
                onPageChange={lineControls.setPage}
              />
            </section>

            {result.suggestedPlugs.length > 0 && (
              <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Suggested plug entries
                </h2>
                <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                  Proposals, not postings. Each needs approval before the period can be signed off, and each is recorded
                  against the approver.
                </p>
                <ul className="space-y-2">
                  {result.suggestedPlugs.map((p) => (
                    <li
                      key={p.key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-3"
                    >
                      <div>
                        <p className="font-mono text-[12px] font-bold text-navy-900">{p.glAccountCode}</p>
                        <p className="text-[11px] text-gray-500">{p.reason}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Amount value={p.amount} currency={currency} colorBySign />
                        <button
                          type="button"
                          onClick={() => togglePlug(p.key)}
                          disabled={!canSignOff}
                          className={
                            approvedPlugs.has(p.key)
                              ? 'rounded-lg bg-success px-3 py-1.5 text-[11px] font-bold text-white'
                              : 'rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40'
                          }
                        >
                          {approvedPlugs.has(p.key) ? 'Approved' : 'Approve plug'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!result.canSignOff && (
              <div role="alert" className="rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger">
                <span className="font-bold">Sign-off blocked.</span> {result.linesOutOfTolerance} line
                {result.linesOutOfTolerance === 1 ? '' : 's'} exceed tolerance. These go back to the affiliate rather
                than being plugged - that is the point of the control.
              </div>
            )}

            {signedOff && (
              <div role="status" className="rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
                <span className="font-bold">Period signed off.</span> Instrument data agrees with the ledger within
                tolerance, and every plug was approved.
              </div>
            )}
          </>
        )
      )}
    </>
  );
}
