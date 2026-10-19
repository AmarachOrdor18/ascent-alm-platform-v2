import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { GroupAssumptionsUpload } from '@/components/rules/GroupAssumptionsUpload';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { AffiliateAssumptionsExchange } from '@/components/rules/AffiliateAssumptionsExchange';
import { useRules } from '@/lib/ruleHooks';
import { approvals } from '@/lib/governanceHooks';
import { isApprovalGated, isRuleApproved, pickApprovedRule } from '@/lib/ruleApproval';
import { InfoButton } from '@/components/ui/InfoButton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { RuleKind, RuleMeta } from '@/engine/types';

interface RuleEntry {
  kind: RuleKind;
  label: string;
  /** What changes in the results when this rule changes. */
  effect: string;
  href: string;
  /** Route permission for the editor; the card itself is visible to everyone in the area. */
  permission: string;
}

// Only rule kinds a calculation actually reads. Kinds stored on a run but not applied anywhere
// (payment patterns, discount methods, transaction strategies, filters, custom metrics) stay
// reachable by URL but are kept off this page, so nothing here is configuration without effect.
const GROUPS: Array<{ title: string; rules: RuleEntry[] }> = [
  {
    title: 'Customer behaviour',
    rules: [
      {
        kind: 'BehaviourPattern',
        label: 'Deposit behaviour',
        effect: 'Core vs volatile split, run-off timing and deposit betas - liquidity gap, NII, FTP tenor and stress.',
        href: '/rules/behaviour-patterns',
        permission: 'rules.edit',
      },
      {
        kind: 'Prepayment',
        label: 'Loan prepayment',
        effect: 'How fast loans repay early - shortens asset cashflows in the gap and in IRRBB.',
        href: '/rules/prepayment',
        permission: 'rules.edit',
      },
    ],
  },
  {
    title: 'Liquidity & classification',
    rules: [
      {
        kind: 'ProductCharacteristic',
        label: 'Product characteristics',
        effect: 'HQLA level, haircut, LCR run-off and NSFR factors per product.',
        href: '/rules/product-characteristics',
        permission: 'rules.edit',
      },
      {
        kind: 'TimeBucket',
        label: 'Time buckets',
        effect: 'The ladder every gap report is cut into.',
        href: '/rules/time-buckets',
        permission: 'rules.edit',
      },
    ],
  },
  {
    title: 'Rates & forecasting',
    rules: [
      {
        kind: 'ForecastScenario',
        label: 'Rate scenarios',
        effect: 'The rate shocks NII and EVE are measured under. Need approval before use.',
        href: '/rules/scenarios',
        permission: 'rules.edit',
      },
      {
        kind: 'NewBusiness',
        label: 'New business plans',
        effect: 'Growth assumed when projecting ratios forward in Forecast.',
        href: '/rules/new-business',
        permission: 'rules.edit',
      },
    ],
  },
  {
    title: 'Transfer pricing',
    rules: [
      {
        kind: 'FtpRule',
        label: 'FTP method & curve',
        effect: 'Which curve and method prices each product class.',
        href: '/rules/ftp',
        permission: 'rules.edit',
      },
      {
        kind: 'AdjustmentRule',
        label: 'FTP add-ons',
        effect: 'Liquidity premium and basis adjustments layered on the base rate.',
        href: '/rules/adjustments',
        permission: 'rules.edit',
      },
    ],
  },
  {
    title: 'Profitability',
    rules: [
      {
        kind: 'CostAllocation',
        label: 'Operating cost allocation',
        effect: 'Annual opex pools and how they are shared across business units, products and accounts.',
        href: '/rules/cost-allocation',
        permission: 'rules.edit',
      },
      {
        kind: 'CreditLoss',
        label: 'Expected credit loss',
        effect: 'PD × LGD per product, or booked provisions - the credit-loss charge on each loan.',
        href: '/rules/credit-loss',
        permission: 'rules.edit',
      },
      {
        kind: 'CapitalAllocation',
        label: 'Capital charge',
        effect: 'Risk weights, capital ratio and cost of capital - the capital charge and RAROC.',
        href: '/rules/capital',
        permission: 'rules.edit',
      },
    ],
  },
  {
    title: 'Data quality',
    rules: [
      {
        kind: 'ValidationRule',
        label: 'Validation rules',
        effect: 'Which checks block an upload from being committed.',
        href: '/rules/validation',
        permission: 'data.view',
      },
      {
        kind: 'FieldMapping',
        label: 'Field mappings',
        effect: "Translate a source system's column names on upload.",
        href: '/rules/field-mappings',
        permission: 'data.view',
      },
      {
        kind: 'CodeMapping',
        label: 'Code mappings',
        effect: "Translate source product / GL codes to the platform's own.",
        href: '/rules/code-mappings',
        permission: 'data.view',
      },
    ],
  },
];

export function RulesHub() {
  const { affiliate, affiliateCode } = useScope();
  const isGroup = affiliateCode === 'GROUP';
  const scopeName = isGroup ? 'Group' : (affiliate?.name ?? affiliateCode);
  return (
    <>
      <ModuleHeader
        title="Rules & scenarios"
        description="The assumptions every run applies, grouped by what they change."
        about="Every save is versioned and each run records the exact version it used. 'In use' is the rule a run at the current scope picks: the affiliate's own approved rule, else the Group default."
        asOfDate={null}
      />
      <GroupAssumptionsUpload className="mb-6" />
      {!isGroup && affiliate && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
          <p className="text-[13px] font-bold text-navy-900">{affiliate.name}&rsquo;s own assumptions</p>
          <AffiliateAssumptionsExchange affiliate={affiliate} />
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-2.5">Assumption</th>
              <th className="px-4 py-2.5">In use for {scopeName}</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.title} data-tour-section={g.title}>
              <tr className="bg-gray-50/70">
                <td colSpan={4} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-navy-900">
                  {g.title}
                </td>
              </tr>
              {g.rules.map((r) => (
                <RuleRow key={r.kind} entry={r} affiliateCode={affiliateCode} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

function RuleRow({ entry, affiliateCode }: { entry: RuleEntry; affiliateCode: string }) {
  const { hasPermission } = useAuth();
  const { data: rules = [] } = useRules<RuleMeta>(entry.kind);
  const { data: requests = [] } = approvals.useList();
  const canOpen = hasPermission(entry.permission);
  const gated = isApprovalGated(entry.kind);
  const scoped = rules.filter(
    (r) => r.isActive && (r.affiliateCode === null || affiliateCode === 'GROUP' || r.affiliateCode === affiliateCode),
  );
  const latest = (list: RuleMeta[]) =>
    [...list].sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))[0] ?? null;
  // What a run at this scope picks: approved rules for gated kinds, the newest active rule otherwise.
  const inUse = gated
    ? pickApprovedRule(scoped, affiliateCode, requests)
    : ((affiliateCode !== 'GROUP' ? latest(scoped.filter((r) => r.affiliateCode === affiliateCode)) : null) ??
      latest(scoped.filter((r) => r.affiliateCode === null)));
  const pending = gated ? scoped.filter((r) => !isRuleApproved(r, requests)).length : 0;
  const own = inUse && inUse.affiliateCode !== null;

  return (
    <tr className="border-t border-gray-50">
      <td className="px-4 py-2.5">
        <span className="flex items-center gap-1.5 font-bold text-navy-900">
          {entry.label}
          <InfoButton label={`About ${entry.label}`}>{entry.effect}</InfoButton>
        </span>
      </td>
      <td className="px-4 py-2.5 text-gray-600">
        {inUse ? (
          <span>
            {inUse.name} <span className="font-mono text-[12px] text-gray-400">v{inUse.version}</span>{' '}
            <span className={`text-[11px] font-bold ${own ? 'text-info' : 'text-gray-400'}`}>
              {own ? 'Own' : 'Group default'}
            </span>
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5">
        {inUse ? (
          <StatusBadge status={gated ? 'Approved & in use' : 'In use'} tone="success" />
        ) : (
          <StatusBadge status="Not set" tone="neutral" />
        )}
        {pending > 0 && <StatusBadge status={`${pending} waiting for approval`} tone="warning" className="ml-1.5" />}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right">
        {canOpen && (
          <Link href={entry.href} className="text-[12px] font-bold text-navy-700 hover:underline">
            {rules.length > 0 ? 'Open' : 'Set up'}
          </Link>
        )}
      </td>
    </tr>
  );
}
