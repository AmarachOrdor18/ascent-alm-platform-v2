import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { ShockCurveEditor } from '@/components/ui/ShockCurveEditor';
import { useAuth } from '@/context/AuthContext';
import { useEconomicIndicators } from '@/lib/hooks';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { defaultLadder } from '@/engine/buckets';
import { standardShocks, SHOCK_LABELS } from '@/engine/irrbb';
import { formatBps } from '@/lib/format';
import type { ForecastScenarioRule } from '@/engine/ruleTypes';

const LADDER = defaultLadder('RepricingGap');
const STANDARD = standardShocks(LADDER);

export function ForecastScenarios() {
  const { user } = useAuth();
  const { data: indicators = [] } = useEconomicIndicators();
  const { data: rules = [], isLoading } = useRules<ForecastScenarioRule>('ForecastScenario');
  const { save, remove, checkDependencies } = useRuleMutations<ForecastScenarioRule>('ForecastScenario');

  const createDefault = (): ForecastScenarioRule => ({
    ...newRuleMeta('ForecastScenario', 'New rate scenario', user?.name ?? 'unknown'),
    kind: 'ForecastScenario',
    shockByBucket: Object.fromEntries(LADDER.buckets.map((b) => [b.label, 0])),
    basedOn: null,
    economicIndicatorCodes: [],
  });

  return (
    <RuleEditor<ForecastScenarioRule>
      title="Forecast Rate Scenarios"
      description="Saved, reusable rate shocks — the six BCBS standardised scenarios, plus any the bank defines itself."
      noun="scenario"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => {
        const values = Object.values(r.shockByBucket);
        const min = Math.min(...values);
        const max = Math.max(...values);
        return min === max ? `Flat ${formatBps(min)}` : `${formatBps(min)} to ${formatBps(max)}`;
      }}
      validate={(r) =>
        Object.values(r.shockByBucket).some((v) => Math.abs(v) > 1000)
          ? 'A shock beyond ±1000bp is almost certainly a data-entry error.'
          : null
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-5">
          {!readOnly && (
            <RuleField
              label="Start from a standardised shock"
              hint="Loads the BCBS shape, which you can then adjust bucket by bucket."
            >
              <div className="flex flex-wrap gap-2">
                {Object.entries(STANDARD).map(([name, curve]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => update({ shockByBucket: { ...curve }, basedOn: name })}
                    className={
                      rule.basedOn === name
                        ? 'rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white'
                        : 'rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 hover:border-navy-700 hover:text-navy-900'
                    }
                  >
                    {SHOCK_LABELS[name] ?? name}
                  </button>
                ))}
              </div>
            </RuleField>
          )}

          <div>
            <h3 className="mb-2 text-[12px] font-bold text-navy-900">Shock by bucket (basis points)</h3>
            <div className="mb-3">
              <ShockCurveEditor
                points={LADDER.buckets.map((bucket) => ({
                  key: bucket.label,
                  label: bucket.label,
                  value: rule.shockByBucket[bucket.label] ?? 0,
                }))}
                readOnly={readOnly}
                onChange={(label, value) =>
                  update({
                    shockByBucket: { ...rule.shockByBucket, [label]: value },
                    basedOn: null,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
              {LADDER.buckets.map((bucket) => (
                <RuleField key={bucket.label} label={bucket.label}>
                  <input
                    type="number"
                    step="5"
                    value={rule.shockByBucket[bucket.label] ?? 0}
                    disabled={readOnly}
                    onChange={(e) =>
                      update({
                        shockByBucket: { ...rule.shockByBucket, [bucket.label]: Number(e.target.value) },
                        // Manual edit means it's no longer the pure standardised shape.
                        basedOn: null,
                      })
                    }
                    className={`${ruleInput} text-right font-mono`}
                    aria-label={`${bucket.label} shock in basis points`}
                  />
                </RuleField>
              ))}
            </div>
          </div>

          {rule.basedOn && (
            <p className="rounded-lg bg-navy-50 px-3 py-2 text-[11px] text-navy-900">
              Reproduces the BCBS <span className="font-bold">{SHOCK_LABELS[rule.basedOn] ?? rule.basedOn}</span>{' '}
              scenario shape.
            </p>
          )}

          <RuleField
            label="Conditioned on"
            hint="Macro series this scenario assumes. Recorded for narrative — the shock itself is the input to the engine."
          >
            <div className="flex flex-wrap gap-2">
              {indicators.map((ind) => (
                <span
                  key={ind.code}
                  className="flex items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-[11px]"
                >
                  <input
                    id={`ind-${ind.code}`}
                    type="checkbox"
                    checked={rule.economicIndicatorCodes.includes(ind.code)}
                    disabled={readOnly}
                    onChange={(e) =>
                      update({
                        economicIndicatorCodes: e.target.checked
                          ? [...rule.economicIndicatorCodes, ind.code]
                          : rule.economicIndicatorCodes.filter((c) => c !== ind.code),
                      })
                    }
                    className="accent-gold-500"
                  />
                  <label htmlFor={`ind-${ind.code}`} className="cursor-pointer text-gray-600">
                    {ind.name}
                  </label>
                </span>
              ))}
            </div>
          </RuleField>
        </div>
      )}
    />
  );
}
