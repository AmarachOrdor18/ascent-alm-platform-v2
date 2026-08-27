/**
 * Execution & Scheduling module.
 *
 * What-If Builder is deliberately not here — it lives under Stress Testing
 * & Scenario Analysis, since that's the workflow it actually belongs to.
 *
 * Run History needs only `risk.view`, unlike Process Run/Batch Scheduler's
 * `run.execute` — the module route gates on `risk.view`, the looser of the
 * two, matching today's behavior where a read-only role still sees Run
 * History.
 */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const ProcessRun = lazy(() => import('@/pages/ProcessRun').then((m) => ({ default: m.ProcessRun })));
const RunHistory = lazy(() => import('@/pages/RunHistory').then((m) => ({ default: m.RunHistory })));
const BatchScheduler = lazy(() => import('@/pages/BatchScheduler').then((m) => ({ default: m.BatchScheduler })));

const TABS: ModuleTab[] = [
  { key: 'process-run', label: 'Process Run', path: '/execution', permission: 'run.execute', Component: ProcessRun },
  { key: 'history', label: 'Run History', path: '/execution/history', permission: 'risk.view', Component: RunHistory },
  { key: 'scheduler', label: 'Batch Scheduler', path: '/execution/scheduler', permission: 'run.execute', Component: BatchScheduler },
];

export function ExecutionModule() {
  return <ModuleTabs tabs={TABS} />;
}
