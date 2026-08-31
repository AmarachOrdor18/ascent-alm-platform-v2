import { useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useBatches, usePositions } from '@/lib/hooks';
import { useRuns } from '@/lib/runHooks';
import { useCreateSnapshot, useSnapshots } from '@/lib/snapshotHooks';
import { formatDate } from '@/lib/format';
import type { LoadBatch, Position, ProcessRun } from '@/engine/types';

/**
 * The canonical Position Book: every committed position, with the batch and
 * run(s) that consumed it visible from every row — "where did this number
 * come from?" answered by clicking rather than by asking data management.
 */
export function PositionBook() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const params = new URLSearchParams(search);
  const batchIdFilter = params.get('batchId');
  const runIdFilter = params.get('runId');

  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: runs = [] } = useRuns();
  const { data: allPositions = [], isLoading } = usePositions(affiliateCode === 'GROUP' ? undefined : affiliateCode);
  const { data: snapshots = [] } = useSnapshots(affiliateCode === 'GROUP' ? undefined : affiliateCode);
  const createSnapshot = useCreateSnapshot();

  const [affiliateFilter, setAffiliateFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [snapshotBatch, setSnapshotBatch] = useState<string | null>(null);
  const [snapshotReason, setSnapshotReason] = useState('');

  const scoped = useMemo(() => {
    const runBatchIds = runIdFilter ? (runs.find((r) => r.id === runIdFilter)?.positionBatchIds ?? []) : null;
    let rows = allPositions;
    if (batchIdFilter) rows = rows.filter((p) => p.batchId === batchIdFilter);
    else if (runBatchIds) rows = rows.filter((p) => runBatchIds.includes(p.batchId));
    if (affiliateFilter !== 'ALL') rows = rows.filter((p) => p.affiliateCode === affiliateFilter);
    if (categoryFilter !== 'ALL') rows = rows.filter((p) => p.category === categoryFilter);
    return rows;
  }, [allPositions, batchIdFilter, runIdFilter, runs, affiliateFilter, categoryFilter]);

  const { search: q, setSearch: setQ, page, setPage, density, setDensity, paged, totalItems, pageSize } =
    useTableControls(scoped, 25, ['id', 'accountNumber', 'productClass', 'glAccountCode', 'counterpartyId']);

  const filterBatch = batchIdFilter ? batches.find((b) => b.id === batchIdFilter) : null;
  const filterRun = runIdFilter ? runs.find((r) => r.id === runIdFilter) : null;

  const canSnapshot = hasPermission('data.configure');

  const runsConsuming = (batchId: string) => runs.filter((r) => r.positionBatchIds.includes(batchId));
  const openSnapshots = (batchId: string) =>
    snapshots.filter((s) => s.parentBatchId === batchId && s.status !== 'Discarded' && s.status !== 'Committed');

  const handleCreateSnapshot = async (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch || !snapshotReason.trim()) return;
    const positions = allPositions.filter((p) => p.batchId === batchId);
    const snapshot = await createSnapshot.mutateAsync({
      batch,
      positions,
      reason: snapshotReason.trim(),
      parentRunId: runIdFilter,
    });
    setSnapshotBatch(null);
    setSnapshotReason('');
    navigate(`/position-book/snapshot/${snapshot.id}`);
  };

  const columns: ResultColumn<Position>[] = [
    { key: 'id', header: 'Position', render: (p) => <span className="font-mono text-[11px]">{p.id}</span> },
    { key: 'account', header: 'Account', render: (p) => <span className="font-mono text-[11px] text-gray-600">{p.accountNumber}</span> },
    { key: 'affiliate', header: 'Affiliate', render: (p) => <span className="font-mono text-[11px]">{p.affiliateCode}</span> },
    { key: 'product', header: 'Product', render: (p) => <span className="text-navy-900">{p.productClass}</span> },
    { key: 'category', header: 'Category', render: (p) => <StatusBadge status={p.category} tone={p.category === 'Asset' ? 'info' : 'neutral'} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <Amount value={p.amount} currency={p.currency} /> },
    { key: 'maturity', header: 'Maturity', render: (p) => <span className="text-[11px] text-gray-500">{p.maturityDate ? formatDate(p.maturityDate) : '—'}</span> },
    { key: 'hqla', header: 'HQLA', render: (p) => (p.hqlaLevel === 'None' ? <span className="text-gray-300">—</span> : <StatusBadge status={p.hqlaLevel} tone="success" />) },
    { key: 'batch', header: 'Batch', render: (p) => <span className="font-mono text-[10px] text-gray-400">{p.batchId}</span> },
  ];

  return (
    <>
      <ModuleHeader
        title="Position Book"
        description="The canonical, normalized position layer every ALM calculation reads from. Every row traces back to the batch and run that admitted it."
        asOfDate={null}
        scope={affiliateFilter === 'ALL' ? (affiliateCode === 'GROUP' ? 'All affiliates' : affiliateCode) : affiliateFilter}
        metrics={[
          { label: 'Positions in view', value: String(scoped.length), about: 'Rows matching the current filters — not necessarily the whole book.' },
          { label: 'Total book', value: String(allPositions.length), about: 'Every committed position visible at this scope, before filtering.' },
          {
            label: 'Filtered by',
            value: filterBatch ? `Batch ${filterBatch.id}` : filterRun ? `Run ${filterRun.name}` : 'Nothing',
            about: 'Position Book can be opened pre-filtered from a batch (Data Vintages) or a run (Run History) to show exactly what fed it.',
          },
        ]}
      />

      {(filterBatch || filterRun) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-100 bg-navy-50 p-4">
          <p className="text-[12px] leading-relaxed text-navy-900">
            {filterBatch && (
              <>
                Showing positions admitted by <span className="font-mono font-bold">{filterBatch.id}</span> (v
                {filterBatch.version}, {filterBatch.status}) — committed {filterBatch.committedAt ? formatDate(filterBatch.committedAt.slice(0, 10)) : '—'}.
                {runsConsuming(filterBatch.id).length > 0 && (
                  <> Consumed by {runsConsuming(filterBatch.id).length} run(s): {runsConsuming(filterBatch.id).map((r) => r.name).join(', ')}.</>
                )}
              </>
            )}
            {filterRun && !filterBatch && (
              <>
                Showing every position consumed by run <span className="font-bold">{filterRun.name}</span> ({filterRun.positionBatchIds.join(', ')}).
              </>
            )}
          </p>
          <button type="button" onClick={() => navigate('/data/operations/position-book')} className="shrink-0 text-[11px] font-bold text-navy-700 hover:underline">
            Clear filter
          </button>
        </div>
      )}

      {filterBatch && canSnapshot && (
        <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-navy-900">Editable snapshot</h3>
            <InfoButton label="What an editable snapshot is">
              A snapshot is an editable copy of this batch's positions — it never changes {filterBatch.id}. Edit it,
              recalculate to see the impact on LCR/NSFR/IRRBB, then submit for maker-checker approval to commit it as
              a new Position Book version.
            </InfoButton>
          </div>
          {openSnapshots(filterBatch.id).length > 0 && (
            <ul className="mb-2 space-y-1">
              {openSnapshots(filterBatch.id).map((s) => (
                <li key={s.id}>
                  <Link href={`/position-book/snapshot/${s.id}`} className="text-[11px] font-bold text-navy-700 hover:underline">
                    Resume {s.name} — {s.status} ({s.changes.length} change{s.changes.length === 1 ? '' : 's'})
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {snapshotBatch === filterBatch.id ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[280px] flex-1">
                <label htmlFor="snap-reason" className="mb-1 block text-[11px] text-gray-600">Reason for the snapshot</label>
                <input
                  id="snap-reason"
                  value={snapshotReason}
                  onChange={(e) => setSnapshotReason(e.target.value)}
                  placeholder="Investigating a maturity-date data-entry error on the July book"
                  className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleCreateSnapshot(filterBatch.id)}
                disabled={!snapshotReason.trim() || createSnapshot.isPending}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {createSnapshot.isPending ? 'Creating…' : 'Create snapshot'}
              </button>
              <button type="button" onClick={() => setSnapshotBatch(null)} className="text-[11px] font-bold text-gray-500 hover:text-navy-900">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSnapshotBatch(filterBatch.id)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
            >
              Create editable snapshot from this batch
            </button>
          )}
        </div>
      )}

      <section className="table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <TableToolbar
            searchValue={q}
            onSearchChange={setQ}
            exportData={() => scoped}
            exportFilename="position-book"
            density={density}
            onDensityChange={setDensity}
          >
            <select
              value={affiliateFilter}
              onChange={(e) => { setAffiliateFilter(e.target.value); setPage(1); }}
              aria-label="Filter by affiliate"
              className="rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All affiliates</option>
              {affiliates.filter((a) => a.code !== 'GROUP').map((a) => (
                <option key={a.code} value={a.code}>{a.name}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              aria-label="Filter by category"
              className="rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All categories</option>
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Capital">Capital</option>
            </select>
          </TableToolbar>
        </div>
        <ResultTable
          rows={paged}
          columns={columns}
          rowKey={(p) => p.id}
          emptyMessage={isLoading ? 'Loading…' : 'No positions match the current filters.'}
          renderDetail={(p) => <PositionDetail position={p} runsConsuming={runsConsuming} batches={batches} />}
        />
        <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </section>
    </>
  );
}

function PositionDetail({
  position,
  runsConsuming,
  batches,
}: {
  position: Position;
  runsConsuming: (batchId: string) => ProcessRun[];
  batches: LoadBatch[];
}) {
  const batch = batches.find((b) => b.id === position.batchId);
  const consumingRuns = runsConsuming(position.batchId);

  const fields: Array<[string, string | number | null]> = [
    ['Legal entity', position.legalEntityCode],
    ['Org unit', position.orgUnitCode],
    ['GL account', position.glAccountCode],
    ['Common COA', position.commonCoaCode],
    ['Counterparty', position.counterpartyId],
    ['Currency', position.currency],
    ['Rate type', position.rateType],
    ['Interest rate %', position.interestRatePct],
    ['Next repricing', position.nextRepricingDate],
    ['Behavioural tag', position.behaviouralTag],
    ['HQLA level', position.hqlaLevel],
    ['HQLA haircut %', position.hqlaHaircutPct],
    ['LCR role', position.lcrCashflowRole],
    ['ASF factor %', position.asfFactorPct],
    ['RSF factor %', position.rsfFactorPct],
    ['IRRBB sensitive', position.irrbbRateSensitive ? 'Yes' : 'No'],
    ['Performing status', position.performingStatus],
  ];

  return (
    <div className="space-y-3 text-[11px]">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
            <dd className="break-all text-gray-700">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg bg-navy-50 px-3 py-2 leading-relaxed text-navy-900">
        <span className="font-bold">Lineage: </span>
        Source batch <Link href={`/data/operations/position-book?batchId=${position.batchId}`} className="font-mono font-bold underline hover:no-underline">{position.batchId}</Link>
        {batch && <> — {batch.status}, uploaded by {batch.uploadedBy} on {formatDate(batch.uploadedAt.slice(0, 10))}</>}
        {consumingRuns.length > 0 ? (
          <>
            {' '}· consumed by {consumingRuns.length} run(s):{' '}
            {consumingRuns.map((r, i) => (
              <span key={r.id}>
                <Link href={`/execution/history`} className="font-bold underline hover:no-underline">{r.name}</Link>
                {i < consumingRuns.length - 1 ? ', ' : ''}
              </span>
            ))}
          </>
        ) : (
          <> · not yet consumed by any process run.</>
        )}
      </div>

      {position.notes && <p className="italic text-gray-500">Notes: {position.notes}</p>}
    </div>
  );
}
