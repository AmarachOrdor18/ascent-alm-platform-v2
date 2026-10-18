import { describe, expect, it } from 'vitest';
import { normaliseDate } from './dates';

describe('normaliseDate', () => {
  it.each([
    ['2026-09-30', '2026-09-30'],
    ['2026-09-30T00:00:00Z', '2026-09-30'],
    ['30/09/2026', '2026-09-30'],
    ['30-09-2026', '2026-09-30'],
    ['9/30/26', '2026-09-30'],
    ['9/30/2026', '2026-09-30'],
    ['30 Sep 2026', '2026-09-30'],
    ['Sep 30, 2026', '2026-09-30'],
    ['46295', '2026-09-30'],
  ])('reads %s', (input, expected) => {
    expect(normaliseDate(input)).toBe(expected);
  });

  it('refuses what is not a date', () => {
    expect(normaliseDate('31/02/2026')).toBeNull();
    expect(normaliseDate('N/A')).toBeNull();
    expect(normaliseDate('')).toBeNull();
  });
});
