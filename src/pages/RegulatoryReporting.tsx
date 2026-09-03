import { useMemo, useState } from 'react';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ResultTable, type ResultColumn } from '@/components/ui/ResultTable';
import { RunPicker } from '@/components/layout/RunPicker';
import { useAuth } from '@/context/AuthContext';
import { GROUP_CODE } from '@/context/ScopeContext';
import { useAffiliates } from '@/lib/hooks';
import { accessibleAffiliates, scopedListCode } from '@/lib/scope';
import { regulatoryReturns, newId } from '@/lib/governanceHooks';
import { useRuns, useRunResults } from '@/lib/runHooks';
import { useBatches } from '@/lib/hooks';
import { isRunStale, isRunUnreconciled } from '@/lib/runStaleness';
import { metricValue, formatMetric } from '@/lib/metrics';
import { REGULATORY_MINIMA } from '@/engine/limits';
import type { ProcessRun, RegulatoryReturn, ReturnStatus } from '@/engine/types';

const STATUSES: ReturnStatus[] = ['Not started', 'In preparation', 'Under review', 'Submitted', 'Accepted', 'Rejected'];
const STATUS_TONE: Record<ReturnStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  'Not started': 'neutral', 'In preparation': 'warning', 'Under review': 'warning',
  Submitted: 'warning', Accepted: 'success', Rejected: 'danger',
};

export function RegulatoryReporting() {
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('reporting.generate') || hasPermission('reporting.manage') || hasPermission('run.execute');
  // A user confined to one affiliate only sees that affiliate's own returns, plus any Group-wide ones -
  // reporting.view is broad, so without this every affiliate's returns leaked to everyone who holds it.
  const { data: rows = [], isLoading } = regulatoryReturns.useList(scopedListCode(user, hasPermission));
  const { data: allAffiliates = [] } = useAffiliates();
  const affiliates = accessibleAffiliates(allAffiliates, user, hasPermission);
  // Same restriction as `rows` above - otherwise a restricted user could attach another affiliate's
  // run to a return even though they'd never see that affiliate's returns listed.
  const { data: runsForScope = [] } = useRuns(scopedListCode(user, hasPermission));
  // A run belonging to an affiliate that isn't (or is no longer) Live never belongs in a real
  // regulatory submission's picker - Group runs are always fine, since Group consolidation itself
  // only ever draws from Live affiliates.
  const runs = runsForScope.filter(
    (r) => r.affiliateCode === GROUP_CODE || allAffiliates.find((a) => a.code === r.affiliateCode)?.status === 'Live',
  );
  const save = regulatoryReturns.useSave();

  const [regulator, setRegulator] = useState<'all' | string>('all');
  const [editing, setEditing] = useState<RegulatoryReturn | null>(null);

  const regulators = useMemo(() => Array.from(new Set(rows.map((r) => r.regulator))), [rows]);
  const filtered = regulator === 'all' ? rows : rows.filter((r) => r.regulator === regulator);

  const overdue = rows.filter((r) => r.dueDate < new Date().toISOString().slice(0, 10) && !['Submitted', 'Accepted'].includes(r.status));
  const inFlight = rows.filter((r) => r.status === 'In preparation' || r.status === 'Under review');
  const accepted = rows.filter((r) => r.status === 'Accepted');

  const blank = (): RegulatoryReturn => ({
    id: newId('RET'),
    name: '',
    regulator: Object.keys(REGULATORY_MINIMA)[0] ?? 'CBN',
    affiliateCode: affiliates.find((a) => a.code !== 'GROUP')?.code ?? '',
    frequency: 'Monthly',
    periodEnd: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    status: 'Not started',
    runId: null,
    preparedBy: null,
    reviewedBy: null,
    submittedAt: null,
    notes: '',
  });

  const submit = async (r: RegulatoryReturn) => {
    if (r.preparedBy && r.preparedBy === user?.name) return; // segregation of duties, enforced not just suggested
    await save.mutateAsync({ ...r, status: 'Submitted', reviewedBy: user?.name ?? r.reviewedBy, submittedAt: new Date().toISOString() });
  };

  const columns: ResultColumn<RegulatoryReturn>[] = [
    { key: 'name', header: 'Return', render: (r) => <span className="font-medium text-navy-900">{r.name || '(untitled)'}</span> },
    { key: 'regulator', header: 'Regulator', render: (r) => r.regulator },
    { key: 'affiliate', header: 'Affiliate', render: (r) => <span className="font-mono text-[11px]">{r.affiliateCode}</span> },
    { key: 'period', header: 'Period end', render: (r) => <span className="font-mono text-[11px]">{r.periodEnd}</span> },
    { key: 'due', header: 'Due', render: (r) => <span className="font-mono text-[11px]">{r.dueDate}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} tone={STATUS_TONE[r.status]} /> },
    {
      key: 'actions', header: '', render: (r) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(r)} disabled={!canEdit} className="text-[11px] font-bold text-navy-900 hover:underline disabled:opacity-40">Edit</button>
          {r.status === 'Under review' && (
            <button type="button" onClick={() => void submit(r)} disabled={!canEdit || r.preparedBy === user?.name} title={r.preparedBy === user?.name ? 'The preparer cannot also submit' : undefined} className="text-[11px] font-bold text-navy-900 hover:underline disabled:opacity-40">
              Submit
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Regulatory Reporting"
        description="Returns by jurisdiction, each attachable to the run supplying its figures. Submission is maker-checker."
        asOfDate={null}
        metrics={[
          { label: 'Overdue', value: String(overdue.length), tone: overdue.length > 0 ? 'danger' : 'success', about: 'Returns past their due date that have not yet been Submitted or Accepted.' },
          { label: 'In flight', value: String(inFlight.length), tone: inFlight.length > 0 ? 'warning' : 'neutral', about: 'Returns currently In preparation or Under review.' },
          { label: 'Accepted', value: String(accepted.length), tone: 'success', about: 'Returns the regulator has formally accepted.' },
          { label: 'Total', value: String(rows.length), about: 'All regulatory returns tracked across every regulator and affiliate.' },
        ]}
        actions={
          <button type="button" onClick={() => setEditing(blank())} disabled={!canEdit} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40">
            New return
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => setRegulator('all')} className={`rounded-lg px-4 py-2 text-[12px] font-bold ${regulator === 'all' ? 'bg-navy-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700'}`}>
          All regulators
        </button>
        {regulators.map((reg) => (
          <button key={reg} type="button" onClick={() => setRegulator(reg)} className={`rounded-lg px-4 py-2 text-[12px] font-bold ${regulator === reg ? 'bg-navy-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:border-navy-700'}`}>
            {reg}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ResultTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.id}
          emptyMessage={isLoading ? 'Loading…' : 'No regulatory returns yet - add one for an affiliate and its regulator.'}
          renderDetail={(r) => <ReturnDetail ret={r} runs={runs} />}
        />
      </section>

      {editing && (
        <ReturnEditor
          ret={editing}
          affiliates={affiliates}
          runs={runs}
          onCancel={() => setEditing(null)}
          onSave={async (r) => { await save.mutateAsync(r); setEditing(null); }}
        />
      )}
    </>
  );
}

function ReturnDetail({ ret, runs }: { ret: RegulatoryReturn; runs: ProcessRun[] }) {
  const { data: results = [] } = useRunResults(ret.runId);
  const { data: batches = [] } = useBatches();
  const minima = REGULATORY_MINIMA[ret.regulator];
  if (!ret.runId) return <p className="text-[11px] text-gray-500">No run attached - nothing to report yet.</p>;
  if (results.length === 0) return <p className="text-[11px] text-gray-500">The attached run has no results.</p>;

  const sourceRun = runs.find((r) => r.id === ret.runId) ?? null;
  const stale = isRunStale(sourceRun, batches);
  const unreconciled = isRunUnreconciled(sourceRun, batches);

  return (
    <div className="space-y-2 text-[11px]">
      {(stale || unreconciled) && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 leading-relaxed text-navy-900">
          {stale && <span className="font-bold">Source run's data has since been superseded. </span>}
          {unreconciled && <span className="font-bold">Source positions are not GL-reconciled. </span>}
          Worth checking before this return is submitted.
        </p>
      )}
      {Object.keys(minima ?? { lcrPercent: 100 }).map((key) => {
        const value = metricValue(results, key);
        const min = minima?.[key];
        const breach = min !== undefined && value !== null && value < min;
        return (
          <div key={key} className="flex items-center justify-between">
            <span className="text-gray-500">{key}</span>
            <span className={`font-mono font-bold ${breach ? 'text-danger' : ''}`}>
              {formatMetric(value, key)}{min !== undefined && ` (floor ${min}%)`}
            </span>
          </div>
        );
      })}
      {ret.notes && <p className="mt-2 text-gray-600">{ret.notes}</p>}
    </div>
  );
}

function ReturnEditor({
  ret, affiliates, runs, onCancel, onSave,
}: { ret: RegulatoryReturn; affiliates: ReturnType<typeof useAffiliates>['data']; runs: ReturnType<typeof useRuns>['data']; onCancel: () => void; onSave: (r: RegulatoryReturn) => Promise<void> }) {
  const [draft, setDraft] = useState(ret);
  const set = (patch: Partial<RegulatoryReturn>) => setDraft((d) => ({ ...d, ...patch }));
  const { user } = useAuth();

  const canMarkReviewed = draft.preparedBy !== null && draft.preparedBy !== user?.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[14px] font-bold text-navy-900">Regulatory return</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label htmlFor="rr-name" className="mb-1 block text-[11px] font-medium text-gray-600">Name</label>
            <input id="rr-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. LCR & NSFR Return" className={INPUT} />
          </div>
          <div>
            <label htmlFor="rr-regulator" className="mb-1 block text-[11px] font-medium text-gray-600">Regulator</label>
            <input id="rr-regulator" value={draft.regulator} onChange={(e) => set({ regulator: e.target.value })} className={INPUT} list="regulators" />
            <datalist id="regulators">{Object.keys(REGULATORY_MINIMA).map((r) => <option key={r} value={r} />)}</datalist>
          </div>
          <div>
            <label htmlFor="rr-affiliate" className="mb-1 block text-[11px] font-medium text-gray-600">Affiliate</label>
            <select id="rr-affiliate" value={draft.affiliateCode} onChange={(e) => set({ affiliateCode: e.target.value })} className={INPUT}>
              {(affiliates ?? []).filter((a) => a.code !== 'GROUP').map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rr-frequency" className="mb-1 block text-[11px] font-medium text-gray-600">Frequency</label>
            <select id="rr-frequency" value={draft.frequency} onChange={(e) => set({ frequency: e.target.value as RegulatoryReturn['frequency'] })} className={INPUT}>
              {(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual'] as const).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rr-status" className="mb-1 block text-[11px] font-medium text-gray-600">Status</label>
            <select id="rr-status" value={draft.status} onChange={(e) => set({ status: e.target.value as ReturnStatus })} className={INPUT}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rr-period" className="mb-1 block text-[11px] font-medium text-gray-600">Period end</label>
            <input id="rr-period" type="date" value={draft.periodEnd} onChange={(e) => set({ periodEnd: e.target.value })} className={INPUT} />
          </div>
          <div>
            <label htmlFor="rr-due" className="mb-1 block text-[11px] font-medium text-gray-600">Due date</label>
            <input id="rr-due" type="date" value={draft.dueDate} onChange={(e) => set({ dueDate: e.target.value })} className={INPUT} />
          </div>
        </div>

        <div className="mt-4"><RunPicker runs={runs ?? []} value={draft.runId} onChange={(runId) => set({ runId })} /></div>

        <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px]">
          <span className="text-gray-500">Prepared by</span>
          <span className="font-bold">{draft.preparedBy ?? '-'}</span>
          <button type="button" onClick={() => set({ preparedBy: user?.name ?? null })} className="ml-auto rounded border border-gray-200 px-2 py-1 text-[10px] font-bold text-navy-900 hover:border-navy-700">
            Claim as preparer
          </button>
        </div>
        {draft.status === 'Under review' && (
          <p className="mt-2 text-[10px] text-gray-400">
            {canMarkReviewed ? 'A different reviewer than the preparer may submit this return.' : 'The preparer cannot also be the reviewer - sign in as someone else to submit.'}
          </p>
        )}

        <div className="mt-4">
          <label htmlFor="rr-notes" className="mb-1 block text-[11px] font-medium text-gray-600">Notes</label>
          <textarea id="rr-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={INPUT} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900">Cancel</button>
          <button type="button" onClick={() => void onSave(draft)} className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700">Save</button>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none';
