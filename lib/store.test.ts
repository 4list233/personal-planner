import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAuthTokenGetter, usePlannerStore } from './store';
import { useToastStore } from './toast';
import { addDays } from './views';
import { todayInUserTz } from './time';
import type { Task } from './types';

// A stand-in for the API: applies each write so reads reflect what was saved.
let server: Record<string, Task>;
let calls: Array<{ url: string; method: string; body: any }>;
let failNext: number | null;

function task(partial: Partial<Task> & { id: string }): Task {
  return { title: partial.id, dateCreated: '2026-01-01', status: 'To Do', stage: 'Inbox', ...partial };
}

beforeEach(() => {
  server = {};
  calls = [];
  failNext = null;
  setAuthTokenGetter(async () => 'token');
  useToastStore.setState({ toasts: [] });
  usePlannerStore.setState({ tasks: [], detailTaskId: null, editing: null, heldUpdates: {}, savedAt: {}, lastFetchedAt: null });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (failNext !== null && method !== 'GET') {
        const status = failNext;
        failNext = null;
        return new Response('nope', { status });
      }
      if (url === '/api/tasks') return Response.json({ tasks: Object.values(server) });
      const id = url.split('/')[3];
      if (url.endsWith('/steps')) {
        server[id] = { ...server[id], todosText: '- [x] saved by server' };
      } else {
        server[id] = { ...server[id], ...body };
      }
      return Response.json({ task: server[id] });
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

function seed(...rows: Task[]) {
  for (const row of rows) server[row.id] = row;
  usePlannerStore.setState({ tasks: rows });
}

const row = (id: string) => usePlannerStore.getState().tasks.find((t) => t.id === id)!;
const writes = () => calls.filter((c) => c.method !== 'GET');

describe('a save on a row with a held refresh', () => {
  it('drops the held copy, which is now older than the saved row', async () => {
    seed(task({ id: 'a', title: 'mine' }));
    usePlannerStore.setState({ heldUpdates: { a: task({ id: 'a', title: 'older bot copy' }) } });
    await usePlannerStore.getState().saveChange('a', { title: 'typed' });
    expect(usePlannerStore.getState().heldUpdates).toEqual({});
    expect(row('a').title).toBe('typed');
  });
});

describe('completing', () => {
  it('writes Stage=Done and Status=Done and never Archived', async () => {
    seed(task({ id: 'a', stage: 'Today', status: 'Doing Today' }));
    await usePlannerStore.getState().completeTask('a');
    expect(writes()).toEqual([
      { url: '/api/tasks/a', method: 'PUT', body: { stage: 'Done', status: 'Done' } },
    ]);
    expect(server.a).toMatchObject({ stage: 'Done', status: 'Done' });
    expect(row('a')).toMatchObject({ stage: 'Done', status: 'Done' });
  });

  it('updates the screen before Notion answers', () => {
    seed(task({ id: 'a' }));
    void usePlannerStore.getState().completeTask('a');
    expect(row('a')).toMatchObject({ stage: 'Done', status: 'Done', pendingSync: true });
  });

  it('rolls back and says so when Notion fails', async () => {
    seed(task({ id: 'a', stage: 'Today', status: 'Doing Today' }));
    failNext = 400;
    await usePlannerStore.getState().completeTask('a');
    expect(row('a')).toMatchObject({ stage: 'Today', status: 'Doing Today' });
    expect(row('a').pendingSync).toBeUndefined();
    expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true);
  });

  it('offers Undo for about 5 seconds and restores the exact prior state', async () => {
    seed(task({ id: 'a', stage: 'Waiting', status: 'To Do' }));
    await usePlannerStore.getState().completeTask('a');
    const toast = useToastStore.getState().toasts[0];
    expect(toast.durationMs).toBe(5000);
    await toast.action!.onClick();
    expect(row('a')).toMatchObject({ stage: 'Waiting', status: 'To Do' });
    expect(server.a).toMatchObject({ stage: 'Waiting', status: 'To Do' });
  });

  it('applies a fast Undo after the Complete it reverses', async () => {
    seed(task({ id: 'a', stage: 'Waiting', status: 'To Do' }));
    const completing = usePlannerStore.getState().completeTask('a');
    const undoing = useToastStore.getState().toasts[0].action!.onClick();
    await Promise.all([completing, undoing]);
    expect(writes().map((w) => w.body.stage)).toEqual(['Done', 'Waiting']);
    expect(server.a.stage).toBe('Waiting');
  });

  it('ignores drafts, finished and archived rows', async () => {
    seed(task({ id: 'temp-1' }), task({ id: 'b', stage: 'Done', status: 'Done' }), task({ id: 'c', status: 'Archived' }));
    for (const id of ['temp-1', 'b', 'c']) await usePlannerStore.getState().completeTask(id);
    expect(writes()).toEqual([]);
  });
});

describe('reopen and archive', () => {
  it('reopens to a sensible state with no memory of the prior one', async () => {
    seed(task({ id: 'a', stage: 'Done', status: 'Done' }));
    await usePlannerStore.getState().reopenTask('a');
    expect(server.a).toMatchObject({ stage: 'Inbox', status: 'To Do' });
  });

  it('archives only a finished task, and only sends Status', async () => {
    seed(task({ id: 'open' }), task({ id: 'done', stage: 'Done', status: 'Done' }));
    await usePlannerStore.getState().archiveTask('open');
    expect(writes()).toEqual([]);
    await usePlannerStore.getState().archiveTask('done');
    expect(writes()).toEqual([{ url: '/api/tasks/done', method: 'PUT', body: { status: 'Archived' } }]);
  });
});

describe('moving', () => {
  it('persists a move between Today, Tomorrow and Backlog', async () => {
    const today = todayInUserTz();
    seed(task({ id: 'a', stage: 'Today', status: 'Doing Today', plannedDay: today }));
    await usePlannerStore.getState().moveTask('a', 'tomorrow');
    expect(server.a).toMatchObject({ plannedDay: addDays(today, 1), stage: 'This Week', status: 'Doing Tomorrow' });
    await usePlannerStore.getState().moveTask('a', 'backlog');
    expect(server.a.plannedDay).toBeNull();
  });
});

describe('steps', () => {
  it('sends one operation, not the whole text, and takes the server copy', async () => {
    seed(task({ id: 'a', todosText: '- one\n- two' }));
    const op = { type: 'toggle', line: { index: 1, raw: '- two' }, completed: true } as const;
    await usePlannerStore.getState().changeSteps('a', op);
    expect(writes()).toEqual([{ url: '/api/tasks/a/steps', method: 'POST', body: op }]);
    expect(row('a').todosText).toBe('- [x] saved by server');
  });

  it('rolls the text back on failure', async () => {
    seed(task({ id: 'a', todosText: '- one' }));
    failNext = 400;
    await usePlannerStore
      .getState()
      .changeSteps('a', { type: 'toggle', line: { index: 0, raw: '- one' }, completed: true });
    expect(row('a').todosText).toBe('- one');
  });
});

describe('when writes fail', () => {
  it('goes back to what Notion holds, not to an edit that never saved', async () => {
    seed(task({ id: 'a', title: 'A' }));
    failNext = 500;
    vi.mocked(fetch).mockImplementation(async () => new Response('nope', { status: 500 }));
    const store = usePlannerStore.getState();
    await Promise.all([store.saveChange('a', { title: 'B' }), store.saveChange('a', { title: 'C' })]);
    expect(row('a').title).toBe('A');
    expect(row('a').pendingSync).toBeUndefined();
  });

  it('does not replay a step add whose response was lost', async () => {
    seed(task({ id: 'a', todosText: '' }));
    let posts = 0;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') {
        posts += 1;
        throw new TypeError('connection lost');
      }
      return Response.json({ tasks: Object.values(server) });
    });
    await usePlannerStore.getState().changeSteps('a', { type: 'addStep', text: 'x', milestone: null });
    expect(posts).toBe(1);
    expect(useToastStore.getState().toasts.some((t) => t.action)).toBe(false);
  });
});

describe('quick add', () => {
  it('creates an Inbox row from a title', async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) });
      return Response.json({ task: task({ id: 'real', title: 'Buy milk', stage: 'Inbox' }) });
    });
    await usePlannerStore.getState().addQuickTask('Buy milk');
    expect(writes()[0]).toMatchObject({ url: '/api/tasks', method: 'POST', body: { title: 'Buy milk', stage: 'Inbox', status: 'To Do' } });
    expect(usePlannerStore.getState().tasks.map((t) => t.id)).toEqual(['real']);
  });
});

describe('deleting', () => {
  it('can only discard local drafts and makes no request', () => {
    seed(task({ id: 'temp-1' }), task({ id: 'real' }));
    usePlannerStore.getState().discardDraft('real');
    usePlannerStore.getState().discardDraft('temp-1');
    expect(usePlannerStore.getState().tasks.map((t) => t.id)).toEqual(['real']);
    expect(calls).toEqual([]);
  });
});

describe('background refresh', () => {
  it('does not undo a save with a list read from before it', async () => {
    seed(task({ id: 'a', title: 'old' }));
    await usePlannerStore.getState().saveChange('a', { title: 'new' });
    server.a = task({ id: 'a', title: 'old' });
    await usePlannerStore.getState().fetchTasks({ force: true, background: true });
    expect(row('a').title).toBe('new');
  });

  it('never restores a row flagged pending from the cache', () => {
    const store: Record<string, string> = {
      'planner.tasks.v1.u': JSON.stringify([task({ id: 'a', pendingSync: true })]),
    };
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store[k] ?? null } });
    usePlannerStore.getState().loadCachedTasks('u');
    expect(row('a').pendingSync).toBeUndefined();
  });

  it('does not overwrite the row being edited and offers the change', async () => {
    seed(task({ id: 'a', title: 'typing', lastEditedTime: '1' }));
    server.a = task({ id: 'a', title: 'from bot', lastEditedTime: '2' });
    usePlannerStore.getState().setEditing({ taskId: 'a', field: 'title' });
    await usePlannerStore.getState().fetchTasks({ force: true, background: true });
    expect(row('a').title).toBe('typing');
    usePlannerStore.getState().applyHeldUpdate('a');
    expect(row('a').title).toBe('from bot');
  });

  it('stays quiet about a failed background refresh but flags it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));
    await usePlannerStore.getState().fetchTasks({ force: true, background: true });
    expect(usePlannerStore.getState().syncError).toBe(true);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
