import { Task } from './types';

export interface ParsedTask {
  task: Task;
  date: Date;
}

/**
 * Filter tasks for safe rendering on FullCalendar.
 *
 * - Drops tasks with no dueDate.
 * - Drops tasks whose dueDate cannot be parsed.
 * - Drops tasks whose year falls outside [1970..2100] — these would either
 *   crash FullCalendar or daysUntilDue logic and are surfaced separately.
 * - Drops tasks whose daysUntilDue is NaN or beyond [-365..365] — we collect
 *   these as "out of sane range".
 */
export function partitionTasksForCalendar(tasks: Task[]): {
  valid: ParsedTask[];
  outOfSaneRange: Task[];
} {
  const valid: ParsedTask[] = [];
  const outOfSaneRange: Task[] = [];

  for (const t of tasks) {
    if (!t.dueDate) continue;
    const d = new Date(t.dueDate);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    if (y < 1970 || y > 2100) {
      outOfSaneRange.push(t);
      continue;
    }
    const days = t.daysUntilDue;
    if (days !== undefined && (Number.isNaN(days) || days < -365 || days > 365)) {
      outOfSaneRange.push(t);
      continue;
    }
    valid.push({ task: t, date: d });
  }

  return { valid, outOfSaneRange };
}
