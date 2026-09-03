import { useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { useConnectors } from '@/lib/connectorHooks';
import { FeedStatusBadge } from '@/components/connectors/FeedStatusBadge';
import { checkAllDomains, expiredBatches, positionBookReadiness } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import type { LoadBatch } from '@/engine/types';

const TODAY = new Date().toISOString().slice(0, 10);

const STATUS_TONE = {
  Committed: 'success',
  Staged: 'warning',
  Validated: 'info',
  Superseded: 'neutral',
  Rejected: 'danger',
} as const;

export function DataVintages() {
  const { data: allAffiliates = [] } = useAffiliates();
  const { data: allBatches = [], isLoading } = useBatches();
  const { data: connectors = [] } = useConnectors();
  const [filter, setFilter] = useState<string>('ALL');

  // Load History is a record of real data work - an affiliate that hasn't been onboarded (approved to
  // Live) yet has none, by construction, since Data Upload itself won't let it stage anything. Any trace
  // otherwise would be leftover seed/test data, not a real load, so it's filtered out here rather than shown.
  const affiliates = allAffiliates.filter((a) => a.code !== 'GROUP' && a.status === 'Live');
  const liveCodes = new Set(affiliates.map((a) => a.code));
  const batches = allBatches.filter((b) => liveCodes.has(b.affiliateCode));

  const filtered = filter === 'ALL' ? batches : batches.filter((b) => b.affiliateCode === filter);
  const committed = filtered.filter((b) => b.status === 'Committed');
  const superseded = filtered.filter((b) => b.status === 'Superseded');
  const rejected = filtered.filter((b) => b.status === 'Rejected');
  const expired = expiredBatches(filtered, TODAY, 24);

  const freshness = affiliates.flatMap((a) => checkAllDomains(a, batches, TODAY).map((c) => ({ affiliate: a.name, ...c })));
  const stale = freshness.filter((f) => f.status === 'Stale' || f.status === 'Never loaded');

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    filtered,
    10,
    ['affiliateCode', 'domain', 'asOfDate', 'status'],
  );

  const columns: ResultColumn<LoadBatch>[] = [
    {
      key: 'affiliate',
      header: 'Affiliate',
      render: (b) => <span className="font-mono text-[11px]">{b.affiliateCode}</span>,
    },
    { key: 'domain', header: 'Domain', render: (b) => <span className="text-navy-900">{b.domain}</span> },
    {
      key: 'contributor',
      header: 'Department',
      render: (b) => (b.contributor ? <span className="text-navy-900">{b.contributor}</span> : <span className="text-gray-300">-</span>),
    },
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
    {
      key: 'feed',
      header: 'Feed',
      render: (b) => {
        const affiliate = affiliates.find((a) => a.code === b.affiliateCode);
        const feed = affiliate?.feeds.find((f) => f.domain === b.domain);
        return feed ? <FeedStatusBadge feed={feed} connectors={connectors} /> : <span className="text-gray-300">-</span>;
      },
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Data Vintages & Load History"
        description="Every load, every version. New data never destroys old data - reloading an as-of date supersedes rather than overwrites, and a run keeps showing the version it consumed."
        asOfDate={null}
        scope={filter === 'ALL' ? 'All affiliates' : filter}
        staleWarning={
          stale.length > 0
            ? `${stale.length} affiliate/domain pair${stale.length === 1 ? '' : 's'} past its refresh SLA or never loaded: ${stale
                .slice(0, 5)
                .map((f) => `${f.affiliate} ${f.domain}`)
                .join(', ')}${stale.length > 5 ? `, and ${stale.length - 5} more` : ''}.`
            : null
        }
        metrics={[
          { label: 'Load batches', value: String(filtered.length), about: 'Every file or connector load recorded, across every version.' },
          { label: 'Committed', value: String(committed.length), tone: 'success', about: 'Batches that passed validation and are available for a run to consume.' },
          { label: 'Superseded', value: String(superseded.length), about: 'Earlier versions replaced by a newer load for the same domain and as-of date - retained, never deleted, so a past run’s figures stay reproducible.' },
          {
            label: 'Rejected',
            value: String(rejected.length),
            tone: rejected.length > 0 ? 'danger' : 'success',
            about: 'Staged uploads discarded after failing a blocking validation rule - kept on record, with the reason, rather than vanishing.',
          },
          {
            label: 'Stale domains',
            value: String(stale.length),
            tone: stale.length > 0 ? 'danger' : 'success',
            about: 'Affiliate/domain pairs whose most recent load has aged past its refresh SLA, or that have never been loaded.',
          },
          {
            label: 'Past retention',
            value: String(expired.length),
            tone: expired.length > 0 ? 'warning' : 'success',
            about: 'Batches past the 24-month retention window. Expiry is soft - marked expired and hidden, never deleted, until an administrator purges it.',
          },
        ]}
      />

      <section className="table-datagrid-container">
        <div className="border-b border-gray-100 bg-white/50 p-5">
          <TableToolbar
            searchValue={search}
            onSearchChange={setSearch}
            exportData={() => filtered}
            exportFilename="data-vintages"
            density={density}
            onDensityChange={setDensity}
          >
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by affiliate"
              className="rounded-lg border border-gray-200 bg-gray-50 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
            >
              <option value="ALL">All affiliates</option>
              {affiliates.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name}
                </option>
              ))}
            </select>
          </TableToolbar>
        </div>
        <ResultTable
          rows={paged}
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
                      {b.committedBy} · {b.committedAt ? formatDate(b.committedAt.slice(0, 10)) : '-'}
                    </dd>
                  </div>
                )}
                {b.supersedesBatchId && (
                  <div className="col-span-2">
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Supersedes</dt>
                    <dd className="font-mono text-gray-700">{b.supersedesBatchId}</dd>
                  </div>
                )}
                {b.mappingRuleVersionsUsed && Object.keys(b.mappingRuleVersionsUsed).length > 0 && (
                  <div className="col-span-2">
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Mapping applied</dt>
                    <dd className="font-mono text-gray-700">
                      {Object.entries(b.mappingRuleVersionsUsed)
                        .map(([ruleId, version]) => `${ruleId} (v${version})`)
                        .join(', ')}
                    </dd>
                  </div>
                )}
              </dl>

              {b.supersededReason && (
                <p className="rounded bg-warning-bg px-3 py-2 leading-relaxed text-warning">
                  <span className="font-bold">Reason:</span> {b.supersededReason}
                </p>
              )}

              {b.status === 'Rejected' && (
                <p className="rounded bg-danger-bg px-3 py-2 leading-relaxed text-danger">
                  <span className="font-bold">Rejected by {b.rejectedBy ?? 'unknown'}</span>
                  {b.rejectedAt && ` on ${formatDate(b.rejectedAt.slice(0, 10))}`}
                  {b.rejectedReason && `: ${b.rejectedReason}`}
                </p>
              )}

              {b.status === 'Superseded' && (
                <p className="leading-relaxed text-gray-500">
                  Retained deliberately. A process run that consumed this version still reports the figures it actually
                  produced, and says which version it used.
                </p>
              )}

              {b.domain === 'Positions' && (() => {
                const affiliate = affiliates.find((a) => a.code === b.affiliateCode);
                if (!affiliate) return null;
                const readiness = positionBookReadiness(affiliate, batches, b.asOfDate);
                return (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="font-bold uppercase tracking-wider text-gray-400">
                        Position Book for {formatDate(b.asOfDate)}
                      </span>
                      <InfoButton label="What this means">
                        Loans, Deposits and Treasury each submit their own slice for the same date - the book is
                        whatever combination has been committed so far, not one file. This is that combination's
                        status for the date this batch belongs to, not just this one department's upload.
                      </InfoButton>
                      <StatusBadge
                        status={readiness.isComplete ? 'Complete' : 'Incomplete'}
                        tone={readiness.isComplete ? 'success' : 'warning'}
                      />
                    </div>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1">
                      {readiness.contributors.map((c) => (
                        <li key={c.contributor} className="flex items-center gap-1.5">
                          <span className="text-gray-600">{c.contributor}</span>
                          <span className={c.submitted ? 'font-bold text-success' : 'font-bold text-warning'}>
                            {c.submitted ? 'Submitted' : 'Missing'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {readiness.legacyBatch && (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
                        Also carries a pre-department combined load ({readiness.legacyBatch.id}).
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="border-t border-gray-100 pt-3">
                <Link
                  href={`/data/operations/position-book?batchId=${b.id}`}
                  className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                >
                  View the {b.rowsAccepted} position(s) this batch admitted
                </Link>
              </div>
            </div>
          )}
        />
        <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </section>
    </>
  );
}
