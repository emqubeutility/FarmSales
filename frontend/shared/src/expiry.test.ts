import { describe, expect, it } from 'vitest';
import { isExpired } from './expiry.js';

// Local-time dates, so the tests do not depend on the machine's time zone.
const today = new Date(2026, 9, 28, 14, 30); // 28 Oct 2026, afternoon

describe('isExpired', () => {
  it('is false when there is no best-before date (packaging)', () => {
    expect(isExpired(null, today)).toBe(false);
    expect(isExpired(undefined, today)).toBe(false);
  });

  it('is true when the best-before day is before today', () => {
    expect(isExpired(new Date(2026, 9, 27), today)).toBe(true);
    expect(isExpired(new Date(2025, 0, 1), today)).toBe(true);
  });

  it('is false on the best-before day itself, even late in the day', () => {
    expect(isExpired(new Date(2026, 9, 28, 0, 0), today)).toBe(false);
    expect(isExpired(new Date(2026, 9, 28, 23, 59), today)).toBe(false);
  });

  it('is false for a future best-before date', () => {
    expect(isExpired(new Date(2027, 3, 11), today)).toBe(false);
  });

  it('accepts a date string as stored in the API response', () => {
    expect(isExpired('2026-10-20T00:00:00.000Z', today)).toBe(true);
  });
});
