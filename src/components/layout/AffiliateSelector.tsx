import { useScope } from '@/context/ScopeContext';
import type { ReactNode } from 'react';
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
  children,
}: {
  affiliates: SelectableAffiliate[];
  value: string | undefined;
  onChange: (code: string) => void;
  /** Extra controls (e.g. a domain selector) rendered inline in the same bar - for a caller that scopes on more than just the affiliate. */
  children?: ReactNode;
}) {
  // The header Scope is the one place an affiliate is chosen. This bar only asks for one when the header is on
  // Group and the screen needs a single affiliate - and choosing here switches the header scope too.
  const { affiliateCode: scopeCode, setAffiliateCode } = useScope();
  const options = affiliates.filter((a) => a.code !== 'GROUP');
  const current = options.find((a) => a.code === value);
  const choose = (code: string) => {
    setAffiliateCode(code);
    onChange(code);
  };

  if (scopeCode !== 'GROUP' || (options.length === 1 && current)) {
    if (!children) return null;
    return (
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-[13px] font-bold text-navy-900">{current?.name}</span>
        {children}
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <label htmlFor="entity-picker" className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
        Pick an affiliate
      </label>
      <select
        id="entity-picker"
        value={value ?? ''}
        onChange={(e) => choose(e.target.value)}
        className="rounded border border-gray-200 px-2 py-1.5 text-[13px] font-medium text-navy-900 focus:border-navy-700 focus:outline-none"
      >
        {options.length === 0 && <option value="">No affiliates onboarded yet</option>}
        {options.length > 0 && !current && <option value="">Select an affiliate…</option>}
        {options.map((a) => (
          <option key={a.code} value={a.code}>
            {a.name}
          </option>
        ))}
      </select>
      {current && <span className={`text-[12px] font-bold ${STATUS_TONE[current.status]}`}>{current.status}</span>}
      {children}
    </div>
  );
}
