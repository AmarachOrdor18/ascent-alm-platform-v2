/**
 * Stress Testing & Scenario Analysis module.
 *
 * What-If Builder needs `run.execute`, unlike Stress Testing's `risk.view` —
 * the module route itself gates on `risk.view` (the looser of the two, see
 * navigation.ts), and this tab list is what actually hides What-If Builder
 * from a role that lacks `run.execute`.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const StressTesting = lazy(() => import('@/pages/StressTesting').then((m) => ({ default: m.StressTesting })));
const WhatIf = lazy(() => import('@/pages/WhatIf').then((m) => ({ default: m.WhatIf })));

const TABS: ModuleTab[] = [
  { key: 'stress-testing', label: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', Component: StressTesting },
  { key: 'what-if', label: 'What-If Builder', path: '/risk/stress-testing/what-if', permission: 'run.execute', Component: WhatIf },
];

export function StressTestingModule() {
  return <ModuleTabs tabs={TABS} />;
}
