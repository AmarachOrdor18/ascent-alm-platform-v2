/** Concentration & Risk Monitoring module — exposure -> limits -> KRIs, one workflow. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Concentration = lazy(() => import('@/pages/results/Concentration').then((m) => ({ default: m.Concentration })));
const Limits = lazy(() => import('@/pages/Limits').then((m) => ({ default: m.Limits })));
const Kri = lazy(() => import('@/pages/Kri').then((m) => ({ default: m.Kri })));

const TABS: ModuleTab[] = [
  { key: 'concentration', label: 'Concentration & Large Exposures', path: '/risk/concentration', permission: 'risk.view', Component: Concentration },
  { key: 'limits', label: 'Limits & Breaches', path: '/risk/concentration/limits', permission: 'risk.view', Component: Limits },
  { key: 'kri', label: 'Key Risk Indicators', path: '/risk/concentration/kri', permission: 'risk.view', Component: Kri },
];

export function ConcentrationModule() {
  return <ModuleTabs tabs={TABS} />;
}
