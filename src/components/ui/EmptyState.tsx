import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  /** Optional heading - can carry an inline InfoButton alongside the text. */
  title?: ReactNode;
  /** Body copy - what's missing and why. Omit when the title alone says enough. */
  children?: ReactNode;
  /** Where a "go do the prerequisite" click should land. */
  cta?: { label: string; href: string };
  className?: string;
}

/**
 * The "dashed border, heading, subtext, CTA link" block used wherever a screen has nothing to show
 * because a prerequisite is missing - a completed run, a schedule, a scenario. One shared shape
 * instead of each screen hand-rolling its own (see ResultsFrame.tsx, Kri.tsx, BatchScheduler.tsx).
 */
export function EmptyState({ title, children, cta, className }: EmptyStateProps) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center', className)}>
      {title && (
        <div className="flex items-center justify-center gap-1.5">
          <p className="text-[13px] font-bold text-navy-900">{title}</p>
        </div>
      )}
      {children && <div className="mx-auto mt-2 max-w-lg text-[11px] leading-relaxed text-gray-500">{children}</div>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-lg bg-navy-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-navy-700"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
