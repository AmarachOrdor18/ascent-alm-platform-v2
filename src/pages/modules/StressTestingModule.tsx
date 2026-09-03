import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const StressTesting = lazy(() => import('@/pages/StressTesting').then((m) => ({ default: m.StressTesting })));
const WhatIf = lazy(() => import('@/pages/WhatIf').then((m) => ({ default: m.WhatIf })));
const Forecast = lazy(() => import('@/pages/Forecast').then((m) => ({ default: m.Forecast })));

// Route gates on risk.view (the looser permission); this tab list is what actually hides What-If Builder and
// Forecast (both run.execute) from roles that can only view.
const TABS: ModuleTab[] = [
  { key: 'stress-testing', label: 'Stress Testing', path: '/risk/stress-testing', permission: 'risk.view', Component: StressTesting },
  { key: 'what-if', label: 'What-If Builder', path: '/risk/stress-testing/what-if', permission: 'run.execute', Component: WhatIf },
  { key: 'forecast', label: 'Forecast', path: '/risk/stress-testing/forecast', permission: 'run.execute', Component: Forecast },
];

export function StressTestingModule() {
  return <ModuleTabs tabs={TABS} />;
}
