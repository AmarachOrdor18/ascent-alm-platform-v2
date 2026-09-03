/**
 * Controls - maker-checker approvals and control remediation, as their own top-level pillar.
 * Previously two tabs buried inside Administration & Governance alongside Notifications, Users and
 * System Preferences - heterogeneous job functions (control tester vs. IT admin) forced under one
 * sidebar row.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Approvals = lazy(() => import('@/pages/Approvals').then((m) => ({ default: m.Approvals })));
const Remediation = lazy(() => import('@/pages/Remediation').then((m) => ({ default: m.Remediation })));

const TABS: ModuleTab[] = [
  { key: 'approvals', label: 'Approvals', path: '/controls', permission: 'risk.view', Component: Approvals },
  { key: 'remediation', label: 'Control Remediation', path: '/controls/remediation', permission: 'risk.view', Component: Remediation },
];

export function ControlsModule() {
  return <ModuleTabs tabs={TABS} />;
}
