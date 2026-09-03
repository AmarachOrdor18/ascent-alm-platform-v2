/** Liquidity Risk module - tabs over two existing, unmodified screens. The Risk Map moved to Monitoring. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const LiquidityRisk = lazy(() => import('@/pages/results/LiquidityRisk').then((m) => ({ default: m.LiquidityRisk })));
const GapAnalysis = lazy(() => import('@/pages/results/GapAnalysis').then((m) => ({ default: m.GapAnalysis })));

const TABS: ModuleTab[] = [
  { key: 'liquidity-risk', label: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', Component: LiquidityRisk },
  { key: 'gap-analysis', label: 'Maturity & Repricing Gap', path: '/risk/liquidity/gap-analysis', permission: 'risk.view', Component: GapAnalysis },
];

export function LiquidityRiskModule() {
  return <ModuleTabs tabs={TABS} />;
}
