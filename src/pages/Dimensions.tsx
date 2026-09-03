import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { InfoButton } from '@/components/ui/InfoButton';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useAffiliates, useDimensionMembers, useSaveDimensionMembers, useDeleteDimensionMember } from '@/lib/hooks';
import { resolveSingleAffiliate } from '@/lib/hooks';
import { accessibleAffiliates } from '@/lib/scope';
import { buildHierarchy } from '@/engine/dimensions';
import { useScope } from '@/context/ScopeContext';
import type { DimensionMember, DimensionType } from '@/engine/types';

/**
 * Grouped, not a flat row of seven tabs - each group is one question a
 * configurer actually has ("what does our org chart look like," "how does
 * our GL map to the Group standard"), not an arbitrary taxonomy split.
 */
const GROUPS: Array<{
  label: string;
  hint: string;
  dimensions: Array<{ type: DimensionType; label: string; purpose: string }>;
}> = [
  {
    label: 'Structure',
    hint: 'Who this affiliate is, and how it is organised internally.',
    dimensions: [
      { type: 'LegalEntity', label: 'Legal Entity', purpose: 'Multi-entity consolidation and entity-level regulatory reporting.' },
      { type: 'OrgUnit', label: 'Organisational Unit', purpose: 'Segment profitability and FTP attribution by business unit.' },
    ],
  },
  {
    label: 'Chart of accounts',
    hint: 'How this affiliate’s ledger maps onto the standard every affiliate reconciles against.',
    dimensions: [
      { type: 'GlAccount', label: 'General Ledger Account', purpose: 'Reconciliation of instrument balances to the ledger.' },
      { type: 'CommonCoa', label: 'Common Chart of Accounts', purpose: 'The reconciliation standard this affiliate’s local GL maps onto.' },
    ],
  },
  {
    label: 'Products',
    hint: 'What this affiliate actually sells and books.',
    dimensions: [
      { type: 'Product', label: 'Product', purpose: 'Product-level regulatory assumptions and transfer-pricing rules key off these codes.' },
    ],
  },
  {
    label: 'Measures',
    hint: 'A shared, Group-wide taxonomy - not specific to any one affiliate.',
    dimensions: [
      { type: 'FinancialElement', label: 'Financial Element', purpose: 'What is being measured, so one results table serves every metric.' },
    ],
  },
];

const ALL_DIMENSIONS = GROUPS.flatMap((g) => g.dimensions);

export function Dimensions() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode: scopeAffiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  // Live-only, same as Data Upload - dimension membership only matters once an affiliate is actually
  // working with real data.
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission).filter((a) => a.status === 'Live');

  const [active, setActive] = useState<DimensionType>('OrgUnit');
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ code: string; name: string; parentCode: string; isLeaf: boolean }>({
    code: '',
    name: '',
    parentCode: '',
    isLeaf: true,
  });
  // Set while editing an existing member - code stays locked (it's what the id, and every reference to
  // this member, is keyed on), only name/parent/leaf are changed in place.
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [justSavedProduct, setJustSavedProduct] = useState(false);
  const resetDraft = () => {
    setDraft({ code: '', name: '', parentCode: '', isLeaf: true });
    setEditingCode(null);
    setJustSavedProduct(false);
  };

  const definition = ALL_DIMENSIONS.find((d) => d.type === active)!;
  // Financial Element is a genuinely shared, Group-wide taxonomy (see engine/classification.ts's seed rule
  // comment) - everything else is owned by whichever affiliate is currently selected.
  const isGroupWide = active === 'FinancialElement';

  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (scopeAffiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, scopeAffiliateCode));
  const effectiveAffiliateCode = isGroupWide ? 'GROUP' : affiliate?.code;

  const { data: members = [], isLoading } = useDimensionMembers(active, effectiveAffiliateCode);
  const save = useSaveDimensionMembers(active);
  const deleteMember = useDeleteDimensionMember(active);
  const canEdit = hasPermission('data.configure') || hasPermission('admin.manage');

  const handleDelete = (member: DimensionMember) => {
    const childCount = members.filter((m) => m.parentCode === member.code).length;
    if (childCount > 0) {
      window.alert(`${member.name} has ${childCount} child member(s) nested under it - delete those first.`);
      return;
    }
    if (!window.confirm(`Delete ${member.name} (${member.code})? This cannot be undone.`)) return;
    deleteMember.mutate(member);
  };

  const roots = useMemo(() => buildHierarchy(members), [members]);

  const shownMembers = selected.length > 0 ? members.filter((m) => selected.includes(m.code)) : members;
  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    shownMembers,
    15,
    ['code', 'name', 'parentCode'],
  );

  const handleEdit = (member: DimensionMember) => {
    setEditingCode(member.code);
    setDraft({ code: member.code, name: member.name, parentCode: member.parentCode ?? '', isLeaf: member.isLeaf });
  };

  const handleSubmit = () => {
    if (!draft.code.trim() || !draft.name.trim() || !effectiveAffiliateCode) return;
    const code = draft.code.trim();
    if (draft.parentCode === code) return; // can't be its own parent
    const parentCode = draft.parentCode || (editingCode ? null : (roots[0]?.code ?? null));
    const member: DimensionMember = {
      id: `${active}:${effectiveAffiliateCode}:${code}`,
      dimension: active,
      affiliateCode: effectiveAffiliateCode,
      code,
      name: draft.name.trim(),
      parentCode,
      isLeaf: draft.isLeaf,
    };
    const isProductLeaf = active === 'Product' && draft.isLeaf;
    save.mutate([member], {
      onSuccess: () => {
        resetDraft();
        if (isProductLeaf) setJustSavedProduct(true);
      },
    });
  };

  const columns: ResultColumn<DimensionMember>[] = [
    { key: 'code', header: 'Code', render: (m) => <span className="font-mono text-[11px]">{m.code}</span> },
    { key: 'name', header: 'Name', render: (m) => m.name },
    {
      key: 'parent',
      header: 'Parent',
      render: (m) => <span className="font-mono text-[11px] text-gray-500">{m.parentCode ?? '-'}</span>,
    },
    {
      key: 'kind',
      header: 'Type',
      render: (m) => <StatusBadge status={m.isLeaf ? 'Leaf' : 'Rollup'} tone={m.isLeaf ? 'neutral' : 'info'} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) =>
        canEdit ? (
          <span className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => handleEdit(m)}
              className="text-[11px] font-bold text-navy-700 hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleDelete(m)}
              className="text-[11px] font-bold text-danger hover:underline"
            >
              Delete
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Dimensions & Hierarchies"
        description="How this affiliate is structured, classified and mapped. Configuration data, so it carries no as-of date - and it's owned by the affiliate you pick below, never shared Group-wide (Financial Element excepted)."
        asOfDate={null}
        scope={isGroupWide ? 'Group-wide' : (affiliate?.name ?? 'No affiliate selected')}
        actions={
          <InfoButton label="Where this data comes from">
            Each affiliate's own hierarchies (legal entities, org units, GL accounts, its copy of the Common Chart
            of Accounts, products) are seeded when it's onboarded, then are ordinary configuration data from
            there - add, edit or reparent a member here, or via the CSV &ldquo;Create these from the file&rdquo;
            flow on Data Upload, which adds anything a position file references that isn&rsquo;t mapped yet.
            Financial Element is the one exception: a Group-wide taxonomy of what's being measured, not tied to
            any affiliate.
          </InfoButton>
        }
        metrics={
          effectiveAffiliateCode
            ? [
                { label: `${definition.label} members`, value: String(members.length), about: `Every code defined on the ${definition.label} dimension for this scope, at any level of its hierarchy.` },
                { label: 'Root nodes', value: String(roots.length), about: 'Top-level entries in this dimension’s hierarchy - everything else nests beneath one of these.' },
                { label: 'Leaves', value: String(members.filter((m) => m.isLeaf).length), about: 'Members with no children - these are what a position can actually be tagged with; a rollup node cannot carry a balance directly.' },
              ]
            : [{ label: `${definition.label} members`, value: '—', about: 'Pick an affiliate below to see its own dimension data.' }]
        }
      />

      {!isGroupWide && (
        <AffiliateSelector
          affiliates={affiliates}
          value={affiliate?.code}
          onChange={(code) => {
            setPickedCode(code);
            resetDraft();
          }}
        />
      )}

      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group.label}</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={group.label}>
              {group.dimensions.map((d) => (
                <button
                  key={d.type}
                  type="button"
                  role="tab"
                  aria-selected={active === d.type}
                  onClick={() => {
                    setActive(d.type);
                    setSelected([]);
                    resetDraft();
                  }}
                  title={d.purpose}
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
          </div>
        ))}
      </div>

      <p className="mb-6 rounded-lg bg-navy-50 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
        <span className="font-bold">{definition.label}.</span> {definition.purpose}
      </p>

      {!isGroupWide && !affiliate ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Select an affiliate</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            {definition.label} is owned by each affiliate individually - pick one above to see or edit its entries.
          </p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-1">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Hierarchy
              <InfoButton label="How to use this tree">
                Select one or more nodes to filter the table on the right to just those members. Selecting a rollup
                node brings its whole subtree with it - everything nested beneath it is included automatically.
              </InfoButton>
            </h2>
            <HierarchyBrowser
              members={members}
              selectedCodes={selected}
              onChange={setSelected}
              label={definition.label}
              emptyMessage={isLoading ? 'Loading…' : 'No members defined yet.'}
            />

            {canEdit && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  {editingCode ? `Editing ${editingCode}` : 'Add member'}
                </h3>
                <div className="space-y-2">
                  <div>
                    <label htmlFor="dim-code" className="mb-1 block text-[11px] text-gray-600">
                      Code
                    </label>
                    <input
                      id="dim-code"
                      value={draft.code}
                      disabled={!!editingCode}
                      onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                      placeholder="OU-NG-RET-LAG"
                      className={cn(
                        'w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700',
                        editingCode && 'bg-gray-50 text-gray-500',
                      )}
                    />
                    {editingCode && (
                      <p className="mt-1 text-[10px] text-gray-400">
                        Locked - the code is what every reference to this member is keyed on. Delete and re-add to
                        change it.
                      </p>
                    )}
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
                      <option value="">- top level -</option>
                      {members
                        .filter((m) => m.code !== editingCode)
                        .map((m) => (
                          <option key={m.code} value={m.code}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <label htmlFor="dim-is-leaf" className="flex cursor-pointer items-start gap-2 text-[11px] text-gray-600">
                    <input
                      id="dim-is-leaf"
                      type="checkbox"
                      checked={draft.isLeaf}
                      onChange={(e) => setDraft({ ...draft, isLeaf: e.target.checked })}
                      className="mt-0.5 accent-gold-500"
                    />
                    <span>
                      Leaf - can be tagged directly on a position. Uncheck for a grouping node other members will
                      nest under (a category, not something a position codes to itself).
                    </span>
                  </label>
                  <div className="flex gap-2">
                    {editingCode && (
                      <button
                        type="button"
                        onClick={resetDraft}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-gray-600 hover:border-navy-700 hover:text-navy-900"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={save.isPending || !draft.code.trim() || !draft.name.trim()}
                      className="flex-1 rounded-lg bg-navy-900 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                    >
                      {save.isPending
                        ? 'Saving…'
                        : editingCode
                          ? 'Save changes'
                          : `Add to ${isGroupWide ? 'Group' : (affiliate?.name ?? '')}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {justSavedProduct && affiliate && (
              <div className="mt-3 rounded-lg bg-navy-50 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
                <p className="mb-3">
                  Saved. This is the catalogue entry only - it has no effect on any calculation until it has
                  Basel factors defined.
                </p>
                <Link
                  href={`/affiliates/${affiliate.code}/settings?section=rule-ProductCharacteristic`}
                  className="inline-block rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
                >
                  Set Product Characteristics →
                </Link>
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              {selected.length > 0 ? `Selected (${selected.length})` : `All ${definition.label} members`}
              <InfoButton label="Leaf vs rollup">
                A Leaf member is what a position can actually be tagged with. A Rollup exists purely to organise leaves
                beneath it and never carries a balance of its own - that's why its "booked here" figure elsewhere is
                always zero.
              </InfoButton>
            </h2>
            <div className="table-datagrid-container">
              <div className="border-b border-gray-100 bg-white/50 p-5">
                <TableToolbar
                  searchValue={search}
                  onSearchChange={setSearch}
                  exportData={() => shownMembers}
                  exportFilename={`dimensions-${active}-${effectiveAffiliateCode}`}
                  density={density}
                  onDensityChange={setDensity}
                />
              </div>
              <ResultTable
                rows={paged}
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
              <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
