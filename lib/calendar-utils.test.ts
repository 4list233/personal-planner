import { describe, it, expect } from 'vitest';
import { partitionTasksForCalendar } from './calendar-utils';
import { Task } from './types';

function makeTask(id: string, dueDate: string | undefined, daysUntilDue?: number): Task {
  return {
    id,
    title: id,
    dateCreated: '2026-05-03T12:00:00.000Z',
    status: 'To Do',
    dueDate,
    daysUntilDue,
  };
}

describe('partitionTasksForCalendar', () => {
  it('returns empty arrays for empty input', () => {
    const { valid, outOfSaneRange } = partitionTasksForCalendar([]);
    expect(valid).toEqual([]);
    expect(outOfSaneRange).toEqual([]);
  });

  it('drops tasks with no dueDate', () => {
    const { valid, outOfSaneRange } = partitionTasksForCalendar([
      makeTask('a', undefined),
    ]);
    expect(valid).toEqual([]);
    expect(outOfSaneRange).toEqual([]);
  });

  it('drops tasks whose dueDate cannot be parsed', () => {
    const { valid, outOfSaneRange } = partitionTasksForCalendar([
      makeTask('a', 'not-a-date'),
    ]);
    expect(valid).toEqual([]);
    expect(outOfSaneRange).toEqual([]);
  });

  it('keeps good-date tasks', () => {
    const tasks = [
      makeTask('a', '2026-05-04', 1),
      makeTask('b', '2026-06-15', 42),
    ];
    const { valid, outOfSaneRange } = partitionTasksForCalendar(tasks);
    expect(valid.length).toBe(2);
    expect(outOfSaneRange.length).toBe(0);
  });

  it('routes year>9999 / year<1970 tasks to outOfSaneRange', () => {
    const tasks = [
      makeTask('future', '99999-01-01', 5),
      makeTask('ancient', '1500-01-01', -300),
    ];
    const { valid, outOfSaneRange } = partitionTasksForCalendar(tasks);
    // 99999-01-01 may fail to parse OR exceed 2100; either way it isn't valid.
    expect(valid.length).toBe(0);
    // 1500 has a parseable year but it's outside [1970..2100].
    expect(outOfSaneRange.some((t) => t.id === 'ancient')).toBe(true);
  });

  it('routes daysUntilDue beyond ±365 to outOfSaneRange', () => {
    const tasks = [
      makeTask('far', '2030-01-01', 1500),
      makeTask('long-overdue', '2020-01-01', -2200),
    ];
    const { valid, outOfSaneRange } = partitionTasksForCalendar(tasks);
    expect(valid.length).toBe(0);
    expect(outOfSaneRange.length).toBe(2);
  });

  it('treats NaN daysUntilDue as out-of-sane', () => {
    const tasks = [makeTask('nanny', '2026-05-04', NaN)];
    const { valid, outOfSaneRange } = partitionTasksForCalendar(tasks);
    expect(valid.length).toBe(0);
    expect(outOfSaneRange.length).toBe(1);
  });
});
