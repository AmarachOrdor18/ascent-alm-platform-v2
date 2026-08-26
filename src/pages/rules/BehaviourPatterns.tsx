/**
 * Behaviour Patterns — screen 18.
 *
 * RFP §2.1 asks, in these words, for the "Run off profile of customer
 * deposits based on type (Core/Non-Core)". Oracle's mechanic (ALM UG Ch.
 * 11.3) is the one used here: for each non-maturity product, allocate the
 * balance across tenor tiers, each tagged Core or Volatile, totalling 100%.
 *
 * This is also what makes the behavioural liquidity gap genuinely differ
 * from the contractual one. The previous platform's toggle rendered
 * identical data in both modes because no separate model existed.
 */

import { RuleEditor, RuleField, ruleInput } from '@/components/ui/RuleEditor';
import { RuleRows, RowInput, RowSelect, type RowColumn } from '@/components/ui/RuleRows';
import { TierAllocationBar, type AllocationSegment } from '@/components/ui/TierAllocationBar';
import { useAuth } from '@/context/AuthContext';
import { useRuleMutations, useRules, newRuleMeta } from '@/lib/ruleHooks';
import { DEFAULT_PATTERNS, DEFAULT_BETAS, type RunoffTier } from '@/engine/behavioural';
import { allocationError, type BehaviourPatternRule } from '@/engine/ruleTypes';
import type { BehaviouralTag } from '@/engine/types';

const TAGS: BehaviouralTag[] = ['Core', 'Non-Core', 'Operational', 'Non-Operational', 'N/A'];
const TIER_TYPES = ['Core', 'Volatile'] as const;

export function BehaviourPatterns() {
  const { user } = useAuth();
  const { data: rules = [], isLoading } = useRules<BehaviourPatternRule>('BehaviourPattern');
  const { save, remove, checkDependencies } = useRuleMutations<BehaviourPatternRule>('BehaviourPattern');

  const createDefault = (): BehaviourPatternRule => ({
    ...newRuleMeta('BehaviourPattern', 'New behaviour pattern set', user?.name ?? 'unknown'),
    kind: 'BehaviourPattern',
    patterns: DEFAULT_PATTERNS.map((p) => ({ ...p, tiers: [...p.tiers] })),
    betas: [...DEFAULT_BETAS],
  });

  const tierColumns = (patternIndex: number): RowColumn<RunoffTier>[] => [
    {
      key: 'tenor',
      header: 'Tenor (days)',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`tenor-${patternIndex}-${row.tenorDays}`}
          label="Tenor in days"
          type="number"
          value={row.tenorDays}
          disabled={readOnly}
          onChange={(v) => update({ tenorDays: Number(v) })}
        />
      ),
    },
    {
      key: 'percent',
      header: 'Share %',
      align: 'right',
      render: (row, update, readOnly) => (
        <RowInput
          id={`pct-${patternIndex}-${row.tenorDays}`}
          label="Share percent"
          type="number"
          step="0.1"
          value={row.percent}
          disabled={readOnly}
          onChange={(v) => update({ percent: Number(v) })}
        />
      ),
    },
    {
      key: 'type',
      header: 'Classification',
      width: '30%',
      render: (row, update, readOnly) => (
        <RowSelect
          id={`type-${patternIndex}-${row.tenorDays}`}
          label="Tier classification"
          value={row.type}
          options={TIER_TYPES}
          disabled={readOnly}
          onChange={(v) => update({ type: v })}
        />
      ),
    },
  ];

  return (
    <RuleEditor<BehaviourPatternRule>
      title="Behaviour Patterns"
      description="How non-maturity deposits actually run off. Tiers must total 100%, and each is classified Core or Volatile."
      noun="pattern set"
      rules={rules}
      isLoading={isLoading}
      createDefault={createDefault}
      onSave={save}
      onDelete={remove}
      checkDependencies={checkDependencies}
      summarise={(r) => `${r.patterns.length} pattern(s), ${r.betas.length} beta(s)`}
      validate={(r) => {
        for (const p of r.patterns) {
          const error = allocationError(p.tiers.map((t) => t.percent));
          if (error) return `${p.name}: ${error}`;
          if (p.appliesTo.length === 0) return `${p.name} applies to no deposit type.`;
        }
        for (const b of r.betas) {
          if (b.beta < 0 || b.beta > 1) return `Beta for ${b.behaviouralTag} must be between 0 and 1.`;
        }
        return null;
      }}
      guidance={
        <>
          <span className="font-bold">Assumptions, not fitted coefficients.</span> These are published-style rates by
          deposit type. Fitting them to observed withdrawals needs multi-period position history, which accumulates only
          once several as-of dates are loaded — the platform says so rather than implying a model it does not have.
        </>
      }
      renderBody={(rule, update, readOnly) => (
        <div className="space-y-6">
          {rule.patterns.map((pattern, patternIndex) => {
            const setPattern = (patch: Partial<typeof pattern>) =>
              update({ patterns: rule.patterns.map((p, i) => (i === patternIndex ? { ...p, ...patch } : p)) });
            const total = pattern.tiers.reduce((s, t) => s + t.percent, 0);
            const corePercent = pattern.tiers.filter((t) => t.type === 'Core').reduce((s, t) => s + t.percent, 0);

            return (
              <div key={pattern.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <RuleField label="Pattern name">
                    <input
                      value={pattern.name}
                      disabled={readOnly}
                      onChange={(e) => setPattern({ name: e.target.value })}
                      className={ruleInput}
                      aria-label={`Pattern ${patternIndex + 1} name`}
                    />
                  </RuleField>
                  <RuleField label="Applies to deposit types">
                    <div className="flex flex-wrap gap-2 pt-1">
                      {TAGS.filter((t) => t !== 'N/A').map((tag) => (
                        <span key={tag} className="flex items-center gap-1 text-[11px]">
                          <input
                            id={`tag-${patternIndex}-${tag}`}
                            type="checkbox"
                            checked={pattern.appliesTo.includes(tag)}
                            disabled={readOnly}
                            onChange={(e) =>
                              setPattern({
                                appliesTo: e.target.checked
                                  ? [...pattern.appliesTo, tag]
                                  : pattern.appliesTo.filter((t) => t !== tag),
                              })
                            }
                            className="accent-gold-500"
                          />
                          <label htmlFor={`tag-${patternIndex}-${tag}`} className="cursor-pointer text-gray-600">
                            {tag}
                          </label>
                        </span>
                      ))}
                    </div>
                  </RuleField>
                </div>

                {pattern.tiers.length > 1 && (
                  <div className="mb-4">
                    <TierAllocationBar
                      segments={sortedTierOrder(pattern.tiers).map(
                        (origIndex): AllocationSegment => ({
                          key: String(origIndex),
                          label: `${pattern.tiers[origIndex]!.tenorDays}d`,
                          percent: pattern.tiers[origIndex]!.percent,
                          tone: pattern.tiers[origIndex]!.type === 'Core' ? 'core' : 'volatile',
                        }),
                      )}
                      readOnly={readOnly}
                      onResize={(leftDisplay, rightDisplay, leftPercent, rightPercent) => {
                        const order = sortedTierOrder(pattern.tiers);
                        const leftOrig = order[leftDisplay]!;
                        const rightOrig = order[rightDisplay]!;
                        setPattern({
                          tiers: pattern.tiers.map((t, i) =>
                            i === leftOrig ? { ...t, percent: leftPercent } : i === rightOrig ? { ...t, percent: rightPercent } : t,
                          ),
                        });
                      }}
                    />
                  </div>
                )}

                <RuleRows<RunoffTier>
                  rows={pattern.tiers}
                  columns={tierColumns(patternIndex)}
                  rowKey={(_tier, i) => `${pattern.id}-${i}`}
                  onChange={(tiers) => setPattern({ tiers })}
                  readOnly={readOnly}
                  addLabel="Add tier"
                  createRow={() => ({ tenorDays: 365, percent: 0, type: 'Core' })}
                  footer={
                    <span className={Math.abs(total - 100) < 0.0001 ? 'text-success' : 'text-danger'}>
                      Allocation {total.toFixed(1)}% · core share {corePercent.toFixed(0)}%
                    </span>
                  }
                />
              </div>
            );
          })}

          <div className="rounded-lg border border-gray-200 p-4">
            <h3 className="mb-1 text-[12px] font-bold text-navy-900">Deposit betas</h3>
            <p className="mb-3 text-[11px] leading-relaxed text-gray-500">
              What share of a policy-rate move reaches depositors. Without these, NII sensitivity assumes full
              pass-through, which no bank experiences — stickier balances reprice least.
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {rule.betas.map((b, i) => (
                <RuleField key={b.behaviouralTag} label={b.behaviouralTag}>
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={b.beta}
                    disabled={readOnly}
                    onChange={(e) =>
                      update({
                        betas: rule.betas.map((x, j) => (j === i ? { ...x, beta: Number(e.target.value) } : x)),
                      })
                    }
                    className={`${ruleInput} text-right font-mono`}
                    aria-label={`${b.behaviouralTag} beta`}
                  />
                </RuleField>
              ))}
            </div>
          </div>
        </div>
      )}
    />
  );
}

/** Original tier indices, ordered near-term to far-term — the allocation bar reads left to right as time does. */
function sortedTierOrder(tiers: RunoffTier[]): number[] {
  return tiers.map((_, i) => i).sort((a, b) => tiers[a]!.tenorDays - tiers[b]!.tenorDays);
}
