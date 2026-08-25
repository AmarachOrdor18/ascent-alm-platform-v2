/**
 * Dimensions & Hierarchies — screen 10.
 *
 * The dimensional model was the largest gap in the first platform: without
 * it there is no way to answer "show me Corporate Banking's repricing gap",
 * reconcile to a general ledger, or compute depositor concentration.
 */

import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuth } from '@/context/AuthContext';
import { useDimensionMembers, useSaveDimensionMembers } from '@/lib/hooks';
import { buildHierarchy } from '@/engine/dimensions';
import type { DimensionMember, DimensionType } from '@/engine/types';

const DIMENSIONS: Array<{ type: DimensionType; label: string; purpose: string }> = [
  {
    type: 'LegalEntity',
    label: 'Legal Entity',
    purpose: 'Multi-entity consolidation and entity-level regulatory reporting.',
  },
  {
    type: 'OrgUnit',
    label: 'Organisational Unit',
    purpose: 'Segment profitability and FTP attribution by business unit.',
  },
  { type: 'Product', label: 'Product', purpose: 'Product-level assumptions, and copy-across-currencies.' },
  {
    type: 'GlAccount',
    label: 'General Ledger Account',
    purpose: 'Reconciliation of instrument balances to the ledger.',
  },
  {
    type: 'CommonCoa',
    label: 'Common Chart of Accounts',
    purpose: 'The Group standard every local GL maps onto — what makes 33 balance sheets comparable.',
  },
  {
    type: 'FinancialElement',
    label: 'Financial Element',
    purpose: 'What is being measured, so one results table serves every metric.',
  },
  {
    type: 'Counterparty',
    label: 'Counterparty',
    purpose: 'Depositor concentration, single-obligor limits, large exposures.',
  },
];

export function Dimensions() {
  const { hasPermission } = useAuth();
  const [active, setActive] = useState<DimensionType>('OrgUnit');
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ code: string; name: string; parentCode: string }>({
    code: '',
    name: '',
    parentCode: '',
  });

  const { data: members = [], isLoading } = useDimensionMembers(active);
  const save = useSaveDimensionMembers(active);
  const canEdit = hasPermission('data.configure') || hasPermission('admin.manage');

  const definition = DIMENSIONS.find((d) => d.type === active)!;
  const roots = useMemo(() => buildHierarchy(members), [members]);

  const handleAdd = () => {
    if (!draft.code.trim() || !draft.name.trim()) return;
    const parentCode = draft.parentCode || (roots[0]?.code ?? null);
    const member: DimensionMember = {
      id: `${active}:${draft.code.trim()}`,
      dimension: active,
      code: draft.code.trim(),
      name: draft.name.trim(),
      parentCode,
      isLeaf: true,
    };
    save.mutate([member], { onSuccess: () => setDraft({ code: '', name: '', parentCode: '' }) });
  };

  const columns: ResultColumn<DimensionMember>[] = [
    { key: 'code', header: 'Code', render: (m) => <span className="font-mono text-[11px]">{m.code}</span> },
    { key: 'name', header: 'Name', render: (m) => m.name },
    {
      key: 'parent',
      header: 'Parent',
      render: (m) => <span className="font-mono text-[11px] text-gray-500">{m.parentCode ?? '—'}</span>,
    },
    {
      key: 'kind',
      header: 'Type',
      render: (m) => <StatusBadge status={m.isLeaf ? 'Leaf' : 'Rollup'} tone={m.isLeaf ? 'neutral' : 'info'} />,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Dimensions & Hierarchies"
        description="The seven dimensions every position is tagged with. Configuration data, so it carries no as-of date."
        asOfDate={null}
        scope="Group"
        metrics={[
          { label: 'Dimensions', value: String(DIMENSIONS.length) },
          { label: `${definition.label} members`, value: String(members.length) },
          { label: 'Root nodes', value: String(roots.length) },
          { label: 'Leaves', value: String(members.filter((m) => m.isLeaf).length) },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Dimension">
        {DIMENSIONS.map((d) => (
          <button
            key={d.type}
            type="button"
            role="tab"
            aria-selected={active === d.type}
            onClick={() => {
              setActive(d.type);
              setSelected([]);
            }}
            className={
              active === d.type
                ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white'
                : 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:border-navy-700 hover:text-navy-900'
            }
          >
            {d.label}
          </button>
        ))}
      </div>

      <p className="mb-6 rounded-lg bg-navy-50 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
        <span className="font-bold">{definition.label}.</span> {definition.purpose}
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">Hierarchy</h2>
          <HierarchyBrowser
            members={members}
            selectedCodes={selected}
            onChange={setSelected}
            label={definition.label}
            emptyMessage={isLoading ? 'Loading…' : 'No members defined yet.'}
          />

          {canEdit && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Add member</h3>
              <div className="space-y-2">
                <div>
                  <label htmlFor="dim-code" className="mb-1 block text-[11px] text-gray-600">
                    Code
                  </label>
                  <input
                    id="dim-code"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    placeholder="OU-NG-RET-LAG"
                    className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <div>
                  <label htmlFor="dim-name" className="mb-1 block text-[11px] text-gray-600">
                    Name
                  </label>
                  <input
                    id="dim-name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Lagos Branch Network"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  />
                </div>
                <div>
                  <label htmlFor="dim-parent" className="mb-1 block text-[11px] text-gray-600">
                    Parent
                  </label>
                  <select
                    id="dim-parent"
                    value={draft.parentCode}
                    onChange={(e) => setDraft({ ...draft, parentCode: e.target.value })}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  >
                    <option value="">— top level —</option>
                    {members.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={save.isPending || !draft.code.trim() || !draft.name.trim()}
                  className="w-full rounded-lg bg-navy-900 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  {save.isPending ? 'Saving…' : 'Add member'}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            {selected.length > 0 ? `Selected (${selected.length})` : `All ${definition.label} members`}
          </h2>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <ResultTable
              rows={selected.length > 0 ? members.filter((m) => selected.includes(m.code)) : members}
              columns={columns}
              rowKey={(m) => m.code}
              emptyMessage={isLoading ? 'Loading…' : 'No members to show.'}
              renderDetail={(m) => (
                <dl className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Identifier</dt>
                    <dd className="font-mono text-gray-700">{m.id}</dd>
                  </div>
                  <div>
                    <dt className="font-bold uppercase tracking-wider text-gray-400">Attributes</dt>
                    <dd className="text-gray-700">
                      {m.attributes
                        ? Object.entries(m.attributes).map(([k, v]) => (
                            <span key={k} className="mr-3">
                              {k}: {String(v)}
                            </span>
                          ))
                        : 'None'}
                    </dd>
                  </div>
                </dl>
              )}
            />
          </div>
        </section>
      </div>
    </>
  );
}
