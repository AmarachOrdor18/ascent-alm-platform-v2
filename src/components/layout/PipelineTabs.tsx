import { Suspense, type ComponentType } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { CheckCircleIcon, HistoryIcon } from '@/components/icons/Icons';

export interface PipelineStep {
  key: string;
  label: string;
  path: string;
  permission: string;
  Component: ComponentType;
  /** Best-effort completion signal for the current scope - drives a checkmark, never gates access to the step. */
  done?: boolean;
}

export interface PipelineHistoryLink {
  key: string;
  label: string;
  path: string;
  permission: string;
  Component: ComponentType;
}

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-live="polite">
      <span className="text-[12px] text-gray-400">Loading…</span>
    </div>
  );
}

function AccessRestricted() {
  return (
    <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
      <p className="mt-1 text-[12px] text-gray-500">
        Your role doesn&rsquo;t have access to any step in this pipeline.
      </p>
    </div>
  );
}

/**
 * A numbered, sequential alternative to `ModuleTabs` for a small set of pipeline steps that
 * genuinely happen in order (upload → reconcile → admit), plus one unnumbered "history" entry
 * off to the side for the log a user checks any time rather than completes. Kept separate from
 * `ModuleTabs` - which every other module reuses as a plain tab strip - so this visual/interaction
 * shape stays contained to the one place it actually applies.
 */
export function PipelineTabs({ steps, history }: { steps: PipelineStep[]; history?: PipelineHistoryLink }) {
  const [location] = useLocation();
  const { hasPermission } = useAuth();
  const visibleSteps = steps.filter((s) => hasPermission(s.permission));
  const visibleHistory = history && hasPermission(history.permission) ? history : undefined;

  if (visibleSteps.length === 0 && !visibleHistory) return <AccessRestricted />;

  const activeStep = visibleSteps.find((s) => location === s.path);
  const active =
    activeStep ??
    (visibleHistory && location === visibleHistory.path ? visibleHistory : null) ??
    visibleSteps[0] ??
    visibleHistory!;
  const ActiveComponent = active.Component;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <ol className="flex flex-wrap items-center gap-2">
          {visibleSteps.map((step, i) => {
            const isActive = step.key === active.key;
            const isDone = step.done === true;
            return (
              <li key={step.key} className="flex items-center gap-2">
                <Link
                  href={step.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors',
                    isActive ? 'bg-navy-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-navy-900',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      isActive
                        ? 'bg-white text-navy-900'
                        : isDone
                          ? 'bg-success text-white'
                          : 'border border-gray-300 text-gray-500',
                    )}
                  >
                    {isDone && !isActive ? <CheckCircleIcon className="h-3 w-3" /> : i + 1}
                  </span>
                  {step.label}
                  {isDone && <span className="sr-only">, completed</span>}
                </Link>
                {i < visibleSteps.length - 1 && (
                  <span aria-hidden="true" className="text-gray-300">
                    →
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {visibleHistory && (
          <Link
            href={visibleHistory.path}
            aria-current={active.key === visibleHistory.key ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors',
              active.key === visibleHistory.key
                ? 'border-navy-700 bg-navy-50 text-navy-900'
                : 'border-gray-200 text-gray-500 hover:border-navy-700 hover:text-navy-900',
            )}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            {visibleHistory.label}
          </Link>
        )}
      </div>

      <Suspense fallback={<ScreenFallback />}>
        <ActiveComponent />
      </Suspense>
    </>
  );
}
