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
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { resolveSingleAffiliate, useAffiliates, useSaveAffiliate } from '@/lib/hooks';
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

/** "Blocked" is the stored value everywhere (the audit trail, the tone, the reachability check
 * that deliberately fails) — this only softens what a viewer reads, from a word that implies
 * something is wrong to one that reads as simply not done yet. */
const STATUS_LABEL: Record<ConnectorStatus, string> = {
  Available: 'Available', Blocked: 'Not configured', Planned: 'Planned', Retired: 'Retired',
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

  const [editing, setEditing] = useState<Connector | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, 'ok' | 'failed'>>({});

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const affiliate = affiliates.find((a) => a.code === pickedCode) ?? resolveSingleAffiliate(affiliates, affiliateCode);

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
        description="What feeds each data domain, and the sources available to feed it."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate'}
        metrics={[
          { label: 'Domains configured', value: `${configured} of ${DOMAINS.length}`,
            tone: configured === DOMAINS.length ? 'success' : 'warning' },
          { label: 'File-substituted', value: String(fileFed), tone: fileFed > 0 ? 'warning' : 'neutral' },
          { label: 'Connectors', value: String(connectors.length) },
          { label: 'Not configured', value: String(blocked.length), tone: blocked.length > 0 ? 'danger' : 'success' },
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

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode} />

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
          Feed map — {affiliate?.name ?? '—'}
        </h2>

        <div className="space-y-2">
          {DOMAINS.map((domain) => {
            const feed = feedFor(domain);
            const usable = availableFor(connectors, domain);
            return (
              <div key={domain} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-[200px] items-center gap-1.5">
                    <p className="text-[12px] font-bold text-navy-900">{DOMAIN_LABEL[domain]}</p>
                    <InfoButton label={`Why ${DOMAIN_LABEL[domain]} matters`}>{DOMAIN_PURPOSE[domain]}</InfoButton>
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
                      className="w-40 rounded border border-gray-200 px-2 py-1.5 text-[11px] focus:border-navy-700 focus:outline-none disabled:bg-gray-50"
                    />

                    <StatusBadge
                      status={feed.mode === 'File' ? 'File feed' : feed.mode === 'Connector' ? 'Connected' : 'Not configured'}
                      tone={feed.mode === 'File' ? 'warning' : feed.mode === 'Connector' ? 'success' : 'neutral'}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Data sources</h2>

        <div className="space-y-2">
          {connectors.map((c) => (
            <article key={c.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-bold text-navy-900">{c.name}</span>
                    <StatusBadge status={STATUS_LABEL[c.status]} tone={STATUS_TONE[c.status]} />
                    <span className="rounded border border-gray-200 px-2 py-0.5 font-mono text-[10px] text-gray-600">
                      {c.protocol}
                    </span>
                    {!c.isActive && <StatusBadge status="Inactive" tone="neutral" />}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {c.vendor} · {c.domains.map((d) => DOMAIN_LABEL[d]).join(', ') || 'no domains'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                  {c.status !== 'Available' && c.statusReason && (
                    <InfoButton label={`Why ${c.name} is ${STATUS_LABEL[c.status].toLowerCase()}`}>
                      {c.statusReason}
                    </InfoButton>
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
            </article>
          ))}

          {connectors.length === 0 && (
            <p className="rounded-lg bg-gray-50 p-6 text-center text-[12px] text-gray-500">
              No data sources yet. Add one, or run every domain as a declared file feed.
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
  const set = (patch: Partial<Connector>) => setDraft((d) => ({ ...d, ...patch }));
  const problems = validateConnector(draft);

  const toggleDomain = (d: DataDomain) =>
    set({ domains: draft.domains.includes(d) ? draft.domains.filter((x) => x !== d) : [...draft.domains, d] });

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
          <F id="cn-proto" label="Connector type">
            <div className="grid grid-cols-2 gap-2">
              {PROTOCOLS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set({ protocol: p })}
                  aria-pressed={draft.protocol === p}
                  className={`rounded-lg border px-3 py-2 text-left text-[12px] font-bold ${
                    draft.protocol === p
                      ? 'border-navy-700 bg-navy-50 text-navy-900'
                      : 'border-gray-200 text-gray-600 hover:border-navy-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </F>

          <div className="mt-4 grid grid-cols-1 gap-4">
            <F id="cn-name" label="Name">
              <input id="cn-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={INPUT} />
            </F>
            <F id="cn-vendor" label="Vendor">
              <input id="cn-vendor" value={draft.vendor} onChange={(e) => set({ vendor: e.target.value })} className={INPUT} />
            </F>
            <F id="cn-status" label="Status">
              <select id="cn-status" value={draft.status} onChange={(e) => set({ status: e.target.value as ConnectorStatus })} className={INPUT}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
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
              <textarea id="cn-reason" rows={2} value={draft.statusReason ?? ''} onChange={(e) => set({ statusReason: e.target.value })} className={INPUT} />
            </F>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4">
            <F id="cn-endpoint" label="Endpoint">
              <input id="cn-endpoint" value={draft.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://…  ·  {affiliate} is substituted" className={INPUT} />
            </F>
            <F id="cn-auth" label="Authentication">
              <select id="cn-auth" value={draft.authMode} onChange={(e) => set({ authMode: e.target.value as AuthMode })} className={INPUT}>
                {AUTH_MODES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </F>
            <F
              id="cn-cred"
              label={
                <span className="inline-flex items-center gap-1.5">
                  Credential reference
                  <InfoButton label="Why this isn't the secret itself">
                    This platform runs in the browser, so a secret typed here would sit in local storage on every
                    machine that opened the page. This field holds a vault reference; the connector service resolves
                    it server-side.
                  </InfoButton>
                </span>
              }
            >
              <input id="cn-cred" value={draft.credentialRef} onChange={(e) => set({ credentialRef: e.target.value })} placeholder="vault://alm/…" className={INPUT} />
            </F>
            <F id="cn-owner" label="Owner">
              <input id="cn-owner" value={draft.owner} onChange={(e) => set({ owner: e.target.value })} className={INPUT} />
            </F>
            <div className="grid grid-cols-3 gap-3">
              <F id="cn-cadence" label="Cadence (days)">
                <input id="cn-cadence" type="number" min={1} value={draft.cadenceDays} onChange={(e) => set({ cadenceDays: Number(e.target.value) })} className={INPUT} />
              </F>
              <F id="cn-timeout" label="Timeout (s)">
                <input id="cn-timeout" type="number" min={1} value={draft.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} className={INPUT} />
              </F>
              <F id="cn-retries" label="Max retries">
                <input id="cn-retries" type="number" min={0} value={draft.maxRetries} onChange={(e) => set({ maxRetries: Number(e.target.value) })} className={INPUT} />
              </F>
            </div>
            <F id="cn-window" label="Schedule window">
              <input id="cn-window" value={draft.scheduleWindow} onChange={(e) => set({ scheduleWindow: e.target.value })} placeholder="02:00–04:00 local" className={INPUT} />
            </F>
          </div>

          <F id="cn-notes" label="Notes" className="mt-4">
            <textarea id="cn-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
          </F>

          <label htmlFor="cn-active" className="mt-4 flex items-center gap-2 text-[11px] text-gray-600">
            <input id="cn-active" type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="accent-gold-500" />
            Active
          </label>

          {problems.length > 0 && (
            <ul className="mt-4 space-y-1 rounded border border-danger/30 bg-danger/5 p-3 text-[11px] text-danger">
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={problems.length > 0}
            onClick={() => void onSave(draft)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

function F({ id, label, children, className }: { id: string; label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
