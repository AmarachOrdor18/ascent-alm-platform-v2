/** Balance Sheet & Treasury module. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const BalanceSheet = lazy(() => import('@/pages/results/BalanceSheet').then((m) => ({ default: m.BalanceSheet })));
const FxPosition = lazy(() => import('@/pages/results/FxPosition').then((m) => ({ default: m.FxPosition })));

const TABS: ModuleTab[] = [
  { key: 'balance-sheet', label: 'Balance Sheet Analytics', path: '/treasury/balance-sheet', permission: 'treasury.view', Component: BalanceSheet },
  { key: 'fx-position', label: 'FX Position', path: '/treasury/balance-sheet/fx-position', permission: 'treasury.view', Component: FxPosition },
];

export function BalanceSheetTreasuryModule() {
  return <ModuleTabs tabs={TABS} />;
}
