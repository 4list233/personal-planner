import { describe, it, expect } from 'vitest';
import { Task } from './types';
import {
  scheduleThisWeek,
  summarizeSchedule,
  WEEKDAY_NAMES,
  weekdayToDow,
  dowToStatus,
} from './scheduling';

function makeTask(id: string, important: boolean, urgent: boolean): Task {
  return {
    id,
    title: id,
    dateCreated: '2026-05-03T12:00:00.000Z',
    status: 'To Do',
    important,
    urgent,
  };
}

// Pick a known Wednesday (2026-05-06) so getDay() === 3.
const WEDNESDAY = new Date(2026, 4, 6);
// Friday afternoon (2026-05-08) → getDay() === 5
const FRIDAY = new Date(2026, 4, 8);
// Saturday (2026-05-09) → getDay() === 6
const SATURDAY = new Date(2026, 4, 9);

describe('weekdayToDow / dowToStatus', () => {
  it('maps weekday names to dow', () => {
    expect(weekdayToDow('Sunday')).toBe(0);
    expect(weekdayToDow('Saturday')).toBe(6);
    expect(weekdayToDow('No Weekdays')).toBe(-1);
    expect(weekdayToDow(undefined)).toBe(-1);
  });

  it('maps dow to status relative to today', () => {
    // Today is Wednesday (3).
    expect(dowToStatus(3, 3)).toBe('Doing Today');
    expect(dowToStatus(4, 3)).toBe('Doing Tomorrow');
    expect(dowToStatus(5, 3)).toBe('To Do');
    // Today is Saturday (6); tomorrow wraps to Sunday (0).
    expect(dowToStatus(0, 6)).toBe('Doing Tomorrow');
  });
});

describe('scheduleThisWeek', () => {
  it('balances load mid-week with mixed quadrants', () => {
    // Wednesday → available days are Wed(3), Thu(4), Fri(5), Sat(6).
    const tasks = [
      makeTask('q1a', true, true),
      makeTask('q1b', true, true),
      makeTask('q2a', true, false),
      makeTask('q2b', true, false),
      makeTask('q3a', false, true),
      makeTask('q4a', false, false),
      makeTask('q4b', false, false),
      makeTask('q4c', false, false),
    ];
    const result = scheduleThisWeek(tasks, WEDNESDAY);

    expect(result.size).toBe(tasks.length);

    // Q1 should get today/tomorrow.
    expect(result.get('q1a')!.status).toBe('Doing Today');
    expect(result.get('q1b')!.status).toBe('Doing Tomorrow');
    // Q3 also wants today/tomorrow but those slots are now occupied by Q1.
    // Least-loaded falls through to today (1 each so far) — both have load 1
    // and earlier-day tiebreak wins → today.
    expect(result.get('q3a')!.status).toBe('Doing Today');

    // Each day should have <= 5 entries.
    const counts = new Map<string, number>();
    for (const a of result.values()) {
      counts.set(a.weekday, (counts.get(a.weekday) ?? 0) + 1);
    }
    for (const c of counts.values()) {
      expect(c).toBeLessThanOrEqual(5);
    }
  });

  it('Friday afternoon with 8 tasks — Q1 lands today/tomorrow, others spread', () => {
    // Friday → Fri(5), Sat(6).
    const tasks = [
      makeTask('q1a', true, true),
      makeTask('q1b', true, true),
      makeTask('q2a', true, false),
      makeTask('q2b', true, false),
      makeTask('q3a', false, true),
      makeTask('q3b', false, true),
      makeTask('q4a', false, false),
      makeTask('q4b', false, false),
    ];
    const result = scheduleThisWeek(tasks, FRIDAY);

    expect(result.get('q1a')!.weekday).toBe('Friday');
    expect(result.get('q1b')!.weekday).toBe('Saturday');
    // Days are only Fri/Sat — totals split roughly evenly.
    let fri = 0;
    let sat = 0;
    for (const a of result.values()) {
      if (a.weekday === 'Friday') fri++;
      if (a.weekday === 'Saturday') sat++;
    }
    expect(fri + sat).toBe(8);
    expect(Math.abs(fri - sat)).toBeLessThanOrEqual(2);
  });

  it('overflow lands on the latest available day', () => {
    // Saturday only → all tasks land on Saturday even past maxPerDay.
    const tasks = Array.from({ length: 8 }, (_, i) => makeTask(`t${i}`, false, false));
    const result = scheduleThisWeek(tasks, SATURDAY, { maxPerDay: 5 });
    for (const a of result.values()) {
      expect(a.weekday).toBe('Saturday');
      expect(a.status).toBe('Doing Today');
    }
  });

  it('is deterministic — same inputs produce identical placements', () => {
    const tasks = [
      makeTask('a', true, false),
      makeTask('b', false, true),
      makeTask('c', true, true),
      makeTask('d', false, false),
    ];
    const r1 = scheduleThisWeek(tasks, WEDNESDAY);
    const r2 = scheduleThisWeek(tasks, WEDNESDAY);
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });

  it('summarizeSchedule splits by today/tomorrow/later', () => {
    const tasks = [
      makeTask('t1', true, true),
      makeTask('t2', true, true),
      makeTask('t3', true, false),
      makeTask('t4', false, false),
    ];
    const result = scheduleThisWeek(tasks, WEDNESDAY);
    const sum = summarizeSchedule(result, WEDNESDAY);
    expect(sum.today + sum.tomorrow + sum.later).toBe(tasks.length);
  });

  it('respects maxPerDay before overflow', () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask(`t${i}`, false, false)
    );
    // Wednesday: 4 days available, maxPerDay=2 → 8 capacity, no overflow needed.
    const result = scheduleThisWeek(tasks, WEDNESDAY, { maxPerDay: 2 });
    const counts = new Map<string, number>();
    for (const a of result.values()) {
      counts.set(a.weekday, (counts.get(a.weekday) ?? 0) + 1);
    }
    for (const c of counts.values()) {
      expect(c).toBeLessThanOrEqual(2);
    }
  });
});

describe('WEEKDAY_NAMES', () => {
  it('matches Sun..Sat order', () => {
    expect(WEEKDAY_NAMES[0]).toBe('Sunday');
    expect(WEEKDAY_NAMES[6]).toBe('Saturday');
  });
});
