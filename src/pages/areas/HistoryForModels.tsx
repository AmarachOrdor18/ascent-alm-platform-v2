import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DownloadIcon } from '@/components/icons/Icons';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates } from '@/lib/hooks';
import { accessibleAffiliates } from '@/lib/scope';
import { readUploadAsCsvText, UPLOAD_ACCEPT } from '@/lib/fileImport';
import {
  ACCOUNT_HISTORY_COLUMNS,
  BALANCE_HISTORY_COLUMNS,
  importAccountHistory,
  importBalanceHistory,
} from '@/lib/historyImport';
import {
  accountCoverage,
  accountRowId,
  balanceCoverage,
  balanceRowId,
  countReplacements,
  summariseUploads,
  type AccountPoolCoverage,
  type HistoryKind,
  type HistoryUploadSummary,
  type SegmentCoverage,
} from '@/lib/modelRegistry';
import { useAcceptHistoryUpload, useAccountHistory, useBalanceHistory, useDeleteHistoryUpload } from '@/lib/modelHooks';
import { formatAmount } from '@/lib/format';
import { MIN_MONTHLY_POINTS, type AccountObservation, type BalanceObservation } from '@/engine/behaviouralModels';
import type { RowError } from '@/lib/csvImport';

const COLUMN_HELP: Record<HistoryKind, Array<{ column: string; required: boolean; meaning: string }>> = {
  Balance: [
    {
      column: 'affiliateCode',
      required: false,
      meaning: 'Affiliate the balance belongs to. Optional - blank rows take the affiliate selected above.',
    },
    {
      column: 'asOfDate',
      required: true,
      meaning: 'Observation date, YYYY-MM-DD. Use month-end; if a month has several dates the latest one is used.',
    },
    {
      column: 'productCode',
      required: true,
      meaning: 'Your product code, e.g. the savings or current-account product.',
    },
    { column: 'customerType', required: false, meaning: 'Optional segment, e.g. Retail / SME / Corporate.' },
    { column: 'currency', required: true, meaning: 'Three-letter currency code. One segment cannot mix currencies.' },
    { column: 'tenorBand', required: false, meaning: 'Optional segment for term products.' },
    {
      column: 'balance',
      required: true,
      meaning: 'Total balance for the segment on that date. Negative liability exports are read as magnitudes.',
    },
    {
      column: 'ratePercent',
      required: false,
      meaning: 'Balance-weighted customer rate in percent (e.g. 4.25). Needed for a repricing beta.',
    },
    { column: 'accountCount', required: false, meaning: 'Number of accounts in the segment - informational.' },
  ],
  Account: [
    {
      column: 'affiliateCode',
      required: false,
      meaning: 'Affiliate the account belongs to. Optional - blank rows take the affiliate selected above.',
    },
    {
      column: 'accountNumber',
      required: true,
      meaning: 'Account identifier, the same on every snapshot of the account.',
    },
    {
      column: 'asOfDate',
      required: true,
      meaning: 'Snapshot date, YYYY-MM-DD - one snapshot per account per month-end.',
    },
    { column: 'productCode', required: true, meaning: 'Your product code.' },
    { column: 'currency', required: true, meaning: 'Three-letter currency code.' },
    { column: 'balance', required: true, meaning: 'Outstanding balance on the snapshot date.' },
    {
      column: 'maturityDate',
      required: false,
      meaning: 'Contractual maturity. Needed for term-deposit renewal and early-withdrawal.',
    },
    {
      column: 'scheduledBalance',
      required: false,
      meaning:
        'Loans: the balance the amortisation schedule expects on this date with no prepayment. Needed for prepayment.',
    },
    {
      column: 'rolledOver',
      required: false,
      meaning:
        'Term deposits: yes/no - rolled over at its most recent maturity. Inferred from later snapshots when blank.',
    },
    {
      column: 'withdrawnEarly',
      required: false,
      meaning:
        'Term deposits: yes/no - closed before contractual maturity. Inferred from the account disappearing when blank.',
    },
  ],
};

function downloadHeaderOnly(columns: readonly string[], filename: string) {
  const blob = new Blob([`${columns.join(',')}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Parsed {
  fileName: string;
  kind: HistoryKind;
  rows: BalanceObservation[] | AccountObservation[];
  errors: RowError[];
  ignoredColumns: string[];
  replacements: number;
}

const selectCls =
  'rounded border border-gray-200 px-2 py-1.5 text-[13px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none';

export function HistoryForModels() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (affiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, affiliateCode));
  const [kind, setKind] = useState<HistoryKind>('Balance');
  const canUpload = hasPermission('data.upload') || hasPermission('data.configure');

  const { data: balanceRows = [] } = useBalanceHistory(affiliate?.code);
  const { data: accountRows = [] } = useAccountHistory(affiliate?.code);
  const accept = useAcceptHistoryUpload();
  const remove = useDeleteHistoryUpload();

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const stored = kind === 'Balance' ? balanceRows : accountRows;
  const uploads = useMemo(() => summariseUploads(stored), [stored]);
  const balanceCov = useMemo(() => balanceCoverage(balanceRows, ['productCode', 'currency']), [balanceRows]);
  const accountCov = useMemo(() => accountCoverage(accountRows), [accountRows]);
  const usableSegments =
    kind === 'Balance' ? balanceCov.segments.filter((s) => s.usable).length : accountCov.filter((s) => s.usable).length;

  const handleFile = async (file: File) => {
    if (!affiliate) return;
    setFileError(null);
    setNotice(null);
    setBusy(true);
    try {
      const text = await readUploadAsCsvText(file);
      const ctx = { defaultAffiliateCode: affiliate.code };
      const result = kind === 'Balance' ? importBalanceHistory(text, ctx) : importAccountHistory(text, ctx);
      // A file may carry an affiliateCode column - rows for another affiliate are refused, not silently filed here.
      const errors = [...result.errors];
      const rows = (result.rows as Array<BalanceObservation | AccountObservation>).filter((r) => {
        if (r.affiliateCode === affiliate.code) return true;
        const what = 'accountNumber' in r ? `account ${r.accountNumber}` : `product ${r.productCode}`;
        errors.push({
          line: 0,
          column: 'affiliateCode',
          message: `Row for ${what} on ${r.asOfDate} is for affiliate ${r.affiliateCode}, not ${affiliate.code} - upload it with that affiliate selected`,
        });
        return false;
      });
      errors.sort((a, b) => a.line - b.line);
      const ids =
        kind === 'Balance'
          ? (rows as BalanceObservation[]).map(balanceRowId)
          : (rows as AccountObservation[]).map(accountRowId);
      setParsed({
        fileName: file.name,
        kind,
        rows: rows as BalanceObservation[] | AccountObservation[],
        errors,
        ignoredColumns: result.ignoredColumns,
        replacements: countReplacements(ids, stored),
      });
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!parsed || !affiliate || parsed.rows.length === 0) return;
    await accept.mutateAsync({
      kind: parsed.kind,
      affiliateCode: affiliate.code,
      fileName: parsed.fileName,
      rows: parsed.rows,
    });
    setNotice(
      `${parsed.rows.length} row(s) from ${parsed.fileName} stored for ${affiliate.name}` +
        (parsed.replacements > 0 ? `, ${parsed.replacements} of them replacing rows from earlier uploads` : '') +
        (parsed.errors.length > 0
          ? `. ${parsed.errors.length} row error(s) were not loaded - fix and re-upload those rows.`
          : '.'),
    );
    setParsed(null);
  };

  const uploadColumns: ResultColumn<HistoryUploadSummary>[] = [
    { key: 'file', header: 'File', render: (u) => <span className="font-bold">{u.fileName}</span> },
    {
      key: 'rows',
      header: 'Rows held',
      align: 'right',
      render: (u) => u.rows.toLocaleString(),
      sortValue: (u) => u.rows,
    },
    { key: 'dates', header: 'Dates', render: (u) => `${u.firstDate} to ${u.lastDate}` },
    { key: 'by', header: 'Uploaded by', render: (u) => u.uploadedBy },
    {
      key: 'at',
      header: 'Uploaded at',
      render: (u) => new Date(u.uploadedAt).toLocaleString(),
      sortValue: (u) => u.uploadedAt,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) =>
        !canUpload ? null : confirmDelete === u.uploadId ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-[12px] text-gray-500">Delete {u.rows} row(s)?</span>
            <button
              type="button"
              onClick={async () => {
                if (!affiliate) return;
                const n = await remove.mutateAsync({
                  kind,
                  affiliateCode: affiliate.code,
                  uploadId: u.uploadId,
                  fileName: u.fileName,
                });
                setConfirmDelete(null);
                setNotice(`Deleted ${n} row(s) from ${u.fileName}.`);
              }}
              className="rounded bg-danger px-2 py-1 text-[12px] font-bold text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="text-[12px] font-bold text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(u.uploadId)}
            className="text-[12px] font-bold text-danger hover:underline"
          >
            Delete upload
          </button>
        ),
    },
  ];

  const usableBadge = (usable: boolean, months: number) =>
    usable ? (
      <StatusBadge status="Usable" tone="success" />
    ) : (
      <span title={`${MIN_MONTHLY_POINTS - months} more month(s) needed`}>
        <StatusBadge status={`Needs ${MIN_MONTHLY_POINTS - months} more month(s)`} tone="warning" />
      </span>
    );

  const balanceColumns: ResultColumn<SegmentCoverage>[] = [
    {
      key: 'seg',
      header: 'Segment',
      render: (s) => <span className="font-bold">{s.label}</span>,
      sortValue: (s) => s.label,
    },
    { key: 'months', header: 'Months covered', align: 'right', render: (s) => s.months, sortValue: (s) => s.months },
    { key: 'first', header: 'First month', render: (s) => s.firstMonth },
    { key: 'last', header: 'Last month', render: (s) => s.lastMonth },
    {
      key: 'gaps',
      header: 'Gaps',
      render: (s) =>
        s.gaps.length === 0 ? (
          'None'
        ) : (
          <span className="text-warning" title={s.gaps.join(', ')}>
            {s.gaps.length} missing ({s.gaps.slice(0, 3).join(', ')}
            {s.gaps.length > 3 ? '…' : ''})
          </span>
        ),
      sortValue: (s) => s.gaps.length,
    },
    {
      key: 'rated',
      header: 'Months with a rate',
      align: 'right',
      render: (s) => s.ratedMonths,
      sortValue: (s) => s.ratedMonths,
    },
    {
      key: 'bal',
      header: 'Latest balance',
      align: 'right',
      render: (s) => formatAmount(s.latestBalance, s.currency),
      sortValue: (s) => s.latestBalance,
    },
    {
      key: 'usable',
      header: 'Usable for fitting',
      render: (s) => usableBadge(s.usable, s.months),
      sortValue: (s) => (s.usable ? 1 : 0),
    },
  ];

  const accountColumns: ResultColumn<AccountPoolCoverage>[] = [
    {
      key: 'seg',
      header: 'Product · currency',
      render: (s) => <span className="font-bold">{s.label}</span>,
      sortValue: (s) => s.label,
    },
    {
      key: 'accounts',
      header: 'Accounts',
      align: 'right',
      render: (s) => s.accounts.toLocaleString(),
      sortValue: (s) => s.accounts,
    },
    { key: 'months', header: 'Months covered', align: 'right', render: (s) => s.months, sortValue: (s) => s.months },
    { key: 'first', header: 'First month', render: (s) => s.firstMonth },
    { key: 'last', header: 'Last month', render: (s) => s.lastMonth },
    {
      key: 'gaps',
      header: 'Gaps',
      render: (s) =>
        s.gaps.length === 0 ? (
          'None'
        ) : (
          <span className="text-warning" title={s.gaps.join(', ')}>
            {s.gaps.length} missing
          </span>
        ),
    },
    {
      key: 'sched',
      header: 'Rows with scheduled balance',
      align: 'right',
      render: (s) => s.withScheduledBalance.toLocaleString(),
    },
    { key: 'mat', header: 'Rows with maturity', align: 'right', render: (s) => s.withMaturity.toLocaleString() },
    {
      key: 'usable',
      header: 'Usable for fitting',
      render: (s) => usableBadge(s.usable, s.months),
      sortValue: (s) => (s.usable ? 1 : 0),
    },
  ];

  const columns = kind === 'Balance' ? BALANCE_HISTORY_COLUMNS : ACCOUNT_HISTORY_COLUMNS;

  return (
    <>
      <ModuleHeader
        title="History for models"
        description="Upload your own monthly history so behavioural models can be fitted to how your customers actually behave. Nothing here feeds a run directly - fitted models go through Assumptions → Behavioural models and maker-checker approval first."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          {
            label: 'Balance history rows',
            value: balanceRows.length.toLocaleString(),
            about: 'Aggregate month-end balances stored for this affiliate.',
          },
          {
            label: 'Account history rows',
            value: accountRows.length.toLocaleString(),
            about: 'Account-level snapshots stored for this affiliate.',
          },
          {
            label: 'Usable segments',
            value: String(usableSegments),
            tone: usableSegments > 0 ? 'success' : 'neutral',
            about: `Segments (of the history type selected) with at least ${MIN_MONTHLY_POINTS} months - the minimum any model accepts.`,
          },
          {
            label: 'Uploads',
            value: String(uploads.length),
            about: 'Distinct files still holding rows for the selected history type.',
          },
        ]}
      />

      <AffiliateSelector
        affiliates={affiliates}
        value={affiliate?.code}
        onChange={(c) => {
          setPickedCode(c);
          setParsed(null);
          setNotice(null);
        }}
      >
        <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
        <label htmlFor="hist-kind" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          History type
        </label>
        <select
          id="hist-kind"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as HistoryKind);
            setParsed(null);
            setNotice(null);
          }}
          className={selectCls}
        >
          <option value="Balance">Balance history</option>
          <option value="Account">Account history</option>
        </select>
      </AffiliateSelector>

      {!affiliate ? (
        <EmptyState title="No affiliate selected">Pick the affiliate whose history you are uploading.</EmptyState>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div
              className={`rounded-2xl border bg-white p-5 shadow-sm ${kind === 'Balance' ? 'border-navy-700' : 'border-gray-100'}`}
            >
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Balance history</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                One row per product (and optionally customer type / tenor band) per month-end: the total balance, and
                ideally the average customer rate. Used to fit <strong>deposit stability & run-off</strong> (how much is
                core, how fast the rest leaves) and <strong>repricing beta</strong> (how much of a policy-rate move you
                pass on). At least {MIN_MONTHLY_POINTS} consecutive month-ends per segment; 24-36 is better.
              </p>
            </div>
            <div
              className={`rounded-2xl border bg-white p-5 shadow-sm ${kind === 'Account' ? 'border-navy-700' : 'border-gray-100'}`}
            >
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Account history</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                One row per account per month-end snapshot. For loans include the <strong>scheduled balance</strong> so
                prepayment can be separated from normal amortisation. For term deposits include the{' '}
                <strong>maturity date</strong> (and the rolled-over / withdrawn-early flags if your system records them)
                to measure <strong>renewal and early withdrawal</strong>. At least {MIN_MONTHLY_POINTS} monthly
                snapshots.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
                Upload {kind === 'Balance' ? 'balance' : 'account'} history
                <InfoButton label="How uploads combine">
                  Each row is keyed by its natural key (
                  {kind === 'Balance'
                    ? 'affiliate, date, product, customer type, currency, tenor band'
                    : 'affiliate, account, date'}
                  ). Uploading the same key again replaces the earlier row, so a corrected file can simply be
                  re-uploaded. Rows with any error are not loaded at all - a fitted model must never rest on a defaulted
                  value.
                </InfoButton>
              </h2>
              <button
                type="button"
                onClick={() =>
                  downloadHeaderOnly(
                    columns,
                    kind === 'Balance' ? 'balance_history_template.csv' : 'account_history_template.csv',
                  )
                }
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-700 hover:bg-gray-50"
              >
                Download template (CSV)
              </button>
            </div>

            {!canUpload ? (
              <p className="rounded-lg bg-gray-50 px-4 py-3 text-[13px] text-gray-600">
                You can view history here, but uploading needs the data-configuration permission. Ask an administrator
                or data team member.
              </p>
            ) : (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!busy) setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file && !busy) void handleFile(file);
                  }}
                  className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
                    dragActive ? 'border-navy-700 bg-navy-50' : 'border-gray-200 bg-gray-50/50 hover:border-navy-300'
                  }`}
                >
                  <DownloadIcon className="mb-2 h-6 w-6 rotate-180 text-gray-400" aria-hidden="true" />
                  <p className="text-[13px] font-bold text-navy-900">
                    {busy ? (
                      'Reading file…'
                    ) : (
                      <>
                        Drag a file here, or{' '}
                        <label
                          htmlFor="hist-file"
                          className="cursor-pointer text-navy-700 underline hover:text-navy-900"
                        >
                          browse
                        </label>
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    CSV, Excel, JSON or XML - {kind === 'Balance' ? 'balance' : 'account'} history for {affiliate.name}
                  </p>
                  <input
                    id="hist-file"
                    type="file"
                    accept={UPLOAD_ACCEPT}
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFile(file);
                      e.target.value = '';
                    }}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
                {fileError && <p className="mt-2 text-[12px] text-danger">{fileError}</p>}
              </>
            )}

            {notice && (
              <p role="status" className="mt-3 rounded-lg bg-success-bg px-4 py-2.5 text-[13px] text-success">
                {notice}
              </p>
            )}

            {parsed && (
              <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="font-bold text-navy-900">{parsed.fileName}</span>
                  <StatusBadge
                    status={`${parsed.rows.length} row(s) ready`}
                    tone={parsed.rows.length > 0 ? 'success' : 'neutral'}
                  />
                  <StatusBadge
                    status={`${parsed.errors.length} error(s)`}
                    tone={parsed.errors.length > 0 ? 'danger' : 'success'}
                  />
                  {parsed.replacements > 0 && (
                    <StatusBadge status={`${parsed.replacements} replace earlier rows`} tone="warning" />
                  )}
                  {parsed.ignoredColumns.length > 0 && (
                    <span className="text-[12px] text-gray-500">
                      Ignored columns: {parsed.ignoredColumns.join(', ')}
                    </span>
                  )}
                </div>
                {parsed.errors.length > 0 && (
                  <div className="max-h-72 overflow-auto rounded-lg border border-danger/20">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-danger-bg">
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-danger">
                            Line
                          </th>
                          <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-danger">
                            Column
                          </th>
                          <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-danger">
                            Problem
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.errors.slice(0, 500).map((e, i) => (
                          <tr key={`${e.line}-${e.column}-${i}`} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 font-mono text-[12px]">{e.line > 0 ? e.line : '-'}</td>
                            <td className="px-3 py-1.5 font-mono text-[12px]">{e.column || '-'}</td>
                            <td className="px-3 py-1.5 text-[12px] text-gray-700">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsed.errors.length > 500 && (
                      <p className="px-3 py-2 text-[12px] text-gray-500">
                        Showing the first 500 of {parsed.errors.length} errors.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={parsed.rows.length === 0 || accept.isPending}
                    onClick={() => void handleAccept()}
                    className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {accept.isPending ? 'Storing…' : `Accept ${parsed.rows.length} valid row(s)`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setParsed(null)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-bold text-gray-600 hover:bg-gray-50"
                  >
                    Discard
                  </button>
                  {parsed.errors.length > 0 && parsed.rows.length > 0 && (
                    <span className="text-[12px] text-gray-500">
                      Rows with errors are left out; fix them in the file and upload again.
                    </span>
                  )}
                </div>
              </div>
            )}

            <details className="mt-5">
              <summary className="cursor-pointer text-[12px] font-bold text-navy-700">Column reference</summary>
              <table className="mt-2 w-full">
                <tbody>
                  {COLUMN_HELP[kind].map((c) => (
                    <tr key={c.column} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono text-[12px] text-navy-900">{c.column}</td>
                      <td className="px-3 py-1.5 text-[12px]">
                        {c.required ? (
                          <StatusBadge status="Required" tone="info" />
                        ) : (
                          <span className="text-gray-400">Optional</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-gray-600">{c.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-1 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
              Coverage
              <InfoButton label="About coverage">
                Month-ends held per segment. A segment needs at least {MIN_MONTHLY_POINTS} months to be fitted; gaps are
                never filled in, and run-off and beta models only use consecutive months.{' '}
                {kind === 'Balance' &&
                  'Shown here by product and currency; the workbench lets you segment by customer type or tenor band too.'}
              </InfoButton>
            </h2>
            <p className="mb-4 text-[12px] text-gray-500">
              When a segment is usable, fit it in{' '}
              <Link href="/assumptions" className="font-bold text-navy-700 hover:underline">
                Assumptions → Behavioural models
              </Link>
              .
            </p>
            {kind === 'Balance' ? (
              balanceCov.error ? (
                <p className="text-[13px] text-danger">{balanceCov.error}</p>
              ) : (
                <ResultTable
                  rows={balanceCov.segments}
                  columns={balanceColumns}
                  rowKey={(s) => s.segmentId}
                  emptyMessage="No balance history uploaded for this affiliate yet."
                />
              )
            ) : (
              <ResultTable
                rows={accountCov}
                columns={accountColumns}
                rowKey={(s) => s.segmentId}
                emptyMessage="No account history uploaded for this affiliate yet."
              />
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-widest text-navy-900">Uploads</h2>
            <ResultTable
              rows={uploads}
              columns={uploadColumns}
              rowKey={(u) => u.uploadId}
              emptyMessage="Nothing uploaded yet for this history type."
            />
          </section>
        </div>
      )}
    </>
  );
}
