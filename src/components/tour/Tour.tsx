/// <reference types="vite/client" />
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { isSupabaseMode } from '@/lib/supabase';
import { repository } from '@/store/repositoryInstance';
import { SEARCH_INDEX } from '@/components/layout/navigation';
import { GETTING_STARTED_ID, toursFor, TOUR_VERSION } from './tourSteps';
import type { TourStep } from './tourTypes';
import { TourContext, useTour, type TourContextValue, type TourDirection } from './tourContext';

// Local (IndexedDB) mode only - on Supabase the "seen" flag lives on the user record (app_users.data.toursSeen).
const seenKey = (userId: string) => `ascent-alm-onboarding-seen-v${TOUR_VERSION}:${userId}`;

// Every page chunk, so each route the tour visits is already loaded when it navigates there.
const PAGE_LOADERS = import.meta.glob(['/src/pages/**/*.tsx', '!/src/pages/**/*.test.tsx']);

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, role, login } = useAuth();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<TourDirection>('forward');

  const tours = useMemo(() => toursFor(role), [role]);
  const [activeTourId, setActiveTourId] = useState(GETTING_STARTED_ID);
  const steps = useMemo(() => tours.find((t) => t.id === activeTourId)?.steps ?? [], [tours, activeTourId]);

  const start = useCallback((tourId: string = GETTING_STARTED_ID) => {
    for (const load of Object.values(PAGE_LOADERS)) void load();
    setActiveTourId(tourId);
    setDirection('forward');
    setStepIndex(0);
    setOpen(true);
  }, []);

  const finish = useCallback(() => setOpen(false), []);
  const skip = finish;

  const next = useCallback(() => {
    setDirection('forward');
    if (stepIndex + 1 >= steps.length) setOpen(false);
    else setStepIndex(stepIndex + 1);
  }, [stepIndex, steps.length]);

  const back = useCallback(() => {
    setDirection('back');
    setStepIndex(Math.max(0, stepIndex - 1));
  }, [stepIndex]);

  const passOver = useCallback(() => {
    // Going back past the first step has nowhere to go - turn round rather than strand the user.
    if (direction === 'back' && stepIndex > 0) back();
    else next();
  }, [direction, stepIndex, back, next]);

  // Auto-start once per user per tour version; the header "?" replays it any time.
  useEffect(() => {
    const gs = tours.find((t) => t.id === GETTING_STARTED_ID);
    if (!user || !gs || gs.steps.length < 2) return;
    if (isSupabaseMode) {
      if ((user.toursSeen?.[GETTING_STARTED_ID] ?? 0) >= TOUR_VERSION) return;
      const toursSeen = { ...user.toursSeen, [GETTING_STARTED_ID]: TOUR_VERSION };
      // Marked seen in the session first, so this effect does not fire again while the write is in flight.
      login({ ...user, toursSeen });
      // Written onto a freshly read record so a stale session copy never overwrites other fields.
      void repository
        .getUserByEmail(user.email)
        .then((fresh) =>
          fresh ? repository.upsertUser({ ...fresh, toursSeen: { ...fresh.toursSeen, ...toursSeen } }) : undefined,
        )
        .catch(() => undefined);
      start();
      return;
    }
    try {
      if (localStorage.getItem(seenKey(user.id))) return;
      localStorage.setItem(seenKey(user.id), new Date().toISOString());
    } catch {
      return;
    }
    start();
  }, [user, tours, start, login]);

  const value = useMemo<TourContextValue>(
    () => ({ open, tours, activeTourId, steps, stepIndex, direction, start, next, back, skip, finish, passOver }),
    [open, tours, activeTourId, steps, stepIndex, direction, start, next, back, skip, finish, passOver],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {open && steps[stepIndex] && <TourOverlay />}
    </TourContext.Provider>
  );
}

// ─── DOM helpers ────────────────────────────────────────────────────────────

const RESOLVE_TIMEOUT_MS = 4000;
const SPOT_PAD = 6;
const CARD_W = 340;
const EDGE = 16;
const GAP = 14;
const DIM = 'rgba(15,23,42,0.65)';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

const norm = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Resolves a step selector. Plain CSS, plus two text-anchored forms so page-specific elements need no
 * one-off ids: `heading:<text>` - the section/card whose h1-h4 starts with <text>; `button:<text>` -
 * a button or link whose label starts with <text>. Text matching is case- and whitespace-insensitive.
 */
function candidates(selector: string): HTMLElement[] {
  try {
    if (selector.startsWith('heading:')) {
      const want = norm(selector.slice('heading:'.length));
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          'main h1, main h2, main h3, main h4, [data-tour="drawer"] h2, [data-tour="drawer"] h3',
        ),
      )
        .filter((h) => norm(h.textContent).startsWith(want))
        .map((h) => h.closest<HTMLElement>('section, article, [data-tour-section]') ?? h.parentElement ?? h);
    }
    if (selector.startsWith('button:')) {
      const want = norm(selector.slice('button:'.length));
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          'main button, main a, [data-tour="drawer"] button, [role="dialog"] button',
        ),
      ).filter((b) => !b.closest('[data-tour-overlay]') && norm(b.textContent).startsWith(want));
    }
    return Array.from(document.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

function findVisible(selector: string): HTMLElement | null {
  for (const el of candidates(selector)) if (isVisible(el)) return el;
  return null;
}

async function waitFor(selector: string, isCancelled: () => boolean): Promise<HTMLElement | null> {
  const deadline = Date.now() + RESOLVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isCancelled()) return null;
    const el = findVisible(selector);
    if (el) return el;
    await wait(100);
  }
  return null;
}

/** Resolves once the element's box has held still for a few frames - side panels slide in. */
async function settle(el: HTMLElement, isCancelled: () => boolean): Promise<void> {
  let last = el.getBoundingClientRect();
  let stillFrames = 0;
  const deadline = Date.now() + 1500;
  while (stillFrames < 6 && Date.now() < deadline) {
    await frame();
    if (isCancelled()) return;
    const r = el.getBoundingClientRect();
    const same =
      Math.abs(r.top - last.top) < 0.5 &&
      Math.abs(r.left - last.left) < 0.5 &&
      Math.abs(r.width - last.width) < 0.5 &&
      Math.abs(r.height - last.height) < 0.5;
    stillFrames = same ? stillFrames + 1 : 0;
    last = r;
  }
}

/** React-safe typing: the native setter bypasses React's value tracking so onChange fires. */
function fillInput(el: HTMLElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Closes any side panel / modal a previous step opened, via its own close control. */
async function closePanels() {
  const panels = document.querySelectorAll<HTMLElement>('[data-tour="drawer"]');
  if (panels.length === 0) return;
  for (const panel of panels) {
    const close = panel.querySelector<HTMLElement>('[data-tour="drawer-close"]');
    if (close) close.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  await wait(250);
}

function currentRoute() {
  return window.location.pathname + window.location.search;
}

function pageNameFor(route: string): string | null {
  const [path, query] = route.split('?');
  const withQuery = SEARCH_INDEX.find((i) => i.path === route);
  if (withQuery) return withQuery.name;
  const exact = SEARCH_INDEX.find((i) => i.path === path && !query);
  if (exact) return exact.name;
  return SEARCH_INDEX.find((i) => i.path === path)?.name ?? null;
}

/** Label for each step: explicit section, else the page its route names, else whatever the previous step was on. */
function labelsFor(steps: TourStep[]): string[] {
  const out: string[] = [];
  let last = 'Welcome';
  for (const s of steps) {
    const name = s.section ?? (s.route ? pageNameFor(s.route) : null) ?? last;
    out.push(name);
    last = name;
  }
  return out;
}

// ─── Overlay ────────────────────────────────────────────────────────────────

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function TourOverlay() {
  const { steps, stepIndex, next, back, skip, finish, passOver } = useTour();
  const [, navigate] = useLocation();
  const step = steps[stepIndex]!;
  const labels = useMemo(() => labelsFor(steps), [steps]);

  const targetRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState<Box | null>(null);

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    setBox({
      top: r.top - SPOT_PAD,
      left: r.left - SPOT_PAD,
      width: r.width + SPOT_PAD * 2,
      height: r.height + SPOT_PAD * 2,
    });
  }, []);

  // Resolve the step: navigate, click, fill, wait for the target to exist and settle, then spotlight.
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    setReady(false);
    setBox(null);
    targetRef.current = null;

    (async () => {
      if (step.route) {
        if (!step.route.includes('?')) await closePanels();
        if (isCancelled()) return;
        if (currentRoute() !== step.route) navigate(step.route);
      }
      if (step.click) {
        const el = await waitFor(step.click, isCancelled);
        if (isCancelled()) return;
        el?.click();
        await wait(150);
      }
      if (step.fill) {
        const el = await waitFor(step.fill.selector, isCancelled);
        if (isCancelled()) return;
        if (el) fillInput(el, step.fill.value);
        await wait(150);
      }
      if (!step.selector) {
        setReady(true);
        return;
      }
      const el = await waitFor(step.selector, isCancelled);
      if (isCancelled()) return;
      if (!el) {
        passOver();
        return;
      }
      await settle(el, isCancelled);
      if (isCancelled()) return;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      await settle(el, isCancelled);
      if (isCancelled()) return;
      targetRef.current = el;
      measure();
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // Re-resolve only when the step itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, steps]);

  // Keep the spotlight glued to its target on scroll (capture phase - inner scroll containers too) and resize.
  useEffect(() => {
    if (!ready || !step.selector) return;
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [ready, step.selector, measure]);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  const onNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    if (step.clickOnNext && targetRef.current) targetRef.current.click();
    next();
  }, [isLast, finish, step.clickOnNext, next]);

  // Keyboard: → Next, ← Back, Esc skip. Capture phase so the page's own handlers don't also react;
  // synthetic events (closePanels' Escape) are left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft' && !isFirst) back();
      else if (e.key === 'Escape') skip();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onNext, back, skip, isFirst]);

  const spotlight = ready && box !== null;

  return (
    <div data-tour-overlay className="fixed inset-0 z-[1000]" role="presentation">
      {/* Click shield - the tour performs any clicks a step needs. */}
      <div className="absolute inset-0" aria-hidden="true" />
      {spotlight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-lg transition-[top,left,width,height] duration-300 ease-out"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: `0 0 0 9999px ${DIM}`,
          }}
        />
      ) : (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: DIM }} />
      )}
      {ready && (
        <TourCard
          key={stepIndex}
          step={step}
          label={labels[stepIndex] ?? ''}
          stepIndex={stepIndex}
          stepCount={steps.length}
          target={spotlight ? box : null}
          isFirst={isFirst}
          isLast={isLast}
          onNext={onNext}
          onBack={back}
          onSkip={skip}
        />
      )}
    </div>
  );
}

function placeCard(target: Box | null, cardH: number): { top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - EDGE * 2);
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), vw - width - EDGE);
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), vh - cardH - EDGE);

  if (!target) return { top: clampY((vh - cardH) / 2), left: clampX((vw - width) / 2), width };

  const below = target.top + target.height + GAP;
  if (below + cardH <= vh - EDGE) return { top: below, left: clampX(target.left), width };
  const above = target.top - GAP - cardH;
  if (above >= EDGE) return { top: above, left: clampX(target.left), width };
  const leftX = target.left - GAP - width;
  if (leftX >= EDGE) return { top: clampY(target.top), left: leftX, width };
  const rightX = target.left + target.width + GAP;
  if (rightX + width <= vw - EDGE) return { top: clampY(target.top), left: rightX, width };
  return { top: vh - cardH - EDGE, left: vw - width - EDGE, width };
}

function TourCard({
  step,
  label,
  stepIndex,
  stepCount,
  target,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}: {
  step: TourStep;
  label: string;
  stepIndex: number;
  stepCount: number;
  target: Box | null;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Place from the card's measured height, not a guess; re-place when the target moves or the window resizes.
  useLayoutEffect(() => {
    const place = () => {
      const h = cardRef.current?.offsetHeight ?? 0;
      setPos(placeCard(target, h));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [target]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-card-title"
      className="fixed z-[1001] animate-in fade-in-0 duration-150 rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.width ?? CARD_W,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip tour"
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-navy-900"
      >
        ✕
      </button>
      <p className="pr-6 text-[11px] font-bold uppercase tracking-wider text-gold-600">
        {label} · step {stepIndex + 1} of {stepCount}
      </p>
      <h2 id="tour-card-title" className="mt-1.5 text-[16px] font-semibold text-navy-900">
        {step.title}
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">{step.body}</p>
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-gold-500" style={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5">
        {!isFirst && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-gray-500 hover:bg-gray-100 hover:text-navy-900"
          >
            Back
          </button>
        )}
        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-gray-500 hover:bg-gray-100 hover:text-navy-900"
          >
            Skip tour
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-navy-900 px-4 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700"
        >
          {isFirst ? 'Start' : isLast ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );
}

/** Header "?" - replay Getting started, or pick a module tour. */
export function TourLauncher({ className }: { className?: string }) {
  const { start, tours } = useTour();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Guided tours"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Guided tours"
        data-tour="help"
        className={className}
      >
        ?
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-gold-600">Guided tours</p>
          {tours.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                start(t.id);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            >
              <span className="block text-[13px] font-bold text-navy-900">{t.title}</span>
              <span className="block text-[12px] text-gray-500">
                {t.description} · {t.steps.length} steps
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
