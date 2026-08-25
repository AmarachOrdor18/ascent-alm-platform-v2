/**
 * Router.
 *
 * Every route is lazy-loaded and individually wrapped in an ErrorBoundary.
 * v1 shipped a single 924 KB bundle containing all 29 pages and had no error
 * boundary at all, so one render exception blanked the application
 * (engineering register §3.7).
 */

import { Suspense, lazy } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { AppShell } from '@/components/layout/AppShell';
import { ALL_NAV_ITEMS } from '@/components/layout/navigation';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/context/AuthContext';

const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Placeholder = lazy(() => import('@/pages/Placeholder').then((m) => ({ default: m.Placeholder })));

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-live="polite">
      <span className="text-[12px] text-gray-400">Loading…</span>
    </div>
  );
}

export function App() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <AppShell>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>

        {ALL_NAV_ITEMS.map((item) => (
          <Route key={item.path} path={item.path}>
            <ErrorBoundary screenName={item.name}>
              <Suspense fallback={<ScreenFallback />}>
                <Placeholder item={item} />
              </Suspense>
            </ErrorBoundary>
          </Route>
        ))}

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
