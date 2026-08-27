/**
 * Sidebar navigation map.
 *
 * The sidebar represents major ALM business capabilities; screens that
 * belong to the same workflow are grouped as tabs inside a module instead of
 * each getting their own sidebar row (see `src/pages/modules/*`). This
 * intentionally shrank NAV_GROUPS from 40+ individual screens down to ~13
 * primary items — `routing.test.ts` reflects that on purpose, it isn't
 * drift.
 *
 * `SEARCH_INDEX` is the pre-redesign flat list, kept so Cmd/Ctrl+K search
 * still finds every individual screen by its familiar name, pointed at its
 * new module/tab URL — collapsing the sidebar shouldn't make a screen
 * harder to find, just less prominent as a standing link.
 */

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
  /** Build phase this screen landed in — see build plan §14. Kept for the search index's provenance, not used by the router. */
  phase: number;
  icon: ComponentType<IconProps>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

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
      { name: 'Concentration & Risk Monitoring', path: '/risk/concentration', permission: 'risk.view', phase: 6, icon: PortfolioIcon },
    ],
  },
  {
    label: 'TREASURY',
    items: [
      { name: 'FTP & Profitability', path: '/treasury/ftp', permission: 'risk.view', phase: 6, icon: FeeIcon },
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
    items: [{ name: 'Execution & Scheduling', path: '/execution', permission: 'risk.view', phase: 5, icon: RefreshIcon }],
  },
  {
    label: 'CONFIGURATION',
    items: [{ name: 'Configuration', path: '/configuration', permission: 'rules.edit', phase: 4, icon: SettingsIcon }],
  },
  {
    label: 'GROUP & AFFILIATE MANAGEMENT',
    items: [{ name: 'Group & Affiliate Management', path: '/affiliates', permission: 'dashboard.view', phase: 3, icon: BriefcaseIcon }],
  },
  {
    label: 'ADMINISTRATION',
    items: [{ name: 'Administration & Governance', path: '/admin', permission: 'dashboard.view', phase: 7, icon: ShieldCheckIcon }],
  },
];

/** Flat list, for the router — the 13 sidebar-visible module entries. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Every individual screen, pointed at its new module/tab URL, for Cmd/Ctrl+K
 * search — not rendered in the sidebar and not a source of routes.
 */
export const SEARCH_INDEX: NavItem[] = [
  { name: 'Executive Dashboard', path: '/dashboard', permission: 'dashboard.view', phase: 6, icon: DashboardIcon },

  { name: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', phase: 6, icon: RiskIcon },
  { name: 'Liquidity Risk Map', path: '/risk/liquidity/risk-map', permission: 'risk.view', phase: 7, icon: PieChartIcon },
  { name: 'Maturity & Repricing Gap', path: '/risk/liquidity/gap-analysis', permission: 'risk.view', phase: 6, icon: BarChartIcon },
  { name: 'Interest Rate Risk (IRRBB)', path: '/risk/irrbb', permission: 'risk.view', phase: 6, icon: TrendingUpIcon },
  { name: 'Behavioural Analysis', path: '/risk/irrbb/behavioural-analysis', permission: 'risk.view', phase: 6, icon: PerformanceIcon },
  { name: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', phase: 5, icon: AlertIcon },
  { name: 'What-If Builder', path: '/risk/stress-testing/what-if', permission: 'run.execute', phase: 5, icon: ColumnsIcon },
  { name: 'Concentration & Large Exposures', path: '/risk/concentration', permission: 'risk.view', phase: 6, icon: PortfolioIcon },
  { name: 'Limits & Breaches', path: '/risk/concentration/limits', permission: 'risk.view', phase: 7, icon: ShieldCheckIcon },
  { name: 'Key Risk Indicators', path: '/risk/concentration/kri', permission: 'risk.view', phase: 7, icon: ColumnsIcon },

  { name: 'Funds Transfer Pricing', path: '/treasury/ftp', permission: 'treasury.view', phase: 6, icon: FeeIcon },
  { name: 'Profitability Ratios', path: '/treasury/ftp/profitability', permission: 'risk.view', phase: 6, icon: ValuationIcon },
  { name: 'Balance Sheet Analytics', path: '/treasury/balance-sheet', permission: 'treasury.view', phase: 6, icon: FundAccountingIcon },
  { name: 'FX Position', path: '/treasury/balance-sheet/fx-position', permission: 'treasury.view', phase: 6, icon: ArrowUpDownIcon },

  { name: 'ALCO Meetings', path: '/reporting', permission: 'reporting.view', phase: 8, icon: CalendarIcon },
  { name: 'Report Packs', path: '/reporting/report-packs', permission: 'reporting.view', phase: 8, icon: FileTextIcon },
  { name: 'Regulatory Reporting', path: '/reporting/regulatory', permission: 'reporting.view', phase: 8, icon: RegulatoryIcon },
  { name: 'Ad-Hoc Analysis', path: '/reporting/ad-hoc', permission: 'reporting.view', phase: 8, icon: SearchIcon },

  { name: 'Data Upload & Staging', path: '/data/operations', permission: 'data.view', phase: 3, icon: DownloadIcon },
  { name: 'GL Reconciliation', path: '/data/operations/gl-reconciliation', permission: 'data.view', phase: 3, icon: ReconciliationIcon },
  { name: 'Data Vintages & Load History', path: '/data/operations/vintages', permission: 'data.view', phase: 3, icon: HistoryIcon },
  { name: 'Dimensions & Hierarchies', path: '/data/structure', permission: 'data.view', phase: 2, icon: CorporateActionsIcon },
  { name: 'Counterparty Register', path: '/data/structure/counterparties', permission: 'data.view', phase: 2, icon: ClientManagementIcon },
  { name: 'Interest Rates & Curves', path: '/data/reference-data', permission: 'data.view', phase: 2, icon: TrendingUpIcon },
  { name: 'Currency & FX Rates', path: '/data/reference-data/fx-rates', permission: 'data.view', phase: 2, icon: NairaIcon },
  { name: 'Economic Indicators', path: '/data/reference-data/economic-indicators', permission: 'data.view', phase: 2, icon: BarChartIcon },
  { name: 'Holiday Calendar', path: '/data/reference-data/holiday-calendar', permission: 'data.view', phase: 2, icon: CalendarIcon },

  { name: 'Process Run', path: '/execution', permission: 'run.execute', phase: 5, icon: RefreshIcon },
  { name: 'Run History', path: '/execution/history', permission: 'risk.view', phase: 5, icon: HistoryIcon },
  { name: 'Batch Scheduler', path: '/execution/scheduler', permission: 'run.execute', phase: 5, icon: ClockIcon },

  { name: 'Business Rules', path: '/configuration', permission: 'rules.edit', phase: 4, icon: SettingsIcon },
  { name: 'Validation Rules', path: '/configuration/validation-rules', permission: 'data.configure', phase: 3, icon: CheckCircleIcon },

  { name: 'Affiliates', path: '/affiliates', permission: 'dashboard.view', phase: 3, icon: BriefcaseIcon },
  { name: 'Connectors & Data Sources', path: '/connectors', permission: 'data.view', phase: 2, icon: CorporateActionsIcon },

  { name: 'Approvals', path: '/admin', permission: 'risk.view', phase: 7, icon: AuthorizationQueueIcon },
  { name: 'Control Remediation', path: '/admin/remediation', permission: 'risk.view', phase: 7, icon: AlertIcon },
  { name: 'Notifications', path: '/admin/notifications', permission: 'dashboard.view', phase: 7, icon: BellIcon },
  { name: 'Users, Roles & Permissions', path: '/admin/users', permission: 'admin.manage', phase: 8, icon: UsersIcon },
  { name: 'System Preferences', path: '/admin/preferences', permission: 'admin.manage', phase: 8, icon: SettingsIcon },
  { name: 'Audit Log', path: '/admin/audit', permission: 'audit.view', phase: 8, icon: AuditIcon },
];
