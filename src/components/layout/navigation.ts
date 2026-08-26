/**
 * The full navigation map — all 57 screens from build plan §11, grouped by
 * functional area following UX best practices and SaaS conventions.
 * Organized by user workflow: Overview → Core Functions → Supporting Data → Admin.
 *
 * Configuration pages are grouped under "DATA & CONFIGURATION" but should be
 * accessed contextually from the screens they configure (e.g., from Limits screen
 * to configure limit thresholds).
 *
 * Screens not yet built in the current phase are marked `phase`, and the
 * router renders a placeholder for them so navigation is complete and
 * honest rather than silently missing entries.
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
  /** Build phase this screen lands in — see build plan §14. */
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
      { name: 'Liquidity Risk', path: '/liquidity-risk', permission: 'risk.view', phase: 6, icon: RiskIcon },
      { name: 'Liquidity Risk Map', path: '/risk-map', permission: 'risk.view', phase: 7, icon: PieChartIcon },
      { name: 'Maturity & Repricing Gap', path: '/gap-analysis', permission: 'risk.view', phase: 6, icon: BarChartIcon },
      { name: 'Concentration & Large Exposures', path: '/concentration', permission: 'risk.view', phase: 6, icon: PortfolioIcon },
      { name: 'Interest Rate Risk (IRRBB)', path: '/interest-rate-risk', permission: 'risk.view', phase: 6, icon: TrendingUpIcon },
      { name: 'Stress Testing', path: '/stress-testing', permission: 'risk.view', phase: 5, icon: AlertIcon },
      { name: 'Behavioural Analysis', path: '/behavioural-analysis', permission: 'risk.view', phase: 6, icon: PerformanceIcon },
      { name: 'Profitability Ratios', path: '/profitability', permission: 'risk.view', phase: 6, icon: ValuationIcon },
      { name: 'Limits & Breaches', path: '/limits', permission: 'risk.view', phase: 7, icon: ShieldCheckIcon },
      { name: 'Key Risk Indicators', path: '/kri', permission: 'risk.view', phase: 7, icon: ColumnsIcon },
    ],
  },
  {
    label: 'TREASURY',
    items: [
      { name: 'Funds Transfer Pricing', path: '/ftp', permission: 'treasury.view', phase: 6, icon: FeeIcon },
      { name: 'Balance Sheet Analytics', path: '/balance-sheet', permission: 'treasury.view', phase: 6, icon: FundAccountingIcon },
      { name: 'FX Position', path: '/fx-position', permission: 'treasury.view', phase: 6, icon: ArrowUpDownIcon },
    ],
  },
  {
    label: 'REPORTING',
    items: [
      { name: 'ALCO Meetings', path: '/alco-meetings', permission: 'reporting.view', phase: 8, icon: CalendarIcon },
      { name: 'Report Packs', path: '/alco-reporting', permission: 'reporting.view', phase: 8, icon: FileTextIcon },
      { name: 'Regulatory Reporting', path: '/regulatory-reporting', permission: 'reporting.view', phase: 8, icon: RegulatoryIcon },
      { name: 'Ad-Hoc Analysis', path: '/ad-hoc', permission: 'reporting.view', phase: 8, icon: SearchIcon },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { name: 'Process Run', path: '/runs/new', permission: 'run.execute', phase: 5, icon: RefreshIcon },
      { name: 'Run History', path: '/runs', permission: 'risk.view', phase: 5, icon: HistoryIcon },
      { name: 'What-If Builder', path: '/what-if', permission: 'run.execute', phase: 5, icon: ColumnsIcon },
      { name: 'Batch Scheduler', path: '/scheduler', permission: 'run.execute', phase: 5, icon: ClockIcon },
    ],
  },
  {
    label: 'DATA',
    items: [
      { name: 'Data Upload & Staging', path: '/data-upload', permission: 'data.view', phase: 3, icon: DownloadIcon },
      { name: 'GL Reconciliation', path: '/gl-reconciliation', permission: 'data.view', phase: 3, icon: ReconciliationIcon },
      { name: 'Data Vintages & Load History', path: '/data-vintages', permission: 'data.view', phase: 3, icon: HistoryIcon },
      { name: 'Dimensions & Hierarchies', path: '/dimensions', permission: 'data.view', phase: 2, icon: CorporateActionsIcon },
      { name: 'Counterparty Register', path: '/counterparties', permission: 'data.view', phase: 2, icon: ClientManagementIcon },
      { name: 'Interest Rates & Curves', path: '/yield-curves', permission: 'data.view', phase: 2, icon: TrendingUpIcon },
      { name: 'Currency & FX Rates', path: '/fx-rates', permission: 'data.view', phase: 2, icon: NairaIcon },
      { name: 'Economic Indicators', path: '/economic-indicators', permission: 'data.view', phase: 2, icon: BarChartIcon },
      { name: 'Holiday Calendar', path: '/holiday-calendar', permission: 'data.view', phase: 2, icon: CalendarIcon },
    ],
  },
  {
    label: 'CONFIGURATION',
    items: [
      { name: 'Business Rules', path: '/rules', permission: 'rules.edit', phase: 4, icon: SettingsIcon },
      { name: 'Validation Rules', path: '/validation-rules', permission: 'data.configure', phase: 3, icon: CheckCircleIcon },
    ],
  },
  {
    label: 'AFFILIATE MANAGEMENT',
    items: [{ name: 'Affiliates', path: '/affiliates', permission: 'dashboard.view', phase: 3, icon: BriefcaseIcon }],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { name: 'Approvals', path: '/approvals', permission: 'risk.view', phase: 7, icon: AuthorizationQueueIcon },
      { name: 'Control Remediation', path: '/remediation', permission: 'risk.view', phase: 7, icon: AlertIcon },
      { name: 'Notifications', path: '/notifications', permission: 'dashboard.view', phase: 7, icon: BellIcon },
      { name: 'Users, Roles & Permissions', path: '/admin/users', permission: 'admin.manage', phase: 8, icon: UsersIcon },
      { name: 'System Preferences', path: '/admin/preferences', permission: 'admin.manage', phase: 8, icon: SettingsIcon },
      { name: 'Audit Log', path: '/admin/audit', permission: 'audit.view', phase: 8, icon: AuditIcon },
    ],
  },
];

/** Flat list, for the router. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
