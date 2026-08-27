/**
 * The guided tour itself — a floating overlay, not a redesign of any
 * screen it walks through. Mounted once in `AppShell`, so every existing
 * page is untouched; the tour navigates the real router to the real
 * routes and narrates what's already there.
 *
 * Role-aware by construction: `tourStepsFor` returns a different script per
 * `RoleCode`, built from the same permission-gated screens `AppShell`
 * already restricts navigation to — an Executive Viewer's script never
 * names a screen their role couldn't open anyway.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { tourStepsFor, type TourTag } from './tourSteps';
import { TourContext, useTour, type TourContextValue } from './tourContext';

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => tourStepsFor(user?.role), [user?.role]);
  const step = active ? (steps[stepIndex] ?? null) : null;

  // `navigate()` deliberately never runs inside a setState updater — React
  // may re-invoke an updater more than once, and a navigation triggered
  // from inside one fired a "setState while rendering a different
  // component" warning (CommandPalette, a sibling under the same
  // provider, was the one caught by it). Reading `stepIndex` from the
  // closure and calling `navigate()` as a plain statement afterwards
  // avoids that entirely.
  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    if (steps[0]) navigate(steps[0].path);
  }, [steps, navigate]);

  const next = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= steps.length) {
      setActive(false);
      return;
    }
    setStepIndex(nextIndex);
    const nextStep = steps[nextIndex];
    if (nextStep) navigate(nextStep.path);
  }, [stepIndex, steps, navigate]);

  const back = useCallback(() => {
    const prevIndex = Math.max(0, stepIndex - 1);
    setStepIndex(prevIndex);
    const prevStep = steps[prevIndex];
    if (prevStep) navigate(prevStep.path);
  }, [stepIndex, steps, navigate]);

  const exit = useCallback(() => setActive(false), []);

  const value = useMemo<TourContextValue>(
    () => ({ active, step, stepIndex, stepCount: steps.length, start, next, back, exit }),
    [active, step, stepIndex, steps.length, start, next, back, exit],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay />
    </TourContext.Provider>
  );
}

const TAG_TONE: Record<TourTag, string> = {
  Input: 'bg-navy-100 text-navy-700',
  'Reference data': 'bg-teal-100 text-teal-700',
  Assumptions: 'bg-warning/10 text-warning',
  Result: 'bg-success/10 text-success',
  Control: 'bg-danger/10 text-danger',
};

function TourOverlay() {
  const { active, step, stepIndex, stepCount, next, back, exit } = useTour();
  if (!active || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === stepCount - 1;

  return (
    <div
      role="dialog"
      aria-label="Guided tour"
      className="fixed bottom-6 right-6 z-40 w-full max-w-sm rounded-2xl border border-navy-700 bg-white p-5 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Guided tour · {stepIndex + 1} of {stepCount}
        </span>
        <button
          type="button"
          onClick={exit}
          aria-label="End tour"
          className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-navy-900"
        >
          ✕
        </button>
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="text-[14px] font-bold text-navy-900">{step.title}</h2>
        {step.tag && (
          <span
            className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', TAG_TONE[step.tag])}
          >
            {step.tag}
          </span>
        )}
      </div>

      <p className="mb-4 text-[12px] leading-relaxed text-gray-600">{step.body}</p>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={isFirst}
          className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-gray-500 hover:text-navy-900 disabled:opacity-30"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exit}
            className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-gray-500 hover:text-navy-900"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-lg bg-navy-900 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700"
          >
            {isLast ? 'Finish' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The discoverable entry point — a button anywhere in the shell that starts the current role's tour. */
export function TourLauncher({ className }: { className?: string }) {
  const { start } = useTour();
  return (
    <button type="button" onClick={start} className={className}>
      Take the tour
    </button>
  );
}
