import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const TransferPricing = lazy(() =>
  import('@/pages/results/TransferPricing').then((m) => ({ default: m.TransferPricing })),
);
const Profitability = lazy(() => import('@/pages/results/Profitability').then((m) => ({ default: m.Profitability })));

// Module route gates on risk.view (the looser of the two permissions below).
const TABS: ModuleTab[] = [
  { key: 'ftp', label: 'Funds Transfer Pricing', path: '/treasury/ftp', permission: 'treasury.view', Component: TransferPricing },
  { key: 'profitability', label: 'Profitability Ratios', path: '/treasury/ftp/profitability', permission: 'risk.view', Component: Profitability },
];

export function FtpProfitabilityModule() {
  return <ModuleTabs tabs={TABS} />;
}
