import { cn } from '@/lib/cn';
import type { LimitStatus } from '@/engine/types';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-navy-50 text-navy-700',
  neutral: 'bg-gray-100 text-gray-600',
};

const KNOWN_TONES: Record<string, Tone> = {
  Green: 'success',
  Amber: 'warning',
  Red: 'danger',
  Live: 'success',
  Completed: 'success',
  Committed: 'success',
  Performing: 'success',
  'Within Limit': 'success',
  Testing: 'warning',
  Onboarding: 'warning',
  Warning: 'warning',
  Staged: 'warning',
  Queued: 'warning',
  Running: 'info',
  Draft: 'neutral',
  Validated: 'info',
  Superseded: 'neutral',
  Suspended: 'danger',
  Breach: 'danger',
  Failed: 'danger',
  Rejected: 'danger',
};

interface StatusBadgeProps {
  status: LimitStatus | string;
  tone?: Tone;
  className?: string;
}

export function StatusBadge({ status, tone, className }: StatusBadgeProps) {
  const resolved = tone ?? KNOWN_TONES[status] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
        TONE_CLASS[resolved],
        className,
      )}
    >
      {status}
    </span>
  );
}
