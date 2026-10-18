import { useMemo, useState } from 'react';
import { RuleEditor, RuleField } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useAffiliates, useCurrencies, useDimensionMembers, usePositions } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import type { ProductAssumption, ProductCharacteristicRule } from '@/engine/ruleTypes';

const HQLA_LEVELS = ['Level 1', 'Level 2A', 'Level 2B', 'None'] as const;
const LCR_ROLES = ['HQLA', 'Inflow', 'Outflow', 'None'] as const;

export function ProductCharacteristics() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  // Product is affiliate-owned; a specific affiliate scope is needed to see its catalog - Group scope shows none.
  const { data: products = [] } = useDimensionMembers('Product', affiliateCode === 'GROUP' ? '' : affiliateCode);
  // Common accounts (the common chart of accounts) - a row keyed by one is the fallback for every position on
  // that account whose product has no row of its own (engine/classification.ts buildAssumptionLookup).
  const { data: coaOwn = [] } = useDimensionMembers('CommonCoa', affiliateCode);
  const { data: coaGroup = [] } = useDimensionMembers('CommonCoa', affiliateCode === 'GROUP' ? undefined : 'GROUP');
  const { data: currencies = [] } = useCurrencies();
  const { data: affiliates = [] } = useAffiliates();
  // A new row starts in the scope affiliate's own currency, not whichever code sorts first.
  const defaultCurrency =
    affiliates.find((a) => a.code === affiliateCode && a.code !== 'GROUP')?.functionalCurrency ??
    currencies[0]?.code ??
    'USD';
  const { data: rules = [], isLoading } = useRules<ProductCharacteristicRule>('ProductCharacteristic');
  const { save, remove, checkDependencies } = useRuleMutations<ProductCharacteristicRule>('ProductCharacteristic');

  const [copyTarget, setCopyTarget] = useState('');

  // Product codes as they actually arrive in committed position files count too - a freshly onboarded
  // affiliate has no Product catalogue yet, and requiring one first left these factors (and so LCR/NSFR)
  // impossible to set without a detour through Data → Structure.
  const { data: positions = [] } = usePositions(affiliateCode);
  const leaves = useMemo(() => {
    const catalogue = products.filter((p) => p.isLeaf).map((p) => ({ code: p.code, name: p.name }));
    const known = new Set(catalogue.map((p) => p.code));
    const fromBook = new Map<string, string>();
    for (const p of positions) {
      if (p.productCode && !known.has(p.productCode) && !fromBook.has(p.productCode)) {
        fromBook.set(p.productCode, p.productClass ? `${p.productClass} (${p.productCode})` : p.productCode);
      }
    }
    return [...catalogue, ...[...fromBook].map(([code, name]) => ({ code, name }))].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [products, positions]);

  const commonAccounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of [...coaGroup, ...coaOwn]) if (m.isLeaf !== false) map.set(m.code, `${m.name} (${m.code})`);
    for (const p of positions)
      if (p.commonCoaCode && !map.has(p.commonCoaCode)) map.set(p.commonCoaCode, p.commonCoaCode);
    return [...map].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [coaOwn, coaGroup, positions]);

  const rowLabel = (a: ProductAssumption) => (a.commonCoaCode ? `Common account ${a.commonCoaCode}` : a.productCode);

  const createDefault = (): ProductCharacteristicRule => ({
    ...newRuleMeta('ProductCharacteristic', 'New product characteristics', user?.name ?? 'unknown'),
    kind: 'ProductCharacteristic',
    assumptions: [],
  });

  const columns: RowColumn<ProductAssumption>[] = [
    {
      key: 'appliesTo',
      header: 'Applies to',
      width: '10%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`by-${row.productCode}-${row.commonCoaCode ?? ''}-${row.currency}`}
          label="Applies to"
          value={row.commonCoaCode !== undefined ? 'Common account' : 'Product'}
          options={['Product', 'Common account']}
          disabled={readOnly}
          onChange={(v) =>
            update(
              v === 'Common account'
                ? { productCode: '', commonCoaCode: commonAccounts[0]?.code ?? '' }
                : { productCode: leaves[0]?.code ?? '', commonCoaCode: undefined },
            )
          }
        />
      ),
    },
    {
      key: 'product',
      header: 'Product / common account',
      width: '20%',
      render: (row, update, readOnly) =>
        row.commonCoaCode !== undefined ? (
          <RowSelect
            id={`coa-${row.commonCoaCode}-${row.currency}`}
            label="Common account"
            value={row.commonCoaCode}
            options={commonAccounts.map((c) => ({ value: c.code, label: c.name }))}
            disabled={readOnly}
            onChange={(v) => update({ commonCoaCode: v })}
          />
        ) : (
          <RowSelect
            id={`prod-${row.productCode}-${row.currency}`}
            label="Product"
            value={row.productCode}
            options={leaves.map((p) => ({ value: p.code, label: p.name }))}
            disabled={readOnly}
            onChange={(v) => update({ productCode: v })}
          />
        ),
    },
    {
      key: 'currency',
      header: 'Currency',
      width: '9%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ccy-${row.productCode}-${row.commonCoaCode ?? ''}-${row.currency}`}
          label="Currency"
          value={row.currency}
          // A common-account row may apply to any currency ("*").
          options={
            row.commonCoaCode !== undefined
              ? [{ value: '*', label: 'Any' }, ...currencies.map((c) => ({ value: c.code, label: c.code }))]
              : currencies.map((c) => ({ value: c.code, label: c.code }))
          }
          disabled={readOnly}
          onChange={(v) => update({ currency: v })}
        />
      ),
    },
    {
      key: 'lcrRole',
      header: 'LCR role',
      width: '10%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`lcrrole-${row.productCode}-${row.currency}`}
          label="LCR role"
          value={row.lcrCashflowRole}
          options={LCR_ROLES}
          disabled={readOnly}
          onChange={(v) => update({ lcrCashflowRole: v })}
        />
      ),
    },
    {
      key: 'lcr',
      header: 'LCR rate %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`lcr-${row.productCode}-${row.currency}`}
          label="LCR rate"
          type="number"
          step="0.1"
          value={row.lcrRatePct ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ lcrRatePct: v === '' ? null : Number(v) })}
        />
      ),
    },
    {
      key: 'asf',
      header: 'ASF %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`asf-${row.productCode}-${row.currency}`}
          label="ASF factor"
          type="number"
          step="1"
          value={row.asfFactorPct ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ asfFactorPct: v === '' ? null : Number(v) })}
        />
      ),
    },
    {
      key: 'rsf',
      header: 'RSF %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`rsf-${row.productCode}-${row.currency}`}
          label="RSF factor"
          type="number"
          step="1"
          value={row.rsfFactorPct ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ rsfFactorPct: v === '' ? null : Number(v) })}
        />
      ),
    },
    {
      key: 'hqla',
      header: 'HQLA level',
      width: '11%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`hq-${row.productCode}-${row.currency}`}
          label="HQLA level"
          value={row.hqlaLevel}
          options={HQLA_LEVELS}
          disabled={readOnly}
          onChange={(v) => update({ hqlaLevel: v })}
        />
      ),
    },
    {
      key: 'haircut',
      header: 'Haircut %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`hc-${row.productCode}-${row.currency}`}
          label="HQLA haircut"
          type="number"
          step="1"
          value={row.hqlaHaircutPct}
          disabled={readOnly}
          onChange={(v) => update({ hqlaHaircutPct: Number(v) })}
        />
      ),
    },
    {
      key: 'duration',
      header: 'Duration (yrs)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`dur-${row.productCode}-${row.currency}`}
          label="Duration"
          type="number"
          step="0.01"
          value={row.approxDurationYears ?? ''}
          disabled={readOnly}
          onChange={(v) => update({ approxDurationYears: v === '' ? null : Number(v) })}
        />
      ),
    },
    {
      // Applied to every matching position (it overrides the file's own flag), so it has to be visible -
      // otherwise cash and capital rows silently become rate-sensitive in the repricing gap.
      key: 'rateSensitive',
      header: 'Rate-sensitive',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`rs-${row.productCode}-${row.currency}`}
          label="Rate-sensitive"
          value={row.isRateSensitive ? 'Yes' : 'No'}
          options={['Yes', 'No']}
          disabled={readOnly}
          onChange={(v) => update({ isRateSensitive: v === 'Yes' })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<ProductCharacteristicRule>
      title="Product Characteristics"
      description="Basel factors and behavioural attributes per product and currency."
      about="Adding a product is a row here, not a code change. A row can instead be keyed by a common account: it then covers every position on that account whose product has no row of its own (same currency first, then a row for any currency). A position matching neither keeps whatever classification was loaded, and is reported as Not classified when it carries none."
      noun="characteristics rule"
      // rules.edit, like every other assumption (teardown §5.3): an ALM Analyst or Affiliate Admin can fix a
      // "Not classified" gap; maker-checker (an Approver) still decides before a run uses it.
      editPermission="rules.edit"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => {
        const coa = r.assumptions.filter((a) => a.commonCoaCode).length;
        return `${r.assumptions.length - coa} product-currency assumption(s)${coa > 0 ? `, ${coa} common-account fallback(s)` : ''}`;
      }}
      validate={(r) => {
        const seen = new Set<string>();
        for (const a of r.assumptions) {
          if (a.commonCoaCode !== undefined && !a.commonCoaCode)
            return 'Choose a common account for every common-account row.';
          if (a.commonCoaCode === undefined && !a.productCode) return 'Choose a product for every product row.';
          const key = a.commonCoaCode
            ? `coa:${a.commonCoaCode}|${a.currency || '*'}`
            : `${a.productCode}|${a.currency}`;
          if (seen.has(key))
            return `Duplicate assumption for ${rowLabel(a)} in ${a.currency === '*' || !a.currency ? 'any currency' : a.currency}.`;
          seen.add(key);
          if (a.hqlaLevel !== 'None' && a.hqlaHaircutPct === 0 && a.hqlaLevel !== 'Level 1') {
            return `${rowLabel(a)}: Level 2 assets carry a haircut - 0% is almost certainly wrong.`;
          }
        }
        return null;
      }}
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <RuleRows<ProductAssumption>
            rows={rule.assumptions}
            columns={columns}
            rowKey={(r, i) => `${r.productCode}-${r.commonCoaCode ?? ''}-${r.currency}-${i}`}
            onChange={(assumptions) => update({ assumptions })}
            readOnly={readOnly}
            addLabel="Add assumption"
            emptyMessage="No assumptions yet. Add one per product and currency, or one per common account to cover a whole account family."
            createRow={() => ({
              productCode: leaves[0]?.code ?? '',
              currency: defaultCurrency,
              lcrCashflowRole: 'None',
              lcrRatePct: null,
              asfFactorPct: null,
              rsfFactorPct: null,
              hqlaLevel: 'None',
              hqlaHaircutPct: 0,
              approxDurationYears: null,
              isRateSensitive: true,
            })}
          />

          {!readOnly && rule.assumptions.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-4">
              <RuleField label="Copy across currencies">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={copyTarget}
                    onChange={(e) => setCopyTarget(e.target.value)}
                    aria-label="Target currency"
                    className="rounded border border-gray-200 px-2 py-1 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
                  >
                    <option value="">- target currency -</option>
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!copyTarget}
                    onClick={() => {
                      // Skip rows already defined for the target so local overrides aren't clobbered; an
                      // "any currency" common-account row already covers every currency.
                      const keyOf = (a: ProductAssumption) =>
                        a.commonCoaCode ? `coa:${a.commonCoaCode}` : a.productCode;
                      const existing = new Set(rule.assumptions.filter((a) => a.currency === copyTarget).map(keyOf));
                      const copies = rule.assumptions
                        .filter((a) => a.currency !== copyTarget && a.currency !== '*' && !existing.has(keyOf(a)))
                        .map((a) => ({ ...a, currency: copyTarget }));
                      update({ assumptions: [...rule.assumptions, ...copies] });
                      setCopyTarget('');
                    }}
                    className="rounded-lg bg-navy-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                  >
                    Copy across
                  </button>
                </div>
              </RuleField>
            </div>
          )}
        </div>
      )}
    />
  );
}
