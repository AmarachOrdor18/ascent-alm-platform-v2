import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Approvals = lazy(() => import('@/pages/Approvals').then((m) => ({ default: m.Approvals })));
const Remediation = lazy(() => import('@/pages/Remediation').then((m) => ({ default: m.Remediation })));
const Notifications = lazy(() => import('@/pages/Notifications').then((m) => ({ default: m.Notifications })));
const AdminUsers = lazy(() => import('@/pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminPreferences = lazy(() => import('@/pages/AdminPreferences').then((m) => ({ default: m.AdminPreferences })));
const AdminAudit = lazy(() => import('@/pages/AdminAudit').then((m) => ({ default: m.AdminAudit })));

const TABS: ModuleTab[] = [
  { key: 'approvals', label: 'Approvals', path: '/admin', permission: 'risk.view', Component: Approvals },
  { key: 'remediation', label: 'Control Remediation', path: '/admin/remediation', permission: 'risk.view', Component: Remediation },
  { key: 'notifications', label: 'Notifications', path: '/admin/notifications', permission: 'dashboard.view', Component: Notifications },
  { key: 'users', label: 'Users, Roles & Permissions', path: '/admin/users', permission: 'users.manage', Component: AdminUsers },
  { key: 'preferences', label: 'System Preferences', path: '/admin/preferences', permission: 'admin.manage', Component: AdminPreferences },
  { key: 'audit', label: 'Audit Log', path: '/admin/audit', permission: 'audit.view', Component: AdminAudit },
];

export function AdministrationModule() {
  return <ModuleTabs tabs={TABS} />;
}
