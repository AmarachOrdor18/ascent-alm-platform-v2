import { isConsolidatedRun, useGroupSources } from '@/lib/groupConsolidation';
import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { DegradationNotice } from './DegradationNotice';
import { formatDate } from '@/lib/format';
import { useAffiliates } from '@/lib/hooks';
import { useScope } from '@/context/ScopeContext';
import { SIGN_OFF_LABEL, SIGN_OFF_TONE, signOffStatusOf, versionOf, type OfficialRun } from '@/lib/runSeries';
import type { CalculationElement, LoadBatch, ProcessRun } from '@/engine/types';

interface ResultsFrameProps {
  run: ProcessRun | null;
  available: ProcessRun[];
  /** Every run for the scope - what version numbers are computed against. */
  allRuns?: ProcessRun[];
  official?: OfficialRun | null;
  isOfficial?: boolean;
  onSelect: (runId: string) => void;
  onSelectOfficial?: () => void;
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
export function LineagePanel({ run, batches }: { run: ProcessRun; batches: LoadBatch[] }) {
  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-gray-400">
        Source data - {batches.length} batch{batches.length === 1 ? '' : 'es'} pinned to this run
      </h3>
      {batches.length === 0 ? (
        <p className="text-[12px] text-gray-500">
          This run pins no Positions batches directly - likely a Group-level or forecast-style run.
        </p>
      ) : (
        <table className="w-full text-[12px]">
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
        className="mt-3 inline-block text-[12px] font-bold text-navy-700 hover:underline"
      >
        View these positions in Position Book →
      </Link>
    </div>
  );
}

/** The affiliate runs behind the Group consolidated view - a searchable, scrolling list so it holds up at 30+. */
function ConsolidationSources({ sources }: { sources: ReturnType<typeof useGroupSources> }) {
  const [q, setQ] = useState('');
  const shown = sources.filter((s) => s.affiliateName.toLowerCase().includes(q.trim().toLowerCase()));
  const signedOff = sources.filter((s) => signOffStatusOf(s.run) === 'SignedOff').length;
  return (
    <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-gray-400">
          Affiliate runs combined - {sources.length} · {signedOff} signed off
        </h3>
        {sources.length > 8 && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find affiliate"
            aria-label="Find affiliate"
            className="rounded-lg border border-gray-200 px-3 py-1 text-[12px] focus:border-navy-700 focus:outline-none"
          />
        )}
      </div>
      <p className="mb-2 text-[12px] text-gray-500">
        Each Live affiliate&rsquo;s official run for the date - its signed-off version, else its latest completed one.
      </p>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-200 text-left text-gray-400">
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Affiliate</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Version</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wider">Status</th>
              <th className="py-1 px-2" />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const st = signOffStatusOf(s.run);
              return (
                <tr key={s.run.id} className="border-b border-gray-100">
                  <td className="py-1.5 px-2 font-bold text-navy-900">{s.affiliateName}</td>
                  <td className="py-1.5 px-2 font-mono">v{s.version}</td>
                  <td className="py-1.5 px-2">
                    <StatusBadge status={SIGN_OFF_LABEL[st]} tone={SIGN_OFF_TONE[st]} />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <Link
                      href={`/execution/history?run=${s.run.id}`}
                      className="font-bold text-navy-700 hover:underline"
                    >
                      Open in Runs →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResultsFrame({
  run,
  available,
  allRuns = available,
  official = null,
  isOfficial = true,
  // Versions are switched from the Run box in the top bar.
  onSelect: _onSelect,
  onSelectOfficial,
  isLoading,
  isStale,
  requires,
  elementLabels = {},
  sourceBatches = [],
  children,
}: ResultsFrameProps) {
  const [showLineage, setShowLineage] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const { data: affiliates = [] } = useAffiliates();
  const groupSources = useGroupSources(run && isConsolidatedRun(run) ? run.asOfDate : null);
  const { asOfDate: workingDate, affiliateCode: scopeCode } = useScope();
  if (isLoading) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-[13px] text-gray-500">
        Loading runs…
      </p>
    );
  }

  if (!run) {
    // A run needs a Live affiliate with data behind it - until one exists, "Run now" is a dead end, so
    // point a first-time user at Readiness instead.
    const hasLiveAffiliate = affiliates.some((a) => a.code !== 'GROUP' && a.status === 'Live');
    if (!hasLiveAffiliate) {
      return (
        <EmptyState title="Nothing is set up yet" cta={{ label: 'Open Readiness', href: '/execution/readiness' }}>
          Results need a run, and a run needs a Live affiliate with positions loaded. Readiness shows what is missing.
        </EmptyState>
      );
    }
    if (scopeCode === 'GROUP')
      return (
        <EmptyState
          title={
            workingDate ? `No affiliate has a completed run for ${formatDate(workingDate)}` : 'Pick a date at the top'
          }
          cta={{ label: 'Go to Run now', href: '/execution' }}
        >
          The Group view consolidates each Live affiliate&rsquo;s official run for the date - there is no separate Group
          run to do. Run an affiliate for this date (or pick another date in the header).
        </EmptyState>
      );
    return (
      <EmptyState
        title={workingDate ? `No completed run for ${formatDate(workingDate)}` : 'No completed run for this scope'}
        cta={{ label: 'Go to Run now', href: '/execution' }}
      >
        Results are read from a run, never recomputed on the fly - that is what makes a figure reproducible months
        later. Run this date on the Run now screen, or pick another date in the header.
      </EmptyState>
    );
  }

  const notComputed = requires.filter((e) => !run.elements.includes(e));
  const consolidated = isConsolidatedRun(run);
  const version = versionOf(run, allRuns);
  const status = signOffStatusOf(run);

  return (
    <>
      <div
        data-tour="run-strip"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm"
      >
        {/* Affiliate, date, version and sign-off are in the Run box in the top bar (which also switches
            versions) - this strip only adds what that box does not say. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
          {consolidated ? (
            <>
              <span className="font-bold text-navy-900">{run.name}</span>
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                aria-expanded={showSources}
                className="rounded-full border border-navy-700/20 bg-navy-50 px-2.5 py-0.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
              >
                Combines {groupSources.length} affiliate run{groupSources.length === 1 ? '' : 's'}{' '}
                {showSources ? '▴' : '▾'}
              </button>
            </>
          ) : (
            <span>
              Figures from the run in the top bar{run.processType !== 'Static' ? ` · ${run.processType}` : ''}
            </span>
          )}
          {isStale && <StatusBadge status="Superseded data" tone="warning" />}
        </div>

        <button
          type="button"
          onClick={() => setShowLineage((v) => !v)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:border-navy-700"
        >
          {showLineage ? 'Hide source data' : 'Source data'}
        </button>
      </div>

      {consolidated && showSources && <ConsolidationSources sources={groupSources} />}

      {!isOfficial && official && (
        <p className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-700/20 bg-navy-50 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
          <span>
            <span className="font-bold">
              Viewing v{version}
              {status === 'Reopened'
                ? ' (reopened)'
                : status === 'SignedOff'
                  ? ' (signed off, older date)'
                  : ` (${SIGN_OFF_LABEL[status].toLowerCase()})`}{' '}
              - not the official figures.
            </span>{' '}
            This version is read-only
            {status === 'Reopened' && run.signOff?.reopenReason ? ` - reopened: ${run.signOff.reopenReason}` : ''}.
          </span>
          {onSelectOfficial && (
            <button type="button" onClick={onSelectOfficial} className="font-bold underline hover:no-underline">
              Back to official ({formatDate(official.run.asOfDate)} · v{versionOf(official.run, allRuns)}) →
            </button>
          )}
        </p>
      )}

      {consolidated && groupSources.some((s) => signOffStatusOf(s.run) !== 'SignedOff') && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
          <span className="font-bold">
            Includes provisional figures - {groupSources.filter((s) => signOffStatusOf(s.run) !== 'SignedOff').length}{' '}
            of {groupSources.length} affiliate runs not yet signed off.
          </span>{' '}
          <button type="button" onClick={() => setShowSources(true)} className="font-bold underline hover:no-underline">
            See which
          </button>
        </p>
      )}

      {!consolidated && isOfficial && status !== 'SignedOff' && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
          <span className="font-bold">
            Provisional figures
            {status === 'PendingSignOff' ? ' - sign-off requested, awaiting a checker' : ' - not yet signed off'}.
          </span>{' '}
          Nothing for {formatDate(run.asOfDate)} has been signed off yet.{' '}
          <Link href={`/execution/history?run=${run.id}`} className="font-bold underline hover:no-underline">
            Open in Runs
          </Link>
        </p>
      )}

      {showLineage && <LineagePanel run={run} batches={sourceBatches} />}

      {isStale && (
        <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
          <span className="font-bold">This run consumed data that has since been superseded.</span> The figures below
          are what it actually computed, which is the point - they stay defensible. Re-run it from Runs to reflect the
          current load.
        </p>
      )}

      <DegradationNotice run={run} elements={requires} />

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
