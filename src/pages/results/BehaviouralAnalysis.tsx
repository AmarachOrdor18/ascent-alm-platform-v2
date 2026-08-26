/**
 * Behavioural Analysis — screen 41.
 *
 * What the core/volatile split actually is, per product and per behavioural
 * tag, and what recalibrating it would do.
 *
 * The recalibration panel writes to the Behaviour Pattern rule and then
 * requires a re-run — it does not silently mutate the figures on screen.
 * That is the discipline the whole platform rests on: a displayed number
 * always belongs to a run that produced it.
 */

import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { CHART_AXIS_TICK, CHART_COLORS, CHART_GRID_STROKE, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE } from '@/components/results/chartStyle';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps, payloadOf, methodologyOf } from '@/lib/resultHooks';
import { useRules } from '@/lib/ruleHooks';
import { ACTIVITY_CORE_UPLIFT } from '@/engine/behavioural';
import { formatAmount, formatPct } from '@/lib/format';
import type { DepositRunoffResult, RunoffLine } from '@/engine/behavioural';
import type { BehaviourPatternRule } from '@/engine/ruleTypes';

export function BehaviouralAnalysis() {
  const { affiliate, affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;
  const currency = run?.reportingCurrency ?? 'USD';

  const gap = payloadOf<{ runoff: DepositRunoffResult }>(results, 'LiquidityGap');
  const runoff = gap?.runoff ?? null;

  const { data: patternRules = [] } = useRules<BehaviourPatternRule>('BehaviourPattern');
  const patternRule = patternRules.find((r) => r.id === run?.behaviourPatternRuleId) ?? null;

  const [groupBy, setGroupBy] = useState<'tag' | 'product' | 'activity'>('tag');

  const grouped = useMemo(() => {
    if (!runoff) return [];
    const key = (l: RunoffLine) =>
      groupBy === 'tag' ? l.behaviouralTag : groupBy === 'product' ? l.productClass : l.activity;

    const map = new Map<string, { group: string; balance: number; core: number; volatile: number; accounts: number }>();
    for (const line of runoff.lines) {
      const k = key(line);
      const entry = map.get(k) ?? { group: k, balance: 0, core: 0, volatile: 0, accounts: 0 };
      entry.balance += line.balance;
      entry.core += line.coreAmount;
      entry.volatile += line.volatileAmount;
      entry.accounts += 1;
      map.set(k, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
  }, [runoff, groupBy]);

  const columns: ResultColumn<(typeof grouped)[number]>[] = [
    { key: 'group', header: groupBy === 'tag' ? 'Behavioural tag' : groupBy === 'product' ? 'Product' : 'Activity', render: (g) => <span className="font-medium">{g.group}</span> },
    { key: 'accounts', header: 'Accounts', align: 'right', render: (g) => <span className="font-mono">{g.accounts}</span> },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (g) => <Amount value={g.balance} currency={currency} />,
      compareValue: (g) => g.balance,
    },
    { key: 'core', header: 'Core', align: 'right', render: (g) => <Amount value={g.core} currency={currency} /> },
    {
      key: 'volatile',
      header: 'Volatile',
      align: 'right',
      render: (g) => <Amount value={g.volatile} currency={currency} />,
    },
    {
      key: 'corePct',
      header: 'Core %',
      align: 'right',
      render: (g) => (
        <span className="font-mono font-bold">{g.balance > 0 ? formatPct((g.core / g.balance) * 100) : '—'}</span>
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Behavioural Analysis"
        description="How non-maturity deposits are split into core and volatile, and what the split is driven by."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliate?.name ?? affiliateCode}
        currency={currency}
        metrics={[
          {
            label: 'Core share',
            value: formatPct(runoff?.corePercent ?? null),
            tone: (runoff?.corePercent ?? 100) < 50 ? 'warning' : 'success',
          },
          {
            label: 'Total deposits modelled',
            value: runoff ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(runoff.totalDeposits) : '—',
          },
          {
            label: 'Unmodelled',
            value: runoff ? new Intl.NumberFormat(undefined, { notation: 'compact' }).format(runoff.unmodelled) : '—',
            tone: (runoff?.unmodelled ?? 0) > 0 ? 'warning' : 'success',
          },
          {
            label: 'Pattern rule',
            value: patternRule ? `v${patternRule.version}` : 'engine default',
          },
        ]}
        actions={
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            {(['tag', 'product', 'activity'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={`rounded px-3 py-1.5 text-[11px] font-bold capitalize ${
                  groupBy === g ? 'bg-navy-900 text-white' : 'text-gray-500 hover:text-navy-900'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        }
      />

      <ResultsFrame
        {...frameProps(selected)}
        requires={['LiquidityGap']}
        elementLabels={{ LiquidityGap: 'the deposit run-off model' }}
      >
        {runoff && (
          <>
            {runoff.unmodelled > 0 && (
              <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
                <span className="font-bold">
                  <Amount value={runoff.unmodelled} currency={currency} /> has a behavioural tag with no matching
                  pattern.
                </span>{' '}
                It is excluded from the core and volatile totals rather than defaulted into either. Add a pattern
                covering that tag on{' '}
                <Link href="/rules/behaviour-patterns" className="font-bold underline-offset-2 hover:underline">
                  Behaviour Patterns
                </Link>{' '}
                and re-run.
              </p>
            )}

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Balance vs. volatile, by {groupBy === 'tag' ? 'behavioural tag' : groupBy}
              </h2>
              <p className="mb-4 text-[11px] font-medium text-gray-400">
                Volatile is the share the pattern models as likely to leave, not a fixed 12-month projection
              </p>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={grouped} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="group" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={CHART_AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => formatAmount(v, currency)}
                    />
                    <Tooltip formatter={(value: number, name: string) => [formatAmount(value, currency), name]} contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend wrapperStyle={CHART_LEGEND_STYLE} />
                    <Bar dataKey="balance" name="Balance" fill={CHART_COLORS.neutral} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="volatile" name="Volatile" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Split by {groupBy === 'tag' ? 'behavioural tag' : groupBy}
              </h2>
              <ResultTable rows={grouped} columns={columns} rowKey={(g) => g.group} />
            </section>

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Activity adjusts the split
              </h2>
              <p className="mb-4 text-[11px] leading-relaxed text-gray-500">
                Account movement is read from turnover and used to shift the core share. A dormant account is stickier
                than an active one — it is not being used, so it is not about to leave — and the uplift below is
                applied on top of the pattern&apos;s base split.
              </p>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(ACTIVITY_CORE_UPLIFT).map(([level, uplift]) => (
                  <div key={level} className="rounded-lg bg-gray-50 p-4">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{level}</dt>
                    <dd className="mt-1 font-mono text-[18px] font-bold text-navy-900">
                      {uplift > 0 ? '+' : ''}
                      {(uplift * 100).toFixed(0)}pp
                    </dd>
                    <dd className="text-[10px] text-gray-500">
                      {level === 'Unknown' ? 'no turnover loaded — no adjustment' : 'to the core share'}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Patterns this run applied
              </h2>
              {patternRule ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={`${patternRule.name} v${patternRule.version}`} tone="neutral" />
                    <span className="text-[11px] text-gray-500">{patternRule.patterns.length} pattern(s)</span>
                  </div>
                  {patternRule.patterns.map((p) => (
                    <div key={p.name} className="rounded-lg border border-gray-100 p-3">
                      <p className="text-[12px] font-bold text-navy-900">{p.name}</p>
                      <p className="text-[11px] text-gray-500">Applies to {p.appliesTo.join(', ')}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {p.tiers.map((t) => (
                          <span
                            key={`${p.name}-${t.type}-${t.tenorDays}`}
                            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-600"
                          >
                            {t.type} {t.percent}% at {t.tenorDays}d
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-gray-600">
                  No Behaviour Pattern rule was attached to this run, so the engine defaults applied. Attaching one on
                  the Process Run screen makes the assumption governed and versioned like any other.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-navy-100 bg-navy-50 p-6">
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-navy-900">
                Recalibrating
                <InfoButton label="Why there's no slider here">
                  Changing the split changes the behavioural gap ladder, the survival horizon and NSFR together. So
                  it is done by editing the rule and re-running, not by a slider on this screen that would leave the
                  figures above describing assumptions nobody applied.
                </InfoButton>
              </h2>
              <p className="mb-4 text-[11px] leading-relaxed text-navy-900">Edit the rule, then re-run to apply it.</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/rules/behaviour-patterns"
                  className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
                >
                  Edit behaviour patterns
                </Link>
                <Link
                  href="/what-if"
                  className="rounded-lg border border-navy-700 px-4 py-2 text-[12px] font-bold text-navy-900 hover:bg-white"
                >
                  Test a run-off multiplier first
                </Link>
              </div>
            </section>

            <p className="mt-4 text-[11px] leading-relaxed text-gray-500">{methodologyOf(results, 'LiquidityGap')}</p>
          </>
        )}
      </ResultsFrame>
    </>
  );
}
