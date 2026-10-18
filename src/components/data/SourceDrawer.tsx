// One data source, opened from the Sources list (?source=<id>&tab=<tab>): what it is and what depends
// on it, its lobby (files waiting to be admitted), its fields, and every load that came through it.
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { derivedSentence } from '@/lib/sourceIngest';
import { Drawer } from '@/components/ui/Drawer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { downloadBlob } from '@/components/ui/TableControls';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useBatches } from '@/lib/hooks';
import { useConnectors } from '@/lib/connectorHooks';
import { CONNECTOR_TYPE_LABEL, SOURCE_USED_BY, sourceKindLabel, sourceTemplateCsv } from '@/lib/dataSources';
import {
  loadStage,
  sourceForLoad,
  STAGE_TONE,
  useAdmitLoad,
  useCanConfigureSources,
  useDataSources,
  useLobby,
  useRejectLoad,
  useSaveDataSource,
  useWithdrawLoad,
} from '@/lib/sourceHooks';
import type { ReconciliationSummary } from '@/lib/sourceIngest';
import { checkFreshness, currentBatch, planSupersede, positionBookReadiness } from '@/engine/vintage';
import { formatDate } from '@/lib/format';
import type { StagedBatch } from '@/store/repository';
import type { DataSource, LoadBatch } from '@/engine/types';
import { btn, DrawerTabs, inputCls, KeyValueGrid, Notice, RecordsTable, Section } from './sourceUi';
import { FieldsEditor } from './FieldsEditor';
import { ColumnMapping } from './ColumnMapping';
import { LedgerCheckPanel } from './LedgerCheckPanel';
import { ReconciliationNotice } from './UploadDataModal';

export type SourceTab = 'overview' | 'lobby' | 'fields' | 'loads' | 'check';

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '-');

export function SourceDrawer({
  sourceId,
  tab,
  onTab,
  onClose,
  onUpload,
}: {
  sourceId: string;
  tab: SourceTab;
  onTab: (tab: SourceTab) => void;
  onClose: () => void;
  onUpload: (sourceId: string) => void;
}) {
  const { data: sources = [] } = useDataSources();
  const source = sources.find((s) => s.id === sourceId);
  const { data: affiliates = [] } = useAffiliates();
  const affiliate = affiliates.find((a) => a.code === source?.affiliateCode);
  const { data: lobbyAll = [] } = useLobby();
  const { data: batchesAll = [] } = useBatches();

  const lobby = useMemo(
    () =>
      source
        ? lobbyAll.filter((s) => sourceForLoad({ ...s, contributor: s.batch.contributor }, sources)?.id === source.id)
        : [],
    [lobbyAll, source, sources],
  );
  const loads = useMemo(
    () =>
      source
        ? batchesAll
            .filter((b) => b.status !== 'Staged' && sourceForLoad(b, sources)?.id === source.id)
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        : [],
    [batchesAll, source, sources],
  );

  if (!source) {
    return (
      <Drawer title="Data source" onClose={onClose}>
        <Notice tone="info">This source doesn&rsquo;t exist or isn&rsquo;t one you can see.</Notice>
      </Drawer>
    );
  }

  const isGl = source.domain === 'GeneralLedger' && !!affiliate;
  const tabs: Array<{ key: SourceTab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    ...(isGl ? [{ key: 'check' as SourceTab, label: 'Ledger check' }] : []),
    { key: 'lobby', label: 'Lobby', count: lobby.length },
    { key: 'fields', label: 'Column mapping' },
    { key: 'loads', label: 'Loads', count: loads.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <Drawer
      title={source.name}
      description={`${source.affiliateCode === 'GROUP' ? 'Group' : (affiliate?.name ?? source.affiliateCode)} · ${sourceKindLabel(source)}`}
      onClose={onClose}
      wide
    >
      <SourceHeader source={source} onUpload={() => onUpload(source.id)} />
      <DrawerTabs tabs={tabs} active={active} onChange={onTab} />
      {active === 'overview' && (
        <OverviewTab source={source} loads={loads} batches={batchesAll} lobbyCount={lobby.length} />
      )}
      {active === 'check' && affiliate && <LedgerCheckPanel affiliate={affiliate} />}
      {active === 'lobby' && <LobbyTab source={source} lobby={lobby} batches={batchesAll} />}
      {active === 'fields' && <FieldsTab source={source} />}
      {active === 'loads' && <LoadsTab source={source} loads={loads} />}
    </Drawer>
  );
}

function SourceHeader({ source, onUpload }: { source: DataSource; onUpload: () => void }) {
  const { hasPermission } = useAuth();
  const canConfigure = useCanConfigureSources();
  const save = useSaveDataSource();
  const { user } = useAuth();
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
        <StatusBadge status={source.isActive ? 'Active' : 'Inactive'} tone={source.isActive ? 'success' : 'neutral'} />
        <span>
          Arrives by {CONNECTOR_TYPE_LABEL[source.connectorType]} · {source.frequency} · {source.owner}
        </span>
      </div>
      <div className="flex gap-2">
        {(source.domain === 'BalanceHistory' || source.domain === 'AccountHistory') && (
          <Link href="/data/history" className={btn.small}>
            Coverage for models
          </Link>
        )}
        {canConfigure && (
          <button
            type="button"
            className={btn.small}
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                ...source,
                isActive: !source.isActive,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.name ?? 'unknown',
              })
            }
          >
            {source.isActive ? 'Turn off' : 'Turn on'}
          </button>
        )}
        {(hasPermission('data.upload') || hasPermission('data.configure')) && source.isActive && (
          <button type="button" className={btn.smallPrimary} onClick={onUpload}>
            Upload to this source
          </button>
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  source,
  loads,
  batches,
  lobbyCount,
}: {
  source: DataSource;
  loads: LoadBatch[];
  batches: LoadBatch[];
  lobbyCount: number;
}) {
  const { data: connectors = [] } = useConnectors();
  const { data: affiliates = [] } = useAffiliates();
  const affiliate = affiliates.find((a) => a.code === source.affiliateCode);
  const connector = source.connectorId ? connectors.find((c) => c.id === source.connectorId) : null;
  const admitted = loads.filter((b) => b.status === 'Committed');
  const latestDate =
    admitted
      .map((b) => b.asOfDate)
      .sort()
      .at(-1) ?? null;

  const readiness = useMemo(() => {
    if (!latestDate || !affiliate) return null;
    if (source.domain === 'Positions') {
      const r = positionBookReadiness(affiliate, batches, latestDate);
      const ledger = currentBatch(batches, affiliate.code, 'GeneralLedger', latestDate);
      const signedOff = r.legacyBatch
        ? !!r.legacyBatch.reconciledAt
        : r.contributors.filter((c) => c.batch).every((c) => !!c.batch!.reconciledAt);
      return (
        <ul className="space-y-1 text-[13px]">
          {r.legacyBatch && (
            <li className="flex items-center gap-2">
              <StatusBadge status="In" tone="success" />
              Positions
            </li>
          )}
          {!r.legacyBatch &&
            r.contributors.map((c) => (
              <li key={c.contributor} className="flex items-center gap-2">
                <StatusBadge status={c.submitted ? 'In' : 'Waiting'} tone={c.submitted ? 'success' : 'warning'} />
                {c.contributor} positions
              </li>
            ))}
          <li className="flex items-center gap-2">
            <StatusBadge status={ledger ? 'In' : 'Waiting'} tone={ledger ? 'success' : 'warning'} />
            General ledger
          </li>
          <li className="flex items-center gap-2">
            <StatusBadge
              status={signedOff && r.isComplete ? 'Signed off' : 'Not signed off'}
              tone={signedOff && r.isComplete ? 'success' : 'neutral'}
            />
            Ledger check
          </li>
        </ul>
      );
    }
    if (
      source.affiliateCode !== 'GROUP' &&
      source.domain !== 'BalanceHistory' &&
      source.domain !== 'AccountHistory' &&
      source.domain !== 'MarketData'
    ) {
      const f = checkFreshness(affiliate, source.domain, batches, new Date().toISOString().slice(0, 10));
      return (
        <p className="text-[13px] text-navy-900">
          <StatusBadge
            status={f.status}
            tone={f.status === 'Fresh' ? 'success' : f.status === 'Due' ? 'warning' : 'danger'}
          />{' '}
          Last admitted {f.lastLoadedAt ? `${f.ageDays} day(s) ago` : 'never'} against a {f.slaDays}-day expectation.
        </p>
      );
    }
    return null;
  }, [latestDate, affiliate, source, batches]);

  return (
    <div className="space-y-6">
      <Section title="Configuration">
        <KeyValueGrid
          items={[
            { label: 'Data', value: sourceKindLabel(source) },
            {
              label: 'Belongs to',
              value:
                source.affiliateCode === 'GROUP' ? 'Group (all affiliates)' : (affiliate?.name ?? source.affiliateCode),
            },
            ...(source.contributor ? [{ label: 'Department', value: source.contributor }] : []),
            {
              label: 'Arrives by',
              value: `${CONNECTOR_TYPE_LABEL[source.connectorType]}${connector ? ` - ${connector.name}` : ''}`,
            },
            { label: 'Owner', value: source.owner || '-' },
            { label: 'Expected', value: `${source.frequency}${source.schedule ? `, ${source.schedule}` : ''}` },
            {
              label: 'As-of date',
              value: source.businessDateField
                ? `Read from the ${source.businessDateField} column`
                : 'Chosen when uploading',
            },
            {
              label: 'Clean files',
              value: source.autoAdmit ? 'Admitted straight away' : 'Wait in the lobby for someone to admit',
            },
          ]}
        />
      </Section>

      <Section title="Used by">
        <ul className="flex flex-wrap gap-1.5">
          {SOURCE_USED_BY[source.domain].map((u) => (
            <li key={u} className="rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-bold text-navy-700">
              {u}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={latestDate ? `Ready for ${formatDate(latestDate)}?` : 'Ready?'}>
        {latestDate ? (
          (readiness ?? (
            <p className="text-[13px] text-navy-900">Latest admitted data is as of {formatDate(latestDate)}.</p>
          ))
        ) : (
          <p className="text-[13px] text-gray-500">Nothing admitted through this source yet.</p>
        )}
        {lobbyCount > 0 && (
          <Notice tone="warning">
            {lobbyCount} file{lobbyCount === 1 ? ' is' : 's are'} waiting in the lobby.
          </Notice>
        )}
      </Section>

      <Section title="Last loads">
        {loads.length === 0 ? (
          <p className="text-[13px] text-gray-500">No loads yet.</p>
        ) : (
          <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
            {loads.slice(0, 5).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-navy-900">{b.fileName}</span>
                <span className="flex items-center gap-2 text-[12px] text-gray-500">
                  as of {formatDate(b.asOfDate)} · {b.rowsAccepted.toLocaleString()} rows
                  <StatusBadge status={loadStage(b)} tone={STAGE_TONE[loadStage(b)]} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function LobbyTab({ source, lobby, batches }: { source: DataSource; lobby: StagedBatch[]; batches: LoadBatch[] }) {
  const { hasPermission } = useAuth();
  const canAct = hasPermission('data.upload') || hasPermission('data.configure');
  const admit = useAdmitLoad();
  const reject = useRejectLoad();
  const [open, setOpen] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<
    Record<string, { tone: 'success' | 'danger'; text: string; rec?: ReconciliationSummary | null }>
  >({});
  const { data: affiliates = [] } = useAffiliates();
  const currency = affiliates.find((a) => a.code === source.affiliateCode)?.functionalCurrency ?? 'USD';

  const replaces = (s: StagedBatch) =>
    source.domain === 'Positions' || source.domain === 'GeneralLedger'
      ? planSupersede(batches, source.affiliateCode, source.domain, s.asOfDate, source.contributor).superseded
      : null;
  const hardBlocking = (s: StagedBatch) => (s.check?.issues ?? []).filter((i) => i.blocking).length;
  const admittable = lobby.filter((s) => hardBlocking(s) === 0 && !replaces(s));

  const doAdmit = async (s: StagedBatch) => {
    try {
      const out = await admit.mutateAsync({
        source,
        batch: s.batch,
        positions: s.positions,
        records: s.rows ?? [],
        reason: reasons[s.id] ?? null,
        stagedId: s.id,
      });
      setMessages((m) => ({
        ...m,
        [s.id]: {
          tone: 'success',
          text: [`${s.batch.fileName} admitted.`, derivedSentence(out.derived)].filter(Boolean).join(' '),
          rec: out.reconciliation,
        },
      }));
    } catch (err) {
      setMessages((m) => ({
        ...m,
        [s.id]: { tone: 'danger', text: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  const admitted = Object.entries(messages).filter(([id]) => !lobby.some((s) => s.id === id));

  return (
    <div className="space-y-3">
      {admitted.map(([id, m]) => (
        <div key={id} className="space-y-2">
          <Notice tone={m.tone}>{m.text}</Notice>
          {m.rec && <ReconciliationNotice summary={m.rec} currency={currency} />}
        </div>
      ))}
      {lobby.length === 0 ? (
        <Notice tone="info">
          Nothing waiting. Files sent to the lobby appear here until someone admits or rejects them.
        </Notice>
      ) : (
        <>
          {canAct && lobby.length > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                className={btn.smallPrimary}
                disabled={admittable.length === 0 || admit.isPending}
                onClick={async () => {
                  for (const s of admittable) await doAdmit(s);
                }}
              >
                Admit all ready ({admittable.length})
              </button>
            </div>
          )}
          {lobby.map((s) => {
            const check = s.check;
            const blocking = hardBlocking(s);
            const old = replaces(s);
            const msg = messages[s.id];
            return (
              <article key={s.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-navy-900">{s.batch.fileName}</p>
                    <p className="text-[12px] text-gray-500">
                      As of {formatDate(s.asOfDate)} · {(check?.rows ?? s.batch.rowCount).toLocaleString()} rows ·{' '}
                      <span className="text-success">
                        {(check?.valid ?? s.batch.rowsAccepted).toLocaleString()} valid
                      </span>
                      {(check?.flagged ?? 0) > 0 && <span className="text-warning"> · {check!.flagged} flagged</span>}
                      {blocking > 0 && <span className="text-danger"> · {blocking} blocking</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Uploaded by {s.batch.uploadedBy} · {when(s.batch.uploadedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={btn.small} onClick={() => setOpen(open === s.id ? null : s.id)}>
                      {open === s.id ? 'Hide rows' : 'View rows'}
                    </button>
                    {canAct && (
                      <>
                        <button
                          type="button"
                          className={btn.smallDanger}
                          onClick={() => {
                            setRejecting(s.id);
                            setRejectReason('');
                          }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className={btn.smallPrimary}
                          disabled={blocking > 0 || admit.isPending || (!!old && !(reasons[s.id] ?? '').trim())}
                          title={
                            blocking > 0
                              ? 'Fix the blocking problems and upload a corrected file'
                              : old && !(reasons[s.id] ?? '').trim()
                                ? 'Give a reason for the reload'
                                : undefined
                          }
                          onClick={() => void doAdmit(s)}
                        >
                          Admit
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {old && canAct && (
                  <div className="mt-2 rounded-lg bg-warning-bg px-3 py-2">
                    <label className="mb-1 block text-[12px] font-bold text-warning" htmlFor={`lr-${s.id}`}>
                      Data is already admitted for {formatDate(s.asOfDate)} ({old.fileName}). Admitting replaces it -
                      why?
                    </label>
                    <input
                      id={`lr-${s.id}`}
                      className={inputCls}
                      value={reasons[s.id] ?? ''}
                      onChange={(e) => setReasons((r) => ({ ...r, [s.id]: e.target.value }))}
                    />
                  </div>
                )}
                {rejecting === s.id && (
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-danger-bg px-3 py-2">
                    <label className="flex-1 text-[12px] font-bold text-danger" htmlFor={`rj-${s.id}`}>
                      Why is it rejected?
                      <input
                        id={`rj-${s.id}`}
                        className={`${inputCls} mt-1`}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className={btn.smallDanger}
                      disabled={!rejectReason.trim() || reject.isPending}
                      onClick={async () => {
                        await reject.mutateAsync({ staged: s, reason: rejectReason.trim() });
                        setRejecting(null);
                      }}
                    >
                      Reject file
                    </button>
                    <button type="button" className={btn.small} onClick={() => setRejecting(null)}>
                      Cancel
                    </button>
                  </div>
                )}
                {msg && (
                  <div className="mt-2">
                    <Notice tone={msg.tone}>{msg.text}</Notice>
                  </div>
                )}
                {open === s.id && (
                  <div className="mt-3 space-y-2">
                    {check && check.issues.length > 0 && (
                      <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg bg-gray-50 p-2 text-[12px]">
                        {check.issues.map((i, n) => (
                          <li key={n} className={i.blocking ? 'text-danger' : 'text-gray-600'}>
                            {i.line ? <span className="font-mono">line {i.line} · </span> : null}
                            {i.field && <span className="font-bold">{i.field}</span>} {i.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    <RecordsTable
                      rows={(s.positions.length > 0 ? s.positions : (s.rows ?? [])) as Array<Record<string, unknown>>}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </>
      )}
    </div>
  );
}

function FieldsTab({ source }: { source: DataSource }) {
  const { hasPermission } = useAuth();
  const save = useSaveDataSource();
  const { user } = useAuth();
  const [advanced, setAdvanced] = useState(false);
  // The standard fields are fixed per kind of data; only the Organisation Admin may change the field list itself.
  if (advanced) {
    return (
      <FieldsEditor
        initial={source.fields}
        initialBusinessDateField={source.businessDateField}
        saving={save.isPending}
        onCancel={() => setAdvanced(false)}
        onSave={(fields, businessDateField) =>
          save.mutate(
            {
              ...source,
              fields,
              businessDateField,
              updatedAt: new Date().toISOString(),
              updatedBy: user?.name ?? 'unknown',
            },
            { onSuccess: () => setAdvanced(false) },
          )
        }
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-gray-500">
          The fields the platform reads from this source, and which column of your file feeds each one.
        </p>
        <button
          type="button"
          className={btn.small}
          onClick={() =>
            downloadBlob(
              sourceTemplateCsv(source),
              `${source.name.replace(/\W+/g, '_').toLowerCase()}_template.csv`,
              'text/csv',
            )
          }
        >
          Download blank template
        </button>
      </div>
      <ColumnMapping source={source} />
      {hasPermission('group.manage') && (
        <button type="button" className={btn.link} onClick={() => setAdvanced(true)}>
          Advanced: edit the field list
        </button>
      )}
    </div>
  );
}

function LoadsTab({ source, loads }: { source: DataSource; loads: LoadBatch[] }) {
  const { hasPermission } = useAuth();
  const withdraw = useWithdrawLoad();
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (loads.length === 0) return <Notice tone="info">No loads yet.</Notice>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-2 py-1.5 font-bold">File</th>
            <th className="px-2 py-1.5 font-bold">As of</th>
            <th className="px-2 py-1.5 font-bold">Stage</th>
            <th className="px-2 py-1.5 text-right font-bold">Rows</th>
            <th className="px-2 py-1.5 font-bold">By</th>
            <th className="px-2 py-1.5 font-bold">When</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loads.map((b) => {
            const stage = loadStage(b);
            return (
              <tr key={b.id} className="align-top">
                <td className="px-2 py-1.5 text-navy-900">
                  {b.fileName}
                  {b.version > 1 && <span className="ml-1 text-gray-400">v{b.version}</span>}
                  {withdrawing === b.id && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <input
                        className={inputCls}
                        placeholder="Why withdraw it?"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-label="Reason to withdraw"
                      />
                      <button
                        type="button"
                        className={btn.smallDanger}
                        disabled={!reason.trim() || withdraw.isPending}
                        onClick={async () => {
                          await withdraw.mutateAsync({ batch: b, reason: reason.trim() });
                          setWithdrawing(null);
                        }}
                      >
                        Withdraw
                      </button>
                      <button type="button" className={btn.small} onClick={() => setWithdrawing(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono">{b.asOfDate}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={stage} tone={STAGE_TONE[stage]} />
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{b.rowsAccepted.toLocaleString()}</td>
                <td className="px-2 py-1.5">{b.committedBy ?? b.uploadedBy}</td>
                <td className="px-2 py-1.5 text-gray-500">{when(b.committedAt ?? b.rejectedAt ?? b.uploadedAt)}</td>
                <td className="px-2 py-1.5 text-right">
                  <span className="inline-flex gap-1.5">
                    {source.domain === 'Positions' && stage === 'Admitted' && (
                      <Link
                        href={`/data/operations/position-book?batchId=${encodeURIComponent(b.id)}`}
                        className={btn.link}
                      >
                        Positions
                      </Link>
                    )}
                    {stage === 'Admitted' &&
                      (hasPermission('data.upload') || hasPermission('data.configure')) &&
                      withdrawing !== b.id && (
                        <button
                          type="button"
                          className={btn.link}
                          onClick={() => {
                            setWithdrawing(b.id);
                            setReason('');
                          }}
                        >
                          Withdraw
                        </button>
                      )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
