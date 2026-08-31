import { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Amount } from '@/components/ui/Amount';
import { InfoButton } from '@/components/ui/InfoButton';
import { useAuth } from '@/context/AuthContext';
import { useBatches } from '@/lib/hooks';
import {
  useSnapshot,
  useEditSnapshotPosition,
  useRecalculateSnapshot,
  useSubmitSnapshotForApproval,
  useDiscardSnapshot,
  type SnapshotComparison,
} from '@/lib/snapshotHooks';
import { runHeadlines } from '@/lib/runHooks';
import { formatDate, formatPct } from '@/lib/format';
import type { Position, SnapshotEditableField } from '@/engine/types';

const EDITABLE_FIELDS: Array<{ field: SnapshotEditableField; label: string; type: 'text' | 'number' | 'date' | 'boolean' }> = [
  { field: 'amount', label: 'Amount', type: 'number' },
  { field: 'maturityDate', label: 'Maturity date', type: 'date' },
  { field: 'nextRepricingDate', label: 'Next repricing date', type: 'date' },
  { field: 'behaviouralTag', label: 'Behavioural tag', type: 'text' },
  { field: 'hqlaLevel', label: 'HQLA level', type: 'text' },
  { field: 'hqlaHaircutPct', label: 'HQLA haircut %', type: 'number' },
  { field: 'interestRatePct', label: 'Interest rate %', type: 'number' },
  { field: 'asfFactorPct', label: 'ASF factor %', type: 'number' },
  { field: 'rsfFactorPct', label: 'RSF factor %', type: 'number' },
  { field: 'irrbbRateSensitive', label: 'IRRBB rate-sensitive', type: 'boolean' },
  { field: 'notes', label: 'Notes', type: 'text' },
];

const STATUS_TONE = {
  Draft: 'neutral', Recalculated: 'warning', PendingApproval: 'warning', Committed: 'success', Rejected: 'danger', Discarded: 'neutral',
} as const;

export function SnapshotWorkbench() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { hasPermission } = useAuth();
  const { data: snapshot, isLoading } = useSnapshot(id ?? null);
  const { data: batches = [] } = useBatches();
  const editPosition = useEditSnapshotPosition();
  const recalculate = useRecalculateSnapshot();
  const submitForApproval = useSubmitSnapshotForApproval();
  const discard = useDiscardSnapshot();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparison | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canEdit = hasPermission('data.configure');

  if (isLoading) return <p className="p-6 text-[12px] text-gray-400">Loading…</p>;
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
        <p className="text-[13px] font-bold text-navy-900">Snapshot not found</p>
        <p className="mt-1 text-[12px] text-gray-500">It may have been discarded, or the link is wrong.</p>
      </div>
    );
  }

  const parentBatch = batches.find((b) => b.id === snapshot.parentBatchId);
  const editable = snapshot.status === 'Draft' || snapshot.status === 'Recalculated';

  const handleFieldChange = (position: Position, field: SnapshotEditableField, raw: string) => {
    const spec = EDITABLE_FIELDS.find((f) => f.field === field)!;
    const newValue: string | number | boolean | null =
      spec.type === 'number' ? (raw === '' ? null : Number(raw)) : spec.type === 'boolean' ? raw === 'true' : raw || null;
    void editPosition.mutateAsync({ snapshot, positionId: position.id, field, newValue });
  };

  const handleRecalculate = async () => {
    const result = await recalculate.mutateAsync(snapshot);
    setComparison(result);
  };

  const handleSubmit = async () => {
    await submitForApproval.mutateAsync(snapshot);
    setSubmitted(true);
  };

  const headlineRows = comparison
    ? runHeadlines(comparison.baseline.results).map((h, i) => {
        const editedH = runHeadlines(comparison.edited.results)[i]!;
        return {
          ...h,
          original: h.value,
          snapshotValue: editedH.value,
          delta: h.value !== null && editedH.value !== null ? editedH.value - h.value : null,
        };
      })
    : [];

  return (
    <>
      <ModuleHeader
        title="Editable Snapshot"
        description="Investigate, correct or what-if a committed batch's positions without touching the batch itself. Nothing here becomes official until it is recalculated, compared and approved."
        asOfDate={snapshot.asOfDate}
        scope={snapshot.affiliateCode}
        metrics={[
          { label: 'Status', value: snapshot.status, tone: STATUS_TONE[snapshot.status] },
          { label: 'Positions', value: String(snapshot.positions.length) },
          { label: 'Changes', value: String(snapshot.changes.length), tone: snapshot.changes.length > 0 ? 'warning' : 'neutral' },
          { label: 'Parent batch', value: snapshot.parentBatchId },
        ]}
        actions={
          editable && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void discard.mutateAsync(snapshot)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-[12px] font-bold text-gray-600 hover:border-danger hover:text-danger"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void handleRecalculate()}
                disabled={recalculate.isPending || snapshot.changes.length === 0}
                title={snapshot.changes.length === 0 ? 'Make at least one edit first' : undefined}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {recalculate.isPending ? 'Recalculating…' : 'Recalculate'}
              </button>
            </div>
          )
        }
      />

      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 text-[12px] leading-relaxed text-gray-600">
        <span className="font-bold text-navy-900">Reason: </span>
        {snapshot.reason} · opened by {snapshot.createdBy} on {formatDate(snapshot.createdAt.slice(0, 10))} from{' '}
        <Link href={`/data/operations/position-book?batchId=${snapshot.parentBatchId}`} className="font-mono font-bold text-navy-700 hover:underline">
          {snapshot.parentBatchId}
        </Link>
        {parentBatch?.status === 'Superseded' && <> — note: the parent batch has since been superseded elsewhere.</>}
      </div>

      {snapshot.status === 'Committed' && snapshot.committedBatchId && (
        <div className="mb-4 rounded-2xl border border-success/20 bg-success-bg p-4 text-[12px] leading-relaxed text-success">
          <span className="font-bold">Committed.</span> This snapshot is now Position Book version{' '}
          <Link href={`/data/operations/position-book?batchId=${snapshot.committedBatchId}`} className="font-mono font-bold underline hover:no-underline">
            {snapshot.committedBatchId}
          </Link>{' '}
          — the parent batch remains preserved, unchanged, for historical reproducibility.
        </div>
      )}

      {snapshot.status === 'PendingApproval' && (
        <div className="mb-4 rounded-2xl border border-warning/20 bg-warning-bg p-4 text-[12px] leading-relaxed text-warning">
          {submitted ? 'Submitted.' : 'This snapshot is'} awaiting maker-checker approval in{' '}
          <Link href="/admin" className="font-bold underline hover:no-underline">Approvals</Link>. The requester cannot approve their own request.
        </div>
      )}

      {comparison && (
        <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-1.5">
            <h2 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Original vs snapshot</h2>
            <InfoButton label="How this comparison is computed">
              Both sides run the full calculation engine over the same scope and rules — only the position data
              differs. Original replays the parent batch as committed; Snapshot substitutes every edited field.
            </InfoButton>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2 px-3 font-bold">Metric</th>
                <th className="py-2 px-3 text-right font-bold">Original</th>
                <th className="py-2 px-3 text-right font-bold">Snapshot</th>
                <th className="py-2 px-3 text-right font-bold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {headlineRows.map((m) => {
                const improving = m.delta === null ? null : m.higherIsBetter ? m.delta > 0 : m.delta < 0;
                const fmt = (v: number | null) =>
                  v === null ? <span className="text-gray-300">—</span> : m.unit === 'percent' ? formatPct(v, 2) : m.unit === 'days' ? `${v} days` : v.toFixed(0);
                return (
                  <tr key={m.label} className="border-b border-gray-100">
                    <td className="py-2 px-3 font-medium text-navy-900">{m.label}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(m.original)}</td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(m.snapshotValue)}</td>
                    <td className={`py-2 px-3 text-right font-mono ${m.delta === null ? 'text-gray-300' : improving ? 'text-success' : 'text-danger'}`}>
                      {m.delta === null ? '—' : `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}${m.unit === 'percent' ? 'pp' : ''}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {editable && canEdit && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitted || submitForApproval.isPending}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
              >
                {submitted ? 'Submitted for approval ✓' : submitForApproval.isPending ? 'Submitting…' : 'Submit for maker-checker approval'}
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-[12px] font-bold uppercase tracking-widest text-navy-900">
          Positions ({snapshot.positions.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-400">
                <th className="py-2 px-3 font-bold">Position</th>
                <th className="py-2 px-3 font-bold">Product</th>
                <th className="py-2 px-3 text-right font-bold">Amount</th>
                <th className="py-2 px-3 font-bold">Changed fields</th>
                <th className="py-2 px-3 text-right font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {snapshot.positions.slice(0, 200).map((p) => {
                const changes = snapshot.changes.filter((c) => c.positionId === p.id);
                return (
                  <tr key={p.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 px-3 font-mono text-[11px]">{p.id}</td>
                    <td className="py-2 px-3 text-navy-900">{p.productClass}</td>
                    <td className="py-2 px-3 text-right">
                      <Amount value={p.amount} currency={p.currency} />
                    </td>
                    <td className="py-2 px-3">
                      {changes.length === 0 ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {changes.map((c, i) => (
                            <li key={i} className="text-[10px] text-warning">
                              <span className="font-bold">{c.field}:</span> {String(c.oldValue ?? '—')} → {String(c.newValue ?? '—')}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {editable && canEdit && (
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                          className="text-[11px] font-bold text-navy-700 hover:underline"
                        >
                          {editingId === p.id ? 'Close' : 'Edit'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {snapshot.positions.length > 200 && (
            <p className="mt-2 text-[11px] text-gray-400">Showing the first 200 of {snapshot.positions.length} positions.</p>
          )}
        </div>

        {editingId && (
          <EditPanel
            position={snapshot.positions.find((p) => p.id === editingId)!}
            onChange={(field, raw) => handleFieldChange(snapshot.positions.find((p) => p.id === editingId)!, field, raw)}
            onClose={() => setEditingId(null)}
          />
        )}
      </section>

      <div className="mt-4">
        <button type="button" onClick={() => navigate(`/data/operations/position-book?batchId=${snapshot.parentBatchId}`)} className="text-[11px] font-bold text-navy-700 hover:underline">
          ← Back to Position Book
        </button>
      </div>
    </>
  );
}

function EditPanel({
  position,
  onChange,
  onClose,
}: {
  position: Position;
  onChange: (field: SnapshotEditableField, raw: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-navy-100 bg-navy-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-navy-900">Editing {position.id}</h3>
        <button type="button" onClick={onClose} className="text-[11px] font-bold text-navy-700 hover:underline">Done</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {EDITABLE_FIELDS.map(({ field, label, type }) => {
          const current = (position as unknown as Record<string, unknown>)[field];
          return (
            <div key={field}>
              <label htmlFor={`edit-${field}`} className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</label>
              {type === 'boolean' ? (
                <select
                  id={`edit-${field}`}
                  defaultValue={String(current)}
                  onChange={(e) => onChange(field, e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  id={`edit-${field}`}
                  type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                  defaultValue={current === null || current === undefined ? '' : String(current)}
                  onBlur={(e) => onChange(field, e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-navy-900/70">
        Every edit is recorded with the field, old value, new value, who made it and when — visible above in
        "Changed fields" and in the Audit Log.
      </p>
    </div>
  );
}
