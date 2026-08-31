import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
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
import { importCounterparties, importPositions, type RowError } from '@/lib/csvImport';
import { validatePositions, type ValidationResult } from '@/engine/validation';
import { planSupersede, ALL_CONTRIBUTORS } from '@/engine/vintage';
import { downloadPositionTemplate } from '@/lib/positionTemplates';
import { deriveMembersFromFile, unmappedCodes } from '@/engine/dimensions';
import { useConnectors } from '@/lib/connectorHooks';
import type { Affiliate, DataDomain, DimensionMember, DimensionType, LoadBatch, Position, PositionContributor } from '@/engine/types';

// Hash of the file content, so a re-upload of the same bytes is detectable.
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

interface StagedMembers {
  fileName: string;
  members: DimensionMember[];
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
  const { data: connectors = [] } = useConnectors();
  const saveBatch = useSaveBatch();
  const commit = useCommitBatch();
  const saveStagedBatch = useSaveStagedBatch();
  const deleteStagedBatch = useDeleteStagedBatch();
  const saveGlAccounts = useSaveDimensionMembers('GlAccount');
  const saveOrgUnits = useSaveDimensionMembers('OrgUnit');
  const saveCounterparties = useSaveDimensionMembers('Counterparty');
  const fileInput = useRef<HTMLInputElement>(null);

  // A connector is the authoritative feed for its domain once configured; manual upload is blocked to avoid silently overriding it.
  const feed = affiliate.feeds.find((f) => f.domain === domain);
  const feedConnector = feed?.mode === 'Connector' ? connectors.find((c) => c.id === feed.connectorId) : undefined;
  const uploadBlockedByConnector = feed?.mode === 'Connector';
  const canUpload = hasPermission('data.configure') && !uploadBlockedByConnector;

  // Which department this Positions upload represents — Loans, Deposits and Treasury each contribute an
  // independent slice of the same affiliate/date; the book is assembled from however many have submitted,
  // not received as one file. Irrelevant (and left unset) outside the Positions domain.
  const [contributor, setContributor] = useState<PositionContributor | ''>('');
  const [staged, setStaged] = useState<Staged | null>(null);
  const [supersedeReason, setSupersedeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [justCommitted, setJustCommitted] = useState<{ fileName: string; rowCount: number } | null>(null);

  // Counterparties is a flat dimension-member list, not a versioned/validated position batch — it gets its
  // own lightweight staging state rather than being forced through the position-shaped flow above.
  const [stagedMembers, setStagedMembers] = useState<StagedMembers | null>(null);
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersSaved, setMembersSaved] = useState<{ fileName: string; count: number } | null>(null);

  // Resume a previously saved staging session so leaving mid-upload doesn't silently drop staged rows.
  const { data: resumable } = useStagedBatchFor(affiliate.code, domain, asOfDate, contributor || undefined);
  useEffect(() => {
    if (staged || !resumable) return;
    setStaged({ batch: resumable.batch, positions: resumable.positions, parseErrors: [], ignoredColumns: [] });
    if (resumable.batch.contributor) setContributor(resumable.batch.contributor);
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

  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit', affiliate.code);
  const { data: glAccounts = [] } = useDimensionMembers('GlAccount', affiliate.code);
  const { data: commonCoa = [] } = useDimensionMembers('CommonCoa', affiliate.code);
  const { data: counterparties = [] } = useDimensionMembers('Counterparty', affiliate.code);
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

  const supersede = planSupersede(batches, affiliate.code, domain, asOfDate, contributor || undefined);

  const handleCounterpartyFile = async (file: File) => {
    setBusy(true);
    setMembersSaved(null);
    try {
      const text = await file.text();
      const result = importCounterparties(text, affiliate.code);
      setStagedMembers({
        fileName: file.name,
        members: result.rows,
        parseErrors: result.errors,
        ignoredColumns: result.ignoredColumns,
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleSaveMembers = async () => {
    if (!stagedMembers || stagedMembers.members.length === 0) return;
    setSavingMembers(true);
    try {
      await saveCounterparties.mutateAsync(stagedMembers.members);
      setMembersSaved({ fileName: stagedMembers.fileName, count: stagedMembers.members.length });
      setStagedMembers(null);
    } finally {
      setSavingMembers(false);
    }
  };

  const handleFile = async (file: File) => {
    if (domain === 'Counterparties') {
      await handleCounterpartyFile(file);
      return;
    }
    if (domain === 'Positions' && !contributor) return; // guarded by the disabled file input below too
    setBusy(true);
    setJustCommitted(null);
    try {
      const text = await file.text();
      const hash = await hashFile(text);
      const duplicate = batches.find(
        (b) => b.fileHash === hash && b.status === 'Committed' && b.contributor === (contributor || null),
      );
      const version = supersede?.nextVersion ?? 1;
      const idSuffix = domain === 'Positions' ? `${contributor}-${asOfDate}` : asOfDate;
      const batchId = `B-${affiliate.code}-${idSuffix}-v${version}`;
      const result = importPositions(text, {
        affiliateCode: affiliate.code,
        asOfDate,
        batchId,
        defaultCurrency: affiliate.functionalCurrency,
        defaultLegalEntityCode: affiliate.legalEntityCode,
      });

      setStaged({
        batch: {
          id: batchId,
          affiliateCode: affiliate.code,
          domain,
          contributor: domain === 'Positions' ? (contributor as PositionContributor) : null,
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
          setJustCommitted({ fileName: staged.batch.fileName, rowCount: staged.positions.length });
          setStaged(null);
          setContributor('');
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
    setContributor('');
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
    if (domain === 'Counterparties') {
      onStateChange?.({
        rowsStaged: stagedMembers ? stagedMembers.members.length : null,
        parseErrors: stagedMembers ? stagedMembers.parseErrors.length : null,
        validation: null,
        balanceCheck: null,
      });
      return;
    }
    onStateChange?.({
      rowsStaged: staged ? staged.positions.length : null,
      parseErrors: staged ? staged.parseErrors.length : null,
      validation: validation ? (validation.blocked ? 'Blocked' : 'Passed') : null,
      balanceCheck: totals ? (Math.abs(totals.difference) < 0.01 ? 'Balances' : `Out by ${totals.difference.toFixed(0)}`) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStateChange is expected to be stable per caller; including it would re-fire on every parent render
  }, [domain, staged, validation, totals, stagedMembers]);

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
      {uploadBlockedByConnector ? (
        <div className="mb-4 rounded-2xl border border-navy-100 bg-navy-50 p-4">
          <p className="text-[12px] font-bold text-navy-900">
            {domain} is fed by {feedConnector?.name ?? 'a configured connector'}, not manual upload
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-navy-900/80">
            This affiliate&rsquo;s connectivity configuration declares a connector as the authoritative source for
            this domain. Data is expected to arrive from it directly — uploading a file here would let it silently
            override what the connector delivers. To upload manually instead, switch this domain to File
            substitution in Connectivity (Step 3 of onboarding, or Connectors &amp; Data Sources).
          </p>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-2xl border border-gray-100 bg-white p-4">
          {domain === 'Positions' && (
            <div>
              <label htmlFor="up-contributor" className="mb-1 block text-[11px] text-gray-600">
                Contributing department
              </label>
              <select
                id="up-contributor"
                value={contributor}
                onChange={(e) => setContributor(e.target.value as PositionContributor | '')}
                disabled={!!staged}
                className="rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
              >
                <option value="">— select department —</option>
                {ALL_CONTRIBUTORS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {contributor && (
                <button
                  type="button"
                  onClick={() => downloadPositionTemplate(contributor)}
                  className="mt-1 block text-[10px] font-bold text-navy-700 hover:underline"
                >
                  Download {contributor} CSV template
                </button>
              )}
            </div>
          )}
          <div>
            <label htmlFor={`up-file-${domain}`} className="mb-1 block text-[11px] text-gray-600">
              CSV file — {domain}
            </label>
            <input
              id={`up-file-${domain}`}
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              disabled={!canUpload || busy || (domain === 'Positions' && !contributor)}
              title={domain === 'Positions' && !contributor ? 'Select the contributing department first' : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="text-[12px] file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white hover:file:bg-navy-700 disabled:opacity-50"
            />
          </div>
          {busy && <span className="text-[12px] text-gray-400">Parsing…</span>}
          {!staged && !busy && !justCommitted && (
            <span className="text-[11px] text-gray-400">As of {asOfDate} · {affiliate.name}</span>
          )}
        </div>
      )}

      {domain === 'Counterparties' ? (
        <>
          {membersSaved && !stagedMembers && (
            <div role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
              <span className="font-bold">✓ Saved.</span> {membersSaved.fileName} — {membersSaved.count} counterpart
              {membersSaved.count === 1 ? 'y' : 'ies'} registered.
            </div>
          )}

          {stagedMembers && (
            <>
              {stagedMembers.ignoredColumns.length > 0 && (
                <div role="status" className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[12px] text-navy-900">
                  <span className="font-bold">Columns not used:</span> {stagedMembers.ignoredColumns.join(', ')}.
                </div>
              )}

              {stagedMembers.parseErrors.length > 0 && (
                <section className="mb-4 rounded-2xl border border-danger/20 bg-danger-bg p-6">
                  <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-danger">
                    Parse errors ({stagedMembers.parseErrors.length})
                  </h2>
                  <ul className="space-y-1 text-[12px] text-gray-700">
                    {stagedMembers.parseErrors.slice(0, 20).map((e, i) => (
                      <li key={`${e.line}-${e.column}-${i}`}>
                        <span className="font-mono">line {e.line}</span> · <span className="font-bold">{e.column}</span> —{' '}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                      Parsed counterparties — {stagedMembers.fileName}
                    </h2>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {stagedMembers.members.length} row{stagedMembers.members.length === 1 ? '' : 's'} ready to register —
                      re-uploading a code already on file updates it rather than duplicating it.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStagedMembers(null)}
                      className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveMembers()}
                      disabled={!canUpload || savingMembers || stagedMembers.members.length === 0}
                      className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                    >
                      {savingMembers ? 'Saving…' : `Register ${stagedMembers.members.length} counterpart${stagedMembers.members.length === 1 ? 'y' : 'ies'}`}
                    </button>
                  </div>
                </div>

                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 px-3 font-bold">Code</th>
                      <th className="py-2 px-3 font-bold">Name</th>
                      <th className="py-2 px-3 font-bold">Sector</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedMembers.members.slice(0, 200).map((m) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{m.code}</td>
                        <td className="py-2 px-3 text-navy-900">{m.name}</td>
                        <td className="py-2 px-3 text-gray-600">{String(m.attributes?.sector ?? '—')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stagedMembers.members.length > 200 && (
                  <p className="mt-2 text-[11px] text-gray-400">
                    Showing the first 200 of {stagedMembers.members.length} rows.
                  </p>
                )}
              </section>
            </>
          )}

          {!stagedMembers && !membersSaved && !uploadBlockedByConnector && (
            <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-[13px] font-bold text-navy-900">No file staged for Counterparties</p>
              <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
                Upload a CSV above, or register one at a time from the Counterparty Register screen.
              </p>
            </section>
          )}
        </>
      ) : (
        <>
      {justCommitted && !staged && (
        <div role="status" className="mb-4 rounded-lg bg-success-bg px-4 py-3 text-[12px] text-success">
          <span className="font-bold">✓ Committed.</span> {justCommitted.fileName} — {justCommitted.rowCount} row{justCommitted.rowCount === 1 ? '' : 's'} for {domain}.
        </div>
      )}

      {supersede?.superseded && !staged && (
        <div className="mb-4 rounded-lg bg-warning-bg px-4 py-3">
          <p className="text-[12px] text-warning">
            <span className="font-bold">
              {contributor ? `${contributor} already has committed data for this date.` : 'This as-of date already has committed data.'}
            </span>{' '}
            Uploading creates version {supersede.nextVersion} and supersedes {supersede.superseded.id}
            {contributor ? ` — only ${contributor}'s prior submission, not other departments'.` : '.'}
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
                    <th className="py-2 px-3 font-bold">Rule</th>
                    <th className="py-2 px-3 font-bold">Severity</th>
                    <th className="py-2 px-3 font-bold">Row</th>
                    <th className="py-2 px-3 font-bold">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.exceptions.slice(0, 30).map((e, i) => (
                    <tr key={`${e.ruleId}-${e.positionId}-${i}`} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-navy-900">{e.ruleName}</td>
                      <td className="py-2 px-3">
                        <StatusBadge
                          status={e.severity}
                          tone={e.severity === 'Critical' || e.severity === 'High' ? 'danger' : 'warning'}
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{e.positionId ?? '—'}</td>
                      <td className="py-2 px-3 text-gray-600">{e.description}</td>
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
                  {staged.batch.contributor && <span className="ml-2 font-normal text-gray-400">({staged.batch.contributor})</span>}
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
              <div className="mb-4">
                <dl className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4">
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
                    <dd className={domain === 'Positions' ? 'text-gray-500' : Math.abs(totals.difference) < 0.01 ? 'text-success' : 'text-danger'}>
                      <Amount value={totals.difference} currency={affiliate.functionalCurrency} />
                    </dd>
                  </div>
                </dl>
                {domain === 'Positions' && (
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    This is {contributor || 'this department'}&rsquo;s contribution only — a single department&rsquo;s
                    slice is not expected to balance on its own. The combined book, once every department has
                    submitted, is checked against the general ledger in{' '}
                    <Link href="/data/operations/gl-reconciliation" className="font-bold text-navy-700 hover:underline">
                      GL Reconciliation
                    </Link>
                    , not here.
                  </p>
                )}
              </div>
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

      {!staged && !justCommitted && !uploadBlockedByConnector && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No batch staged for {domain}</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            Upload a file above to get started.
          </p>
        </section>
      )}
        </>
      )}
    </div>
  );
}
