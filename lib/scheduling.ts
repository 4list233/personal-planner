import { Task, TaskStatus, Weekday, Quadrant, quadrantOf } from './types';

/**
 * Pure scheduling primitives for the "Schedule This Week" feature.
 *
 * The algorithm distributes a set of selected tasks across the remaining
 * weekdays in the current week (treating weeks as Sun..Sat, US-style),
 * front-loading urgent items and balancing day load. It is fully
 * deterministic — no Date.now() or randomness — and `today` is always
 * passed in by the caller so it can be unit-tested.
 */

export interface ScheduleAssignment {
  weekday: Weekday;
  status: TaskStatus;
}

export const WEEKDAY_NAMES: Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function weekdayToDow(weekday?: Weekday): number {
  if (!weekday || weekday === 'No Weekdays') return -1;
  const idx = WEEKDAY_NAMES.indexOf(weekday);
  return idx;
}

export function dowToStatus(targetDow: number, todayDow: number): TaskStatus {
  const tomorrowDow = (todayDow + 1) % 7;
  if (targetDow === todayDow) return 'Doing Today';
  if (targetDow === tomorrowDow) return 'Doing Tomorrow';
  return 'To Do';
}

export interface ScheduleOptions {
  /** Maximum tasks per day before overflow placement kicks in. */
  maxPerDay?: number;
  /** IANA timezone — accepted for API symmetry; not used by the pure algo. */
  timezone?: string;
}

/**
 * Distribute selected tasks across remaining weekdays this week.
 *
 * Returns a Map<TaskId, { weekday, status }> ready to feed bulkUpdate().
 *
 * Quadrant placement preferences:
 *   Q1 (urgent + important): today, then tomorrow.
 *   Q3 (urgent only):        today, then tomorrow.
 *   Q2 (important not urgent): all remaining days, prefer earlier.
 *   Q4 (backlog):              all remaining days, fill last.
 *
 * Each placement picks the least-loaded eligible day (ties broken by
 * earlier day-of-week). When every candidate is at maxPerDay we still
 * place the task — overflow lands on the latest candidate to keep the
 * earlier days from getting blown out further.
 */
export function scheduleThisWeek(
  tasks: Task[],
  today: Date,
  options: ScheduleOptions = {}
): Map<string, ScheduleAssignment> {
  const maxPerDay = options.maxPerDay ?? 5;

  const todayDow = today.getDay(); // 0=Sun..6=Sat
  const available: number[] = [];
  for (let d = todayDow; d <= 6; d++) available.push(d);

  const buckets: Record<Quadrant, Task[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const t of tasks) buckets[quadrantOf(t)].push(t);

  const dayLoad = new Map<number, number>(available.map((d) => [d, 0]));
  const assignments = new Map<string, ScheduleAssignment>();

  const placeOnLeastLoaded = (candidates: number[]): number => {
    if (candidates.length === 0) {
      // Fall back to whatever day is available (e.g. Saturday only).
      candidates = available.length > 0 ? available : [todayDow];
    }
    const sorted = [...candidates].sort((a, b) => {
      const la = dayLoad.get(a) ?? Infinity;
      const lb = dayLoad.get(b) ?? Infinity;
      return la === lb ? a - b : la - lb;
    });
    for (const d of sorted) {
      if ((dayLoad.get(d) ?? 0) < maxPerDay) {
        dayLoad.set(d, (dayLoad.get(d) ?? 0) + 1);
        return d;
      }
    }
    // Overflow: place on the latest candidate even if over cap.
    const last = sorted[sorted.length - 1];
    dayLoad.set(last, (dayLoad.get(last) ?? 0) + 1);
    return last;
  };

  // Order matters — earlier buckets compete for today/tomorrow first.
  const orderedBuckets: [Quadrant, number[]][] = [
    ['Q1', available.slice(0, 2)],
    ['Q3', available.slice(0, 2)],
    ['Q2', available],
    ['Q4', available],
  ];

  for (const [q, candidates] of orderedBuckets) {
    for (const t of buckets[q]) {
      const targetDow = placeOnLeastLoaded(candidates);
      const weekday = WEEKDAY_NAMES[targetDow];
      assignments.set(t.id, { weekday, status: dowToStatus(targetDow, todayDow) });
    }
  }

  return assignments;
}

/**
 * Summarize an assignment map: { today, tomorrow, later } — used for the
 * post-schedule toast message.
 */
export function summarizeSchedule(
  assignments: Map<string, ScheduleAssignment>,
  today: Date
): { today: number; tomorrow: number; later: number } {
  const todayDow = today.getDay();
  const tomorrowDow = (todayDow + 1) % 7;
  let t = 0;
  let tom = 0;
  let later = 0;
  for (const a of assignments.values()) {
    const dow = WEEKDAY_NAMES.indexOf(a.weekday);
    if (dow === todayDow) t++;
    else if (dow === tomorrowDow) tom++;
    else later++;
  }
  return { today: t, tomorrow: tom, later };
}
