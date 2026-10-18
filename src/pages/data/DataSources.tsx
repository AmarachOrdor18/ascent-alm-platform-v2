// Data → Sources: every feed of data, who it belongs to, how it arrives, what came last and what is
// waiting in its lobby. The header Scope decides what is shown: one affiliate lists its sources as rows;
// Group shows one row per affiliate and one column per standard source, so 30+ affiliates stay readable. The open source lives in the URL
// (?source=<id>&tab=<tab>) so it can be linked to; ?upload=1 opens Upload data; ?domain=<Domain> opens
// the first source of that kind (old links to GL reconciliation land on the general-ledger source).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useScope } from '@/context/ScopeContext';
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
  const { affiliateCode: scopeCode } = useScope();
  const affiliateFilter = restrictedOrScope(scopeCode);
  const [gridSearch, setGridSearch] = useState('');
  const [gapsOnly, setGapsOnly] = useState(false);
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

      {!isLoading && sources.length === 0 ? (
        <EmptyState title="No data sources yet">
          Every affiliate gets six sources when it is created: Loans, Deposits, Treasury, General ledger, Balance
          history and Account history. Group has one market-data source.
        </EmptyState>
      ) : !restricted && affiliateFilter === 'ALL' ? (
        <SourceGrid
          sources={listed}
          affiliates={affiliates}
          stats={stats}
          search={gridSearch}
          onSearch={setGridSearch}
          gapsOnly={gapsOnly}
          onGapsOnly={setGapsOnly}
          onOpen={(id, t) => setParams({ source: id, tab: t ?? null })}
        />
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

/** Header Scope → which affiliate's sources to list ('ALL' at Group). */
function restrictedOrScope(scopeCode: string): string {
  return scopeCode === 'GROUP' ? 'ALL' : scopeCode;
}

/** The standard source columns, in the order data arrives. */
const GRID_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'Loans', label: 'Loans' },
  { key: 'Deposits', label: 'Deposits' },
  { key: 'Treasury', label: 'Treasury' },
  { key: 'GeneralLedger', label: 'General ledger' },
  { key: 'BalanceHistory', label: 'Balance history' },
  { key: 'AccountHistory', label: 'Account history' },
];
const columnOf = (s: DataSource) => s.contributor ?? s.domain;

/** Group view: one row per affiliate, one column per standard source; a cell is the latest load (or Never). */
function SourceGrid({
  sources,
  affiliates,
  stats,
  search,
  onSearch,
  gapsOnly,
  onGapsOnly,
  onOpen,
}: {
  sources: DataSource[];
  affiliates: Array<{ code: string; name: string; status: string }>;
  stats: { lastLoad: Map<string, LoadBatch>; inLobby: Map<string, number> };
  search: string;
  onSearch: (v: string) => void;
  gapsOnly: boolean;
  onGapsOnly: (v: boolean) => void;
  onOpen: (sourceId: string, tab?: SourceTab) => void;
}) {
  const market = sources.find((s) => s.affiliateCode === 'GROUP');
  const rows = affiliates
    .filter((a) => a.code !== 'GROUP')
    .map((a) => {
      const own = sources.filter((s) => s.affiliateCode === a.code);
      const cells = GRID_COLUMNS.map((c) => own.find((s) => columnOf(s) === c.key) ?? null);
      const loaded = cells.filter((c) => c && stats.lastLoad.has(c.id)).length;
      const waiting = own.reduce((n, s) => n + (stats.inLobby.get(s.id) ?? 0), 0);
      const extra = own.filter((s) => !GRID_COLUMNS.some((c) => c.key === columnOf(s)));
      return { a, cells, loaded, total: cells.filter(Boolean).length, waiting, extra };
    })
    .filter((r) => {
      const t = search.trim().toLowerCase();
      if (t && !r.a.name.toLowerCase().includes(t) && !r.a.code.toLowerCase().includes(t)) return false;
      return !gapsOnly || r.loaded < r.total || r.waiting > 0;
    })
    .sort((x, y) => x.a.name.localeCompare(y.a.name));

  return (
    <div className="space-y-4">
      {market && (
        <button
          type="button"
          onClick={() => onOpen(market.id)}
          className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left text-[13px] shadow-sm hover:border-navy-700"
        >
          <span className="font-bold text-navy-900">Market data</span>
          <span className="text-gray-500">Group · used by every affiliate</span>
          <GridCell last={stats.lastLoad.get(market.id) ?? null} waiting={stats.inLobby.get(market.id) ?? 0} />
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Find an affiliate"
          placeholder="Find an affiliate…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className={`${inputCls} w-64`}
        />
        <label className="flex items-center gap-2 text-[13px] text-gray-600">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => onGapsOnly(e.target.checked)} />
          Only affiliates with missing loads or files waiting
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm" data-tour="sources-table">
        <table className="w-full text-[13px]">
          <thead className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-2.5 font-bold">Affiliate</th>
              <th className="px-4 py-2.5 font-bold">Loaded</th>
              {GRID_COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2.5 font-bold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={GRID_COLUMNS.length + 2} className="px-4 py-6 text-center text-gray-400">
                  {gapsOnly || search ? 'No affiliate matches.' : 'No affiliates yet.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.a.code}>
                  <td className="px-4 py-2">
                    <span className="font-bold text-navy-900">{r.a.name}</span>{' '}
                    <span className="font-mono text-[11px] text-gray-400">{r.a.code}</span>
                    {r.extra.length > 0 && (
                      <span className="ml-2 text-[11px] text-gray-400">+{r.extra.length} other</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge
                      status={`${r.loaded}/${r.total}`}
                      tone={r.loaded === r.total ? 'success' : r.loaded === 0 ? 'neutral' : 'warning'}
                    />
                  </td>
                  {r.cells.map((cell, i) =>
                    cell ? (
                      <td key={i} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpen(cell.id, (stats.inLobby.get(cell.id) ?? 0) > 0 ? 'lobby' : undefined)}
                          className="rounded px-1 py-0.5 hover:bg-navy-50"
                          title={`${cell.name} - open`}
                        >
                          <GridCell
                            last={stats.lastLoad.get(cell.id) ?? null}
                            waiting={stats.inLobby.get(cell.id) ?? 0}
                          />
                        </button>
                      </td>
                    ) : (
                      <td key={i} className="px-3 py-2 text-gray-300">
                        -
                      </td>
                    ),
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridCell({ last, waiting }: { last: LoadBatch | null; waiting: number }) {
  const stage = last ? loadStage(last) : null;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {last && stage ? (
        <span className={`font-mono text-[12px] ${stage === 'Admitted' ? 'text-success' : 'text-gray-600'}`}>
          {formatDate(last.asOfDate)}
        </span>
      ) : (
        <span className="text-[12px] text-gray-400">Never</span>
      )}
      {waiting > 0 && (
        <span className="rounded-full bg-warning-bg px-1.5 text-[11px] font-bold text-warning">{waiting} waiting</span>
      )}
    </span>
  );
}
