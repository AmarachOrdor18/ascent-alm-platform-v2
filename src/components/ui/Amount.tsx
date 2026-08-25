/**
 * Renders a monetary amount in its own currency.
 *
 * Use this rather than formatting inline — it is the mechanism that stops
 * defect P-02 (a Nigerian balance sheet rendered with a dollar sign) from
 * reappearing screen by screen.
 */

import { cn } from '@/lib/cn';
import { formatAmount, type AmountFormatOptions } from '@/lib/format';
import type { CurrencyCode } from '@/engine/types';

interface AmountProps extends AmountFormatOptions {
  value: number | null;
  currency: CurrencyCode;
  /** Colour negatives red and positives green. Off by default — balances are not signed quantities. */
  colorBySign?: boolean;
  /** Tabular figures for column alignment. On by default inside tables. */
  mono?: boolean;
  className?: string;
}

export function Amount({ value, currency, colorBySign = false, mono = true, className, ...options }: AmountProps) {
  if (value === null || Number.isNaN(value)) {
    return (
      <span className={cn('text-gray-400', className)} title="Not computable from the data loaded">
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        mono && 'font-mono tabular-nums',
        colorBySign && value < 0 && 'text-danger',
        colorBySign && value > 0 && 'text-success',
        className,
      )}
      // The full-precision value stays available on hover, since the display
      // form is abbreviated to B/M/K.
      title={formatAmount(value, currency, { compact: false, showCode: true })}
    >
      {formatAmount(value, currency, options)}
    </span>
  );
}
