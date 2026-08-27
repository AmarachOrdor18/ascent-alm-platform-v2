/**
 * Group & Affiliate Management module.
 *
 * Connectors & Data Sources already has its own affiliate picker
 * (`AffiliateSelector`) independent of the global scope switcher — this
 * just makes it reachable from the sidebar next to the affiliate directory
 * it configures, instead of only via a link buried in the onboarding
 * wizard. `/connectors` keeps its existing address, so the onboarding
 * wizard's and Affiliate Detail's existing links to it are unaffected.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Affiliates = lazy(() => import('@/pages/Affiliates').then((m) => ({ default: m.Affiliates })));
const Connectors = lazy(() => import('@/pages/Connectors').then((m) => ({ default: m.Connectors })));

const TABS: ModuleTab[] = [
  { key: 'affiliates', label: 'Affiliates', path: '/affiliates', permission: 'dashboard.view', Component: Affiliates },
  { key: 'connectors', label: 'Connectors & Data Sources', path: '/connectors', permission: 'data.view', Component: Connectors },
];

export function GroupAffiliateModule() {
  return <ModuleTabs tabs={TABS} />;
}
