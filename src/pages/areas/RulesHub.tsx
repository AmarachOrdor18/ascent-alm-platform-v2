import { Link } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { GroupAssumptionsUpload } from '@/components/rules/GroupAssumptionsUpload';
import { useAuth } from '@/context/AuthContext';
import { useRules } from '@/lib/ruleHooks';
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
  return (
    <>
      <ModuleHeader
        title="Rules & scenarios"
        description="The assumptions every run applies, grouped by what they change."
        about="Every save is versioned and each run records the exact version it used."
        asOfDate={null}
      />
      <GroupAssumptionsUpload className="mb-6" />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title} data-tour-section={g.title}>
            <h2 className="mb-3 text-[13px] font-bold uppercase tracking-widest text-navy-900">{g.title}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {g.rules.map((r) => (
                <RuleCard key={r.kind} entry={r} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function RuleCard({ entry }: { entry: RuleEntry }) {
  const { hasPermission } = useAuth();
  const { data: rules = [] } = useRules<RuleMeta>(entry.kind);
  const active = rules.filter((r) => r.isActive).length;
  const canOpen = hasPermission(entry.permission);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-bold text-navy-900">{entry.label}</p>
        <span className={active > 0 ? 'text-[12px] font-bold text-success' : 'text-[12px] font-bold text-gray-400'}>
          {active > 0 ? `${active} active` : 'None defined'}
        </span>
      </div>
      <p className="mt-1 flex-1 text-[13px] leading-relaxed text-gray-500">{entry.effect}</p>
      {canOpen && (
        <Link href={entry.href} className="mt-3 text-[12px] font-bold text-navy-700 hover:underline">
          {rules.length > 0 ? 'View & edit →' : 'Define one →'}
        </Link>
      )}
    </div>
  );
}
