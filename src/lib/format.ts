import type { CurrencyCode, IsoDate } from '@/engine/types';

/** Symbols for the currencies the Group actually reports in. Others fall back to the ISO code. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
  GHS: 'GH₵',
  XOF: 'CFA',
  XAF: 'FCFA',
  ZMW: 'ZK',
  KES: 'KSh',
  ZAR: 'R',
};

export function currencySymbol(currency: CurrencyCode): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

export interface AmountFormatOptions {
  /** Abbreviate to K/M/B. Defaults to true — balance-sheet figures are large. */
  compact?: boolean;
  /** Show the ISO code alongside the symbol, e.g. "₦560.0B NGN". Useful in mixed-currency tables. */
  showCode?: boolean;
  decimals?: number;
}

/**
 * Format a monetary amount in its own currency.
 *
 * @example formatAmount(560_000_000_000, 'NGN') // "₦560.00B"
 * @example formatAmount(1_250_000, 'USD')       // "$1.3M"
 */
export function formatAmount(amount: number, currency: CurrencyCode, options: AmountFormatOptions = {}): string {
  const { compact = true, showCode = false, decimals } = options;
  const symbol = currencySymbol(currency);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const suffix = showCode ? ` ${currency.toUpperCase()}` : '';

  if (!compact) {
    const body = abs.toLocaleString(undefined, {
      minimumFractionDigits: decimals ?? 2,
      maximumFractionDigits: decimals ?? 2,
    });
    return `${sign}${symbol}${body}${suffix}`;
  }

  if (abs >= 1_000_000_000) return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(decimals ?? 2)}B${suffix}`;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(decimals ?? 1)}M${suffix}`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(decimals ?? 1)}K${suffix}`;
  return `${sign}${symbol}${abs.toLocaleString(undefined, { maximumFractionDigits: decimals ?? 2 })}${suffix}`;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Basis points, for rate shocks and FTP add-ons. */
export function formatBps(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${Math.round(value)}bps`;
}

/** Signed percentage-point delta, for prior-period variance columns. */
export function formatDelta(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

/** `2026-07-31` → `31 Jul 2026`. */
export function formatDate(date: IsoDate | null): string {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Long form for report headers: "As at 31 July 2026". */
export function formatAsAt(date: IsoDate | null): string {
  if (!date) return 'No as-of date';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return `As at ${date}`;
  return `As at ${parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

/** Whole days between two ISO dates. Negative when `to` precedes `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
