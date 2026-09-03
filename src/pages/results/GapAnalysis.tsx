import { useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { GapLadderChart, GapLadderTable } from '@/components/results/GapLadder';
import { Amount } from '@/components/ui/Amount';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { useRules } from '@/lib/ruleHooks';
import { NON_RATE_SENSITIVE } from '@/engine/buckets';
import type { BucketedTotal } from '@/engine/buckets';
import type { LiquidityGapResult } from '@/engine/liquidity';
import type { RepricingGapResult } from '@/engine/irrbb';
import type { TimeBucketRule } from '@/engine/ruleTypes';

type Basis = 'maturity' | 'repricing';

export function GapAnalysis() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const [basis, setBasis] = useState<Basis>('maturity');
  const { data: bucketRules = [] } = useRules<TimeBucketRule>('TimeBucket');
  const bucketRule = bucketRules.find((r) => r.id === run?.timeBucketRuleId) ?? null;

  const maturity = payloadOf<{ contractual: LiquidityGapResult; behavioural: LiquidityGapResult }>(
    results,
    'LiquidityGap',
  );
  const repricing = payloadOf<RepricingGapResult>(results, 'RepricingGap');

  const buckets: BucketedTotal[] =
    basis === 'maturity' ? (maturity?.contractual.buckets ?? []) : (repricing?.buckets ?? []);

  const last = buckets[buckets.length - 1];
  const worstBucket = buckets.reduce<BucketedTotal | null>(
    (acc, b) => (acc === null || b.gap < acc.gap ? b : acc),
    null,
  );
  const nonSensitive = repricing?.buckets.find((b) => b.bucket === NON_RATE_SENSITIVE);

  return (
    <>
      <ModuleHeader
        title="Maturity & Repricing Gap"
        description="Two ladders, two questions: when does cash arrive, and when does the rate reset."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Cumulative gap',
            value: last ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(last.cumulativeGap) : '-',
            tone: (last?.cumulativeGap ?? 0) < 0 ? 'warning' : 'neutral',
            about: 'The running total of every bucket’s gap in order - negative means more has matured on the liability side than the asset side up to that point.',
          },
          {
            label: 'Widest negative bucket',
            value: worstBucket ? worstBucket.bucket : '-',
            tone: (worstBucket?.gap ?? 0) < 0 ? 'warning' : 'neutral',
            about: 'The single time bucket carrying the largest net cash outflow - the point of maximum funding pressure on this ladder.',
          },
          {
            label: 'Buckets',
            value: String(buckets.length),
            about: 'The number of time buckets on the active ladder for this basis (maturity or repricing).',
          },
          {
            label: 'Bucket rule',
            value: bucketRule ? `v${bucketRule.version}` : 'engine default',
            about: 'The Time Bucket rule version this run consumed. Editing the rule later never changes what a completed run reports.',
          },
        ]}
        actions={
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {(['maturity', 'repricing'] as Basis[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBasis(b)}
                className={`rounded px-3 py-1.5 text-[11px] font-bold capitalize ${
                  basis === b ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        }
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['LiquidityGap', 'RepricingGap']}
        elementLabels={{ LiquidityGap: 'the maturity gap', RepricingGap: 'the repricing gap' }}
      >
        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-1.5">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">
              {basis === 'maturity' ? 'Maturity gap' : 'Repricing gap'}
            </h2>
            <InfoButton label="Methodology">
              {basis === 'maturity'
                ? 'Bucketed on contractual maturity - when the cash actually moves.'
                : 'Bucketed on next repricing date, falling back to maturity for fixed-rate instruments, which reprice only when they mature.'}
            </InfoButton>
          </div>
          <GapLadderChart buckets={buckets} currency={currency} />
        </section>

        {basis === 'repricing' && nonSensitive && (
          <div className="mb-6 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-gray-600">
            <p>
              <span className="font-bold text-navy-900">Non-rate-sensitive:</span>{' '}
              <Amount value={nonSensitive.assets} currency={currency} /> of assets and{' '}
              <Amount value={nonSensitive.liabilities} currency={currency} /> of liabilities sit in their own bucket
              rather than being spread across the ladder.
            </p>
            <InfoButton label="Why this matters">
              Equity and fixed assets do not reprice, and folding them into a tenor bucket would understate the gap.
            </InfoButton>
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-1.5">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">The ladder as numbers</h2>
            <InfoButton label="Methodology">
              {basis === 'maturity' ? methodologyOf(results, 'LiquidityGap') : methodologyOf(results, 'RepricingGap')}
            </InfoButton>
          </div>
          <GapLadderTable buckets={buckets} currency={currency} />
        </section>

        {bucketRule && (
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Bucket rule applied</h2>
              <StatusBadge status={`${bucketRule.name} v${bucketRule.version}`} tone="neutral" />
              <InfoButton label="Why this matters">
                This run consumed version {bucketRule.version} of the rule. Editing the rule now does not change what
                this run reports - that is what makes the figure defensible months later.
              </InfoButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {bucketRule.ladders
                .find((l) => (basis === 'maturity' ? l.kind === 'LiquidityGap' : l.kind === 'RepricingGap'))
                ?.buckets.map((b) => (
                  <span
                    key={b.label}
                    className="rounded border border-gray-200 px-2 py-1 font-mono text-[10px] text-gray-600"
                  >
                    {b.label}
                  </span>
                )) ?? <span className="text-[11px] text-gray-400">No ladder of this kind on the rule.</span>}
            </div>
          </section>
        )}

      </ResultsFrame>
    </>
  );
}
