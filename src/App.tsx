/**
 * Router.
 *
 * Every route is lazy-loaded and individually wrapped in an ErrorBoundary.
 * v1 shipped a single 924 KB bundle containing all 29 pages and had no error
 * boundary at all, so one render exception blanked the application
 * (engineering register §3.7).
 *
 * Screens a later phase builds still appear in navigation, rendering an
 * honest placeholder that names the phase, so the information architecture
 * is reviewable from day one.
 */

import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { AppShell } from '@/components/layout/AppShell';
import { ALL_NAV_ITEMS } from '@/components/layout/navigation';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { repository } from '@/store/localRepository';
import { ensureSeeded } from '@/data/seed/bootstrap';
import { useAffiliates } from '@/lib/hooks';

const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Placeholder = lazy(() => import('@/pages/Placeholder').then((m) => ({ default: m.Placeholder })));

/** Screens built so far. Anything absent renders the placeholder. */
const BUILT: Record<string, ComponentType> = {
  '/dimensions': lazy(() => import('@/pages/Dimensions').then((m) => ({ default: m.Dimensions }))),
  '/counterparties': lazy(() => import('@/pages/Counterparties').then((m) => ({ default: m.Counterparties }))),
  '/yield-curves': lazy(() => import('@/pages/YieldCurves').then((m) => ({ default: m.YieldCurves }))),
  '/fx-rates': lazy(() => import('@/pages/FxRates').then((m) => ({ default: m.FxRates }))),
  '/economic-indicators': lazy(() =>
    import('@/pages/EconomicIndicators').then((m) => ({ default: m.EconomicIndicators })),
  ),
  '/holiday-calendar': lazy(() => import('@/pages/HolidayCalendar').then((m) => ({ default: m.HolidayCalendar }))),
};

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-live="polite">
      <span className="text-[12px] text-gray-400">Loading…</span>
    </div>
  );
}

/** Keeps the affiliate list in scope context in step with the store. */
function ScopeSync() {
  const { data: affiliates } = useAffiliates();
  const { setAffiliates } = useScope();
  useEffect(() => {
    if (affiliates) setAffiliates(affiliates);
  }, [affiliates, setAffiliates]);
  return null;
}

export function App() {
  const { isAuthenticated } = useAuth();
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    ensureSeeded(repository)
      .then(() => setSeeded(true))
      .catch((err: unknown) => setSeedError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (seedError) {
    return (
      <div role="alert" className="m-6 rounded-2xl border border-danger/20 bg-danger-bg p-6">
        <h1 className="mb-1 text-[14px] font-bold text-navy-900">The local database could not be opened</h1>
        <p className="text-[12px] text-gray-600">{seedError}</p>
      </div>
    );
  }

  if (!seeded) return <ScreenFallback />;

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <AppShell>
      <ScopeSync />
      <Switch>
        <Route path="/">
          <Redirect to="/dimensions" />
        </Route>

        {ALL_NAV_ITEMS.map((item) => {
          const Built = BUILT[item.path];
          return (
            <Route key={item.path} path={item.path}>
              <ErrorBoundary screenName={item.name}>
                <Suspense fallback={<ScreenFallback />}>{Built ? <Built /> : <Placeholder item={item} />}</Suspense>
              </ErrorBoundary>
            </Route>
          );
        })}

        <Route>
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-[13px] font-bold text-navy-900">Screen not found</p>
            <p className="mt-1 text-[12px] text-gray-500">That address does not match any screen in the platform.</p>
          </div>
        </Route>
      </Switch>
    </AppShell>
  );
}
