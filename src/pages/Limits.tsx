import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { ResultsFrame } from '@/components/results/ResultsFrame';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useScope } from '@/context/ScopeContext';
import { useSelectedRun, frameProps } from '@/lib/resultHooks';
import { useRuns, useRunResults } from '@/lib/runHooks';
import {
  evaluateAll,
  useBreachNotes,
  useLimitConfigs,
  useSaveBreachNote,
  useSaveLimitConfig,
  useTemporaryLimits,
  type EvaluatedLimit,
} from '@/lib/limitHooks';
import { detectTransition, expiringSoon } from '@/engine/limits';
import { formatMetric } from '@/lib/metrics';
import { remediation, newId } from '@/lib/governanceHooks';
import type { LimitConfig } from '@/engine/limits';

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  Green: 'success', Amber: 'warning', Red: 'danger', 'No data': 'neutral',
};

export function Limits() {
  const { hasPermission, user } = useAuth();
  const { affiliateCode } = useScope();
  const selected = useSelectedRun();
  const { run, results } = selected;

  const { data: configs = [] } = useLimitConfigs(affiliateCode);
  const { data: temporary = [] } = useTemporaryLimits();
  const { data: notes = [] } = useBreachNotes();
  const saveConfig = useSaveLimitConfig();
  const saveNote = useSaveBreachNote();
  const saveIssue = remediation.useSave();
  const { data: openIssues = [] } = remediation.useList(affiliateCode === 'GROUP' ? undefined : affiliateCode);
  const [, navigate] = useLocation();

  const canEdit = hasPermission('limits.manage') || hasPermission('run.execute');
  const [editing, setEditing] = useState<LimitConfig | null>(null);
  const [noteFor, setNoteFor] = useState<EvaluatedLimit | null>(null);

  const handleRaiseIssue = async (e: EvaluatedLimit) => {
    if (!user) return;
    const now = new Date().toISOString();
    await saveIssue.mutateAsync({
      id: newId('CR'),
      title: `${e.label} breach - ${e.config.affiliateCode ?? 'Group'}`,
      description: `Auto-raised from a ${e.status} breach on ${e.label}.`,
      source: 'Limits & Breaches',
      linkedLimitId: e.limitId,
      linkedBatchId: null,
      severity: e.status === 'Red' ? 'High' : 'Medium',
      stage: 'Identified',
      owner: '',
      affiliateCode: e.config.affiliateCode,
      raisedBy: user.name,
      raisedAt: now,
      dueDate: null,
      closedAt: null,
      closureApprovedBy: null,
      updates: [{ at: now, by: user.name, stage: 'Identified', note: 'Raised from a limit breach.' }],
    });
    navigate('/controls/remediation');
  };

  const evaluations = useMemo(
    () => (run ? evaluateAll(configs, results, run.asOfDate, temporary) : []),
    [configs, results, run, temporary],
  );

  // Escalation, automated: detectTransition() previously computed the same new-breach/escalation
  // logic below but nothing ever called it - a breach only got tracked if a person happened to
  // notice the colour change and click "Raise a remediation issue" themselves. Comparing against
  // the most recent prior Completed run for this scope lets a genuinely new breach raise its own
  // issue the moment this screen is opened, instead of waiting on someone to notice.
  const runsQuery = useRuns(affiliateCode);
  const priorRun = useMemo(() => {
    if (!run) return null;
    const allRuns = runsQuery.data ?? [];
    return (
      allRuns
        .filter((r) => r.status === 'Completed' && r.id !== run.id && r.asOfDate < run.asOfDate)
        .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0] ?? null
    );
  }, [runsQuery.data, run]);
  const { data: priorResults = [] } = useRunResults(priorRun?.id ?? null);
  const priorEvaluations = useMemo(
    () => (priorRun ? evaluateAll(configs, priorResults, priorRun.asOfDate, temporary) : []),
    [configs, priorResults, priorRun, temporary],
  );
  const transitionFor = useMemo(() => {
    const priorByMetric = new Map(priorEvaluations.map((e) => [e.metricKey, e]));
    const map = new Map<string, ReturnType<typeof detectTransition>>();
    for (const e of evaluations) map.set(e.limitId, detectTransition(priorByMetric.get(e.metricKey) ?? null, e));
    return map;
  }, [evaluations, priorEvaluations]);

  const hasOpenIssue = (limitId: string) =>
    openIssues.some((i) => i.linkedLimitId === limitId && i.stage !== 'Closed');

  const autoRaised = useRef(new Set<string>());
  useEffect(() => {
    // Wait for run history to actually load - otherwise an empty allRuns mid-fetch would look
    // identical to "no prior run exists" and could raise a spurious issue before we really know.
    if (!runsQuery.isSuccess) return;
    for (const e of evaluations) {
      const transition = transitionFor.get(e.limitId);
      if (!transition?.isNewBreach || hasOpenIssue(e.limitId) || autoRaised.current.has(e.limitId)) continue;
      autoRaised.current.add(e.limitId);
      const now = new Date().toISOString();
      void saveIssue.mutateAsync({
        id: newId('CR'),
        title: `${e.label} breach - ${e.config.affiliateCode ?? 'Group'}`,
        description: `Automatically escalated: ${e.label} moved from ${transition.from} to ${transition.to}.`,
        source: 'Limits & Breaches (auto-escalated)',
        linkedLimitId: e.limitId,
        linkedBatchId: null,
        severity: e.status === 'Red' ? 'High' : 'Medium',
        stage: 'Identified',
        owner: '',
        affiliateCode: e.config.affiliateCode,
        raisedBy: 'System (auto-escalation)',
        raisedAt: now,
        dueDate: null,
        closedAt: null,
        closureApprovedBy: null,
        updates: [
          { at: now, by: 'System (auto-escalation)', stage: 'Identified', note: 'Auto-raised on a new breach transition.' },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per evaluation set, not on every openIssues refetch
  }, [evaluations, transitionFor, runsQuery.isSuccess]);

  const red = evaluations.filter((e) => e.status === 'Red');
  const amber = evaluations.filter((e) => e.status === 'Amber');
  const noData = evaluations.filter((e) => e.status === 'No data');
  const regBreaches = evaluations.filter((e) => e.breachesRegulatoryMinimum);
  const expiring = run ? expiringSoon(temporary, run.asOfDate) : [];

  const columns: ResultColumn<EvaluatedLimit>[] = [
    { key: 'label', header: 'Limit', render: (e) => <span className="font-medium text-navy-900">{e.label}</span> },
    {
      key: 'value',
      header: 'Current',
      align: 'right',
      render: (e) => (
        <span className={`font-mono font-bold ${e.status === 'Red' ? 'text-danger' : e.status === 'Amber' ? 'text-warning' : ''}`}>
          {formatMetric(e.value, e.metricKey)}
        </span>
      ),
      compareValue: (e) => e.value,
    },
    {
      key: 'appetite',
      header: 'Amber / Red',
      align: 'right',
      render: (e) => (
        <span className="font-mono text-[11px] text-gray-500">
          {formatMetric(e.appliedAmberThreshold, e.metricKey)} / {formatMetric(e.appliedRedThreshold, e.metricKey)}
          {e.temporaryLimitId && <span className="ml-1 text-warning" title="Temporary limit applied">*</span>}
        </span>
      ),
    },
    {
      key: 'headroom',
      header: 'Headroom',
      align: 'right',
      render: (e) =>
        e.headroom === null ? (
          <span className="text-gray-300">-</span>
        ) : (
          <span className={`font-mono ${e.headroom < 0 ? 'text-danger' : ''}`}>
            {e.headroom > 0 ? '+' : ''}
            {e.headroom.toFixed(2)}
          </span>
        ),
    },
    {
      key: 'utilisation',
      header: 'Appetite used',
      align: 'right',
      render: (e) =>
        e.utilisationPercent === null ? (
          <span className="text-gray-300">-</span>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full ${e.status === 'Red' ? 'bg-danger' : e.status === 'Amber' ? 'bg-warning' : 'bg-success'}`}
                style={{ width: `${Math.min(100, Math.max(0, e.utilisationPercent))}%` }}
              />
            </div>
            <span className="font-mono text-[11px]">{e.utilisationPercent.toFixed(0)}%</span>
          </div>
        ),
    },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} tone={TONE[e.status]} /> },
    {
      key: 'regulatory',
      header: 'Regulatory',
      render: (e) =>
        e.config.regulatoryMinimum === null ? (
          <span className="text-[11px] text-gray-400">internal only</span>
        ) : e.breachesRegulatoryMinimum ? (
          <StatusBadge status="Below minimum" tone="danger" />
        ) : (
          <StatusBadge status="Compliant" tone="success" />
        ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Limits & Breaches"
        description="Risk appetite evaluated against the selected run - not a separate set of numbers."
        asOfDate={run?.asOfDate ?? null}
        scope={affiliateCode}
        metrics={[
          { label: 'Limits monitored', value: String(evaluations.length), about: 'Limit configurations active for this scope, evaluated automatically against the selected run.' },
          { label: 'In breach', value: String(red.length), tone: red.length > 0 ? 'danger' : 'success', about: 'Limits currently graded Red - inside or beyond the most severe internal threshold.' },
          { label: 'On watch', value: String(amber.length), tone: amber.length > 0 ? 'warning' : 'success', about: 'Limits currently graded Amber - inside appetite but past the early-warning threshold.' },
          {
            label: 'Below regulatory minimum',
            value: String(regBreaches.length),
            tone: regBreaches.length > 0 ? 'danger' : 'success',
            about: "Limits breaching the regulator's own floor, not just an internal one - the most serious category, distinct from a Red internal grading.",
          },
        ]}
        actions={
          <Link
            href="/kri"
            className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-navy-900 hover:border-navy-700"
          >
            See the trend
          </Link>
        }
      />

      <ResultsFrame {...frameProps(selected)} requires={[]}>
        {regBreaches.length > 0 && (
          <div className="mb-6 rounded-2xl border border-danger/30 bg-danger/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <StatusBadge status={`${regBreaches.length} below regulatory minimum`} tone="danger" />
            </div>
            <ul className="space-y-1 text-[11px] text-gray-700">
              {regBreaches.map((e) => (
                <li key={e.limitId}>
                  <span className="font-bold text-navy-900">{e.label}</span> at{' '}
                  <span className="font-mono">{formatMetric(e.value, e.metricKey)}</span>, against a floor of{' '}
                  <span className="font-mono">{formatMetric(e.config.regulatoryMinimum, e.metricKey)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {expiring.length > 0 && (
          <p className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[11px] leading-relaxed text-navy-900">
            <span className="font-bold">
              {expiring.length} temporary limit{expiring.length === 1 ? '' : 's'} expiring within 14 days.
            </span>{' '}
            When one lapses the underlying appetite reapplies, so a metric can move into breach without the book
            changing at all. {expiring.map((t) => t.limitId).join(', ')}.
          </p>
        )}

        {noData.length > 0 && (
          <p className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-gray-600">
            <span className="font-bold text-navy-900">
              {noData.length} limit{noData.length === 1 ? '' : 's'} could not be evaluated:
            </span>{' '}
            {noData.map((e) => e.label).join(', ')}. The selected run did not compute the underlying element. These
            report as <em>No data</em> rather than Green - an unmeasured limit is not a satisfied one.
          </p>
        )}

        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Limit framework</h2>
              <InfoButton label="About these thresholds">
                Thresholds shipped with the platform are illustrative starting points, not Ecobank&apos;s risk
                appetite. Expand any row to edit them; changes are stamped with who made them and when.
              </InfoButton>
            </div>
            <span className="text-[11px] text-gray-500">
              {configs.filter((c) => c.affiliateCode !== null).length} affiliate-specific,{' '}
              {configs.filter((c) => c.affiliateCode === null).length} Group-wide
            </span>
          </div>

          <ResultTable
            rows={evaluations}
            columns={columns}
            rowKey={(e) => e.limitId}
            rowTone={(e) => (e.status === 'Red' ? 'danger' : e.status === 'Amber' ? 'warning' : null)}
            emptyMessage="No limits configured for this scope."
            renderDetail={(e) => (
              <LimitDetail
                evaluation={e}
                notes={notes.filter((n) => n.breachId === e.limitId)}
                canEdit={canEdit}
                alreadyEscalated={hasOpenIssue(e.limitId)}
                onEdit={() => setEditing(e.config)}
                onAddNote={() => setNoteFor(e)}
                onRaiseIssue={() => void handleRaiseIssue(e)}
              />
            )}
          />
        </section>
      </ResultsFrame>

      {editing && (
        <LimitEditor
          config={editing}
          onCancel={() => setEditing(null)}
          onSave={async (next) => {
            await saveConfig.mutateAsync(next);
            setEditing(null);
          }}
        />
      )}

      {noteFor && (
        <NoteEditor
          evaluation={noteFor}
          onCancel={() => setNoteFor(null)}
          onSave={async (cause, action, target) => {
            await saveNote.mutateAsync({
              id: `BN-${Date.now().toString(36).toUpperCase()}`,
              breachId: noteFor.limitId,
              cause,
              resolutionAction: action,
              targetResolutionDate: target || null,
              authorName: user?.name ?? 'unknown',
              recordedAt: new Date().toISOString(),
            });
            setNoteFor(null);
          }}
        />
      )}
    </>
  );
}

function LimitDetail({
  evaluation,
  notes,
  canEdit,
  alreadyEscalated,
  onEdit,
  onAddNote,
  onRaiseIssue,
}: {
  evaluation: EvaluatedLimit;
  notes: Array<{ id: string; cause: string; resolutionAction: string; authorName: string; recordedAt: string; targetResolutionDate: string | null }>;
  canEdit: boolean;
  alreadyEscalated: boolean;
  onEdit: () => void;
  onAddNote: () => void;
  onRaiseIssue: () => void;
}) {
  const isBreached = evaluation.status === 'Red' || evaluation.status === 'Amber';
  const c = evaluation.config;
  return (
    <div className="space-y-3 text-[11px]">
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <D label="Metric key" value={c.metricKey} mono />
        <D label="Direction" value={c.direction} />
        <D label="Green" value={formatMetric(c.greenThreshold, c.metricKey)} mono />
        <D label="Regulatory floor" value={c.regulatoryMinimum === null ? 'none' : formatMetric(c.regulatoryMinimum, c.metricKey)} mono />
        <D label="Scope" value={c.affiliateCode ?? 'Group-wide'} />
        <D label="Severity" value={evaluation.severity ?? '-'} />
        <D label="Last updated by" value={c.updatedBy} />
        <D label="When" value={new Date(c.updatedAt).toLocaleString()} />
      </dl>

      {evaluation.temporaryLimitId && (
        <p className="rounded bg-warning/5 px-3 py-2 leading-relaxed text-navy-900">
          A temporary limit is in force until{' '}
          <span className="font-mono">{evaluation.temporaryLimitExpiresOn}</span>. The thresholds shown in the table
          are the relaxed ones; the underlying appetite is {formatMetric(c.amberThreshold, c.metricKey)} /{' '}
          {formatMetric(c.redThreshold, c.metricKey)}.
        </p>
      )}

      {notes.length > 0 && (
        <div className="rounded border border-gray-100 p-3">
          <p className="mb-2 font-bold uppercase tracking-wider text-gray-400">Breach notes</p>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id}>
                <p className="text-gray-700">
                  <span className="font-bold">Cause:</span> {n.cause}
                </p>
                <p className="text-gray-700">
                  <span className="font-bold">Action:</span> {n.resolutionAction}
                  {n.targetResolutionDate && <span className="text-gray-500"> - target {n.targetResolutionDate}</span>}
                </p>
                <p className="text-gray-400">
                  {n.authorName} · {new Date(n.recordedAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          className="rounded border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
        >
          Edit thresholds
        </button>
        <button
          type="button"
          onClick={onAddNote}
          disabled={!canEdit}
          className="rounded border border-gray-200 px-3 py-1.5 font-bold text-navy-900 hover:border-navy-700 disabled:opacity-40"
        >
          Record a breach note
        </button>
        {isBreached && (
          <button
            type="button"
            onClick={onRaiseIssue}
            disabled={!canEdit || alreadyEscalated}
            className="rounded border border-danger/30 px-3 py-1.5 font-bold text-danger hover:border-danger disabled:opacity-40"
            title={
              alreadyEscalated
                ? 'An open remediation issue already tracks this breach'
                : 'Creates a tracked remediation issue linked to this breach'
            }
          >
            {alreadyEscalated ? 'Already escalated' : 'Raise a remediation issue'}
          </button>
        )}
      </div>
    </div>
  );
}

function LimitEditor({
  config,
  onCancel,
  onSave,
}: {
  config: LimitConfig;
  onCancel: () => void;
  onSave: (c: LimitConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const set = (patch: Partial<LimitConfig>) => setDraft((d) => ({ ...d, ...patch }));

  // Thresholds out of order would silently invert the evaluation.
  const ordered =
    draft.direction === 'higher-is-better'
      ? draft.greenThreshold >= draft.amberThreshold && draft.amberThreshold >= draft.redThreshold
      : draft.greenThreshold <= draft.amberThreshold && draft.amberThreshold <= draft.redThreshold;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-[14px] font-bold text-navy-900">{draft.label}</h2>
        <p className="mb-4 text-[11px] text-gray-500">
          {draft.direction === 'higher-is-better'
            ? 'Higher is better, so thresholds must descend: green ≥ amber ≥ red.'
            : 'Lower is better, so thresholds must ascend: green ≤ amber ≤ red.'}
        </p>

        <div className="grid grid-cols-3 gap-3">
          {(['greenThreshold', 'amberThreshold', 'redThreshold'] as const).map((k) => (
            <div key={k}>
              <label htmlFor={k} className="mb-1 block text-[11px] font-medium capitalize text-gray-600">
                {k.replace('Threshold', '')}
              </label>
              <input
                id={k}
                type="number"
                step="0.01"
                value={draft[k]}
                onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<LimitConfig>)}
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
              />
            </div>
          ))}
        </div>

        {!ordered && (
          <p className="mt-3 text-[11px] font-bold text-danger">
            Thresholds are out of order - as written, a worse figure would grade better than a good one.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ordered}
            onClick={() => void onSave(draft)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Save thresholds
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteEditor({
  evaluation,
  onCancel,
  onSave,
}: {
  evaluation: EvaluatedLimit;
  onCancel: () => void;
  onSave: (cause: string, action: string, target: string) => Promise<void>;
}) {
  const [cause, setCause] = useState('');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-[14px] font-bold text-navy-900">Breach note - {evaluation.label}</h2>
        <p className="mb-4 text-[11px] text-gray-500">
          Currently {formatMetric(evaluation.value, evaluation.metricKey)} against a red threshold of{' '}
          {formatMetric(evaluation.appliedRedThreshold, evaluation.metricKey)}.
        </p>

        <label htmlFor="cause" className="mb-1 block text-[11px] font-medium text-gray-600">
          Cause
        </label>
        <textarea
          id="cause"
          rows={2}
          value={cause}
          onChange={(e) => setCause(e.target.value)}
          className="mb-3 w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
        />

        <label htmlFor="action" className="mb-1 block text-[11px] font-medium text-gray-600">
          Resolution action
        </label>
        <textarea
          id="action"
          rows={2}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="mb-3 w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
        />

        <label htmlFor="target" className="mb-1 block text-[11px] font-medium text-gray-600">
          Target resolution date
        </label>
        <input
          id="target"
          type="date"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
        />

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">
            Cancel
          </button>
          <button
            type="button"
            disabled={cause.trim() === '' || action.trim() === ''}
            onClick={() => void onSave(cause, action, target)}
            className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Record note
          </button>
        </div>
      </div>
    </div>
  );
}

function D({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className={mono ? 'font-mono text-gray-700' : 'text-gray-700'}>{value}</dd>
    </div>
  );
}
