/** Liquidity Risk module — tabs over three existing, unmodified screens. */
import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const LiquidityRisk = lazy(() => import('@/pages/results/LiquidityRisk').then((m) => ({ default: m.LiquidityRisk })));
const RiskMap = lazy(() => import('@/pages/RiskMap').then((m) => ({ default: m.RiskMap })));
const GapAnalysis = lazy(() => import('@/pages/results/GapAnalysis').then((m) => ({ default: m.GapAnalysis })));

const TABS: ModuleTab[] = [
  { key: 'liquidity-risk', label: 'Liquidity Risk', path: '/risk/liquidity', permission: 'risk.view', Component: LiquidityRisk },
  { key: 'risk-map', label: 'Liquidity Risk Map', path: '/risk/liquidity/risk-map', permission: 'risk.view', Component: RiskMap },
  { key: 'gap-analysis', label: 'Maturity & Repricing Gap', path: '/risk/liquidity/gap-analysis', permission: 'risk.view', Component: GapAnalysis },
];

export function LiquidityRiskModule() {
  return <ModuleTabs tabs={TABS} />;
}
