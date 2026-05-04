// Daily auto-promotion cron route.
//
// CARRYOVER RULE — DO NOT CHANGE WITHOUT FOREST'S APPROVAL.
// A task in "Doing Today" stays in "Doing Today" until the user manually
// archives it or moves it. The cron NEVER sets status to "Archived" and
// NEVER demotes "Doing Today" back to "To Do". Auto-archive is forbidden.

import { NextRequest, NextResponse } from 'next/server';
import { fetchTasksFromNotion, updateTaskInNotion } from '@/lib/notion';
import { Task, TaskStatus, Weekday } from '@/lib/types';
import { weekdayToDow, WEEKDAY_NAMES } from '@/lib/scheduling';

export const runtime = 'nodejs';

interface PlannedUpdate {
  id: string;
  title: string;
  fromStatus: TaskStatus;
  patch: { status: TaskStatus };
}

function nowInTimezone(tz: string): Date {
  // Reconstruct a Date whose getDay() reflects the given timezone.
  // Intl gives us the date parts; we then build a UTC instant and read
  // .getUTCDay() / .getUTCDate() — but the requirement is a getDay() that
  // matches the wall-clock day in tz, so it's simpler to format the parts
  // and rebuild a local Date.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const map: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
    const iso = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
    return new Date(iso);
  } catch {
    return new Date();
  }
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${expected}`;
}

async function planUpdates(allTasks: Task[], todayDow: number, tomorrowDow: number): Promise<PlannedUpdate[]> {
  const updates: PlannedUpdate[] = [];
  for (const t of allTasks) {
    // CARRYOVER RULE — DO NOT CHANGE WITHOUT FOREST'S APPROVAL.
    if (t.status === 'Archived') continue;
    if (t.status === 'Doing Today') continue; // carryover, no change
    if (t.status === 'Doing Tomorrow') {
      updates.push({
        id: t.id,
        title: t.title,
        fromStatus: t.status,
        patch: { status: 'Doing Today' },
      });
      continue;
    }
    const wDow = weekdayToDow(t.weekday);
    if (wDow === -1) continue;
    if (wDow === todayDow) {
      updates.push({
        id: t.id,
        title: t.title,
        fromStatus: t.status,
        patch: { status: 'Doing Today' },
      });
    } else if (wDow === tomorrowDow) {
      updates.push({
        id: t.id,
        title: t.title,
        fromStatus: t.status,
        patch: { status: 'Doing Tomorrow' },
      });
    }
  }
  return updates;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  let i = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(
      (async () => {
        while (i < items.length) {
          const idx = i++;
          try {
            await worker(items[idx]);
            ok++;
          } catch (e) {
            failed++;
            console.error('cron daily-rollup update failed:', e);
          }
        }
      })()
    );
  }
  await Promise.all(workers);
  return { ok, failed };
}

async function handle(req: NextRequest, dryRun: boolean) {
  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const tz = process.env.USER_TIMEZONE ?? 'America/Toronto';
  const now = nowInTimezone(tz);
  const todayDow = now.getDay();
  const tomorrowDow = (todayDow + 1) % 7;

  const allTasks = await fetchTasksFromNotion();
  const updates = await planUpdates(allTasks, todayDow, tomorrowDow);

  const breakdown: Record<string, number> = {};
  for (const u of updates) {
    breakdown[u.patch.status] = (breakdown[u.patch.status] ?? 0) + 1;
  }

  if (dryRun) {
    return NextResponse.json({
      runAt: now.toISOString(),
      timezone: tz,
      todayWeekday: WEEKDAY_NAMES[todayDow],
      tomorrowWeekday: WEEKDAY_NAMES[tomorrowDow],
      dryRun: true,
      planned: updates.map((u) => ({
        id: u.id,
        title: u.title,
        from: u.fromStatus,
        to: u.patch.status,
      })),
      breakdown,
    });
  }

  const result = await runWithConcurrency(updates, 3, async (u) => {
    // CARRYOVER RULE — DO NOT CHANGE WITHOUT FOREST'S APPROVAL.
    // Defensive: never write "Archived" from the cron, even if a future
    // refactor inadvertently produces such a patch.
    if ((u.patch.status as TaskStatus) === 'Archived') {
      throw new Error('Refusing to set status=Archived from cron');
    }
    await updateTaskInNotion(u.id, u.patch);
  });

  return NextResponse.json({
    runAt: now.toISOString(),
    timezone: tz,
    updated: result.ok,
    failed: result.failed,
    breakdown,
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  return handle(req, dryRun);
}

// GET supports a dry-run for manual testing — same auth required.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  if (!dryRun) {
    return NextResponse.json(
      { error: 'GET only supports dry runs. Use POST or ?dry=1.' },
      { status: 405 }
    );
  }
  return handle(req, true);
}
