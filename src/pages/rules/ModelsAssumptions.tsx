import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { useAuditEvents } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { formatDate } from '@/lib/format';
import type { RuleKind, RuleMeta } from '@/engine/types';

/**
 * `ifEmpty` states plainly what happens when a rule kind has nothing defined - the "is this
 * mandatory before a run" question this registry exists to answer. Traced against `ProcessRun.tsx`'s
 * rule selectors and `engine/run.ts`'s `executeRun`, not guessed: several kinds are stored on a run
 * but not yet applied to any calculation at all ("not wired to a calculation"), which is a real,
 * separate gap from a kind that safely falls back to an engine default.
 */
const REGISTRY: Array<{ kind: RuleKind; label: string; governs: string; ifEmpty: string }> = [
  { kind: 'TimeBucket', label: 'Time Buckets', governs: 'How results are bucketed', ifEmpty: 'Engine default ladder applies (disclosed on the result)' },
  { kind: 'ProductCharacteristic', label: 'Product Characteristics', governs: 'Basel factors per product', ifEmpty: 'Position keeps its as-loaded classification, unchanged' },
  { kind: 'BehaviourPattern', label: 'Behaviour Patterns', governs: 'Deposit run-off and betas', ifEmpty: 'Engine default pattern set applies (disclosed on the result)' },
  { kind: 'PaymentPattern', label: 'Payment & Repricing Patterns', governs: 'Non-standard schedules', ifEmpty: 'Not wired to a calculation yet' },
  { kind: 'Prepayment', label: 'Prepayment', governs: 'Early principal return', ifEmpty: 'Not wired to a calculation yet' },
  { kind: 'DiscountMethod', label: 'Discount Methods', governs: 'Present-value basis', ifEmpty: 'Not wired to a calculation yet' },
  { kind: 'ForecastScenario', label: 'Forecast Scenarios', governs: 'Rate shocks', ifEmpty: 'Run computes the base case only' },
  { kind: 'NewBusiness', label: 'New Business', governs: 'Growth and origination', ifEmpty: 'Consumed by Forecast only - no effect on a Process Run' },
  { kind: 'TransactionStrategy', label: 'Transaction Strategies', governs: 'Balance-sheet actions', ifEmpty: 'Not wired to a calculation yet, even when attached to a run' },
  { kind: 'FtpRule', label: 'FTP Rules', governs: 'Transfer pricing method', ifEmpty: 'All positions reported unpriced, not assumed zero-margin' },
  { kind: 'AdjustmentRule', label: 'Adjustment Rules', governs: 'FTP add-ons', ifEmpty: 'Transfer rate is the base curve alone, no add-ons' },
  { kind: 'Filter', label: 'Filters', governs: 'Scope selection', ifEmpty: 'Not selectable on Process Run yet - scope it there directly instead' },
  { kind: 'CustomMetric', label: 'Custom Metrics', governs: 'Derived measures', ifEmpty: 'Not wired to a calculation yet' },
  { kind: 'ValidationRule', label: 'Validation Rules', governs: 'Data-quality gates before commit', ifEmpty: 'Engine default validation rules apply, silently' },
  { kind: 'FieldMapping', label: 'Field Mappings', governs: 'Source-column translation before import', ifEmpty: 'Upload expects the platform\'s own column names as-is' },
  { kind: 'CodeMapping', label: 'Code Mappings', governs: 'Source-code crosswalks before import', ifEmpty: 'Unmapped codes are flagged at upload rather than translated' },
];

// Every kind is now configured inline on an affiliate's (or the Group's) own Settings page - a
// specific affiliate's fork lives on its own Settings, so this registry (inherently cross-affiliate)
// always points at the Group's, where every kind's Group-default editor also lives.
function settingsPathFor(kind: RuleKind): string {
  return `/affiliates/GROUP/settings?section=rule-${kind}`;
}

interface RegistryRow {
  kind: RuleKind;
  label: string;
  governs: string;
  ifEmpty: string;
  rules: RuleMeta[];
}

export function ModelsAssumptions({ embedded = false }: { embedded?: boolean } = {}) {
  // Fixed-length array of hook calls - stable hook order despite looking like a loop.
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
    useRules('ValidationRule'),
    useRules('FieldMapping'),
    useRules('CodeMapping'),
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
        <Link href={settingsPathFor(r.kind)} className="font-medium text-navy-900 hover:text-navy-700 hover:underline">
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
          <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap">Not configured</span>
        ) : r.rules.some((x) => x.affiliateCode !== null) ? (
          <StatusBadge status="Has affiliate overrides" tone="info" className="whitespace-nowrap" />
        ) : (
          <StatusBadge status="Group standard" tone="success" className="whitespace-nowrap" />
        ),
    },
    {
      key: 'ifEmpty',
      header: 'If nothing is defined',
      render: (r) => (
        <span className={r.ifEmpty.startsWith('Not wired') ? 'text-warning' : 'text-gray-500'}>{r.ifEmpty}</span>
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
        return <span className="text-[11px] text-gray-500">{latest ? formatDate(latest.slice(0, 10)) : '-'}</span>;
      },
    },
  ];

  return (
    <>
      {!embedded && (
      <ModuleHeader
        title="Models & Assumptions"
        description="Every configurable rule, who owns it and when it last changed. The register a model-governance review reads."
        asOfDate={null}
        scope="All folders"
        metrics={[
          {
            label: 'Rule types',
            value: `${configured}/${REGISTRY.length}`,
            about:
              `How many of the ${REGISTRY.length} rule categories have at least one rule defined, versus still running on engine defaults.`,
          },
          {
            label: 'Rules defined',
            value: String(allRules.length),
            about: 'Total rule instances across every category, Group-wide and affiliate-specific combined.',
          },
          {
            label: 'Affiliate overrides',
            value: String(affiliateSpecific.length),
            tone: affiliateSpecific.length > 0 ? 'warning' : 'neutral',
            about:
              'Rules scoped to a single affiliate rather than the Group standard - a deliberate fork, not an oversight, but worth knowing about.',
          },
          {
            label: 'Inactive',
            value: String(inactive.length),
            tone: inactive.length > 0 ? 'warning' : 'neutral',
            about: 'Rules kept on file but not currently applied to any run.',
          },
        ]}
      />
      )}

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
                <Link href={settingsPathFor(r.kind)} className="font-bold text-navy-700 hover:underline">
                  Configure {r.label}
                </Link>
                .
              </p>
            ) : (
              <ResultTable
                className="text-[11px]"
                rows={r.rules}
                rowKey={(rule) => rule.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    render: (rule) => <span className="font-medium text-navy-900">{rule.name}</span>,
                  },
                  {
                    key: 'folder',
                    header: 'Folder',
                    render: (rule) => <span className="font-mono text-gray-500">{rule.folder}</span>,
                  },
                  {
                    key: 'scope',
                    header: 'Scope',
                    render: (rule) =>
                      rule.affiliateCode ? (
                        <span className="font-mono text-warning">{rule.affiliateCode}</span>
                      ) : (
                        <span className="text-gray-500">Group</span>
                      ),
                  },
                  {
                    key: 'version',
                    header: 'Version',
                    align: 'right',
                    render: (rule) => <span className="font-mono">v{rule.version}</span>,
                  },
                  {
                    key: 'owner',
                    header: 'Owner',
                    render: (rule) => <span className="text-gray-500">{rule.updatedBy ?? rule.createdBy}</span>,
                  },
                ]}
              />
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
