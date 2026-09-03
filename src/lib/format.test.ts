import { describe, it, expect } from 'vitest';
import {
  formatAmount,
  formatPct,
  formatBps,
  formatDelta,
  formatDate,
  formatAsAt,
  daysBetween,
  currencySymbol,
} from './format';

describe('formatAmount', () => {
  it('renders each currency in its own symbol - the P-02 regression guard', () => {
    expect(formatAmount(560_000_000_000, 'NGN')).toBe('₦560.00B');
    expect(formatAmount(560_000_000_000, 'GHS')).toBe('GH₵560.00B');
    expect(formatAmount(560_000_000_000, 'XOF')).toBe('CFA560.00B');
    expect(formatAmount(560_000_000_000, 'USD')).toBe('$560.00B');
  });

  it('never renders a non-USD amount with a dollar sign', () => {
    for (const ccy of ['NGN', 'GHS', 'XOF', 'ZMW', 'KES']) {
      expect(formatAmount(1_000_000, ccy)).not.toContain('$');
    }
  });

  it('falls back to the ISO code for a currency with no symbol', () => {
    expect(formatAmount(5_000, 'MWK')).toBe('MWK5.0K');
  });

  it('abbreviates by magnitude', () => {
    expect(formatAmount(1_250_000_000, 'USD')).toBe('$1.25B');
    expect(formatAmount(1_250_000, 'USD')).toBe('$1.3M');
    expect(formatAmount(1_250, 'USD')).toBe('$1.3K');
    expect(formatAmount(125, 'USD')).toBe('$125');
  });

  it('handles negatives with the sign outside the symbol', () => {
    expect(formatAmount(-2_000_000, 'NGN')).toBe('-₦2.0M');
  });

  it('renders full precision when compact is off', () => {
    expect(formatAmount(1_234_567.89, 'USD', { compact: false })).toBe('$1,234,567.89');
  });

  it('appends the ISO code when asked, for mixed-currency tables', () => {
    expect(formatAmount(2_000_000, 'NGN', { showCode: true })).toBe('₦2.0M NGN');
  });

  it('treats zero as zero, not as an empty value', () => {
    expect(formatAmount(0, 'USD')).toBe('$0');
  });
});

describe('currencySymbol', () => {
  it('is case-insensitive', () => {
    expect(currencySymbol('ngn')).toBe('₦');
  });
});

describe('percentage and rate helpers', () => {
  it('formats percentages', () => {
    expect(formatPct(168.857589)).toBe('168.9%');
    expect(formatPct(103.63, 2)).toBe('103.63%');
  });

  it('renders an em dash for a null rather than inventing 0%', () => {
    expect(formatPct(null)).toBe('-');
    expect(formatBps(null)).toBe('-');
    expect(formatDelta(null)).toBe('-');
  });

  it('signs basis points and deltas', () => {
    expect(formatBps(200)).toBe('+200bps');
    expect(formatBps(-150)).toBe('-150bps');
    expect(formatDelta(2.4)).toBe('+2.4');
    expect(formatDelta(-2.4)).toBe('-2.4');
  });
});

describe('date helpers', () => {
  it('formats an as-of date for a report header', () => {
    expect(formatAsAt('2026-07-31')).toBe('As at 31 July 2026');
  });

  it('says so plainly when there is no as-of date', () => {
    expect(formatAsAt(null)).toBe('No as-of date');
  });

  it('formats a short date', () => {
    expect(formatDate('2026-07-31')).toBe('31 Jul 2026');
    expect(formatDate(null)).toBe('-');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-07-31', '2026-08-30')).toBe(30);
    expect(daysBetween('2026-08-30', '2026-07-31')).toBe(-30);
    expect(daysBetween('2026-07-31', '2026-07-31')).toBe(0);
  });

  it('spans a leap day correctly', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });
});
