import type { ProcessRun } from '@/engine/types';
import { SIGN_OFF_LABEL, signOffStatusOf, versionOf } from '@/lib/runSeries';

export function RunPicker({
  runs,
  value,
  onChange,
  label = 'Source run',
}: {
  runs: ProcessRun[];
  value: string | null;
  onChange: (runId: string | null) => void;
  label?: string;
}) {
  // Newest first; every option names its version and sign-off state, so a re-run of the same date
  // (v2, v3...) is told apart and a signed-off version is easy to pick for a report.
  const completed = runs
    .filter((r) => r.status === 'Completed')
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const optionLabel = (r: ProcessRun) => `${r.name} · v${versionOf(r, runs)} · ${SIGN_OFF_LABEL[signOffStatusOf(r)]}`;
  return (
    <div>
      <label htmlFor="run-picker" className="mb-1 block text-[12px] font-medium text-gray-600">
        {label}
      </label>
      <select
        id="run-picker"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] focus:border-navy-700 focus:outline-none"
      >
        <option value="">No run attached</option>
        {completed.map((r) => (
          <option key={r.id} value={r.id}>
            {optionLabel(r)}
          </option>
        ))}
      </select>
      {completed.length === 0 && (
        <p className="mt-1 text-[11px] text-gray-400">
          No completed runs yet - execute one from Run &amp; results → Run now first.
        </p>
      )}
    </div>
  );
}
