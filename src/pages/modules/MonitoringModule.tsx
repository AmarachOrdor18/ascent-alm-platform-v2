/**
 * Monitoring - limits, KRIs and the Group risk map, together as their own top-level pillar.
 * Previously split across Liquidity Risk (the risk map) and Concentration & Risk Monitoring
 * (limits, KRIs), which put the platform's active risk-monitoring surface two clicks deep inside
 * two unrelated modules rather than in one place a Risk Analyst would look for it.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Limits = lazy(() => import('@/pages/Limits').then((m) => ({ default: m.Limits })));
const Kri = lazy(() => import('@/pages/Kri').then((m) => ({ default: m.Kri })));
const RiskMap = lazy(() => import('@/pages/RiskMap').then((m) => ({ default: m.RiskMap })));

const TABS: ModuleTab[] = [
  { key: 'limits', label: 'Limits & Breaches', path: '/monitoring', permission: 'risk.view', Component: Limits },
  { key: 'kri', label: 'Key Risk Indicators', path: '/monitoring/kri', permission: 'risk.view', Component: Kri },
  { key: 'risk-map', label: 'Liquidity Risk Map', path: '/monitoring/risk-map', permission: 'risk.view', Component: RiskMap },
];

export function MonitoringModule() {
  return <ModuleTabs tabs={TABS} />;
}
