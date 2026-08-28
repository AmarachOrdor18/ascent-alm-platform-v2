import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const DataUpload = lazy(() => import('@/pages/DataUpload').then((m) => ({ default: m.DataUpload })));
const GlReconciliation = lazy(() => import('@/pages/GlReconciliation').then((m) => ({ default: m.GlReconciliation })));
const DataVintages = lazy(() => import('@/pages/DataVintages').then((m) => ({ default: m.DataVintages })));
const Dimensions = lazy(() => import('@/pages/Dimensions').then((m) => ({ default: m.Dimensions })));
const Counterparties = lazy(() => import('@/pages/Counterparties').then((m) => ({ default: m.Counterparties })));
const YieldCurves = lazy(() => import('@/pages/YieldCurves').then((m) => ({ default: m.YieldCurves })));
const FxRates = lazy(() => import('@/pages/FxRates').then((m) => ({ default: m.FxRates })));
const EconomicIndicators = lazy(() =>
  import('@/pages/EconomicIndicators').then((m) => ({ default: m.EconomicIndicators })),
);
const HolidayCalendar = lazy(() => import('@/pages/HolidayCalendar').then((m) => ({ default: m.HolidayCalendar })));
const Connectors = lazy(() => import('@/pages/Connectors').then((m) => ({ default: m.Connectors })));

const OPERATIONS_TABS: ModuleTab[] = [
  { key: 'upload', label: 'Data Upload & Staging', path: '/data/operations', permission: 'data.view', Component: DataUpload },
  { key: 'gl-reconciliation', label: 'GL Reconciliation', path: '/data/operations/gl-reconciliation', permission: 'data.view', Component: GlReconciliation },
  { key: 'vintages', label: 'Data Vintages & Load History', path: '/data/operations/vintages', permission: 'data.view', Component: DataVintages },
];

const STRUCTURE_TABS: ModuleTab[] = [
  { key: 'dimensions', label: 'Dimensions & Hierarchies', path: '/data/structure', permission: 'data.view', Component: Dimensions },
  { key: 'counterparties', label: 'Counterparty Register', path: '/data/structure/counterparties', permission: 'data.view', Component: Counterparties },
];

const REFERENCE_TABS: ModuleTab[] = [
  { key: 'yield-curves', label: 'Interest Rates & Curves', path: '/data/reference-data', permission: 'data.view', Component: YieldCurves },
  { key: 'fx-rates', label: 'Currency & FX Rates', path: '/data/reference-data/fx-rates', permission: 'data.view', Component: FxRates },
  { key: 'economic-indicators', label: 'Economic Indicators', path: '/data/reference-data/economic-indicators', permission: 'data.view', Component: EconomicIndicators },
  { key: 'holiday-calendar', label: 'Holiday Calendar', path: '/data/reference-data/holiday-calendar', permission: 'data.view', Component: HolidayCalendar },
];

function DataOperations() {
  return <ModuleTabs tabs={OPERATIONS_TABS} variant="secondary" />;
}

function DataStructure() {
  return <ModuleTabs tabs={STRUCTURE_TABS} variant="secondary" />;
}

function ReferenceData() {
  return <ModuleTabs tabs={REFERENCE_TABS} variant="secondary" />;
}

const GROUP_TABS: ModuleTab[] = [
  { key: 'connectors', label: 'Connectors & Data Sources', path: '/connectors', permission: 'data.view', Component: Connectors },
  { key: 'operations', label: 'Data Operations', path: '/data/operations', permission: 'data.view', Component: DataOperations },
  { key: 'structure', label: 'Data Structure', path: '/data/structure', permission: 'data.view', Component: DataStructure },
  { key: 'reference-data', label: 'Reference Data', path: '/data/reference-data', permission: 'data.view', Component: ReferenceData },
];

export function DataManagementModule() {
  return <ModuleTabs tabs={GROUP_TABS} matchMode="prefix" />;
}
