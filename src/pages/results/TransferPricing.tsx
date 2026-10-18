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
import {
  CORE_TP_METHODS,
  TP_METHOD_HELP,
  TP_METHOD_LABELS,
  resolveTpMethod,
  type CoreTpMethod,
  type FtpResult,
  type TransferRateLine,
} from '@/engine/ftp';

interface AdjustmentSummary {
  byType: Array<{ type: string; averageBps: number; positions: number }>;
}

/** Drill path: Group → affiliate → business unit → product, then the positions themselves. */
type Level = 'affiliate' | 'unit' | 'product';
interface DrillPath {
  affiliateCode?: string;
  orgUnitCode?: string;
  productCode?: string;
}

interface RollUpRow {
  code: string;
  label: string;
  marginContribution: number;
  positions: number;
  unpriced: number;
}

const shortLabel = (m: CoreTpMethod) => TP_METHOD_LABELS[m].split(' (')[0]!;

function appliedMethod(l: TransferRateLine): CoreTpMethod {
  return l.methodApplied ?? resolveTpMethod(l.method);
}

function levelOf(path: DrillPath): Level | null {
  if (!path.affiliateCode) return 'affiliate';
  if (!path.orgUnitCode) return 'unit';
  if (!path.productCode) return 'product';
  return null;
}

export function TransferPricing() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const ftp = payloadOf<FtpResult>(results, 'TransferPricing');
  const adjustments = payloadOf<AdjustmentSummary>(results, 'TpAdjustments');
  const { data: orgUnits = [] } = useDimensionMembers(
    'OrgUnit',
    run?.affiliateCode && run.affiliateCode !== 'GROUP' ? run.affiliateCode : '',
  );

  const [showUnpriced, setShowUnpriced] = useState(false);
  // A single-affiliate run starts at its business units; a Group run starts at its affiliates.
  const runAffiliate = run?.affiliateCode;
  // The drill path belongs to the run it was chosen on - switching runs starts again from the top.
  const [pathState, setPathState] = useState<{ runId: string | undefined; path: DrillPath } | null>(null);
  const path = pathState && pathState.runId === run?.id ? pathState.path : null;
  const setPath = (next: DrillPath) => setPathState({ runId: run?.id, path: next });
  const drill = useMemo<DrillPath>(
    () => path ?? (runAffiliate && runAffiliate !== 'GROUP' ? { affiliateCode: runAffiliate } : {}),
    [path, runAffiliate],
  );
  const level = levelOf(drill);

  const unitName = (code: string) => orgUnits.find((u) => u.code === code)?.name ?? code;

  const inPath = (l: TransferRateLine, p: DrillPath) =>
    (!p.affiliateCode || l.affiliateCode === p.affiliateCode) &&
    (!p.orgUnitCode || l.orgUnitCode === p.orgUnitCode) &&
    (!p.productCode || l.productCode === p.productCode);

  const scopedLines = useMemo(() => (ftp ? ftp.lines.filter((l) => inPath(l, drill)) : []), [ftp, drill]);

  // Each level's rows are summed from the same reporting-currency line margins the engine's roll-ups sum.
  const rollUpRows = useMemo((): RollUpRow[] => {
    if (!level) return [];
    const key = (l: TransferRateLine) =>
      level === 'affiliate' ? l.affiliateCode : level === 'unit' ? l.orgUnitCode : l.productCode;
    const label = (l: TransferRateLine) =>
      level === 'affiliate' ? l.affiliateCode : level === 'unit' ? unitName(l.orgUnitCode) : l.productClass;
    const rows = new Map<string, RollUpRow>();
    for (const l of scopedLines) {
      const row = rows.get(key(l)) ?? {
        code: key(l),
        label: label(l),
        marginContribution: 0,
        positions: 0,
        unpriced: 0,
      };
      row.positions += 1;
      if (l.marginContributionReporting === null) row.unpriced += 1;
      else row.marginContribution += l.marginContributionReporting;
      rows.set(key(l), row);
    }
    return Array.from(rows.values()).sort((a, b) => b.marginContribution - a.marginContribution);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unitName only reads orgUnits, which is listed
  }, [scopedLines, level, orgUnits]);

  const scopeTotal = rollUpRows.reduce((s, r) => s + r.marginContribution, 0);

  const lines = useMemo(
    () => (showUnpriced ? scopedLines.filter((l) => l.marginContribution === null) : scopedLines),
    [scopedLines, showUnpriced],
  );

  const unpricedCount = ftp?.lines.filter((l) => l.marginContribution === null).length ?? 0;
  const methodsUsed = useMemo(() => {
    const counts = new Map<CoreTpMethod, number>();
    for (const l of ftp?.lines ?? []) counts.set(appliedMethod(l), (counts.get(appliedMethod(l)) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [ftp]);

  const lineControls = useTableControls(lines, 25, [
    'positionId',
    'productClass',
    'orgUnitCode',
    'commonCoaCode',
    'currency',
  ]);

  const drillInto = (code: string) => {
    if (level === 'affiliate') setPath({ affiliateCode: code });
    else if (level === 'unit') setPath({ ...drill, orgUnitCode: code });
    else if (level === 'product') setPath({ ...drill, productCode: code });
  };

  const breadcrumbs: Array<{ label: string; path: DrillPath }> = [];
  if (!run || run.affiliateCode === 'GROUP') breadcrumbs.push({ label: 'Group', path: {} });
  if (drill.affiliateCode)
    breadcrumbs.push({ label: drill.affiliateCode, path: { affiliateCode: drill.affiliateCode } });
  if (drill.orgUnitCode) {
    breadcrumbs.push({
      label: unitName(drill.orgUnitCode),
      path: { affiliateCode: drill.affiliateCode, orgUnitCode: drill.orgUnitCode },
    });
  }
  if (drill.productCode) {
    const product = scopedLines[0]?.productClass ?? drill.productCode;
    breadcrumbs.push({ label: product, path: drill });
  }

  // Compare methods: the selected product (the drilled-into product, else the first one in scope).
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of scopedLines) if (!seen.has(l.productCode)) seen.set(l.productCode, l.productClass);
    return Array.from(seen.entries()).map(([code, name]) => ({ code, name }));
  }, [scopedLines]);
  const [compareProduct, setCompareProduct] = useState<string | null>(null);
  const comparedCode =
    drill.productCode ??
    (compareProduct && productOptions.some((p) => p.code === compareProduct)
      ? compareProduct
      : productOptions[0]?.code) ??
    null;
  const comparison = useMemo(() => {
    if (!comparedCode) return null;
    const productLines = scopedLines.filter((l) => l.productCode === comparedCode);
    const weightOf = (l: TransferRateLine) => Math.abs(l.balanceReporting ?? l.balance ?? 0);
    const rows = CORE_TP_METHODS.map((m) => {
      let weighted = 0;
      let weight = 0;
      for (const l of productLines) {
        const rate = l.rateByMethod?.[m];
        if (rate === null || rate === undefined) continue;
        weighted += rate * weightOf(l);
        weight += weightOf(l);
      }
      return { method: m, rate: weight > 0 ? weighted / weight : null, coverage: weight };
    });
    const total = productLines.reduce((s, l) => s + weightOf(l), 0);
    let appliedWeighted = 0;
    let appliedWeight = 0;
    for (const l of productLines) {
      if (l.baseTransferRatePercent === null) continue;
      appliedWeighted += l.baseTransferRatePercent * weightOf(l);
      appliedWeight += weightOf(l);
    }
    const applied = appliedWeight > 0 ? appliedWeighted / appliedWeight : null;
    const methods = Array.from(new Set(productLines.map(appliedMethod)));
    return { rows, total, applied, methods, hasRates: productLines.some((l) => l.rateByMethod) };
  }, [comparedCode, scopedLines]);

  const levelHeader = level === 'affiliate' ? 'Affiliate' : level === 'unit' ? 'Business unit' : 'Product';

  const unitColumns: ResultColumn<RollUpRow>[] = [
    {
      key: 'unit',
      header: levelHeader,
      render: (r) => (
        <button
          type="button"
          onClick={() => drillInto(r.code)}
          className="text-left font-medium text-navy-700 hover:text-navy-900 hover:underline"
          title={`Drill into ${r.label}`}
        >
          {r.label} →
        </button>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      render: (r) => <span className="font-mono text-[12px] text-gray-500">{r.code}</span>,
    },
    {
      key: 'n',
      header: 'Positions',
      align: 'right',
      render: (r) => (
        <span className="font-mono">
          {r.positions}
          {r.unpriced > 0 ? ` (${r.unpriced} unpriced)` : ''}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'FTP margin',
      align: 'right',
      render: (r) => <Amount value={r.marginContribution} currency={currency} colorBySign />,
      compareValue: (r) => r.marginContribution,
    },
    {
      key: 'share',
      header: 'Share of level',
      align: 'right',
      render: (r) => (
        <span className="font-mono">
          {scopeTotal !== 0 ? formatPct((r.marginContribution / scopeTotal) * 100, 1) : '-'}
        </span>
      ),
    },
  ];

  const lineColumns: ResultColumn<TransferRateLine>[] = [
    { key: 'product', header: 'Product', render: (l) => l.productClass },
    { key: 'pos', header: 'Position', render: (l) => <span className="font-mono text-[12px]">{l.positionId}</span> },
    { key: 'unit', header: 'Unit', render: (l) => <span className="text-[12px]">{unitName(l.orgUnitCode)}</span> },
    { key: 'ccy', header: 'Ccy', render: (l) => <span className="font-mono text-[12px]">{l.currency}</span> },
    {
      key: 'method',
      header: 'Method',
      render: (l) => (
        <span className="text-[12px] text-gray-600" title={l.pricingNote ?? TP_METHOD_HELP[appliedMethod(l)]}>
          {shortLabel(appliedMethod(l))}
          {l.pricingNote && <span className="ml-1 text-warning">*</span>}
        </span>
      ),
    },
    {
      key: 'tenor',
      header: 'Tenor',
      align: 'right',
      render: (l) => (
        <span
          className="font-mono text-[12px]"
          title={l.tenorBasis === 'Behavioural' ? 'Behavioural tenor' : 'Contractual tenor'}
        >
          {l.tenorDays}d{l.tenorBasis === 'Behavioural' ? ' (beh.)' : ''}
        </span>
      ),
    },
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
          <span className="text-gray-300">-</span>
        ) : (
          <span
            className="font-mono"
            title={l.adjustments
              .map((a) => `${a.type}: ${a.bps.toFixed(1)}bp${a.detail ? ` (${a.detail})` : ''}`)
              .join('\n')}
          >
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
  ];

  return (
    <>
      <ModuleHeader
        title="Funds Transfer Pricing"
        description="Margin attributed to the desk that earned it, with the transfer rate decomposed into curve plus named add-ons."
        about={ftp?.methodology}
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Total FTP margin',
            value: ftp
              ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(ftp.totalMarginContribution)
              : '-',
            tone: (ftp?.totalMarginContribution ?? 0) < 0 ? 'danger' : 'success',
            about:
              'Net margin earned across the whole book once every priced position has been charged or credited its internal transfer rate.',
          },
          {
            label: 'Methods applied',
            value: methodsUsed.length > 0 ? methodsUsed.map(([m]) => shortLabel(m)).join(', ') : '-',
            about:
              'The transfer-pricing calculation actually run on each line, as assigned by the FTP rule (legacy method names price as repricing term).',
          },
          {
            label: 'Unpriced',
            value: String(unpricedCount),
            tone: unpricedCount > 0 ? 'warning' : 'success',
            about:
              'Positions with no matching curve point, pool or external rate - reported here rather than silently priced at zero.',
          },
          {
            label: 'Balance unpriced',
            value: ftp ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(ftp.unpriced) : '-',
            tone: (ftp?.unpriced ?? 0) > 0 ? 'warning' : 'success',
            about:
              'Total balance sitting in unpriced positions - a data or configuration gap worth closing, not a number quietly left out of the total.',
          },
        ]}
        actions={
          <Link
            href="/rules"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:bg-gray-50 transition-colors"
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
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
                  FTP margin drill-down
                  <InfoButton label="How margin is attributed">
                    Each position's margin is attributed to its own product, business unit and affiliate, and converted
                    to the run's reporting currency before it is summed - the Group total is the sum of every affiliate.
                    Click a row to drill from Group to affiliate, business unit, product and finally the positions
                    themselves; the detail table below follows the same selection. A negative Treasury figure is
                    expected, since Treasury funds the balance sheet at cost.
                  </InfoButton>
                </h2>
                <nav aria-label="Drill path" className="flex flex-wrap items-center gap-1 text-[12px]">
                  {breadcrumbs.map((b, i) => (
                    <span key={`${b.label}-${i}`} className="flex items-center gap-1">
                      {i > 0 && <span className="text-gray-300">/</span>}
                      {i === breadcrumbs.length - 1 ? (
                        <span className="font-bold text-navy-900">{b.label}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPath(b.path)}
                          className="font-bold text-navy-700 hover:underline"
                        >
                          {b.label}
                        </button>
                      )}
                    </span>
                  ))}
                </nav>
              </div>
              {level ? (
                <ResultTable
                  rows={rollUpRows}
                  columns={unitColumns}
                  rowKey={(r) => r.code}
                  emptyMessage="No positions at this level."
                />
              ) : (
                <p className="text-[12px] text-gray-500">
                  Showing the {scopedLines.length} position{scopedLines.length === 1 ? '' : 's'} of this product below.
                </p>
              )}
            </section>

            {comparison && (
              <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
                    Compare methods
                    <InfoButton label="What this compares">
                      The base transfer rate this product would carry under each method, balance-weighted across its
                      positions - all read off the same curve and the same cashflows. The method the FTP rule assigns is
                      the one actually charged; the others show what changing the rule would do.
                    </InfoButton>
                  </h2>
                  {!drill.productCode && productOptions.length > 0 && (
                    <select
                      value={comparedCode ?? ''}
                      onChange={(e) => setCompareProduct(e.target.value)}
                      aria-label="Product to compare"
                      className="rounded border border-gray-200 px-2 py-1 text-[12px]"
                    >
                      {productOptions.map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {comparison.hasRates ? (
                  <table className="mt-3 w-full max-w-2xl text-[13px]">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
                        <th className="py-1.5 pr-3 font-bold">Method</th>
                        <th className="py-1.5 pr-3 text-right font-bold">Base rate</th>
                        <th className="py-1.5 text-right font-bold">vs applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.map((r) => {
                        const isApplied = comparison.methods.includes(r.method);
                        return (
                          <tr
                            key={r.method}
                            className={`border-b border-gray-100 ${isApplied ? 'bg-navy-50/40 font-bold text-navy-900' : ''}`}
                          >
                            <td className="py-1.5 pr-3" title={TP_METHOD_HELP[r.method]}>
                              {shortLabel(r.method)}
                              {isApplied && (
                                <span className="ml-2 text-[11px] font-bold uppercase text-success">applied</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-mono">{formatPct(r.rate, 3)}</td>
                            <td className="py-1.5 text-right font-mono">
                              {r.rate === null || comparison.applied === null
                                ? '-'
                                : formatBps((r.rate - comparison.applied) * 100)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-2 text-[12px] text-gray-500">
                    This run pre-dates the method comparison - re-run to see the rate under each method.
                  </p>
                )}
              </section>
            )}

            {adjustments && adjustments.byType.length > 0 && (
              <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
                  Adjustment stack
                  <InfoButton label="About the adjustment stack">
                    Each add-on is a separate, named component, so treasury can see what the liquidity premium, currency
                    basis or index basis costs the lending desk. {methodologyOf(results, 'TpAdjustments')}
                  </InfoButton>
                </h2>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {adjustments.byType.map((a) => (
                    <div key={a.type} className="rounded-lg bg-gray-50 p-4">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        {a.type.replace(/([A-Z])/g, ' $1').trim()}
                      </dt>
                      <dd className="mt-1 font-mono text-[18px] font-bold text-navy-900">{formatBps(a.averageBps)}</dd>
                      <dd className="text-[11px] text-gray-500">
                        average across {a.positions} position{a.positions === 1 ? '' : 's'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section className="table-datagrid-container">
              <div className="border-b border-gray-100 bg-white/50 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
                    Transfer rate detail
                    <InfoButton label="How to read this table">
                      Filtered to the drill-down selection above. The base rate comes from the method shown, read off
                      the yield curve over the position's cashflows; add-ons stack on top by named type; the all-in rate
                      is what the position is actually charged or credited. An asterisk means the method could not be
                      applied as configured - hover for why. Expand a row to see the full breakdown.
                    </InfoButton>
                  </h2>
                  {unpricedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowUnpriced((v) => !v)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] font-bold text-navy-900 hover:border-navy-700"
                    >
                      {showUnpriced ? 'Show all positions' : 'Show only unpriced'}
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
  const applied = appliedMethod(line);
  return (
    <dl className="space-y-1 text-[12px]">
      <div className="flex justify-between border-b border-gray-100 pb-1">
        <dt className="text-gray-500">
          Method: {TP_METHOD_LABELS[applied]}
          {line.method !== applied && <span className="ml-1 text-gray-400">(configured: {line.method})</span>}
          {line.poolId && <span className="ml-1 font-mono text-gray-400">pool {line.poolId}</span>}
        </dt>
        <dd className="font-mono">
          {line.tenorDays}d {line.tenorBasis.toLowerCase()}
        </dd>
      </div>
      {line.pricingNote && <p className="text-warning">{line.pricingNote}</p>}
      <div className="flex justify-between">
        <dt className="text-gray-500">Base curve reading</dt>
        <dd className="font-mono">{formatPct(line.baseTransferRatePercent, 3)}</dd>
      </div>
      {line.adjustments.length === 0 && <p className="text-gray-400">No adjustment rule matched this position.</p>}
      {line.adjustments.map((a) => (
        <div key={a.ruleId} className="flex justify-between">
          <dt className="text-gray-500">
            {a.type.replace(/([A-Z])/g, ' $1').trim()}
            <span className="ml-1 font-mono text-gray-400">{a.ruleId}</span>
            {a.detail && <span className="ml-1 text-gray-400">- {a.detail}</span>}
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
