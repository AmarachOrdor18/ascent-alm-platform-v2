/**
 * Upload → stage → validate → commit — extracted from `DataUpload.tsx` so
 * the exact same pipeline (staging, `validatePositions`, unmapped-code
 * detection, commit/supersede) runs both on the standalone Data Upload &
 * Staging screen and inline in the onboarding wizard's Step 7, instead of a
 * second implementation that could drift from the real validation rules.
 *
 * The caller owns which affiliate/domain/as-of date this instance is for —
 * this component only owns the upload/stage/validate/commit mechanics.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useBatches,
  useCommitBatch,
  useDeleteStagedBatch,
  useDimensionMembers,
  useSaveBatch,
  useSaveDimensionMembers,
  useStagedBatchFor,
  useSaveStagedBatch,
} from '@/lib/hooks';
import { importPositions, type RowError } from '@/lib/csvImport';
import { validatePositions, type ValidationResult } from '@/engine/validation';
import { planSupersede } from '@/engine/vintage';
import { deriveMembersFromFile, unmappedCodes } from '@/engine/dimensions';
import type { Affiliate, DataDomain, DimensionMember, DimensionType, LoadBatch, Position } from '@/engine/types';

/** Hash of the file content, so a re-upload of the same bytes is detectable. */
async function hashFile(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface Staged {
  batch: LoadBatch;
  positions: Position[];
  parseErrors: RowError[];
  ignoredColumns: string[];
}

export interface DataLoadPanelState {
  rowsStaged: number | null;
  parseErrors: number | null;
  validation: 'Blocked' | 'Passed' | null;
  balanceCheck: string | null;
}

export function DataLoadPanel({
  affiliate,
  domain,
  asOfDate,
  onCommitted,
  onStateChange,
}: {
  affiliate: Affiliate;
  domain: DataDomain;
  asOfDate: string;
  /** Fires once a batch actually commits — callers use this to advance a wizard step or refresh a status. */
  onCommitted?: (batch: LoadBatch) => void;
  /** Fires whenever the staged/validation state changes — lets a caller mirror it into its own header/metrics. */
  onStateChange?: (state: DataLoadPanelState) => void;
}) {
  const { hasPermission } = useAuth();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const saveBatch = useSaveBatch();
  const commit = useCommitBatch();
  const saveStagedBatch = useSaveStagedBatch();
  const deleteStagedBatch = useDeleteStagedBatch();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveCounterparties = useSaveDimensionMembers('Counterparty');
  const canUpload = hasPermission('data.configure');
  const fileInput = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<Staged | null>(null);
  const [supersedeReason, setSupersedeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);

  // Resume a previously saved staging session for this exact affiliate,
  // domain and as-of date — same reasoning as DataUpload.tsx: without this,
  // leaving the wizard mid-upload silently drops staged rows.
  const { data: resumable } = useStagedBatchFor(affiliate.code, domain, asOfDate);
  useEffect(() => {
    if (staged || !resumable) return;
    setStaged({ batch: resumable.batch, positions: resumable.positions, parseErrors: [], ignoredColumns: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resuming is a one-shot hydration, not a sync effect
  }, [resumable]);

  const validation: ValidationResult | null = useMemo(
    () =>
      staged
        ? validatePositions(staged.positions, {
            asOfDate,
            knownAffiliateCodes: affiliates.map((a) => a.code),
          })
        : null,
    [staged, asOfDate, affiliates],
  );

  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit');
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount');
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa');
  const { data: counterparties = [] } = useDimensionMembers('Counterparty');
  const knownMembers = useMemo(
    () => [...orgUnits, ...glAccounts, ...commonCoa, ...counterparties],
    [orgUnits, glAccounts, commonCoa, counterparties],
  );

  const unmapped = useMemo(() => {
    if (!staged) return [] as Array<{ dimension: string; codes: string[] }>;
    return (['OrgUnit', 'GlAccount', 'CommonCoa', 'Counterparty'] as const)
      .map((dimension) => ({ dimension, codes: unmappedCodes(staged.positions, dimension, knownMembers) }))
      .filter((x) => x.codes.length > 0);
  }, [staged, knownMembers]);

  const supersede = planSupersede(batches, affiliate.code, domain, asOfDate);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);
      const duplicate = batches.find((b) => b.fileHash === hash && b.status === 'Committed');
      const version = supersede?.nextVersion ?? 1;
      const result = importPositions(text, {
        affiliateCode: affiliate.code,
        asOfDate,
        batchId: `B-${affiliate.code}-${asOfDate}-v${version}`,
        defaultCurrency: affiliate.functionalCurrency,
        defaultLegalEntityCode: affiliate.legalEntityCode,
      });

      setStaged({
        batch: {
          id: `B-${affiliate.code}-${asOfDate}-v${version}`,
          affiliateCode: affiliate.code,
          domain,
          asOfDate,
          version,
          fileName: file.name,
          fileHash: hash,
          rowCount: result.rows.length + result.errors.length,
          rowsAccepted: result.rows.length,
          rowsRejected: result.errors.length,
          status: 'Staged',
          supersedesBatchId: null,
          supersededReason: duplicate ? `Identical file already committed as ${duplicate.id}` : null,
          uploadedBy: 'current-user',
          uploadedAt: new Date().toISOString(),
          committedBy: null,
          committedAt: null,
          reconciledBy: null,
          reconciledAt: null,
        },
        positions: result.rows,
        parseErrors: result.errors,
        ignoredColumns: result.ignoredColumns,
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const editRow = (id: string, patch: Partial<Position>) => {
    setStaged((prev) =>
      prev ? { ...prev, positions: prev.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : prev,
    );
  };

  const discardRow = (id: string) => {
    setStaged((prev) => (prev ? { ...prev, positions: prev.positions.filter((p) => p.id !== id) } : prev));
  };

  const handleCommit = () => {
    if (!staged || !validation || validation.blocked) return;
    commit.mutate(
      {
        batch: staged.batch,
        positions: staged.positions,
        supersedes: supersede?.superseded ?? null,
        reason: supersede?.superseded ? supersedeReason || null : null,
      },
      {
        onSuccess: () => {
          const committed = { ...staged.batch, status: 'Committed' as const };
          setStaged(null);
          onCommitted?.(committed);
        },
      },
    );
  };

  const handleSaveStaged = async () => {
    if (!staged) return;
    await saveBatch.mutateAsync(staged.batch);
    await saveStagedBatch.mutateAsync({
      id: staged.batch.id,
      affiliateCode: affiliate.code,
      domain,
      asOfDate,
      batch: staged.batch,
      positions: staged.positions,
      savedAt: new Date().toISOString(),
    });
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2500);
  };

  const handleDiscard = () => {
    if (staged) void deleteStagedBatch.mutateAsync(staged.batch.id);
    setStaged(null);
  };

  const autoMappable = unmapped.filter((u) => u.dimension !== 'CommonCoa');
  const dimensionSavers: Partial<Record<string, { mutateAsync: (m: DimensionMember[]) => Promise<void> }>> = {
    GlAccount: saveGlAccounts,
    OrgUnit: saveOrgUnits,
    Counterparty: saveCounterparties,
  };

  const handleAutoMap = async () => {
    if (!staged || autoMappable.length === 0) return;
    setAutoMapping(true);
    try {
      for (const { dimension, codes } of autoMappable) {
        const members = deriveMembersFromFile(
          dimension as DimensionType,
          codes,
          staged.positions,
          affiliate.code,
          affiliate.name,
        );
        await dimensionSavers[dimension]?.mutateAsync(members);
      }
    } finally {
      setAutoMapping(false);
    }
  };

  const totals = useMemo(() => {
    if (!staged) return null;
    const by = (c: string) => staged.positions.filter((p) => p.category === c).reduce((s, p) => s + p.amount, 0);
    const assets = by('Asset');
    const difference = assets - (by('Liability') + by('Capital'));
    return { assets, liabilities: by('Liability'), capital: by('Capital'), difference };
  }, [staged]);

  useEffect(() => {
    onStateChange?.({
      rowsStaged: staged ? staged.positions.length : null,
      parseErrors: staged ? staged.parseErrors.length : null,
      validation: validation ? (validation.blocked ? 'Blocked' : 'Passed') : null,
      balanceCheck: totals ? (Math.abs(totals.difference) < 0.01 ? 'Balances' : `Out by ${totals.difference.toFixed(0)}`) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStateChange is expected to be stable per caller; including it would re-fire on every parent render
  }, [staged, validation, totals]);

  const columns: ResultColumn<Position>[] = [
    { key: 'id', header: 'ID', render: (p) => <span className="font-mono text-[11px]">{p.id}</span> },
    { key: 'product', header: 'Product', render: (p) => <span className="text-navy-900">{p.productClass}</span> },
    {
      key: 'class',
      header: 'Class',
      render: (p) => <StatusBadge status={p.accountClass} tone={p.accountClass === 'Customer' ? 'info' : 'neutral'} />,
    },
    {
      key: 'gl',
      header: 'GL',
      render: (p) => <span className="font-mono text-[11px] text-gray-500">{p.glAccountCode}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (p) =>
        canUpload ? (
          <>
            <label htmlFor={`amt-${p.id}`} className="sr-only">
              Amount for {p.id}
            </label>
            <input
              id={`amt-${p.id}`}
              type="number"
              value={p.amount}
              onChange={(e) => editRow(p.id, { amount: Number(e.target.value) })}
              className="w-32 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </>
        ) : (
          <Amount value={p.amount} currency={p.currency} />
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) =>
        canUpload ? (
          <button
            type="button"
            onClick={() => discardRow(p.id)}
            className="text-[11px] font-bold text-danger hover:underline"
          >
            Discard
          </button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-100 bg-white p-4">
        <div>
          <label htmlFor={`up-file-${domain}`} className="mb-1 block text-[11px] text-gray-600">
            CSV file — {domain}
          </label>
          <input
            id={`up-file-${domain}`}
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={!canUpload || busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700"
          />
        </div>
        {busy && <span className="text-[12px] text-gray-400">Parsing…</span>}
        {!staged && !busy && (
          <span className="text-[11px] text-gray-400">As of {asOfDate} · {affiliate.name}</span>
        )}
      </div>

      {supersede?.superseded && !staged && (
        <div className="mb-4 rounded-lg bg-warning-bg px-4 py-3">
          <p className="text-[12px] text-warning">
            <span className="font-bold">This as-of date already has committed data.</span> Uploading creates version{' '}
            {supersede.nextVersion} and supersedes {supersede.superseded.id}.
          </p>
        </div>
      )}

      {staged && supersede?.superseded && (
        <div className="mb-4 rounded-lg bg-warning-bg px-4 py-3">
          <label htmlFor={`supersede-reason-${domain}`} className="mb-1 block text-[11px] font-bold text-warning">
            Reason for the reload (required)
          </label>
          <input
            id={`supersede-reason-${domain}`}
            value={supersedeReason}
            onChange={(e) => setSupersedeReason(e.target.value)}
            placeholder="Restated after month-end adjustments"
            className="w-full rounded border border-warning/30 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
          />
        </div>
      )}

      {staged && (
        <>
          {staged.ignoredColumns.length > 0 && (
            <div role="status" className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[12px] text-navy-900">
              <span className="font-bold">Columns not used:</span> {staged.ignoredColumns.join(', ')}.
            </div>
          )}

          {staged.parseErrors.length > 0 && (
            <section className="mb-4 rounded-2xl border border-danger/20 bg-danger-bg p-6">
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-danger">
                Parse errors ({staged.parseErrors.length})
              </h2>
              <ul className="space-y-1 text-[12px] text-gray-700">
                {staged.parseErrors.slice(0, 20).map((e, i) => (
                  <li key={`${e.line}-${e.column}-${i}`}>
                    <span className="font-mono">line {e.line}</span> · <span className="font-bold">{e.column}</span> —{' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {validation && validation.exceptions.length > 0 && (
            <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Validation exceptions ({validation.exceptions.length})
                </h2>
                <StatusBadge
                  status={validation.blocked ? 'Commit blocked' : 'Advisory only'}
                  tone={validation.blocked ? 'danger' : 'warning'}
                />
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="py-2 font-bold">Rule</th>
                    <th className="py-2 font-bold">Severity</th>
                    <th className="py-2 font-bold">Row</th>
                    <th className="py-2 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.exceptions.slice(0, 30).map((e, i) => (
                    <tr key={`${e.ruleId}-${e.positionId}-${i}`} className="border-b border-gray-100">
                      <td className="py-2 text-navy-900">{e.ruleName}</td>
                      <td className="py-2">
                        <StatusBadge
                          status={e.severity}
                          tone={e.severity === 'Critical' || e.severity === 'High' ? 'danger' : 'warning'}
                        />
                      </td>
                      <td className="py-2 font-mono text-[11px] text-gray-500">{e.positionId ?? '—'}</td>
                      <td className="py-2 text-gray-600">{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {unmapped.length > 0 && (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] text-navy-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="font-bold">Unmapped codes — must be created before commit:</span>
                {autoMappable.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleAutoMap()}
                    disabled={!canUpload || autoMapping}
                    className="shrink-0 rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    {autoMapping ? 'Mapping…' : 'Create these from the file'}
                  </button>
                )}
              </div>
              <ul className="mt-3 space-y-1">
                {unmapped.map((u) => (
                  <li key={u.dimension}>
                    <span className="font-bold">{u.dimension}</span>
                    {u.dimension === 'CommonCoa' && (
                      <span className="text-[11px] text-gray-500"> — fix in source file, not auto-created</span>
                    )}
                    <span className="ml-1 font-mono text-[11px]">{u.codes.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Staged rows — {staged.batch.fileName}
                </h2>
                <p className="mt-1 text-[11px] text-gray-500">
                  Version {staged.batch.version} · hash <span className="font-mono">{staged.batch.fileHash}</span> ·
                  editable until committed
                  {resumable && ' · resumed from a previous "Save as staged"'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                >
                  Discard batch
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveStaged()}
                  disabled={saveStagedBatch.isPending}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                >
                  {justSaved ? 'Saved ✓' : saveStagedBatch.isPending ? 'Saving…' : 'Save as staged'}
                </button>
                <button
                  type="button"
                  onClick={handleCommit}
                  disabled={
                    !canUpload ||
                    commit.isPending ||
                    validation?.blocked === true ||
                    unmapped.length > 0 ||
                    (supersede?.superseded !== null && supersede?.superseded !== undefined && !supersedeReason.trim())
                  }
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  title={validation?.blocked ? 'Resolve the blocking exceptions first' : undefined}
                >
                  {commit.isPending ? 'Committing…' : 'Commit batch'}
                </button>
              </div>
            </div>

            {totals && (
              <dl className="mb-4 grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assets</dt>
                  <dd>
                    <Amount value={totals.assets} currency={affiliate.functionalCurrency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Liabilities</dt>
                  <dd>
                    <Amount value={totals.liabilities} currency={affiliate.functionalCurrency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Capital</dt>
                  <dd>
                    <Amount value={totals.capital} currency={affiliate.functionalCurrency} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">A − (L + C)</dt>
                  <dd className={Math.abs(totals.difference) < 0.01 ? 'text-success' : 'text-danger'}>
                    <Amount value={totals.difference} currency={affiliate.functionalCurrency} />
                  </dd>
                </div>
              </dl>
            )}

            <ResultTable
              rows={staged.positions}
              columns={columns}
              rowKey={(p) => p.id}
              emptyMessage="Every row was discarded."
            />
          </section>
        </>
      )}

      {!staged && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No batch staged for {domain}</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Upload a file above to get started.
          </p>
        </section>
      )}
    </div>
  );
}
