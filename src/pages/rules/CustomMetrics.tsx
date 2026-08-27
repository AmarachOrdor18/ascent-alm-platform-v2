import { useMemo } from 'react';
import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import type { CustomMetricRule } from '@/engine/ruleTypes';

/** Run outputs an expression may read, with a sample value for the preview. */
const AVAILABLE: Array<{ name: string; description: string; sample: number }> = [
  { name: 'hqla', description: 'High-quality liquid assets, lien-free and net of haircut', sample: 539_500 },
  { name: 'netCashOutflows', description: '30-day net cash outflows', sample: 319_500 },
  { name: 'grossOutflows', description: 'Gross 30-day outflows', sample: 436_000 },
  { name: 'availableStableFunding', description: 'ASF', sample: 2_051_500 },
  { name: 'requiredStableFunding', description: 'RSF', sample: 1_979_800 },
  { name: 'loans', description: 'Customer loans', sample: 1_100_000 },
  { name: 'deposits', description: 'Customer deposits', sample: 1_400_000 },
  { name: 'totalAssets', description: 'Total assets', sample: 2_280_000 },
  { name: 'equity', description: 'Balance-sheet equity', sample: 300_000 },
  { name: 'deltaEve', description: 'Change in economic value of equity', sample: -41_427.2 },
  { name: 'deltaNii', description: 'Change in net interest income', sample: -18_000 },
  { name: 'survivalHorizonDays', description: 'Days until the buffer is exhausted', sample: 17 },
];

// Restricted to arithmetic over known names; an unrecognised token errors rather than evaluating as zero.
function evaluate(expression: string, values: Record<string, number>): { value: number | null; error: string | null } {
  const trimmed = expression.trim();
  if (!trimmed) return { value: null, error: null };

  const tokens = trimmed.match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[+\-*/()]/g) ?? [];
  const rebuilt = tokens.join(' ');
  if (rebuilt.replace(/\s/g, '') !== trimmed.replace(/\s/g, '')) {
    return { value: null, error: 'Expression contains characters that are not arithmetic or a known name.' };
  }

  const unknown = tokens.filter((t) => /^[A-Za-z_]/.test(t) && !(t in values));
  if (unknown.length > 0) {
    return { value: null, error: `Unknown name: ${Array.from(new Set(unknown)).join(', ')}` };
  }

  try {
    const substituted = tokens.map((t) => (t in values ? String(values[t]) : t)).join(' ');
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${substituted});`)() as unknown;
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return { value: null, error: 'Expression did not evaluate to a finite number.' };
    }
    return { value: result, error: null };
  } catch {
    return { value: null, error: 'Expression could not be evaluated — check the brackets.' };
  }
}

export function CustomMetrics() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<CustomMetricRule>('CustomMetric');
  const { save, remove, checkDependencies } = useRuleMutations<CustomMetricRule>('CustomMetric');

  const samples = useMemo(() => Object.fromEntries(AVAILABLE.map((a) => [a.name, a.sample])), []);

  return (
    <RuleEditor<CustomMetricRule>
      title="Custom Metrics"
      description="Derived measures over run outputs. Define the bank's own ratio without waiting for a release."
      noun="metric"
      rules={rules}
      isLoading={isLoading}
      createDefault={() => ({
        ...newRuleMeta('CustomMetric', 'New metric', user?.name ?? 'unknown'),
        kind: 'CustomMetric',
        expression: '',
        unit: 'Percentage',
        decimals: 2,
        dependsOn: [],
      })}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => r.expression || 'No expression yet'}
      validate={(r) => {
        if (!r.expression.trim()) return 'A metric needs an expression.';
        return evaluate(r.expression, samples).error;
      }}
      guidance={
        <>
          <span className="font-bold">Arithmetic over named run outputs only.</span> A formula cannot reach data it was
          not given, and an unrecognised name is reported rather than treated as zero — a metric that silently reads
          zero is worse than one that refuses to save.
        </>
      }
      renderBody={(rule, update, readOnly) => {
        const { value, error } = evaluate(rule.expression, samples);
        const used = AVAILABLE.filter((a) => rule.expression.includes(a.name));

        return (
          <div className="space-y-5">
            <RuleField label="Expression" hint="For example: hqla / netCashOutflows * 100">
              <input
                value={rule.expression}
                disabled={readOnly}
                placeholder="hqla / netCashOutflows * 100"
                onChange={(e) =>
                  update({
                    expression: e.target.value,
                    dependsOn: AVAILABLE.filter((a) => e.target.value.includes(a.name)).map((a) => a.name),
                  })
                }
                className={`${ruleInput} font-mono`}
                aria-label="Expression"
              />
            </RuleField>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <RuleField label="Unit">
                <select
                  value={rule.unit}
                  disabled={readOnly}
                  onChange={(e) => update({ unit: e.target.value as CustomMetricRule['unit'] })}
                  className={ruleInput}
                  aria-label="Unit"
                >
                  {(['Percentage', 'Amount', 'Ratio', 'Days'] as const).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </RuleField>
              <RuleField label="Decimal places">
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={rule.decimals}
                  disabled={readOnly}
                  onChange={(e) => update({ decimals: Number(e.target.value) })}
                  className={`${ruleInput} text-right font-mono`}
                  aria-label="Decimal places"
                />
              </RuleField>
              <RuleField label="Preview" hint="Evaluated against the Nigeria baseline figures.">
                <p className="pt-1 text-[16px] font-bold text-navy-900">
                  {error ? (
                    <span className="text-[12px] font-normal text-danger">{error}</span>
                  ) : value === null ? (
                    <span className="text-[12px] font-normal text-gray-400">Enter an expression</span>
                  ) : (
                    <>
                      {value.toFixed(rule.decimals)}
                      {rule.unit === 'Percentage' && '%'}
                      {rule.unit === 'Days' && ' days'}
                    </>
                  )}
                </p>
              </RuleField>
            </div>

            {used.length > 0 && (
              <div>
                <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Depends on</h4>
                <div className="flex flex-wrap gap-2">
                  {used.map((a) => (
                    <StatusBadge key={a.name} status={a.name} tone="info" />
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Available names</h4>
              <table className="w-full text-[11px]">
                <tbody>
                  {AVAILABLE.map((a) => (
                    <tr key={a.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-1 pr-3">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() =>
                            update({ expression: `${rule.expression}${rule.expression ? ' ' : ''}${a.name}` })
                          }
                          className="font-mono text-navy-700 hover:underline disabled:no-underline disabled:opacity-60"
                        >
                          {a.name}
                        </button>
                      </td>
                      <td className="py-1 px-3 text-gray-500">{a.description}</td>
                      <td className="py-1 px-3 text-right font-mono text-gray-400">{a.sample.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    />
  );
}
