import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Task, Weekday } from '@/lib/types';

// Mock the Notion client used inside the route. The handler imports both
// fetchTasksFromNotion and updateTaskInNotion from '@/lib/notion'.
const fetched: Task[] = [];
const updates: Array<{ id: string; patch: any }> = [];

vi.mock('@/lib/notion', () => ({
  fetchTasksFromNotion: vi.fn(async () => fetched),
  updateTaskInNotion: vi.fn(async (id: string, patch: any) => {
    updates.push({ id, patch });
    return { id, ...patch };
  }),
}));

const SECRET = 'test-secret';

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.USER_TIMEZONE = 'UTC';
  fetched.length = 0;
  updates.length = 0;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${SECRET}` };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'status'>): Task {
  return {
    id: partial.id,
    title: partial.id,
    dateCreated: '2026-05-03T12:00:00.000Z',
    status: partial.status,
    weekday: partial.weekday,
  } as Task;
}

async function callRoute(method: 'GET' | 'POST', searchParams: string, headers: HeadersInit) {
  const { POST, GET } = await import('./route');
  const url = `http://localhost/api/cron/daily-rollup${searchParams}`;
  const req = new Request(url, { method, headers }) as any;
  return method === 'POST' ? POST(req) : GET(req);
}

describe('daily-rollup auth', () => {
  it('rejects missing auth with 401', async () => {
    const res = await callRoute('POST', '', {});
    expect(res.status).toBe(401);
  });

  it('rejects wrong secret with 401', async () => {
    const res = await callRoute('POST', '', { Authorization: 'Bearer wrong' });
    expect(res.status).toBe(401);
  });

  it('GET without dry=1 is 405', async () => {
    const res = await callRoute('GET', '', authHeaders());
    expect(res.status).toBe(405);
  });
});

describe('daily-rollup carryover semantics', () => {
  it('Doing Today is left untouched', async () => {
    fetched.push(task({ id: 'a', status: 'Doing Today' }));
    const res = await callRoute('POST', '', authHeaders());
    expect(res.status).toBe(200);
    expect(updates.find((u) => u.id === 'a')).toBeUndefined();
  });

  it('Doing Tomorrow → Doing Today', async () => {
    fetched.push(task({ id: 'b', status: 'Doing Tomorrow' }));
    const res = await callRoute('POST', '', authHeaders());
    expect(res.status).toBe(200);
    const u = updates.find((u) => u.id === 'b');
    expect(u?.patch.status).toBe('Doing Today');
  });

  it('Archived is never written', async () => {
    fetched.push(task({ id: 'c', status: 'Archived' }));
    const res = await callRoute('POST', '', authHeaders());
    expect(res.status).toBe(200);
    expect(updates.find((u) => u.id === 'c')).toBeUndefined();
    expect(updates.every((u) => u.patch.status !== 'Archived')).toBe(true);
  });

  it('weekday matching today promotes To Do → Doing Today', async () => {
    const todayDow = new Date().getUTCDay();
    const WEEK: Weekday[] = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ];
    fetched.push(task({ id: 'd', status: 'To Do', weekday: WEEK[todayDow] }));
    const res = await callRoute('POST', '', authHeaders());
    expect(res.status).toBe(200);
    const u = updates.find((u) => u.id === 'd');
    expect(u?.patch.status).toBe('Doing Today');
  });

  it('weekday matching tomorrow promotes To Do → Doing Tomorrow', async () => {
    const tomorrowDow = (new Date().getUTCDay() + 1) % 7;
    const WEEK: Weekday[] = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ];
    fetched.push(task({ id: 'e', status: 'To Do', weekday: WEEK[tomorrowDow] }));
    const res = await callRoute('POST', '', authHeaders());
    expect(res.status).toBe(200);
    const u = updates.find((u) => u.id === 'e');
    expect(u?.patch.status).toBe('Doing Tomorrow');
  });

  it('dry=1 reports a plan without writing', async () => {
    fetched.push(task({ id: 'f', status: 'Doing Tomorrow' }));
    const res = await callRoute('POST', '?dry=1', authHeaders());
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.dryRun).toBe(true);
    expect(updates.length).toBe(0);
    expect(body.planned.find((p: any) => p.id === 'f')?.to).toBe('Doing Today');
  });
});
