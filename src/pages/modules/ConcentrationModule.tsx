/** Concentration & Large Exposures. Limits and KRIs moved to Monitoring - this is exposure analysis alone now. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Concentration = lazy(() => import('@/pages/results/Concentration').then((m) => ({ default: m.Concentration })));

const TABS: ModuleTab[] = [
  { key: 'concentration', label: 'Concentration & Large Exposures', path: '/risk/concentration', permission: 'risk.view', Component: Concentration },
];

export function ConcentrationModule() {
  return <ModuleTabs tabs={TABS} />;
}
