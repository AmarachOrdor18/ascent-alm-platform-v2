/**
 * Connector edit fields — extracted from `Connectors.tsx`'s `ConnectorEditor`
 * so the exact same form (and `validateConnector` problems list) renders
 * both in the standalone drawer there and inline in the onboarding wizard's
 * Connectivity step, instead of two copies that could drift.
 */
import { type ReactNode } from 'react';
import { InfoButton } from '@/components/ui/InfoButton';
import { validateConnector } from '@/lib/connectorHooks';
import { DOMAINS, DOMAIN_LABEL, STATUS_LABEL } from './connectorConstants';
import type { AuthMode, Connector, ConnectorProtocol, ConnectorStatus, DataDomain } from '@/engine/types';

const PROTOCOLS: ConnectorProtocol[] = ['REST', 'SOAP', 'SFTP', 'JDBC', 'Proprietary', 'FileDrop'];
const AUTH_MODES: AuthMode[] = ['None', 'ApiKey', 'OAuth2', 'Basic', 'Certificate', 'SshKey'];
const STATUSES: ConnectorStatus[] = ['Available', 'Blocked', 'Planned', 'Retired'];

export function ConnectorFields({
  connector,
  onChange,
}: {
  connector: Connector;
  onChange: (next: Connector) => void;
}) {
  const set = (patch: Partial<Connector>) => onChange({ ...connector, ...patch });
  const toggleDomain = (d: DataDomain) =>
    set({ domains: connector.domains.includes(d) ? connector.domains.filter((x) => x !== d) : [...connector.domains, d] });
  const problems = validateConnector(connector);

  return (
    <div>
      <F id="cn-proto" label="Connector type">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PROTOCOLS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set({ protocol: p })}
              aria-pressed={connector.protocol === p}
              className={`rounded-lg border px-3 py-2 text-left text-[12px] font-bold ${
                connector.protocol === p
                  ? 'border-navy-700 bg-navy-50 text-navy-900'
                  : 'border-gray-200 text-gray-600 hover:border-navy-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </F>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <F id="cn-name" label="Name">
          <input id="cn-name" value={connector.name} onChange={(e) => set({ name: e.target.value })} className={INPUT} />
        </F>
        <F id="cn-vendor" label="Vendor">
          <input id="cn-vendor" value={connector.vendor} onChange={(e) => set({ vendor: e.target.value })} className={INPUT} />
        </F>
        <F id="cn-status" label="Status">
          <select id="cn-status" value={connector.status} onChange={(e) => set({ status: e.target.value as ConnectorStatus })} className={INPUT}>
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
              aria-pressed={connector.domains.includes(d)}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
                connector.domains.includes(d)
                  ? 'border-navy-700 bg-navy-50 text-navy-900'
                  : 'border-gray-200 text-gray-500 hover:border-navy-700'
              }`}
            >
              {DOMAIN_LABEL[d]}
            </button>
          ))}
        </div>
      </fieldset>

      {connector.status !== 'Available' && (
        <F id="cn-reason" label={`Why it is ${connector.status.toLowerCase()}`} className="mt-4">
          <textarea id="cn-reason" rows={2} value={connector.statusReason ?? ''} onChange={(e) => set({ statusReason: e.target.value })} className={INPUT} />
        </F>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <F id="cn-endpoint" label="Endpoint">
          <input id="cn-endpoint" value={connector.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://…  ·  {affiliate} is substituted" className={INPUT} />
        </F>
        <F id="cn-auth" label="Authentication">
          <select id="cn-auth" value={connector.authMode} onChange={(e) => set({ authMode: e.target.value as AuthMode })} className={INPUT}>
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
          <input id="cn-cred" value={connector.credentialRef} onChange={(e) => set({ credentialRef: e.target.value })} placeholder="vault://alm/…" className={INPUT} />
        </F>
        <F id="cn-owner" label="Owner">
          <input id="cn-owner" value={connector.owner} onChange={(e) => set({ owner: e.target.value })} className={INPUT} />
        </F>
        <F id="cn-cadence" label="Cadence (days)">
          <input id="cn-cadence" type="number" min={1} value={connector.cadenceDays} onChange={(e) => set({ cadenceDays: Number(e.target.value) })} className={INPUT} />
        </F>
        <F id="cn-timeout" label="Timeout (s)">
          <input id="cn-timeout" type="number" min={1} value={connector.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} className={INPUT} />
        </F>
        <F id="cn-retries" label="Max retries">
          <input id="cn-retries" type="number" min={0} value={connector.maxRetries} onChange={(e) => set({ maxRetries: Number(e.target.value) })} className={INPUT} />
        </F>
        <F id="cn-window" label="Schedule window">
          <input id="cn-window" value={connector.scheduleWindow} onChange={(e) => set({ scheduleWindow: e.target.value })} placeholder="02:00–04:00 local" className={INPUT} />
        </F>
      </div>

      <F id="cn-notes" label="Notes" className="mt-4">
        <textarea id="cn-notes" rows={2} value={connector.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
      </F>

      <label htmlFor="cn-active" className="mt-4 flex items-center gap-2 text-[11px] text-gray-600">
        <input id="cn-active" type="checkbox" checked={connector.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="accent-gold-500" />
        Active
      </label>

      {problems.length > 0 && (
        <ul className="mt-4 space-y-1 rounded border border-danger/30 bg-danger/5 p-3 text-[11px] text-danger">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
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
