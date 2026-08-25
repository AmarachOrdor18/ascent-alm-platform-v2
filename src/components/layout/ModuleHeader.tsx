/**
 * Standard header for every screen.
 *
 * The as-of date is a required prop, not an option. v1 had no as-of date
 * anywhere in the application (practitioner register P-01, the first thing
 * a banker asks), and making it required is what stops a screen shipping
 * without one.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatAsAt } from '@/lib/format';
import type { CurrencyCode, IsoDate } from '@/engine/types';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface HeaderMetric {
  label: string;
  value: string;
  /** Prior-period movement, already formatted. */
  delta?: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
}

interface ModuleHeaderProps {
  title: string;
  description: string;
  /**
   * The reporting date these figures are stated as at. `null` is legitimate
   * only on configuration screens, which are not as-of dated.
   */
  asOfDate: IsoDate | null;
  /** The currency the figures on this screen are stated in. */
  currency?: CurrencyCode;
  /** Scope label — the affiliate or Group this screen is showing. */
  scope?: string;
  /** Freshness or staleness warning from the data-lifecycle check. */
  staleWarning?: string | null;
  metrics?: HeaderMetric[];
  actions?: ReactNode;
}

const TONE: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-gray-500',
};

export function ModuleHeader({
  title,
  description,
  asOfDate,
  currency,
  scope,
  staleWarning,
  metrics,
  actions,
}: ModuleHeaderProps) {
  return (
    <header className="mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-navy-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-gray-500">{description}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className="font-bold text-navy-700">{formatAsAt(asOfDate)}</span>
            {scope && (
              <>
                <span aria-hidden="true">·</span>
                <span>{scope}</span>
              </>
            )}
            {currency && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Stated in <span className="font-mono">{currency}</span>
                </span>
              </>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {staleWarning && (
        <div role="status" className="mb-4 rounded-lg bg-warning-bg px-4 py-2.5 text-[12px] text-warning">
          <StatusBadge status="Stale data" tone="warning" className="mr-2" />
          {staleWarning}
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <dt className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{m.label}</dt>
              <dd className="text-lg font-bold text-navy-900">{m.value}</dd>
              {m.delta && <p className={cn('mt-0.5 text-[11px]', TONE[m.tone ?? 'neutral'])}>{m.delta}</p>}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
