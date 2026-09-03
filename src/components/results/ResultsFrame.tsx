import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/format';
import type { CalculationElement, LoadBatch, ProcessRun } from '@/engine/types';

interface ResultsFrameProps {
  run: ProcessRun | null;
  available: ProcessRun[];
  onSelect: (runId: string) => void;
  isLoading: boolean;
  isStale: boolean;
  /** When the selected run did not compute one of these, the frame says so instead of rendering an empty chart. */
  requires: CalculationElement[];
  /** How each required element reads in the message. */
  elementLabels?: Partial<Record<CalculationElement, string>>;
  /** The batches `run.positionBatchIds` pins - powers the "Source data" disclosure. */
  sourceBatches?: LoadBatch[];
  children: ReactNode;
}

/** Which batches, files and contributors fed the selected run - the existing batch→file→uploader
 * chain already shown in Position Book, surfaced here so a results screen doesn't dead-end. */
function LineagePanel({ run, batches }: { run: ProcessRun; batches: LoadBatch[] }) {
  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
        Source data - {batches.length} batch{batches.length === 1 ? '' : 'es'} pinned to this run
      </h3>
      {batches.length === 0 ? (
        <p className="text-[11px] text-gray-500">
          This run pins no Positions batches directly - likely a Group-level or forecast-style run.
        </p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-400">
              <th className="py-1 px-2 font-bold uppercase tracking-wider">File</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Contributor</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Status</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Uploaded by</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Uploaded at</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b border-gray-100">
                <td className="py-1.5 px-2 font-mono text-gray-700">{b.fileName}</td>
                <td className="py-1.5 px-2 text-gray-600">{b.contributor ?? '-'}</td>
                <td className="py-1.5 px-2">
                  <StatusBadge status={b.status} tone={b.status === 'Committed' ? 'success' : 'neutral'} />
                </td>
                <td className="py-1.5 px-2 text-gray-600">{b.uploadedBy}</td>
                <td className="py-1.5 px-2 font-mono text-gray-500">{formatDate(b.uploadedAt.slice(0, 10))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Link
        href={`/data/operations/position-book?runId=${run.id}`}
        className="mt-3 inline-block text-[11px] font-bold text-navy-700 hover:underline"
      >
        View these positions in Position Book →
      </Link>
    </div>
  );
}

export function ResultsFrame({
  run,
  available,
  onSelect,
  isLoading,
  isStale,
  requires,
  elementLabels = {},
  sourceBatches = [],
  children,
}: ResultsFrameProps) {
  const [showLineage, setShowLineage] = useState(false);
  if (isLoading) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-[12px] text-gray-500">
        Loading runs…
      </p>
    );
  }

  if (!run) {
    return (
      <EmptyState title="No completed run for this scope" cta={{ label: 'Go to Process Run', href: '/runs/new' }}>
        Results are read from a run, never recomputed on the fly - that is what makes a figure reproducible months
        later. Compose one on the Process Run screen and it will appear here.
      </EmptyState>
    );
  }

  const notComputed = requires.filter((e) => !run.elements.includes(e));

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Reading from</span>
          <span className="font-bold text-navy-900">{run.name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{formatDate(run.asOfDate)}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{run.reportingCurrency}</span>
          <span aria-hidden="true">·</span>
          <span>{run.processType}</span>
          {isStale && <StatusBadge status="Superseded data" tone="warning" />}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLineage((v) => !v)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
          >
            {showLineage ? 'Hide source data' : 'Source data'}
          </button>
          {available.length > 1 && (
            <>
              <label
                htmlFor="run-select"
                className="text-[11px] text-gray-500"
                title="Which completed calculation snapshot to show, within the affiliate/scope selected above."
              >
                Run
              </label>
              <select
                id="run-select"
                value={run.id}
                onChange={(e) => onSelect(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none"
              >
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {showLineage && <LineagePanel run={run} batches={sourceBatches} />}

      {isStale && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
          <span className="font-bold">This run consumed data that has since been superseded.</span> The figures below
          are what it actually computed, which is the point - they stay defensible. Re-run it from Run History to
          reflect the current load.
        </p>
      )}

      {notComputed.length > 0 ? (
        <EmptyState title={`This run did not compute ${notComputed.map((e) => elementLabels[e] ?? e).join(' or ')}.`}>
          Nothing is shown rather than a figure derived some other way. Select a run that included{' '}
          {notComputed.length === 1 ? 'it' : 'them'}, or execute a new one with{' '}
          {notComputed.length === 1 ? 'that element' : 'those elements'} selected.
        </EmptyState>
      ) : (
        children
      )}
    </>
  );
}
