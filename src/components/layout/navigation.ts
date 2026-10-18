import type { ComponentType } from 'react';
import type { IconProps } from '@/components/icons/Icons';
import {
  DashboardIcon,
  RiskIcon,
  PieChartIcon,
  BarChartIcon,
  PortfolioIcon,
  TrendingUpIcon,
  AlertIcon,
  PerformanceIcon,
  ValuationIcon,
  ShieldCheckIcon,
  ColumnsIcon,
  FeeIcon,
  FundAccountingIcon,
  ArrowUpDownIcon,
  FileTextIcon,
  RegulatoryIcon,
  SearchIcon,
  RefreshIcon,
  HistoryIcon,
  ClockIcon,
  DownloadIcon,
  ReconciliationIcon,
  CorporateActionsIcon,
  ClientManagementIcon,
  SettingsIcon,
  CheckCircleIcon,
  AuthorizationQueueIcon,
  BellIcon,
  UsersIcon,
  AuditIcon,
} from '@/components/icons/Icons';

export interface NavItem {
  name: string;
  path: string;
  permission: string;
  /** Not used by the router; kept for the search index's provenance. */
  phase: number;
  icon: ComponentType<IconProps>;
  /** Other URL prefixes that belong to this entry, so it stays highlighted across every screen it owns. */
  matchPrefixes?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Home, the work areas in the order the work happens, then Admin. Every screen is a tab inside one of them
// (src/pages/areas/Areas.tsx); routing.test.ts holds the sidebar to this list on purpose. A single-item group
// renders flat, with no group header. Organisation setup lives under Admin, for set-up managers only.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'HOME',
    items: [{ name: 'Home', path: '/dashboard', permission: 'dashboard.view', phase: 6, icon: DashboardIcon }],
  },
  {
    label: 'DATA',
    items: [
      {
        name: 'Data',
        path: '/data/operations',
        permission: 'data.view',
        phase: 2,
        icon: DownloadIcon,
        matchPrefixes: ['/data', '/position-book'],
      },
    ],
  },
  {
    label: 'ASSUMPTIONS',
    items: [
      {
        name: 'Assumptions',
        path: '/assumptions',
        permission: 'risk.view',
        phase: 4,
        icon: PerformanceIcon,
        matchPrefixes: ['/assumptions', '/rules'],
      },
    ],
  },
  {
    label: 'RESULTS',
    items: [
      {
        name: 'Run & results',
        path: '/risk/liquidity',
        permission: 'risk.view',
        phase: 5,
        icon: RiskIcon,
        matchPrefixes: ['/execution', '/risk', '/treasury', '/monitoring'],
      },
    ],
  },
  {
    label: 'APPROVALS',
    items: [
      {
        name: 'Approvals',
        path: '/controls',
        permission: 'risk.view',
        phase: 7,
        icon: AuthorizationQueueIcon,
        matchPrefixes: ['/controls'],
      },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      {
        name: 'Reports',
        path: '/reporting',
        permission: 'reporting.view',
        phase: 8,
        icon: FileTextIcon,
        matchPrefixes: ['/reporting'],
      },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      {
        name: 'Admin',
        path: '/admin',
        permission: 'dashboard.view',
        phase: 8,
        icon: ShieldCheckIcon,
        matchPrefixes: ['/admin', '/account', '/setup', '/affiliates'],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Every individual screen for Cmd/Ctrl+K search; not rendered in the sidebar and not a source of routes.
//
// A multi-tab module's NAV_GROUPS entry must gate on (at least) the permission its own *default* tab
// needs - the default tab owns the module's bare path, so that is where the sidebar link actually
// lands a user. Gating the hub any looser than that used to route a role straight into ModuleTabs'
// "Access restricted" wall the instant they clicked the sidebar row (e.g. a Reporting User clicking
// "Execution & Scheduling" landed on Run now, which needs run.execute - a permission Reporting
// User doesn't hold - producing an immediate, confusing dead end). FTP & Profitability had the same
// problem (default tab Funds Transfer Pricing needs treasury.view; the hub was gated on the looser
// risk.view, so Control Tester hit the same wall). Both NAV_GROUPS entries above are now gated on
// their default tab's real permission. /admin and /controls never had this problem - their default
// tabs (Notifications: dashboard.view; Approvals: risk.view) already match their hub gate.
//
// A *non-default* tab can still need more than the hub gate requires without any of this applying -
// it's reached only by its own link/search entry, never by the bare hub path, so a role that can't
// see it simply doesn't get that entry (e.g. Profitability Ratios' own entry below stays risk.view
// even though the FTP & Profitability hub is now treasury.view).
export const SEARCH_INDEX: NavItem[] = [
  { name: 'Home', path: '/dashboard', permission: 'dashboard.view', phase: 6, icon: DashboardIcon },
  {
    name: 'Organisation, affiliates & defaults',
    path: '/setup/organisation',
    permission: 'group.manage',
    phase: 3,
    icon: SettingsIcon,
  },
  { name: 'Behavioural Models', path: '/assumptions', permission: 'risk.view', phase: 4, icon: PerformanceIcon },
  { name: 'Model Register', path: '/assumptions/models', permission: 'risk.view', phase: 4, icon: PerformanceIcon },
  { name: 'History for Models', path: '/data/history', permission: 'data.view', phase: 3, icon: DownloadIcon },

  { name: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', phase: 6, icon: RiskIcon },
  {
    name: 'Maturity & Repricing Gap',
    path: '/risk/liquidity/gap-analysis',
    permission: 'risk.view',
    phase: 6,
    icon: BarChartIcon,
  },
  { name: 'Interest Rate Risk (IRRBB)', path: '/risk/irrbb', permission: 'risk.view', phase: 6, icon: TrendingUpIcon },
  {
    name: 'Behavioural Analysis',
    path: '/risk/irrbb/behavioural-analysis',
    permission: 'risk.view',
    phase: 6,
    icon: PerformanceIcon,
  },
  { name: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', phase: 5, icon: AlertIcon },
  {
    name: 'What-If Builder',
    path: '/risk/stress-testing/what-if',
    permission: 'run.execute',
    phase: 5,
    icon: ColumnsIcon,
  },
  {
    name: 'Forecast',
    path: '/risk/stress-testing/forecast',
    permission: 'run.execute',
    phase: 5,
    icon: TrendingUpIcon,
  },
  {
    name: 'Concentration & Large Exposures',
    path: '/risk/concentration',
    permission: 'risk.view',
    phase: 6,
    icon: PortfolioIcon,
  },

  { name: 'Limits & Breaches', path: '/monitoring', permission: 'risk.view', phase: 7, icon: ShieldCheckIcon },
  { name: 'Key Risk Indicators', path: '/monitoring/kri', permission: 'risk.view', phase: 7, icon: ColumnsIcon },
  { name: 'Liquidity Risk Map', path: '/monitoring/risk-map', permission: 'risk.view', phase: 7, icon: PieChartIcon },

  { name: 'Funds Transfer Pricing', path: '/treasury/ftp', permission: 'treasury.view', phase: 6, icon: FeeIcon },
  {
    name: 'Profitability',
    path: '/treasury/ftp/profitability',
    permission: 'risk.view',
    phase: 6,
    icon: ValuationIcon,
  },
  {
    name: 'Balance Sheet Analytics',
    path: '/treasury/balance-sheet',
    permission: 'treasury.view',
    phase: 6,
    icon: FundAccountingIcon,
  },
  {
    name: 'FX Position',
    path: '/treasury/balance-sheet/fx-position',
    permission: 'treasury.view',
    phase: 6,
    icon: ArrowUpDownIcon,
  },

  { name: 'Report Packs', path: '/reporting', permission: 'reporting.view', phase: 8, icon: FileTextIcon },
  {
    name: 'Regulatory Reporting',
    path: '/reporting/regulatory',
    permission: 'reporting.view',
    phase: 8,
    icon: RegulatoryIcon,
  },
  { name: 'Ad-Hoc Analysis', path: '/reporting/ad-hoc', permission: 'reporting.view', phase: 8, icon: SearchIcon },

  { name: 'Data Sources & Upload', path: '/data/operations', permission: 'data.view', phase: 3, icon: DownloadIcon },
  { name: 'Upload Data', path: '/data/operations?upload=1', permission: 'data.upload', phase: 3, icon: DownloadIcon },
  {
    name: 'GL Reconciliation (ledger check)',
    path: '/data/operations?domain=GeneralLedger',
    permission: 'data.view',
    phase: 3,
    icon: ReconciliationIcon,
  },
  { name: 'Load History', path: '/data/loads', permission: 'data.view', phase: 3, icon: HistoryIcon },
  {
    name: 'Position Book',
    path: '/data/operations/position-book',
    permission: 'data.view',
    phase: 3,
    icon: PortfolioIcon,
  },
  {
    name: 'Dimensions & Hierarchies',
    path: '/data/structure',
    permission: 'data.view',
    phase: 2,
    icon: CorporateActionsIcon,
  },
  {
    name: 'Counterparty Register',
    path: '/data/structure/counterparties',
    permission: 'data.view',
    phase: 2,
    icon: ClientManagementIcon,
  },
  // Market data has one home: Data → Market data - upload the combined file once (curves + FX + indicators),
  // see its status, and open each kind on its own tab.
  { name: 'Market data', path: '/data/market', permission: 'data.view', phase: 2, icon: TrendingUpIcon },
  { name: 'FX rates', path: '/data/market/fx', permission: 'data.view', phase: 2, icon: TrendingUpIcon },
  { name: 'Yield curves', path: '/data/market/curves', permission: 'data.view', phase: 2, icon: TrendingUpIcon },

  { name: 'Readiness', path: '/execution/readiness', permission: 'risk.view', phase: 5, icon: CheckCircleIcon },
  { name: 'Run now', path: '/execution', permission: 'run.execute', phase: 5, icon: RefreshIcon },
  { name: 'Runs', path: '/execution/history', permission: 'risk.view', phase: 5, icon: HistoryIcon },
  { name: 'Batch Scheduler', path: '/execution/scheduler', permission: 'run.execute', phase: 5, icon: ClockIcon },

  { name: 'Rules & Scenarios', path: '/assumptions/rules', permission: 'risk.view', phase: 4, icon: SettingsIcon },
  { name: 'Validation Rules', path: '/rules/validation', permission: 'data.view', phase: 3, icon: CheckCircleIcon },

  { name: 'Approvals', path: '/controls', permission: 'risk.view', phase: 7, icon: AuthorizationQueueIcon },
  { name: 'Control Remediation', path: '/controls/remediation', permission: 'risk.view', phase: 7, icon: AlertIcon },
  { name: 'Notifications', path: '/admin', permission: 'dashboard.view', phase: 7, icon: BellIcon },
  { name: 'Users, Roles & Permissions', path: '/admin/users', permission: 'users.manage', phase: 8, icon: UsersIcon },
  { name: 'Reset platform', path: '/admin/preferences', permission: 'group.manage', phase: 8, icon: SettingsIcon },
  { name: 'Audit Log', path: '/admin/audit', permission: 'audit.view', phase: 8, icon: AuditIcon },

  { name: 'My Account', path: '/account', permission: 'dashboard.view', phase: 8, icon: UsersIcon },
];
