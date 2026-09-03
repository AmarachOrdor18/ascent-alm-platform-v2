import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { ConnectorFields } from '@/components/connectors/ConnectorFields';
import { DOMAINS, DOMAIN_LABEL, STATUS_LABEL, STATUS_TONE } from '@/components/connectors/connectorConstants';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import {
  availableFor,
  newConnector,
  useConnectors,
  useDeleteConnector,
  useSaveConnector,
  validateConnector,
} from '@/lib/connectorHooks';
import type { Connector, ConnectorStatus } from '@/engine/types';

// Needs-attention statuses sort first, so a screen full of connectors leads with what's actually
// broken rather than making a reader scan past everything healthy to find it.
const STATUS_RANK: Record<ConnectorStatus, number> = { Blocked: 0, Planned: 1, Retired: 2, Available: 3 };

const ACCENT: Record<ConnectorStatus, string> = {
  Available: 'border-l-success',
  Blocked: 'border-l-danger',
  Planned: 'border-l-warning',
  Retired: 'border-l-gray-300',
};

export function Connectors({ embedded = false }: { embedded?: boolean } = {}) {
  const { hasPermission } = useAuth();
  const { data: connectors = [] } = useConnectors();
  const { data: affiliates = [] } = useAffiliates();
  const saveConnector = useSaveConnector();
  const removeConnector = useDeleteConnector();
  const canEdit = hasPermission('data.configure');

  const [editing, setEditing] = useState<Connector | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, 'ok' | 'failed'>>({});
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Which affiliates have wired a feed to this connector - the catalogue shows the inventory,
  // but a reader always wants to know what actually depends on each connection before editing it.
  const usedBy = (id: string) =>
    affiliates
      .filter((a) => a.code !== 'GROUP' && a.feeds.some((f) => f.connectorId === id))
      .map((a) => a.code);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filteredConnectors = (
    search.trim()
      ? connectors.filter((c) => {
          const q = search.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            c.vendor.toLowerCase().includes(q) ||
            c.protocol.toLowerCase().includes(q) ||
            c.domains.some((d) => DOMAIN_LABEL[d].toLowerCase().includes(q))
          );
        })
      : connectors
  )
    .slice()
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name));

  // Simulated reachability check - no real socket is opened.
  const testConnection = (c: Connector) => {
    setTesting(c.id);
    window.setTimeout(() => {
      setResults((prev) => ({ ...prev, [c.id]: c.status === 'Available' ? 'ok' : 'failed' }));
      setTesting(null);
    }, 600);
  };

  const handleDelete = (c: Connector) => {
    if (!window.confirm(`Remove ${c.name}? Any affiliate feed still mapped to it will need reassigning.`)) return;
    void removeConnector.mutateAsync(c.id);
  };

  const blocked = connectors.filter((c) => c.status === 'Blocked');
  const coveredDomains = DOMAINS.filter((d) => availableFor(connectors, d).length > 0);

  return (
    <>
      {!embedded && (
      <ModuleHeader
        title="Connectors & Data Sources"
        description="The registered catalogue of data-source systems available platform-wide. To map a domain to one for a specific affiliate, use that affiliate's own Feeds & Connectors settings."
        asOfDate={null}
        scope="Group"
        metrics={[
          {
            label: 'Connectors',
            value: String(connectors.length),
            about: 'Data sources registered platform-wide, regardless of status.',
          },
          {
            label: 'Available',
            value: String(connectors.filter((c) => c.status === 'Available').length),
            tone: 'success',
            about: 'Connectors currently reachable and cleared for use.',
          },
          {
            label: 'Blocked',
            value: String(blocked.length),
            tone: blocked.length > 0 ? 'danger' : 'success',
            about: 'Connectors currently Blocked - not reachable or not yet cleared for use - see each one’s reason.',
          },
          {
            label: 'Domains covered',
            value: `${coveredDomains.length} of ${DOMAINS.length}`,
            tone: coveredDomains.length === DOMAINS.length ? 'success' : 'warning',
            about:
              'Data domains with at least one Available connector able to feed them. A domain not covered here has to run as a file feed at every affiliate.',
          },
        ]}
        actions={
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditing(newConnector())}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Add data source
          </button>
        }
      />
      )}
      {embedded && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditing(newConnector())}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Add data source
          </button>
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm" hidden={embedded}>
        <div className="mb-3 flex items-center gap-1.5">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Domain coverage</h2>
          <InfoButton label="What this shows">
            Whether each data domain has at least one connector registered, Active and Available to feed it -
            independent of whether any particular affiliate has actually mapped a domain to one yet.
          </InfoButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {DOMAINS.map((d) => {
            const covered = availableFor(connectors, d).length > 0;
            return (
              <span
                key={d}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${
                  covered ? 'border-success/30 bg-success-bg text-success' : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${covered ? 'bg-success' : 'bg-gray-300'}`}
                  aria-hidden="true"
                />
                {DOMAIN_LABEL[d]}
              </span>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Data sources ({filteredConnectors.length}
            {filteredConnectors.length !== connectors.length ? ` of ${connectors.length}` : ''})
          </h2>
          {connectors.length > 5 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, vendor, protocol or domain…"
              className="w-64 max-w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
            />
          )}
        </div>

        <div className="space-y-2">
          {filteredConnectors.map((c) => (
            <article
              key={c.id}
              className={`rounded-lg border border-gray-100 border-l-4 p-3 ${ACCENT[c.status]} ${!c.isActive ? 'opacity-60' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-navy-900">{c.name}</span>
                    <StatusBadge status={STATUS_LABEL[c.status]} tone={STATUS_TONE[c.status]} />
                    {!c.isActive && <StatusBadge status="Inactive" tone="neutral" />}
                    {c.status !== 'Available' && c.statusReason && (
                      <InfoButton label={`Why ${c.name} is ${STATUS_LABEL[c.status].toLowerCase()}`}>
                        {c.statusReason}
                      </InfoButton>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500">
                    {c.vendor}
                    <span aria-hidden="true">·</span>
                    <span className="rounded border border-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                      {c.protocol}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.domains.length === 0 ? (
                      <span className="text-[10px] text-gray-400">No domains assigned</span>
                    ) : (
                      c.domains.map((d) => (
                        <span
                          key={d}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600"
                        >
                          {DOMAIN_LABEL[d]}
                        </span>
                      ))
                    )}
                  </div>
                  {c.notes && <p className="mt-2 max-w-md text-[11px] leading-relaxed text-gray-500">{c.notes}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(c.id)}
                    aria-expanded={expanded.has(c.id)}
                    className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                  >
                    {expanded.has(c.id) ? 'Hide details' : 'View details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => testConnection(c)}
                    disabled={testing === c.id}
                    className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                  >
                    {testing === c.id ? 'Testing…' : 'Test'}
                  </button>
                  {results[c.id] && (
                    <StatusBadge
                      status={results[c.id] === 'ok' ? 'Reachable' : 'Unreachable'}
                      tone={results[c.id] === 'ok' ? 'success' : 'danger'}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(c)}
                    disabled={!canEdit}
                    className="rounded bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    Configure
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    disabled={!canEdit}
                    aria-label={`Delete ${c.name}`}
                    title="Delete"
                    className="rounded p-1.5 text-gray-300 hover:bg-danger-bg hover:text-danger disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {expanded.has(c.id) && (
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 pt-3 text-[11px] md:grid-cols-4">
                  <div>
                    <dt className="text-gray-400">Endpoint</dt>
                    <dd className="truncate font-mono text-navy-900" title={c.endpoint}>
                      {c.endpoint || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Authentication</dt>
                    <dd className="text-navy-900">{c.authMode}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Credential reference</dt>
                    <dd className="font-mono text-navy-900">{c.credentialRef || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400">Refresh cadence</dt>
                    <dd className="text-navy-900">
                      {c.cadenceDays ? `Every ${c.cadenceDays} day(s)` : '-'}
                      {c.scheduleWindow ? ` · ${c.scheduleWindow}` : ''}
                    </dd>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <dt className="text-gray-400">Used by</dt>
                    <dd className="text-navy-900">
                      {(() => {
                        const codes = usedBy(c.id);
                        return codes.length > 0
                          ? `${codes.length} affiliate feed(s): ${codes.join(', ')} - configured per affiliate under that affiliate's Settings → Data Sources.`
                          : 'No affiliate maps a feed to this connection yet - assign it under an affiliate Settings → Data Sources.';
                      })()}
                    </dd>
                  </div>
                </dl>
              )}
            </article>
          ))}

          {filteredConnectors.length === 0 && (
            <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
              {connectors.length === 0
                ? 'No data sources yet. Add one, or run every domain as a declared file feed.'
                : 'No data sources match your search.'}
            </p>
          )}
        </div>
      </section>

      {editing && (
        <ConnectorEditor
          connector={editing}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            await saveConnector.mutateAsync(next);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ConnectorEditor({
  connector,
  onCancel,
  onSave,
}: {
  connector: Connector;
  onCancel: () => void;
  onSave: (c: Connector) => Promise<void>;
}) {
  const [draft, setDraft] = useState(connector);
  const problems = validateConnector(draft);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-900/40">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-[14px] font-bold text-navy-900">Add data source</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-navy-900"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <ConnectorFields connector={draft} onChange={setDraft} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
          {problems.length > 0 && <span className="text-[11px] text-danger">{problems[0]}</span>}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => void onSave(draft)}
            title={problems[0]}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
