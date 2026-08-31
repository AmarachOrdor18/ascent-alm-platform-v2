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
const OnboardAffiliateResume = lazy(() =>
  import('@/pages/OnboardAffiliate').then((m) => ({ default: m.OnboardAffiliate })),
);
const SnapshotWorkbench = lazy(() =>
  import('@/pages/SnapshotWorkbench').then((m) => ({ default: m.SnapshotWorkbench })),
);

/**
 * Screens built so far. Anything absent renders the placeholder.
 *
 * Only paths that render a single, standalone screen live here. A screen
 * that's now a tab inside a module (see `src/pages/modules/*`) is imported
 * by its module wrapper instead — the wrapper is what's keyed here, once,
 * under the module's default tab path; its other tab paths are declared in
 * `MODULE_TAB_ROUTES` below, reusing the same lazy component so the same
 * chunk isn't requested twice.
 */
const BUILT: Record<string, ComponentType> = {
  '/dashboard': lazy(() => import('@/pages/results/Dashboard').then((m) => ({ default: m.Dashboard }))),

  // Phase 4 — business rules sub-editors, all on the shared RuleEditor shell.
  // The hub itself (previously `/rules`) is now the Configuration module's
  // "Business Rules" tab — see ConfigurationModule.tsx — but every one of
  // these 13 deep-linked editors it routes to is untouched.
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

  // Setup and onboarding — untouched by the navigation redesign.
  '/affiliates/onboard': lazy(() => import('@/pages/OnboardAffiliate').then((m) => ({ default: m.OnboardAffiliate }))),
  '/affiliates/bulk-onboard': lazy(() =>
    import('@/pages/BulkOnboardAffiliates').then((m) => ({ default: m.BulkOnboardAffiliates })),
  ),
};

/**
 * Module wrappers — one lazy-loaded component per module, reused across
 * every one of that module's tab paths (see `MODULE_TAB_ROUTES` below).
 * Each wrapper does its own internal lazy-loading of the individual screens
 * it groups, so per-tab code-splitting is unchanged from before the
 * redesign — see `src/pages/modules/*`.
 */
const LiquidityRiskModule = lazy(() =>
  import('@/pages/modules/LiquidityRiskModule').then((m) => ({ default: m.LiquidityRiskModule })),
);
const IrrbbModule = lazy(() => import('@/pages/modules/IrrbbModule').then((m) => ({ default: m.IrrbbModule })));
const StressTestingModule = lazy(() =>
  import('@/pages/modules/StressTestingModule').then((m) => ({ default: m.StressTestingModule })),
);
const ConcentrationModule = lazy(() =>
  import('@/pages/modules/ConcentrationModule').then((m) => ({ default: m.ConcentrationModule })),
);
const FtpProfitabilityModule = lazy(() =>
  import('@/pages/modules/FtpProfitabilityModule').then((m) => ({ default: m.FtpProfitabilityModule })),
);
const BalanceSheetTreasuryModule = lazy(() =>
  import('@/pages/modules/BalanceSheetTreasuryModule').then((m) => ({ default: m.BalanceSheetTreasuryModule })),
);
const ReportingModule = lazy(() =>
  import('@/pages/modules/ReportingModule').then((m) => ({ default: m.ReportingModule })),
);
const DataManagementModule = lazy(() =>
  import('@/pages/modules/DataManagementModule').then((m) => ({ default: m.DataManagementModule })),
);
const ExecutionModule = lazy(() =>
  import('@/pages/modules/ExecutionModule').then((m) => ({ default: m.ExecutionModule })),
);
const ConfigurationModule = lazy(() =>
  import('@/pages/modules/ConfigurationModule').then((m) => ({ default: m.ConfigurationModule })),
);
const AdministrationModule = lazy(() =>
  import('@/pages/modules/AdministrationModule').then((m) => ({ default: m.AdministrationModule })),
);
const GroupAffiliateModule = lazy(() =>
  import('@/pages/modules/GroupAffiliateModule').then((m) => ({ default: m.GroupAffiliateModule })),
);

BUILT['/risk/liquidity'] = LiquidityRiskModule;
BUILT['/risk/irrbb'] = IrrbbModule;
BUILT['/risk/stress-testing'] = StressTestingModule;
BUILT['/risk/concentration'] = ConcentrationModule;
BUILT['/treasury/ftp'] = FtpProfitabilityModule;
BUILT['/treasury/balance-sheet'] = BalanceSheetTreasuryModule;
BUILT['/reporting'] = ReportingModule;
BUILT['/data/operations'] = DataManagementModule;
BUILT['/connectors'] = DataManagementModule;
BUILT['/execution'] = ExecutionModule;
BUILT['/configuration'] = ConfigurationModule;
BUILT['/admin'] = AdministrationModule;
BUILT['/affiliates'] = GroupAffiliateModule;

/**
 * Every other tab path within a module — the module's default tab is
 * already registered above (it's a `NAV_GROUPS` entry, so `buildRouteOrder`
 * picks it up automatically); this covers the rest, all reusing the same
 * module component, which reads the URL itself to pick the active tab (see
 * `ModuleTabs.tsx`). The permission here is each module's own route-level
 * gate — the loosest permission among its tabs — not the finer per-tab
 * check `ModuleTabs` applies internally; see each module file's header
 * comment for why that permission was chosen.
 */
const MODULE_TAB_ROUTES: RouteEntry[] = [
  { path: '/risk/liquidity/risk-map', screenName: 'Liquidity Risk Map', Component: LiquidityRiskModule, permission: 'risk.view' },
  { path: '/risk/liquidity/gap-analysis', screenName: 'Maturity & Repricing Gap', Component: LiquidityRiskModule, permission: 'risk.view' },
  { path: '/risk/irrbb/behavioural-analysis', screenName: 'Behavioural Analysis', Component: IrrbbModule, permission: 'risk.view' },
  { path: '/risk/stress-testing/what-if', screenName: 'What-If Builder', Component: StressTestingModule, permission: 'risk.view' },
  { path: '/risk/concentration/limits', screenName: 'Limits & Breaches', Component: ConcentrationModule, permission: 'risk.view' },
  { path: '/risk/concentration/kri', screenName: 'Key Risk Indicators', Component: ConcentrationModule, permission: 'risk.view' },
  { path: '/treasury/ftp/profitability', screenName: 'Profitability Ratios', Component: FtpProfitabilityModule, permission: 'risk.view' },
  { path: '/treasury/balance-sheet/fx-position', screenName: 'FX Position', Component: BalanceSheetTreasuryModule, permission: 'treasury.view' },
  { path: '/reporting/regulatory', screenName: 'Regulatory Reporting', Component: ReportingModule, permission: 'reporting.view' },
  { path: '/reporting/ad-hoc', screenName: 'Ad-Hoc Analysis', Component: ReportingModule, permission: 'reporting.view' },
  { path: '/data/operations/gl-reconciliation', screenName: 'GL Reconciliation', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/operations/vintages', screenName: 'Data Vintages & Load History', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/operations/position-book', screenName: 'Position Book', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/structure', screenName: 'Data Structure', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/structure/counterparties', screenName: 'Counterparty Register', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/reference-data', screenName: 'Reference Data', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/reference-data/fx-rates', screenName: 'Currency & FX Rates', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/reference-data/economic-indicators', screenName: 'Economic Indicators', Component: DataManagementModule, permission: 'data.view' },
  { path: '/data/reference-data/holiday-calendar', screenName: 'Holiday Calendar', Component: DataManagementModule, permission: 'data.view' },
  { path: '/execution/history', screenName: 'Run History', Component: ExecutionModule, permission: 'risk.view' },
  { path: '/execution/scheduler', screenName: 'Batch Scheduler', Component: ExecutionModule, permission: 'risk.view' },
  { path: '/configuration/validation-rules', screenName: 'Validation Rules', Component: ConfigurationModule, permission: 'rules.edit' },
  { path: '/admin/remediation', screenName: 'Control Remediation', Component: AdministrationModule, permission: 'dashboard.view' },
  { path: '/admin/notifications', screenName: 'Notifications', Component: AdministrationModule, permission: 'dashboard.view' },
  { path: '/admin/users', screenName: 'Users, Roles & Permissions', Component: AdministrationModule, permission: 'dashboard.view' },
  { path: '/admin/preferences', screenName: 'System Preferences', Component: AdministrationModule, permission: 'dashboard.view' },
  { path: '/admin/audit', screenName: 'Audit Log', Component: AdministrationModule, permission: 'dashboard.view' },
];

/**
 * Old flat URLs, preserved as redirects to their new hierarchical home
 * rather than broken — bookmarks, typed URLs and any not-yet-updated
 * internal link keep working, they just land one hop further along.
 */
const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/liquidity-risk', to: '/risk/liquidity' },
  { from: '/risk-map', to: '/risk/liquidity/risk-map' },
  { from: '/gap-analysis', to: '/risk/liquidity/gap-analysis' },
  { from: '/interest-rate-risk', to: '/risk/irrbb' },
  { from: '/behavioural-analysis', to: '/risk/irrbb/behavioural-analysis' },
  { from: '/stress-testing', to: '/risk/stress-testing' },
  { from: '/what-if', to: '/risk/stress-testing/what-if' },
  { from: '/concentration', to: '/risk/concentration' },
  { from: '/limits', to: '/risk/concentration/limits' },
  { from: '/kri', to: '/risk/concentration/kri' },
  { from: '/ftp', to: '/treasury/ftp' },
  { from: '/profitability', to: '/treasury/ftp/profitability' },
  { from: '/balance-sheet', to: '/treasury/balance-sheet' },
  { from: '/fx-position', to: '/treasury/balance-sheet/fx-position' },
  { from: '/alco-meetings', to: '/reporting' },
  { from: '/alco-reporting', to: '/reporting' },
  { from: '/management-reporting', to: '/reporting' },
  { from: '/regulatory-reporting', to: '/reporting/regulatory' },
  { from: '/ad-hoc', to: '/reporting/ad-hoc' },
  { from: '/data', to: '/connectors' },
  { from: '/data-upload', to: '/data/operations' },
  { from: '/gl-reconciliation', to: '/data/operations/gl-reconciliation' },
  { from: '/data-vintages', to: '/data/operations/vintages' },
  { from: '/dimensions', to: '/data/structure' },
  { from: '/counterparties', to: '/data/structure/counterparties' },
  { from: '/yield-curves', to: '/data/reference-data' },
  { from: '/fx-rates', to: '/data/reference-data/fx-rates' },
  { from: '/economic-indicators', to: '/data/reference-data/economic-indicators' },
  { from: '/holiday-calendar', to: '/data/reference-data/holiday-calendar' },
  { from: '/runs/new', to: '/execution' },
  { from: '/runs', to: '/execution/history' },
  { from: '/scheduler', to: '/execution/scheduler' },
  { from: '/rules', to: '/configuration' },
  { from: '/validation-rules', to: '/configuration/validation-rules' },
  { from: '/approvals', to: '/admin' },
  { from: '/remediation', to: '/admin/remediation' },
  { from: '/notifications', to: '/admin/notifications' },
];

export interface RouteEntry {
  path: string;
  screenName: string;
  Component: ComponentType;
  /** Required to actually render the screen, not just to see it in the sidebar. */
  permission: string;
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
  { path: '/rules/ftp', screenName: 'FTP Rules' },
  { path: '/rules/adjustments', screenName: 'Adjustment Rules' },
  { path: '/affiliates/onboard', screenName: 'Onboard Affiliate' },
  { path: '/affiliates/bulk-onboard', screenName: 'Bulk Onboard Affiliates' },
  { path: '/data/operations', screenName: 'Data Operations' },
];

/**
 * The permission required to actually render a screen not listed in the
 * sidebar — everything under a hub's own gate inherits that hub's
 * permission, since it's reached by clicking through it.
 */
const UNLISTED_PERMISSION: Record<string, string> = {
  '/affiliates/onboard': 'group.manage',
  '/affiliates/bulk-onboard': 'group.manage',
  '/data/operations': 'data.view',
};

function permissionForUnlisted(path: string): string {
  if (path in UNLISTED_PERMISSION) return UNLISTED_PERMISSION[path]!;
  if (path.startsWith('/rules/')) return 'rules.edit';
  return 'dashboard.view';
}

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
      permission: item.permission,
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
      permission: permissionForUnlisted(path),
    }));

  const parameterised: RouteEntry[] = [
    { path: '/affiliates/onboard/:code', screenName: 'Resume Onboarding', Component: OnboardAffiliateResume, permission: 'group.manage' },
    { path: '/affiliates/:code', screenName: 'Affiliate Detail', Component: AffiliateDetail, permission: 'dashboard.view' },
    { path: '/position-book/snapshot/:id', screenName: 'Editable Snapshot', Component: SnapshotWorkbench, permission: 'data.view' },
  ];

  return [...navLiteral, ...unlisted, ...MODULE_TAB_ROUTES, ...parameterised];
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

/**
 * Blocks the screen behind a route, not just its sidebar link. The sidebar
 * already hides links a role can't reach, but every screen still rendered
 * in full for anyone who typed the URL directly or had a tab open from a
 * more privileged session — permission only ever gated the edit buttons
 * inside a page, never whether the page rendered at all. Read-only content
 * on a screen requiring a real permission (dashboard.view, granted to
 * every role) still renders for everyone, which is the point: view access
 * is broad by design, edit access is what's actually restricted.
 */
export function RouteGate({
  permission, screenName, children,
}: { permission: string; screenName?: string; children: React.ReactNode }) {
  const { hasPermission } = useAuth();
  if (hasPermission(permission)) return <>{children}</>;
  return (
    <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-[13px] font-bold text-navy-900">Access restricted</p>
      <p className="mt-1 text-[12px] text-gray-500">
        Your role doesn&rsquo;t have access to {screenName ?? 'this screen'}.
      </p>
    </div>
  );
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
          <Redirect to="/dashboard" />
        </Route>

        {LEGACY_REDIRECTS.map(({ from, to }) => (
          <Route key={from} path={from}>
            <Redirect to={to} />
          </Route>
        ))}

        {ROUTE_ORDER.map(({ path, screenName, Component, permission }) => (
          <Route key={path} path={path}>
            {/* Keyed by scope: a transient render error caught here otherwise
                latches until the whole app remounts (only logout did that),
                even after the affiliate/date that triggered it has changed.
                Re-keying on scope gives the screen a fresh mount attempt
                exactly when the user's next action already changes the
                inputs it will render with. */}
            <ScopedErrorBoundary screenName={screenName}>
              <Suspense fallback={<ScreenFallback />}>
                <RouteGate permission={permission} screenName={screenName}>
                  <Component />
                </RouteGate>
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
