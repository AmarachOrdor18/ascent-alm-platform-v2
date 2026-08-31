import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { TierAllocationBar, paletteTone, type AllocationSegment } from '@/components/ui/TierAllocationBar';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useDimensionMembers, useYieldCurves } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { allocationError } from '@/engine/ruleTypes';
import type {
  DiscountAssignment,
  DiscountMethodRule,
  FilterCondition,
  FilterKind,
  FilterOperator,
  FilterRule,
  PatternPhase,
  PatternType,
  PaymentRepricingRule,
  PrepaymentAssumption,
  PrepaymentMethod,
  PrepaymentRule,
} from '@/engine/ruleTypes';

// ─────────────────────────────────────────────────────────────────────────
// Prepayment & Early Redemption — screen 20
// ─────────────────────────────────────────────────────────────────────────

const PREPAYMENT_METHODS: Array<{ value: PrepaymentMethod; label: string }> = [
  { value: 'None', label: 'No prepayment' },
  { value: 'ConstantRate', label: 'Constant rate (CPR)' },
  { value: 'RateDependent', label: 'Rate-dependent' },
];

export function PrepaymentRules() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: coa = [] } = useDimensionMembers('CommonCoa', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: rules = [], isLoading } = useRules<PrepaymentRule>('Prepayment');
  const { save, remove, checkDependencies } = useRuleMutations<PrepaymentRule>('Prepayment');
  const leaves = coa.filter((c) => c.isLeaf);

  const columns: RowColumn<PrepaymentAssumption>[] = [
    {
      key: 'coa',
      header: 'Product class',
      width: '28%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ppc-${row.commonCoaCode}`}
          label="Product class"
          value={row.commonCoaCode}
          options={leaves.map((c) => ({ value: c.code, label: c.name }))}
          disabled={readOnly}
          onChange={(v) => update({ commonCoaCode: v })}
        />
      ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '22%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ppm-${row.commonCoaCode}`}
          label="Method"
          value={row.method}
          options={PREPAYMENT_METHODS}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
      ),
    },
    {
      key: 'cpr',
      header: 'Annual CPR',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`ppr-${row.commonCoaCode}`}
          label="Constant prepayment rate"
          type="number"
          step="0.01"
          value={row.cpr}
          disabled={readOnly || row.method === 'None'}
          onChange={(v) => update({ cpr: Number(v) })}
        />
      ),
    },
    {
      key: 'sensitivity',
      header: 'Per 100bp',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`pps-${row.commonCoaCode}`}
          label="Sensitivity per 100bp"
          type="number"
          step="0.01"
          value={row.sensitivityPer100bp ?? ''}
          disabled={readOnly || row.method !== 'RateDependent'}
          onChange={(v) => update({ sensitivityPer100bp: v === '' ? undefined : Number(v) })}
        />
      ),
    },
    {
      key: 'penalty',
      header: 'Penalty %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`ppp-${row.commonCoaCode}`}
          label="Early redemption penalty"
          type="number"
          step="0.1"
          value={row.earlyRedemptionPenaltyPct ?? ''}
          disabled={readOnly || row.method === 'None'}
          onChange={(v) => update({ earlyRedemptionPenaltyPct: v === '' ? undefined : Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<PrepaymentRule>
      title="Prepayment & Early Redemption"
      description="How much principal comes back early, and what penalty damps the incentive."
      noun="prepayment rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('Prepayment', 'New prepayment rule', user?.name ?? 'unknown'),
        kind: 'Prepayment',
        assumptions: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.assumptions.length} class assumption(s)`}
      validate={(r) =>
        r.assumptions.some((a) => a.cpr < 0 || a.cpr > 1)
          ? 'CPR is an annual rate between 0 and 1 — 0.15 means 15% a year.'
          : null
      }
      renderBody={(rule, update, readOnly) => (
        <RuleRows<PrepaymentAssumption>
          rows={rule.assumptions}
          columns={columns}
          rowKey={(a, i) => `${a.commonCoaCode}-${i}`}
          onChange={(assumptions) => update({ assumptions })}
          readOnly={readOnly}
          addLabel="Add class assumption"
          createRow={() => ({ commonCoaCode: leaves[0]?.code ?? '', method: 'ConstantRate', cpr: 0.1 })}
        />
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Discount Methods — screen 21
// ─────────────────────────────────────────────────────────────────────────

export function DiscountMethods() {
  const { user } = useAuth();
  const { affiliateCode } = useScope();
  const { data: coa = [] } = useDimensionMembers('CommonCoa', affiliateCode === 'GROUP' ? '' : affiliateCode);
  const { data: curves = [] } = useYieldCurves();
  const { data: rules = [], isLoading } = useRules<DiscountMethodRule>('DiscountMethod');
  const { save, remove, checkDependencies } = useRuleMutations<DiscountMethodRule>('DiscountMethod');
  const leaves = coa.filter((c) => c.isLeaf);

  const columns: RowColumn<DiscountAssignment>[] = [
    {
      key: 'coa',
      header: 'Product class',
      width: '34%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`dmc-${row.commonCoaCode}`}
          label="Product class"
          value={row.commonCoaCode}
          options={leaves.map((c) => ({ value: c.code, label: c.name }))}
          disabled={readOnly}
          onChange={(v) => update({ commonCoaCode: v })}
        />
      ),
    },
    {
      key: 'method',
      header: 'Discount method',
      width: '30%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`dmm-${row.commonCoaCode}`}
          label="Discount method"
          value={row.method}
          options={[
            { value: 'SpotInputCurve' as const, label: 'Spot input curve' },
            { value: 'ForwardRates' as const, label: 'Forward rates' },
            { value: 'DurationProxy' as const, label: 'Duration proxy' },
          ]}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
      ),
    },
    {
      key: 'curve',
      header: 'Curve',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`dmv-${row.commonCoaCode}`}
          label="Curve"
          value={row.curveCode ?? ''}
          options={[
            { value: '', label: '— affiliate default —' },
            ...curves.map((c) => ({ value: c.code, label: c.code })),
          ]}
          disabled={readOnly}
          onChange={(v) => update({ curveCode: v || null })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<DiscountMethodRule>
      title="Discount Methods"
      description="How future value is brought back to today, per product class."
      noun="discount rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('DiscountMethod', 'New discount rule', user?.name ?? 'unknown'),
        kind: 'DiscountMethod',
        assignments: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.assignments.length} assignment(s)`}
      guidance={
        <>
          <span className="font-bold">Duration proxy is the current default.</span> Full cash-flow discounting needs
          contract-level flows, which are out of scope — so EVE is computed by duration gap, and every result says so.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <RuleRows<DiscountAssignment>
          rows={rule.assignments}
          columns={columns}
          rowKey={(a, i) => `${a.commonCoaCode}-${i}`}
          onChange={(assignments) => update({ assignments })}
          readOnly={readOnly}
          addLabel="Add assignment"
          createRow={() => ({ commonCoaCode: leaves[0]?.code ?? '', method: 'DurationProxy', curveCode: null })}
        />
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Payment & Repricing Patterns — screen 19
// ─────────────────────────────────────────────────────────────────────────

export function Patterns() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<PaymentRepricingRule>('PaymentPattern');
  const { save, remove, checkDependencies } = useRuleMutations<PaymentRepricingRule>('PaymentPattern');

  const columns: RowColumn<PatternPhase>[] = [
    {
      key: 'term',
      header: 'Term',
      width: '50%',
      render: (row, update, readOnly) => (
        <RowInput
          id={`ph-${row.term}`}
          label="Term"
          value={row.term}
          placeholder="2027-06-30 or 6M"
          disabled={readOnly}
          onChange={(v) => update({ term: v })}
        />
      ),
    },
    {
      key: 'percent',
      header: 'Share %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`php-${row.term}`}
          label="Share percent"
          type="number"
          step="0.1"
          value={row.percent}
          disabled={readOnly}
          onChange={(v) => update({ percent: Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<PaymentRepricingRule>
      title="Payment & Repricing Patterns"
      description="Repayment and reset schedules too complex for the standard instrument fields."
      noun="pattern"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('PaymentPattern', 'New pattern', user?.name ?? 'unknown'),
        kind: 'PaymentPattern',
        patternType: 'Relative',
        amortizationCode: 1000 + Math.floor(Math.random() * 1000),
        phases: [{ term: '12M', percent: 100 }],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.patternType} · ${r.phases.length} phase(s) · code ${r.amortizationCode}`}
      validate={(r) => allocationError(r.phases.map((p) => p.percent))}
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <RuleField label="Pattern applies to">
              <select
                value={rule.kind}
                disabled={readOnly}
                onChange={(e) => update({ kind: e.target.value as 'PaymentPattern' | 'RepricingPattern' })}
                className={ruleInput}
                aria-label="Pattern applies to"
              >
                <option value="PaymentPattern">Payment (principal repayment)</option>
                <option value="RepricingPattern">Repricing (rate resets)</option>
              </select>
            </RuleField>
            <RuleField
              label="Pattern type"
              hint="Absolute uses dates; relative uses periods; split allows parallel legs."
            >
              <select
                value={rule.patternType}
                disabled={readOnly}
                onChange={(e) => update({ patternType: e.target.value as PatternType })}
                className={ruleInput}
                aria-label="Pattern type"
              >
                {(['Absolute', 'Relative', 'Split'] as PatternType[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </RuleField>
            <RuleField label="Amortisation code">
              <input
                type="number"
                value={rule.amortizationCode}
                disabled={readOnly}
                onChange={(e) => update({ amortizationCode: Number(e.target.value) })}
                className={`${ruleInput} text-right font-mono`}
                aria-label="Amortisation code"
              />
            </RuleField>
          </div>

          {rule.phases.length > 1 && (
            <TierAllocationBar
              segments={rule.phases.map(
                (p, i): AllocationSegment => ({
                  key: `${p.term}-${i}`,
                  label: p.term,
                  percent: p.percent,
                  tone: paletteTone(i),
                }),
              )}
              readOnly={readOnly}
              onResize={(left, right, leftPercent, rightPercent) =>
                update({
                  phases: rule.phases.map((p, i) =>
                    i === left ? { ...p, percent: leftPercent } : i === right ? { ...p, percent: rightPercent } : p,
                  ),
                })
              }
            />
          )}

          <RuleRows<PatternPhase>
            rows={rule.phases}
            columns={columns}
            rowKey={(p, i) => `${p.term}-${i}`}
            onChange={(phases) => update({ phases })}
            readOnly={readOnly}
            addLabel="Add phase"
            createRow={() => ({ term: '12M', percent: 0 })}
            footer={
              <span
                className={
                  Math.abs(rule.phases.reduce((s, p) => s + p.percent, 0) - 100) < 0.0001
                    ? 'text-success'
                    : 'text-danger'
                }
              >
                Totals {rule.phases.reduce((s, p) => s + p.percent, 0).toFixed(1)}%
              </span>
            }
          />
        </div>
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Filters & Expressions — screen 27
// ─────────────────────────────────────────────────────────────────────────

const FIELDS = [
  'amount',
  'currency',
  'category',
  'accountClass',
  'productClass',
  'orgUnitCode',
  'counterpartyId',
  'performingStatus',
  'behaviouralTag',
  'lienAmount',
];

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'greaterThan', label: 'is greater than' },
  { value: 'lessThan', label: 'is less than' },
  { value: 'in', label: 'is one of' },
  { value: 'contains', label: 'contains' },
];

export function Filters() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<FilterRule>('Filter');
  const { save, remove, checkDependencies } = useRuleMutations<FilterRule>('Filter');

  const columns: RowColumn<FilterCondition>[] = [
    {
      key: 'field',
      header: 'Field',
      width: '30%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`ff-${row.field}-${row.value}`}
          label="Field"
          value={row.field}
          options={FIELDS}
          disabled={readOnly}
          onChange={(v) => update({ field: v })}
        />
      ),
    },
    {
      key: 'operator',
      header: 'Operator',
      width: '25%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`fo-${row.field}-${row.value}`}
          label="Operator"
          value={row.operator}
          options={OPERATORS}
          disabled={readOnly}
          onChange={(v) => update({ operator: v })}
        />
      ),
    },
    {
      key: 'value',
      header: 'Value',
      render: (row, update, readOnly) => (
        <RowInput
          id={`fv-${row.field}-${row.value}`}
          label="Value"
          value={row.value}
          placeholder="Comma-separated for 'is one of'"
          disabled={readOnly}
          onChange={(v) => update({ value: v })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<FilterRule>
      title="Filters & Expressions"
      description="Named, reusable data selections. Attach one to a run to narrow its scope without redefining the run."
      noun="filter"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('Filter', 'New filter', user?.name ?? 'unknown'),
        kind: 'Filter',
        filterKind: 'DataElement',
        conditions: [],
        referencedFilterIds: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.filterKind} · ${r.conditions.length} condition(s)`}
      validate={(r) => (r.conditions.some((c) => c.value.trim() === '') ? 'Every condition needs a value.' : null)}
      guidance={
        <>
          Conditions combine with <span className="font-bold">AND</span>. A group filter joins other filters, which is
          how Oracle composes them (ALM UG §3.7) — build small, reusable filters and combine rather than repeating a
          long condition list.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-4">
          <RuleField label="Filter kind">
            <select
              value={rule.filterKind}
              disabled={readOnly}
              onChange={(e) => update({ filterKind: e.target.value as FilterKind })}
              className={`${ruleInput} max-w-xs`}
              aria-label="Filter kind"
            >
              {(['DataElement', 'Group', 'Hierarchy', 'Attribute'] as FilterKind[]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </RuleField>

          <RuleRows<FilterCondition>
            rows={rule.conditions}
            columns={columns}
            rowKey={(c, i) => `${c.field}-${i}`}
            onChange={(conditions) => update({ conditions })}
            readOnly={readOnly}
            addLabel="Add condition"
            emptyMessage="No conditions — this filter would select everything."
            createRow={() => ({ field: 'amount', operator: 'greaterThan', value: '0' })}
          />

          {rule.conditions.length > 0 && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-600">
              {rule.conditions
                .map((c) => `${c.field} ${OPERATORS.find((o) => o.value === c.operator)?.label} ${c.value}`)
                .join(' AND ')}
            </p>
          )}
        </div>
      )}
    />
  );
}
