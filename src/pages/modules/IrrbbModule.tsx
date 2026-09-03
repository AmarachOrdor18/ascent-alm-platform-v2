/** IRRBB & Behavioural Risk module - the IRRBB screen stays primary; Behavioural Analysis joins it as a tab. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const Irrbb = lazy(() => import('@/pages/results/Irrbb').then((m) => ({ default: m.Irrbb })));
const BehaviouralAnalysis = lazy(() =>
  import('@/pages/results/BehaviouralAnalysis').then((m) => ({ default: m.BehaviouralAnalysis })),
);

const TABS: ModuleTab[] = [
  { key: 'irrbb', label: 'Interest Rate Risk', path: '/risk/irrbb', permission: 'risk.view', Component: Irrbb },
  { key: 'behavioural', label: 'Behavioural Analysis', path: '/risk/irrbb/behavioural-analysis', permission: 'risk.view', Component: BehaviouralAnalysis },
];

export function IrrbbModule() {
  return <ModuleTabs tabs={TABS} />;
}
