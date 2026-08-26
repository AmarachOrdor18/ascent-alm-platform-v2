/**
 * Attach a real run to a report, a meeting or a return.
 *
 * A pack, an ALCO meeting or a regulatory return that isn't tied to a real
 * run has no figures behind it — this is how every reporting screen points
 * at the same evidence the results screens read from, instead of a number
 * someone typed in.
 */

import type { ProcessRun } from '@/engine/types';

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
  const completed = runs.filter((r) => r.status === 'Completed');
  return (
    <div>
      <label htmlFor="run-picker" className="mb-1 block text-[11px] font-medium text-gray-600">
        {label}
      </label>
      <select
        id="run-picker"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-[12px] focus:border-navy-700 focus:outline-none"
      >
        <option value="">No run attached</option>
        {completed.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} — {r.asOfDate}
          </option>
        ))}
      </select>
      {completed.length === 0 && (
        <p className="mt-1 text-[10px] text-gray-400">No completed runs yet — execute one on Process Run first.</p>
      )}
    </div>
  );
}
