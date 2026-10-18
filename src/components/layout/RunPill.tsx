import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { useScope } from '@/context/ScopeContext';
import { useRunSelection } from '@/lib/resultHooks';
import { buildSeries, SIGN_OFF_LABEL, signOffStatusOf, versionOf } from '@/lib/runSeries';
import type { RunSignOffStatus } from '@/engine/types';

const PILL_TONE: Record<RunSignOffStatus, string> = {
  SignedOff: 'border-success/40 bg-success-bg text-success',
  Open: 'border-warning/40 bg-warning-bg text-warning',
  PendingSignOff: 'border-warning/40 bg-warning-bg text-warning',
  Reopened: 'border-gray-300 bg-gray-100 text-gray-600',
};

/**
 * Header pill naming the run every results screen is reading - "Run: Ecobank Nigeria · 31 Jul 2026 · v2 ·
 * Signed off ✓". Clicking opens a picker of this scope's series (dates) and their versions; choosing one
 * is a session-only override, and "Use official" returns to the default.
 */
export function RunPill({ fallbackDate }: { fallbackDate: string | null }) {
  const { affiliate, affiliateCode } = useScope();
  const { run, allRuns, official, isOfficial, select, selectOfficial } = useRunSelection();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const series = useMemo(() => buildSeries(allRuns).filter((s) => s.versions.length > 0), [allRuns]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!run) {
    return (
      <div data-tour="asof" className="flex items-center gap-2 text-[12px] text-gray-500">
        <span className="font-bold uppercase tracking-wider text-gray-400">As at</span>
        <span className="font-mono text-navy-900">{fallbackDate ? formatDate(fallbackDate) : 'no data loaded'}</span>
        <span className="text-gray-400">· no run yet</span>
      </div>
    );
  }

  const status = signOffStatusOf(run);
  const scopeName = affiliateCode === 'GROUP' ? 'Ecobank Group' : (affiliate?.name ?? affiliateCode);
  const statusText =
    status === 'SignedOff' ? 'Signed off ✓' : status === 'Open' ? 'Provisional' : SIGN_OFF_LABEL[status];

  return (
    <div ref={ref} data-tour="asof" className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-navy-700',
          PILL_TONE[status],
        )}
        title="The run every results screen is reading - click to switch version"
      >
        <span className="font-bold uppercase tracking-wider opacity-70">Run</span>
        <span className="text-navy-900">
          {scopeName} · <span className="font-mono">{formatDate(run.asOfDate)}</span> · v{versionOf(run, allRuns)}
        </span>
        <span className="font-bold">· {statusText}</span>
        {!isOfficial && (
          <span className="rounded bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            Not official
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-96 rounded-xl border border-gray-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Runs for {scopeName}</p>
            {!isOfficial && official && (
              <button
                type="button"
                onClick={() => {
                  selectOfficial();
                  setOpen(false);
                }}
                className="text-[12px] font-bold text-navy-700 hover:underline"
              >
                Use official
              </button>
            )}
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {series.map((s) => (
              <div key={s.key}>
                <p className="mb-1 font-mono text-[12px] font-bold text-navy-900">{formatDate(s.asOfDate)}</p>
                <ul className="space-y-0.5">
                  {s.versions.map((v) => {
                    const vs = signOffStatusOf(v);
                    const active = v.id === run.id;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => {
                            select(v.id);
                            setOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-gray-50',
                            active && 'bg-navy-50',
                          )}
                        >
                          <span className="text-navy-900">
                            v{versionOf(v, allRuns)}
                            {v.id === official?.run.id && (
                              <span className="ml-1.5 text-[11px] font-bold text-success">official</span>
                            )}
                          </span>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-bold', PILL_TONE[vs])}>
                            {SIGN_OFF_LABEL[vs]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <Link
            href={`/execution/history?run=${run.id}`}
            onClick={() => setOpen(false)}
            className="mt-3 block border-t border-gray-100 pt-2 text-[12px] font-bold text-navy-700 hover:underline"
          >
            Manage runs →
          </Link>
        </div>
      )}
    </div>
  );
}
