import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatAsAt } from '@/lib/format';
import type { CurrencyCode, IsoDate } from '@/engine/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { InfoButton } from '@/components/ui/InfoButton';

export interface HeaderMetric {
  label: string;
  value: string;
  delta?: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
  /** Brief, plain-English explanation shown behind an info button next to the label. */
  about?: string;
}

interface ModuleHeaderProps {
  title: React.ReactNode;
  description: string;
  /** Extra explanation kept out of the header line - shown behind an ⓘ next to the description. */
  about?: string;
  /** `null` is legitimate only on configuration screens, which are not as-of dated. */
  asOfDate: IsoDate | null;
  currency?: CurrencyCode;
  scope?: string;
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
  about,
  asOfDate,
  currency,
  scope,
  staleWarning,
  metrics,
  actions,
}: ModuleHeaderProps) {
  return (
    <header data-tour="page-header" className="mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-navy-900">{title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] leading-relaxed text-gray-500">
            <span className="max-w-3xl">{description}</span>
            {about && (
              <InfoButton label={`About ${typeof title === 'string' ? title : 'this screen'}`}>{about}</InfoButton>
            )}
          </p>

          {(asOfDate || scope || currency) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-500">
              {asOfDate && <span className="font-bold text-navy-700">{formatAsAt(asOfDate)}</span>}
              {scope && (
                <>
                  {asOfDate && <span aria-hidden="true">·</span>}
                  <span>{scope}</span>
                </>
              )}
              {currency && (
                <>
                  {(asOfDate || scope) && <span aria-hidden="true">·</span>}
                  <span>
                    Stated in <span className="font-mono">{currency}</span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        {actions && (
          <div data-tour="page-actions" className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {staleWarning && (
        <div role="status" className="mb-4 rounded-lg bg-warning-bg px-4 py-2.5 text-[13px] text-warning">
          <StatusBadge status="Stale data" tone="warning" className="mr-2" />
          {staleWarning}
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <dl data-tour="metrics" className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <dt className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {m.label}
                {m.about && <InfoButton label={`About ${m.label}`}>{m.about}</InfoButton>}
              </dt>
              <dd className="text-lg font-bold text-navy-900">{m.value}</dd>
              {m.delta && <p className={cn('mt-0.5 text-[12px]', TONE[m.tone ?? 'neutral'])}>{m.delta}</p>}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
