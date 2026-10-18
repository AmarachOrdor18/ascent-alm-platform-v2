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
import { Link, Redirect, Route, Switch, useLocation, useParams } from 'wouter';
import { AppShell } from '@/components/layout/AppShell';
import { ALL_NAV_ITEMS } from '@/components/layout/navigation';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/context/AuthContext';
import { GROUP_CODE, useScope } from '@/context/ScopeContext';
import { isSupabaseMode, repository } from '@/store/repositoryInstance';
import { ensureSeeded } from '@/data/seed/bootstrap';
import { useAffiliates } from '@/lib/hooks';
import { PreparingWorkspace } from '@/pages/welcome/WelcomeIntro';
import {
  AREA_ROUTES,
  AdminArea,
  ApproveArea,
  AssumptionsArea,
  DataArea,
  ReportsArea,
  ResultsArea,
} from '@/pages/areas/Areas';
import { useOnboardingRecord } from '@/lib/onboardingHooks';
import {
  ORG_ONBOARDING_ID,
  affiliateOnboardingId,
  onboardingHandledKey,
  onboardingRedirect,
  resolveLanding,
} from '@/lib/onboarding';

const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Placeholder = lazy(() => import('@/pages/Placeholder').then((m) => ({ default: m.Placeholder })));
const AffiliateDetail = lazy(() => import('@/pages/AffiliateDetail').then((m) => ({ default: m.AffiliateDetail })));
const AffiliateSettings = lazy(() =>
  import('@/pages/AffiliateSettings').then((m) => ({ default: m.AffiliateSettings })),
);
const OnboardAffiliateResume = lazy(() =>
  import('@/pages/OnboardAffiliate').then((m) => ({ default: m.OnboardAffiliate })),
);
const OrganisationOnboarding = lazy(() =>
  import('@/pages/welcome/OrganisationOnboarding').then((m) => ({ default: m.OrganisationOnboarding })),
);
const AffiliateWelcome = lazy(() =>
  import('@/pages/welcome/AffiliateWelcome').then((m) => ({ default: m.AffiliateWelcome })),
);
const MyAccount = lazy(() => import('@/pages/MyAccount').then((m) => ({ default: m.MyAccount })));
const SnapshotWorkbench = lazy(() =>
  import('@/pages/SnapshotWorkbench').then((m) => ({ default: m.SnapshotWorkbench })),
);

/**
 * Screens built so far. Anything absent renders the placeholder.
 *
 * Only paths that render a single, standalone screen live here. A screen
 * that's now a tab inside a module (see `src/pages/modules/*`) is imported
 * by its module wrapper instead - the wrapper is what's keyed here, once,
 * under the module's default tab path; its other tab paths are declared in
 * `MODULE_TAB_ROUTES` below, reusing the same lazy component so the same
 * chunk isn't requested twice.
 */
const BUILT: Record<string, ComponentType> = {
  '/dashboard': lazy(() => import('@/pages/results/Dashboard').then((m) => ({ default: m.Dashboard }))),

  // Business rules sub-editors, all on the shared RuleEditor shell. The hub itself is now the Group
  // row's own Settings page's "Business Rules" categories (see AffiliateSettings.tsx), which mounts
  // each of these 13 editors inline; the deep-linked routes below stay live too, untouched, for
  // anything (or anyone) still pointed at the old flat URL.
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
  '/rules/cost-allocation': lazy(() =>
    import('@/pages/rules/ProfitabilityRules').then((m) => ({ default: m.CostAllocationRules })),
  ),
  '/rules/credit-loss': lazy(() =>
    import('@/pages/rules/ProfitabilityRules').then((m) => ({ default: m.CreditLossRules })),
  ),
  '/rules/capital': lazy(() => import('@/pages/rules/ProfitabilityRules').then((m) => ({ default: m.CapitalRules }))),
  '/rules/filters': lazy(() => import('@/pages/rules/SimpleRules').then((m) => ({ default: m.Filters }))),
  '/rules/custom-metrics': lazy(() =>
    import('@/pages/rules/CustomMetrics').then((m) => ({ default: m.CustomMetrics })),
  ),
  // Data-quality rules and the rule-coverage register - formerly sections of the Group's settings page.
  '/rules/validation': lazy(() => import('@/pages/ValidationRules').then((m) => ({ default: m.ValidationRules }))),
  '/rules/field-mappings': lazy(() =>
    import('@/pages/rules/FieldMappings').then((m) => ({ default: m.FieldMappings })),
  ),
  '/rules/code-mappings': lazy(() => import('@/pages/rules/CodeMappings').then((m) => ({ default: m.CodeMappings }))),
  '/rules/coverage': lazy(() =>
    import('@/pages/rules/ModelsAssumptions').then((m) => ({ default: m.ModelsAssumptions })),
  ),

  // Setup and onboarding - untouched by the navigation redesign.
  '/affiliates/onboard': lazy(() => import('@/pages/OnboardAffiliate').then((m) => ({ default: m.OnboardAffiliate }))),
  '/affiliates/bulk-onboard': lazy(() =>
    import('@/pages/BulkOnboardAffiliates').then((m) => ({ default: m.BulkOnboardAffiliates })),
  ),
};

// The work areas plus Admin, each keyed once under its sidebar path; every other URL an area answers to
// (Organisation setup's /setup and /affiliates among them, under Admin; Market data under Data) is declared
// in AREA_ROUTES (src/pages/areas/Areas.tsx) and routed below.
BUILT['/data/operations'] = DataArea;
BUILT['/assumptions'] = AssumptionsArea;
BUILT['/risk/liquidity'] = ResultsArea;
BUILT['/controls'] = ApproveArea;
BUILT['/reporting'] = ReportsArea;
BUILT['/admin'] = AdminArea;
BUILT['/account'] = MyAccount;

/**
 * Every other tab path within a module - the module's default tab is
 * already registered above (it's a `NAV_GROUPS` entry, so `buildRouteOrder`
 * picks it up automatically); this covers the rest, all reusing the same
 * module component, which reads the URL itself to pick the active tab (see
 * `ModuleTabs.tsx`). The permission here is each module's own route-level
 * gate - the loosest permission among its tabs - not the finer per-tab
 * check `ModuleTabs` applies internally; see each module file's header
 * comment for why that permission was chosen.
 */
const MODULE_TAB_ROUTES: RouteEntry[] = AREA_ROUTES.filter((r) => !(r.path in BUILT));

/**
 * Old flat URLs, preserved as redirects to their new hierarchical home
 * rather than broken - bookmarks, typed URLs and any not-yet-updated
 * internal link keep working, they just land one hop further along.
 */
const LEGACY_REDIRECTS: Array<{ from: string; to: string }> = [
  { from: '/liquidity-risk', to: '/risk/liquidity' },
  // Risk Map, Limits and KRIs moved out of Liquidity/Concentration into their own Monitoring pillar.
  { from: '/risk/liquidity/risk-map', to: '/monitoring/risk-map' },
  { from: '/risk-map', to: '/monitoring/risk-map' },
  { from: '/gap-analysis', to: '/risk/liquidity/gap-analysis' },
  { from: '/interest-rate-risk', to: '/risk/irrbb' },
  { from: '/behavioural-analysis', to: '/risk/irrbb/behavioural-analysis' },
  { from: '/stress-testing', to: '/risk/stress-testing' },
  { from: '/what-if', to: '/risk/stress-testing/what-if' },
  { from: '/concentration', to: '/risk/concentration' },
  { from: '/risk/concentration/limits', to: '/monitoring' },
  { from: '/limits', to: '/monitoring' },
  { from: '/risk/concentration/kri', to: '/monitoring/kri' },
  { from: '/kri', to: '/monitoring/kri' },
  { from: '/ftp', to: '/treasury/ftp' },
  { from: '/profitability', to: '/treasury/ftp/profitability' },
  { from: '/balance-sheet', to: '/treasury/balance-sheet' },
  { from: '/fx-position', to: '/treasury/balance-sheet/fx-position' },
  { from: '/alco-meetings', to: '/reporting' },
  { from: '/alco-reporting', to: '/reporting' },
  { from: '/management-reporting', to: '/reporting' },
  { from: '/regulatory-reporting', to: '/reporting/regulatory' },
  { from: '/ad-hoc', to: '/reporting/ad-hoc' },
  { from: '/data', to: '/data/operations' },
  { from: '/data-upload', to: '/data/operations' },
  // Phase 4: GL reconciliation lives on the general-ledger source; load history is Data → History.
  { from: '/gl-reconciliation', to: '/data/operations?domain=GeneralLedger' },
  { from: '/data/operations/gl-reconciliation', to: '/data/operations?domain=GeneralLedger' },
  { from: '/data-vintages', to: '/data/loads' },
  { from: '/data/operations/vintages', to: '/data/loads' },
  { from: '/data/quality', to: '/data/loads' },
  { from: '/dimensions', to: '/data/structure' },
  { from: '/counterparties', to: '/data/structure/counterparties' },
  // Connectors and reference data are Group-wide/shared - no affiliate field on either - so they now
  // live as categories on the Group row's own Settings rather than as Data Management module tabs.
  { from: '/connectors', to: '/data/operations' },
  // Market data moved from Admin → Organisation setup to Data → Market data.
  { from: '/setup/reference/market', to: '/data/market' },
  { from: '/setup/reference/fx', to: '/data/market/fx' },
  { from: '/setup/reference/indicators', to: '/data/market/indicators' },
  { from: '/setup/reference/calendars', to: '/data/market/calendars' },
  { from: '/setup/reference', to: '/data/market/curves' },
  { from: '/data/reference-data', to: '/data/market/curves' },
  { from: '/data/reference-data/fx-rates', to: '/data/market/fx' },
  { from: '/data/reference-data/economic-indicators', to: '/data/market/indicators' },
  { from: '/data/reference-data/holiday-calendar', to: '/data/market/calendars' },
  { from: '/yield-curves', to: '/data/market/curves' },
  { from: '/fx-rates', to: '/data/market/fx' },
  { from: '/economic-indicators', to: '/data/market/indicators' },
  { from: '/holiday-calendar', to: '/data/market/calendars' },
  { from: '/runs/new', to: '/execution' },
  { from: '/runs', to: '/execution/history' },
  { from: '/scheduler', to: '/execution/scheduler' },
  // Configuration folded into the Group's own Settings - Business Rules is no longer a standalone module.
  { from: '/rules', to: '/assumptions/rules' },
  { from: '/configuration', to: '/assumptions/rules' },
  { from: '/validation-rules', to: '/rules/validation' },
  { from: '/configuration/validation-rules', to: '/rules/validation' },
  // Approvals and Control Remediation moved out of Administration into their own Controls pillar;
  // Notifications took over Approvals' old default path as Administration's own default tab.
  { from: '/approvals', to: '/controls' },
  { from: '/admin/remediation', to: '/controls/remediation' },
  { from: '/remediation', to: '/controls/remediation' },
  { from: '/admin/notifications', to: '/admin' },
  { from: '/notifications', to: '/admin' },
];

export interface RouteEntry {
  path: string;
  screenName: string;
  Component: ComponentType;
  /** Required to actually render the screen, not just to see it in the sidebar. */
  permission: string;
  /**
   * Lets a user without `permission` still through when the route's `:code` param matches their
   * own `affiliateCode` and they hold `users.manage` - an Affiliate Administrator manages their own
   * affiliate (data sources, users, thresholds) without holding `group.manage`, the Group-wide
   * permission every other affiliate route requires.
   */
  ownAffiliateException?: boolean;
}

/**
 * Screens built but not in the sidebar nav - reached only via a link from
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
  { path: '/rules/cost-allocation', screenName: 'Operating Cost Allocation' },
  { path: '/rules/credit-loss', screenName: 'Expected Credit Loss' },
  { path: '/rules/capital', screenName: 'Capital Charge' },
  { path: '/rules/validation', screenName: 'Validation Rules' },
  { path: '/rules/field-mappings', screenName: 'Field Mappings' },
  { path: '/rules/code-mappings', screenName: 'Code Mappings' },
  { path: '/rules/coverage', screenName: 'Rule Coverage' },
  { path: '/affiliates/onboard', screenName: 'Onboard Affiliate' },
  { path: '/affiliates/bulk-onboard', screenName: 'Bulk Onboard Affiliates' },
  { path: '/account', screenName: 'My Account' },
];

/**
 * The permission required to actually render a screen not listed in the
 * sidebar - everything under a hub's own gate inherits that hub's
 * permission, since it's reached by clicking through it.
 */
const UNLISTED_PERMISSION: Record<string, string> = {
  '/affiliates/onboard': 'group.manage',
  '/affiliates/bulk-onboard': 'group.manage',
  '/rules/validation': 'data.view',
  '/rules/field-mappings': 'data.view',
  '/rules/code-mappings': 'data.view',
  '/rules/coverage': 'risk.view',
};

function permissionForUnlisted(path: string): string {
  if (path in UNLISTED_PERMISSION) return UNLISTED_PERMISSION[path]!;
  if (path.startsWith('/rules/')) return 'rules.edit';
  return 'dashboard.view';
}

// Risk, Monitoring, Treasury, Reporting and Execution all assume the scoped affiliate's data has
// been signed off - a run, a limit breach or a regulatory return computed against an
// Onboarding/Testing/Suspended affiliate's unproven data would look indistinguishable from a real
// one. Data Management, Group & Affiliate Management, Administration and Controls stay open
// regardless, since finishing onboarding (and approving the Live transition) happens there.
const LIVE_REQUIRED_PREFIXES = ['/risk', '/monitoring', '/treasury', '/reporting', '/execution'];
// Readiness is how a not-yet-Live affiliate sees what stands between it and its first run - never gated.
const LIVE_EXEMPT_PATHS = ['/execution/readiness'];
function requiresLiveAffiliate(path: string): boolean {
  if (LIVE_EXEMPT_PATHS.includes(path)) return false;
  return LIVE_REQUIRED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Every route, in the order `Switch` evaluates them - first match wins.
 *
 * This is an ordered array rather than inline JSX because the order carries a
 * correctness requirement that is otherwise invisible. `/affiliates/:code`
 * matches every literal path beneath `/affiliates`, including
 * `/affiliates/onboard`. Declared before the nav routes it swallowed the
 * onboarding wizard and rendered a blank page - the click did nothing, with
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
    {
      path: '/affiliates/onboard/:code',
      screenName: 'Resume Onboarding',
      Component: OnboardAffiliateResume,
      permission: 'group.manage',
    },
    {
      path: '/affiliates/:code/settings',
      screenName: 'Affiliate Settings',
      Component: AffiliateSettings,
      permission: 'group.manage',
      ownAffiliateException: true,
    },
    {
      path: '/affiliates/:code',
      screenName: 'Affiliate Detail',
      Component: AffiliateDetail,
      permission: 'group.manage',
      ownAffiliateException: true,
    },
    {
      path: '/position-book/snapshot/:id',
      screenName: 'Editable Snapshot',
      Component: SnapshotWorkbench,
      permission: 'data.view',
    },
  ];

  return [...navLiteral, ...unlisted, ...MODULE_TAB_ROUTES, ...parameterised];
};
/* eslint-enable react-refresh/only-export-components */

const ROUTE_ORDER = buildRouteOrder();

function ScreenFallback() {
  return (
    <div className="flex items-center justify-center p-12" role="status" aria-live="polite">
      <span className="text-[13px] text-gray-400">Loading…</span>
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
 * more privileged session - permission only ever gated the edit buttons
 * inside a page, never whether the page rendered at all. Read-only content
 * on a screen requiring a real permission (dashboard.view, granted to
 * every role) still renders for everyone, which is the point: view access
 * is broad by design, edit access is what's actually restricted.
 */
export function RouteGate({
  path,
  permission,
  screenName,
  ownAffiliateException,
  children,
}: {
  path: string;
  permission: string;
  screenName?: string;
  ownAffiliateException?: boolean;
  children: React.ReactNode;
}) {
  const { user, hasPermission } = useAuth();
  const { affiliateCode, affiliates } = useScope();
  const params = useParams<{ code?: string }>();
  const ownAffiliate =
    !!ownAffiliateException && !!params.code && params.code === user?.affiliateCode && hasPermission('users.manage');
  if (!hasPermission(permission) && !ownAffiliate) {
    return (
      <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <p className="text-[14px] font-bold text-navy-900">Access restricted</p>
        <p className="mt-1 text-[13px] text-gray-500">
          Your role doesn&rsquo;t have access to {screenName ?? 'this screen'}.
        </p>
      </div>
    );
  }

  const activeAffiliate = affiliateCode === GROUP_CODE ? null : affiliates.find((a) => a.code === affiliateCode);
  if (activeAffiliate && activeAffiliate.status !== 'Live' && requiresLiveAffiliate(path)) {
    return (
      <div role="alert" className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="text-[14px] font-bold text-navy-900">{activeAffiliate.name} isn&rsquo;t Live yet</p>
        <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-gray-500">
          {screenName ?? 'This screen'} reads from data an affiliate has signed off as ready - {activeAffiliate.name} is
          still <span className="font-bold">{activeAffiliate.status}</span>. Finish loading and reconciling its data in
          Data Management, then complete the Live approval, before working with it here.
        </p>
        <Link
          href="/data/operations"
          className="mt-4 inline-block rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
        >
          Go to Data Management →
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function readHandled(userId: string | undefined): boolean {
  if (!userId) return true;
  try {
    return sessionStorage.getItem(onboardingHandledKey(userId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Sends a user who still needs onboarding from Home to their welcome route - once per session (a fresh
 * sign-in starts a new one; "Finish later" uses it up). Users who don't need onboarding never see it.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, hasPermission } = useAuth();
  const { data: affiliates } = useAffiliates();
  const handled = readHandled(user?.id);
  const onHome = location === '/dashboard' || location === '/';
  const active = onHome && !handled && !!user;
  const isOrgManager = hasPermission('group.manage');
  const isAffManager = !isOrgManager && hasPermission('affiliate.manage') && user?.affiliateCode !== GROUP_CODE;
  const org = useOnboardingRecord(active && isOrgManager ? ORG_ONBOARDING_ID : null);
  const aff = useOnboardingRecord(active && isAffManager && user ? affiliateOnboardingId(user.affiliateCode) : null);
  const loading =
    (active && isOrgManager && org.isLoading) || (active && isAffManager && (aff.isLoading || !affiliates));
  const landing =
    active && !loading
      ? resolveLanding(
          user,
          hasPermission,
          org.data,
          aff.data,
          affiliates?.find((a) => a.code === user?.affiliateCode) ?? null,
        )
      : '/dashboard';
  const target = active && !loading ? onboardingRedirect(location, landing, handled) : null;

  useEffect(() => {
    if (!target || !user) return;
    try {
      sessionStorage.setItem(onboardingHandledKey(user.id), '1');
    } catch {
      /* storage unavailable */
    }
    navigate(target, { replace: true });
  }, [target, user, navigate]);

  if (loading || target) return <PreparingWorkspace />;
  return <>{children}</>;
}

/** Onboarding screens: full page, outside the app shell. */
function WelcomeRoutes() {
  return (
    <ErrorBoundary screenName="Onboarding">
      <Suspense fallback={<ScreenFallback />}>
        <Switch>
          <Route path="/welcome/organisation">
            <RouteGate path="/welcome/organisation" permission="group.manage" screenName="Organisation setup">
              <OrganisationOnboarding />
            </RouteGate>
          </Route>
          <Route path="/welcome/affiliate">
            <RouteGate path="/welcome/affiliate" permission="affiliate.manage" screenName="Affiliate setup">
              <AffiliateWelcome />
            </RouteGate>
          </Route>
          <Route>
            <Redirect to="/dashboard" />
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
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
  const { isAuthenticated, isRestoring, restoreError } = useAuth();
  const [location] = useLocation();
  // The shared Supabase database is seeded by scripts/seed-supabase.ts, never from a browser.
  const [seeded, setSeeded] = useState(isSupabaseMode);
  const [seedError, setSeedError] = useState<string | null>(null);

  useEffect(() => {
    if (isSupabaseMode) return;
    ensureSeeded(repository)
      .then(() => setSeeded(true))
      .catch((err: unknown) => setSeedError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (seedError) {
    return (
      <div role="alert" className="m-6 rounded-2xl border border-danger/20 bg-danger-bg p-6">
        <h1 className="mb-1 text-[15px] font-bold text-navy-900">The local database could not be opened</h1>
        <p className="text-[13px] text-gray-600">{seedError}</p>
      </div>
    );
  }

  if (restoreError) {
    return (
      <div role="alert" className="m-6 rounded-2xl border border-danger/20 bg-danger-bg p-6">
        <h1 className="mb-1 text-[15px] font-bold text-navy-900">The Ascent database could not be reached</h1>
        <p className="text-[13px] text-gray-600">
          The platform's shared database (Supabase) did not respond, so nothing can be loaded or saved. Check your
          network connection and try again.
        </p>
        <p className="mt-2 font-mono text-[12px] text-gray-500">{restoreError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!seeded || isRestoring) return <ScreenFallback />;

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Login />
      </Suspense>
    );
  }

  if (location.startsWith('/welcome/')) {
    return (
      <>
        <ScopeSync />
        <WelcomeRoutes />
      </>
    );
  }

  return (
    <OnboardingGate>
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

          {ROUTE_ORDER.map(({ path, screenName, Component, permission, ownAffiliateException }) => (
            <Route key={path} path={path}>
              {/* Keyed by scope: a transient render error caught here otherwise
                latches until the whole app remounts (only logout did that),
                even after the affiliate/date that triggered it has changed.
                Re-keying on scope gives the screen a fresh mount attempt
                exactly when the user's next action already changes the
                inputs it will render with. */}
              <ScopedErrorBoundary screenName={screenName}>
                <Suspense fallback={<ScreenFallback />}>
                  <RouteGate
                    path={path}
                    permission={permission}
                    screenName={screenName}
                    ownAffiliateException={ownAffiliateException}
                  >
                    <Component />
                  </RouteGate>
                </Suspense>
              </ScopedErrorBoundary>
            </Route>
          ))}

          <Route>
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <p className="text-[14px] font-bold text-navy-900">Screen not found</p>
              <p className="mt-1 text-[13px] text-gray-500">That address does not match any screen in the platform.</p>
            </div>
          </Route>
        </Switch>
      </AppShell>
    </OnboardingGate>
  );
}
