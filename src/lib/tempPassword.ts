// A one-time temporary password for a newly provisioned sign-in (shown once; email invites come later).
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%*?';

function pick(chars: string, n: number): string[] {
  const bytes = new Uint32Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]!);
}

/** 14 characters with at least one upper, lower, digit and symbol, in random order. */
export function generateTemporaryPassword(): string {
  const chars = [...pick(UPPER, 3), ...pick(LOWER, 6), ...pick(DIGITS, 3), ...pick(SYMBOLS, 2)];
  const order = new Uint32Array(chars.length);
  crypto.getRandomValues(order);
  return chars
    .map((c, i) => ({ c, k: order[i]! }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c)
    .join('');
}
