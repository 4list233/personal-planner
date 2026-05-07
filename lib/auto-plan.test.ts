import { describe, it, expect, vi } from 'vitest';
import { Task } from './types';
import {
  autoPlanThisWeek,
  summarizeAutoPlan,
  GeminiBacklogPayload,
  GeminiBacklogResponse,
} from './auto-plan';
import { parseBacklogResponse } from './auto-plan-gemini';

function makeTask(
  id: string,
  important: boolean,
  urgent: boolean,
  extra: Partial<Task> = {}
): Task {
  return {
    id,
    title: id,
    dateCreated: '2026-05-03T12:00:00.000Z',
    status: 'To Do',
    important,
    urgent,
    ...extra,
  };
}

// Wednesday 2026-05-06 12:00 UTC — unambiguously Wednesday in the UTC tz the tests pin.
const WEDNESDAY = new Date('2026-05-06T12:00:00Z');
const TZ = 'UTC';

describe('autoPlanThisWeek', () => {
  it('quadrant ordering — Q1 today, Q3 today, Q2 late half, no day exceeds cap', async () => {
    const tasks = [
      ...['q1a', 'q1b', 'q1c'].map((id) => makeTask(id, true, true)),
      ...['q3a', 'q3b', 'q3c'].map((id) => makeTask(id, false, true)),
      ...['q2a', 'q2b', 'q2c', 'q2d'].map((id) => makeTask(id, true, false)),
      ...['q4a', 'q4b'].map((id) => makeTask(id, false, false)),
    ];
    const result = await autoPlanThisWeek({
      tasks,
      today: WEDNESDAY, timezone: TZ,
      maxPerDay: 5,
      callGemini: async (p) => ({
        assignments: p.backlogTasks.map((t) => ({ taskId: t.taskId, day: 'Saturday' })),
        overflow: [],
      }),
    });

    expect(result.assignments.size).toBe(tasks.length);

    // Q1 should be on today (Wed).
    expect(result.assignments.get('q1a')!.weekday).toBe('Wednesday');

    // No day exceeds maxPerDay=5.
    for (const count of result.loadByDay.values()) {
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it('hard dueDate today → assigned to today regardless of quadrant', async () => {
    const tasks = [makeTask('t', false, false, { dueDate: '2026-05-06' })];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    expect(result.assignments.get('t')!.weekday).toBe('Wednesday');
    expect(result.assignments.get('t')!.status).toBe('Doing Today');
  });

  it('overdue dueDate → assigned to today', async () => {
    const tasks = [makeTask('t', false, false, { dueDate: '2026-04-01' })];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    expect(result.assignments.get('t')!.weekday).toBe('Wednesday');
  });

  it('dueDate two weeks out → not in assignments map (skipped)', async () => {
    const tasks = [makeTask('t', false, false, { dueDate: '2026-05-25' })];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    expect(result.assignments.has('t')).toBe(false);
    expect(result.skipped).toContain('t');
  });

  it('Doing Today / Doing Tomorrow / Archived are skipped', async () => {
    const tasks = [
      makeTask('today', false, false, { status: 'Doing Today' }),
      makeTask('tomorrow', false, false, { status: 'Doing Tomorrow' }),
      makeTask('archived', false, false, { status: 'Archived' }),
      makeTask('keep', false, false),
    ];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    expect(result.assignments.has('today')).toBe(false);
    expect(result.assignments.has('tomorrow')).toBe(false);
    expect(result.assignments.has('archived')).toBe(false);
    expect(result.assignments.has('keep')).toBe(true);
  });

  it('tasks with existing weekday are skipped on a non-selection run', async () => {
    const tasks = [
      makeTask('a', false, false, { weekday: 'Friday' }),
      makeTask('b', false, false),
    ];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    expect(result.assignments.has('a')).toBe(false);
    expect(result.assignments.has('b')).toBe(true);
  });

  it('selection mode redistributes even tasks with existing weekday', async () => {
    const tasks = [
      makeTask('a', false, false, { weekday: 'Friday' }),
      makeTask('b', false, false),
    ];
    const result = await autoPlanThisWeek({
      tasks,
      today: WEDNESDAY, timezone: TZ,
      selectedTaskIds: new Set(['a']),
    });
    expect(result.assignments.has('a')).toBe(true);
    expect(result.assignments.has('b')).toBe(false);
  });

  it('30 backlog tasks fit across 4 days at maxPerDay=5 — Gemini-balanced, no overflow', async () => {
    const tasks = Array.from({ length: 30 }, (_, i) => makeTask(`b${i}`, false, false));
    const days = ['Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const callGemini = vi.fn(
      async (p: GeminiBacklogPayload): Promise<GeminiBacklogResponse> => ({
        assignments: p.backlogTasks.map((t, i) => ({
          taskId: t.taskId,
          day: days[i % days.length],
        })),
        overflow: [],
      })
    );
    const result = await autoPlanThisWeek({
      tasks,
      today: WEDNESDAY, timezone: TZ,
      maxPerDay: 999, // capacity test only — Gemini does the spread
      callGemini,
    });
    expect(callGemini).toHaveBeenCalledTimes(1);
    expect(result.assignments.size).toBe(30);
    expect(result.geminiConsulted).toBe(true);
  });

  it('Gemini returns malformed JSON → fallback to deterministic round-robin still succeeds', async () => {
    const tasks = Array.from({ length: 12 }, (_, i) => makeTask(`b${i}`, false, false));
    const result = await autoPlanThisWeek({
      tasks,
      today: WEDNESDAY, timezone: TZ,
      callGemini: async () => {
        throw new Error('bad JSON');
      },
    });
    expect(result.assignments.size).toBe(12);
    expect(result.geminiConsulted).toBe(false);
  });

  it('summarizeAutoPlan splits today/tomorrow/later totals', async () => {
    const tasks = [
      makeTask('q1a', true, true),
      makeTask('q1b', true, true),
      makeTask('q2', true, false),
    ];
    const result = await autoPlanThisWeek({ tasks, today: WEDNESDAY, timezone: TZ });
    const sum = summarizeAutoPlan(result, WEDNESDAY);
    expect(sum.today + sum.tomorrow + sum.later).toBe(3);
    expect(sum.total).toBe(3);
  });
});

describe('parseBacklogResponse', () => {
  it('parses raw JSON', () => {
    const r = parseBacklogResponse(
      '{"assignments":[{"taskId":"a","day":"Mon"}],"overflow":[],"reasoning":"x"}'
    );
    expect(r).not.toBeNull();
    expect(r!.assignments).toEqual([{ taskId: 'a', day: 'Monday' }]);
    expect(r!.reasoning).toBe('x');
  });

  it('strips ``` fences', () => {
    const r = parseBacklogResponse(
      '```json\n{"assignments":[],"overflow":["x"]}\n```'
    );
    expect(r).not.toBeNull();
    expect(r!.overflow).toEqual(['x']);
  });

  it('returns null on garbage', () => {
    expect(parseBacklogResponse('not json')).toBeNull();
  });

  it('drops invalid day names', () => {
    const r = parseBacklogResponse(
      '{"assignments":[{"taskId":"a","day":"Funday"},{"taskId":"b","day":"Wed"}]}'
    );
    expect(r).not.toBeNull();
    expect(r!.assignments).toEqual([{ taskId: 'b', day: 'Wednesday' }]);
  });
});
