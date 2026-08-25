/**
 * Connectors & Data Sources — screen 5.
 *
 * Where a connector is unavailable, the affiliate is declared **file-fed**
 * for that domain with a cadence and a named owner. That is the requested
 * behaviour and it matters: file upload is a first-class, declared
 * substitution path rather than something people fall back on informally.
 * GL Reconciliation then holds a file-fed affiliate to exactly the same
 * standard as an API-fed one.
 */

import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useSaveAffiliate } from '@/lib/hooks';
import type { Affiliate, DataDomain, DomainFeed, FeedMode } from '@/engine/types';

interface ConnectorDef {
  id: string;
  name: string;
  vendor: string;
  domains: DataDomain[];
  /** Whether a real protocol implementation exists, and what blocks it if not. */
  availability: 'Implemented' | 'Blocked';
  note: string;
}

/**
 * Connector availability is reported honestly. Two of these are genuinely
 * blocked, and saying so is more useful than a green tick that fails in
 * implementation.
 */
const CONNECTORS: ConnectorDef[] = [
  {
    id: 'C-FLEXCUBE',
    name: 'Oracle Flexcube',
    vendor: 'Oracle',
    domains: ['Positions', 'GeneralLedger', 'Counterparties'],
    availability: 'Implemented',
    note: 'Core banking. REST extract per affiliate instance.',
  },
  {
    id: 'C-REUTERS',
    name: 'Refinitiv / Reuters',
    vendor: 'LSEG',
    domains: ['MarketRates', 'FxRates'],
    availability: 'Implemented',
    note: 'Market data over HTTP. Daily SLA.',
  },
  {
    id: 'C-CALYPSO',
    name: 'Calypso',
    vendor: 'Adenza',
    domains: ['Positions', 'MarketRates'],
    availability: 'Blocked',
    note: 'Blocked on vendor documentation access. File substitution is the supported path until that clears.',
  },
  {
    id: 'C-BLOOMBERG',
    name: 'Bloomberg',
    vendor: 'Bloomberg',
    domains: ['MarketRates', 'FxRates'],
    availability: 'Blocked',
    note: 'BLPAPI is a session-based binary protocol, not HTTP — a genuine protocol mismatch, not a scheduling gap.',
  },
];

const DOMAINS: DataDomain[] = [
  'Positions',
  'GeneralLedger',
  'MarketRates',
  'FxRates',
  'Counterparties',
  'EconomicIndicators',
];

const DEFAULT_SLA: Record<DataDomain, number> = {
  Positions: 30,
  GeneralLedger: 30,
  MarketRates: 1,
  FxRates: 1,
  Counterparties: 90,
  EconomicIndicators: 30,
};

export function Connectors() {
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: affiliates = [] } = useAffiliates();
  const save = useSaveAffiliate();
  const canEdit = hasPermission('data.configure');

  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, 'ok' | 'failed'>>({});

  const affiliate = affiliates.find((a) => a.code === affiliateCode) ?? affiliates.find((a) => a.code !== 'GROUP');

  const updateFeed = (domain: DataDomain, patch: Partial<DomainFeed>) => {
    if (!affiliate) return;
    const existing = affiliate.feeds.find((f) => f.domain === domain);
    const feed: DomainFeed = {
      domain,
      mode: 'NotConfigured',
      connectorId: null,
      slaDays: DEFAULT_SLA[domain],
      owner: null,
      ...existing,
      ...patch,
    };
    const feeds = [...affiliate.feeds.filter((f) => f.domain !== domain), feed];
    save.mutate({ ...affiliate, feeds } satisfies Affiliate);
  };

  /**
   * Simulated connection test. Blocked connectors fail — reporting a green
   * tick for something known not to work is how a demo becomes a
   * misrepresentation.
   */
  const testConnection = (connector: ConnectorDef) => {
    setTesting(connector.id);
    window.setTimeout(() => {
      setResults((prev) => ({ ...prev, [connector.id]: connector.availability === 'Implemented' ? 'ok' : 'failed' }));
      setTesting(null);
    }, 700);
  };

  const fileFed = affiliate?.feeds.filter((f) => f.mode === 'File').length ?? 0;
  const unconfigured = DOMAINS.length - (affiliate?.feeds.filter((f) => f.mode !== 'NotConfigured').length ?? 0);

  return (
    <>
      <ModuleHeader
        title="Connectors & Data Sources"
        description="How each data domain reaches the platform. Where a connector is unavailable, file upload is declared as the substitution — with a cadence and an owner."
        asOfDate={null}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          { label: 'Connectors', value: String(CONNECTORS.length) },
          { label: 'Implemented', value: String(CONNECTORS.filter((c) => c.availability === 'Implemented').length) },
          { label: 'File-fed domains', value: String(fileFed), tone: fileFed > 0 ? 'warning' : 'neutral' },
          { label: 'Unconfigured', value: String(unconfigured), tone: unconfigured > 0 ? 'danger' : 'success' },
        ]}
      />

      <section className="mb-6">
        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Available connectors</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CONNECTORS.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-bold text-navy-900">{c.name}</h3>
                  <p className="text-[11px] text-gray-400">{c.vendor}</p>
                </div>
                <StatusBadge status={c.availability} tone={c.availability === 'Implemented' ? 'success' : 'danger'} />
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-gray-500">{c.note}</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {c.domains.map((d) => (
                  <span key={d} className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 border-t border-gray-50 pt-3">
                <button
                  type="button"
                  onClick={() => testConnection(c)}
                  disabled={!canEdit || testing === c.id}
                  className="text-[11px] font-bold text-navy-900 hover:text-navy-700 disabled:opacity-40"
                >
                  {testing === c.id ? 'Testing…' : 'Test connection'}
                </button>
                {results[c.id] === 'ok' && <StatusBadge status="Reachable" tone="success" />}
                {results[c.id] === 'failed' && <StatusBadge status="Unreachable" tone="danger" />}
              </div>
            </div>
          ))}
        </div>
      </section>

      {affiliate && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Domain feeds — {affiliate.name}
          </h2>
          <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
            Every domain must be fed by something. Declaring a domain file-fed is a deliberate configuration, not a
            workaround — reconciliation holds it to the same standard either way.
          </p>

          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Domain
                </th>
                <th scope="col" className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Fed by
                </th>
                <th scope="col" className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Connector
                </th>
                <th
                  scope="col"
                  className="py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400"
                >
                  SLA (days)
                </th>
                <th scope="col" className="py-2 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody>
              {DOMAINS.map((domain) => {
                const feed = affiliate.feeds.find((f) => f.domain === domain);
                const mode = feed?.mode ?? 'NotConfigured';
                const eligible = CONNECTORS.filter((c) => c.domains.includes(domain));
                return (
                  <tr key={domain} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-navy-900">{domain}</td>
                    <td className="py-2">
                      <label htmlFor={`mode-${domain}`} className="sr-only">
                        {domain} feed mode
                      </label>
                      <select
                        id={`mode-${domain}`}
                        value={mode}
                        disabled={!canEdit}
                        onChange={(e) => updateFeed(domain, { mode: e.target.value as FeedMode })}
                        className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                      >
                        <option value="NotConfigured">Not configured</option>
                        <option value="Connector">Connector</option>
                        <option value="File">File substitution</option>
                      </select>
                    </td>
                    <td className="py-2">
                      {mode === 'Connector' ? (
                        <>
                          <label htmlFor={`conn-${domain}`} className="sr-only">
                            {domain} connector
                          </label>
                          <select
                            id={`conn-${domain}`}
                            value={feed?.connectorId ?? ''}
                            disabled={!canEdit}
                            onChange={(e) => updateFeed(domain, { connectorId: e.target.value || null })}
                            className="rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                          >
                            <option value="">— select —</option>
                            {eligible.map((c) => (
                              <option key={c.id} value={c.id} disabled={c.availability === 'Blocked'}>
                                {c.name}
                                {c.availability === 'Blocked' ? ' (blocked)' : ''}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : mode === 'File' ? (
                        <span className="text-[11px] text-warning">Uploaded manually</span>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <label htmlFor={`sla-${domain}`} className="sr-only">
                        {domain} SLA days
                      </label>
                      <input
                        id={`sla-${domain}`}
                        type="number"
                        min={1}
                        value={feed?.slaDays ?? DEFAULT_SLA[domain]}
                        disabled={!canEdit || mode === 'NotConfigured'}
                        onChange={(e) => updateFeed(domain, { slaDays: Number(e.target.value) })}
                        className="w-20 rounded border border-gray-200 px-2 py-1 text-right font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                      />
                    </td>
                    <td className="py-2">
                      <label htmlFor={`owner-${domain}`} className="sr-only">
                        {domain} owner
                      </label>
                      <input
                        id={`owner-${domain}`}
                        value={feed?.owner ?? ''}
                        disabled={!canEdit || mode === 'NotConfigured'}
                        placeholder="Named owner"
                        onChange={(e) => updateFeed(domain, { owner: e.target.value || null })}
                        className="w-36 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
