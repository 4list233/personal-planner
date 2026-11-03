import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import {
  BOARD_COLUMNS,
  PLANNER_OWNER_EMAIL,
  checklistFromSources,
  columnForTask,
  compareBoardTasks,
  effectiveView,
  formatTodosText,
  isStale,
  parseTodosText,
  patchForColumn,
  rowVisibleToUser,
  stageFromStatus,
  statusForStage,
  taskFromNotionPage,
  userEmailQueryFilter,
} from './planner';

function task(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? 't',
    title: partial.title ?? 'Task',
    dateCreated: partial.dateCreated ?? '2026-01-01T00:00:00.000Z',
    status: partial.status ?? 'To Do',
    ...partial,
  };
}

describe('stageFromStatus', () => {
  it('maps the old statuses onto the new stages', () => {
    expect(stageFromStatus('To Do')).toBe('Inbox');
    expect(stageFromStatus('Doing Tomorrow')).toBe('This Week');
    expect(stageFromStatus('Doing Today')).toBe('Today');
    expect(stageFromStatus('Blocked')).toBe('Waiting');
    expect(stageFromStatus('Reminders')).toBe('Waiting');
    expect(stageFromStatus('Long Term Deadlines')).toBe('Inbox');
    expect(stageFromStatus('Done')).toBe('Done');
    expect(stageFromStatus('Archived')).toBe('Done');
  });

  it('does not invent a stage for an unknown status', () => {
    expect(stageFromStatus('Someday')).toBeNull();
    expect(stageFromStatus(undefined)).toBeNull();
    expect(stageFromStatus('')).toBeNull();
  });
});

describe('columnForTask', () => {
  it('uses an explicit stage when one is set', () => {
    expect(columnForTask({ stage: 'Waiting', status: 'To Do' })).toBe('Waiting');
    expect(columnForTask({ stage: 'In Progress', status: 'To Do' })).toBe('In Progress');
  });

  it('hides Done and Archived and keeps everything else visible', () => {
    expect(columnForTask({ status: 'Done' })).toBeNull();
    expect(columnForTask({ status: 'Archived' })).toBeNull();
    expect(columnForTask({ stage: 'Done', status: 'To Do' })).toBeNull();
    expect(columnForTask({ status: 'Blocked' })).toBe('Waiting');
    expect(columnForTask({ status: 'Reminders' })).toBe('Waiting');
    expect(columnForTask({ status: 'Long Term Deadlines' })).toBe('Inbox');
    expect(columnForTask({ status: 'Someday' })).toBe('Unsorted');
    expect(columnForTask({ stage: 'Later', status: 'To Do' })).toBe('Unsorted');
    expect(columnForTask({})).toBe('Unsorted');
  });

  it('lists every board column, including Unsorted, and not Done', () => {
    expect(BOARD_COLUMNS).toEqual([
      'Inbox',
      'This Week',
      'Today',
      'In Progress',
      'Waiting',
      'Unsorted',
    ]);
  });
});

describe('statusForStage / patchForColumn', () => {
  it('keeps the old Status field in sync when a card moves', () => {
    expect(statusForStage('Inbox')).toBe('To Do');
    expect(statusForStage('This Week')).toBe('Doing Tomorrow');
    expect(statusForStage('Today')).toBe('Doing Today');
    expect(statusForStage('Waiting')).toBe('Blocked');
    expect(statusForStage('In Progress')).toBe('Doing Today');
    expect(statusForStage('Done')).toBe('Done');
    expect(patchForColumn('Today')).toEqual({ stage: 'Today', status: 'Doing Today' });
    expect(patchForColumn('Unsorted')).toBeNull();
  });
});

describe('compareBoardTasks', () => {
  it('sorts by priority, then planned day, then due date', () => {
    const p2Early = task({
      id: 'p2',
      priority: 'P2',
      plannedDay: '2026-11-01',
      dueDate: '2026-11-01',
    });
    const p1Late = task({
      id: 'p1',
      priority: 'P1',
      plannedDay: '2026-12-01',
      dueDate: '2026-12-01',
    });
    const p1SoonerPlan = task({
      id: 'p1b',
      priority: 'P1',
      plannedDay: '2026-11-03',
      dueDate: '2026-12-15',
    });
    const unset = task({ id: 'none', dueDate: '2026-01-01' });
    const samePlanEarlierDue = task({
      id: 'due',
      priority: 'P1',
      plannedDay: '2026-11-03',
      dueDate: '2026-11-04',
    });

    const sorted = [p2Early, unset, p1Late, samePlanEarlierDue, p1SoonerPlan].sort(compareBoardTasks);
    expect(sorted.map((t) => t.id)).toEqual(['due', 'p1b', 'p1', 'p2', 'none']);
  });

  it('puts missing planned days and due dates after dated tasks', () => {
    const dated = task({ id: 'dated', plannedDay: '2026-11-02', dueDate: '2026-11-02' });
    const noPlan = task({ id: 'noplan', dueDate: '2026-11-01' });
    const neither = task({ id: 'neither' });
    expect([neither, noPlan, dated].sort(compareBoardTasks).map((t) => t.id)).toEqual([
      'dated',
      'noplan',
      'neither',
    ]);
  });
});

describe('isStale', () => {
  const now = Date.parse('2026-11-03T00:00:00.000Z');

  it('flags tasks untouched for 7 or more days', () => {
    expect(isStale('2026-10-27T00:00:00.000Z', now)).toBe(true);
    expect(isStale('2026-10-26T00:00:00.000Z', now)).toBe(true);
    expect(isStale('2026-10-27T00:00:01.000Z', now)).toBe(false);
    expect(isStale(undefined, now)).toBe(false);
    expect(isStale('not-a-date', now)).toBe(false);
  });
});

describe('todo text', () => {
  it('parses br separators and leading dash markers', () => {
    const parsed = parseTodosText('\\- first<br />- second<br>third');
    expect(parsed.map((item) => item.text)).toEqual(['first', 'second', 'third']);
    expect(parsed.every((item) => item.completed === false)).toBe(true);
  });

  it('keeps the older newline and checkmark format', () => {
    const parsed = parseTodosText('- open\n✓ done\n* also');
    expect(parsed.map((item) => ({ text: item.text, completed: item.completed }))).toEqual([
      { text: 'open', completed: false },
      { text: 'done', completed: true },
      { text: 'also', completed: false },
    ]);
  });

  it('writes both the dash marker and a br separator', () => {
    const text = formatTodosText([
      { id: 'a', text: 'open', completed: false },
      { id: 'b', text: 'done', completed: true },
    ]);
    expect(text).toBe('- open<br />✓ done');
    expect(parseTodosText(text).map((item) => ({ text: item.text, completed: item.completed }))).toEqual([
      { text: 'open', completed: false },
      { text: 'done', completed: true },
    ]);
  });

  it('prefers page to-do blocks and falls back to the property', () => {
    const propertyItems = [{ id: 'p', text: 'from property', completed: false }];
    const blockItems = [{ id: 'b', text: 'from block', completed: true }];
    expect(checklistFromSources(blockItems, propertyItems)).toEqual(blockItems);
    expect(checklistFromSources([], propertyItems)).toEqual(propertyItems);
  });
});

describe('user email visibility', () => {
  it('lets the owner see empty emails and still hides other people', () => {
    const filter = userEmailQueryFilter(PLANNER_OWNER_EMAIL);
    expect(filter).toEqual({
      or: [
        { property: 'User Email', email: { equals: PLANNER_OWNER_EMAIL } },
        { property: 'User Email', email: { is_empty: true } },
      ],
    });
    expect(rowVisibleToUser(null, PLANNER_OWNER_EMAIL)).toBe(true);
    expect(rowVisibleToUser('', 'ForestLi009@gmail.com')).toBe(true);
    expect(rowVisibleToUser('amandaliu54@gmail.com', PLANNER_OWNER_EMAIL)).toBe(false);
    expect(rowVisibleToUser(PLANNER_OWNER_EMAIL, PLANNER_OWNER_EMAIL)).toBe(true);
  });

  it('does not give empty-email rows to a different signed-in user', () => {
    expect(userEmailQueryFilter('amandaliu54@gmail.com')).toEqual({
      property: 'User Email',
      email: { equals: 'amandaliu54@gmail.com' },
    });
    expect(rowVisibleToUser('', 'amandaliu54@gmail.com')).toBe(false);
    expect(rowVisibleToUser('amandaliu54@gmail.com', 'amandaliu54@gmail.com')).toBe(true);
  });

  it('does not filter when no user is provided', () => {
    expect(userEmailQueryFilter(undefined)).toBeUndefined();
    expect(rowVisibleToUser('amandaliu54@gmail.com', undefined)).toBe(true);
  });
});

describe('taskFromNotionPage', () => {
  it('reads optional properties and does not treat Planned Day as the due date', () => {
    const task = taskFromNotionPage({
      id: 'page-1',
      created_time: '2026-10-01T00:00:00.000Z',
      last_edited_time: '2026-10-20T00:00:00.000Z',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Outreach CRM Patch' }] },
        Status: { type: 'select', select: { name: 'Blocked' } },
        'Due Date': { type: 'date', date: null },
        'Planned Day': { type: 'date', date: { start: '2026-11-05' } },
        Priority: { type: 'select', select: { name: 'P1' } },
        Project: { type: 'select', select: { name: 'Velox' } },
        Bucket: { type: 'select', select: { name: 'Mine' } },
        'Waiting On': { type: 'rich_text', rich_text: [{ plain_text: 'Mike' }] },
        'Next Action': { type: 'rich_text', rich_text: [{ plain_text: 'Ship the patch' }] },
        Source: { type: 'rich_text', rich_text: [{ plain_text: 'Standup' }] },
        Todos: {
          type: 'rich_text',
          rich_text: [{ plain_text: '- one' }, { plain_text: '<br />- two' }],
        },
        Comments: { type: 'rich_text', rich_text: [{ plain_text: 'note a<br />note b' }] },
        'User Email': { type: 'email', email: null },
        Important: { type: 'checkbox', checkbox: true },
      },
    });

    expect(task.title).toBe('Outreach CRM Patch');
    expect(task.status).toBe('Blocked');
    expect(task.stage).toBeUndefined();
    expect(task.dueDate).toBeUndefined();
    expect(task.plannedDay).toBe('2026-11-05');
    expect(task.priority).toBe('P1');
    expect(task.project).toBe('Velox');
    expect(task.bucket).toBe('Mine');
    expect(task.waitingOn).toBe('Mike');
    expect(task.nextAction).toBe('Ship the patch');
    expect(task.sourceText).toBe('Standup');
    expect(task.todoItems?.map((item) => item.text)).toEqual(['one', 'two']);
    expect(task.comments).toEqual(['note a', 'note b']);
    expect(task.userEmail).toBeUndefined();
    expect(task.important).toBe(true);
    expect(task.lastEditedTime).toBe('2026-10-20T00:00:00.000Z');
    expect(columnForTask(task)).toBe('Waiting');
  });

  it('defaults a missing status to To Do so the row still lands in Inbox', () => {
    const task = taskFromNotionPage({
      id: 'page-2',
      created_time: '2026-11-01T00:00:00.000Z',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Untitled row' }] },
      },
    });
    expect(task.status).toBe('To Do');
    expect(columnForTask(task)).toBe('Inbox');
  });
});

describe('effectiveView', () => {
  it('hides weekday and matrix views unless the flag is on', () => {
    const previous = process.env.NEXT_PUBLIC_SHOW_LEGACY_VIEWS;
    delete process.env.NEXT_PUBLIC_SHOW_LEGACY_VIEWS;
    expect(effectiveView('matrix')).toBe('board');
    expect(effectiveView('weekdays')).toBe('board');
    expect(effectiveView('calendar')).toBe('calendar');
    process.env.NEXT_PUBLIC_SHOW_LEGACY_VIEWS = '1';
    expect(effectiveView('matrix')).toBe('matrix');
    expect(effectiveView('weekdays')).toBe('weekdays');
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SHOW_LEGACY_VIEWS;
    else process.env.NEXT_PUBLIC_SHOW_LEGACY_VIEWS = previous;
  });
});
