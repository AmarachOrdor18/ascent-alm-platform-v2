/**
 * Time Bucket Rules — screen 16.
 *
 * Three independent ladders, per Oracle (ALM UG Ch. 15): income simulation,
 * interest-rate gap and liquidity gap. They answer different questions and
 * therefore want different granularity — a liquidity ladder needs daily
 * detail at the short end, a repricing ladder monthly out to several years.
 *
 * The previous platform hardcoded one five-bucket ladder in five files and
 * used it for everything.
 */

import { RuleEditor, RuleField, ruleInput, ruleNumber } from '@/components/ui/RuleEditor';
import { useAuth } from '@/context/AuthContext';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { defaultLadder } from '@/engine/buckets';
import type { LadderKind, TimeBucketLadder, TimeBucketRule } from '@/engine/types';

const LADDERS: Array<{ kind: LadderKind; label: string; purpose: string }> = [
  { kind: 'IncomeSimulation', label: 'Income Simulation', purpose: 'Reporting periods for projected earnings.' },
  {
    kind: 'RepricingGap',
    label: 'Interest Rate Gap',
    purpose: 'Repricing buckets, with a non-rate-sensitive catch-all.',
  },
  { kind: 'LiquidityGap', label: 'Liquidity Gap', purpose: 'Cash-flow buckets, finer at the short end.' },
];

export function TimeBucketRules() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<TimeBucketRule>('TimeBucket');
  const { save, remove, checkDependencies } = useRuleMutations<TimeBucketRule>('TimeBucket');

  const createDefault = (): TimeBucketRule => ({
    ...newRuleMeta('TimeBucket', 'New time bucket rule', user?.name ?? 'unknown'),
    kind: 'TimeBucket',
    ladders: LADDERS.map((l) => defaultLadder(l.kind)),
  });

  return (
    <RuleEditor<TimeBucketRule>
      title="Time Bucket Rules"
      description="The ladders results are bucketed into. Three independent sets, because liquidity and repricing are different questions."
      noun="bucket rule"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => r.ladders.map((l) => `${l.kind}: ${l.buckets.length}`).join(' · ')}
      validate={(r) => {
        for (const ladder of r.ladders) {
          if (ladder.buckets.length === 0) return `${ladder.kind} has no buckets.`;
          const bounded = ladder.buckets.filter((b) => b.upperBoundDays !== null).map((b) => b.upperBoundDays!);
          // Buckets must ascend, or a position could match two of them.
          for (let i = 1; i < bounded.length; i += 1) {
            if (bounded[i]! <= bounded[i - 1]!) {
              return `${ladder.kind} buckets must ascend — ${bounded[i]} follows ${bounded[i - 1]}.`;
            }
          }
          if (ladder.buckets[ladder.buckets.length - 1]!.upperBoundDays !== null) {
            return `${ladder.kind} needs an open-ended final bucket, or long-dated positions have nowhere to go.`;
          }
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Buckets are derived from dates.</span> A position is placed by its maturity or
          repricing date against the active ladder, so changing a ladder genuinely changes the allocation — it is not a
          relabelling of pre-assigned buckets.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-6">
          {rule.ladders.map((ladder, ladderIndex) => {
            const setLadder = (patch: Partial<TimeBucketLadder>) =>
              update({ ladders: rule.ladders.map((l, i) => (i === ladderIndex ? { ...l, ...patch } : l)) });

            const definition = LADDERS.find((l) => l.kind === ladder.kind);

            return (
              <div key={ladder.kind} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[12px] font-bold text-navy-900">{definition?.label ?? ladder.kind}</h3>
                    <p className="text-[11px] text-gray-500">{definition?.purpose}</p>
                  </div>
                  {ladder.kind === 'RepricingGap' && (
                    <div className="flex items-center gap-2">
                      <input
                        id={`nrs-${ladderIndex}`}
                        type="checkbox"
                        checked={ladder.includeNonRateSensitive}
                        disabled={readOnly}
                        onChange={(e) => setLadder({ includeNonRateSensitive: e.target.checked })}
                        className="accent-gold-500"
                      />
                      <label htmlFor={`nrs-${ladderIndex}`} className="cursor-pointer text-[11px] text-gray-600">
                        Non-rate-sensitive bucket
                      </label>
                    </div>
                  )}
                </div>

                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                      <th className="py-1.5 font-bold">Label</th>
                      <th className="py-1.5 text-right font-bold">Upper bound (days)</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.buckets.map((bucket, i) => (
                      <tr key={`${ladder.kind}-${i}`} className="border-b border-gray-100">
                        <td className="py-1.5 pr-2">
                          <label htmlFor={`lbl-${ladderIndex}-${i}`} className="sr-only">
                            Bucket {i + 1} label
                          </label>
                          <input
                            id={`lbl-${ladderIndex}-${i}`}
                            value={bucket.label}
                            disabled={readOnly}
                            onChange={(e) =>
                              setLadder({
                                buckets: ladder.buckets.map((b, j) => (j === i ? { ...b, label: e.target.value } : b)),
                              })
                            }
                            className={ruleInput}
                          />
                        </td>
                        <td className="py-1.5">
                          <label htmlFor={`ub-${ladderIndex}-${i}`} className="sr-only">
                            Bucket {i + 1} upper bound
                          </label>
                          {bucket.upperBoundDays === null ? (
                            <span className="block py-1 text-right text-[11px] italic text-gray-400">open-ended</span>
                          ) : (
                            <input
                              id={`ub-${ladderIndex}-${i}`}
                              type="number"
                              min={1}
                              value={bucket.upperBoundDays}
                              disabled={readOnly}
                              onChange={(e) =>
                                setLadder({
                                  buckets: ladder.buckets.map((b, j) =>
                                    j === i ? { ...b, upperBoundDays: Number(e.target.value) } : b,
                                  ),
                                })
                              }
                              className={ruleNumber}
                            />
                          )}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          {!readOnly && ladder.buckets.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setLadder({ buckets: ladder.buckets.filter((_, j) => j !== i) })}
                              className="text-[11px] font-bold text-danger hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      // Insert before the open-ended terminal bucket, which
                      // must stay last.
                      const last = ladder.buckets[ladder.buckets.length - 1]!;
                      const prior = ladder.buckets[ladder.buckets.length - 2];
                      const bound = (prior?.upperBoundDays ?? 30) * 2;
                      update({
                        ladders: rule.ladders.map((l, i) =>
                          i === ladderIndex
                            ? {
                                ...l,
                                buckets: [
                                  ...l.buckets.slice(0, -1),
                                  { label: `${bound}d`, upperBoundDays: bound },
                                  last,
                                ],
                              }
                            : l,
                        ),
                      });
                    }}
                    className="mt-2 text-[11px] font-bold text-navy-700 hover:text-navy-900"
                  >
                    Add bucket
                  </button>
                )}
              </div>
            );
          })}

          <RuleField
            label="Maximum buckets"
            hint="Oracle allows up to 240 per ladder. Beyond a few dozen, reporting becomes harder to read than the risk it describes."
          >
            <p className="text-[12px] text-gray-500">
              {rule.ladders.reduce((s, l) => s + l.buckets.length, 0)} buckets defined across {rule.ladders.length}{' '}
              ladders.
            </p>
          </RuleField>
        </div>
      )}
    />
  );
}
