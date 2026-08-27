import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';

const AlcoMeetings = lazy(() => import('@/pages/AlcoMeetings').then((m) => ({ default: m.AlcoMeetings })));
const ReportPacks = lazy(() => import('@/pages/ReportPacks').then((m) => ({ default: m.ReportPacks })));
const RegulatoryReporting = lazy(() =>
  import('@/pages/RegulatoryReporting').then((m) => ({ default: m.RegulatoryReporting })),
);
const AdHoc = lazy(() => import('@/pages/AdHoc').then((m) => ({ default: m.AdHoc })));

const TABS: ModuleTab[] = [
  { key: 'alco-meetings', label: 'ALCO Meetings', path: '/reporting', permission: 'reporting.view', Component: AlcoMeetings },
  { key: 'report-packs', label: 'Report Packs', path: '/reporting/report-packs', permission: 'reporting.view', Component: ReportPacks },
  { key: 'regulatory', label: 'Regulatory Reporting', path: '/reporting/regulatory', permission: 'reporting.view', Component: RegulatoryReporting },
  { key: 'ad-hoc', label: 'Ad-Hoc Analysis', path: '/reporting/ad-hoc', permission: 'reporting.view', Component: AdHoc },
];

export function ReportingModule() {
  return <ModuleTabs tabs={TABS} />;
}
