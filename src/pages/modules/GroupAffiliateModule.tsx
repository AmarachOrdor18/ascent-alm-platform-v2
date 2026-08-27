import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Affiliates = lazy(() => import('@/pages/Affiliates').then((m) => ({ default: m.Affiliates })));

const TABS: ModuleTab[] = [
  { key: 'affiliates', label: 'Affiliates', path: '/affiliates', permission: 'dashboard.view', Component: Affiliates },
];

export function GroupAffiliateModule() {
  return <ModuleTabs tabs={TABS} />;
}
