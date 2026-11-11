import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import {
  addDays,
  isDone,
  patchForMove,
  placementOf,
  reopenPatch,
  laneOf,
  patchForLane,
  selectLanes,
  plannedFor,
  patchForDay,
  daysFrom,
  peopleIn,
  ownerMatches,
} from './views';

const TODAY = '2026-11-08';
const TOMORROW = '2026-11-09';

function task(partial: Partial<Task>): Task {
  return { id: partial.title ?? 't', title: 'Task', dateCreated: '2026-01-01', status: 'To Do', ...partial };
}

const place = (partial: Partial<Task>) => placementOf(task(partial), TODAY, TOMORROW);

describe('placementOf', () => {
  it('puts a row on Today by Planned Day, Stage or Status', () => {
    expect(place({ plannedDay: TODAY })).toBe('today');
    expect(place({ plannedDay: `${TODAY}T09:00:00.000-05:00` })).toBe('today');
    expect(place({ stage: 'Today' })).toBe('today');
    expect(place({ status: 'Doing Today' })).toBe('today');
  });

  it('carries unfinished Doing Today rows from earlier days', () => {
    expect(place({ status: 'Doing Today', stage: 'Today', plannedDay: '2026-11-01' })).toBe('today');
  });

  it('puts a row on Tomorrow by Planned Day, even with a leftover Today stage', () => {
    expect(place({ plannedDay: TOMORROW })).toBe('tomorrow');
    expect(place({ plannedDay: TOMORROW, stage: 'Today', status: 'Doing Today' })).toBe('tomorrow');
  });

  it('counts undated Doing Tomorrow rows as tomorrow', () => {
    expect(place({ status: 'Doing Tomorrow', stage: 'This Week' })).toBe('tomorrow');
    expect(place({ status: 'Doing Tomorrow', plannedDay: '2026-11-20' })).toBe('backlog');
  });

  it('sends the rest to Backlog and finished rows nowhere', () => {
    expect(place({ plannedDay: '2026-11-20' })).toBe('backlog');
    expect(place({})).toBe('backlog');
    expect(place({ status: 'Done', stage: 'Done', plannedDay: TODAY })).toBeNull();
    expect(place({ status: 'Archived', plannedDay: TODAY })).toBeNull();
  });
});

describe('lanes', () => {
  const lane = (partial: Partial<Task>) => laneOf(task(partial), TODAY, TOMORROW);

  it('puts every open row in one of five lanes', () => {
    expect(lane({ stage: 'Today' })).toBe('Today');
    expect(lane({ plannedDay: TODAY, stage: 'Inbox' })).toBe('Today');
    expect(lane({ stage: 'In Progress', status: 'To Do' })).toBe('Today');
    expect(lane({ plannedDay: TOMORROW, stage: 'Today' })).toBe('Tomorrow');
    expect(lane({ status: 'Doing Tomorrow' })).toBe('Tomorrow');
    expect(lane({ stage: 'This Week' })).toBe('This Week');
    expect(lane({ stage: 'Waiting' })).toBe('This Week');
    expect(lane({ stage: 'Inbox' })).toBe('Inbox');
    expect(lane({ stage: 'Something new' as Task['stage'] })).toBe('Inbox');
    expect(lane({})).toBe('Inbox');
  });

  it('keeps a Waiting task on the day it is planned', () => {
    expect(lane({ stage: 'Waiting', plannedDay: TODAY })).toBe('Today');
  });

  it('puts done and archived rows in Done', () => {
    expect(lane({ status: 'Done' })).toBe('Done');
    expect(lane({ stage: 'Done' })).toBe('Done');
    expect(lane({ status: 'Archived', stage: 'Done' })).toBe('Done');
    expect(lane({ status: 'Archived', stage: 'Inbox' })).toBe('Done');
  });

  it('sorts by priority then due date, and Done newest first', () => {
    const lanes = selectLanes(
      [
        task({ title: 'late', stage: 'Today', priority: 'P2', dueDate: '2026-11-01' }),
        task({ title: 'none', stage: 'Today' }),
        task({ title: 'top', stage: 'Today', priority: 'P1' }),
        task({ title: 'old', status: 'Done', lastEditedTime: '2026-11-01' }),
        task({ title: 'new', status: 'Done', lastEditedTime: '2026-11-08' }),
      ],
      TODAY,
      TOMORROW
    );
    expect(lanes.Today.map((t) => t.id)).toEqual(['top', 'late', 'none']);
    expect(lanes.Done.map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('writes a drop that lands in the lane it was dropped on', () => {
    const row = task({ stage: 'Today', status: 'Doing Today', plannedDay: TODAY });
    for (const target of ['Today', 'Tomorrow', 'This Week', 'Inbox'] as const) {
      const moved = { ...row, ...patchForLane(row, target, TODAY, TOMORROW) };
      expect(laneOf(moved, TODAY, TOMORROW)).toBe(target);
    }
  });

  it('does not let a drop on This Week become Doing Tomorrow', () => {
    expect(patchForLane(task({}), 'This Week', TODAY, TOMORROW)).toEqual({
      plannedDay: null,
      stage: 'This Week',
      status: 'To Do',
    });
  });
});

describe('patchForMove', () => {
  it('writes what makes the row land in the target list', () => {
    const row = task({ stage: 'Today', status: 'Doing Today', plannedDay: TODAY });
    const toTomorrow = patchForMove(row, 'tomorrow', TODAY, TOMORROW);
    expect(toTomorrow).toEqual({ plannedDay: TOMORROW, stage: 'This Week', status: 'Doing Tomorrow' });
    expect(placementOf({ ...row, ...toTomorrow }, TODAY, TOMORROW)).toBe('tomorrow');

    const toBacklog = patchForMove(row, 'backlog', TODAY, TOMORROW);
    expect(toBacklog).toEqual({ plannedDay: null, stage: 'Inbox', status: 'To Do' });
    expect(placementOf({ ...row, ...toBacklog }, TODAY, TOMORROW)).toBe('backlog');

    const fromBacklog = patchForMove(task({}), 'today', TODAY, TOMORROW);
    expect(placementOf({ ...task({}), ...fromBacklog }, TODAY, TOMORROW)).toBe('today');
  });

  it('keeps Waiting when only the date put it on Today', () => {
    const row = task({ stage: 'Waiting', status: 'Blocked', plannedDay: TODAY });
    expect(patchForMove(row, 'backlog', TODAY, TOMORROW)).toEqual({ plannedDay: null });
  });
});

describe('reopenPatch', () => {
  const finished = task({ status: 'Done', stage: 'Done' });

  it('restores the remembered Stage and Status', () => {
    expect(reopenPatch(finished, { stage: 'Waiting', status: 'To Do' }, TODAY, TOMORROW)).toEqual({
      stage: 'Waiting',
      status: 'To Do',
    });
  });

  it('falls back to the plan when nothing is remembered', () => {
    expect(reopenPatch(finished, null, TODAY, TOMORROW)).toEqual({ stage: 'Inbox', status: 'To Do' });
    expect(reopenPatch({ ...finished, plannedDay: TODAY }, null, TODAY, TOMORROW)).toEqual({
      stage: 'Today',
      status: 'Doing Today',
    });
  });

  it('never restores a finished state', () => {
    expect(reopenPatch(finished, { stage: 'Done', status: 'Done' }, TODAY, TOMORROW).status).toBe('To Do');
  });
});

describe('addDays', () => {
  it('crosses month ends and daylight-saving changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('week planner', () => {
  it('reads the day a task is planned for, matching the board', () => {
    expect(plannedFor(task({ stage: 'Today' }), TODAY, TOMORROW)).toBe(TODAY);
    expect(plannedFor(task({ status: 'Doing Tomorrow' }), TODAY, TOMORROW)).toBe(TOMORROW);
    expect(plannedFor(task({ plannedDay: '2026-11-12' }), TODAY, TOMORROW)).toBe('2026-11-12');
    expect(plannedFor(task({ stage: 'Inbox' }), TODAY, TOMORROW)).toBeNull();
    expect(plannedFor(task({ status: 'Done', plannedDay: TODAY }), TODAY, TOMORROW)).toBeNull();
  });

  it('writes a drop on a day so the task shows on that day', () => {
    const row = task({ stage: 'Today', status: 'Doing Today', plannedDay: TODAY });
    for (const day of [TODAY, TOMORROW, '2026-11-12', '2026-11-14', '2026-11-20']) {
      const moved = { ...row, ...patchForDay(row, day, TODAY, TOMORROW) };
      expect(plannedFor(moved, TODAY, TOMORROW)).toBe(day);
    }
  });

  it('never writes Doing Tomorrow for a later day', () => {
    expect(patchForDay(task({}), '2026-11-12', TODAY, TOMORROW)).toEqual({
      plannedDay: '2026-11-12',
      stage: 'This Week',
      status: 'To Do',
    });
    expect(patchForDay(task({}), '2026-11-20', TODAY, TOMORROW).stage).toBe('Inbox');
  });

  it('lists seven days from a start', () => {
    expect(daysFrom(TODAY)).toEqual([
      '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14',
    ]);
  });
});

describe('people', () => {
  it('counts open tasks per person, busiest first', () => {
    expect(
      peopleIn([
        task({ title: 'a', people: ['Noa', 'Sam'] }),
        task({ title: 'b', people: ['Noa'] }),
        task({ title: 'c', people: ['Sam'], status: 'Done' }),
      ])
    ).toEqual([
      { name: 'Noa', open: 2 },
      { name: 'Sam', open: 1 },
    ]);
  });

  it('matches a subtask owner by full or first name', () => {
    expect(ownerMatches('Noa', 'Noa Levi')).toBe(true);
    expect(ownerMatches('noa levi', 'Noa Levi')).toBe(true);
    expect(ownerMatches('Sam', 'Noa Levi')).toBe(false);
    expect(ownerMatches(undefined, 'Noa')).toBe(false);
  });
});
