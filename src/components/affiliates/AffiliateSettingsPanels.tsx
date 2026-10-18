// Read-only summaries on the slim affiliate settings page (teardown §2, §12 row 6). The real work happens
// elsewhere - data sources and column mapping in Data → Sources, rules in Assumptions - so these only say
// what is there and link to it.
import { Link } from 'wouter';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RuleApprovalBadge } from '@/components/rules/RuleApprovalBadge';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useBatches } from '@/lib/hooks';
import { useRules } from '@/lib/ruleHooks';
import { useDataSources } from '@/lib/sourceHooks';
import { ruleEditorPath } from '@/lib/rulePaths';
import { formatDate } from '@/lib/format';
import type { RuleKind, RuleMeta } from '@/engine/types';

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-[14px] font-bold text-navy-900">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-gray-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** This affiliate's data sources with their latest load - configured and loaded in Data → Sources. */
export function DataSourcesSummary({ code }: { code: string }) {
  const { setAffiliateCode } = useScope();
  const { data: sources = [] } = useDataSources();
  const { data: batches = [] } = useBatches();
  const own = sources.filter((s) => s.affiliateCode === code && s.isActive);

  return (
    <Card
      title="Data sources"
      description="The feeds this affiliate loads. Upload, column mapping, ledger check and load history all live in Data → Sources."
    >
      {own.length === 0 ? (
        <p className="text-[13px] text-gray-500">No data sources yet.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-3 py-2 font-bold">Source</th>
              <th className="px-3 py-2 font-bold">Column mapping</th>
              <th className="px-3 py-2 font-bold">Latest load</th>
            </tr>
          </thead>
          <tbody>
            {own.map((s) => {
              const last = batches
                .filter((b) => b.sourceId === s.id)
                .sort((a, b) => (b.committedAt ?? b.uploadedAt).localeCompare(a.committedAt ?? a.uploadedAt))[0];
              return (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <Link
                      href={`/data/operations?source=${encodeURIComponent(s.id)}`}
                      onClick={() => setAffiliateCode(code)}
                      className="font-bold text-navy-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {s.mappedHeaders?.length ? 'Saved' : 'Set at first upload'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {last ? (
                      <>
                        {formatDate(last.asOfDate)} <StatusBadge status={last.status} />
                      </>
                    ) : (
                      <span className="text-gray-400">Never loaded</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <Link
        href="/data/operations"
        onClick={() => setAffiliateCode(code)}
        className="mt-4 inline-block text-[12px] font-bold text-navy-700 hover:underline"
      >
        Open Data → Sources →
      </Link>
    </Card>
  );
}

/** The rule kinds a run reads, in the order of Assumptions → Rules. */
const INHERITED_KINDS: Array<{ kind: RuleKind; label: string }> = [
  { kind: 'BehaviourPattern', label: 'Deposit behaviour' },
  { kind: 'Prepayment', label: 'Loan prepayment' },
  { kind: 'ProductCharacteristic', label: 'Product characteristics' },
  { kind: 'TimeBucket', label: 'Time buckets' },
  { kind: 'ForecastScenario', label: 'Rate scenarios' },
  { kind: 'NewBusiness', label: 'New business plans' },
  { kind: 'FtpRule', label: 'FTP method & curve' },
  { kind: 'AdjustmentRule', label: 'FTP add-ons' },
  { kind: 'CostAllocation', label: 'Operating cost allocation' },
  { kind: 'CreditLoss', label: 'Expected credit loss' },
  { kind: 'CapitalAllocation', label: 'Capital charge' },
];

const latest = (rules: RuleMeta[]) =>
  [...rules].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0] ?? null;

function InheritanceRow({
  kind,
  label,
  affiliateCode,
  isGroup,
}: {
  kind: RuleKind;
  label: string;
  affiliateCode: string;
  isGroup: boolean;
}) {
  const { hasPermission } = useAuth();
  const { data: rules = [] } = useRules<RuleMeta>(kind);
  const active = rules.filter((r) => r.isActive);
  const groupDefault = latest(active.filter((r) => r.affiliateCode === null));
  const own = isGroup ? null : latest(active.filter((r) => r.affiliateCode === affiliateCode));
  const forks = isGroup ? new Set(active.filter((r) => r.affiliateCode).map((r) => r.affiliateCode)).size : 0;
  const inForce = own ?? groupDefault;

  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-2 font-medium text-navy-900">{label}</td>
      <td className="px-3 py-2">
        {isGroup ? (
          groupDefault ? (
            <span className="text-gray-600">
              Group default v{groupDefault.version}
              {forks > 0 && (
                <span className="text-gray-400">
                  {' '}
                  · {forks} affiliate fork{forks === 1 ? '' : 's'}
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-400">No Group default</span>
          )
        ) : own ? (
          <StatusBadge status={`Own version v${own.version}`} tone="warning" />
        ) : groupDefault ? (
          <StatusBadge status="Group default" tone="neutral" />
        ) : (
          <span className="text-gray-400">Not set</span>
        )}
      </td>
      <td className="px-3 py-2">{inForce ? <RuleApprovalBadge rule={inForce} /> : null}</td>
      <td className="px-3 py-2 text-right">
        {/* Rule editors are gated on rules.edit; anyone else gets the read-only list in Assumptions → Rules. */}
        <Link
          href={hasPermission('rules.edit') ? ruleEditorPath(kind) : '/assumptions/rules'}
          className="text-[12px] font-bold text-navy-700 hover:underline"
        >
          Open in Assumptions →
        </Link>
      </td>
    </tr>
  );
}

/** Which rule kinds this affiliate takes from the Group default and which it has its own version of. Read-only. */
export function RuleInheritance({ affiliateCode, isGroup }: { affiliateCode: string; isGroup: boolean }) {
  return (
    <Card
      title="Rule inheritance"
      description={
        isGroup
          ? 'The Group defaults every affiliate inherits unless it has its own version. Rules are edited in Assumptions → Rules.'
          : 'Which assumptions this affiliate takes from the Group default and which it has its own version of. Rules are edited in Assumptions → Rules.'
      }
    >
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-400">
            <th className="px-3 py-2 font-bold">Assumption</th>
            <th className="px-3 py-2 font-bold">{isGroup ? 'Group default' : 'Source'}</th>
            <th className="px-3 py-2 font-bold">Approval</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {INHERITED_KINDS.map((k) => (
            <InheritanceRow
              key={k.kind}
              kind={k.kind}
              label={k.label}
              affiliateCode={affiliateCode}
              isGroup={isGroup}
            />
          ))}
        </tbody>
      </table>
      <Link href="/assumptions/rules" className="mt-4 inline-block text-[12px] font-bold text-navy-700 hover:underline">
        Open Assumptions → Rules →
      </Link>
    </Card>
  );
}
