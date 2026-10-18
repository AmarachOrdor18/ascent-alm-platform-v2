// Data → History: every load through every source - waiting in the lobby, admitted, rejected, withdrawn
// or replaced by a later file - with what its checks found. Affiliate users see their own loads only.
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { TablePagination, TableToolbar, useTableControls } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import { SOURCE_DOMAIN_LABEL } from '@/lib/dataSources';
import { loadStage, sourceForLoad, STAGE_TONE, useDataSources, useLobby, type LoadStage } from '@/lib/sourceHooks';
import { formatDate } from '@/lib/format';
import { inputCls, KeyValueGrid, Notice, Section } from '@/components/data/sourceUi';
import type { LoadBatch } from '@/engine/types';

const STAGES: LoadStage[] = ['In lobby', 'Admitted', 'Rejected', 'Withdrawn', 'Superseded'];

interface Row {
  id: string;
  batch: LoadBatch;
  stage: LoadStage;
  sourceName: string;
  affiliateCode: string;
  asOfDate: string;
  fileName: string;
  rows: number;
  flagged: number;
  by: string;
  when: string;
}

export function LoadHistory() {
  const { user, hasPermission } = useAuth();
  const restricted = isRestrictedToOwnAffiliate(user, hasPermission);
  const { data: batches = [], isLoading } = useBatches();
  const { data: sources = [] } = useDataSources();
  const { data: lobby = [] } = useLobby();
  const { data: affiliates = [] } = useAffiliates();
  const [stage, setStage] = useState<'ALL' | LoadStage>('ALL');
  const [affiliate, setAffiliate] = useState('ALL');
  const [sourceId, setSourceId] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const affName = (code: string) =>
    code === 'GROUP' ? 'Group' : (affiliates.find((a) => a.code === code)?.name ?? code);

  const all: Row[] = useMemo(
    () =>
      batches
        .filter((b) => !restricted || b.affiliateCode === user!.affiliateCode)
        .map((b) => {
          const s = sourceForLoad(b, sources);
          return {
            id: b.id,
            batch: b,
            stage: loadStage(b),
            sourceName: s?.name ?? SOURCE_DOMAIN_LABEL[b.domain],
            affiliateCode: b.affiliateCode,
            asOfDate: b.asOfDate,
            fileName: b.fileName,
            rows: b.rowsAccepted,
            flagged: b.rowsFlagged ?? 0,
            by: b.committedBy ?? b.rejectedBy ?? b.uploadedBy,
            when: b.withdrawnAt ?? b.committedAt ?? b.rejectedAt ?? b.uploadedAt,
          };
        })
        .sort((a, b) => b.when.localeCompare(a.when)),
    [batches, sources, restricted, user],
  );

  const filtered = all.filter(
    (r) =>
      (stage === 'ALL' || r.stage === stage) &&
      (affiliate === 'ALL' || r.affiliateCode === affiliate) &&
      (sourceId === 'ALL' || sourceForLoad(r.batch, sources)?.id === sourceId),
  );
  const controls = useTableControls(filtered, 20, ['fileName', 'sourceName', 'asOfDate', 'by']);
  const open = all.find((r) => r.id === openId) ?? null;
  const count = (s: LoadStage) => all.filter((r) => r.stage === s).length;

  return (
    <>
      <ModuleHeader
        title="Load history"
        description="Every file loaded through every source."
        about="Includes files rejected, withdrawn or replaced by a later file, and what each load's checks found."
        asOfDate={null}
        scope={restricted ? affName(user!.affiliateCode) : 'All affiliates'}
        metrics={[
          { label: 'Admitted', value: String(count('Admitted')), tone: 'success' },
          { label: 'In lobby', value: String(count('In lobby')), tone: count('In lobby') > 0 ? 'warning' : 'neutral' },
          { label: 'Rejected', value: String(count('Rejected')), tone: count('Rejected') > 0 ? 'danger' : 'neutral' },
          { label: 'Withdrawn or replaced', value: String(count('Withdrawn') + count('Superseded')) },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Stage"
          className={`${inputCls} w-auto`}
          value={stage}
          onChange={(e) => setStage(e.target.value as 'ALL' | LoadStage)}
        >
          <option value="ALL">Every stage</option>
          {STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label="Source"
          className={`${inputCls} w-auto`}
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="ALL">Every source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {restricted ? s.name : `${affName(s.affiliateCode)} · ${s.name}`}
            </option>
          ))}
        </select>
        {!restricted && (
          <select
            aria-label="Affiliate"
            className={`${inputCls} w-auto`}
            value={affiliate}
            onChange={(e) => setAffiliate(e.target.value)}
          >
            <option value="ALL">Every affiliate</option>
            {[...new Set(all.map((r) => r.affiliateCode))].map((c) => (
              <option key={c} value={c}>
                {affName(c)}
              </option>
            ))}
          </select>
        )}
      </div>

      {!isLoading && all.length === 0 ? (
        <EmptyState title="Nothing loaded yet" cta={{ label: 'Go to sources', href: '/data/operations' }}>
          Loads appear here as soon as a file is uploaded to a source.
        </EmptyState>
      ) : (
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <TableToolbar
            searchValue={controls.search}
            onSearchChange={controls.setSearch}
            exportData={() => controls.filtered.map(({ batch: _b, ...r }) => r)}
            exportFilename="load-history"
            density={controls.density}
            onDensityChange={controls.setDensity}
          />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-3 py-2 font-bold">Stage</th>
                  <th className="px-3 py-2 font-bold">Source</th>
                  {!restricted && <th className="px-3 py-2 font-bold">Affiliate</th>}
                  <th className="px-3 py-2 font-bold">File</th>
                  <th className="px-3 py-2 font-bold">As of</th>
                  <th className="px-3 py-2 text-right font-bold">Rows</th>
                  <th className="px-3 py-2 text-right font-bold">Flagged</th>
                  <th className="px-3 py-2 font-bold">By</th>
                  <th className="px-3 py-2 font-bold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50" data-tour="history-table">
                {controls.paged.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-navy-50/40" onClick={() => setOpenId(r.id)}>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.stage} tone={STAGE_TONE[r.stage]} />
                    </td>
                    <td className="px-3 py-2 text-navy-900">{r.sourceName}</td>
                    {!restricted && <td className="px-3 py-2 text-gray-600">{affName(r.affiliateCode)}</td>}
                    <td className="max-w-[16rem] truncate px-3 py-2 text-gray-600">{r.fileName}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{formatDate(r.asOfDate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.rows.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.flagged > 0 ? (
                        <span className="text-warning">{r.flagged}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.by}</td>
                    <td className="px-3 py-2 text-[12px] text-gray-500">{new Date(r.when).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={controls.page}
            totalItems={controls.totalItems}
            pageSize={controls.pageSize}
            onPageChange={controls.setPage}
          />
        </section>
      )}

      {open && (
        <Drawer
          title={open.fileName}
          description={`${open.sourceName} · ${affName(open.affiliateCode)}`}
          onClose={() => setOpenId(null)}
          wide
        >
          <div className="space-y-5">
            <KeyValueGrid
              items={[
                { label: 'Stage', value: <StatusBadge status={open.stage} tone={STAGE_TONE[open.stage]} /> },
                { label: 'Data as of', value: formatDate(open.asOfDate) },
                { label: 'Rows loaded', value: open.rows.toLocaleString() },
                { label: 'Rows not loaded', value: open.batch.rowsRejected.toLocaleString() },
                { label: 'Flagged rows', value: open.flagged.toLocaleString() },
                { label: 'Version', value: `v${open.batch.version}` },
                {
                  label: 'Uploaded',
                  value: `${open.batch.uploadedBy}, ${new Date(open.batch.uploadedAt).toLocaleString()}`,
                },
                {
                  label: 'Admitted',
                  value: open.batch.committedAt
                    ? `${open.batch.committedBy}, ${new Date(open.batch.committedAt).toLocaleString()}`
                    : '-',
                },
                ...(open.batch.reconciledAt
                  ? [
                      {
                        label: 'Ledger check signed off',
                        value: `${open.batch.reconciledBy}, ${new Date(open.batch.reconciledAt).toLocaleString()}`,
                      },
                    ]
                  : []),
              ]}
            />
            {open.batch.rejectedReason && (
              <Notice tone="danger">
                Rejected by {open.batch.rejectedBy}: {open.batch.rejectedReason}
              </Notice>
            )}
            {open.batch.withdrawnReason && (
              <Notice tone="warning">
                Withdrawn by {open.batch.withdrawnBy}: {open.batch.withdrawnReason}
              </Notice>
            )}
            {open.stage === 'Superseded' && open.batch.supersededReason && !open.batch.withdrawnAt && (
              <Notice tone="info">Replaced by a later file: {open.batch.supersededReason}</Notice>
            )}
            <Section title="What the checks found">
              {(() => {
                const issues = open.batch.checkIssues ?? lobby.find((s) => s.id === open.id)?.check?.issues ?? [];
                return issues.length === 0 ? (
                  <p className="text-[13px] text-gray-500">No problems recorded.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-gray-50 p-3 text-[12px]">
                    {issues.map((i, n) => (
                      <li key={n} className={i.blocking ? 'text-danger' : 'text-gray-600'}>
                        {i.line ? <span className="font-mono">line {i.line} · </span> : null}
                        {i.field && <span className="font-bold">{i.field}</span>} {i.message}
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Section>
            <div className="flex flex-wrap gap-3 text-[13px]">
              {open.batch.domain === 'Positions' && open.stage !== 'In lobby' && open.stage !== 'Rejected' && (
                <Link
                  href={`/data/operations/position-book?batchId=${encodeURIComponent(open.id)}`}
                  className="font-bold text-navy-700 hover:underline"
                >
                  View these positions →
                </Link>
              )}
              {sourceForLoad(open.batch, sources) && (
                <Link
                  href={`/data/operations?source=${sourceForLoad(open.batch, sources)!.id}&tab=${open.stage === 'In lobby' ? 'lobby' : 'loads'}`}
                  className="font-bold text-navy-700 hover:underline"
                >
                  Open the source →
                </Link>
              )}
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}
