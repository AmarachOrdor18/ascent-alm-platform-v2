import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useDimensionMembers, useSaveDimensionMembers } from '@/lib/hooks';
import { useScope } from '@/context/ScopeContext';
import { repository } from '@/store/localRepository';
import { useQuery } from '@tanstack/react-query';
import { formatPct } from '@/lib/format';
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
  const { hasPermission } = useAuth();
  const { affiliateCode } = useScope();
  const { data: members = [], isLoading } = useDimensionMembers('Counterparty');
  const save = useSaveDimensionMembers('Counterparty');
  const canEdit = hasPermission('data.configure');

  const [draft, setDraft] = useState({ code: '', name: '', sector: 'Corporate' });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', affiliateCode],
    queryFn: () => repository.queryPositions(affiliateCode === 'GROUP' ? {} : { affiliateCode }),
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
    if (!draft.code.trim() || !draft.name.trim()) return;
    save.mutate(
      [
        {
          id: `Counterparty:${draft.code.trim()}`,
          dimension: 'Counterparty',
          code: draft.code.trim(),
          name: draft.name.trim(),
          parentCode: 'CP-ROOT',
          isLeaf: true,
          attributes: { sector: draft.sector },
        },
      ],
      { onSuccess: () => setDraft({ code: '', name: '', sector: 'Corporate' }) },
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
      render: (r) => <span className="text-gray-600">{String(r.member.attributes?.sector ?? '—')}</span>,
    },
    {
      key: 'balance',
      header: 'Deposit balance',
      align: 'right',
      render: (r) =>
        r.depositBalance > 0 ? (
          <Amount value={r.depositBalance} currency={r.currency} />
        ) : (
          <span className="text-gray-300">—</span>
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
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Counterparty Register"
        description="Obligors and depositors, with the exposure each carries. This is the dimension that makes depositor concentration computable."
        asOfDate={positions[0]?.asOfDate ?? null}
        scope={affiliateCode === 'GROUP' ? 'Ecobank Group' : affiliateCode}
        metrics={[
          { label: 'Registered', value: String(rows.length), about: 'Counterparty codes on file, whether or not they currently carry a deposit balance.' },
          { label: 'With exposure', value: String(withExposure.length), about: 'Registered counterparties that actually hold a deposit balance in the current scope.' },
          {
            label: 'Largest single',
            value: largest ? formatPct(largest.sharePercent) : '—',
            tone: largest && largest.sharePercent > 25 ? 'danger' : 'neutral',
            about: 'The single largest counterparty’s share of total mapped deposits in this scope.',
          },
          { label: 'Top-5 share', value: withExposure.length > 0 ? formatPct(topFive) : '—', about: 'Combined share of total deposits held by the five largest counterparties.' },
        ]}
      />

      {largest && largest.sharePercent > 25 && (
        <div role="status" className="mb-6 rounded-lg bg-danger-bg px-4 py-3 text-[12px] leading-relaxed text-danger">
          <span className="font-bold">Concentration watch.</span> {largest.member.name} holds{' '}
          {formatPct(largest.sharePercent)} of deposits in scope. Single-depositor dependence of this size is what a
          survival-horizon stress is designed to test.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <section className="table-datagrid-container lg:col-span-3">
          <div className="border-b border-gray-100 bg-white/50 p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
              Register
              <InfoButton label="How exposure is computed">
                Deposit balance and share are computed live from currently loaded positions mapped to each
                counterparty — this is the register itself, not a run's frozen results, so it reflects data as it
                stands right now.
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
              <dl className="grid grid-cols-2 gap-3 text-[11px]">
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
            )}
          />
          <TablePagination currentPage={page} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
        </section>

        <section>
          {canEdit && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Register a counterparty
              </h2>
              <div className="space-y-2">
                <div>
                  <label htmlFor="cp-code" className="mb-1 block text-[11px] text-gray-600">
                    Code
                  </label>
                  <input
                    id="cp-code"
                    value={draft.code}
                    onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                    placeholder="CP-NG-CORP-04"
                    className="w-full rounded border border-gray-200 px-2 py-1 font-mono text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
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
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
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
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
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
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-navy-900">Why this exists</h2>
            <p className="text-[11px] leading-relaxed text-gray-500">
              Deposits carrying no counterparty are reported as unattributed in concentration analysis rather than being
              dropped or lumped together — either would distort the measure. The retail pool is deliberately aggregated,
              since no single retail depositor reaches the reporting threshold.
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
              The register itself is seeded for each onboarded affiliate, then grows the same way any dimension does —
              added here directly, or created automatically from a position file&rsquo;s counterparty codes via Data
              Upload&rsquo;s &ldquo;Create these from the file&rdquo; step.
            </p>
            <div className="mt-3">
              <StatusBadge
                status={`${rows.filter((r) => r.depositBalance === 0).length} registered, no exposure`}
                tone="neutral"
              />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
