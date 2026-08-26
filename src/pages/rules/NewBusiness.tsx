/**
 * New Business Assumptions — screen 23.
 *
 * Oracle's Forecast Balance rule (ALM UG Ch. 27), with pricing margin and
 * maturity mix folded in. This is what introduces the **Static vs Dynamic**
 * run axis: static models the existing book running off, dynamic layers new
 * volume on top.
 *
 * Without it there is no answer to "what if the loan book grows 15%?" —
 * which is most of what strategic planning asks.
 */

import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { TierAllocationBar, paletteTone, type AllocationSegment } from '@/components/ui/TierAllocationBar';
import { useAuth } from '@/context/AuthContext';
import { useCurrencies, useDimensionMembers } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { defaultLadder } from '@/engine/buckets';
import {
  allocationError,
  type ForecastBalanceLine,
  type ForecastMethod,
  type NewBusinessRule,
} from '@/engine/ruleTypes';

const METHODS: Array<{ value: ForecastMethod; label: string }> = [
  { value: 'NoNewBusiness', label: 'No new business' },
  { value: 'TargetEndBalance', label: 'Target end balance' },
  { value: 'TargetAverageBalance', label: 'Target average balance' },
  { value: 'TargetGrowthPercent', label: 'Target growth %' },
  { value: 'NewAddBalance', label: 'New add balance' },
  { value: 'Rollover', label: 'Rollover' },
  { value: 'RolloverWithNewAdd', label: 'Rollover + new add' },
  { value: 'RolloverWithGrowth', label: 'Rollover + growth %' },
];

const METHOD_HINT: Record<ForecastMethod, string> = {
  NoNewBusiness: 'Runoff without replacement — the default, and what a static run assumes.',
  TargetEndBalance: 'Originate whatever is needed to reach this closing balance.',
  TargetAverageBalance: 'Timing is solved so the average balance hits the target.',
  TargetGrowthPercent: 'Grow the book by this percentage each bucket.',
  NewAddBalance: 'Add this volume regardless of what runs off.',
  Rollover: 'Replace maturing volume exactly.',
  RolloverWithNewAdd: 'Replace maturities and add incremental volume on top.',
  RolloverWithGrowth: 'Replace maturities and grow by a percentage.',
};

const BUCKETS = defaultLadder('IncomeSimulation').buckets.map((b) => b.label);

export function NewBusiness() {
  const { user } = useAuth();
  const { data: products = [] } = useDimensionMembers('Product');
  const { data: currencies = [] } = useCurrencies();
  const { data: rules = [], isLoading } = useRules<NewBusinessRule>('NewBusiness');
  const { save, remove, checkDependencies } = useRuleMutations<NewBusinessRule>('NewBusiness');

  const leaves = products.filter((p) => p.isLeaf);

  const createDefault = (): NewBusinessRule => ({
    ...newRuleMeta('NewBusiness', 'New business assumptions', user?.name ?? 'unknown'),
    kind: 'NewBusiness',
    lines: [],
  });

  const columns: RowColumn<ForecastBalanceLine>[] = [
    {
      key: 'product',
      header: 'Product',
      width: '24%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`nbp-${row.productCode}-${row.currency}`}
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
      header: 'Ccy',
      width: '8%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`nbc-${row.productCode}-${row.currency}`}
          label="Currency"
          value={row.currency}
          options={currencies.map((c) => c.code)}
          disabled={readOnly}
          onChange={(v) => update({ currency: v })}
        />
      ),
    },
    {
      key: 'method',
      header: 'Forecast method',
      width: '22%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`nbm-${row.productCode}-${row.currency}`}
          label="Forecast method"
          value={row.method}
          options={METHODS}
          disabled={readOnly}
          onChange={(v) => update({ method: v })}
        />
      ),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`nbv-${row.productCode}-${row.currency}`}
          label="Value"
          type="number"
          value={row.value}
          disabled={readOnly || row.method === 'NoNewBusiness'}
          onChange={(v) => update({ value: Number(v) })}
        />
      ),
    },
    {
      key: 'timing',
      header: 'Timing',
      width: '13%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`nbt-${row.productCode}-${row.currency}`}
          label="Origination timing"
          value={row.timing}
          options={[
            { value: 'Distributed' as const, label: 'Distributed' },
            { value: 'BucketEnd' as const, label: 'At bucket end' },
          ]}
          disabled={readOnly}
          onChange={(v) => update({ timing: v })}
        />
      ),
    },
    {
      key: 'margin',
      header: 'Margin (bps)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`nbg-${row.productCode}-${row.currency}`}
          label="Pricing margin"
          type="number"
          step="5"
          value={row.pricingMarginBps}
          disabled={readOnly}
          onChange={(v) => update({ pricingMarginBps: Number(v) })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<NewBusinessRule>
      title="New Business Assumptions"
      description="Forecast balances, pricing margins and maturity mix. Attaching one of these turns a static run into a dynamic one."
      noun="assumption set"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.lines.length} product line(s)`}
      validate={(r) => {
        for (const line of r.lines) {
          if (line.method === 'NoNewBusiness') continue;
          const error = allocationError(line.maturityMix);
          if (error) return `${line.productCode}: maturity mix — ${error}`;
          if (line.method === 'TargetGrowthPercent' && Math.abs(line.value) > 100) {
            return `${line.productCode}: growth beyond ±100% per bucket is almost certainly an error.`;
          }
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Static or dynamic.</span> A run with no new-business rule models only the existing
          book running off. Attach one and the run projects originations too — which is what makes a growth scenario
          possible at all.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-5">
          <RuleRows<ForecastBalanceLine>
            rows={rule.lines}
            columns={columns}
            rowKey={(_l, i) => `nb-${i}`}
            onChange={(lines) => update({ lines })}
            readOnly={readOnly}
            addLabel="Add product line"
            emptyMessage="No new-business lines. Without any, a run is static."
            createRow={() => ({
              productCode: leaves[0]?.code ?? '',
              currency: currencies[0]?.code ?? 'USD',
              method: 'TargetGrowthPercent',
              value: 0,
              timing: 'Distributed',
              pricingMarginBps: 0,
              maturityMix: Object.fromEntries(BUCKETS.map((b, i) => [b, i === 0 ? 100 : 0])),
            })}
          />

          {rule.lines.map((line, i) => {
            if (line.method === 'NoNewBusiness') return null;
            const total = Object.values(line.maturityMix).reduce((s, v) => s + v, 0);
            return (
              <div key={`mix-${i}`} className="rounded-lg border border-gray-200 p-4">
                <h4 className="mb-1 text-[12px] font-bold text-navy-900">
                  Maturity mix — {leaves.find((p) => p.code === line.productCode)?.name ?? line.productCode}
                </h4>
                <p className="mb-3 text-[11px] text-gray-500">{METHOD_HINT[line.method]}</p>

                <div className="mb-3">
                  <TierAllocationBar
                    segments={BUCKETS.map(
                      (bucket, bi): AllocationSegment => ({
                        key: bucket,
                        label: bucket,
                        percent: line.maturityMix[bucket] ?? 0,
                        tone: paletteTone(bi),
                      }),
                    )}
                    readOnly={readOnly}
                    onResize={(left, right, leftPercent, rightPercent) =>
                      update({
                        lines: rule.lines.map((l, j) =>
                          j === i
                            ? {
                                ...l,
                                maturityMix: {
                                  ...l.maturityMix,
                                  [BUCKETS[left]!]: leftPercent,
                                  [BUCKETS[right]!]: rightPercent,
                                },
                              }
                            : l,
                        ),
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 md:grid-cols-7">
                  {BUCKETS.map((bucket) => (
                    <RuleField key={bucket} label={bucket}>
                      <input
                        type="number"
                        step="5"
                        value={line.maturityMix[bucket] ?? 0}
                        disabled={readOnly}
                        onChange={(e) =>
                          update({
                            lines: rule.lines.map((l, j) =>
                              j === i
                                ? { ...l, maturityMix: { ...l.maturityMix, [bucket]: Number(e.target.value) } }
                                : l,
                            ),
                          })
                        }
                        className={`${ruleInput} text-right font-mono`}
                        aria-label={`${bucket} share of new volume`}
                      />
                    </RuleField>
                  ))}
                </div>
                <p className={`mt-2 text-[11px] ${Math.abs(total - 100) < 0.0001 ? 'text-success' : 'text-danger'}`}>
                  Mix totals {total.toFixed(0)}%
                </p>
              </div>
            );
          })}
        </div>
      )}
    />
  );
}
