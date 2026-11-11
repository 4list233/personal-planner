// Which lane a task sits in, and what moving or finishing it writes.
import { columnForTask, statusForStage } from './planner';
import type { Stage, Task, TaskStatus } from './types';

export type MoveTarget = 'today' | 'tomorrow' | 'backlog';
export type Placement = MoveTarget | null;

export const BOARD_LANES = ['Today', 'Tomorrow', 'This Week', 'Inbox', 'Done'] as const;
export type Lane = (typeof BOARD_LANES)[number];

export const COMPLETE_PATCH = { stage: 'Done', status: 'Done' } as const satisfies Partial<Task>;

export interface PriorState {
  stage: Stage | null;
  status: TaskStatus;
}

export const isArchived = (task: Pick<Task, 'status'>) => task.status === 'Archived';

export function isDone(task: Pick<Task, 'status' | 'stage'>): boolean {
  return !isArchived(task) && (task.status === 'Done' || task.stage === 'Done');
}

/** Done or archived: both are finished work, and both sit in the Done lane. */
export function isFinished(task: Pick<Task, 'status' | 'stage'>): boolean {
  return isArchived(task) || isDone(task);
}

export function isOpen(task: Pick<Task, 'status' | 'stage'>): boolean {
  return !isArchived(task) && !isDone(task);
}

const dayKey = (value?: string | null) => (value ? value.slice(0, 10) : null);

export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  // UTC noon keeps a daylight-saving change from shifting the date.
  return new Date(Date.UTC(year, month - 1, date + amount, 12)).toISOString().slice(0, 10);
}

export function placementOf(task: Task, today: string, tomorrow: string): Placement {
  if (!isOpen(task)) return null;
  const planned = dayKey(task.plannedDay);
  // An explicit date for tomorrow beats a leftover Today stage, because the
  // planner bot sets Planned Day without touching Stage.
  if (planned === tomorrow) return 'tomorrow';
  if (planned === today || task.stage === 'Today' || task.status === 'Doing Today') return 'today';
  // Live rows carry Status=Doing Tomorrow with no Planned Day, and the daily
  // rollup promotes them to Doing Today, so they are tomorrow's work.
  if (!planned && task.status === 'Doing Tomorrow') return 'tomorrow';
  return 'backlog';
}

/** Five lanes stand in for Notion's six stages. Every open row lands in exactly one. */
export function laneOf(task: Task, today: string, tomorrow: string): Lane {
  // Archived rows are tasks Forest finished before Done existed as a lane.
  if (isFinished(task)) return 'Done';
  const placement = placementOf(task, today, tomorrow);
  if (placement === 'today') return 'Today';
  if (placement === 'tomorrow') return 'Tomorrow';
  const column = columnForTask(task);
  if (column === 'In Progress') return 'Today';
  if (column === 'This Week' || column === 'Waiting') return 'This Week';
  // Includes rows with a stage the board doesn't know, so nothing can vanish.
  return 'Inbox';
}

export function isOverdue(task: Task, today: string): boolean {
  const due = dayKey(task.dueDate);
  return isOpen(task) && !!due && due < today;
}

function compareInLane(a: Task, b: Task): number {
  const priority = (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9');
  if (priority !== 0) return priority;
  const left = dayKey(a.dueDate);
  const right = dayKey(b.dueDate);
  if (left !== right) {
    if (!left) return 1;
    if (!right) return -1;
    return left < right ? -1 : 1;
  }
  // A fixed tie-break stops equal rows swapping places when a refresh lands.
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

export function selectLanes(tasks: Task[], today: string, tomorrow: string): Record<Lane, Task[]> {
  const lanes: Record<Lane, Task[]> = { Today: [], Tomorrow: [], 'This Week': [], Inbox: [], Done: [] };
  for (const task of tasks) lanes[laneOf(task, today, tomorrow)].push(task);
  lanes.Today.sort(compareInLane);
  lanes.Tomorrow.sort(compareInLane);
  lanes['This Week'].sort(compareInLane);
  lanes.Inbox.sort(compareInLane);
  // Newest first, so what was just finished is on top.
  lanes.Done.sort((a, b) => (b.lastEditedTime ?? '').localeCompare(a.lastEditedTime ?? ''));
  return lanes;
}

export function patchForMove(
  task: Task,
  target: MoveTarget,
  today: string,
  tomorrow: string
): Partial<Task> {
  if (target === 'today') return { plannedDay: today, stage: 'Today', status: statusForStage('Today') };
  if (target === 'tomorrow') {
    // Doing Tomorrow is what the daily rollup promotes the next morning.
    return { plannedDay: tomorrow, stage: 'This Week', status: statusForStage('This Week') };
  }
  const cleared: Task = { ...task, plannedDay: null };
  // Only reset Stage when it alone would keep the row on Today or Tomorrow, so
  // a Waiting task keeps saying what it is waiting for.
  return placementOf(cleared, today, tomorrow) === 'backlog'
    ? { plannedDay: null }
    : { plannedDay: null, stage: 'Inbox', status: statusForStage('Inbox') };
}

/** What dropping a card on a lane writes. Done goes through completeTask instead. */
export function patchForLane(
  task: Task,
  lane: Exclude<Lane, 'Done'>,
  today: string,
  tomorrow: string
): Partial<Task> {
  if (lane === 'Today') return patchForMove(task, 'today', today, tomorrow);
  if (lane === 'Tomorrow') return patchForMove(task, 'tomorrow', today, tomorrow);
  // To Do, not statusForStage: This Week maps to Doing Tomorrow, which would
  // put an unplanned row straight into Tomorrow and get it promoted overnight.
  return { plannedDay: null, stage: lane, status: 'To Do' };
}

/**
 * Notion has no record of where a finished task came from, so the prior state
 * is only known on the device that completed it. Without it, fall back to where
 * the task's own plan says it belongs.
 */
export function reopenPatch(
  task: Task,
  prior: PriorState | null,
  today: string,
  tomorrow: string
): Partial<Task> {
  if (prior && prior.status !== 'Done' && prior.status !== 'Archived' && prior.stage !== 'Done') {
    return { stage: prior.stage, status: prior.status };
  }
  const planned = dayKey(task.plannedDay);
  const stage: Stage = planned === today ? 'Today' : planned === tomorrow ? 'This Week' : 'Inbox';
  return { stage, status: statusForStage(stage) };
}

/**
 * The day an open task is planned for, as the week planner shows it. Rows the
 * board puts on Today or Tomorrow without a date count as that day, so both
 * views agree.
 */
export function plannedFor(task: Task, today: string, tomorrow: string): string | null {
  if (!isOpen(task)) return null;
  const placement = placementOf(task, today, tomorrow);
  if (placement === 'today') return today;
  if (placement === 'tomorrow') return tomorrow;
  return dayKey(task.plannedDay);
}

// The week planner looks this many days ahead. Past it, Stage stays Inbox
// rather than claiming This Week for something weeks away.
const WEEK_DAYS = 7;

/** What dropping a task on a day in the week planner writes. */
export function patchForDay(task: Task, day: string, today: string, tomorrow: string): Partial<Task> {
  if (day === today) return patchForMove(task, 'today', today, tomorrow);
  if (day === tomorrow) return patchForMove(task, 'tomorrow', today, tomorrow);
  // To Do, not Doing Tomorrow: the rollup would promote that the next morning,
  // not on the planned day. On the day itself Planned Day puts it on Today.
  const stage: Stage = day < addDays(today, WEEK_DAYS) ? 'This Week' : 'Inbox';
  return { plannedDay: day, stage, status: 'To Do' };
}

export function daysFrom(start: string, count: number = WEEK_DAYS): string[] {
  return Array.from({ length: count }, (_, offset) => addDays(start, offset));
}

/** Everyone named on any task, with how many open tasks each is on, busiest first. */
export function peopleIn(tasks: Task[]): { name: string; open: number }[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const name of task.people ?? []) {
      counts.set(name, (counts.get(name) ?? 0) + (isOpen(task) ? 1 : 0));
    }
  }
  return [...counts]
    .map(([name, open]) => ({ name, open }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

/** A subtask's @owner names this person: exact, or their first name. */
export function ownerMatches(owner: string | undefined, person: string): boolean {
  if (!owner) return false;
  const want = person.trim().toLowerCase();
  const got = owner.trim().toLowerCase();
  return got === want || want.split(/\s+/)[0] === got;
}
