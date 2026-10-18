/**
 * The work areas - Data → Assumptions → Run & results → Approvals → Reports - plus Admin (users,
 * the organisation, notifications, audit log and reset).
 * Each area is one sidebar entry with one tab strip; screens that belong together sit one level down
 * as a secondary strip. Every screen keeps its original URL, so links, bookmarks and tours still land.
 */
import { lazy, type ComponentType } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

// ─── Screens ────────────────────────────────────────────────────────────────

const OrganisationSetup = page(() => import('@/pages/areas/OrganisationSetup'), 'OrganisationSetup');
const YieldCurves = page(() => import('@/pages/YieldCurves'), 'YieldCurves');
const FxRates = page(() => import('@/pages/FxRates'), 'FxRates');
const EconomicIndicators = page(() => import('@/pages/EconomicIndicators'), 'EconomicIndicators');
const HolidayCalendar = page(() => import('@/pages/HolidayCalendar'), 'HolidayCalendar');
const MarketDataHub = page(() => import('@/pages/areas/MarketDataHub'), 'MarketDataHub');

const DataSourcesTab = page(() => import('@/pages/data/DataSources'), 'DataSourcesTab');
const LoadHistory = page(() => import('@/pages/data/LoadHistory'), 'LoadHistory');
const PositionBook = page(() => import('@/pages/PositionBook'), 'PositionBook');
const Dimensions = page(() => import('@/pages/Dimensions'), 'Dimensions');
const Counterparties = page(() => import('@/pages/Counterparties'), 'Counterparties');

const BehaviouralModels = page(() => import('@/pages/areas/BehaviouralModels'), 'BehaviouralModels');
const ModelRegister = page(() => import('@/pages/areas/ModelRegister'), 'ModelRegister');
const RulesHub = page(() => import('@/pages/areas/RulesHub'), 'RulesHub');

const Readiness = page(() => import('@/pages/Readiness'), 'Readiness');
const ProcessRun = page(() => import('@/pages/ProcessRun'), 'ProcessRun');
const BatchScheduler = page(() => import('@/pages/BatchScheduler'), 'BatchScheduler');
const Runs = page(() => import('@/pages/Runs'), 'Runs');
const LiquidityRisk = page(() => import('@/pages/results/LiquidityRisk'), 'LiquidityRisk');
const GapAnalysis = page(() => import('@/pages/results/GapAnalysis'), 'GapAnalysis');
const Concentration = page(() => import('@/pages/results/Concentration'), 'Concentration');
const Irrbb = page(() => import('@/pages/results/Irrbb'), 'Irrbb');
const BehaviouralAnalysis = page(() => import('@/pages/results/BehaviouralAnalysis'), 'BehaviouralAnalysis');
const StressTesting = page(() => import('@/pages/StressTesting'), 'StressTesting');
const WhatIf = page(() => import('@/pages/WhatIf'), 'WhatIf');
const Forecast = page(() => import('@/pages/Forecast'), 'Forecast');
const TransferPricing = page(() => import('@/pages/results/TransferPricing'), 'TransferPricing');
const Profitability = page(() => import('@/pages/results/Profitability'), 'Profitability');
const BalanceSheet = page(() => import('@/pages/results/BalanceSheet'), 'BalanceSheet');
const FxPosition = page(() => import('@/pages/results/FxPosition'), 'FxPosition');
const Limits = page(() => import('@/pages/Limits'), 'Limits');
const Kri = page(() => import('@/pages/Kri'), 'Kri');
const RiskMap = page(() => import('@/pages/RiskMap'), 'RiskMap');

const Approvals = page(() => import('@/pages/Approvals'), 'Approvals');
const Remediation = page(() => import('@/pages/Remediation'), 'Remediation');
const ReportPacks = page(() => import('@/pages/ReportPacks'), 'ReportPacks');
const RegulatoryReporting = page(() => import('@/pages/RegulatoryReporting'), 'RegulatoryReporting');
const AdHoc = page(() => import('@/pages/AdHoc'), 'AdHoc');

const Notifications = page(() => import('@/pages/Notifications'), 'Notifications');
const AdminUsers = page(() => import('@/pages/AdminUsers'), 'AdminUsers');
const AdminPreferences = page(() => import('@/pages/AdminPreferences'), 'AdminPreferences');
const AdminAudit = page(() => import('@/pages/AdminAudit'), 'AdminAudit');

/** A secondary strip under one primary tab. */
const sub = (tabs: ModuleTab[]): ComponentType =>
  function SubTabs() {
    return <ModuleTabs tabs={tabs} variant="secondary" />;
  };

// ─── Data ────────────────────────────────────────────────────────────────

const STRUCTURE_TABS: ModuleTab[] = [
  {
    key: 'dimensions',
    label: 'Dimensions & hierarchies',
    path: '/data/structure',
    permission: 'data.view',
    Component: Dimensions,
  },
  {
    key: 'counterparties',
    label: 'Counterparties',
    path: '/data/structure/counterparties',
    permission: 'data.view',
    Component: Counterparties,
  },
];

// Market data (Group-wide): status and upload, then FX rates, curves, indicators and holiday calendars. It
// lives in Data, where data arrives - not under Admin. Old /setup/reference* URLs redirect here (App.tsx).
export const MARKET_TABS: ModuleTab[] = [
  {
    key: 'status',
    label: 'Overview & upload',
    path: '/data/market',
    permission: 'data.view',
    Component: MarketDataHub,
  },
  { key: 'fx', label: 'FX rates', path: '/data/market/fx', permission: 'data.view', Component: FxRates },
  {
    key: 'curves',
    label: 'Yield curves',
    path: '/data/market/curves',
    permission: 'data.view',
    Component: YieldCurves,
  },
  {
    key: 'indicators',
    label: 'Economic indicators',
    path: '/data/market/indicators',
    permission: 'data.view',
    Component: EconomicIndicators,
  },
  {
    key: 'calendars',
    label: 'Holiday calendars',
    path: '/data/market/calendars',
    permission: 'data.view',
    Component: HolidayCalendar,
  },
];

// Data is organised around sources: each affiliate's (and Group's) feeds, their lobby and their loads.
// /data/history (behavioural-model history coverage) is reached from a balance/account history source.
export const DATA_TABS: ModuleTab[] = [
  {
    key: 'sources',
    label: 'Sources',
    path: '/data/operations',
    matchPaths: ['/data/operations', '/data/history'],
    permission: 'data.view',
    Component: DataSourcesTab,
  },
  {
    key: 'market',
    label: 'Market data',
    path: '/data/market',
    matchPaths: MARKET_TABS.map((t) => t.path),
    permission: 'data.view',
    Component: sub(MARKET_TABS),
  },
  { key: 'loads', label: 'History', path: '/data/loads', permission: 'data.view', Component: LoadHistory },
  {
    key: 'position-book',
    label: 'Position book',
    path: '/data/operations/position-book',
    permission: 'data.view',
    Component: PositionBook,
  },
  {
    key: 'structure',
    label: 'Structure',
    path: '/data/structure',
    matchPaths: STRUCTURE_TABS.map((t) => t.path),
    permission: 'data.view',
    Component: sub(STRUCTURE_TABS),
  },
];

// ─── Assumptions ─────────────────────────────────────────────────────────

// The model register is a tab inside Behavioural models (teardown §12 row 23); /assumptions/models still lands on it.
const MODEL_TABS: ModuleTab[] = [
  { key: 'workbench', label: 'Calibrate', path: '/assumptions', permission: 'risk.view', Component: BehaviouralModels },
  {
    key: 'register',
    label: 'Model register',
    path: '/assumptions/models',
    permission: 'risk.view',
    Component: ModelRegister,
  },
];

export const ASSUMPTIONS_TABS: ModuleTab[] = [
  {
    key: 'models',
    label: 'Behavioural models',
    path: '/assumptions',
    matchPaths: MODEL_TABS.map((t) => t.path),
    permission: 'risk.view',
    Component: sub(MODEL_TABS),
  },
  {
    key: 'rules',
    label: 'Rules & scenarios',
    path: '/assumptions/rules',
    permission: 'risk.view',
    Component: RulesHub,
  },
];

// ─── Run & results ───────────────────────────────────────────────────────

// Run: readiness first (are we ready, and who can fix what is missing), then run, history and schedules.
const RUN_TABS: ModuleTab[] = [
  { key: 'readiness', label: 'Readiness', path: '/execution/readiness', permission: 'risk.view', Component: Readiness },
  { key: 'run', label: 'Run now', path: '/execution', permission: 'run.execute', Component: ProcessRun },
  { key: 'history', label: 'Runs', path: '/execution/history', permission: 'risk.view', Component: Runs },
  {
    key: 'scheduler',
    label: 'Schedules',
    path: '/execution/scheduler',
    permission: 'run.execute',
    Component: BatchScheduler,
  },
];
const LIQUIDITY_TABS: ModuleTab[] = [
  {
    key: 'liquidity',
    label: 'LCR, NSFR & funding',
    path: '/risk/liquidity',
    permission: 'risk.view',
    Component: LiquidityRisk,
  },
  {
    key: 'gap',
    label: 'Maturity & repricing gap',
    path: '/risk/liquidity/gap-analysis',
    permission: 'risk.view',
    Component: GapAnalysis,
  },
  {
    key: 'concentration',
    label: 'Concentration',
    path: '/risk/concentration',
    permission: 'risk.view',
    Component: Concentration,
  },
];
const RATE_TABS: ModuleTab[] = [
  { key: 'irrbb', label: 'NII & EVE', path: '/risk/irrbb', permission: 'risk.view', Component: Irrbb },
  {
    key: 'behavioural',
    label: 'Behavioural analysis',
    path: '/risk/irrbb/behavioural-analysis',
    permission: 'risk.view',
    Component: BehaviouralAnalysis,
  },
];
const STRESS_TABS: ModuleTab[] = [
  {
    key: 'stress',
    label: 'Supervisory stress',
    path: '/risk/stress-testing',
    permission: 'risk.view',
    Component: StressTesting,
  },
  {
    key: 'what-if',
    label: 'What-if',
    path: '/risk/stress-testing/what-if',
    permission: 'run.execute',
    Component: WhatIf,
  },
  {
    key: 'forecast',
    label: 'Forecast',
    path: '/risk/stress-testing/forecast',
    permission: 'run.execute',
    Component: Forecast,
  },
];
const TREASURY_TABS: ModuleTab[] = [
  {
    key: 'ftp',
    label: 'Transfer pricing',
    path: '/treasury/ftp',
    permission: 'treasury.view',
    Component: TransferPricing,
  },
  {
    key: 'profitability',
    label: 'Profitability',
    path: '/treasury/ftp/profitability',
    permission: 'risk.view',
    Component: Profitability,
  },
  {
    key: 'balance-sheet',
    label: 'Balance sheet',
    path: '/treasury/balance-sheet',
    permission: 'treasury.view',
    Component: BalanceSheet,
  },
  {
    key: 'fx',
    label: 'FX position',
    path: '/treasury/balance-sheet/fx-position',
    permission: 'treasury.view',
    Component: FxPosition,
  },
];
const LIMIT_TABS: ModuleTab[] = [
  { key: 'limits', label: 'Limits & breaches', path: '/monitoring', permission: 'risk.view', Component: Limits },
  { key: 'kri', label: 'Trends (KRIs)', path: '/monitoring/kri', permission: 'risk.view', Component: Kri },
  {
    key: 'risk-map',
    label: 'Group risk map',
    path: '/monitoring/risk-map',
    permission: 'risk.view',
    Component: RiskMap,
  },
];

const group = (key: string, label: string, permission: string, tabs: ModuleTab[]): ModuleTab => ({
  key,
  label,
  path: tabs[0]!.path,
  matchPaths: tabs.map((t) => t.path),
  permission,
  Component: sub(tabs),
});

export const RESULTS_TABS: ModuleTab[] = [
  group('run', 'Run', 'risk.view', RUN_TABS),
  group('liquidity', 'Liquidity', 'risk.view', LIQUIDITY_TABS),
  group('rates', 'Interest rate', 'risk.view', RATE_TABS),
  group('stress', 'Stress & scenarios', 'risk.view', STRESS_TABS),
  group('treasury', 'FTP & profitability', 'treasury.view', TREASURY_TABS),
  group('limits', 'Limits', 'risk.view', LIMIT_TABS),
];

// ─── Approvals ──────────────────────────────────────────────────────────────

export const APPROVE_TABS: ModuleTab[] = [
  { key: 'approvals', label: 'Approvals', path: '/controls', permission: 'risk.view', Component: Approvals },
  {
    key: 'issues',
    label: 'Control issues',
    path: '/controls/remediation',
    permission: 'risk.view',
    Component: Remediation,
  },
];

// ─── Reports ────────────────────────────────────────────────────────────────

export const REPORT_TABS: ModuleTab[] = [
  {
    key: 'packs',
    label: 'ALCO & management packs',
    path: '/reporting',
    permission: 'reporting.view',
    Component: ReportPacks,
  },
  {
    key: 'regulatory',
    label: 'Regulatory returns',
    path: '/reporting/regulatory',
    permission: 'reporting.view',
    Component: RegulatoryReporting,
  },
  {
    key: 'ad-hoc',
    label: 'Ad-hoc comparison',
    path: '/reporting/ad-hoc',
    permission: 'reporting.view',
    Component: AdHoc,
  },
];

// ─── Admin ──────────────────────────────────────────────────────────────────

// One place for the organisation: details, affiliates (add / invite admin), defaults and Group assumptions.
export const ADMIN_TABS: ModuleTab[] = [
  { key: 'users', label: 'Users & roles', path: '/admin/users', permission: 'users.manage', Component: AdminUsers },
  {
    key: 'organisation',
    label: 'Organisation',
    path: '/setup/organisation',
    permission: 'group.manage',
    Component: OrganisationSetup,
  },
  {
    key: 'notifications',
    label: 'Notifications',
    path: '/admin',
    permission: 'dashboard.view',
    Component: Notifications,
  },
  { key: 'audit', label: 'Audit log', path: '/admin/audit', permission: 'audit.view', Component: AdminAudit },
  {
    key: 'reset',
    label: 'Reset platform',
    path: '/admin/preferences',
    permission: 'group.manage',
    Component: AdminPreferences,
  },
];

// ─── Area components ────────────────────────────────────────────────────────

const area = (tabs: ModuleTab[]): ComponentType =>
  function Area() {
    return <ModuleTabs tabs={tabs} />;
  };

export const DataArea = area(DATA_TABS);
export const AssumptionsArea = area(ASSUMPTIONS_TABS);
export const ResultsArea = area(RESULTS_TABS);
export const ApproveArea = area(APPROVE_TABS);
export const ReportsArea = area(REPORT_TABS);
export const AdminArea = area(ADMIN_TABS);

/** Every URL an area answers to, with the permission its route gate checks - fed to the router. */
export interface AreaRoute {
  path: string;
  screenName: string;
  Component: ComponentType;
  permission: string;
}

function routesOf(tabs: ModuleTab[], Component: ComponentType, inner: Record<string, ModuleTab[]> = {}): AreaRoute[] {
  return tabs.flatMap((t) => {
    const children = inner[t.key];
    if (children)
      return children.map((c) => ({ path: c.path, screenName: c.label, Component, permission: c.permission }));
    return [{ path: t.path, screenName: t.label, Component, permission: t.permission }];
  });
}

export const AREA_ROUTES: AreaRoute[] = [
  ...routesOf(DATA_TABS, DataArea, {
    sources: [
      { key: 's', label: 'Data sources', path: '/data/operations', permission: 'data.view', Component: DataSourcesTab },
      {
        key: 'h',
        label: 'History for models',
        path: '/data/history',
        permission: 'data.view',
        Component: DataSourcesTab,
      },
    ],
    structure: STRUCTURE_TABS,
    market: MARKET_TABS,
  }),
  ...routesOf(ASSUMPTIONS_TABS, AssumptionsArea, { models: MODEL_TABS }),
  ...routesOf(RESULTS_TABS, ResultsArea, {
    run: RUN_TABS,
    liquidity: LIQUIDITY_TABS,
    rates: RATE_TABS,
    stress: STRESS_TABS,
    treasury: TREASURY_TABS,
    limits: LIMIT_TABS,
  }),
  ...routesOf(APPROVE_TABS, ApproveArea),
  ...routesOf(REPORT_TABS, ReportsArea),
  ...routesOf(ADMIN_TABS, AdminArea),
];
