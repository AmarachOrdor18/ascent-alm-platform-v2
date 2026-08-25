/**
 * Data Upload & Staging — screen 6.
 *
 * The pipeline is: upload → stage → edit → validate → commit. Staged rows
 * are freely editable; committed rows are not. That distinction is the whole
 * point — after commit the only ways to change data are a new version with a
 * stated reason, or a reasoned adjustment. Nothing is ever silently edited.
 */

import { useMemo, useRef, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { GroupScopeNotice } from '@/components/layout/GroupScopeNotice';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates, useBatches, useCommitBatch, useSaveBatch } from '@/lib/hooks';
import { importPositions, type RowError } from '@/lib/csvImport';
import { validatePositions, DEFAULT_VALIDATION_RULES, type ValidationResult } from '@/engine/validation';
import { planSupersede } from '@/engine/vintage';
import { unmappedCodes } from '@/engine/dimensions';
import { ALL_DIMENSION_MEMBERS } from '@/data/seed/reference';
import { ALL_AFFILIATE_REFERENCE } from '@/data/seed/affiliateReference';
import { formatDate } from '@/lib/format';
import type { DataDomain, LoadBatch, Position } from '@/engine/types';

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

export function DataUpload() {
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const saveBatch = useSaveBatch();
  const commit = useCommitBatch();
  const canUpload = hasPermission('data.configure');
  const fileInput = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<Staged | null>(null);
  const [asOfDate, setAsOfDate] = useState('2026-07-31');
  const [domain, setDomain] = useState<DataDomain>('Positions');
  const [supersedeReason, setSupersedeReason] = useState('');
  const [busy, setBusy] = useState(false);

  const affiliate = resolveSingleAffiliate(affiliates, affiliateCode);

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

  // Static seed constants, not the live store: this check runs against
  // whatever a staged file references before anything is committed. Merged
  // with the 33-affiliate reference set so a newly onboarded affiliate's org
  // units and counterparties are recognised, not just the original three.
  const knownMembers = useMemo(() => [...ALL_DIMENSION_MEMBERS, ...ALL_AFFILIATE_REFERENCE], []);

  const unmapped = useMemo(() => {
    if (!staged) return [] as Array<{ dimension: string; codes: string[] }>;
    return (['OrgUnit', 'GlAccount', 'CommonCoa', 'Counterparty'] as const)
      .map((dimension) => ({ dimension, codes: unmappedCodes(staged.positions, dimension, knownMembers) }))
      .filter((x) => x.codes.length > 0);
  }, [staged, knownMembers]);

  const supersede = affiliate ? planSupersede(batches, affiliate.code, domain, asOfDate) : null;

  const handleFile = async (file: File) => {
    if (!affiliate) return;
    setBusy(true);
    try {
      const text = await file.text();
      const hash = await hashFile(text);

      // A re-upload of identical bytes is almost always a mistake.
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

  /** Staged rows are editable. This is the only point at which they are. */
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
      { onSuccess: () => setStaged(null) },
    );
  };

  const totals = useMemo(() => {
    if (!staged) return null;
    const by = (c: string) => staged.positions.filter((p) => p.category === c).reduce((s, p) => s + p.amount, 0);
    const assets = by('Asset');
    const difference = assets - (by('Liability') + by('Capital'));
    return { assets, liabilities: by('Liability'), capital: by('Capital'), difference };
  }, [staged]);

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
    <>
      <ModuleHeader
        title="Data Upload & Staging"
        description="Upload, stage, correct, validate, commit. Staged rows are editable; committed rows are not — after commit the only routes are a new version or a reasoned adjustment."
        asOfDate={asOfDate}
        scope={affiliate?.name ?? 'No affiliate selected'}
        currency={affiliate?.functionalCurrency}
        metrics={[
          { label: 'Rows staged', value: staged ? String(staged.positions.length) : '—' },
          {
            label: 'Parse errors',
            value: staged ? String(staged.parseErrors.length) : '—',
            tone: staged && staged.parseErrors.length > 0 ? 'danger' : 'neutral',
          },
          {
            label: 'Validation',
            value: validation ? (validation.blocked ? 'Blocked' : 'Passed') : '—',
            tone: validation ? (validation.blocked ? 'danger' : 'success') : 'neutral',
          },
          {
            label: 'Balance check',
            value: totals
              ? Math.abs(totals.difference) < 0.01
                ? 'Balances'
                : 'Out by ' + totals.difference.toFixed(0)
              : '—',
            tone: totals ? (Math.abs(totals.difference) < 0.01 ? 'success' : 'danger') : 'neutral',
          },
        ]}
      />

      {affiliateCode === 'GROUP' && <GroupScopeNotice fallbackName={affiliate?.name} />}

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Upload</h2>
        <div className="flex flex-wrap items-end gap-4">
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
          <div>
            <label htmlFor="up-file" className="mb-1 block text-[11px] text-gray-600">
              CSV file
            </label>
            <input
              id="up-file"
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
        </div>

        {supersede?.superseded && (
          <div className="mt-4 rounded-lg bg-warning-bg px-4 py-3">
            <p className="mb-2 text-[12px] text-warning">
              <span className="font-bold">This as-of date already has committed data.</span> Uploading creates version{' '}
              {supersede.nextVersion} and supersedes {supersede.superseded.id}. The previous version is retained, and
              any run that used it still shows what it computed.
            </p>
            <label htmlFor="supersede-reason" className="mb-1 block text-[11px] font-bold text-warning">
              Reason for the reload (required)
            </label>
            <input
              id="supersede-reason"
              value={supersedeReason}
              onChange={(e) => setSupersedeReason(e.target.value)}
              placeholder="Restated after month-end adjustments"
              className="w-full rounded border border-warning/30 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          </div>
        )}
      </section>

      {staged && (
        <>
          {staged.ignoredColumns.length > 0 && (
            <div role="status" className="mb-4 rounded-lg bg-navy-50 px-4 py-3 text-[12px] text-navy-900">
              <span className="font-bold">Columns not used:</span> {staged.ignoredColumns.join(', ')}. These were
              ignored rather than rejected — if one should map to a field, that is a mapping gap worth closing.
            </div>
          )}

          {staged.parseErrors.length > 0 && (
            <section className="mb-6 rounded-2xl border border-danger/20 bg-danger-bg p-6">
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
            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
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
            <div role="alert" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] text-danger">
              <span className="font-bold">Unmapped dimension codes.</span> These must exist before the batch can be
              committed, otherwise the positions cannot be sliced or reconciled:
              <ul className="mt-2 space-y-1">
                {unmapped.map((u) => (
                  <li key={u.dimension}>
                    <span className="font-bold">{u.dimension}:</span>{' '}
                    <span className="font-mono">{u.codes.join(', ')}</span>
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
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStaged(null)}
                  className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
                >
                  Discard batch
                </button>
                <button
                  type="button"
                  onClick={() => saveBatch.mutate(staged.batch)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
                >
                  Save as staged
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
                    <Amount value={totals.assets} currency={affiliate?.functionalCurrency ?? 'USD'} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Liabilities</dt>
                  <dd>
                    <Amount value={totals.liabilities} currency={affiliate?.functionalCurrency ?? 'USD'} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Capital</dt>
                  <dd>
                    <Amount value={totals.capital} currency={affiliate?.functionalCurrency ?? 'USD'} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">A − (L + C)</dt>
                  <dd className={Math.abs(totals.difference) < 0.01 ? 'text-success' : 'text-danger'}>
                    <Amount value={totals.difference} currency={affiliate?.functionalCurrency ?? 'USD'} />
                  </dd>
                </div>
              </dl>
            )}

            <ResultTable
              rows={staged.positions}
              columns={columns}
              rowKey={(p) => p.id}
              emptyMessage="Every row was discarded."
              renderDetail={(p) => (
                <dl className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
                  <Detail label="Account" value={p.accountNumber} mono />
                  <Detail label="Legacy number" value={p.legacyAccountNumber ?? '—'} mono />
                  <Detail label="Legal entity" value={p.legalEntityCode} mono />
                  <Detail label="Org unit" value={p.orgUnitCode} mono />
                  <Detail label="Common COA" value={p.commonCoaCode} mono />
                  <Detail label="Counterparty" value={p.counterpartyId ?? '—'} mono />
                  <Detail label="Maturity" value={formatDate(p.maturityDate)} />
                  <Detail label="Next reprice" value={formatDate(p.nextRepricingDate)} />
                  <Detail label="Lien" value={p.lienAmount > 0 ? `${p.lienAmount} — ${p.lienReason ?? ''}` : 'None'} />
                  <Detail label="Performing" value={p.performingStatus} />
                  <Detail label="Maker / checker" value={`${p.control.maker} / ${p.control.checker ?? '—'}`} />
                  <Detail
                    label="Turnover (monthly)"
                    value={p.turnover ? `${p.turnover.monthlyCredit} cr / ${p.turnover.monthlyDebit} dr` : 'Not loaded'}
                  />
                </dl>
              )}
            />
          </section>
        </>
      )}

      {!staged && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">No batch staged</p>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-gray-500">
            Upload a position book to stage it. Nothing is written until you commit, and{' '}
            {DEFAULT_VALIDATION_RULES.filter((r) => r.blocksCommit).length} of the {DEFAULT_VALIDATION_RULES.length}{' '}
            validation rules will block the commit if they fail.
          </p>
          <p className="mt-3 font-mono text-[11px] text-gray-400">demo_data/ghana_position_book_2026-07.csv</p>
        </section>
      )}
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={mono ? 'font-mono text-gray-700' : 'text-gray-700'}>{value}</dd>
    </div>
  );
}
