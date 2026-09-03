import { useState } from 'react';
import { RuleEditor, RuleField } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useCurrencies, useDimensionMembers } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import type { ProductAssumption, ProductCharacteristicRule } from '@/engine/ruleTypes';

const HQLA_LEVELS = ['Level 1', 'Level 2A', 'Level 2B', 'None'] as const;
const LCR_ROLES = ['HQLA', 'Inflow', 'Outflow', 'None'] as const;

export function ProductCharacteristics() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  // Product is affiliate-owned; a specific affiliate scope is needed to see its catalog - Group scope shows none.
  const { data: products = [] } = useDimensionMembers('Product', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: currencies = [] } = useCurrencies();
  const { data: rules = [], isLoading } = useRules<ProductCharacteristicRule>('ProductCharacteristic');
  const { save, remove, checkDependencies } = useRuleMutations<ProductCharacteristicRule>('ProductCharacteristic');

  const [copyTarget, setCopyTarget] = useState('');

  const leaves = products.filter((p) => p.isLeaf);

  const createDefault = (): ProductCharacteristicRule => ({
    ...newRuleMeta('ProductCharacteristic', 'New product characteristics', user?.name ?? 'unknown'),
    kind: 'ProductCharacteristic',
    assumptions: [],
  });

  const columns: RowColumn<ProductAssumption>[] = [
    {
      key: 'product',
      header: 'Product',
      width: '22%',
      render: (row, update, readOnly) => (
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
          id={`ccy-${row.productCode}-${row.currency}`}
          label="Currency"
          value={row.currency}
          options={currencies.map((c) => c.code)}
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
  ];

  return (
    <RuleEditor<ProductCharacteristicRule>
      title="Product Characteristics"
      description="Basel factors and behavioural attributes per product and currency. Adding a product is a row here, not a code change. Selected on Process Run's Rules panel; a product/currency with no matching assumption keeps whatever classification was loaded, unchanged."
      noun="characteristics rule"
      // This maps source product data to its risk classification (HQLA/LCR/ASF/RSF) - the same kind
      // of data-mapping decision Dimensions and Counterparties are admin-gated for, not an ALM
      // assumption a Risk Analyst should be able to change unilaterally.
      editPermission="data.configure"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.assumptions.length} product-currency assumption(s)`}
      validate={(r) => {
        const seen = new Set<string>();
        for (const a of r.assumptions) {
          const key = `${a.productCode}|${a.currency}`;
          if (seen.has(key)) return `Duplicate assumption for ${a.productCode} in ${a.currency}.`;
          seen.add(key);
          if (a.hqlaLevel !== 'None' && a.hqlaHaircutPct === 0 && a.hqlaLevel !== 'Level 1') {
            return `${a.productCode}: Level 2 assets carry a haircut - 0% is almost certainly wrong.`;
          }
        }
        return null;
      }}
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <RuleRows<ProductAssumption>
            rows={rule.assumptions}
            columns={columns}
            rowKey={(r, i) => `${r.productCode}-${r.currency}-${i}`}
            onChange={(assumptions) => update({ assumptions })}
            readOnly={readOnly}
            addLabel="Add product assumption"
            emptyMessage="No assumptions yet. Add one per product and currency."
            createRow={() => ({
              productCode: leaves[0]?.code ?? '',
              currency: currencies[0]?.code ?? 'USD',
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
                    className="rounded border border-gray-200 px-2 py-1 text-[12px] focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700"
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
                      // Skip products already defined for the target so local overrides aren't clobbered.
                      const existing = new Set(
                        rule.assumptions.filter((a) => a.currency === copyTarget).map((a) => a.productCode),
                      );
                      const copies = rule.assumptions
                        .filter((a) => a.currency !== copyTarget && !existing.has(a.productCode))
                        .map((a) => ({ ...a, currency: copyTarget }));
                      update({ assumptions: [...rule.assumptions, ...copies] });
                      setCopyTarget('');
                    }}
                    className="rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
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
