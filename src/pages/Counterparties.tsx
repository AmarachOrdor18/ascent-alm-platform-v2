import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { AffiliateSelector } from '@/components/layout/AffiliateSelector';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { Drawer } from '@/components/ui/Drawer';
import { useAuth } from '@/context/AuthContext';
import {
  useAffiliates,
  useDimensionMembers,
  useSaveDimensionMembers,
  useDeleteDimensionMember,
  useSaveBatch,
  resolveSingleAffiliate,
} from '@/lib/hooks';
import { useScope } from '@/context/ScopeContext';
import { accessibleAffiliates } from '@/lib/scope';
import { repository } from '@/store/localRepository';
import { useQuery } from '@tanstack/react-query';
import { formatPct } from '@/lib/format';
import { referenceLoadBatch } from '@/lib/referenceBatch';
import type { DimensionMember } from '@/engine/types';

interface Row {
  member: DimensionMember;
  name: string;
  code: string;
  depositBalance: number;
  sharePercent: number;
  currency: string;
}

export function Counterparties() {
  const { user, hasPermission } = useAuth();
  const { affiliateCode: scopeAffiliateCode } = useScope();
  const { data: allAffiliates = [] } = useAffiliates();
  // Live-only, same as Data Upload - the counterparty register only matters once an affiliate is
  // actually working with real data.
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission).filter((a) => a.status === 'Live');

  const [pickedCode, setPickedCode] = useState<string | null>(null);
  // Counterparty is affiliate-owned, like every other dimension now - Group scope has no single register to
  // show, so (as elsewhere in the app) the user picks one affiliate explicitly.
  const affiliate =
    affiliates.find((a) => a.code === pickedCode) ??
    (scopeAffiliateCode === 'GROUP' ? undefined : resolveSingleAffiliate(affiliates, scopeAffiliateCode));
  const affiliateCode = affiliate?.code ?? '';

  const { data: members = [], isLoading } = useDimensionMembers('Counterparty', affiliate?.code);
  const save = useSaveDimensionMembers('Counterparty');
  const deleteMember = useDeleteDimensionMember('Counterparty');
  const saveBatch = useSaveBatch();
  const canEdit = hasPermission('data.configure');

  const handleDelete = (member: DimensionMember) => {
    if (!window.confirm(`Delete counterparty ${member.name} (${member.code})? This cannot be undone.`)) return;
    deleteMember.mutate(member);
  };

  const [draft, setDraft] = useState({ code: '', name: '', sector: 'Corporate' });
  const [addOpen, setAddOpen] = useState(false);
  const [newRef, setNewRef] = useState<Record<string, { system: string; sourceId: string }>>({});

  const addSourceRef = (member: DimensionMember) => {
    const pending = newRef[member.code];
    if (!pending?.system.trim() || !pending?.sourceId.trim()) return;
    save.mutate([
      {
        ...member,
        sourceRefs: [...(member.sourceRefs ?? []), { system: pending.system.trim(), sourceId: pending.sourceId.trim() }],
      },
    ]);
    setNewRef((prev) => ({ ...prev, [member.code]: { system: '', sourceId: '' } }));
  };

  const removeSourceRef = (member: DimensionMember, index: number) => {
    save.mutate([{ ...member, sourceRefs: (member.sourceRefs ?? []).filter((_, i) => i !== index) }]);
  };

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', affiliateCode],
    queryFn: () => (affiliateCode ? repository.queryPositions({ affiliateCode }) : Promise.resolve([])),
    enabled: !!affiliateCode,
  });

  const rows = useMemo<Row[]>(() => {
    const deposits = positions.filter((p) => p.category === 'Liability' && /deposits/i.test(p.productClass));
    const total = deposits.reduce((s, p) => s + p.amount, 0);
    const byId = new Map<string, { amount: number; currency: string }>();
    for (const p of deposits) {
      if (!p.counterpartyId) continue;
      const slot = byId.get(p.counterpartyId) ?? { amount: 0, currency: p.currency };
      slot.amount += p.amount;
      byId.set(p.counterpartyId, slot);
    }

    return members
      .filter((m) => m.isLeaf)
      .map((member) => {
        const exposure = byId.get(member.code);
        return {
          member,
          name: member.name,
          code: member.code,
          depositBalance: exposure?.amount ?? 0,
          sharePercent: total > 0 && exposure ? (exposure.amount / total) * 100 : 0,
          currency: exposure?.currency ?? 'NGN',
        };
      })
      .sort((a, b) => b.depositBalance - a.depositBalance);
  }, [members, positions]);

  const withExposure = rows.filter((r) => r.depositBalance > 0);
  const largest = withExposure[0] ?? null;
  const topFive = withExposure.slice(0, 5).reduce((s, r) => s + r.sharePercent, 0);

  const { search, setSearch, page, setPage, density, setDensity, paged, totalItems, pageSize } = useTableControls(
    rows,
    15,
    ['name', 'code'],
  );

  const handleAdd = () => {
    if (!draft.code.trim() || !draft.name.trim() || !affiliateCode) return;
    save.mutate(
      [
        {
          id: `Counterparty:${affiliateCode}:${draft.code.trim()}`,
          dimension: 'Counterparty',
          affiliateCode,
          code: draft.code.trim(),
          name: draft.name.trim(),
          parentCode: 'CP-ROOT',
          isLeaf: true,
          attributes: { sector: draft.sector },
        },
      ],
      {
        onSuccess: () => {
          // Genuinely per-affiliate, like GeneralLedger - but Data Sources' freshness page only reads
          // LoadBatch rows, so without recording one here this domain reads "Never loaded" forever no
          // matter how current the register actually is.
          if (user) {
            saveBatch.mutate(
              referenceLoadBatch({
                domain: 'Counterparties',
                affiliateCode,
                asOfDate: new Date().toISOString().slice(0, 10),
                label: `Manual entry - ${draft.code.trim()}`,
                uploadedBy: user.name,
              }),
            );
          }
          setDraft({ code: '', name: '', sector: 'Corporate' });
          setAddOpen(false);
        },
      },
    );
  };

  const columns: ResultColumn<Row>[] = [
    {
      key: 'name',
      header: 'Counterparty',
      render: (r) => <span className="font-medium text-navy-900">{r.member.name}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      render: (r) => <span className="font-mono text-[11px] text-gray-500">{r.member.code}</span>,
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (r) => <span className="text-gray-600">{String(r.member.attributes?.sector ?? '-')}</span>,
    },
    {
      key: 'balance',
      header: 'Deposit balance',
      align: 'right',
      render: (r) =>
        r.depositBalance > 0 ? (
          <Amount value={r.depositBalance} currency={r.currency} />
        ) : (
          <span className="text-gray-300">-</span>
        ),
      compareValue: (r) => r.depositBalance,
    },
    {
      key: 'share',
      header: 'Share of deposits',
      align: 'right',
      render: (r) =>
        r.sharePercent > 0 ? (
          <span className={r.sharePercent > 25 ? 'font-mono font-bold text-danger' : 'font-mono'}>
            {formatPct(r.sharePercent)}
          </span>
        ) : (
          <span className="text-gray-300">-</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        canEdit ? (
          <button
            type="button"
            onClick={() => handleDelete(r.member)}
            className="text-[11px] font-bold text-danger hover:underline"
          >
            Delete
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Counterparty Register"
        description="Obligors and depositors, with the exposure each carries. This is the dimension that makes depositor concentration computable."
        asOfDate={positions[0]?.asOfDate ?? null}
        scope={affiliate?.name ?? 'No affiliate selected'}
        metrics={[
          { label: 'Registered', value: affiliate ? String(rows.length) : '—', about: 'Counterparty codes on file, whether or not they currently carry a deposit balance.' },
          { label: 'With exposure', value: affiliate ? String(withExposure.length) : '—', about: 'Registered counterparties that actually hold a deposit balance in the current scope.' },
          {
            label: 'Largest single',
            value: largest ? formatPct(largest.sharePercent) : '-',
            tone: largest && largest.sharePercent > 25 ? 'danger' : 'neutral',
            about: 'The single largest counterparty’s share of total mapped deposits in this scope.',
          },
          { label: 'Top-5 share', value: withExposure.length > 0 ? formatPct(topFive) : '-', about: 'Combined share of total deposits held by the five largest counterparties.' },
        ]}
        actions={
          affiliate && canEdit ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
            >
              Add counterparty
            </button>
          ) : undefined
        }
      />

      <AffiliateSelector affiliates={affiliates} value={affiliate?.code} onChange={setPickedCode} />

      {!affiliate ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-[13px] font-bold text-navy-900">Select an affiliate</p>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-gray-500">
            The counterparty register is owned by each affiliate individually - pick one above to see or edit its
            register.
          </p>
        </section>
      ) : (
        <>
      {largest && largest.sharePercent > 25 && (
        <div role="status" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger">
          <span className="font-bold">Concentration watch.</span> {largest.member.name} holds{' '}
          {formatPct(largest.sharePercent)} of deposits in scope. Single-depositor dependence of this size is what a
          survival-horizon stress is designed to test.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        <section className="table-datagrid-container">
          <div className="border-b border-gray-100 bg-white/50 p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Register
              <InfoButton label="How exposure is computed">
                <p className="mb-1.5">
                  Deposit balance and share are computed live from currently loaded positions mapped to each
                  counterparty - this is the register itself, not a run&rsquo;s frozen results, so it reflects data as
                  it stands right now.
                </p>
                <p className="mb-1.5">
                  Deposits carrying no counterparty are reported as unattributed in concentration analysis rather than
                  being dropped or lumped together - either would distort the measure.
                </p>
                <p>
                  The register is seeded for each onboarded affiliate, then grows the same way any dimension does -
                  added here directly, or created automatically from a position file&rsquo;s counterparty codes via
                  Data Upload&rsquo;s &ldquo;Create these from the file&rdquo; step.
                </p>
              </InfoButton>
            </h2>
            <TableToolbar
              searchValue={search}
              onSearchChange={setSearch}
              exportData={() => rows}
              exportFilename="counterparties"
              density={density}
              onDensityChange={setDensity}
            />
          </div>
          <ResultTable
            rows={paged}
            columns={columns}
            rowKey={(r) => r.member.code}
            emptyMessage={isLoading ? 'Loading…' : 'No counterparties registered yet.'}
            renderDetail={(r) => (
              <div className="space-y-4 text-[11px]">
                <dl className="grid grid-cols-2 gap-3">
                  {Object.entries(r.member.attributes ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-bold uppercase tracking-wider text-gray-400">{k}</dt>
                      <dd className="text-gray-700">{String(v)}</dd>
                    </div>
                  ))}
                  {r.depositBalance === 0 && (
                    <div className="col-span-2">
                      <dd className="text-gray-500">Registered but carrying no deposit balance in the current scope.</dd>
                    </div>
                  )}
                </dl>

                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <p className="font-bold uppercase tracking-wider text-gray-400">Also known as</p>
                    <InfoButton label="About cross-references">
                      The same real-world counterparty can carry a different id in each source system - this
                      register is affiliate-owned and canonical, so a position arriving with Calypso&rsquo;s id for
                      this counterparty (say) resolves here instead of being flagged as an unmapped code.
                    </InfoButton>
                  </div>
                  {(r.member.sourceRefs ?? []).length === 0 ? (
                    <p className="text-gray-500">No other source-system id registered yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(r.member.sourceRefs ?? []).map((ref, i) => (
                        <li key={`${ref.system}-${ref.sourceId}`} className="flex items-center gap-2">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                            {ref.system}
                          </span>
                          <span className="font-mono">{ref.sourceId}</span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeSourceRef(r.member, i)}
                              className="text-[10px] font-bold text-danger hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div>
                        <label htmlFor={`ref-system-${r.member.code}`} className="mb-1 block text-[10px] text-gray-600">
                          Source system
                        </label>
                        <input
                          id={`ref-system-${r.member.code}`}
                          value={newRef[r.member.code]?.system ?? ''}
                          onChange={(e) =>
                            setNewRef((prev) => ({
                              ...prev,
                              [r.member.code]: { system: e.target.value, sourceId: prev[r.member.code]?.sourceId ?? '' },
                            }))
                          }
                          placeholder="Calypso"
                          className="w-28 rounded border border-gray-200 px-2 py-1 text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                        />
                      </div>
                      <div>
                        <label htmlFor={`ref-id-${r.member.code}`} className="mb-1 block text-[10px] text-gray-600">
                          Its id there
                        </label>
                        <input
                          id={`ref-id-${r.member.code}`}
                          value={newRef[r.member.code]?.sourceId ?? ''}
                          onChange={(e) =>
                            setNewRef((prev) => ({
                              ...prev,
                              [r.member.code]: { system: prev[r.member.code]?.system ?? '', sourceId: e.target.value },
                            }))
                          }
                          placeholder="BANK-007"
                          className="w-28 rounded border border-gray-200 px-2 py-1 font-mono text-[11px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => addSourceRef(r.member)}
                        disabled={save.isPending}
                        className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          />
          <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
        </section>

      </div>

      {addOpen && (
        <Drawer title="Register a counterparty" onClose={() => setAddOpen(false)}>
          <div className="space-y-3">
            <div>
              <label htmlFor="cp-code" className="mb-1 block text-[11px] text-gray-600">
                Code
              </label>
              <input
                id="cp-code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="CP-NG-CORP-04"
                className="w-full rounded border border-gray-200 px-2 py-1.5 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
            <div>
              <label htmlFor="cp-name" className="mb-1 block text-[11px] text-gray-600">
                Name
              </label>
              <input
                id="cp-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              />
            </div>
            <div>
              <label htmlFor="cp-sector" className="mb-1 block text-[11px] text-gray-600">
                Sector
              </label>
              <select
                id="cp-sector"
                value={draft.sector}
                onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
              >
                {['Corporate', 'Retail', 'Sovereign', 'Public Sector', 'Financial Institution'].map((s) => (
                  <option key={s} value={s}>
                    {s}
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
              {save.isPending ? 'Saving…' : 'Register'}
            </button>
          </div>
        </Drawer>
      )}
      </>
      )}
    </>
  );
}
