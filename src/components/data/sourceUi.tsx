// Small presentational pieces shared by the data-source screens (list, drawer, upload, history).
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const btn = {
  primary:
    'rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40',
  secondary:
    'rounded-lg border border-gray-200 bg-white px-4 py-2 text-[13px] font-bold text-navy-900 hover:border-navy-700 disabled:cursor-not-allowed disabled:opacity-40',
  small:
    'rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-bold text-navy-900 hover:border-navy-700 disabled:cursor-not-allowed disabled:opacity-40',
  smallPrimary:
    'rounded-md bg-navy-900 px-2.5 py-1 text-[12px] font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-40',
  smallDanger:
    'rounded-md border border-danger/30 bg-white px-2.5 py-1 text-[12px] font-bold text-danger hover:bg-danger-bg disabled:opacity-40',
  link: 'text-[12px] font-bold text-navy-700 hover:underline',
};

export const inputCls =
  'w-full rounded border border-gray-200 px-2 py-1.5 text-[13px] text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700';

export function Section({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-navy-900">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function KeyValueGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{i.label}</dt>
          <dd className="mt-0.5 text-[13px] text-navy-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatTiles({
  items,
}: {
  items: Array<{ label: string; value: number | string; tone?: 'success' | 'danger' | 'warning' | 'neutral' }>;
}) {
  const tone = { success: 'text-success', danger: 'text-danger', warning: 'text-warning', neutral: 'text-navy-900' };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg border border-gray-100 bg-white px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{i.label}</p>
          <p className={cn('mt-0.5 font-mono text-[15px] font-bold', tone[i.tone ?? 'neutral'])}>
            {typeof i.value === 'number' ? i.value.toLocaleString() : i.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DrawerTabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: K; label: string; count?: number }>;
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div role="tablist" className="mb-5 flex flex-wrap gap-1 border-b border-gray-100">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-[13px] font-bold transition-colors',
            t.key === active ? 'border-navy-900 text-navy-900' : 'border-transparent text-gray-500 hover:text-navy-900',
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A header-to-field chip: matched, renamed, missing (required or optional) or ignored. */
export function FieldChip({ field, header, required }: { field: string; header: string | null; required?: boolean }) {
  const cls = header
    ? 'bg-gray-100 text-gray-600'
    : required
      ? 'bg-danger-bg text-danger'
      : 'bg-warning-bg/60 text-gray-500';
  const text = header
    ? header !== field
      ? `${header} → ${field}`
      : field
    : required
      ? `${field}: missing`
      : `${field}: not in file`;
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px]', cls)}>{text}</span>;
}

/** A plain table for arbitrary parsed records (lobby "View rows"). */
export function RecordsTable({ rows, limit = 100 }: { rows: Array<Record<string, unknown>>; limit?: number }) {
  if (rows.length === 0) return <p className="text-[12px] text-gray-400">No rows.</p>;
  const columns = Array.from(new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))).filter(
    (c) => !['affiliateCode', 'batchId', 'updatedBy', 'updatedAt', 'attributes'].includes(c),
  );
  const show = (v: unknown) =>
    v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-bold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.slice(0, limit).map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-2 py-1 text-navy-900">
                  {show(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > limit && (
        <p className="px-2 py-1.5 text-[11px] text-gray-400">
          First {limit} of {rows.length.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'success' | 'danger' | 'warning' | 'info'; children: ReactNode }) {
  const cls = {
    success: 'bg-success-bg text-success',
    danger: 'bg-danger-bg text-danger',
    warning: 'bg-warning-bg text-warning',
    info: 'bg-navy-50 text-navy-900',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-[13px] leading-relaxed', cls[tone])}
    >
      {children}
    </div>
  );
}
