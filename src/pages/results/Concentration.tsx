/**
 * Concentration & Large Exposures — screen 43.
 *
 * Depositor concentration by counterparty, which is what RFP §2.1 asks for.
 *
 * v1 grouped deposits by affiliate and labelled the result "depositor
 * concentration" (defect D-04). That answers how funding is spread across
 * the Group — a real question, but not this one, and not the one a regulator
 * asks. The question here is whether a handful of names could take the
 * funding base with them.
 */

import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { useDimensionMembers } from '@/lib/hooks';
import { formatPct } from '@/lib/format';
import type { ConcentrationEntry, ConcentrationResult } from '@/engine/liquidity';

/** Herfindahl bands as competition authorities read them, applied to funding. */
function hhiBand(hhi: number | null): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (hhi === null) return { label: 'Not computable', tone: 'warning' };
  if (hhi < 1500) return { label: 'Diversified', tone: 'success' };
  if (hhi < 2500) return { label: 'Moderately concentrated', tone: 'warning' };
  return { label: 'Highly concentrated', tone: 'danger' };
}

export function Concentration() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const conc = payloadOf<ConcentrationResult>(results, 'Concentration');
  const { data: counterparties = [] } = useDimensionMembers('Counterparty');
  const [limit, setLimit] = useState(20);

  const nameOf = (id: string) => counterparties.find((c) => c.code === id)?.name ?? id;

  const rows = useMemo(() => conc?.byCounterparty.slice(0, limit) ?? [], [conc, limit]);
  const band = hhiBand(conc?.herfindahlIndex ?? null);

  const columns: ResultColumn<ConcentrationEntry>[] = [
    {
      key: 'rank',
      header: '#',
      render: (e) => (
        <span className="font-mono text-gray-400">{(conc?.byCounterparty.indexOf(e) ?? 0) + 1}</span>
      ),
    },
    { key: 'name', header: 'Counterparty', render: (e) => <span className="font-medium">{nameOf(e.counterpartyId)}</span> },
    {
      key: 'id',
      header: 'ID',
      render: (e) => <span className="font-mono text-[11px] text-gray-500">{e.counterpartyId}</span>,
    },
    {
      key: 'amount',
      header: 'Deposits',
      align: 'right',
      render: (e) => <Amount value={e.amount} currency={currency} />,
      compareValue: (e) => e.amount,
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (e) => (
        <span className={`font-mono font-bold ${e.sharePercent > 10 ? 'text-danger' : e.sharePercent > 5 ? 'text-warning' : ''}`}>
          {formatPct(e.sharePercent, 2)}
        </span>
      ),
    },
    {
      key: 'flag',
      header: 'Large exposure',
      render: (e) =>
        e.sharePercent > 10 ? (
          <StatusBadge status="Above 10%" tone="danger" />
        ) : e.sharePercent > 5 ? (
          <StatusBadge status="Above 5%" tone="warning" />
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
  ];

  const largeExposures = conc?.byCounterparty.filter((e) => e.sharePercent > 10).length ?? 0;

  return (
    <>
      <ModuleHeader
        title="Concentration & Large Exposures"
        description="Depositor concentration by counterparty — whether a handful of names hold the funding base."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Largest depositor',
            value: formatPct(conc?.largestSharePercent ?? null, 2),
            tone:
              conc?.largestSharePercent == null
                ? 'neutral'
                : conc.largestSharePercent > 10
                  ? 'danger'
                  : conc.largestSharePercent > 5
                    ? 'warning'
                    : 'success',
          },
          { label: 'Top five', value: formatPct(conc?.topFiveSharePercent ?? null, 2) },
          { label: 'Top ten', value: formatPct(conc?.topTenSharePercent ?? null, 2) },
          {
            label: 'Herfindahl index',
            value: conc?.herfindahlIndex === null || conc == null ? '—' : Math.round(conc.herfindahlIndex).toString(),
            tone: band.tone,
          },
        ]}
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['Concentration']}
        elementLabels={{ Concentration: 'depositor concentration' }}
      >
        {conc && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Deposit base</p>
                <p className="mt-1 text-[20px] font-bold text-navy-900">
                  <Amount value={conc.totalDeposits} currency={currency} mono={false} />
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  across {conc.byCounterparty.length} identified counterparties
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Herfindahl</p>
                <p className="mt-1 text-[20px] font-bold text-navy-900">
                  {conc.herfindahlIndex === null ? '—' : Math.round(conc.herfindahlIndex)}
                </p>
                <div className="mt-1">
                  <StatusBadge status={band.label} tone={band.tone} />
                </div>
              </div>

              <div
                className={`rounded-2xl border bg-white p-5 shadow-sm ${largeExposures > 0 ? 'border-danger/30' : 'border-gray-100'}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Above 10% each</p>
                <p className={`mt-1 text-[20px] font-bold ${largeExposures > 0 ? 'text-danger' : 'text-navy-900'}`}>
                  {largeExposures}
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {largeExposures > 0 ? 'single-name funding risk' : 'no single name dominates'}
                </p>
              </div>
            </div>

            {conc.unattributedAmount > 0 && (
              <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                <span className="font-bold">
                  <Amount value={conc.unattributedAmount} currency={currency} /> of deposits carry no counterparty.
                </span>{' '}
                They are held out of the concentration measure rather than dropped or lumped into a single bucket —
                either would distort it, the first by understating the base and the second by inventing a very large
                depositor. Map them on the Counterparties screen and re-run to bring them in.
              </p>
            )}

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Largest depositors
                </h2>
                {conc.byCounterparty.length > limit && (
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + 20)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                  >
                    Show 20 more
                  </button>
                )}
              </div>

              <ResultTable
                rows={rows}
                columns={columns}
                rowKey={(e) => e.counterpartyId}
                emptyMessage="No deposits carry a counterparty, so concentration cannot be measured."
              />

              {conc.byCounterparty.length > rows.length && (
                <p className="mt-3 text-[11px] text-gray-500">
                  Showing {rows.length} of {conc.byCounterparty.length}. The shares and index above are computed over
                  all of them.
                </p>
              )}

              <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
                {methodologyOf(results, 'Concentration')}
              </p>
            </section>
          </>
        )}
      </ResultsFrame>
    </>
  );
}
