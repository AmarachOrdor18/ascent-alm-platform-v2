import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useScope } from '@/context/ScopeContext';
import { useBatches } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type { LoadBatch } from '@/engine/types';

const STATUS_TONE: Record<LoadBatch['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  Staged: 'neutral',
  Validated: 'neutral',
  Committed: 'success',
  Superseded: 'neutral',
  Rejected: 'danger',
};

/** Every load, one row each - the direct answer to "what have we actually loaded, and how clean was it?" */
export function DataQuality() {
  const { affiliateCode } = useScope();
  const { data: allBatches = [] } = useBatches();
  const batches = (affiliateCode === 'GROUP' ? allBatches : allBatches.filter((b) => b.affiliateCode === affiliateCode))
    .filter((b) => b.status !== 'Superseded')
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const totalRows = batches.reduce((s, b) => s + b.rowCount, 0);
  const totalExceptions = batches.reduce((s, b) => s + b.rowsRejected, 0);
  const unreconciled = batches.filter((b) => b.domain === 'Positions' && b.status === 'Committed' && !b.reconciledAt).length;

  const columns: ResultColumn<LoadBatch>[] = [
    { key: 'fileName', header: 'File', render: (b) => <span className="font-mono text-[11px] text-navy-900">{b.fileName}</span> },
    { key: 'domain', header: 'Source', render: (b) => <span className="text-gray-600">{b.domain}{b.contributor ? ` · ${b.contributor}` : ''}</span> },
    { key: 'rowCount', header: 'Rows', align: 'right', render: (b) => <span className="font-mono">{b.rowCount}</span>, compareValue: (b) => b.rowCount },
    { key: 'rowsAccepted', header: 'Accepted', align: 'right', render: (b) => <span className="font-mono text-success">{b.rowsAccepted}</span> },
    { key: 'rowsRejected', header: 'Exceptions', align: 'right', render: (b) => <span className={`font-mono ${b.rowsRejected > 0 ? 'text-danger' : 'text-gray-300'}`}>{b.rowsRejected}</span> },
    { key: 'asOfDate', header: 'As-of', render: (b) => <span className="font-mono text-[11px] text-gray-500">{formatDate(b.asOfDate)}</span> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} tone={STATUS_TONE[b.status]} /> },
  ];

  return (
    <>
      <ModuleHeader
        title="Data Quality"
        description="Every load, and how clean it was on arrival."
        asOfDate={null}
        scope={affiliateCode}
        metrics={[
          { label: 'Sources loaded', value: String(batches.length), about: 'Every batch on file for this scope, most recent first.' },
          { label: 'Rows loaded', value: totalRows.toLocaleString(), about: 'Total rows across every loaded batch, accepted and rejected.' },
          { label: 'Exceptions', value: totalExceptions.toLocaleString(), tone: totalExceptions > 0 ? 'warning' : 'success', about: 'Rows rejected on validation across every batch.' },
          { label: 'Unreconciled', value: String(unreconciled), tone: unreconciled > 0 ? 'danger' : 'success', about: 'Committed position batches not yet reconciled to the GL.' },
        ]}
      />
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable rows={batches} columns={columns} rowKey={(b) => b.id} emptyMessage="No sources loaded yet." />
      </div>
    </>
  );
}
