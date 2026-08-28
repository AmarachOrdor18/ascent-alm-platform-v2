import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { TableToolbar, TablePagination, useTableControls } from '@/components/ui/TableControls';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { useDimensionMembers } from '@/lib/hooks';
import { formatBps, formatPct } from '@/lib/format';
import type { FtpResult, TransferRateLine } from '@/engine/ftp';

interface AdjustmentSummary {
  byType: Array<{ type: string; averageBps: number; positions: number }>;
}

export function TransferPricing() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const ftp = payloadOf<FtpResult>(results, 'TransferPricing');
  const adjustments = payloadOf<AdjustmentSummary>(results, 'TpAdjustments');
  const { data: orgUnits = [] } = useDimensionMembers('OrgUnit');

  const [showUnpriced, setShowUnpriced] = useState(false);

  const nameOf = (code: string) => orgUnits.find((u) => u.code === code)?.name ?? code;

  const lines = useMemo(() => {
    if (!ftp) return [];
    return showUnpriced ? ftp.lines.filter((l) => l.marginContribution === null) : ftp.lines;
  }, [ftp, showUnpriced]);

  const unpricedCount = ftp?.lines.filter((l) => l.marginContribution === null).length ?? 0;

  const lineControls = useTableControls(lines, 25, ['positionId', 'productClass', 'orgUnitCode', 'commonCoaCode', 'currency']);

  const unitColumns: ResultColumn<FtpResult['byOrgUnit'][number]>[] = [
    { key: 'unit', header: 'Business unit', render: (r) => <span className="font-medium">{nameOf(r.orgUnitCode)}</span> },
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-[11px] text-gray-500">{r.orgUnitCode}</span> },
    {
      key: 'margin',
      header: 'FTP margin',
      align: 'right',
      render: (r) => <Amount value={r.marginContribution} currency={currency} colorBySign />,
      compareValue: (r) => r.marginContribution,
    },
    {
      key: 'share',
      header: 'Share of total',
      align: 'right',
      render: (r) => (
        <span className="font-mono">
          {ftp && ftp.totalMarginContribution !== 0
            ? formatPct((r.marginContribution / ftp.totalMarginContribution) * 100, 1)
            : '—'}
        </span>
      ),
    },
  ];

  const lineColumns: ResultColumn<TransferRateLine>[] = [
    { key: 'product', header: 'Product', render: (l) => l.productClass },
    { key: 'coa', header: 'Common COA', render: (l) => <span className="font-mono text-[11px]">{l.commonCoaCode}</span> },
    { key: 'unit', header: 'Unit', render: (l) => <span className="text-[11px]">{nameOf(l.orgUnitCode)}</span> },
    { key: 'ccy', header: 'Ccy', render: (l) => <span className="font-mono text-[11px]">{l.currency}</span> },
    {
      key: 'base',
      header: 'Base rate',
      align: 'right',
      render: (l) => <span className="font-mono">{formatPct(l.baseTransferRatePercent, 2)}</span>,
    },
    {
      key: 'adj',
      header: 'Add-ons',
      align: 'right',
      render: (l) =>
        l.adjustments.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className="font-mono" title={l.adjustments.map((a) => `${a.type}: ${a.bps}bp`).join('\n')}>
            {formatBps(l.totalAdjustmentBps)}
          </span>
        ),
    },
    {
      key: 'allIn',
      header: 'All-in rate',
      align: 'right',
      render: (l) => <span className="font-mono font-bold">{formatPct(l.allInTransferRatePercent, 2)}</span>,
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      render: (l) =>
        l.marginContribution === null ? (
          <StatusBadge status="Unpriced" tone="warning" />
        ) : (
          <Amount value={l.marginContribution} currency={l.currency} colorBySign />
        ),
    },
    { key: 'method', header: 'Method', render: (l) => <span className="text-[11px] text-gray-500">{l.method}</span> },
  ];

  return (
    <>
      <ModuleHeader
        title="Funds Transfer Pricing"
        description="Margin attributed to the desk that earned it, with the transfer rate decomposed into curve plus named add-ons."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Total FTP margin',
            value: ftp ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(ftp.totalMarginContribution) : '—',
            tone: (ftp?.totalMarginContribution ?? 0) < 0 ? 'danger' : 'success',
            about: 'Net margin earned across the whole book once every priced position has been charged or credited its internal transfer rate.',
          },
          { label: 'Priced positions', value: ftp ? String(ftp.lines.length - unpricedCount) : '—', about: 'Positions that matched a yield-curve point and could be charged a transfer rate.' },
          {
            label: 'Unpriced',
            value: String(unpricedCount),
            tone: unpricedCount > 0 ? 'warning' : 'success',
            about: 'Positions with no matching curve point or external rate — reported here rather than silently priced at zero.',
          },
          {
            label: 'Balance unpriced',
            value: ftp ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(ftp.unpriced) : '—',
            tone: (ftp?.unpriced ?? 0) > 0 ? 'warning' : 'success',
            about: 'Total balance sitting in unpriced positions — a data or configuration gap worth closing, not a number quietly left out of the total.',
          },
        ]}
        actions={
          <Link
            href="/rules"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:bg-gray-50 transition-colors"
          >
            Configure FTP Rules
          </Link>
        }
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['TransferPricing']}
        elementLabels={{ TransferPricing: 'transfer pricing' }}
      >
        {ftp && (
          <>
            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Margin by business unit
                <InfoButton label="How margin is attributed">
                  Each position's margin is attributed to its own organisational unit — a negative Treasury figure is
                  expected, since Treasury funds the balance sheet at cost rather than earning a lending spread.
                </InfoButton>
              </h2>
              <p className="mb-4 text-[11px] text-gray-500">
                Assets are charged the transfer rate and keep the excess of their external rate; liabilities are
                credited it and keep the difference against their external cost.
              </p>
              <ResultTable
                rows={ftp.byOrgUnit}
                columns={unitColumns}
                rowKey={(r) => r.orgUnitCode}
                emptyMessage="No priced positions, so there is nothing to attribute."
              />
            </section>

            {adjustments && adjustments.byType.length > 0 && (
              <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                  Adjustment stack
                </h2>
                <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                  Each add-on is a separate, named component rather than one opaque spread, so treasury can see what
                  the liquidity premium costs the lending desk.
                </p>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {adjustments.byType.map((a) => (
                    <div key={a.type} className="rounded-lg bg-gray-50 p-4">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {a.type.replace(/([A-Z])/g, ' $1').trim()}
                      </dt>
                      <dd className="mt-1 font-mono text-[18px] font-bold text-navy-900">
                        {formatBps(a.averageBps)}
                      </dd>
                      <dd className="text-[10px] text-gray-500">
                        average across {a.positions} position{a.positions === 1 ? '' : 's'}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 border-t border-gray-50 pt-3 text-[11px] leading-relaxed text-gray-500">
                  {methodologyOf(results, 'TpAdjustments')}
                </p>
              </section>
            )}

            <section className="table-datagrid-container">
              <div className="border-b border-gray-100 bg-white/50 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                    Transfer rate detail
                    <InfoButton label="How to read this table">
                      The base rate is read off the yield curve at the position's tenor; add-ons stack on top by named
                      type (liquidity premium, basis risk, and so on); the all-in rate is what the position is
                      actually charged or credited. Expand a row to see the full breakdown. Attribution and totals
                      above are computed over every position, not just the page shown here.
                    </InfoButton>
                  </h2>
                  {unpricedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowUnpriced((v) => !v)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                    >
                      {showUnpriced ? 'Show all positions' : `Show the ${unpricedCount} unpriced`}
                    </button>
                  )}
                </div>
                <TableToolbar
                  searchValue={lineControls.search}
                  onSearchChange={lineControls.setSearch}
                  exportData={() => lines}
                  exportFilename="transfer-rate-detail"
                  density={lineControls.density}
                  onDensityChange={lineControls.setDensity}
                />
              </div>

              <ResultTable
                rows={lineControls.paged}
                columns={lineColumns}
                rowKey={(l) => l.positionId}
                emptyMessage="Nothing to show."
                renderDetail={(l) => <AdjustmentDetail line={l} />}
              />

              <TablePagination
                currentPage={lineControls.page}
                totalItems={lineControls.totalItems}
                pageSize={lineControls.pageSize}
                onPageChange={lineControls.setPage}
              />
            </section>
          </>
        )}
      </ResultsFrame>
    </>
  );
}

function AdjustmentDetail({ line }: { line: TransferRateLine }): ReactNode {
  if (line.adjustments.length === 0) {
    return <p className="text-[11px] text-gray-500">No adjustment rule matched this position&apos;s common-COA code.</p>;
  }
  return (
    <dl className="space-y-1 text-[11px]">
      <div className="flex justify-between border-b border-gray-100 pb-1">
        <dt className="text-gray-500">Base curve reading</dt>
        <dd className="font-mono">{formatPct(line.baseTransferRatePercent, 3)}</dd>
      </div>
      {line.adjustments.map((a) => (
        <div key={a.ruleId} className="flex justify-between">
          <dt className="text-gray-500">
            {a.type.replace(/([A-Z])/g, ' $1').trim()}
            <span className="ml-1 font-mono text-gray-400">{a.ruleId}</span>
          </dt>
          <dd className="font-mono">{formatBps(a.bps)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-100 pt-1 font-bold text-navy-900">
        <dt>All-in transfer rate</dt>
        <dd className="font-mono">{formatPct(line.allInTransferRatePercent, 3)}</dd>
      </div>
    </dl>
  );
}
