// Add a data source. Affiliate users add sources for their own affiliate only (no picker); Group users
// choose whose source it is, including Group itself for organisation-wide market data.
import { useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates } from '@/lib/hooks';
import { useConnectors } from '@/lib/connectorHooks';
import { isRestrictedToOwnAffiliate } from '@/lib/scope';
import {
  ALL_SOURCE_DOMAINS,
  CONNECTOR_TYPE_LABEL,
  defaultBusinessDateField,
  defaultFieldsFor,
  isMarketDataDomain,
  SOURCE_DOMAIN_LABEL,
  SOURCE_FREQUENCIES,
} from '@/lib/dataSources';
import { useSaveDataSource } from '@/lib/sourceHooks';
import { ALL_CONTRIBUTORS } from '@/engine/vintage';
import { btn, inputCls, Notice } from './sourceUi';
import type {
  DataSource,
  DataSourceDomain,
  PositionContributor,
  SourceConnectorType,
  SourceFrequency,
} from '@/engine/types';

const CONNECTOR_TYPES: SourceConnectorType[] = ['ManualUpload', 'SFTP', 'API', 'Database'];

export function AddSourceDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user, hasPermission } = useAuth();
  const restricted = isRestrictedToOwnAffiliate(user, hasPermission);
  const { data: affiliates = [] } = useAffiliates();
  const { data: connectors = [] } = useConnectors();
  const save = useSaveDataSource();

  const [affiliateCode, setAffiliateCode] = useState(restricted ? user!.affiliateCode : '');
  const [domain, setDomain] = useState<DataSourceDomain>('Positions');
  const [contributor, setContributor] = useState<PositionContributor | ''>('');
  const [name, setName] = useState('');
  const [connectorType, setConnectorType] = useState<SourceConnectorType>('ManualUpload');
  const [connectorId, setConnectorId] = useState('');
  const [owner, setOwner] = useState('');
  const [frequency, setFrequency] = useState<SourceFrequency>('Monthly');
  const [schedule, setSchedule] = useState('');
  const [autoAdmit, setAutoAdmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGroup = affiliateCode === 'GROUP';
  const domains = useMemo(
    () => ALL_SOURCE_DOMAINS.filter((d) => (isGroup ? isMarketDataDomain(d) : !isMarketDataDomain(d))),
    [isGroup],
  );
  const effectiveDomain = domains.includes(domain) ? domain : domains[0]!;
  const usableConnectors = connectors.filter((c) => c.isActive && c.domains.includes(effectiveDomain as never));

  const create = () => {
    setError(null);
    if (!affiliateCode) return setError('Choose who the source belongs to.');
    if (!name.trim()) return setError('Give the source a name.');
    if (connectorType !== 'ManualUpload' && !connectorId) return setError('Choose the connection that delivers it.');
    const now = new Date().toISOString();
    const slug = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const source: DataSource = {
      id: `DS-${affiliateCode}-${slug}-${Date.now().toString(36).toUpperCase()}`,
      affiliateCode,
      name: name.trim(),
      domain: effectiveDomain,
      ...(effectiveDomain === 'Positions' && contributor ? { contributor } : {}),
      connectorType,
      connectorId: connectorType === 'ManualUpload' ? null : connectorId,
      owner: owner.trim(),
      frequency,
      ...(schedule.trim() ? { schedule: schedule.trim() } : {}),
      fields: defaultFieldsFor(
        effectiveDomain,
        effectiveDomain === 'Positions' && contributor ? contributor : undefined,
      ),
      ...(defaultBusinessDateField(effectiveDomain)
        ? { businessDateField: defaultBusinessDateField(effectiveDomain) }
        : {}),
      autoAdmit,
      isActive: true,
      createdAt: now,
      createdBy: user?.name ?? 'unknown',
    };
    save.mutate(source, {
      onSuccess: () => onCreated(source.id),
      onError: (err) => setError(err instanceof Error ? err.message : String(err)),
    });
  };

  const field = (label: string, control: React.ReactNode, hint?: string) => (
    <label className="block text-[12px] font-bold text-gray-600">
      {label}
      <div className="mt-1 font-normal">{control}</div>
      {hint && <span className="mt-0.5 block text-[11px] font-normal text-gray-400">{hint}</span>}
    </label>
  );

  return (
    <Drawer
      title="Add a data source"
      description="It starts with the platform's standard fields for that kind of data - adjust them on the Fields tab."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btn.primary} disabled={save.isPending} onClick={create}>
            {save.isPending ? 'Adding…' : 'Add source'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {!restricted &&
          field(
            'Belongs to',
            <select className={inputCls} value={affiliateCode} onChange={(e) => setAffiliateCode(e.target.value)}>
              <option value="">- choose -</option>
              <option value="GROUP">Group (market data for every affiliate)</option>
              {affiliates
                .filter((a) => a.code !== 'GROUP')
                .map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
            </select>,
          )}
        {field(
          'Data it carries',
          <select
            className={inputCls}
            value={effectiveDomain}
            onChange={(e) => setDomain(e.target.value as DataSourceDomain)}
          >
            {domains.map((d) => (
              <option key={d} value={d}>
                {SOURCE_DOMAIN_LABEL[d]}
              </option>
            ))}
          </select>,
        )}
        {effectiveDomain === 'Positions' &&
          field(
            'Department',
            <select
              className={inputCls}
              value={contributor}
              onChange={(e) => setContributor(e.target.value as PositionContributor | '')}
            >
              <option value="">Whole book (any department)</option>
              {ALL_CONTRIBUTORS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>,
            'Usually the whole book in one file. Pick a department only if it sends its own separate file.',
          )}
        {field(
          'Name',
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Flexcube loans extract"
          />,
        )}
        {field(
          'Arrives by',
          <select
            className={inputCls}
            value={connectorType}
            onChange={(e) => setConnectorType(e.target.value as SourceConnectorType)}
          >
            {CONNECTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'ManualUpload' ? 'Upload (someone uploads a file)' : CONNECTOR_TYPE_LABEL[t]}
              </option>
            ))}
          </select>,
        )}
        {connectorType !== 'ManualUpload' &&
          (usableConnectors.length === 0 ? (
            <Notice tone="warning">
              No connection is set up for this kind of data yet. Add one under Organisation setup first, or choose
              Upload.
            </Notice>
          ) : (
            field(
              'Connection',
              <select className={inputCls} value={connectorId} onChange={(e) => setConnectorId(e.target.value)}>
                <option value="">- choose -</option>
                {usableConnectors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>,
            )
          ))}
        {field(
          'Owner',
          <input
            className={inputCls}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Team or person accountable"
          />,
        )}
        <div className="grid grid-cols-2 gap-3">
          {field(
            'Expected',
            <select
              className={inputCls}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as SourceFrequency)}
            >
              {SOURCE_FREQUENCIES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>,
          )}
          {field(
            'By when',
            <input
              className={inputCls}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="e.g. 3rd business day"
            />,
          )}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-navy-900">
          <input type="checkbox" checked={autoAdmit} onChange={(e) => setAutoAdmit(e.target.checked)} />
          Admit clean files straight away (skip the lobby)
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    </Drawer>
  );
}
