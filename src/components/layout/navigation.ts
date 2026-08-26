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

export interface NavItem {
  name: string;
  path: string;
  permission: string;
  /** Build phase this screen lands in — see build plan §14. */
  phase: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { name: 'Dashboard', path: '/dashboard', permission: 'dashboard.view', phase: 6 },
    ],
  },
  {
    label: 'RISK MANAGEMENT',
    items: [
      { name: 'Liquidity Risk', path: '/liquidity-risk', permission: 'risk.view', phase: 6 },
      { name: 'Interest Rate Risk (IRRBB)', path: '/interest-rate-risk', permission: 'risk.view', phase: 6 },
      { name: 'Stress Testing', path: '/stress-testing', permission: 'risk.view', phase: 5 },
      { name: 'Limits & Breaches', path: '/limits', permission: 'risk.view', phase: 7 },
      { name: 'Key Risk Indicators', path: '/kri', permission: 'risk.view', phase: 7 },
      { name: 'Liquidity Risk Map', path: '/risk-map', permission: 'risk.view', phase: 7 },
    ],
  },
  {
    label: 'TREASURY',
    items: [
      { name: 'Funds Transfer Pricing', path: '/ftp', permission: 'treasury.view', phase: 6 },
      { name: 'Balance Sheet', path: '/balance-sheet', permission: 'treasury.view', phase: 6 },
      { name: 'FX Position', path: '/fx-position', permission: 'treasury.view', phase: 6 },
    ],
  },
  {
    label: 'REPORTING',
    items: [
      { name: 'ALCO Meetings', path: '/alco-meetings', permission: 'reporting.view', phase: 8 },
      { name: 'ALCO Reporting', path: '/alco-reporting', permission: 'reporting.view', phase: 8 },
      { name: 'Regulatory Reporting', path: '/regulatory-reporting', permission: 'reporting.view', phase: 8 },
      { name: 'Management Reporting', path: '/management-reporting', permission: 'reporting.view', phase: 8 },
      { name: 'Ad-Hoc Analysis', path: '/ad-hoc', permission: 'reporting.view', phase: 8 },
    ],
  },
  {
    label: 'EXECUTION',
    items: [
      { name: 'Process Run', path: '/runs/new', permission: 'run.execute', phase: 5 },
      { name: 'Run History', path: '/runs', permission: 'risk.view', phase: 5 },
      { name: 'What-If Builder', path: '/what-if', permission: 'run.execute', phase: 5 },
      { name: 'Batch Scheduler', path: '/scheduler', permission: 'run.execute', phase: 5 },
    ],
  },
  {
    label: 'DATA MANAGEMENT',
    items: [
      { name: 'Data Upload & Staging', path: '/data-upload', permission: 'data.view', phase: 3 },
      { name: 'GL Reconciliation', path: '/gl-reconciliation', permission: 'data.view', phase: 3 },
      { name: 'Data Vintages & Load History', path: '/data-vintages', permission: 'data.view', phase: 3 },
    ],
  },
  {
    label: 'REFERENCE DATA',
    items: [
      { name: 'Dimensions & Hierarchies', path: '/dimensions', permission: 'data.view', phase: 2 },
      { name: 'Counterparty Register', path: '/counterparties', permission: 'data.view', phase: 2 },
      { name: 'Interest Rates & Curves', path: '/yield-curves', permission: 'data.view', phase: 2 },
      { name: 'Currency & FX Rates', path: '/fx-rates', permission: 'data.view', phase: 2 },
      { name: 'Economic Indicators', path: '/economic-indicators', permission: 'data.view', phase: 2 },
      { name: 'Holiday Calendar', path: '/holiday-calendar', permission: 'data.view', phase: 2 },
    ],
  },
  {
    label: 'CONFIGURATION',
    items: [
      { name: 'Business Rules', path: '/rules', permission: 'rules.edit', phase: 4 },
      { name: 'Validation Rules', path: '/validation-rules', permission: 'data.configure', phase: 3 },
    ],
  },
  {
    label: 'GROUP MANAGEMENT',
    items: [
      { name: 'Affiliates', path: '/affiliates', permission: 'dashboard.view', phase: 3 },
      { name: 'Onboard Affiliate', path: '/affiliates/onboard', permission: 'group.manage', phase: 3 },
      { name: 'Connectors & Data Sources', path: '/connectors', permission: 'data.view', phase: 3 },
    ],
  },
  {
    label: 'WORKFLOW',
    items: [
      { name: 'Approvals', path: '/approvals', permission: 'risk.view', phase: 7 },
      { name: 'Control Remediation', path: '/remediation', permission: 'risk.view', phase: 7 },
      { name: 'Notifications', path: '/notifications', permission: 'dashboard.view', phase: 7 },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { name: 'Users, Roles & Permissions', path: '/admin/users', permission: 'admin.manage', phase: 8 },
      { name: 'System Preferences', path: '/admin/preferences', permission: 'admin.manage', phase: 8 },
      { name: 'Audit Log', path: '/admin/audit', permission: 'audit.view', phase: 8 },
    ],
  },
];

/** Flat list, for the router. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
