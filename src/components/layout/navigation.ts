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
  CalendarIcon,
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
  NairaIcon,
  SettingsIcon,
  CheckCircleIcon,
  BriefcaseIcon,
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
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Screens sharing a workflow are grouped as tabs inside a module rather than each getting a sidebar row;
// routing.test.ts asserts the resulting ~13-item count on purpose, not by drift.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { name: 'Executive Dashboard', path: '/dashboard', permission: 'dashboard.view', phase: 6, icon: DashboardIcon },
    ],
  },
  {
    label: 'RISK MANAGEMENT',
    items: [
      { name: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', phase: 6, icon: RiskIcon },
      { name: 'IRRBB & Behavioural Risk', path: '/risk/irrbb', permission: 'risk.view', phase: 6, icon: TrendingUpIcon },
      { name: 'Stress Testing & Scenario Analysis', path: '/risk/stress-testing', permission: 'risk.view', phase: 5, icon: AlertIcon },
      { name: 'Concentration & Large Exposures', path: '/risk/concentration', permission: 'risk.view', phase: 6, icon: PortfolioIcon },
    ],
  },
  {
    label: 'MONITORING',
    items: [
      { name: 'Monitoring', path: '/monitoring', permission: 'risk.view', phase: 7, icon: PieChartIcon },
    ],
  },
  {
    label: 'TREASURY',
    items: [
      { name: 'FTP & Profitability', path: '/treasury/ftp', permission: 'treasury.view', phase: 6, icon: FeeIcon },
      { name: 'Balance Sheet & Treasury', path: '/treasury/balance-sheet', permission: 'treasury.view', phase: 6, icon: FundAccountingIcon },
    ],
  },
  {
    label: 'REPORTING',
    items: [
      { name: 'Reporting & ALCO', path: '/reporting', permission: 'reporting.view', phase: 8, icon: FileTextIcon },
    ],
  },
  {
    label: 'DATA MANAGEMENT',
    items: [{ name: 'Data Management', path: '/data/operations', permission: 'data.view', phase: 2, icon: DownloadIcon }],
  },
  {
    label: 'EXECUTION',
    items: [{ name: 'Execution & Scheduling', path: '/execution', permission: 'run.execute', phase: 5, icon: RefreshIcon }],
  },
  {
    label: 'GROUP & AFFILIATE MANAGEMENT',
    items: [
      { name: 'Group & Affiliate Management', path: '/affiliates', permission: 'group.manage', phase: 3, icon: BriefcaseIcon },
    ],
  },
  {
    label: 'CONTROLS',
    items: [{ name: 'Controls', path: '/controls', permission: 'risk.view', phase: 7, icon: AuthorizationQueueIcon }],
  },
  {
    label: 'ADMINISTRATION',
    items: [{ name: 'Administration', path: '/admin', permission: 'dashboard.view', phase: 7, icon: ShieldCheckIcon }],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Every individual screen for Cmd/Ctrl+K search; not rendered in the sidebar and not a source of routes.
//
// A multi-tab module's NAV_GROUPS entry must gate on (at least) the permission its own *default* tab
// needs - the default tab owns the module's bare path, so that is where the sidebar link actually
// lands a user. Gating the hub any looser than that used to route a role straight into ModuleTabs'
// "Access restricted" wall the instant they clicked the sidebar row (e.g. a Reporting User clicking
// "Execution & Scheduling" landed on Process Run, which needs run.execute - a permission Reporting
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
  { name: 'Executive Dashboard', path: '/dashboard', permission: 'dashboard.view', phase: 6, icon: DashboardIcon },

  { name: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', phase: 6, icon: RiskIcon },
  { name: 'Maturity & Repricing Gap', path: '/risk/liquidity/gap-analysis', permission: 'risk.view', phase: 6, icon: BarChartIcon },
  { name: 'Interest Rate Risk (IRRBB)', path: '/risk/irrbb', permission: 'risk.view', phase: 6, icon: TrendingUpIcon },
  { name: 'Behavioural Analysis', path: '/risk/irrbb/behavioural-analysis', permission: 'risk.view', phase: 6, icon: PerformanceIcon },
  { name: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', phase: 5, icon: AlertIcon },
  { name: 'What-If Builder', path: '/risk/stress-testing/what-if', permission: 'run.execute', phase: 5, icon: ColumnsIcon },
  { name: 'Forecast', path: '/risk/stress-testing/forecast', permission: 'run.execute', phase: 5, icon: TrendingUpIcon },
  { name: 'Concentration & Large Exposures', path: '/risk/concentration', permission: 'risk.view', phase: 6, icon: PortfolioIcon },

  { name: 'Limits & Breaches', path: '/monitoring', permission: 'risk.view', phase: 7, icon: ShieldCheckIcon },
  { name: 'Key Risk Indicators', path: '/monitoring/kri', permission: 'risk.view', phase: 7, icon: ColumnsIcon },
  { name: 'Liquidity Risk Map', path: '/monitoring/risk-map', permission: 'risk.view', phase: 7, icon: PieChartIcon },

  { name: 'Funds Transfer Pricing', path: '/treasury/ftp', permission: 'treasury.view', phase: 6, icon: FeeIcon },
  { name: 'Profitability Ratios', path: '/treasury/ftp/profitability', permission: 'risk.view', phase: 6, icon: ValuationIcon },
  { name: 'Balance Sheet Analytics', path: '/treasury/balance-sheet', permission: 'treasury.view', phase: 6, icon: FundAccountingIcon },
  { name: 'FX Position', path: '/treasury/balance-sheet/fx-position', permission: 'treasury.view', phase: 6, icon: ArrowUpDownIcon },

  { name: 'Report Packs', path: '/reporting', permission: 'reporting.view', phase: 8, icon: FileTextIcon },
  { name: 'Regulatory Reporting', path: '/reporting/regulatory', permission: 'reporting.view', phase: 8, icon: RegulatoryIcon },
  { name: 'Ad-Hoc Analysis', path: '/reporting/ad-hoc', permission: 'reporting.view', phase: 8, icon: SearchIcon },

  { name: 'Data Upload & Staging', path: '/data/operations', permission: 'data.view', phase: 3, icon: DownloadIcon },
  { name: 'GL Reconciliation', path: '/data/operations/gl-reconciliation', permission: 'data.view', phase: 3, icon: ReconciliationIcon },
  { name: 'Data Vintages & Load History', path: '/data/operations/vintages', permission: 'data.view', phase: 3, icon: HistoryIcon },
  { name: 'Position Book', path: '/data/operations/position-book', permission: 'data.view', phase: 3, icon: PortfolioIcon },
  { name: 'Dimensions & Hierarchies', path: '/data/structure', permission: 'data.view', phase: 2, icon: CorporateActionsIcon },
  { name: 'Counterparty Register', path: '/data/structure/counterparties', permission: 'data.view', phase: 2, icon: ClientManagementIcon },
  { name: 'Data Quality', path: '/data/quality', permission: 'data.view', phase: 3, icon: CheckCircleIcon },
  { name: 'Interest Rates & Curves', path: '/affiliates/GROUP/settings?section=ref-yield-curves', permission: 'group.manage', phase: 2, icon: TrendingUpIcon },
  { name: 'Currency & FX Rates', path: '/affiliates/GROUP/settings?section=ref-fx-rates', permission: 'group.manage', phase: 2, icon: NairaIcon },
  { name: 'Economic Indicators', path: '/affiliates/GROUP/settings?section=ref-economic-indicators', permission: 'group.manage', phase: 2, icon: BarChartIcon },
  { name: 'Holiday Calendar', path: '/affiliates/GROUP/settings?section=ref-holiday-calendar', permission: 'group.manage', phase: 2, icon: CalendarIcon },
  { name: 'Connection Health', path: '/affiliates/GROUP/settings?section=data-sources', permission: 'group.manage', phase: 2, icon: CorporateActionsIcon },

  { name: 'Process Run', path: '/execution', permission: 'run.execute', phase: 5, icon: RefreshIcon },
  { name: 'Run History', path: '/execution/history', permission: 'risk.view', phase: 5, icon: HistoryIcon },
  { name: 'Batch Scheduler', path: '/execution/scheduler', permission: 'run.execute', phase: 5, icon: ClockIcon },

  { name: 'Business Rules', path: '/affiliates/GROUP/settings?section=rule-coverage', permission: 'group.manage', phase: 4, icon: SettingsIcon },
  { name: 'Validation Rules', path: '/affiliates/GROUP/settings?section=rule-ValidationRule', permission: 'group.manage', phase: 3, icon: CheckCircleIcon },

  { name: 'Group & Affiliate Management', path: '/affiliates', permission: 'group.manage', phase: 3, icon: BriefcaseIcon },

  { name: 'Approvals', path: '/controls', permission: 'risk.view', phase: 7, icon: AuthorizationQueueIcon },
  { name: 'Control Remediation', path: '/controls/remediation', permission: 'risk.view', phase: 7, icon: AlertIcon },
  { name: 'Notifications', path: '/admin', permission: 'dashboard.view', phase: 7, icon: BellIcon },
  { name: 'Users, Roles & Permissions', path: '/admin/users', permission: 'users.manage', phase: 8, icon: UsersIcon },
  { name: 'System Preferences', path: '/admin/preferences', permission: 'admin.manage', phase: 8, icon: SettingsIcon },
  { name: 'Audit Log', path: '/admin/audit', permission: 'audit.view', phase: 8, icon: AuditIcon },

  { name: 'My Account', path: '/account', permission: 'dashboard.view', phase: 8, icon: UsersIcon },
];
