import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const ReportPacks = lazy(() => import('@/pages/ReportPacks').then((m) => ({ default: m.ReportPacks })));
const RegulatoryReporting = lazy(() =>
  import('@/pages/RegulatoryReporting').then((m) => ({ default: m.RegulatoryReporting })),
);
const AdHoc = lazy(() => import('@/pages/AdHoc').then((m) => ({ default: m.AdHoc })));

const TABS: ModuleTab[] = [
  { key: 'report-packs', label: 'Report Packs', path: '/reporting', permission: 'reporting.view', Component: ReportPacks },
  { key: 'regulatory', label: 'Regulatory Reporting', path: '/reporting/regulatory', permission: 'reporting.view', Component: RegulatoryReporting },
  { key: 'ad-hoc', label: 'Ad-Hoc Analysis', path: '/reporting/ad-hoc', permission: 'reporting.view', Component: AdHoc },
];

export function ReportingModule() {
  return <ModuleTabs tabs={TABS} />;
}
