/**
 * The affiliate a single-entity screen is working on — Data Upload, GL
 * Reconciliation, Connectors, Validation Rules.
 *
 * Deliberately independent of the global Scope switcher at the top of the
 * page. That switcher only lists Group and *Live* affiliates, by design: it
 * drives dashboards and consolidated views, and an affiliate still being
 * onboarded should not appear in a Group-wide report. But these four screens
 * are the ones you use precisely *because* an affiliate has not gone live
 * yet — uploading its first position book, reconciling it, configuring its
 * connectors. Restricting them to the same Live-only list would make it
 * impossible to work on anything before it was already finished.
 *
 * So this lists every affiliate regardless of status, defaults to whatever
 * the global Scope switcher currently shows, and lets the choice diverge
 * from it without changing what the rest of the app displays.
 */

import type { AffiliateStatus } from '@/engine/types';

const STATUS_TONE: Record<AffiliateStatus, string> = {
  Live: 'text-success',
  Testing: 'text-warning',
  Onboarding: 'text-gray-500',
  Suspended: 'text-danger',
};

interface SelectableAffiliate {
  code: string;
  name: string;
  status: AffiliateStatus;
}

export function AffiliateSelector({
  affiliates,
  value,
  onChange,
}: {
  affiliates: SelectableAffiliate[];
  value: string | undefined;
  onChange: (code: string) => void;
}) {
  const options = affiliates.filter((a) => a.code !== 'GROUP');
  const current = options.find((a) => a.code === value);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <label htmlFor="entity-picker" className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        Working on
      </label>
      <select
        id="entity-picker"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-200 px-2 py-1.5 text-[12px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
      >
        {options.length === 0 && <option value="">No affiliates onboarded yet</option>}
        {options.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name} — {a.status}
          </option>
        ))}
      </select>
      {current && (
        <span className={`text-[11px] font-bold ${STATUS_TONE[current.status]}`}>{current.status}</span>
      )}
      <span className="text-[11px] text-gray-500">
        Independent of the Scope switcher above — every affiliate appears here, including one still onboarding.
      </span>
    </div>
  );
}
