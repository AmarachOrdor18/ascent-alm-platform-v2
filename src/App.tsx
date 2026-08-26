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
const AffiliateDetail = lazy(() => import('@/pages/AffiliateDetail').then((m) => ({ default: m.AffiliateDetail })));

/** Screens built so far. Anything absent renders the placeholder. */
const BUILT: Record<string, ComponentType> = {
  // Phase 6 — results, every one reading from a run rather than recomputing
  '/dashboard': lazy(() => import('@/pages/results/Dashboard').then((m) => ({ default: m.Dashboard }))),
  '/balance-sheet': lazy(() => import('@/pages/results/BalanceSheet').then((m) => ({ default: m.BalanceSheet }))),
  '/liquidity-risk': lazy(() => import('@/pages/results/LiquidityRisk').then((m) => ({ default: m.LiquidityRisk }))),
  '/gap-analysis': lazy(() => import('@/pages/results/GapAnalysis').then((m) => ({ default: m.GapAnalysis }))),
  '/interest-rate-risk': lazy(() => import('@/pages/results/Irrbb').then((m) => ({ default: m.Irrbb }))),
  '/ftp': lazy(() => import('@/pages/results/TransferPricing').then((m) => ({ default: m.TransferPricing }))),
  '/behavioural-analysis': lazy(() =>
    import('@/pages/results/BehaviouralAnalysis').then((m) => ({ default: m.BehaviouralAnalysis })),
  ),
  '/profitability': lazy(() => import('@/pages/results/Profitability').then((m) => ({ default: m.Profitability }))),
  '/concentration': lazy(() => import('@/pages/results/Concentration').then((m) => ({ default: m.Concentration }))),
  '/fx-position': lazy(() => import('@/pages/results/FxPosition').then((m) => ({ default: m.FxPosition }))),

  // Phase 7 — monitoring & control
  '/limits': lazy(() => import('@/pages/Limits').then((m) => ({ default: m.Limits }))),
  '/kri': lazy(() => import('@/pages/Kri').then((m) => ({ default: m.Kri }))),
  '/remediation': lazy(() => import('@/pages/Remediation').then((m) => ({ default: m.Remediation }))),
  '/approvals': lazy(() => import('@/pages/Approvals').then((m) => ({ default: m.Approvals }))),
  '/risk-map': lazy(() => import('@/pages/RiskMap').then((m) => ({ default: m.RiskMap }))),
  '/notifications': lazy(() => import('@/pages/Notifications').then((m) => ({ default: m.Notifications }))),

  // Phase 8 — reporting & admin
  '/alco-meetings': lazy(() => import('@/pages/AlcoMeetings').then((m) => ({ default: m.AlcoMeetings }))),
  '/regulatory-reporting': lazy(() => import('@/pages/RegulatoryReporting').then((m) => ({ default: m.RegulatoryReporting }))),
  '/alco-reporting': lazy(() => import('@/pages/AlcoReporting').then((m) => ({ default: m.AlcoReporting }))),
  '/management-reporting': lazy(() => import('@/pages/ManagementReporting').then((m) => ({ default: m.ManagementReporting }))),
  '/ad-hoc': lazy(() => import('@/pages/AdHoc').then((m) => ({ default: m.AdHoc }))),
  '/admin/users': lazy(() => import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsers }))),
  '/admin/preferences': lazy(() => import('@/pages/AdminPreferences').then((m) => ({ default: m.AdminPreferences }))),
  '/admin/audit': lazy(() => import('@/pages/AdminAudit').then((m) => ({ default: m.AdminAudit }))),

  // Phase 5 — execution
  '/runs/new': lazy(() => import('@/pages/ProcessRun').then((m) => ({ default: m.ProcessRun }))),
  '/runs': lazy(() => import('@/pages/RunHistory').then((m) => ({ default: m.RunHistory }))),
  '/scheduler': lazy(() => import('@/pages/BatchScheduler').then((m) => ({ default: m.BatchScheduler }))),
  '/what-if': lazy(() => import('@/pages/WhatIf').then((m) => ({ default: m.WhatIf }))),
  '/stress-testing': lazy(() => import('@/pages/StressTesting').then((m) => ({ default: m.StressTesting }))),

  // Phase 4 — business rules, all on the shared RuleEditor shell
  '/rules': lazy(() => import('@/pages/rules/ModelsAssumptions').then((m) => ({ default: m.ModelsAssumptions }))),
  '/rules/time-buckets': lazy(() =>
    import('@/pages/rules/TimeBucketRules').then((m) => ({ default: m.TimeBucketRules })),
  ),
  '/rules/product-characteristics': lazy(() =>
    import('@/pages/rules/ProductCharacteristics').then((m) => ({ default: m.ProductCharacteristics })),
  ),
  '/rules/behaviour-patterns': lazy(() =>
    import('@/pages/rules/BehaviourPatterns').then((m) => ({ default: m.BehaviourPatterns })),
  ),
  '/rules/patterns': lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.Patterns }))),
  '/rules/prepayment': lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.PrepaymentRules }))),
  '/rules/discount-methods': lazy(() =>
    import('@/pages/rules/SimpleRules').then((m) => ({ default: m.DiscountMethods })),
  ),
  '/rules/scenarios': lazy(() =>
    import('@/pages/rules/ForecastScenarios').then((m) => ({ default: m.ForecastScenarios })),
  ),
  '/rules/new-business': lazy(() => import('@/pages/rules/NewBusiness').then((m) => ({ default: m.NewBusiness }))),
  '/rules/transaction-strategies': lazy(() =>
    import('@/pages/rules/TransactionStrategies').then((m) => ({ default: m.TransactionStrategies })),
  ),
  '/rules/ftp': lazy(() => import('@/pages/rules/FtpAndAdjustments').then((m) => ({ default: m.FtpRules }))),
  '/rules/adjustments': lazy(() =>
    import('@/pages/rules/FtpAndAdjustments').then((m) => ({ default: m.AdjustmentRules })),
  ),
  '/rules/filters': lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.Filters }))),
  '/rules/custom-metrics': lazy(() =>
    import('@/pages/rules/CustomMetrics').then((m) => ({ default: m.CustomMetrics })),
  ),

  // Phase 3 — setup and onboarding
  '/affiliates': lazy(() => import('@/pages/Affiliates').then((m) => ({ default: m.Affiliates }))),
  '/affiliates/onboard': lazy(() => import('@/pages/OnboardAffiliate').then((m) => ({ default: m.OnboardAffiliate }))),
  '/connectors': lazy(() => import('@/pages/Connectors').then((m) => ({ default: m.Connectors }))),
  '/data-upload': lazy(() => import('@/pages/DataUpload').then((m) => ({ default: m.DataUpload }))),
  '/data-vintages': lazy(() => import('@/pages/DataVintages').then((m) => ({ default: m.DataVintages }))),
  '/validation-rules': lazy(() => import('@/pages/ValidationRules').then((m) => ({ default: m.ValidationRules }))),
  '/gl-reconciliation': lazy(() => import('@/pages/GlReconciliation').then((m) => ({ default: m.GlReconciliation }))),

  // Phase 2 — dimensions and reference data
  '/dimensions': lazy(() => import('@/pages/Dimensions').then((m) => ({ default: m.Dimensions }))),
  '/counterparties': lazy(() => import('@/pages/Counterparties').then((m) => ({ default: m.Counterparties }))),
  '/yield-curves': lazy(() => import('@/pages/YieldCurves').then((m) => ({ default: m.YieldCurves }))),
  '/fx-rates': lazy(() => import('@/pages/FxRates').then((m) => ({ default: m.FxRates }))),
  '/economic-indicators': lazy(() =>
    import('@/pages/EconomicIndicators').then((m) => ({ default: m.EconomicIndicators })),
  ),
  '/holiday-calendar': lazy(() => import('@/pages/HolidayCalendar').then((m) => ({ default: m.HolidayCalendar }))),
};

export interface RouteEntry {
  path: string;
  screenName: string;
  Component: ComponentType;
}

/**
 * Screens built but not in the sidebar nav — reached only via a link from
 * another screen (a Dashboard tile, a rule-editor row) or a typed URL.
 * `buildRouteOrder` used to source routes from `ALL_NAV_ITEMS` alone, so
 * every one of these rendered "Screen not found" no matter how it was
 * reached: the component existed in `BUILT` but the router never declared
 * a `<Route>` for its path at all.
 */
const UNLISTED_SCREENS: Array<{ path: string; screenName: string }> = [
  { path: '/rules/time-buckets', screenName: 'Time Buckets' },
  { path: '/rules/product-characteristics', screenName: 'Product Characteristics' },
  { path: '/rules/behaviour-patterns', screenName: 'Behaviour Patterns' },
  { path: '/rules/patterns', screenName: 'Payment & Repricing Patterns' },
  { path: '/rules/prepayment', screenName: 'Prepayment' },
  { path: '/rules/discount-methods', screenName: 'Discount Methods' },
  { path: '/rules/scenarios', screenName: 'Forecast Scenarios' },
  { path: '/rules/new-business', screenName: 'New Business' },
  { path: '/rules/transaction-strategies', screenName: 'Transaction Strategies' },
  { path: '/rules/filters', screenName: 'Filters' },
  { path: '/rules/custom-metrics', screenName: 'Custom Metrics' },
];

/**
 * Every route, in the order `Switch` evaluates them — first match wins.
 *
 * This is an ordered array rather than inline JSX because the order carries a
 * correctness requirement that is otherwise invisible. `/affiliates/:code`
 * matches every literal path beneath `/affiliates`, including
 * `/affiliates/onboard`. Declared before the nav routes it swallowed the
 * onboarding wizard and rendered a blank page — the click did nothing, with
 * no error to follow.
 *
 * Literal paths must therefore precede parameterised ones. `routing.test.ts`
 * holds that invariant against this array, which only works while the router
 * renders from it rather than from a hand-maintained copy.
 */
/* eslint-disable react-refresh/only-export-components */
export const buildRouteOrder = (): RouteEntry[] => {
  const navLiteral: RouteEntry[] = ALL_NAV_ITEMS.map((item) => {
    const Built = BUILT[item.path];
    return {
      path: item.path,
      screenName: item.name,
      Component: Built ?? (() => <Placeholder item={item} />),
    };
  });

  const navPaths = new Set(navLiteral.map((r) => r.path));

  // Every BUILT screen gets a route even when nothing in the sidebar points
  // at it. UNLISTED_SCREENS supplies a readable name for the ones known
  // ahead of time; anything left over (a future screen added to BUILT
  // without updating this list) still gets a route, just with its path as
  // the fallback name, so a broken link can never silently 404 again.
  const unlisted: RouteEntry[] = Object.keys(BUILT)
    .filter((path) => !navPaths.has(path))
    .map((path) => ({
      path,
      screenName: UNLISTED_SCREENS.find((s) => s.path === path)?.screenName ?? path,
      Component: BUILT[path]!,
    }));

  const parameterised: RouteEntry[] = [
    { path: '/affiliates/:code', screenName: 'Affiliate Detail', Component: AffiliateDetail },
  ];

  return [...navLiteral, ...unlisted, ...parameterised];
}
/* eslint-enable react-refresh/only-export-components */

const ROUTE_ORDER = buildRouteOrder();

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

/** ErrorBoundary re-keyed by scope, so a caught error resets when the affiliate or as-of date it was caught under changes, instead of requiring a full remount. */
function ScopedErrorBoundary({ screenName, children }: { screenName?: string; children: React.ReactNode }) {
  const { affiliateCode, asOfDate } = useScope();
  return (
    <ErrorBoundary key={`${affiliateCode}:${asOfDate ?? ''}`} screenName={screenName}>
      {children}
    </ErrorBoundary>
  );
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
          <Redirect to="/affiliates" />
        </Route>

        {ROUTE_ORDER.map(({ path, screenName, Component }) => (
          <Route key={path} path={path}>
            {/* Keyed by scope: a transient render error caught here otherwise
                latches until the whole app remounts (only logout did that),
                even after the affiliate/date that triggered it has changed.
                Re-keying on scope gives the screen a fresh mount attempt
                exactly when the user's next action already changes the
                inputs it will render with. */}
            <ScopedErrorBoundary screenName={screenName}>
              <Suspense fallback={<ScreenFallback />}>
                <Component />
              </Suspense>
            </ScopedErrorBoundary>
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
