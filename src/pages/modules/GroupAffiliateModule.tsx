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
