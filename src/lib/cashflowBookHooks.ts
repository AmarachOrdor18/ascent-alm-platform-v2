import { useMemo } from 'react';
import { useRuleAsUsedBy } from '@/lib/ruleHooks';
import { useYieldCurves } from '@/lib/hooks';
import { buildCashflowBook } from '@/engine/run';
import { applyProductCharacteristics } from '@/engine/classification';
import { DEFAULT_PATTERNS } from '@/engine/behavioural';
import { engineCurvesAsOf, type YieldCurve } from '@/engine/ftp';
import type { PositionCashflows } from '@/engine/cashflow';
import type { Position, ProcessRun } from '@/engine/types';
import type { BehaviourPatternRule, PrepaymentRule, ProductCharacteristicRule } from '@/engine/ruleTypes';

export interface RunValuationInputs {
  /** The positions after the run's own Product Characteristics rule - what the book was generated from. */
  positions: Position[];
  book: PositionCashflows[];
  curves: YieldCurve[];
}

/**
 * The cashflow book and curves a run computed on, rebuilt for a screen that recomputes on the run's book
 * (the six-shock battery on IRRBB, Stress Testing and the Dashboard). Same rules at the versions the run
 * used, same defaults when the run had none, same builder (run.ts buildCashflowBook) - so a shock battery
 * on screen and the run's own EVE element are one calculation. Null until everything has loaded, or when
 * the book cannot be built; callers then fall back to the balance-based approximations.
 */
export function useRunValuationInputs(run: ProcessRun | null, positions: Position[]): RunValuationInputs | null {
  const { data: behaviourRule = null } = useRuleAsUsedBy<BehaviourPatternRule>(run?.behaviourPatternRuleId, run);
  const { data: prepaymentRule = null } = useRuleAsUsedBy<PrepaymentRule>(run?.prepaymentRuleId, run);
  const { data: productRule = null } = useRuleAsUsedBy<ProductCharacteristicRule>(
    run?.productCharacteristicRuleId,
    run,
  );
  const { data: storedCurves = [] } = useYieldCurves();

  return useMemo(() => {
    if (!run || positions.length === 0) return null;
    const classified = productRule?.assumptions?.length
      ? applyProductCharacteristics(positions, productRule.assumptions)
      : positions;
    try {
      const book = buildCashflowBook(classified, run.asOfDate, {
        // Runs from the degradation model (they carry `degradations`) ran with contractual timing when no
        // behaviour rule was set; older runs used the engine's default patterns.
        behaviourPatterns: behaviourRule?.patterns ?? (run.degradations ? [] : DEFAULT_PATTERNS),
        prepaymentRules: (prepaymentRule?.assumptions ?? [])
          .filter((a) => a.method !== 'None')
          .map((a) => ({ commonCoaCode: a.commonCoaCode, cpr: a.cpr })),
        termDepositBehaviour: behaviourRule?.termDepositBehaviour ?? [],
      });
      return { positions: classified, book, curves: engineCurvesAsOf(storedCurves, run.asOfDate) };
    } catch {
      return null;
    }
  }, [run, positions, behaviourRule, prepaymentRule, productRule, storedCurves]);
}
