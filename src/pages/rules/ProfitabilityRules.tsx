// Editors for the three rule kinds behind multi-layer profitability (engine/profitabilityLayers.ts):
// operating-expense cost pools, expected credit loss and the capital charge. Each is approval-gated - a
// Process Run can only select one once a second user has signed it off.

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { RuleEditor, RuleField, ruleInput, ruleNumber } from '@/components/ui/RuleEditor';
import { HierarchyBrowser } from '@/components/ui/HierarchyBrowser';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useCurrencies } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { repository } from '@/store/repositoryInstance';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import type { CostDriver, CostPool, CreditLossMethod } from '@/engine/profitabilityLayers';
import type { CapitalAllocationRuleDef, CostAllocationRuleDef, CreditLossRuleDef } from '@/engine/ruleTypes';
import type { DimensionMember, DimensionType } from '@/engine/types';

// ─────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────

/**
 * Dimension members for the current scope. At Group scope a profitability rule applies to a run spanning
 * every affiliate, so it lists every affiliate's members (deduplicated by code) rather than none.
 */
function useScopeMembers(dimension: DimensionType): DimensionMember[] {
  const { affiliateCode } = useScope();
  const { data = [] } = useQuery({
    queryKey: ['dimension', dimension, 'profitability-scope', affiliateCode],
    queryFn: () => repository.listDimensionMembers(dimension, affiliateCode === 'GROUP' ? undefined : affiliateCode),
  });
  return useMemo(() => {
    const byCode = new Map<string, DimensionMember>();
    for (const m of data) if (!byCode.has(m.code)) byCode.set(m.code, m);
    return Array.from(byCode.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [data]);
}

/** Parses a numeric input; blank means "not set". */
const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));

function Help({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-gray-500">{children}</p>;
}

function MissingMembers({ dimension }: { dimension: string }) {
  return (
    <p className="rounded-lg bg-warning-bg px-3 py-2 text-[12px] leading-relaxed text-warning">
      No {dimension} members are defined for this scope yet. Add them under{' '}
      <Link href="/data/structure" className="font-bold underline">
        Data → Structure &amp; counterparties
      </Link>{' '}
      first - this grid lists them.
    </p>
  );
}

/** A grid of one numeric input per dimension member, keyed by member code. */
function MemberGrid({
  members,
  values,
  onChange,
  readOnly,
  unit,
  idPrefix,
  placeholder,
}: {
  members: DimensionMember[];
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  readOnly: boolean;
  unit: string;
  idPrefix: string;
  placeholder?: string;
}) {
  const set = (code: string, raw: string) => {
    const next = { ...values };
    const v = num(raw);
    if (v === undefined || Number.isNaN(v)) delete next[code];
    else next[code] = v;
    onChange(next);
  };
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
      <table className="min-w-full text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-200">
            <th
              scope="col"
              className="px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400"
            >
              Code
            </th>
            <th
              scope="col"
              className="px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400"
            >
              Name
            </th>
            <th
              scope="col"
              className="w-32 px-3 py-1.5 text-right text-[11px] font-bold uppercase tracking-wider text-gray-400"
            >
              {unit}
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.code} className="border-b border-gray-50">
              <td className="px-3 py-1 font-mono text-[12px] text-navy-900">{m.code}</td>
              <td className="px-3 py-1 text-gray-600">{m.name}</td>
              <td className="px-3 py-1">
                <label htmlFor={`${idPrefix}-${m.code}`} className="sr-only">
                  {`${unit} for ${m.name}`}
                </label>
                <input
                  id={`${idPrefix}-${m.code}`}
                  type="number"
                  step="any"
                  value={values[m.code] ?? ''}
                  placeholder={placeholder}
                  disabled={readOnly}
                  onChange={(e) => set(m.code, e.target.value)}
                  className={ruleNumber}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cost allocation
// ─────────────────────────────────────────────────────────────────────────

const DRIVERS: Array<{ value: CostDriver; label: string; help: string }> = [
  {
    value: 'Balance',
    label: 'Balance',
    help: 'Spread pro rata to each position’s balance - bigger books carry more cost.',
  },
  {
    value: 'AccountCount',
    label: 'Account count',
    help: 'An equal share per account - suits per-account servicing costs (cards, statements).',
  },
  {
    value: 'Headcount',
    label: 'Headcount',
    help: 'Split across business units by the staff numbers entered below, then by balance within each unit.',
  },
  {
    value: 'Fixed',
    label: 'Fixed shares',
    help: 'You set the percentage each business unit (or product) carries; the shares must add up to 100%.',
  },
];

let poolCounter = 0;
function newPool(): CostPool {
  poolCounter += 1;
  return { id: `POOL-${Date.now().toString(36).toUpperCase()}-${poolCounter}`, name: '', amount: 0, driver: 'Balance' };
}

function fixedShareTotal(pool: CostPool): number {
  return Object.values(pool.fixedShares ?? {}).reduce((s, v) => s + v, 0);
}

export function validateCostAllocation(rule: CostAllocationRuleDef): string | null {
  if (!rule.currency) return 'Choose the currency the pool amounts are entered in.';
  if (rule.pools.length === 0) return 'Add at least one cost pool.';
  const names = new Set<string>();
  for (const p of rule.pools) {
    if (!p.name.trim()) return 'Every cost pool needs a name.';
    if (names.has(p.name.trim().toLowerCase())) return `Two pools are called "${p.name}".`;
    names.add(p.name.trim().toLowerCase());
    if (!Number.isFinite(p.amount) || p.amount <= 0) return `Pool "${p.name}" needs an annual amount above zero.`;
    if (p.driver === 'Fixed') {
      const total = fixedShareTotal(p);
      if (Object.keys(p.fixedShares ?? {}).length === 0)
        return `Pool "${p.name}" uses fixed shares but none are entered.`;
      if (Math.abs(total - 100) > 0.0001)
        return `Pool "${p.name}": fixed shares total ${total.toFixed(2)}% - they must total 100%.`;
    }
    if (p.driver === 'Headcount') {
      const targets = p.targets?.orgUnitCodes ?? [];
      const heads = Object.entries(rule.headcountByOrgUnit ?? {}).filter(
        ([ou, n]) => n > 0 && (targets.length === 0 || targets.includes(ou)),
      );
      if (heads.length === 0)
        return `Pool "${p.name}" is allocated by headcount, but no headcount is entered for its business units.`;
    }
  }
  for (const [ou, n] of Object.entries(rule.headcountByOrgUnit ?? {})) {
    if (n < 0) return `Headcount for ${ou} cannot be negative.`;
  }
  return null;
}

export function CostAllocationRules() {
  const { user } = useAuth();
  const { currency: scopeCurrency } = useScope();
  const { data: currencies = [] } = useCurrencies();
  const orgUnits = useScopeMembers('OrgUnit');
  const products = useScopeMembers('Product');
  const { data: rules = [], isLoading } = useRules<CostAllocationRuleDef>('CostAllocation');
  const { save, remove, checkDependencies } = useRuleMutations<CostAllocationRuleDef>('CostAllocation');
  const [openPoolId, setOpenPoolId] = useState<string | null>(null);

  const orgLeaves = orgUnits.filter((m) => m.isLeaf);
  const productLeaves = products.filter((m) => m.isLeaf);
  const currencyCodes = Array.from(
    new Set([scopeCurrency, ...currencies.filter((c) => c.isActive).map((c) => c.code)]),
  );

  return (
    <RuleEditor<CostAllocationRuleDef>
      title="Operating Cost Allocation"
      description="Annual operating-expense pools and how each is spread across business units, products and accounts - the opex layer of multi-layer profitability."
      noun="cost allocation rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('CostAllocation', 'New cost allocation', user?.name ?? 'unknown'),
        kind: 'CostAllocation',
        currency: scopeCurrency,
        pools: [],
        headcountByOrgUnit: {},
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) =>
        `${r.pools.length} pool(s), ${formatAmount(
          r.pools.reduce((s, p) => s + p.amount, 0),
          r.currency,
          { compact: true },
        )} a year`
      }
      validate={validateCostAllocation}
      guidance={
        <>
          <span className="font-bold">What this does.</span> Enter each operating cost budget (branch network, IT, head
          office…) as an annual amount, then say how it should be shared out. A run spreads every pool onto the
          positions it covers, and the Profitability results show allocated + unallocated = the pool, so nothing goes
          missing. Amounts must be in the run&apos;s reporting currency - the affiliate&apos;s own currency for an
          affiliate run, USD for a Group run. Saving submits the rule for approval; a run can only select it once a
          second user approves it.
        </>
      }
      renderBody={(rule, update, readOnly) => {
        const setPool = (id: string, patch: Partial<CostPool>) =>
          update({ pools: rule.pools.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
        const total = rule.pools.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0);
        const usesHeadcount = rule.pools.some((p) => p.driver === 'Headcount');
        return (
          <div className="space-y-6">
            <RuleField
              label="Currency of the pool amounts"
              hint="Must match the reporting currency of the run that uses this rule - otherwise the profitability element fails rather than mixing currencies."
            >
              <select
                value={rule.currency}
                disabled={readOnly}
                onChange={(e) => update({ currency: e.target.value })}
                className={cn(ruleInput, 'max-w-[10rem]')}
                aria-label="Currency of the pool amounts"
              >
                {currencyCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </RuleField>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-[12px] font-bold uppercase tracking-wider text-navy-900">Cost pools</h3>
                <span className="text-[12px] text-gray-500">
                  Total <span className="font-mono font-bold text-navy-900">{formatAmount(total, rule.currency)}</span>{' '}
                  a year
                </span>
              </div>
              {rule.pools.length === 0 && (
                <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-[13px] text-gray-400">
                  No cost pools yet. Add one per budget line you want to allocate.
                </p>
              )}
              <div className="space-y-3">
                {rule.pools.map((pool, i) => {
                  const open = openPoolId === pool.id;
                  const shareMembers = pool.fixedShareKey === 'productCode' ? productLeaves : orgLeaves;
                  const shareTotal = fixedShareTotal(pool);
                  const targetCount =
                    (pool.targets?.orgUnitCodes?.length ?? 0) + (pool.targets?.productCodes?.length ?? 0);
                  return (
                    <div key={pool.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1.3fr_1.3fr_auto]">
                        <RuleField label={`Pool ${i + 1} name`}>
                          <input
                            value={pool.name}
                            disabled={readOnly}
                            placeholder="e.g. Branch network"
                            onChange={(e) => setPool(pool.id, { name: e.target.value })}
                            className={ruleInput}
                            aria-label={`Pool ${i + 1} name`}
                          />
                        </RuleField>
                        <RuleField label={`Annual amount (${rule.currency})`}>
                          <input
                            type="number"
                            step="any"
                            value={Number.isFinite(pool.amount) ? pool.amount : ''}
                            disabled={readOnly}
                            onChange={(e) => setPool(pool.id, { amount: Number(e.target.value) })}
                            className={ruleNumber}
                            aria-label={`Pool ${i + 1} annual amount`}
                          />
                        </RuleField>
                        <RuleField label="Allocated by">
                          <select
                            value={pool.driver}
                            disabled={readOnly}
                            onChange={(e) => setPool(pool.id, { driver: e.target.value as CostDriver })}
                            className={ruleInput}
                            aria-label={`Pool ${i + 1} driver`}
                          >
                            {DRIVERS.map((d) => (
                              <option key={d.value} value={d.value}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </RuleField>
                        <div className="flex items-end gap-3 pb-1">
                          <button
                            type="button"
                            onClick={() => setOpenPoolId(open ? null : pool.id)}
                            className="text-[12px] font-bold text-navy-700 hover:underline"
                            aria-expanded={open}
                          >
                            {open ? 'Hide detail' : `Targets${pool.driver === 'Fixed' ? ' & shares' : ''}`}
                          </button>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => update({ pools: rule.pools.filter((p) => p.id !== pool.id) })}
                              className="text-[12px] font-bold text-danger hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                        {DRIVERS.find((d) => d.value === pool.driver)?.help}{' '}
                        {targetCount === 0
                          ? 'Covers every business unit and product.'
                          : `Restricted to ${targetCount} selected member(s).`}
                        {pool.driver === 'Fixed' && (
                          <span className={Math.abs(shareTotal - 100) < 0.0001 ? 'text-success' : 'text-danger'}>
                            {' '}
                            Shares total {shareTotal.toFixed(2)}%.
                          </span>
                        )}
                      </p>

                      {open && (
                        <div className="mt-3 space-y-4 border-t border-gray-100 pt-3">
                          <Help>
                            Optional: restrict this pool to some business units and/or products. Leave both empty to
                            spread it over the whole book. Picking a parent selects everything beneath it.
                          </Help>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <HierarchyBrowser
                              members={orgUnits}
                              selectedCodes={pool.targets?.orgUnitCodes ?? []}
                              onChange={(codes) =>
                                !readOnly && setPool(pool.id, { targets: { ...pool.targets, orgUnitCodes: codes } })
                              }
                              label="Business units this pool covers"
                            />
                            <HierarchyBrowser
                              members={products}
                              selectedCodes={pool.targets?.productCodes ?? []}
                              onChange={(codes) =>
                                !readOnly && setPool(pool.id, { targets: { ...pool.targets, productCodes: codes } })
                              }
                              label="Products this pool covers"
                            />
                          </div>

                          {pool.driver === 'Fixed' && (
                            <div className="space-y-2">
                              <RuleField label="Fixed shares are set per">
                                <select
                                  value={pool.fixedShareKey ?? 'orgUnitCode'}
                                  disabled={readOnly}
                                  onChange={(e) =>
                                    setPool(pool.id, {
                                      fixedShareKey: e.target.value as 'orgUnitCode' | 'productCode',
                                      fixedShares: {},
                                    })
                                  }
                                  className={cn(ruleInput, 'max-w-[14rem]')}
                                  aria-label="Fixed shares are set per"
                                >
                                  <option value="orgUnitCode">Business unit</option>
                                  <option value="productCode">Product</option>
                                </select>
                              </RuleField>
                              {shareMembers.length === 0 ? (
                                <MissingMembers
                                  dimension={pool.fixedShareKey === 'productCode' ? 'Product' : 'Org unit'}
                                />
                              ) : (
                                <MemberGrid
                                  members={shareMembers}
                                  values={pool.fixedShares ?? {}}
                                  onChange={(fixedShares) => setPool(pool.id, { fixedShares })}
                                  readOnly={readOnly}
                                  unit="Share %"
                                  idPrefix={`share-${pool.id}`}
                                />
                              )}
                              <p
                                className={cn(
                                  'text-right text-[12px] font-bold',
                                  Math.abs(shareTotal - 100) < 0.0001 ? 'text-success' : 'text-danger',
                                )}
                              >
                                Total {shareTotal.toFixed(2)}%{' '}
                                {Math.abs(shareTotal - 100) < 0.0001 ? '✓' : '- must be 100%'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    const p = newPool();
                    update({ pools: [...rule.pools, p] });
                    setOpenPoolId(null);
                  }}
                  className="mt-2 text-[12px] font-bold text-navy-700 hover:text-navy-900"
                >
                  Add cost pool
                </button>
              )}
            </div>

            <div>
              <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wider text-navy-900">
                Headcount by business unit
              </h3>
              <Help>
                Staff numbers per business unit, used only by pools allocated by headcount. A unit left blank carries
                none of a headcount pool; if no unit a pool covers has staff entered, that pool cannot be allocated.
                {!usesHeadcount && ' No pool uses headcount yet, so these are optional.'}
              </Help>
              <div className="mt-2">
                {orgLeaves.length === 0 ? (
                  <MissingMembers dimension="Org unit" />
                ) : (
                  <MemberGrid
                    members={orgLeaves}
                    values={rule.headcountByOrgUnit ?? {}}
                    onChange={(headcountByOrgUnit) => update({ headcountByOrgUnit })}
                    readOnly={readOnly}
                    unit="Headcount"
                    idPrefix="heads"
                  />
                )}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Credit loss
// ─────────────────────────────────────────────────────────────────────────

export function validateCreditLoss(rule: CreditLossRuleDef): string | null {
  const pct = (v: number | undefined, label: string) =>
    v !== undefined && (!Number.isFinite(v) || v < 0 || v > 100) ? `${label} must be between 0 and 100%.` : null;
  if (rule.method === 'PdLgd') {
    for (const [code, v] of Object.entries(rule.pdByProduct ?? {})) {
      const e = pct(v, `PD for ${code}`);
      if (e) return e;
    }
    for (const [code, v] of Object.entries(rule.lgdByProduct ?? {})) {
      const e = pct(v, `LGD for ${code}`);
      if (e) return e;
    }
    const e = pct(rule.defaultPdPct, 'Default PD') ?? pct(rule.defaultLgdPct, 'Default LGD');
    if (e) return e;
    const anyPd = Object.keys(rule.pdByProduct ?? {}).length > 0 || rule.defaultPdPct !== undefined;
    const anyLgd = Object.keys(rule.lgdByProduct ?? {}).length > 0 || rule.defaultLgdPct !== undefined;
    if (!anyPd || !anyLgd) return 'Enter a PD and an LGD - per product, or a default for every product.';
  } else if (!rule.useProvisionAmount) {
    return 'The provision method needs "Use booked provisions" switched on - there is no other provision source.';
  }
  return null;
}

export function CreditLossRules() {
  const { user } = useAuth();
  const products = useScopeMembers('Product');
  const { data: rules = [], isLoading } = useRules<CreditLossRuleDef>('CreditLoss');
  const { save, remove, checkDependencies } = useRuleMutations<CreditLossRuleDef>('CreditLoss');
  const productLeaves = products.filter((m) => m.isLeaf);

  return (
    <RuleEditor<CreditLossRuleDef>
      title="Expected Credit Loss"
      description="How the expected credit loss charge is attributed to each loan - the ECL layer of multi-layer profitability."
      noun="credit loss rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('CreditLoss', 'New credit loss rule', user?.name ?? 'unknown'),
        kind: 'CreditLoss',
        method: 'PdLgd',
        pdByProduct: {},
        lgdByProduct: {},
        useProvisionAmount: true,
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) =>
        r.method === 'PdLgd'
          ? `PD × LGD, ${Object.keys(r.pdByProduct ?? {}).length} product(s) set${r.defaultPdPct !== undefined ? ', with default' : ''}`
          : 'Booked provisions'
      }
      validate={validateCreditLoss}
      guidance={
        <>
          <span className="font-bold">What this does.</span> Each loan is charged the annual loss the bank expects on
          it. <span className="font-bold">PD × LGD</span>: balance × probability of default in the next 12 months × loss
          if it defaults, set per product. <span className="font-bold">Booked provisions</span>: the provision already
          held on each loan (from the uploaded position data) is taken as the annual charge. A loan with no PD/LGD and
          no default is reported as &ldquo;ECL missing&rdquo; on the results, never as zero. Liabilities carry no credit
          loss. Saving submits the rule for approval.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-5">
          <RuleField label="Method">
            <select
              value={rule.method}
              disabled={readOnly}
              onChange={(e) => update({ method: e.target.value as CreditLossMethod })}
              className={cn(ruleInput, 'max-w-[18rem]')}
              aria-label="Credit loss method"
            >
              <option value="PdLgd">PD × LGD per product</option>
              <option value="ProvisionChange">Booked provisions</option>
            </select>
          </RuleField>

          <div className="flex items-start gap-2">
            <input
              id="ecl-use-provisions"
              type="checkbox"
              checked={rule.useProvisionAmount}
              disabled={readOnly}
              onChange={(e) => update({ useProvisionAmount: e.target.checked })}
              className="mt-0.5 accent-gold-500"
            />
            <label htmlFor="ecl-use-provisions" className="cursor-pointer text-[13px] text-navy-900">
              Use booked provisions
              <span className="block text-[11px] leading-relaxed text-gray-400">
                {rule.method === 'PdLgd'
                  ? 'Non-performing loans (Substandard, Doubtful, Loss) that carry a provision use it instead of PD × LGD.'
                  : 'Required for this method - the provision stock on each loan is taken as its annual charge.'}
              </span>
            </label>
          </div>

          {rule.method === 'PdLgd' && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RuleField
                  label="Default PD %"
                  hint="Used for any product with no PD below. Leave blank to report those products as ECL missing."
                >
                  <input
                    type="number"
                    step="any"
                    value={rule.defaultPdPct ?? ''}
                    disabled={readOnly}
                    onChange={(e) => update({ defaultPdPct: num(e.target.value) })}
                    className={ruleNumber}
                    aria-label="Default PD percent"
                  />
                </RuleField>
                <RuleField label="Default LGD %" hint="Used for any product with no LGD below.">
                  <input
                    type="number"
                    step="any"
                    value={rule.defaultLgdPct ?? ''}
                    disabled={readOnly}
                    onChange={(e) => update({ defaultLgdPct: num(e.target.value) })}
                    className={ruleNumber}
                    aria-label="Default LGD percent"
                  />
                </RuleField>
              </div>

              <div>
                <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wider text-navy-900">
                  PD and LGD by product
                </h3>
                <Help>
                  12-month probability of default and loss given default, in percent. Blank uses the default above. Only
                  lending products need a value - deposits carry no credit loss.
                </Help>
                <div className="mt-2">
                  {productLeaves.length === 0 ? (
                    <MissingMembers dimension="Product" />
                  ) : (
                    <PdLgdGrid
                      products={productLeaves}
                      pd={rule.pdByProduct ?? {}}
                      lgd={rule.lgdByProduct ?? {}}
                      onChange={(pdByProduct, lgdByProduct) => update({ pdByProduct, lgdByProduct })}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    />
  );
}

function PdLgdGrid({
  products,
  pd,
  lgd,
  onChange,
  readOnly,
}: {
  products: DimensionMember[];
  pd: Record<string, number>;
  lgd: Record<string, number>;
  onChange: (pd: Record<string, number>, lgd: Record<string, number>) => void;
  readOnly: boolean;
}) {
  const set = (which: 'pd' | 'lgd', code: string, raw: string) => {
    const next = { ...(which === 'pd' ? pd : lgd) };
    const v = num(raw);
    if (v === undefined || Number.isNaN(v)) delete next[code];
    else next[code] = v;
    if (which === 'pd') onChange(next, lgd);
    else onChange(pd, next);
  };
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
      <table className="min-w-full text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            <th scope="col" className="px-3 py-1.5 text-left">
              Product
            </th>
            <th scope="col" className="w-28 px-3 py-1.5 text-right">
              PD %
            </th>
            <th scope="col" className="w-28 px-3 py-1.5 text-right">
              LGD %
            </th>
            <th scope="col" className="w-24 px-3 py-1.5 text-right">
              PD × LGD
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((m) => {
            const loss =
              pd[m.code] !== undefined && lgd[m.code] !== undefined ? (pd[m.code]! * lgd[m.code]!) / 100 : null;
            return (
              <tr key={m.code} className="border-b border-gray-50">
                <td className="px-3 py-1">
                  <span className="font-mono text-[12px] text-navy-900">{m.code}</span>{' '}
                  <span className="text-gray-500">{m.name}</span>
                </td>
                {(['pd', 'lgd'] as const).map((which) => (
                  <td key={which} className="px-3 py-1">
                    <label htmlFor={`${which}-${m.code}`} className="sr-only">
                      {`${which.toUpperCase()} for ${m.name}`}
                    </label>
                    <input
                      id={`${which}-${m.code}`}
                      type="number"
                      step="any"
                      value={(which === 'pd' ? pd : lgd)[m.code] ?? ''}
                      placeholder="default"
                      disabled={readOnly}
                      onChange={(e) => set(which, m.code, e.target.value)}
                      className={ruleNumber}
                    />
                  </td>
                ))}
                <td className="px-3 py-1 text-right font-mono text-[12px] text-gray-500">
                  {loss === null ? '-' : `${loss.toFixed(3)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Capital
// ─────────────────────────────────────────────────────────────────────────

export function validateCapital(rule: CapitalAllocationRuleDef): string | null {
  for (const [code, v] of Object.entries(rule.riskWeightByProductClass)) {
    if (!Number.isFinite(v) || v < 0) return `Risk weight for ${code} must be zero or more.`;
  }
  if (!Number.isFinite(rule.defaultRiskWeightPct) || rule.defaultRiskWeightPct < 0)
    return 'Default risk weight must be zero or more.';
  if (!Number.isFinite(rule.capitalRatioPct) || rule.capitalRatioPct <= 0 || rule.capitalRatioPct > 100) {
    return 'Capital ratio must be above 0% and at most 100%.';
  }
  if (!Number.isFinite(rule.costOfCapitalPct) || rule.costOfCapitalPct < 0)
    return 'Cost of capital must be zero or more.';
  if (
    rule.taxRatePct !== undefined &&
    (!Number.isFinite(rule.taxRatePct) || rule.taxRatePct < 0 || rule.taxRatePct >= 100)
  ) {
    return 'Tax rate must be between 0% and 100%.';
  }
  return null;
}

export function CapitalRules() {
  const { user } = useAuth();
  const coa = useScopeMembers('CommonCoa');
  const { data: rules = [], isLoading } = useRules<CapitalAllocationRuleDef>('CapitalAllocation');
  const { save, remove, checkDependencies } = useRuleMutations<CapitalAllocationRuleDef>('CapitalAllocation');
  const coaLeaves = coa.filter((m) => m.isLeaf);

  return (
    <RuleEditor<CapitalAllocationRuleDef>
      title="Capital Charge"
      description="Risk weights, the capital held against them and the return that capital must earn - the capital layer of multi-layer profitability, and the basis of RAROC."
      noun="capital rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() =>
        ({
          ...newRuleMeta('CapitalAllocation', 'New capital rule', user?.name ?? 'unknown'),
          kind: 'CapitalAllocation',
          riskWeightByProductClass: {},
          defaultRiskWeightPct: Number.NaN,
          capitalRatioPct: Number.NaN,
          costOfCapitalPct: Number.NaN,
        }) as CapitalAllocationRuleDef
      }
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) =>
        `Capital ${r.capitalRatioPct}% of RWA at ${r.costOfCapitalPct}% cost, ${Object.keys(r.riskWeightByProductClass).length} weight(s)`
      }
      validate={validateCapital}
      guidance={
        <>
          <span className="font-bold">What this does.</span> Every loan or other asset ties up capital. Its{' '}
          <span className="font-bold">risk-weighted assets</span> = balance × risk weight; the{' '}
          <span className="font-bold">capital allocated</span> = RWA × capital ratio; the{' '}
          <span className="font-bold">capital charge</span> = that capital × the cost of capital (the return
          shareholders require). RAROC = profit before the capital charge, after tax, ÷ allocated capital. Liabilities
          carry no capital. Weights are simplified standardised weights by product class. Saving submits the rule for
          approval.
        </>
      }
      renderBody={(rule, update, readOnly) => {
        const field = (
          label: string,
          hint: string,
          value: number | undefined,
          set: (v: number | undefined) => void,
          aria: string,
        ) => (
          <RuleField label={label} hint={hint}>
            <input
              type="number"
              step="any"
              value={value === undefined || Number.isNaN(value) ? '' : value}
              disabled={readOnly}
              onChange={(e) => set(num(e.target.value))}
              className={ruleNumber}
              aria-label={aria}
            />
          </RuleField>
        );
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field(
                'Capital ratio % of RWA',
                'Capital held per unit of risk-weighted assets, e.g. 12.5 for a 12.5% total capital requirement plus buffers.',
                rule.capitalRatioPct,
                (v) => update({ capitalRatioPct: v ?? Number.NaN }),
                'Capital ratio percent',
              )}
              {field(
                'Cost of capital %',
                'Annual return the capital must earn (hurdle rate), e.g. 18.',
                rule.costOfCapitalPct,
                (v) => update({ costOfCapitalPct: v ?? Number.NaN }),
                'Cost of capital percent',
              )}
              {field(
                'Tax rate % (optional)',
                'Applied in RAROC. Leave blank for a pre-tax RAROC.',
                rule.taxRatePct,
                (v) => update({ taxRatePct: v }),
                'Tax rate percent',
              )}
              {field(
                'Default risk weight %',
                'Used for any asset whose product class has no weight below, e.g. 100.',
                rule.defaultRiskWeightPct,
                (v) => update({ defaultRiskWeightPct: v ?? Number.NaN }),
                'Default risk weight percent',
              )}
            </div>

            <div>
              <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wider text-navy-900">
                Risk weight by product class
              </h3>
              <Help>
                One weight per Common Chart of Accounts class, in percent (0 for cash and sovereign bonds, 100 for
                corporate loans, 75 for retail…). Blank uses the default above.
              </Help>
              <div className="mt-2">
                {coaLeaves.length === 0 ? (
                  <MissingMembers dimension="Common COA" />
                ) : (
                  <MemberGrid
                    members={coaLeaves}
                    values={rule.riskWeightByProductClass}
                    onChange={(riskWeightByProductClass) => update({ riskWeightByProductClass })}
                    readOnly={readOnly}
                    unit="Risk weight %"
                    idPrefix="rw"
                    placeholder="default"
                  />
                )}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
