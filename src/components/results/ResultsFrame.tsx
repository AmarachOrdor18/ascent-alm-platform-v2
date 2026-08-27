import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/format';
import type { CalculationElement, ProcessRun } from '@/engine/types';

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
  children: ReactNode;
}

export function ResultsFrame({
  run,
  available,
  onSelect,
  isLoading,
  isStale,
  requires,
  elementLabels = {},
  children,
}: ResultsFrameProps) {
  if (isLoading) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-[12px] text-gray-500">
        Loading runs…
      </p>
    );
  }

  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-[13px] font-bold text-navy-900">No completed run for this scope</p>
        <p className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-gray-500">
          Results are read from a run, never recomputed on the fly — that is what makes a figure reproducible months
          later. Compose one on the Process Run screen and it will appear here.
        </p>
        <Link
          href="/runs/new"
          className="mt-4 inline-block rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
        >
          Go to Process Run
        </Link>
      </div>
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

        {available.length > 1 && (
          <div className="flex items-center gap-2">
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
                  {r.name} — {r.asOfDate}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isStale && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
          <span className="font-bold">This run consumed data that has since been superseded.</span> The figures below
          are what it actually computed, which is the point — they stay defensible. Re-run it from Run History to
          reflect the current load.
        </p>
      )}

      {notComputed.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[12px] font-bold text-navy-900">
            This run did not compute{' '}
            {notComputed.map((e) => elementLabels[e] ?? e).join(' or ')}.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-gray-500">
            Nothing is shown rather than a figure derived some other way. Select a run that included{' '}
            {notComputed.length === 1 ? 'it' : 'them'}, or execute a new one with{' '}
            {notComputed.length === 1 ? 'that element' : 'those elements'} selected.
          </p>
        </div>
      ) : (
        children
      )}
    </>
  );
}
