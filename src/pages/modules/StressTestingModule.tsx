import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const StressTesting = lazy(() => import('@/pages/StressTesting').then((m) => ({ default: m.StressTesting })));
const WhatIf = lazy(() => import('@/pages/WhatIf').then((m) => ({ default: m.WhatIf })));

// Route gates on risk.view (the looser permission); this tab list is what actually hides What-If Builder from roles lacking run.execute.
const TABS: ModuleTab[] = [
  { key: 'stress-testing', label: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', Component: StressTesting },
  { key: 'what-if', label: 'What-If Builder', path: '/risk/stress-testing/what-if', permission: 'run.execute', Component: WhatIf },
];

export function StressTestingModule() {
  return <ModuleTabs tabs={TABS} />;
}
