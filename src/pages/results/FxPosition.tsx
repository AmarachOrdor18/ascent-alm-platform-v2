import { useMemo, type ReactNode } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { formatPct } from '@/lib/format';
import type { FxPositionLine, FxPositionResult } from '@/engine/profitability';

const SINGLE_CURRENCY_LIMIT_PCT = 10;
const AGGREGATE_LIMIT_PCT = 20;

export function FxPosition() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const fx = payloadOf<FxPositionResult>(results, 'FxPosition');

  const breaches = useMemo(
    () =>
      (fx?.lines ?? []).filter(
        (l) => l.netOpenPositionPercentOfCapital !== null && Math.abs(l.netOpenPositionPercentOfCapital) > SINGLE_CURRENCY_LIMIT_PCT,
      ),
    [fx],
  );

  const foreign = useMemo(() => (fx?.lines ?? []).filter((l) => l.currency !== currency), [fx, currency]);
  const foreignLiabilities = foreign.reduce((s, l) => s + l.liabilities, 0);
  const foreignAssets = foreign.reduce((s, l) => s + l.assets, 0);

  const columns: ResultColumn<FxPositionLine>[] = [
    {
      key: 'currency',
      header: 'Currency',
      render: (l) => (
        <span className="font-mono font-bold">
          {l.currency}
          {l.currency === currency && <span className="ml-2 text-[10px] font-normal text-gray-400">functional</span>}
        </span>
      ),
    },
    { key: 'assets', header: 'Assets', align: 'right', render: (l) => <Amount value={l.assets} currency={currency} /> },
    {
      key: 'liabilities',
      header: 'Liabilities',
      align: 'right',
      render: (l) => <Amount value={l.liabilities} currency={currency} />,
    },
    {
      key: 'nop',
      header: 'Net open position',
      align: 'right',
      render: (l) => <Amount value={l.netOpenPosition} currency={currency} colorBySign />,
      compareValue: (l) => l.netOpenPosition,
    },
    {
      key: 'pct',
      header: '% of capital',
      align: 'right',
      render: (l) => (
        <span
          className={`font-mono font-bold ${
            l.netOpenPositionPercentOfCapital !== null &&
            Math.abs(l.netOpenPositionPercentOfCapital) > SINGLE_CURRENCY_LIMIT_PCT
              ? 'text-danger'
              : ''
          }`}
        >
          {formatPct(l.netOpenPositionPercentOfCapital, 2)}
        </span>
      ),
    },
    {
      key: 'direction',
      header: 'Position',
      render: (l) =>
        l.netOpenPosition > 0 ? (
          <StatusBadge status="Long" tone="neutral" />
        ) : l.netOpenPosition < 0 ? (
          <StatusBadge status="Short" tone="warning" />
        ) : (
          <StatusBadge status="Square" tone="success" />
        ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="FX Position & Cross-Currency Funding"
        description="Net open position per currency against capital, and how much of the book is funded in a foreign currency."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Aggregate NOP',
            value: fx ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(fx.aggregateNetOpenPosition) : '-',
            about: 'Aggregate Net Open Position: the sum of absolute net positions across every non-reporting currency - the conservative measure, not long netted against short.',
          },
          {
            label: 'Aggregate % of capital',
            value: formatPct(fx?.aggregatePercentOfCapital ?? null, 2),
            tone:
              fx?.aggregatePercentOfCapital == null
                ? 'neutral'
                : Math.abs(fx.aggregatePercentOfCapital) > AGGREGATE_LIMIT_PCT
                  ? 'danger'
                  : 'success',
            about: 'The aggregate net open position expressed as a share of capital - the standard way FX exposure is sized against the balance sheet that has to absorb it.',
          },
          {
            label: 'Currencies held',
            value: fx ? String(fx.lines.length) : '-',
            about: "How many distinct currencies this run's positions are denominated in.",
          },
          {
            label: `Above ${SINGLE_CURRENCY_LIMIT_PCT}% singly`,
            value: String(breaches.length),
            tone: breaches.length > 0 ? 'danger' : 'success',
            about: `Currencies whose individual net open position exceeds ${SINGLE_CURRENCY_LIMIT_PCT}% of capital on its own, regardless of the aggregate figure.`,
          },
        ]}
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['FxPosition']}
        elementLabels={{ FxPosition: 'the FX position' }}
      >
        {fx && (
          <>
            {breaches.length > 0 && (
              <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-5">
                <div className="mb-2 flex items-center gap-2">
                  <StatusBadge status={`${breaches.length} above limit`} tone="danger" />
                  <span className="text-[12px] font-bold text-navy-900">
                    Single-currency exposure above {SINGLE_CURRENCY_LIMIT_PCT}% of capital
                  </span>
                  <InfoButton label="Where these limits come from">
                    The {SINGLE_CURRENCY_LIMIT_PCT}% and {AGGREGATE_LIMIT_PCT}% figures are the common supervisory
                    shape across the footprint, not a limit configured for this affiliate. Set the real ones on
                    Limits & Breaches once that screen is built, and this will compare against those instead.
                  </InfoButton>
                </div>
                <ul className="space-y-1 text-[11px] text-gray-700">
                  {breaches.map((b) => (
                    <li key={b.currency}>
                      <span className="font-mono font-bold">{b.currency}</span> at{' '}
                      <span className="font-mono">{formatPct(b.netOpenPositionPercentOfCapital, 2)}</span> -{' '}
                      {b.netOpenPosition > 0 ? 'long' : 'short'}{' '}
                      <Amount value={Math.abs(b.netOpenPosition)} currency={currency} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-1.5">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Net open position by currency
                </h2>
                <InfoButton label="Methodology">{methodologyOf(results, 'FxPosition')}</InfoButton>
              </div>
              <ResultTable
                rows={fx.lines}
                columns={columns}
                rowKey={(l) => l.currency}
                emptyMessage="This run holds no positions, so there is no FX exposure to report."
              />
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-1.5">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Cross-currency funding
                </h2>
                <InfoButton label="Why this matters">
                  How much of the balance sheet sits in a currency other than {currency}. An affiliate that funds in
                  dollars and lends locally carries the mismatch even when its net open position looks modest,
                  because the funding can be withdrawn in a currency it does not generate.
                </InfoButton>
              </div>

              <dl className="grid grid-cols-2 gap-4 text-[12px] md:grid-cols-4">
                <Stat label="Foreign-currency assets" value={<Amount value={foreignAssets} currency={currency} />} />
                <Stat
                  label="Foreign-currency liabilities"
                  value={<Amount value={foreignLiabilities} currency={currency} />}
                />
                <Stat
                  label="Funding reliance"
                  value={
                    <span className="font-mono font-bold">
                      {foreignAssets + foreignLiabilities > 0
                        ? formatPct(
                            (foreignLiabilities /
                              (fx.lines.reduce((s, l) => s + l.liabilities, 0) || 1)) *
                              100,
                            1,
                          )
                        : '-'}
                    </span>
                  }
                />
                <Stat
                  label="Net foreign funding"
                  value={<Amount value={foreignAssets - foreignLiabilities} currency={currency} colorBySign />}
                />
              </dl>

              {foreignLiabilities > foreignAssets && (
                <p className="mt-4 rounded border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] leading-relaxed text-navy-900">
                  Foreign-currency liabilities exceed foreign-currency assets by{' '}
                  <Amount value={foreignLiabilities - foreignAssets} currency={currency} />. That surplus is funding
                  local-currency lending, so a depreciation raises the cost of the funding without raising what the
                  assets earn.
                </p>
              )}
            </section>
          </>
        )}
      </ResultsFrame>
    </>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
