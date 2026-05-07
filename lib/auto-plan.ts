import {
  Task,
  TaskStatus,
  Weekday,
  Quadrant,
  quadrantOf,
} from './types';
import { todayInUserTz, daysBetweenInUserTz } from './time';
import { WEEKDAY_NAMES, dowToStatus } from './scheduling';

/**
 * Auto-Plan This Week.
 *
 * One-click distribution of eligible tasks across the remaining weekdays
 * (today through Saturday). Quadrant-driven placement biases urgent work
 * earlier and important-but-not-urgent work later in the week, with a
 * Gemini consultation handling Backlog distribution. Pure algorithm —
 * `today` is always passed in.
 */

export interface AutoPlanAssignment {
  weekday: Weekday;
  status: TaskStatus;
}

export interface AutoPlanResult {
  /** Final task → assignment map ready to feed bulkUpdate(). */
  assignments: Map<string, AutoPlanAssignment>;
  /** Final per-day load count keyed by day-of-week (0=Sun). */
  loadByDay: Map<number, number>;
  /** True if Gemini was consulted for the backlog quadrant. */
  geminiConsulted: boolean;
  /** Single-sentence reasoning string returned by Gemini, when available. */
  geminiReasoning?: string;
  /** Task IDs that were placed despite exceeding maxPerDay. */
  overflow: string[];
  /** Task IDs that were filtered out entirely (e.g. Doing Today / out-of-week). */
  skipped: string[];
}

export interface AutoPlanOptions {
  tasks: Task[];
  today: Date;
  maxPerDay?: number;
  /** IANA timezone — defaults to the configured user TZ. Tests pin to UTC. */
  timezone?: string;
  /**
   * When provided, the algorithm consults Gemini for backlog distribution.
   * The function should accept a JSON-serializable payload and return the
   * parsed JSON response.
   */
  callGemini?: (payload: GeminiBacklogPayload) => Promise<GeminiBacklogResponse>;
  /**
   * When non-empty, only these task IDs are planned and eligibility checks
   * relating to existing weekday / status are relaxed (the user explicitly
   * picked them).
   */
  selectedTaskIds?: ReadonlySet<string>;
}

export interface GeminiBacklogPayload {
  today: string; // YYYY-MM-DD
  todayDayName: Weekday;
  availableDays: Weekday[];
  maxPerDay: number;
  currentLoad: Partial<Record<Weekday, number>>;
  backlogTasks: { taskId: string; title: string }[];
}

export interface GeminiBacklogResponse {
  assignments: { taskId: string; day: Weekday }[];
  overflow: string[];
  reasoning?: string;
}

const DAY_TO_NAME: Weekday[] = WEEKDAY_NAMES;

function nameToDow(name: Weekday): number {
  return WEEKDAY_NAMES.indexOf(name);
}

function isLockedStatus(s: TaskStatus): boolean {
  return s === 'Archived' || s === 'Doing Today' || s === 'Doing Tomorrow';
}

export async function autoPlanThisWeek(opts: AutoPlanOptions): Promise<AutoPlanResult> {
  const maxPerDay = opts.maxPerDay ?? 5;
  const todayYmd = opts.timezone
    ? todayInUserTz(opts.today, opts.timezone)
    : todayInUserTz(opts.today);
  // Derive day-of-week from todayYmd so the dow and the dueDate-delta math
  // share the same timezone anchor.
  const [yy, mm, dd] = todayYmd.split('-').map(Number);
  const todayDow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
  const available: number[] = [];
  for (let d = todayDow; d <= 6; d++) available.push(d);

  const isUserSelection = !!opts.selectedTaskIds && opts.selectedTaskIds.size > 0;
  const selected = opts.selectedTaskIds;

  const skipped: string[] = [];

  // 1. Eligibility filter.
  const eligible = opts.tasks.filter((t) => {
    if (isUserSelection) {
      if (!selected!.has(t.id)) {
        skipped.push(t.id);
        return false;
      }
      // Selection overrides "don't disturb" rules — user explicitly opted in.
      return true;
    }
    if (isLockedStatus(t.status)) {
      skipped.push(t.id);
      return false;
    }
    if (t.weekday && t.weekday !== 'No Weekdays') {
      // Don't overwrite an explicit user-set day on a non-selection run.
      skipped.push(t.id);
      return false;
    }
    return true;
  });

  // 2. Apply hard dueDate constraints first.
  const dueDateAssignments = new Map<string, number>(); // taskId → dow
  const remaining: Task[] = [];
  for (const t of eligible) {
    if (!t.dueDate) {
      remaining.push(t);
      continue;
    }
    const dueYmd = t.dueDate.slice(0, 10);
    const delta = daysBetweenInUserTz(todayYmd, dueYmd);
    if (Number.isNaN(delta)) {
      remaining.push(t);
      continue;
    }
    if (delta < 0) {
      dueDateAssignments.set(t.id, todayDow); // overdue → today
    } else if (delta <= 6 - todayDow) {
      dueDateAssignments.set(t.id, (todayDow + delta) % 7); // in-week → on that day
    } else {
      // Out-of-week: skip auto-planning.
      skipped.push(t.id);
    }
  }

  // 3. Track load per day.
  const load = new Map<number, number>(available.map((d) => [d, 0]));
  for (const dow of dueDateAssignments.values()) {
    load.set(dow, (load.get(dow) ?? 0) + 1);
  }

  const overflow: string[] = [];
  const placeOn = (dow: number, taskId: string, allowOverflow: boolean) => {
    const current = load.get(dow) ?? 0;
    if (current >= maxPerDay && allowOverflow) overflow.push(taskId);
    load.set(dow, current + 1);
  };

  const assignments = new Map<string, { dow: number }>();
  for (const [id, dow] of dueDateAssignments) assignments.set(id, { dow });

  // 4. Quadrant-driven placement.
  const buckets: Record<Quadrant, Task[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
  for (const t of remaining) {
    if (assignments.has(t.id)) continue;
    buckets[quadrantOf(t)].push(t);
  }

  const earliest = available;
  const lateHalf =
    available.length > 1
      ? available.slice(Math.floor(available.length * 0.4))
      : available;

  const pickLeastLoaded = (candidates: number[]): number | null => {
    const sorted = [...candidates].sort((a, b) => {
      const la = load.get(a) ?? 0;
      const lb = load.get(b) ?? 0;
      if (la !== lb) return la - lb;
      return a - b;
    });
    for (const d of sorted) {
      if ((load.get(d) ?? 0) < maxPerDay) return d;
    }
    return null;
  };

  const assignBucket = (bucketTasks: Task[], candidates: number[]) => {
    for (const t of bucketTasks) {
      const target = pickLeastLoaded(candidates);
      if (target === null) {
        // Overflow — drop on latest candidate even if over cap.
        const last = candidates[candidates.length - 1] ?? todayDow;
        assignments.set(t.id, { dow: last });
        placeOn(last, t.id, true);
      } else {
        assignments.set(t.id, { dow: target });
        placeOn(target, t.id, false);
      }
    }
  };

  // Order: Q1 (urgent + important) → earliest; Q3 (urgent only) → earliest;
  // Q2 (important only) → late half. Backlog handled separately below.
  assignBucket(buckets.Q1, earliest);
  assignBucket(buckets.Q3, earliest);
  assignBucket(buckets.Q2, lateHalf);

  // 5. Backlog (Q4) — Gemini-consulted balancing, with deterministic fallback.
  let geminiReasoning: string | undefined;
  let geminiConsulted = false;
  if (buckets.Q4.length > 0 && opts.callGemini) {
    try {
      const currentLoadByName: Partial<Record<Weekday, number>> = {};
      for (const dow of available) {
        currentLoadByName[DAY_TO_NAME[dow]] = load.get(dow) ?? 0;
      }
      const payload: GeminiBacklogPayload = {
        today: todayYmd,
        todayDayName: DAY_TO_NAME[todayDow],
        availableDays: available.map((d) => DAY_TO_NAME[d]),
        maxPerDay,
        currentLoad: currentLoadByName,
        backlogTasks: buckets.Q4.map((t) => ({ taskId: t.id, title: t.title })),
      };
      const result = await opts.callGemini(payload);
      geminiConsulted = true;
      geminiReasoning = result.reasoning;

      const placedByGemini = new Set<string>();
      for (const a of result.assignments ?? []) {
        const dow = nameToDow(a.day);
        if (dow < 0 || !available.includes(dow)) continue;
        assignments.set(a.taskId, { dow });
        placeOn(dow, a.taskId, false);
        placedByGemini.add(a.taskId);
      }

      // Anything Gemini explicitly punted, plus anything it forgot, lands
      // on the least-loaded day even past cap.
      const leftovers = new Set<string>(result.overflow ?? []);
      for (const t of buckets.Q4) {
        if (!placedByGemini.has(t.id)) leftovers.add(t.id);
      }
      for (const id of leftovers) {
        if (assignments.has(id)) continue;
        const sorted = [...available].sort(
          (a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0) || a - b
        );
        const target = sorted[0] ?? todayDow;
        assignments.set(id, { dow: target });
        placeOn(target, id, true);
      }
    } catch {
      // Network / parse failure → deterministic fallback.
      assignBucket(buckets.Q4, available);
    }
  } else {
    assignBucket(buckets.Q4, available);
  }

  // 6. Convert dow → weekday name + status.
  const final = new Map<string, AutoPlanAssignment>();
  for (const [id, { dow }] of assignments) {
    final.set(id, {
      weekday: DAY_TO_NAME[dow],
      status: dowToStatus(dow, todayDow),
    });
  }

  return {
    assignments: final,
    loadByDay: load,
    geminiConsulted,
    geminiReasoning,
    overflow,
    skipped,
  };
}

/**
 * Summarize the assignment map for a post-plan toast: today / tomorrow / later.
 */
export function summarizeAutoPlan(
  result: AutoPlanResult,
  today: Date
): { today: number; tomorrow: number; later: number; total: number } {
  const todayDow = today.getDay();
  const tomorrowDow = (todayDow + 1) % 7;
  let t = 0;
  let tom = 0;
  let later = 0;
  for (const a of result.assignments.values()) {
    const dow = WEEKDAY_NAMES.indexOf(a.weekday);
    if (dow === todayDow) t++;
    else if (dow === tomorrowDow) tom++;
    else later++;
  }
  return { today: t, tomorrow: tom, later, total: t + tom + later };
}
