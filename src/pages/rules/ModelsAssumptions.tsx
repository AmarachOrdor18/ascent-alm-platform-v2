/**
 * Models & Assumptions — screen 29.
 *
 * The registry over every rule type: what is configured, who owns it, when
 * it last changed, and where it diverges from the Group standard.
 *
 * Model governance is a standing regulatory expectation, and the question it
 * asks is not "what are the assumptions" but "who changed them, when, and
 * with whose approval". That is answerable here because every rule carries
 * a version, an owner and an audit trail.
 */

import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuditEvents } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { formatDate } from '@/lib/format';
import type { RuleKind, RuleMeta } from '@/engine/types';

const REGISTRY: Array<{ kind: RuleKind; label: string; path: string; governs: string }> = [
  { kind: 'TimeBucket', label: 'Time Buckets', path: '/rules/time-buckets', governs: 'How results are bucketed' },
  {
    kind: 'ProductCharacteristic',
    label: 'Product Characteristics',
    path: '/rules/product-characteristics',
    governs: 'Basel factors per product',
  },
  {
    kind: 'BehaviourPattern',
    label: 'Behaviour Patterns',
    path: '/rules/behaviour-patterns',
    governs: 'Deposit run-off and betas',
  },
  {
    kind: 'PaymentPattern',
    label: 'Payment & Repricing Patterns',
    path: '/rules/patterns',
    governs: 'Non-standard schedules',
  },
  { kind: 'Prepayment', label: 'Prepayment', path: '/rules/prepayment', governs: 'Early principal return' },
  {
    kind: 'DiscountMethod',
    label: 'Discount Methods',
    path: '/rules/discount-methods',
    governs: 'Present-value basis',
  },
  { kind: 'ForecastScenario', label: 'Forecast Scenarios', path: '/rules/scenarios', governs: 'Rate shocks' },
  { kind: 'NewBusiness', label: 'New Business', path: '/rules/new-business', governs: 'Growth and origination' },
  {
    kind: 'TransactionStrategy',
    label: 'Transaction Strategies',
    path: '/rules/transaction-strategies',
    governs: 'Balance-sheet actions',
  },
  { kind: 'FtpRule', label: 'FTP Rules', path: '/rules/ftp', governs: 'Transfer pricing method' },
  { kind: 'AdjustmentRule', label: 'Adjustment Rules', path: '/rules/adjustments', governs: 'FTP add-ons' },
  { kind: 'Filter', label: 'Filters', path: '/rules/filters', governs: 'Scope selection' },
  { kind: 'CustomMetric', label: 'Custom Metrics', path: '/rules/custom-metrics', governs: 'Derived measures' },
];

interface RegistryRow {
  kind: RuleKind;
  label: string;
  path: string;
  governs: string;
  rules: RuleMeta[];
}

export function ModelsAssumptions() {
  // One hook per rule kind. The count is fixed and known at compile time, so
  // this is a stable hook order despite looking like a loop.
  const queries = [
    useRules('TimeBucket'),
    useRules('ProductCharacteristic'),
    useRules('BehaviourPattern'),
    useRules('PaymentPattern'),
    useRules('Prepayment'),
    useRules('DiscountMethod'),
    useRules('ForecastScenario'),
    useRules('NewBusiness'),
    useRules('TransactionStrategy'),
    useRules('FtpRule'),
    useRules('AdjustmentRule'),
    useRules('Filter'),
    useRules('CustomMetric'),
  ];
  const { data: audit = [] } = useAuditEvents(50);

  const rows: RegistryRow[] = REGISTRY.map((entry, i) => ({
    ...entry,
    rules: queries[i]?.data ?? [],
  }));

  const allRules = rows.flatMap((r) => r.rules);
  const configured = rows.filter((r) => r.rules.length > 0).length;
  const affiliateSpecific = allRules.filter((r) => r.affiliateCode !== null);
  const inactive = allRules.filter((r) => !r.isActive);

  const ruleChanges = audit.filter((e) => e.module === 'Business Rules');

  const columns: ResultColumn<RegistryRow>[] = [
    {
      key: 'label',
      header: 'Rule type',
      render: (r) => (
        <Link href={r.path} className="font-medium text-navy-900 hover:text-navy-700 hover:underline">
          {r.label}
        </Link>
      ),
    },
    { key: 'governs', header: 'Governs', render: (r) => <span className="text-gray-500">{r.governs}</span> },
    {
      key: 'count',
      header: 'Defined',
      align: 'right',
      render: (r) =>
        r.rules.length === 0 ? (
          <span className="font-mono text-gray-300">0</span>
        ) : (
          <span className="font-mono text-navy-900">{r.rules.length}</span>
        ),
    },
    {
      key: 'active',
      header: 'Active',
      align: 'right',
      render: (r) => <span className="font-mono text-gray-600">{r.rules.filter((x) => x.isActive).length}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      className: 'whitespace-nowrap',
      render: (r) =>
        r.rules.length === 0 ? (
          <StatusBadge status="Not configured" tone="warning" className="whitespace-nowrap" />
        ) : r.rules.some((x) => x.affiliateCode !== null) ? (
          <StatusBadge status="Has affiliate overrides" tone="info" className="whitespace-nowrap" />
        ) : (
          <StatusBadge status="Group standard" tone="success" className="whitespace-nowrap" />
        ),
    },
    {
      key: 'updated',
      header: 'Last changed',
      render: (r) => {
        const latest = r.rules
          .map((x) => x.updatedAt ?? x.createdAt)
          .sort()
          .reverse()[0];
        return <span className="text-[11px] text-gray-500">{latest ? formatDate(latest.slice(0, 10)) : '—'}</span>;
      },
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Models & Assumptions"
        description="Every configurable rule, who owns it and when it last changed. The register a model-governance review reads."
        asOfDate={null}
        scope="All folders"
        metrics={[
          { label: 'Rule types', value: `${configured}/${REGISTRY.length}` },
          { label: 'Rules defined', value: String(allRules.length) },
          {
            label: 'Affiliate overrides',
            value: String(affiliateSpecific.length),
            tone: affiliateSpecific.length > 0 ? 'warning' : 'neutral',
          },
          { label: 'Inactive', value: String(inactive.length), tone: inactive.length > 0 ? 'warning' : 'neutral' },
        ]}
      />

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Registry</h2>
        <ResultTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.kind}
          renderDetail={(r) =>
            r.rules.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                Nothing defined.{' '}
                <Link href={r.path} className="font-bold text-navy-700 hover:underline">
                  Configure {r.label}
                </Link>
                .
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-400">
                    <th className="py-1 font-bold uppercase tracking-wider">Name</th>
                    <th className="py-1 font-bold uppercase tracking-wider">Folder</th>
                    <th className="py-1 font-bold uppercase tracking-wider">Scope</th>
                    <th className="py-1 text-right font-bold uppercase tracking-wider">Version</th>
                    <th className="py-1 font-bold uppercase tracking-wider">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 font-medium text-navy-900">{rule.name}</td>
                      <td className="py-1.5 font-mono text-gray-500">{rule.folder}</td>
                      <td className="py-1.5">
                        {rule.affiliateCode ? (
                          <span className="font-mono text-warning">{rule.affiliateCode}</span>
                        ) : (
                          <span className="text-gray-500">Group</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-mono">v{rule.version}</td>
                      <td className="py-1.5 text-gray-500">{rule.updatedBy ?? rule.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
          Recent assumption changes
        </h2>
        <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
          Model governance asks who changed an assumption and when. Every rule save writes here without the screen
          having to remember.
        </p>
        {ruleChanges.length === 0 ? (
          <p className="text-[12px] text-gray-500">No rule changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {ruleChanges.slice(0, 12).map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-gray-50 pb-2 text-[11px] last:border-0"
              >
                <span className="font-mono text-gray-400">{new Date(e.recordedAt).toLocaleString()}</span>
                <span className="font-bold text-navy-900">{e.userName}</span>
                <span className="text-gray-500">
                  {e.action.toLowerCase()}d {e.entity}
                </span>
                <span className="text-gray-600">{e.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
