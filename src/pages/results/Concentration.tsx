import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
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

const TONE_TEXT: Record<'success' | 'warning' | 'danger', string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

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
            about: 'Share of total deposits held by the single largest mapped counterparty — the biggest single funding-concentration vulnerability.',
          },
          { label: 'Top five', value: formatPct(conc?.topFiveSharePercent ?? null, 2), about: 'Combined share of total deposits held by the five largest counterparties.' },
          { label: 'Top ten', value: formatPct(conc?.topTenSharePercent ?? null, 2), about: 'Combined share of total deposits held by the ten largest counterparties.' },
          {
            label: 'Herfindahl index',
            value: conc?.herfindahlIndex === null || conc == null ? '—' : Math.round(conc.herfindahlIndex).toString(),
            tone: band.tone,
            about: 'Sum of every counterparty’s squared percentage share. Below 1,500 reads as diversified, 1,500–2,500 as moderately concentrated, above 2,500 as highly concentrated.',
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
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Herfindahl index</p>
                <p className={`mt-1 text-[20px] font-bold ${conc.herfindahlIndex === null ? 'text-navy-900' : TONE_TEXT[band.tone]}`}>
                  {conc.herfindahlIndex === null ? '—' : Math.round(conc.herfindahlIndex)}
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Above 10% each</p>
                <p className={`mt-1 text-[20px] font-bold ${largeExposures > 0 ? 'text-danger' : 'text-navy-900'}`}>
                  {largeExposures}
                </p>
              </div>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Largest depositors
                  <InfoButton label="How exposures are flagged">
                    Deposits with no counterparty mapping are excluded here and reported separately, rather than
                    dropped or lumped into an average — either would distort the shares. A depositor above 10% is
                    flagged as a large exposure; above 5% as worth monitoring.
                  </InfoButton>
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
            </section>
          </>
        )}
      </ResultsFrame>
    </>
  );
}
