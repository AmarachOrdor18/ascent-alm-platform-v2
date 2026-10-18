import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { RatioChart } from '@/components/ui/RatioChart';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf } from '@/lib/resultHooks';
import { useAffiliates, useDimensionMembers } from '@/lib/hooks';
import { repository } from '@/store/repositoryInstance';
import { cn } from '@/lib/cn';
import { formatAmount, formatPct } from '@/lib/format';
import {
  layersFor,
  type ProfitabilityLayersResult,
  type ProfitabilityLine,
  type ProfitabilityNode,
} from '@/engine/profitabilityLayers';
import type { ProfitabilityResult, ProfitabilitySegment } from '@/engine/profitability';
import type { CurrencyCode, DimensionType, ProcessRun } from '@/engine/types';

export function Profitability() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const p = payloadOf<ProfitabilityResult>(results, 'ProfitabilityRatios');
  const layers = payloadOf<ProfitabilityLayersResult>(results, 'ProfitabilityLayers');
  const group = layers ? layers.nodes[layers.rootId] : undefined;

  return (
    <>
      <ModuleHeader
        title="Profitability"
        description="Fully-loaded profitability - client margin, funding cost (FTP), operating expense, expected credit loss and capital charge - from Group down to each position, plus the margin and asset-quality ratios."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Risk-adjusted profit',
            value: group ? formatAmount(group.riskAdjustedProfit, currency) : '-',
            tone: !group ? 'neutral' : group.riskAdjustedProfit >= 0 ? 'success' : 'danger',
            about:
              'Annualised profit after funding cost, operating expense, expected credit loss and the capital charge, for the whole run.',
          },
          {
            label: 'RAROC',
            value: formatPct(group?.rarocPercent ?? null, 1),
            about:
              'Risk-adjusted return on capital: profit before the capital charge, after tax, divided by the capital allocated.',
          },
          {
            label: 'Net interest margin',
            value: formatPct(p?.netInterestMarginPercent ?? null, 2),
            about: 'Interest income less interest expense, as a share of total assets - a core profitability measure.',
          },
          {
            label: 'NPL ratio',
            value: formatPct(p?.nplRatioPercent ?? null, 2),
            tone:
              p?.nplRatioPercent == null
                ? 'neutral'
                : p.nplRatioPercent > 5
                  ? 'danger'
                  : p.nplRatioPercent > 3
                    ? 'warning'
                    : 'success',
            about: 'Non-Performing Loan ratio: share of the loan book classified Substandard, Doubtful or Loss.',
          },
        ]}
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        {run && <LayersSection run={run} layers={layers} />}
        {p ? (
          <RatiosSection p={p} currency={currency} run={run} />
        ) : (
          run && (
            <p className="rounded-lg border border-gray-100 bg-white px-4 py-3 text-[12px] text-gray-500">
              This run did not compute the profitability ratios (NIM, NPL, coverage) - tick &ldquo;Profitability
              Ratios&rdquo; on Run now to include them.
            </p>
          )
        )}
      </ResultsFrame>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Multi-layer profitability
// ─────────────────────────────────────────────────────────────────────────

const RULE_LINKS = [
  { label: 'Operating cost allocation', href: '/rules/cost-allocation' },
  { label: 'Expected credit loss', href: '/rules/credit-loss' },
  { label: 'Capital charge', href: '/rules/capital' },
];

function LayersSection({ run, layers }: { run: ProcessRun; layers: ProfitabilityLayersResult | null }) {
  if (!run.elements.includes('ProfitabilityLayers')) {
    return (
      <EmptyState title="This run did not compute multi-layer profitability" className="mb-6">
        <p>
          Fully-loaded profitability needs three approved rules, then a run with the &ldquo;Multi-layer
          Profitability&rdquo; element ticked:
        </p>
        <ol className="mx-auto mt-2 max-w-md list-decimal space-y-1 pl-5 text-left">
          {RULE_LINKS.map((l) => (
            <li key={l.href}>
              Define an{' '}
              <Link href={l.href} className="font-bold text-navy-700 underline">
                {l.label}
              </Link>{' '}
              rule.
            </li>
          ))}
          <li>
            Have a second user approve each one in{' '}
            <Link href="/controls" className="font-bold text-navy-700 underline">
              Approvals
            </Link>
            .
          </li>
          <li>
            Execute a run from{' '}
            <Link href="/execution" className="font-bold text-navy-700 underline">
              Run now
            </Link>{' '}
            (the Full ALCO Pack includes it). An FTP rule and an active yield curve price the funding layer.
          </li>
        </ol>
      </EmptyState>
    );
  }
  if (!layers) {
    const failure = run.errorLog.find((e) => e.code === 'ProfitabilityLayers_FAILED');
    return (
      <EmptyState title="Multi-layer profitability did not compute for this run" className="mb-6">
        <p className="text-danger">{failure?.message ?? 'No result was recorded for this element.'}</p>
        <p className="mt-2">
          Set up the missing rule(s):{' '}
          {RULE_LINKS.map((l, i) => (
            <span key={l.href}>
              {i > 0 && ' · '}
              <Link href={l.href} className="font-bold text-navy-700 underline">
                {l.label}
              </Link>
            </span>
          ))}
          , approve them, then re-run from{' '}
          <Link href="/execution" className="font-bold text-navy-700 underline">
            Run now
          </Link>
          .
        </p>
      </EmptyState>
    );
  }
  return <LayersExplorer layers={layers} />;
}

/** Display names for codes, across every affiliate (a Group run spans them all). */
function useNames(dimension: DimensionType) {
  const { data = [] } = useQuery({
    queryKey: ['dimension', dimension, 'all-names'],
    queryFn: () => repository.listDimensionMembers(dimension),
  });
  return useMemo(() => new Map(data.map((m) => [m.code, m.name])), [data]);
}

type View = 'product' | 'customer';

const LEVEL_LABEL: Record<ProfitabilityNode['level'], string> = {
  Group: 'Group',
  Affiliate: 'Affiliate',
  BusinessUnit: 'Business unit',
  Product: 'Product',
  Customers: 'All customers',
  Customer: 'Customer',
};

function LayersExplorer({ layers }: { layers: ProfitabilityLayersResult }) {
  const currency = layers.currency;
  const [view, setView] = useState<View>('product');
  const rootId = view === 'product' ? layers.rootId : layers.customerRootId;
  const [currentId, setCurrentId] = useState<string>(layers.rootId);
  const node = layers.nodes[currentId] ?? layers.nodes[rootId]!;

  const { data: affiliates = [] } = useAffiliates();
  const orgNames = useNames('OrgUnit');
  const productNames = useNames('Product');
  const customerNames = useNames('Counterparty');

  const nameOf = (n: ProfitabilityNode): string => {
    switch (n.level) {
      case 'Affiliate':
        return affiliates.find((a) => a.code === n.key)?.name ?? n.key;
      case 'BusinessUnit':
        return orgNames.get(n.key) ?? n.key;
      case 'Product':
        return productNames.get(n.key) ?? n.key;
      case 'Customer':
        return customerNames.get(n.key) ?? n.key;
      default:
        return n.key;
    }
  };

  const trail = useMemo(() => {
    const out: ProfitabilityNode[] = [];
    let cur: ProfitabilityNode | undefined = node;
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? layers.nodes[cur.parentId] : undefined;
    }
    return out;
  }, [node, layers.nodes]);

  const children = node.childIds.map((id) => layers.nodes[id]!).filter(Boolean);
  const lineById = useMemo(() => new Map(layers.lines.map((l) => [l.positionId, l])), [layers.lines]);
  const positionLines = children.length === 0 ? node.positionIds.map((id) => lineById.get(id)!).filter(Boolean) : [];

  const switchView = (v: View) => {
    setView(v);
    setCurrentId(v === 'product' ? layers.rootId : layers.customerRootId);
  };

  const nodeWarnings: string[] = [];
  if (node.unpricedCount > 0) {
    nodeWarnings.push(
      `${node.unpricedCount} position(s) here (${formatAmount(node.unpricedBalance, currency)}) have no transfer rate or no client rate - ` +
        `left out of the margin layers rather than counted as zero; ${formatAmount(node.unpricedClientNetInterest, currency)} of client interest excluded.`,
    );
  }
  if (node.eclMissingCount > 0) {
    nodeWarnings.push(
      `${node.eclMissingCount} asset position(s) here have no PD/LGD or provision basis - ECL missing, not zero.`,
    );
  }

  return (
    <>
      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Fully-loaded profitability
            <InfoButton label="Methodology" panelClassName="max-w-xl">
              {layers.methodology}
            </InfoButton>
          </h2>
          <div
            className="flex gap-1 rounded-lg border border-gray-200 p-0.5"
            role="group"
            aria-label="Profitability view"
          >
            {(['product', 'customer'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchView(v)}
                aria-pressed={view === v}
                className={cn(
                  'rounded px-3 py-1 text-[12px] font-bold',
                  view === v ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900',
                )}
              >
                {v === 'product' ? 'Product view' : 'Customer view'}
              </button>
            ))}
          </div>
        </div>

        <nav aria-label="Drill-down path" className="mb-4 flex flex-wrap items-center gap-1 text-[13px]">
          {trail.map((n, i) => (
            <span key={n.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300">/</span>}
              {i === trail.length - 1 ? (
                <span className="font-bold text-navy-900">
                  {nameOf(n)} <span className="font-normal text-gray-400">({LEVEL_LABEL[n.level]})</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setCurrentId(n.id)}
                  className="font-bold text-navy-700 hover:underline"
                >
                  {nameOf(n)}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Waterfall node={node} currency={currency} />
          </div>
          <dl className="space-y-2 text-[13px]">
            <Row label="Assets" value={<Amount value={node.assetBalance} currency={currency} />} />
            <Row label="Liabilities" value={<Amount value={node.liabilityBalance} currency={currency} />} />
            <Row
              label="Net interest after FTP"
              value={<Amount value={node.netInterestAfterFtp} currency={currency} colorBySign />}
            />
            <Row label="Risk-weighted assets" value={<Amount value={node.rwa} currency={currency} />} />
            <Row label="Allocated capital" value={<Amount value={node.allocatedCapital} currency={currency} />} />
            <Row
              label="Risk-adjusted profit"
              value={<Amount value={node.riskAdjustedProfit} currency={currency} colorBySign />}
              bold
            />
            <Row
              label="RAROC"
              value={<span className="font-mono font-bold">{formatPct(node.rarocPercent, 1)}</span>}
              bold
            />
            <Row
              label="Share of Group profit"
              value={
                <span className="font-mono">
                  {formatPct(node.shareOfRiskAdjustedProfit === null ? null : node.shareOfRiskAdjustedProfit * 100, 1)}
                </span>
              }
            />
          </dl>
        </div>

        {(nodeWarnings.length > 0 || (node.id === rootId && layers.notes.length > 0)) && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[12px] leading-relaxed text-navy-900">
            <span className="font-bold">Read with care</span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {(node.id === rootId ? layers.notes : nodeWarnings).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-[13px] font-bold uppercase tracking-widest text-navy-900">
          {children.length > 0 ? `${LEVEL_LABEL[layers.nodes[children[0]!.id]!.level]} breakdown` : 'Position lines'}
        </h2>
        <p className="mb-4 text-[12px] text-gray-500">
          {children.length > 0
            ? 'Click a name to drill down. Every row sums to the level above, layer by layer. Costs are negative.'
            : 'Each position, annualised, in the reporting currency.'}
        </p>
        {children.length > 0 ? (
          <NodeTable nodes={children} currency={currency} nameOf={nameOf} onDrill={setCurrentId} />
        ) : (
          <LineTable
            lines={positionLines}
            currency={currency}
            poolNames={new Map(layers.costPools.map((c) => [c.poolId, c.name]))}
          />
        )}
      </section>

      <CostPoolPanel layers={layers} />
    </>
  );
}

const LAYER_COLOR = {
  up: 'hsl(var(--success))',
  down: 'hsl(var(--danger))',
  total: 'hsl(var(--navy-700))',
  none: 'hsl(var(--gray-300))',
};

function Waterfall({ node, currency }: { node: ProfitabilityNode; currency: CurrencyCode }) {
  const data = useMemo(() => {
    let prev = 0;
    return layersFor(node).map((s) => {
      const start = s.isTotal ? 0 : prev;
      const end = s.cumulative;
      prev = s.cumulative;
      return {
        label: s.label.replace(' (client rates)', '').replace('Funding cost / credit (FTP)', 'FTP funding'),
        range: [Math.min(start, end), Math.max(start, end)] as [number, number],
        value: s.value,
        color: s.isTotal
          ? LAYER_COLOR.total
          : s.value === null
            ? LAYER_COLOR.none
            : s.value >= 0
              ? LAYER_COLOR.up
              : LAYER_COLOR.down,
      };
    });
  }, [node]);

  return (
    <div style={{ width: '100%', height: 280 }} aria-label="Profit waterfall">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="hsl(var(--gray-200))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--gray-500))' }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--gray-500))' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatAmount(v, currency)}
          />
          <Tooltip
            formatter={(_v: unknown, _n: string, item: { payload?: { value: number | null } }) => [
              item.payload?.value === null || item.payload?.value === undefined
                ? 'n/a'
                : formatAmount(item.payload.value, currency),
              'Amount',
            ]}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--gray-200))' }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--gray-400))" />
          <Bar dataKey="range" isAnimationActive={false} radius={[2, 2, 2, 2]}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              style={{ fontSize: 10, fill: 'hsl(var(--gray-600))' }}
              formatter={(v: number | null) => (v === null ? 'n/a' : formatAmount(v, currency))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function money<T>(
  key: string,
  header: string,
  get: (r: T) => number | null,
  currency: CurrencyCode,
  signed = true,
): ResultColumn<T> {
  return {
    key,
    header,
    align: 'right',
    render: (r) => <Amount value={get(r)} currency={currency} colorBySign={signed} />,
    sortValue: (r) => get(r),
  };
}

function NodeTable({
  nodes,
  currency,
  nameOf,
  onDrill,
}: {
  nodes: ProfitabilityNode[];
  currency: CurrencyCode;
  nameOf: (n: ProfitabilityNode) => string;
  onDrill: (id: string) => void;
}) {
  const columns: ResultColumn<ProfitabilityNode>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (n) => (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onDrill(n.id)}
            className="text-left font-bold text-navy-700 hover:underline"
          >
            {nameOf(n)}
          </button>
          {n.unpricedCount > 0 && <StatusBadge status={`${n.unpricedCount} unpriced`} tone="warning" />}
          {n.eclMissingCount > 0 && <StatusBadge status={`${n.eclMissingCount} ECL missing`} tone="warning" />}
        </span>
      ),
      sortValue: (n) => nameOf(n),
    },
    money('assets', 'Assets', (n) => n.assetBalance, currency, false),
    money('liabs', 'Liabilities', (n) => n.liabilityBalance, currency, false),
    money('nii', 'Client NII', (n) => n.clientNetInterest, currency),
    money('ftp', 'FTP', (n) => n.ftp, currency),
    money('niiftp', 'NII after FTP', (n) => n.netInterestAfterFtp, currency),
    money('opex', 'Opex', (n) => n.opex, currency),
    money('ecl', 'ECL', (n) => n.ecl, currency),
    money('cap', 'Capital charge', (n) => n.capitalCharge, currency),
    money('rap', 'Risk-adj. profit', (n) => n.riskAdjustedProfit, currency),
    {
      key: 'raroc',
      header: 'RAROC',
      align: 'right',
      render: (n) => <span className="font-mono">{formatPct(n.rarocPercent, 1)}</span>,
      sortValue: (n) => n.rarocPercent,
    },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (n) => (
        <span className="font-mono">
          {formatPct(n.shareOfRiskAdjustedProfit === null ? null : n.shareOfRiskAdjustedProfit * 100, 1)}
        </span>
      ),
      sortValue: (n) => n.shareOfRiskAdjustedProfit,
    },
  ];
  return <ResultTable rows={nodes} columns={columns} rowKey={(n) => n.id} emptyMessage="Nothing beneath this level." />;
}

function LineTable({
  lines,
  currency,
  poolNames,
}: {
  lines: ProfitabilityLine[];
  currency: CurrencyCode;
  poolNames: Map<string, string>;
}) {
  const columns: ResultColumn<ProfitabilityLine>[] = [
    {
      key: 'pos',
      header: 'Position',
      render: (l) => (
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[12px]">{l.positionId}</span>
          {!l.priced && (
            <StatusBadge
              status={l.unpricedReasons
                .map((r) => (r === 'NoTransferRate' ? 'no transfer rate' : 'no client rate'))
                .join(', ')}
              tone="warning"
            />
          )}
          {l.ecl === null && <StatusBadge status="ECL missing" tone="warning" />}
        </span>
      ),
      sortValue: (l) => l.positionId,
    },
    { key: 'cat', header: 'Side', render: (l) => l.category, sortValue: (l) => l.category },
    {
      key: 'cust',
      header: 'Customer',
      render: (l) => <span className="font-mono text-[12px]">{l.counterpartyId ?? '-'}</span>,
    },
    money('bal', 'Balance', (l) => l.balance, currency, false),
    {
      key: 'rates',
      header: 'Client / transfer rate',
      align: 'right',
      render: (l) => (
        <span className="font-mono text-[12px]">
          {formatPct(l.clientRatePercent, 2)} / {formatPct(l.transferRatePercent, 2)}
        </span>
      ),
    },
    money('nii', 'Client NII', (l) => l.clientNetInterest, currency),
    money('ftp', 'FTP', (l) => l.ftp, currency),
    money('opex', 'Opex', (l) => l.opex, currency),
    money('ecl', 'ECL', (l) => l.ecl, currency),
    money('cap', 'Capital charge', (l) => l.capitalCharge, currency),
    money('rap', 'Risk-adj. profit', (l) => l.riskAdjustedProfit, currency),
    {
      key: 'raroc',
      header: 'RAROC',
      align: 'right',
      render: (l) => <span className="font-mono">{formatPct(l.rarocPercent, 1)}</span>,
      sortValue: (l) => l.rarocPercent,
    },
  ];
  return (
    <ResultTable
      rows={lines}
      columns={columns}
      rowKey={(l) => l.positionId}
      emptyMessage="No positions."
      renderDetail={(l) => (
        <dl className="grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
          <Row label="Business unit" value={l.orgUnitCode} />
          <Row label="Product / class" value={`${l.productCode} / ${l.productClass}`} />
          <Row label="Currency" value={l.currency} />
          <Row label="Risk weight" value={formatPct(l.riskWeightPct, 0)} />
          <Row label="RWA" value={<Amount value={l.rwa} currency={currency} />} />
          <Row label="Allocated capital" value={<Amount value={l.allocatedCapital} currency={currency} />} />
          {Object.entries(l.opexByPool).map(([pool, v]) => (
            <Row
              key={pool}
              label={`Opex - ${poolNames.get(pool) ?? pool}`}
              value={<Amount value={v} currency={currency} colorBySign />}
            />
          ))}
        </dl>
      )}
    />
  );
}

function CostPoolPanel({ layers }: { layers: ProfitabilityLayersResult }) {
  const currency = layers.currency;
  const balanced = Math.abs(layers.totalOpexResidual) < 0.5;
  return (
    <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
          Cost pool reconciliation
          <InfoButton label="Why reconcile">
            Every pool is accounted for: allocated to positions plus unallocated residual equals the pool amount. A
            residual means part of the budget could not be attributed - no eligible positions, no headcount entered, or
            fixed shares that do not total 100% - and is reported rather than hidden.
          </InfoButton>
        </h2>
        <StatusBadge
          status={balanced ? 'Fully allocated' : 'Residual left unallocated'}
          tone={balanced ? 'success' : 'warning'}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th scope="col" className="px-3 py-1.5 text-left">
                Pool
              </th>
              <th scope="col" className="px-3 py-1.5 text-left">
                Driver
              </th>
              <th scope="col" className="px-3 py-1.5 text-right">
                Pool amount
              </th>
              <th scope="col" className="px-3 py-1.5 text-right">
                Allocated
              </th>
              <th scope="col" className="px-3 py-1.5 text-right">
                Residual
              </th>
              <th scope="col" className="px-3 py-1.5 text-left">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {layers.costPools.map((c) => (
              <tr key={c.poolId} className="border-b border-gray-100">
                <td className="px-3 py-1.5 font-medium text-navy-900">{c.name}</td>
                <td className="px-3 py-1.5 text-gray-600">{c.driver}</td>
                <td className="px-3 py-1.5 text-right">
                  <Amount value={c.amount} currency={currency} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Amount value={c.allocated} currency={currency} />
                </td>
                <td className={cn('px-3 py-1.5 text-right', Math.abs(c.residual) >= 0.5 && 'text-warning')}>
                  <Amount value={c.residual} currency={currency} />
                </td>
                <td className="px-3 py-1.5 text-[12px] text-gray-500">{c.note ?? '-'}</td>
              </tr>
            ))}
            <tr className="font-bold text-navy-900">
              <td className="px-3 py-1.5" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-1.5 text-right">
                <Amount value={layers.totalOpexPool} currency={currency} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <Amount value={layers.totalOpexAllocated} currency={currency} />
              </td>
              <td className="px-3 py-1.5 text-right">
                <Amount value={layers.totalOpexResidual} currency={currency} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ratios (NIM, NPL, coverage)
// ─────────────────────────────────────────────────────────────────────────

function RatiosSection({
  p,
  currency,
  run,
}: {
  p: ProfitabilityResult;
  currency: CurrencyCode;
  run: ProcessRun | null;
}) {
  const [segmentBy, setSegmentBy] = useState<'product' | 'orgUnit'>('product');
  const { data: orgUnits = [] } = useDimensionMembers(
    'OrgUnit',
    run?.affiliateCode && run.affiliateCode !== 'GROUP' ? run.affiliateCode : '',
  );
  const nameOf = (code: string) => orgUnits.find((u) => u.code === code)?.name ?? code;

  const segments = segmentBy === 'product' ? p.byProduct : p.byOrgUnit;

  const segmentColumns: ResultColumn<ProfitabilitySegment>[] = [
    {
      key: 'key',
      header: segmentBy === 'product' ? 'Product' : 'Business unit',
      render: (s) => <span className="font-medium">{segmentBy === 'orgUnit' ? nameOf(s.key) : s.key}</span>,
    },
    {
      key: 'assets',
      header: 'Total assets',
      align: 'right',
      render: (s) => <Amount value={s.totalAssets} currency={currency} />,
      compareValue: (s) => s.totalAssets,
    },
    {
      key: 'nii',
      header: 'Net interest income',
      align: 'right',
      render: (s) => <Amount value={s.netInterestIncome} currency={currency} colorBySign />,
      compareValue: (s) => s.netInterestIncome,
    },
    {
      key: 'nim',
      header: 'NIM',
      align: 'right',
      render: (s) => <span className="font-mono">{formatPct(s.netInterestMarginPercent, 2)}</span>,
    },
    {
      key: 'npl',
      header: 'NPL',
      align: 'right',
      render: (s) =>
        s.nplRatioPercent === null ? (
          <span className="text-gray-300">-</span>
        ) : (
          <span className={`font-mono ${s.nplRatioPercent > 5 ? 'text-danger' : ''}`}>
            {formatPct(s.nplRatioPercent, 2)}
          </span>
        ),
    },
  ];

  return (
    <>
      <h2 className="mb-3 mt-2 text-[13px] font-bold uppercase tracking-widest text-navy-900">
        Margin &amp; asset-quality ratios
      </h2>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Earnings
            <InfoButton label="Where these come from">
              Computed directly from each position's balance and its own interest rate - the same positions that drive
              the liquidity and rate-risk metrics elsewhere in the platform.
            </InfoButton>
          </h2>
          <dl className="space-y-2 text-[13px]">
            <Row label="Total assets" value={<Amount value={p.totalAssets} currency={currency} />} />
            <Row label="Interest income" value={<Amount value={p.interestIncome} currency={currency} />} />
            <Row label="Interest expense" value={<Amount value={p.interestExpense} currency={currency} />} />
            <Row
              label="Net interest income"
              value={<Amount value={p.netInterestIncome} currency={currency} colorBySign />}
              bold
            />
            <Row
              label="Net interest margin"
              value={<span className="font-mono font-bold">{formatPct(p.netInterestMarginPercent, 2)}</span>}
              bold
            />
            <Row
              label="Interest income as % of total income"
              value={<span className="font-mono">{formatPct(p.interestIncomeToTotalIncomePercent, 1)}</span>}
            />
            <Row
              label="Interest-bearing assets to liabilities"
              value={
                <span className="font-mono">
                  {p.interestBearingAssetsToLiabilities === null
                    ? '-'
                    : p.interestBearingAssetsToLiabilities.toFixed(2) + '×'}
                </span>
              }
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">Asset quality</h2>
              <InfoButton label="Methodology">
                Anything classified Substandard or worse counts as non-performing, following the CBN classification.
                Coverage compares provisions held against that balance - below 100% means the provisioning does not yet
                cover the impaired book.
              </InfoButton>
            </div>
            {p.nplRatioPercent !== null && (
              <StatusBadge
                status={p.nplRatioPercent > 5 ? 'Above 5% threshold' : 'Within threshold'}
                tone={p.nplRatioPercent > 5 ? 'danger' : 'success'}
              />
            )}
          </div>

          <p className="mb-4 font-mono text-[30px] font-bold text-navy-900">{formatPct(p.nplRatioPercent, 2)}</p>

          <dl className="space-y-2 text-[13px]">
            <Row
              label="NPL coverage ratio"
              value={<span className="font-mono font-bold">{formatPct(p.nplCoverageRatioPercent)}</span>}
            />
            <Row
              label="Non-earning asset ratio"
              value={<span className="font-mono">{formatPct(p.nonEarningAssetRatioPercent, 2)}</span>}
            />
            <Row
              label="Loan-to-deposit"
              value={<span className="font-mono">{formatPct(p.loanToDepositPercent)}</span>}
            />
          </dl>
        </section>
      </div>

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-1.5">
          <h2 className="text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Ratios against their thresholds
          </h2>
          <InfoButton label="Why these thresholds">
            The thresholds drawn are the NPL ones - they do not apply to NIM or the non-earning ratio, which have no
            regulatory floor. Shown together because the three move against each other: a book that lends aggressively
            lifts NIM and NPL at once.
          </InfoButton>
        </div>
        <RatioChart
          data={[
            { label: 'NIM', value: p.netInterestMarginPercent ?? 0 },
            { label: 'NPL', value: p.nplRatioPercent ?? 0 },
            { label: 'Non-earning', value: p.nonEarningAssetRatioPercent ?? 0 },
          ]}
          thresholds={[
            { label: 'NPL regulatory ceiling', value: 5, kind: 'regulatory' },
            { label: 'Internal watch', value: 3, kind: 'internal' },
          ]}
          variant="bar"
          seriesName="Ratio"
        />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-widest text-navy-900">
            Profitability by segment
            <InfoButton label="How segments are computed">
              Each segment runs the exact same margin and asset-quality formulas as the book-wide figures above, just
              scoped to the positions in that product or business unit - not a separate calculation.
            </InfoButton>
          </h2>
          <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5">
            <button
              type="button"
              onClick={() => setSegmentBy('product')}
              className={`rounded px-3 py-1 text-[12px] font-bold ${
                segmentBy === 'product' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
              }`}
            >
              By product
            </button>
            <button
              type="button"
              onClick={() => setSegmentBy('orgUnit')}
              className={`rounded px-3 py-1 text-[12px] font-bold ${
                segmentBy === 'orgUnit' ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
              }`}
            >
              By business unit
            </button>
          </div>
        </div>
        <ResultTable
          rows={segments}
          columns={segmentColumns}
          rowKey={(s) => s.key}
          emptyMessage="No segments to show."
        />
      </section>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: ReactNode; bold?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${bold ? 'border-t border-gray-100 pt-2 font-bold text-navy-900' : ''}`}
    >
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
