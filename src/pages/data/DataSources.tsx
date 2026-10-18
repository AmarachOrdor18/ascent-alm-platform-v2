// Data → Sources: every feed of data, who it belongs to, how it arrives, what came last and what is
// waiting in its lobby. Affiliate users see only their own affiliate's sources (no affiliate picker);
// Group users see every source grouped by affiliate, with a filter. The open source lives in the URL
// (?source=<id>&tab=<tab>) so it can be linked to; ?upload=1 opens Upload data; ?domain=<Domain> opens
// the first source of that kind (old links to GL reconciliation land on the general-ledger source).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { CONNECTOR_TYPE_LABEL, sourceKindLabel } from '@/lib/dataSources';
import {
  loadStage,
  sourceForLoad,
  STAGE_TONE,
  useCanAddSources,
  useCanUploadData,
  useDataSources,
  useLobby,
} from '@/lib/sourceHooks';
import { formatDate } from '@/lib/format';
import { SourceDrawer, type SourceTab } from '@/components/data/SourceDrawer';
import { UploadDataModal } from '@/components/data/UploadDataModal';
import { AddSourceDrawer } from '@/components/data/AddSourceDrawer';
import { btn, inputCls } from '@/components/data/sourceUi';
import type { DataSource, LoadBatch } from '@/engine/types';

const HistoryForModels = lazy(() =>
  import('@/pages/areas/HistoryForModels').then((m) => ({ default: m.HistoryForModels })),
);

/** The Sources tab - and, at /data/history, the behavioural-model history coverage reached from a history source. */
export function DataSourcesTab() {
  const [location] = useLocation();
  if (location === '/data/history') {
    return (
      <Suspense fallback={null}>
        <HistoryForModels />
      </Suspense>
    );
  }
  return <DataSources />;
}

export function DataSources({ adminView = false }: { adminView?: boolean }) {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const selectedId = params.get('source');
  const tab = (params.get('tab') as SourceTab | null) ?? 'overview';
  const canUpload = useCanUploadData();
  const canConfigure = useCanAddSources() && adminView;

  const { data: sources = [], restricted, isLoading } = useDataSources();
  const { data: affiliates = [] } = useAffiliates();
  const { data: batches = [] } = useBatches();
  const { data: lobby = [] } = useLobby();
  const [affiliateFilter, setAffiliateFilter] = useState('ALL');
  const [showUpload, setShowUpload] = useState<{ sourceId: string | null } | null>(
    params.get('upload') === '1' ? { sourceId: selectedId } : null,
  );
  const [showAdd, setShowAdd] = useState(false);

  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    navigate(`${location}${q ? `?${q}` : ''}`, { replace: true });
  };

  // Old links (e.g. /gl-reconciliation) arrive with ?domain=GeneralLedger - open that kind of source.
  const domainParam = params.get('domain');
  useEffect(() => {
    if (!domainParam || selectedId || sources.length === 0) return;
    const match = sources.find((s) => s.domain === domainParam);
    setParams({
      domain: null,
      source: match?.id ?? null,
      tab: match && domainParam === 'GeneralLedger' ? 'check' : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot redirect once sources load
  }, [domainParam, sources.length]);

  const affName = (code: string) =>
    code === 'GROUP' ? 'Group' : (affiliates.find((a) => a.code === code)?.name ?? code);

  const stats = useMemo(() => {
    const lastLoad = new Map<string, LoadBatch>();
    for (const b of [...batches].sort((a, z) => a.uploadedAt.localeCompare(z.uploadedAt))) {
      if (b.status === 'Staged') continue;
      const s = sourceForLoad(b, sources);
      if (s) lastLoad.set(s.id, b);
    }
    const inLobby = new Map<string, number>();
    for (const st of lobby) {
      const s = sourceForLoad({ ...st, contributor: st.batch.contributor }, sources);
      if (s) inLobby.set(s.id, (inLobby.get(s.id) ?? 0) + 1);
    }
    return { lastLoad, inLobby };
  }, [batches, lobby, sources]);

  // A switched-off source that never had a file admitted is just clutter - only ones with history stay listed.
  const listed = sources.filter((s) => s.isActive || stats.lastLoad.has(s.id));
  const visible = affiliateFilter === 'ALL' ? listed : listed.filter((s) => s.affiliateCode === affiliateFilter);
  const groups = useMemo(() => {
    if (restricted) return [{ code: '', rows: visible }];
    const codes = [...new Set(visible.map((s) => s.affiliateCode))].sort((a, b) =>
      a === 'GROUP' ? -1 : b === 'GROUP' ? 1 : affName(a).localeCompare(affName(b)),
    );
    return codes.map((code) => ({ code, rows: visible.filter((s) => s.affiliateCode === code) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- affName reads affiliates, already a dependency
  }, [visible, restricted, affiliates]);

  const waiting = [...stats.inLobby.values()].reduce((a, b) => a + b, 0);
  const neverLoaded = sources.filter((s) => s.isActive && !stats.lastLoad.has(s.id)).length;
  const ownAffiliate = restricted && sources[0] ? affName(sources[0].affiliateCode) : undefined;

  return (
    <>
      <ModuleHeader
        title="Data sources"
        description="Where your data comes from - upload, check, admit."
        about="Nothing reaches the calculations until it is admitted."
        asOfDate={null}
        scope={restricted ? ownAffiliate : 'All affiliates'}
        metrics={[
          {
            label: 'Sources',
            value: String(sources.filter((s) => s.isActive).length),
            about: 'Active data sources you can see.',
          },
          {
            label: 'Waiting in lobby',
            value: String(waiting),
            tone: waiting > 0 ? 'warning' : 'neutral',
            about: 'Files uploaded but not yet admitted or rejected.',
          },
          {
            label: 'Never loaded',
            value: String(neverLoaded),
            tone: neverLoaded > 0 ? 'warning' : 'success',
            about: 'Active sources that have not had a file admitted yet.',
          },
        ]}
        actions={
          <>
            {canUpload && (
              <button
                type="button"
                data-tour="upload-data"
                className={btn.primary}
                onClick={() => setShowUpload({ sourceId: null })}
                disabled={sources.length === 0}
              >
                Upload data
              </button>
            )}
            {canConfigure && (
              <button type="button" data-tour="add-source" className={btn.secondary} onClick={() => setShowAdd(true)}>
                Add data source
              </button>
            )}
          </>
        }
      />

      {!restricted && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="src-affiliate" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Affiliate
          </label>
          <select
            id="src-affiliate"
            className={`${inputCls} w-auto`}
            value={affiliateFilter}
            onChange={(e) => setAffiliateFilter(e.target.value)}
          >
            <option value="ALL">All</option>
            {[...new Set(sources.map((s) => s.affiliateCode))].map((c) => (
              <option key={c} value={c}>
                {affName(c)}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isLoading && sources.length === 0 ? (
        <EmptyState title="No data sources yet">
          Every affiliate gets two sources when it is created: positions and the general ledger. Group has one
          market-data source.
          {canConfigure
            ? ' You can also add one with “Add data source”.'
            : ' The Organisation Admin can add more under Admin → Organisation setup → Data sources.'}
        </EmptyState>
      ) : (
        <div
          className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm"
          data-tour="sources-table"
        >
          <table className="w-full text-[13px]">
            <thead className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-2.5 font-bold">Source</th>
                <th className="px-4 py-2.5 font-bold">Data</th>
                <th className="px-4 py-2.5 font-bold">Department</th>
                <th className="px-4 py-2.5 font-bold">Arrives by</th>
                <th className="px-4 py-2.5 font-bold">Last load</th>
                <th className="px-4 py-2.5 text-right font-bold">In lobby</th>
                <th className="px-4 py-2.5 font-bold">Owner</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.code || 'own'} className="divide-y divide-gray-50">
                {g.code && (
                  <tr className="bg-gray-50/70">
                    <td colSpan={7} className="px-4 py-1.5 text-[12px] font-bold text-navy-900">
                      {affName(g.code)}
                      {g.code === 'GROUP' && (
                        <span className="ml-2 font-normal text-gray-500">market data used by every affiliate</span>
                      )}
                    </td>
                  </tr>
                )}
                {g.rows.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    last={stats.lastLoad.get(s.id) ?? null}
                    inLobby={stats.inLobby.get(s.id) ?? 0}
                    onOpen={(t) => setParams({ source: s.id, tab: t ?? null })}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {selectedId && (
        <SourceDrawer
          sourceId={selectedId}
          tab={tab}
          onTab={(t) => setParams({ tab: t === 'overview' ? null : t })}
          onClose={() => setParams({ source: null, tab: null })}
          onUpload={(id) => setShowUpload({ sourceId: id })}
        />
      )}
      {showUpload && (
        <UploadDataModal
          sources={sources}
          initialSourceId={showUpload.sourceId}
          groupView={!restricted}
          onClose={() => {
            setShowUpload(null);
            if (params.get('upload')) setParams({ upload: null });
          }}
        />
      )}
      {showAdd && (
        <AddSourceDrawer
          onClose={() => setShowAdd(false)}
          onCreated={(id) => {
            setShowAdd(false);
            setParams({ source: id, tab: 'fields' });
          }}
        />
      )}
    </>
  );
}

function SourceRow({
  source: s,
  last,
  inLobby,
  onOpen,
}: {
  source: DataSource;
  last: LoadBatch | null;
  inLobby: number;
  onOpen: (tab?: SourceTab) => void;
}) {
  const stage = last ? loadStage(last) : null;
  return (
    <tr className={`cursor-pointer hover:bg-navy-50/40 ${s.isActive ? '' : 'opacity-50'}`} onClick={() => onOpen()}>
      <td className="px-4 py-2.5">
        <button
          type="button"
          className="text-left font-bold text-navy-900 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {s.name}
        </button>
        {!s.isActive && <span className="ml-2 text-[11px] text-gray-400">off</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-600">{sourceKindLabel(s)}</td>
      <td className="px-4 py-2.5 text-gray-600">{s.contributor ?? <span className="text-gray-300">-</span>}</td>
      <td className="px-4 py-2.5 text-gray-600">{CONNECTOR_TYPE_LABEL[s.connectorType]}</td>
      <td className="px-4 py-2.5">
        {last && stage ? (
          <span className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-gray-600">{formatDate(last.asOfDate)}</span>
            <StatusBadge status={stage} tone={STAGE_TONE[stage]} />
          </span>
        ) : (
          <span className="text-[12px] text-gray-400">Never</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        {inLobby > 0 ? (
          <button
            type="button"
            className="rounded-full bg-warning-bg px-2 py-0.5 text-[12px] font-bold text-warning"
            onClick={(e) => {
              e.stopPropagation();
              onOpen('lobby');
            }}
          >
            {inLobby}
          </button>
        ) : (
          <span className="text-gray-300">0</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-600">{s.owner || '-'}</td>
    </tr>
  );
}
