import { lazy } from 'react';
import { ModuleTabs, type ModuleTab } from '@/components/layout/ModuleTabs';
import { PipelineTabs } from '@/components/layout/PipelineTabs';
import { useScope } from '@/context/ScopeContext';
import { useBatches } from '@/lib/hooks';
import { availableAsOfDates, currentPositionBatches } from '@/engine/vintage';

const DataUpload = lazy(() => import('@/pages/DataUpload').then((m) => ({ default: m.DataUpload })));
const GlReconciliation = lazy(() => import('@/pages/GlReconciliation').then((m) => ({ default: m.GlReconciliation })));
const DataVintages = lazy(() => import('@/pages/DataVintages').then((m) => ({ default: m.DataVintages })));
const PositionBook = lazy(() => import('@/pages/PositionBook').then((m) => ({ default: m.PositionBook })));
const Dimensions = lazy(() => import('@/pages/Dimensions').then((m) => ({ default: m.Dimensions })));
const Counterparties = lazy(() => import('@/pages/Counterparties').then((m) => ({ default: m.Counterparties })));

/**
 * The three steps genuinely happen in this order - upload before reconcile before it lands in
 * the book - so this group gets the numbered `PipelineTabs` instead of a plain tab strip.
 * `done` is a best-effort signal for the *current* scope selection (latest as-of date for the
 * signed-in affiliate); it never gates access to a step, just shows progress.
 */
function LoadData() {
  const { affiliateCode } = useScope();
  const { data: batches = [] } = useBatches();

  const latestDate = affiliateCode !== 'GROUP' ? availableAsOfDates(batches, affiliateCode, 'Positions')[0] : undefined;
  const currentBatches = latestDate ? currentPositionBatches(batches, affiliateCode, latestDate) : [];
  const hasUploaded = currentBatches.length > 0;
  const allReconciled = hasUploaded && currentBatches.every((b) => !!b.reconciledAt);

  return (
    <>
      <PipelineTabs
        steps={[
          {
            key: 'upload',
            label: 'Upload & Stage',
            path: '/data/operations',
            permission: 'data.view',
            Component: DataUpload,
            done: hasUploaded,
          },
          {
            key: 'gl-reconciliation',
            label: 'Reconcile to GL',
            path: '/data/operations/gl-reconciliation',
            permission: 'data.view',
            Component: GlReconciliation,
            done: allReconciled,
          },
          {
            key: 'position-book',
            label: 'Position Book',
            path: '/data/operations/position-book',
            permission: 'data.view',
            Component: PositionBook,
            done: hasUploaded && allReconciled,
          },
        ]}
        history={{
          key: 'vintages',
          label: 'Load History',
          path: '/data/operations/vintages',
          permission: 'data.view',
          Component: DataVintages,
        }}
      />
    </>
  );
}

// Every screen in this module as one flat tab strip - previously Reference Data and Advanced were
// each a second ModuleTabs nested inside this one, the only module in the app three tabs deep
// instead of the one level every other module uses. Flattening removes that inconsistency; "Load
// Data" is the sole remaining exception, since its three steps are a genuine sequence (upload before
// reconcile before it lands in the book), not peer alternatives, so it keeps its own PipelineTabs.
const GROUP_TABS: ModuleTab[] = [
  {
    key: 'load-data',
    label: 'Load Data',
    path: '/data/operations',
    matchPaths: [
      '/data/operations',
      '/data/operations/gl-reconciliation',
      '/data/operations/position-book',
      '/data/operations/vintages',
    ],
    permission: 'data.view',
    Component: LoadData,
  },
  {
    key: 'dimensions',
    label: 'Dimensions & Hierarchies',
    path: '/data/structure',
    permission: 'data.view',
    Component: Dimensions,
  },
  {
    key: 'counterparties',
    label: 'Counterparty Register',
    path: '/data/structure/counterparties',
    permission: 'data.view',
    Component: Counterparties,
  },
  {
    key: 'load-history',
    label: 'Data Vintages & Load History',
    path: '/data/quality',
    permission: 'data.view',
    Component: DataVintages,
  },
];

export function DataManagementModule() {
  return <ModuleTabs tabs={GROUP_TABS} />;
}
