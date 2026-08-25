/**
 * Analyst commentary and review sign-off, attachable to any result.
 *
 * Closes practitioner defects P-16 (nowhere to write "LCR fell 12pts on the
 * Eurobond maturity") and P-17 (results were never attested before going to
 * ALCO). Both are standing expectations in a risk function, and neither
 * existed anywhere in v1.
 */

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { StatusBadge } from './StatusBadge';

export type ReviewState = 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';

export interface CommentaryRecord {
  id: string;
  /** What this commentary is attached to — a run, a result element, a breach. */
  subjectId: string;
  text: string;
  authorName: string;
  authoredAt: string;
  reviewState: ReviewState;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

interface CommentaryProps {
  record: CommentaryRecord | null;
  /** Whether the signed-in user may write commentary (maker). */
  canEdit: boolean;
  /** Whether they may sign it off (checker). Segregation of duties: a maker may not be their own checker. */
  canReview: boolean;
  onSave: (text: string) => void | Promise<void>;
  onReview: (state: ReviewState) => void | Promise<void>;
  className?: string;
}

export function Commentary({ record, canEdit, canReview, onSave, onReview, className }: CommentaryProps) {
  const [draft, setDraft] = useState(record?.text ?? '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // A maker cannot approve their own commentary — the same segregation the
  // workflow engine enforces on approvals.
  const reviewerIsAuthor = record !== null && record.authorName === record.reviewedBy;
  const mayReview = canReview && record !== null && record.reviewState !== 'Approved' && !reviewerIsAuthor;

  return (
    <section className={cn('rounded-2xl border border-gray-100 bg-white p-6 shadow-sm', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">Analyst Commentary</h3>
        {record && <StatusBadge status={record.reviewState} />}
      </div>

      {isEditing || !record ? (
        <>
          <label htmlFor="commentary-text" className="sr-only">
            Analyst commentary
          </label>
          <textarea
            id="commentary-text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canEdit || saving}
            rows={4}
            placeholder="Explain the movement — what changed, why, and what is expected next period."
            className="w-full rounded-lg border border-gray-200 p-3 text-[12px] leading-relaxed focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 disabled:bg-gray-50"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || saving || draft.trim().length === 0}
              className="rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save commentary'}
            </button>
            {record && (
              <button
                type="button"
                onClick={() => {
                  setDraft(record.text);
                  setIsEditing(false);
                }}
                className="rounded-lg px-4 py-2 text-[12px] font-bold text-gray-500 hover:text-navy-900"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-gray-700">{record.text}</p>
          <p className="mt-3 text-[11px] text-gray-400">
            {record.authorName} · {new Date(record.authoredAt).toLocaleString()}
            {record.reviewedBy && ` · reviewed by ${record.reviewedBy}`}
          </p>
          <div className="mt-4 flex gap-2 border-t border-gray-50 pt-4">
            {canEdit && record.reviewState !== 'Approved' && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-[12px] font-bold text-navy-900 hover:text-navy-700"
              >
                Edit
              </button>
            )}
            {mayReview && (
              <button
                type="button"
                onClick={() => onReview('Approved')}
                className="rounded-lg bg-success px-4 py-2 text-[12px] font-bold text-white hover:opacity-90"
              >
                Approve for ALCO
              </button>
            )}
            {reviewerIsAuthor && record.reviewState !== 'Approved' && (
              <p className="text-[11px] text-gray-400">Awaiting review by someone other than the author.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
