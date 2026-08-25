/**
 * Balance Sheet — screen 36.
 *
 * The only results screen that reads positions rather than a computed
 * element, because the balance sheet *is* the positions. It reads the exact
 * batches the run pinned, so it shows the same book the risk figures were
 * derived from — not whatever has been loaded since.
 *
 * Rolls up along any dimension and drills to the individual account, which
 * is the P-07 defect: v1 had no route from a total to its constituents.
 */

import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps } from '@/lib/resultHooks';
import { useDimensionMembers, usePositions } from '@/lib/hooks';
import { positionKeyFor, rollup, unmappedCodes, type RollupTotal } from '@/engine/dimensions';
import { buildFxTable, convert } from '@/engine/fx';
import { useFxRates } from '@/lib/hooks';
import { formatPct } from '@/lib/format';
import type { DimensionType, Position, PositionCategory } from '@/engine/types';

const DIMENSIONS: Array<{ value: DimensionType; label: string }> = [
  { value: 'CommonCoa', label: 'Common chart of accounts' },
  { value: 'OrgUnit', label: 'Organisational unit' },
  { value: 'Product', label: 'Product' },
  { value: 'GlAccount', label: 'Local general ledger' },
];

const CATEGORY_ORDER: PositionCategory[] = ['Asset', 'Liability', 'Capital'];

export function BalanceSheet() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run } = selected;

  const [dimension, setDimension] = useState<DimensionType>('CommonCoa');
  const { data: members = [] } = useDimensionMembers(dimension);
  const { data: fxRates = [] } = useFxRates();
  const { data: allPositions = [] } = usePositions(
    run?.affiliateCode === 'GROUP' ? undefined : run?.affiliateCode,
    run?.asOfDate,
  );

  // Pin to the run's own data version. Without this the screen would drift
  // away from the risk figures the moment a new batch is committed.
  const positions = useMemo(() => {
    if (!run) return [];
    if (run.positionBatchIds.length === 0) return allPositions;
    const pinned = new Set(run.positionBatchIds);
    return allPositions.filter((p) => pinned.has(p.batchId));
  }, [allPositions, run]);

  const currency = run?.reportingCurrency ?? 'USD';
  const fx = useMemo(
    () => buildFxTable(currency, fxRates, run?.asOfDate ?? '1970-01-01'),
    [currency, fxRates, run?.asOfDate],
  );

  const totals = useMemo(() => {
    const sum = (category: PositionCategory) =>
      positions
        .filter((p) => p.category === category && !p.isOffBalanceSheet)
        .reduce((s, p) => s + convert(p.amount, p.currency, currency, fx), 0);
    const assets = sum('Asset');
    const liabilities = sum('Liability');
    const capital = sum('Capital');
    const offBalanceSheet = positions
      .filter((p) => p.isOffBalanceSheet)
      .reduce((s, p) => s + convert(p.amount, p.currency, currency, fx), 0);
    return { assets, liabilities, capital, offBalanceSheet, plug: assets - liabilities - capital };
  }, [positions, currency, fx]);

  const rows = useMemo(() => rollup(positions, dimension, members), [positions, dimension, members]);
  const unmapped = useMemo(() => unmappedCodes(positions, dimension, members), [positions, dimension, members]);

  const columns: ResultColumn<RollupTotal>[] = [
    {
      key: 'name',
      header: 'Line',
      render: (r) => (
        <span style={{ paddingLeft: `${r.depth * 14}px` }} className={r.depth === 0 ? 'font-bold text-navy-900' : ''}>
          {r.name}
        </span>
      ),
    },
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-[11px] text-gray-500">{r.code}</span> },
    {
      key: 'amount',
      header: 'Booked here',
      align: 'right',
      render: (r) => (r.amount === 0 ? <span className="text-gray-300">—</span> : <Amount value={r.amount} currency={currency} />),
    },
    {
      key: 'rollup',
      header: 'Including children',
      align: 'right',
      render: (r) => <Amount value={r.rollupAmount} currency={currency} />,
      compareValue: (r) => r.rollupAmount,
    },
    {
      key: 'share',
      header: 'Share of assets',
      align: 'right',
      render: (r) => (
        <span className="font-mono">
          {totals.assets > 0 ? formatPct((r.rollupAmount / totals.assets) * 100, 1) : '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Balance Sheet"
        description="The book this run was computed from, rolled up along any dimension and drillable to the account."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          { label: 'Total assets', value: fmt(totals.assets, currency) },
          { label: 'Total liabilities', value: fmt(totals.liabilities, currency) },
          { label: 'Capital', value: fmt(totals.capital, currency) },
          {
            label: 'Balance check',
            value: fmt(totals.plug, currency),
            tone: Math.abs(totals.plug) < Math.max(1, totals.assets * 0.0001) ? 'success' : 'warning',
          },
        ]}
        actions={
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value as DimensionType)}
            aria-label="Roll up by"
            className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] focus:border-navy-700 focus:outline-none"
          >
            {DIMENSIONS.map((d) => (
              <option key={d.value} value={d.value}>
                Roll up by {d.label.toLowerCase()}
              </option>
            ))}
          </select>
        }
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        {Math.abs(totals.plug) >= Math.max(1, totals.assets * 0.0001) && (
          <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
            <span className="font-bold">Assets less liabilities and capital is not zero.</span> The difference is{' '}
            <Amount value={totals.plug} currency={currency} colorBySign /> — shown rather than plugged, because a
            balance sheet that always balances on screen hides the load that did not.
          </p>
        )}

        {unmapped.length > 0 && (
          <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
            <span className="font-bold">{unmapped.length} code(s) not in the {dimension} hierarchy:</span>{' '}
            <span className="font-mono">{unmapped.slice(0, 8).join(', ')}</span>
            {unmapped.length > 8 && ` and ${unmapped.length - 8} more`}. Their balances are excluded from the roll-up
            below, so the roll-up will not tie to the totals above until they are mapped.
          </p>
        )}

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
            Roll-up by {DIMENSIONS.find((d) => d.value === dimension)?.label.toLowerCase()}
          </h2>
          <ResultTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.code}
            emptyMessage="No positions in this run's pinned data version."
            renderDetail={(r) => <PositionDetail positions={positions} code={r.code} dimension={dimension} currency={currency} fx={fx} />}
          />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">By category</h2>
          <dl className="grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
            {CATEGORY_ORDER.map((c) => (
              <div key={c}>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{c}</dt>
                <dd className="mt-0.5">
                  <Amount
                    value={c === 'Asset' ? totals.assets : c === 'Liability' ? totals.liabilities : totals.capital}
                    currency={currency}
                  />
                </dd>
              </div>
            ))}
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Off balance sheet</dt>
              <dd className="mt-0.5">
                <Amount value={totals.offBalanceSheet} currency={currency} />
                <span className="ml-2 text-[10px] text-gray-400">notional, excluded from totals</span>
              </dd>
            </div>
          </dl>
        </section>
      </ResultsFrame>
    </>
  );
}

/** The accounts behind one roll-up line — closes P-07. */
function PositionDetail({
  positions,
  code,
  dimension,
  currency,
  fx,
}: {
  positions: Position[];
  code: string;
  dimension: DimensionType;
  currency: string;
  fx: ReturnType<typeof buildFxTable>;
}) {
  const field = positionKeyFor(dimension);
  const matching = field ? positions.filter((p) => p[field] === code).slice(0, 50) : [];

  if (matching.length === 0) {
    return <p className="text-[11px] text-gray-500">This is a parent line — expand a leaf to see its accounts.</p>;
  }

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
          <th className="py-1.5 font-bold">Account</th>
          <th className="py-1.5 font-bold">Product</th>
          <th className="py-1.5 font-bold">Class</th>
          <th className="py-1.5 text-right font-bold">Balance</th>
          <th className="py-1.5 text-right font-bold">Lien</th>
          <th className="py-1.5 font-bold">Matures</th>
          <th className="py-1.5 font-bold">Quality</th>
        </tr>
      </thead>
      <tbody>
        {matching.map((p) => (
          <tr key={p.id} className="border-b border-gray-50">
            <td className="py-1.5 font-mono">{p.accountNumber}</td>
            <td className="py-1.5">{p.productClass}</td>
            <td className="py-1.5">{p.accountClass}</td>
            <td className="py-1.5 text-right">
              <Amount value={convert(p.amount, p.currency, currency, fx)} currency={currency} />
            </td>
            <td className="py-1.5 text-right">
              {p.lienAmount > 0 ? (
                <span title={p.lienReason ?? undefined}>
                  <Amount value={p.lienAmount} currency={p.currency} />
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </td>
            <td className="py-1.5 font-mono">{p.maturityDate ?? '—'}</td>
            <td className="py-1.5">
              <StatusBadge status={p.performingStatus} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmt(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value) + ` ${currency}`;
}
