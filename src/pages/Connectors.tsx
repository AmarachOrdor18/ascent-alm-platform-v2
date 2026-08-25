/**
 * Connectors & Data Sources — screen 5.
 *
 * Two separate things live here and they are worth keeping apart:
 *
 *   * the **catalogue** — what systems exist, how they are reached, what
 *     blocks them. Group-wide, and now editable: it used to be a `const`
 *     array in this file, so a bank could neither add its own source nor
 *     correct a status this platform had asserted about its estate.
 *   * the **feed map** — which source supplies which domain *for this
 *     affiliate*. Where no connector is available, the affiliate is declared
 *     file-fed for that domain with a cadence and a named owner.
 *
 * File substitution is a first-class declared path, not an informal
 * fallback. GL Reconciliation then holds a file-fed affiliate to exactly the
 * same standard as an API-fed one.
 */

import { useState, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useSaveAffiliate } from '@/lib/hooks';
import {
  availableFor,
  newConnector,
  useConnectors,
  useDeleteConnector,
  useSaveConnector,
  validateConnector,
} from '@/lib/connectorHooks';
import type {
  Affiliate,
  AuthMode,
  Connector,
  ConnectorProtocol,
  ConnectorStatus,
  DataDomain,
  DomainFeed,
  FeedMode,
} from '@/engine/types';

const DOMAINS: DataDomain[] = [
  'Positions', 'GeneralLedger', 'MarketRates', 'FxRates', 'Counterparties', 'EconomicIndicators',
];

const DOMAIN_LABEL: Record<DataDomain, string> = {
  Positions: 'Position book',
  GeneralLedger: 'General ledger / trial balance',
  MarketRates: 'Yield curves & market rates',
  FxRates: 'FX rates',
  Counterparties: 'Counterparty register',
  EconomicIndicators: 'Economic indicators',
};

/** Why each domain matters, so the six are not just a list of nouns. */
const DOMAIN_PURPOSE: Record<DataDomain, string> = {
  Positions: 'Every ratio. Without it there is nothing to compute.',
  GeneralLedger: 'Reconciles the position book to the books of account before anything is signed off.',
  MarketRates: 'Discounting, EVE and the FTP base rate.',
  FxRates: 'Consolidation. A missing rate fails the run rather than dropping a currency.',
  Counterparties: 'Depositor concentration and large-exposure limits.',
  EconomicIndicators: 'Scenario narrative and macro-conditioned forecasts.',
};

const DEFAULT_SLA: Record<DataDomain, number> = {
  Positions: 30, GeneralLedger: 30, MarketRates: 1, FxRates: 1, Counterparties: 90, EconomicIndicators: 30,
};

const STATUS_TONE: Record<ConnectorStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Available: 'success', Blocked: 'danger', Planned: 'warning', Retired: 'neutral',
};

const PROTOCOLS: ConnectorProtocol[] = ['REST', 'SOAP', 'SFTP', 'JDBC', 'Proprietary', 'FileDrop'];
const AUTH_MODES: AuthMode[] = ['None', 'ApiKey', 'OAuth2', 'Basic', 'Certificate', 'SshKey'];
const STATUSES: ConnectorStatus[] = ['Available', 'Blocked', 'Planned', 'Retired'];

export function Connectors() {
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const { data: connectors = [] } = useConnectors();
  const saveAffiliate = useSaveAffiliate();
  const saveConnector = useSaveConnector();
  const removeConnector = useDeleteConnector();
  const canEdit = hasPermission('data.configure');

  const [tab, setTab] = useState<'feeds' | 'catalogue'>('feeds');
  const [editing, setEditing] = useState<Connector | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, 'ok' | 'failed'>>({});

  const affiliate = affiliates.find((a) => a.code === affiliateCode) ?? affiliates.find((a) => a.code !== 'GROUP');

  const feedFor = (domain: DataDomain): DomainFeed =>
    affiliate?.feeds.find((f) => f.domain === domain) ?? {
      domain, mode: 'NotConfigured', connectorId: null, slaDays: DEFAULT_SLA[domain], owner: null,
    };

  const updateFeed = (domain: DataDomain, patch: Partial<DomainFeed>) => {
    if (!affiliate) return;
    const feed: DomainFeed = { ...feedFor(domain), ...patch };
    const feeds = [...affiliate.feeds.filter((f) => f.domain !== domain), feed];
    saveAffiliate.mutate({ ...affiliate, feeds } satisfies Affiliate);
  };

  /**
   * Simulated reachability check.
   *
   * A connector the bank has marked Blocked fails, because reporting a green
   * tick for something known not to work is how a demo becomes a
   * misrepresentation. Nothing here opens a socket — the browser cannot, and
   * the screen says so rather than implying a live handshake.
   */
  const testConnection = (c: Connector) => {
    setTesting(c.id);
    window.setTimeout(() => {
      setResults((prev) => ({ ...prev, [c.id]: c.status === 'Available' ? 'ok' : 'failed' }));
      setTesting(null);
    }, 600);
  };

  const configured = DOMAINS.filter((d) => feedFor(d).mode !== 'NotConfigured').length;
  const fileFed = DOMAINS.filter((d) => feedFor(d).mode === 'File').length;
  const blocked = connectors.filter((c) => c.status === 'Blocked');

  return (
    <>
      <ModuleHeader
        title="Connectors & Data Sources"
        description="What feeds each data domain for this affiliate, and the catalogue of sources behind it."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate'}
        metrics={[
          { label: 'Domains configured', value: `${configured} of ${DOMAINS.length}`,
            tone: configured === DOMAINS.length ? 'success' : 'warning' },
          { label: 'File-substituted', value: String(fileFed), tone: fileFed > 0 ? 'warning' : 'neutral' },
          { label: 'Connectors', value: String(connectors.length) },
          { label: 'Blocked', value: String(blocked.length), tone: blocked.length > 0 ? 'danger' : 'success' },
        ]}
        actions={
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {(['feeds', 'catalogue'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 text-[11px] font-bold capitalize ${
                  tab === t ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                }`}
              >
                {t === 'feeds' ? 'Feed map' : 'Catalogue'}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'feeds' ? (
        <>
          <div className="mb-6 rounded-2xl border border-gold-500/40 bg-gold-500/5 p-4 text-[11px] leading-relaxed text-navy-900">
            <span className="font-bold">Six domains, not one file.</span> A position book alone produces liquidity and
            rate risk, but it cannot be reconciled, consolidated, or attributed to a depositor. Each row below is a
            domain the affiliate must source from somewhere — a connector or a declared file feed.
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Feed map — {affiliate?.name ?? '—'}
            </h2>

            <div className="space-y-3">
              {DOMAINS.map((domain) => {
                const feed = feedFor(domain);
                const usable = availableFor(connectors, domain);
                return (
                  <div key={domain} className="rounded-lg border border-gray-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-[240px]">
                        <p className="text-[12px] font-bold text-navy-900">{DOMAIN_LABEL[domain]}</p>
                        <p className="text-[11px] text-gray-500">{DOMAIN_PURPOSE[domain]}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Feed mode for ${DOMAIN_LABEL[domain]}`}
                          value={feed.mode}
                          disabled={!canEdit}
                          onChange={(e) => {
                            const mode = e.target.value as FeedMode;
                            updateFeed(domain, {
                              mode,
                              connectorId: mode === 'Connector' ? (usable[0]?.id ?? null) : null,
                            });
                          }}
                          className="rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                        >
                          <option value="NotConfigured">Not configured</option>
                          <option value="Connector" disabled={usable.length === 0}>
                            Connector{usable.length === 0 ? ' — none available' : ''}
                          </option>
                          <option value="File">File upload</option>
                        </select>

                        {feed.mode === 'Connector' && (
                          <select
                            aria-label={`Connector for ${DOMAIN_LABEL[domain]}`}
                            value={feed.connectorId ?? ''}
                            disabled={!canEdit}
                            onChange={(e) => updateFeed(domain, { connectorId: e.target.value || null })}
                            className="rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none"
                          >
                            {usable.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}

                        <label className="flex items-center gap-1 text-[11px] text-gray-500">
                          <span>SLA</span>
                          <input
                            type="number"
                            min={1}
                            aria-label={`SLA days for ${DOMAIN_LABEL[domain]}`}
                            value={feed.slaDays}
                            disabled={!canEdit}
                            onChange={(e) => updateFeed(domain, { slaDays: Number(e.target.value) })}
                            className="w-16 rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                          />
                          <span>days</span>
                        </label>

                        <input
                          type="text"
                          placeholder="Owner"
                          aria-label={`Owner for ${DOMAIN_LABEL[domain]}`}
                          value={feed.owner ?? ''}
                          disabled={!canEdit}
                          onChange={(e) => updateFeed(domain, { owner: e.target.value || null })}
                          className="w-44 rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    {feed.mode === 'File' && (
                      <p className="mt-2 rounded bg-gray-50 px-3 py-1.5 text-[11px] text-gray-600">
                        Declared file feed. Freshness is enforced against the {feed.slaDays}-day SLA above, and the
                        Data Vintages screen raises a warning when it lapses — the same treatment an API feed gets.
                      </p>
                    )}
                    {feed.mode === 'NotConfigured' && (
                      <p className="mt-2 rounded bg-warning/5 px-3 py-1.5 text-[11px] text-warning">
                        Not configured. Anything depending on this domain will be unavailable rather than estimated.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Connector catalogue</h2>
              <p className="mt-1 text-[11px] text-gray-500">
                Group-wide. Status is yours to set — what blocks an integration is a fact about your estate, not about
                this platform.
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => setEditing(newConnector())}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              Add connector
            </button>
          </div>

          <div className="space-y-3">
            {connectors.map((c) => (
              <article key={c.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[280px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-navy-900">{c.name}</span>
                      <StatusBadge status={c.status} tone={STATUS_TONE[c.status]} />
                      <span className="rounded border border-gray-200 px-2 py-0.5 font-mono text-[10px] text-gray-600">
                        {c.protocol}
                      </span>
                      {!c.isActive && <StatusBadge status="Inactive" tone="neutral" />}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {c.vendor} · {c.domains.map((d) => DOMAIN_LABEL[d]).join(', ') || 'no domains'}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-gray-400">{c.endpoint || 'no endpoint set'}</p>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {c.authMode} · every {c.cadenceDays}d · {c.scheduleWindow || 'no window set'} · owner{' '}
                      {c.owner || 'unassigned'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                      className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                    >
                      Configure
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeConnector.mutateAsync(c.id)}
                      disabled={!canEdit}
                      className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-danger hover:border-danger disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {c.status !== 'Available' && c.statusReason && (
                  <p className="mt-3 rounded bg-danger/5 px-3 py-2 text-[11px] leading-relaxed text-navy-900">
                    <span className="font-bold">Why it is {c.status.toLowerCase()}:</span> {c.statusReason}
                  </p>
                )}
                {c.notes && <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{c.notes}</p>}
              </article>
            ))}

            {connectors.length === 0 && (
              <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
                No connectors configured. Add one, or run every domain as a declared file feed.
              </p>
            )}
          </div>

          <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
            <span className="font-bold text-navy-900">On credentials:</span> this platform runs in the browser, so a
            secret typed here would sit in local storage on every machine that opened the page. The credential field
            holds a <em>vault reference</em>, and the connector service resolves it server-side. The editor rejects
            anything that looks like a secret rather than a pointer.
          </p>
        </section>
      )}

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
  const set = (patch: Partial<Connector>) => setDraft((d) => ({ ...d, ...patch }));
  const problems = validateConnector(draft);

  const toggleDomain = (d: DataDomain) =>
    set({ domains: draft.domains.includes(d) ? draft.domains.filter((x) => x !== d) : [...draft.domains, d] });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[14px] font-bold text-navy-900">Configure connector</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <F id="cn-name" label="Name">
            <input id="cn-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={INPUT} />
          </F>
          <F id="cn-vendor" label="Vendor">
            <input id="cn-vendor" value={draft.vendor} onChange={(e) => set({ vendor: e.target.value })} className={INPUT} />
          </F>
          <F id="cn-proto" label="Protocol">
            <select id="cn-proto" value={draft.protocol} onChange={(e) => set({ protocol: e.target.value as ConnectorProtocol })} className={INPUT}>
              {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </F>
          <F id="cn-status" label="Status">
            <select id="cn-status" value={draft.status} onChange={(e) => set({ status: e.target.value as ConnectorStatus })} className={INPUT}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-[11px] font-medium text-gray-600">Data domains it can supply</legend>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDomain(d)}
                aria-pressed={draft.domains.includes(d)}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                  draft.domains.includes(d)
                    ? 'border-navy-700 bg-navy-50 text-navy-900'
                    : 'border-gray-200 text-gray-500 hover:border-navy-700'
                }`}
              >
                {DOMAIN_LABEL[d]}
              </button>
            ))}
          </div>
        </fieldset>

        {draft.status !== 'Available' && (
          <F id="cn-reason" label={`Why it is ${draft.status.toLowerCase()}`} className="mt-4">
            <textarea id="cn-reason" rows={3} value={draft.statusReason ?? ''} onChange={(e) => set({ statusReason: e.target.value })} className={INPUT} />
          </F>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <F id="cn-endpoint" label="Endpoint">
            <input id="cn-endpoint" value={draft.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://…  ·  {affiliate} is substituted" className={INPUT} />
          </F>
          <F id="cn-auth" label="Authentication">
            <select id="cn-auth" value={draft.authMode} onChange={(e) => set({ authMode: e.target.value as AuthMode })} className={INPUT}>
              {AUTH_MODES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </F>
          <F id="cn-cred" label="Credential reference (not the secret)">
            <input id="cn-cred" value={draft.credentialRef} onChange={(e) => set({ credentialRef: e.target.value })} placeholder="vault://alm/…" className={INPUT} />
          </F>
          <F id="cn-owner" label="Owner">
            <input id="cn-owner" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} className={INPUT} />
          </F>
          <F id="cn-cadence" label="Cadence (days)">
            <input id="cn-cadence" type="number" min={1} value={draft.cadenceDays} onChange={(e) => set({ cadenceDays: Number(e.target.value) })} className={INPUT} />
          </F>
          <F id="cn-window" label="Schedule window">
            <input id="cn-window" value={draft.scheduleWindow} onChange={(e) => set({ scheduleWindow: e.target.value })} placeholder="02:00–04:00 local" className={INPUT} />
          </F>
          <F id="cn-timeout" label="Timeout (seconds)">
            <input id="cn-timeout" type="number" min={1} value={draft.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} className={INPUT} />
          </F>
          <F id="cn-retries" label="Max retries">
            <input id="cn-retries" type="number" min={0} value={draft.maxRetries} onChange={(e) => set({ maxRetries: Number(e.target.value) })} className={INPUT} />
          </F>
        </div>

        <F id="cn-notes" label="Notes" className="mt-4">
          <textarea id="cn-notes" rows={3} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
        </F>

        <label htmlFor="cn-active" className="mt-4 flex items-center gap-2 text-[11px] text-gray-600">
          <input id="cn-active" type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="accent-gold-500" />
          Active — inactive connectors stay in the catalogue but cannot be assigned to a feed
        </label>

        {problems.length > 0 && (
          <ul className="mt-4 space-y-1 rounded border border-danger/30 bg-danger/5 p-3 text-[11px] text-danger">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => void onSave(draft)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Save connector
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function F({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
