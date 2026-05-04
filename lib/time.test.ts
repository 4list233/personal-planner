import { describe, it, expect } from 'vitest';
import { todayInUserTz, daysBetweenInUserTz, daysUntilDueInUserTz } from './time';

describe('todayInUserTz', () => {
  it('returns the wall-clock date in America/Toronto, not UTC', () => {
    // 23:30 ET on 2026-05-03 → 03:30 UTC on 2026-05-04.
    // UTC math would say "2026-05-04" but the user is still on May 3.
    const instant = new Date('2026-05-04T03:30:00Z');
    expect(todayInUserTz(instant, 'America/Toronto')).toBe('2026-05-03');
  });

  it('rolls over at midnight ET', () => {
    const instant = new Date('2026-05-04T04:30:00Z'); // 00:30 ET on May 4
    expect(todayInUserTz(instant, 'America/Toronto')).toBe('2026-05-04');
  });

  it('handles different timezones independently', () => {
    const instant = new Date('2026-05-04T03:30:00Z');
    expect(todayInUserTz(instant, 'America/Toronto')).toBe('2026-05-03');
    expect(todayInUserTz(instant, 'UTC')).toBe('2026-05-04');
  });
});

describe('daysBetweenInUserTz', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetweenInUserTz('2026-05-03', '2026-05-03')).toBe(0);
  });

  it('returns 1 for one day later', () => {
    expect(daysBetweenInUserTz('2026-05-03', '2026-05-04')).toBe(1);
  });

  it('returns -1 for one day earlier', () => {
    expect(daysBetweenInUserTz('2026-05-04', '2026-05-03')).toBe(-1);
  });

  it('survives DST boundaries (US spring-forward)', () => {
    // 2026 US DST start: Mar 8.
    expect(daysBetweenInUserTz('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('returns NaN for malformed input', () => {
    expect(Number.isNaN(daysBetweenInUserTz('not-a-date', '2026-05-03'))).toBe(true);
  });

  it('ignores any time suffix', () => {
    expect(daysBetweenInUserTz('2026-05-03T08:00:00Z', '2026-05-04')).toBe(1);
  });
});

describe('daysUntilDueInUserTz', () => {
  it('returns 0 in the evening ET when the due date is today ET', () => {
    const now = new Date('2026-05-04T03:30:00Z'); // 23:30 ET on May 3
    expect(daysUntilDueInUserTz('2026-05-03', now, 'America/Toronto')).toBe(0);
  });

  it('returns 1 when the due date is tomorrow ET', () => {
    const now = new Date('2026-05-04T03:30:00Z'); // 23:30 ET on May 3
    expect(daysUntilDueInUserTz('2026-05-04', now, 'America/Toronto')).toBe(1);
  });

  it('returns undefined when no dueDate', () => {
    expect(daysUntilDueInUserTz(undefined)).toBeUndefined();
  });
});
