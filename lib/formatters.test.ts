import { describe, it, expect } from 'vitest';
import { formatDaysUntilDue, daysUntilDueColorClass } from './formatters';

describe('formatDaysUntilDue', () => {
  it('returns empty string for undefined', () => {
    expect(formatDaysUntilDue(undefined)).toBe('');
  });

  it('returns "Due today" for 0', () => {
    expect(formatDaysUntilDue(0)).toBe('Due today');
  });

  it('returns "Due tomorrow" for 1', () => {
    expect(formatDaysUntilDue(1)).toBe('Due tomorrow');
  });

  it('formats overdue', () => {
    expect(formatDaysUntilDue(-1)).toBe('overdue 1d');
    expect(formatDaysUntilDue(-3)).toBe('overdue 3d');
  });

  it('formats future', () => {
    expect(formatDaysUntilDue(7)).toBe('in 7 days');
  });

  it('caps at 1+ year', () => {
    expect(formatDaysUntilDue(400)).toBe('in 1+ year');
    expect(formatDaysUntilDue(-400)).toBe('overdue 1+ year');
  });

  it('handles NaN', () => {
    expect(formatDaysUntilDue(NaN)).toBe('');
  });
});

describe('daysUntilDueColorClass', () => {
  it('red for negative', () => {
    expect(daysUntilDueColorClass(-1)).toBe('text-red-600');
  });
  it('orange for 0', () => {
    expect(daysUntilDueColorClass(0)).toBe('text-orange-600');
  });
  it('yellow for 1..7', () => {
    expect(daysUntilDueColorClass(7)).toBe('text-yellow-600');
  });
  it('gray otherwise', () => {
    expect(daysUntilDueColorClass(30)).toBe('text-gray-600');
    expect(daysUntilDueColorClass(undefined)).toBe('text-gray-600');
  });
});
