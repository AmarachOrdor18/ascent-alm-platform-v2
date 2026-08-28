import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { Amount } from '@/components/ui/Amount';
import { useScope } from '@/context/ScopeContext';
import { useRunResults, useRuns, useExecuteRun, payloadOf } from '@/lib/runHooks';
import { useBatches } from '@/lib/hooks';
import { formatDate, formatPct } from '@/lib/format';
import type { ProcessRun, RunResult } from '@/engine/types';

const STATUS_TONE = { Completed: 'success', Running: 'info', Queued: 'warning', Draft: 'neutral', Failed: 'danger' } as const;

/** Headline figures pulled from a result set, for the comparison view. */
interface Headline {
  label: string;
  value: number | null;
  unit: 'percent' | 'amount' | 'days';
  higherIsBetter: boolean;
}

function headlines(results: RunResult[], currency: string): Headline[] {
  const lcr = payloadOf<{ lcrPercent: number | null }>(results, 'Lcr');
  const nsfr = payloadOf<{ nsfrPercent: number | null }>(results, 'Nsfr');
  const ldr = payloadOf<{ ratioPercent: number | null }>(results, 'LoanToDeposit');
  const nii = payloadOf<{ niiSensitivityPercent: number | null }>(results, 'NiiSensitivity');
  const eve = payloadOf<{ eveSensitivityPercentOfEquity: number | null }>(results, 'EveSensitivity');
  const survival = payloadOf<{ survivalHorizonDays: number }>(results, 'SurvivalHorizon');
  const conc = payloadOf<{ largestSharePercent: number | null }>(results, 'Concentration');

  void currency;
  return [
    { label: 'LCR', value: lcr?.lcrPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'NSFR', value: nsfr?.nsfrPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'Loan-to-deposit', value: ldr?.ratioPercent ?? null, unit: 'percent', higherIsBetter: false },
    { label: 'NII sensitivity', value: nii?.niiSensitivityPercent ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'EVE sensitivity', value: eve?.eveSensitivityPercentOfEquity ?? null, unit: 'percent', higherIsBetter: true },
    { label: 'Survival horizon', value: survival?.survivalHorizonDays ?? null, unit: 'days', higherIsBetter: true },
    { label: 'Largest depositor', value: conc?.largestSharePercent ?? null, unit: 'percent', higherIsBetter: false },
  ];
}

export function RunHistory() {
  const { affiliateCode, setRun } = useScope();
  const { data: runs = [], isLoading } = useRuns(affiliateCode);
  const { data: batches = [] } = useBatches();
  const execute = useExecuteRun();

  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const { data: leftResults = [] } = useRunResults(leftId);
  const { data: rightResults = [] } = useRunResults(rightId);

  const left = runs.find((r) => r.id === leftId) ?? null;
  const right = runs.find((r) => r.id === rightId) ?? null;

  const comparison = useMemo(() => {
    if (!left) return null;
    const a = headlines(leftResults, left.reportingCurrency);
    const b = right ? headlines(rightResults, right.reportingCurrency) : null;
    return a.map((metric, i) => ({
      ...metric,
      other: b?.[i]?.value ?? null,
      delta: b && b[i]?.value !== null && metric.value !== null ? metric.value - b[i]!.value! : null,
    }));
  }, [left, right, leftResults, rightResults]);

  const completed = runs.filter((r) => r.status === 'Completed');
  const failed = runs.filter((r) => r.status === 'Failed');

  /** A run is stale once its pinned data version has been superseded. */
  const isStale = (run: ProcessRun) =>
    run.positionBatchIds.some((id) => batches.find((b) => b.id === id)?.status === 'Superseded');

  const columns: ResultColumn<ProcessRun>[] = [
    { key: 'name', header: 'Run', render: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
    { key: 'affiliate', header: 'Scope', render: (r) => <span className="font-mono text-[11px]">{r.affiliateCode}</span> },
    { key: 'asOf', header: 'As at', render: (r) => <span className="font-mono text-[11px]">{formatDate(r.asOfDate)}</span> },
    { key: 'type', header: 'Type', render: (r) => <StatusBadge status={r.processType} tone="neutral" /> },
    { key: 'elements', header: 'Elements', align: 'right', render: (r) => <span className="font-mono">{r.elements.length}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /> },
    {
      key: 'freshness',
      header: 'Data',
      render: (r) =>
        isStale(r) ? <StatusBadge status="Superseded" tone="warning" /> : <StatusBadge status="Current" tone="success" />,
    },
    { key: 'created', header: 'Run at', render: (r) => <span className="text-[11px] text-gray-500">{new Date(r.createdAt).toLocaleString()}</span> },
  ];

  return (
    <>
      <ModuleHeader
        title="Run History"
        description="Every run, what it consumed and what it produced. Compare two to see why a figure moved."
        asOfDate={null}
        scope={affiliateCode === 'GROUP' ? 'All scopes' : affiliateCode}
        metrics={[
          { label: 'Runs', value: String(runs.length), about: 'Every run ever executed in this scope, regardless of outcome.' },
          { label: 'Completed', value: String(completed.length), tone: 'success', about: 'Runs that finished and produced results, available to results screens.' },
          { label: 'Failed', value: String(failed.length), tone: failed.length > 0 ? 'danger' : 'neutral', about: 'Runs that stopped rather than silently producing a partial answer — check the error log in each row.' },
          {
            label: 'On superseded data',
            value: String(runs.filter(isStale).length),
            tone: runs.some(isStale) ? 'warning' : 'neutral',
            about: 'Completed runs whose pinned data version has since been replaced by a newer batch — the figures are still exactly what was computed at the time, just no longer current.',
          },
        ]}
      />

      <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">Runs</h2>
        <ResultTable
          rows={runs}
          columns={columns}
          rowKey={(r) => r.id}
          emptyMessage={isLoading ? 'Loading…' : 'No runs yet. Execute one from Process Run.'}
          renderDetail={(run) => (
            <div className="space-y-3 text-[11px]">
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Detail label="Run ID" value={run.id} mono />
                <Detail label="Reporting currency" value={run.reportingCurrency} mono />
                <Detail label="Data version pinned" value={run.positionBatchIds.join(', ') || '—'} mono />
                <Detail label="Bucket rule" value={run.timeBucketRuleId || 'engine default'} mono />
                <Detail label="Behaviour rule" value={run.behaviourPatternRuleId ?? 'engine default'} mono />
                <Detail label="New business" value={run.newBusinessRuleId ?? 'none (static)'} mono />
                <Detail label="Transaction strategy" value={run.transactionStrategyId ?? 'none'} mono />
                <Detail label="Created by" value={run.createdBy} />
              </dl>

              {run.errorLog.length > 0 && (
                <div className="rounded bg-danger-bg px-3 py-2 text-danger">
                  <span className="font-bold">Processing errors</span>
                  <ul className="mt-1 space-y-0.5">
                    {run.errorLog.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">{e.code}</span> — {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isStale(run) && (
                <p className="rounded bg-warning-bg px-3 py-2 leading-relaxed text-warning">
                  The data version this run consumed has since been superseded. The figures below are what it actually
                  computed — re-run it to reflect current data.
                </p>
              )}

              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => setLeftId(run.id)}
                  className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                >
                  Compare as A
                </button>
                <button
                  type="button"
                  onClick={() => setRightId(run.id)}
                  className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700"
                >
                  Compare as B
                </button>
                <button
                  type="button"
                  onClick={() => setRun(run)}
                  disabled={run.status !== 'Completed'}
                  className="rounded border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
                >
                  Use for results screens
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void execute.mutateAsync({
                      ...run,
                      id: `RUN-${Date.now().toString(36).toUpperCase()}`,
                      name: `${run.name} (re-run)`,
                      status: 'Draft',
                      createdAt: new Date().toISOString(),
                      completedAt: null,
                      errorLog: [],
                    })
                  }
                  disabled={execute.isPending}
                  className="rounded bg-navy-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
                >
                  Re-run against current data
                </button>
              </div>
            </div>
          )}
        />
      </section>

      {left && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-[12px] font-bold uppercase tracking-widest text-navy-900">Comparison</h2>
          <p className="mb-4 text-[11px] text-gray-500">
            <span className="font-bold text-navy-900">A:</span> {left.name}
            {right && (
              <>
                {' · '}
                <span className="font-bold text-navy-900">B:</span> {right.name}
              </>
            )}
            {!right && ' — select a second run to compare against.'}
          </p>

          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2 px-3 font-bold">Metric</th>
                <th className="py-2 px-3 text-right font-bold">A</th>
                {right && <th className="py-2 px-3 text-right font-bold">B</th>}
                {right && <th className="py-2 px-3 text-right font-bold">Change</th>}
              </tr>
            </thead>
            <tbody>
              {comparison?.map((m) => {
                const improving = m.delta === null ? null : m.higherIsBetter ? m.delta > 0 : m.delta < 0;
                return (
                  <tr key={m.label} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium text-navy-900">{m.label}</td>
                    <td className="py-2 px-3 text-right font-mono">
                      {m.value === null ? (
                        <span className="text-gray-300">—</span>
                      ) : m.unit === 'percent' ? (
                        formatPct(m.value, 2)
                      ) : m.unit === 'days' ? (
                        `${m.value} days`
                      ) : (
                        <Amount value={m.value} currency={left.reportingCurrency} />
                      )}
                    </td>
                    {right && (
                      <td className="py-2 px-3 text-right font-mono">
                        {m.other === null ? (
                          <span className="text-gray-300">—</span>
                        ) : m.unit === 'percent' ? (
                          formatPct(m.other, 2)
                        ) : m.unit === 'days' ? (
                          `${m.other} days`
                        ) : (
                          <Amount value={m.other} currency={right.reportingCurrency} />
                        )}
                      </td>
                    )}
                    {right && (
                      <td
                        className={`py-2 px-3 text-right font-mono ${
                          m.delta === null ? 'text-gray-300' : improving ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {m.delta === null
                          ? '—'
                          : `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}${m.unit === 'percent' ? 'pp' : ''}`}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {right && left.asOfDate !== right.asOfDate && (
            <p className="mt-4 rounded-lg bg-navy-50 px-3 py-2 text-[11px] leading-relaxed text-navy-900">
              These runs are at different dates ({formatDate(left.asOfDate)} and {formatDate(right.asOfDate)}), so the
              change reflects both the balance sheet moving and any assumption differences between them.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-gray-700' : 'text-gray-700'}>{value}</dd>
    </div>
  );
}
