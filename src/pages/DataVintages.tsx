/**
 * Data Vintages & Load History — screen 7.
 *
 * Every upload is a load batch with a version, a file hash, an uploader and
 * a row count. Reloading an as-of date creates a new version and supersedes
 * the previous one, with a reason; the old version is retained, because a
 * run that consumed it must still be able to show what it actually computed.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { availableAsOfDates, checkAllDomains, expiredBatches } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import type { LoadBatch } from '@/engine/types';

const TODAY = '2026-08-25';

const STATUS_TONE = {
  Committed: 'success',
  Staged: 'warning',
  Validated: 'info',
  Superseded: 'neutral',
  Rejected: 'danger',
} as const;

export function DataVintages() {
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [], isLoading } = useBatches();
  const [filter, setFilter] = useState<string>('ALL');

  const rows = filter === 'ALL' ? batches : batches.filter((b) => b.affiliateCode === filter);
  const committed = rows.filter((b) => b.status === 'Committed');
  const superseded = rows.filter((b) => b.status === 'Superseded');
  const expired = expiredBatches(rows, TODAY, 24);

  const freshness = affiliates
    .filter((a) => a.code !== 'GROUP')
    .flatMap((a) => checkAllDomains(a, batches, TODAY).map((c) => ({ affiliate: a.name, ...c })));
  const stale = freshness.filter((f) => f.status === 'Stale' || f.status === 'Never loaded');

  const columns: ResultColumn<LoadBatch>[] = [
    {
      key: 'affiliate',
      header: 'Affiliate',
      render: (b) => <span className="font-mono text-[11px]">{b.affiliateCode}</span>,
    },
    { key: 'domain', header: 'Domain', render: (b) => <span className="text-navy-900">{b.domain}</span> },
    {
      key: 'asOf',
      header: 'As at',
      render: (b) => <span className="font-mono text-[11px]">{formatDate(b.asOfDate)}</span>,
    },
    {
      key: 'version',
      header: 'Version',
      align: 'right',
      render: (b) => <span className="font-mono">v{b.version}</span>,
    },
    { key: 'rows', header: 'Rows', align: 'right', render: (b) => <span className="font-mono">{b.rowsAccepted}</span> },
    {
      key: 'rejected',
      header: 'Rejected',
      align: 'right',
      render: (b) =>
        b.rowsRejected > 0 ? (
          <span className="font-mono text-danger">{b.rowsRejected}</span>
        ) : (
          <span className="font-mono text-gray-300">0</span>
        ),
    },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} tone={STATUS_TONE[b.status]} /> },
    {
      key: 'uploaded',
      header: 'Uploaded',
      render: (b) => <span className="text-[11px] text-gray-500">{formatDate(b.uploadedAt.slice(0, 10))}</span>,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Data Vintages & Load History"
        description="Every load, every version. New data never destroys old data — reloading an as-of date supersedes rather than overwrites, and a run keeps showing the version it consumed."
        asOfDate={null}
        scope={filter === 'ALL' ? 'All affiliates' : filter}
        metrics={[
          { label: 'Load batches', value: String(rows.length) },
          { label: 'Committed', value: String(committed.length), tone: 'success' },
          { label: 'Superseded', value: String(superseded.length) },
          {
            label: 'Stale domains',
            value: String(stale.length),
            tone: stale.length > 0 ? 'danger' : 'success',
          },
        ]}
      />

      {stale.length > 0 && (
        <div role="status" className="mb-6 rounded-lg bg-warning-bg px-4 py-3 text-[12px] leading-relaxed text-warning">
          <span className="font-bold">Freshness.</span> {stale.length} affiliate-domain combination
          {stale.length === 1 ? ' is' : 's are'} stale or never loaded. A stale feed does not announce itself — it
          simply reports confident numbers off old data.
          <ul className="mt-2 space-y-0.5">
            {stale.slice(0, 6).map((f) => (
              <li key={`${f.affiliateCode}-${f.domain}`}>
                {f.affiliate} · {f.domain} —{' '}
                {f.ageDays === null ? 'never loaded' : `${f.ageDays} days old against a ${f.slaDays}-day SLA`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={
            filter === 'ALL'
              ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white'
              : 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:border-navy-700'
          }
        >
          All affiliates
        </button>
        {affiliates
          .filter((a) => a.code !== 'GROUP')
          .map((a) => (
            <button
              key={a.code}
              type="button"
              onClick={() => setFilter(a.code)}
              className={
                filter === a.code
                  ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white'
                  : 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:border-navy-700'
              }
            >
              {a.name}
            </button>
          ))}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable
          rows={rows}
          columns={columns}
          rowKey={(b) => b.id}
          emptyMessage={isLoading ? 'Loading…' : 'No load batches yet. Upload a file to create one.'}
          renderDetail={(b) => (
            <div className="space-y-3 text-[11px]">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <dt className="font-bold uppercase tracking-wider text-gray-400">Batch ID</dt>
                  <dd className="font-mono text-gray-700">{b.id}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-gray-400">File</dt>
                  <dd className="text-gray-700">{b.fileName}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-gray-400">Content hash</dt>
                  <dd className="font-mono text-gray-700">{b.fileHash}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-gray-400">Uploaded by</dt>
                  <dd className="text-gray-700">{b.uploadedBy}</dd>
                </div>
                {b.committedBy && (
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Committed by</dt>
                    <dd className="text-gray-700">
                      {b.committedBy} · {b.committedAt ? formatDate(b.committedAt.slice(0, 10)) : '—'}
                    </dd>
                  </div>
                )}
                {b.supersedesBatchId && (
                  <div className="col-span-2">
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Supersedes</dt>
                    <dd className="font-mono text-gray-700">{b.supersedesBatchId}</dd>
                  </div>
                )}
              </dl>

              {b.supersededReason && (
                <p className="rounded bg-warning-bg px-3 py-2 leading-relaxed text-warning">
                  <span className="font-bold">Reason:</span> {b.supersededReason}
                </p>
              )}

              {b.status === 'Superseded' && (
                <p className="leading-relaxed text-gray-500">
                  Retained deliberately. A process run that consumed this version still reports the figures it actually
                  produced, and says which version it used.
                </p>
              )}
            </div>
          )}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">As-of dates available</h2>
          {affiliates
            .filter((a) => a.code !== 'GROUP')
            .map((a) => {
              const dates = availableAsOfDates(batches, a.code);
              return (
                <div key={a.code} className="border-b border-gray-50 py-2 last:border-0">
                  <p className="text-[12px] font-medium text-navy-900">{a.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {dates.length === 0 ? 'No committed data' : dates.map((d) => formatDate(d)).join(' · ')}
                  </p>
                </div>
              );
            })}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-navy-900">Retention</h2>
          <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
            Default policy retains 24 monthly as-of dates and every version within them. Expiry is soft: data is marked
            expired and hidden, never deleted, until an administrator purges it.
          </p>
          <p className="text-[12px]">
            <span className="font-bold text-navy-900">{expired.length}</span>{' '}
            <span className="text-gray-500">batch{expired.length === 1 ? '' : 'es'} past the retention window</span>
          </p>
        </div>
      </section>
    </>
  );
}
