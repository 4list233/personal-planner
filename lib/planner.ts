import { parseSteps } from './steps';
import { daysUntilDueInUserTz } from './time';
import type {
  Bucket,
  Priority,
  ProjectName,
  Stage,
  Task,
  TaskStatus,
  TodoItem,
  Weekday,
} from './types';

/** Signed-in owner of this single-user planner. Empty User Email rows belong to them. */
export const PLANNER_OWNER_EMAIL = 'forestli009@gmail.com';

export const BOARD_COLUMNS = [
  'Inbox',
  'This Week',
  'Today',
  'In Progress',
  'Waiting',
  'Unsorted',
  'Done',
] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

const BOARD_STAGE_SET = new Set<string>([
  'Inbox',
  'This Week',
  'Today',
  'In Progress',
  'Waiting',
]);

const WEEKDAYS = new Set<string>([
  'No Weekdays',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);

const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
const UNSET_PRIORITY_RANK = 3;

export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const BR_TAG = /<br\s*\/?>/gi;

export function isPlannerOwner(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === PLANNER_OWNER_EMAIL;
}

export function stageFromStatus(status?: string | null): Stage | null {
  switch (status) {
    case 'To Do':
      return 'Inbox';
    case 'Doing Tomorrow':
      return 'This Week';
    case 'Doing Today':
      return 'Today';
    case 'Blocked':
    case 'Reminders':
      return 'Waiting';
    case 'Long Term Deadlines':
      return 'Inbox';
    case 'Done':
    case 'Archived':
      return 'Done';
    default:
      return null;
  }
}

export function statusForStage(stage: Stage): TaskStatus {
  switch (stage) {
    case 'Inbox':
      return 'To Do';
    case 'This Week':
      return 'Doing Tomorrow';
    case 'Today':
      return 'Doing Today';
    case 'Waiting':
      return 'Blocked';
    case 'In Progress':
      // No legacy status means "in progress". Doing Today is the closest
      // active status, and the daily rollup leaves Doing Today alone.
      return 'Doing Today';
    case 'Done':
      return 'Done';
  }
}

export function columnForTask(task: {
  stage?: string | null;
  status?: string | null;
}): BoardColumn | null {
  // Checked first: archived rows can still carry a Stage such as Waiting.
  if (task.status === 'Archived') return null;
  const stage = typeof task.stage === 'string' ? task.stage.trim() : '';
  if (stage === 'Done') return 'Done';
  if (stage && BOARD_STAGE_SET.has(stage)) return stage as BoardColumn;
  if (stage) return 'Unsorted';

  const derived = stageFromStatus(task.status);
  if (!derived) return 'Unsorted';
  return derived;
}

function dateKey(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : value;
}

function compareOptionalDate(a?: string | null, b?: string | null): number {
  const left = dateKey(a);
  const right = dateKey(b);
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left < right ? -1 : 1;
}

export function compareBoardTasks(a: Partial<Task>, b: Partial<Task>): number {
  const priority =
    (a.priority ? (PRIORITY_RANK[a.priority] ?? UNSET_PRIORITY_RANK) : UNSET_PRIORITY_RANK) -
    (b.priority ? (PRIORITY_RANK[b.priority] ?? UNSET_PRIORITY_RANK) : UNSET_PRIORITY_RANK);
  if (priority !== 0) return priority;
  const planned = compareOptionalDate(a.plannedDay, b.plannedDay);
  if (planned !== 0) return planned;
  return compareOptionalDate(a.dueDate, b.dueDate);
}

export function isStale(lastEditedTime?: string | null, now = Date.now()): boolean {
  if (!lastEditedTime) return false;
  const edited = Date.parse(lastEditedTime);
  if (Number.isNaN(edited)) return false;
  return now - edited >= STALE_AFTER_MS;
}

export function splitRichLines(raw: string): string[] {
  return raw
    .replace(BR_TAG, '\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseTodosText(raw: string, idPrefix = 'todo'): TodoItem[] {
  return parseSteps(raw || '')
    .filter((line) => line.kind === 'step')
    .map((line, index) => ({ id: `${idPrefix}-${index}`, text: line.body, completed: line.completed }));
}

/** Only for brand-new rows. Existing Todos are edited line by line in steps.ts. */
export function formatTodosText(items: TodoItem[]): string {
  return items.map((item) => `- [${item.completed ? 'x' : ' '}] ${item.text}`).join('\n');
}

export function userEmailQueryFilter(userEmail?: string) {
  if (!userEmail) return undefined;
  if (!isPlannerOwner(userEmail)) {
    return {
      property: 'User Email',
      email: { equals: userEmail },
    };
  }
  const clauses = [
    { property: 'User Email', email: { equals: PLANNER_OWNER_EMAIL } },
    { property: 'User Email', email: { is_empty: true } },
  ];
  const raw = userEmail.trim();
  if (raw.toLowerCase() !== PLANNER_OWNER_EMAIL) {
    clauses.unshift({ property: 'User Email', email: { equals: raw } });
  }
  return { or: clauses };
}

export function rowVisibleToUser(rowEmail?: string | null, userEmail?: string): boolean {
  if (!userEmail) return true;
  const row = (rowEmail || '').trim().toLowerCase();
  if (!row) return isPlannerOwner(userEmail);
  return row === userEmail.trim().toLowerCase();
}

export interface NotionPageLike {
  id: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, any>;
}

function richTextPlain(prop: any): string {
  const parts = prop?.rich_text;
  if (Array.isArray(parts)) {
    return parts.map((part) => part?.plain_text || '').join('');
  }
  return '';
}

function multiNames(prop: any): string[] {
  const options = prop?.multi_select;
  if (!Array.isArray(options)) return [];
  return options.map((option) => option?.name).filter((name): name is string => typeof name === 'string' && !!name.trim());
}

function selectName(prop: any): string | undefined {
  const name = prop?.select?.name;
  return typeof name === 'string' && name.trim() ? name : undefined;
}

function dateStart(prop: any): string | undefined {
  const start = prop?.date?.start;
  return typeof start === 'string' && start ? start : undefined;
}

function knownWeekday(name?: string): Weekday {
  if (name && WEEKDAYS.has(name)) return name as Weekday;
  return 'No Weekdays';
}

export function taskFromNotionPage(page: NotionPageLike): Task {
  const props = page.properties || {};
  const titleParts = props.Name?.title || props.name?.title;
  const title =
    (Array.isArray(titleParts) ? titleParts.map((part: any) => part?.plain_text || '').join('') : '') ||
    'Untitled';

  const statusName = selectName(props.Status);
  const status = (statusName as TaskStatus) || 'To Do';
  const dueDate = dateStart(props['Due Date']) || dateStart(props.Due);
  const plannedDay = dateStart(props['Planned Day']);
  const stage = selectName(props.Stage) as Stage | undefined;
  const priority = selectName(props.Priority) as Priority | undefined;
  const project = selectName(props.Project) as ProjectName | undefined;
  const bucket = selectName(props.Bucket) as Bucket | undefined;
  const email = props['User Email']?.email;
  const userEmail = typeof email === 'string' && email.trim() ? email.trim() : undefined;
  const todoText = richTextPlain(props.Todos || props['To-dos']);
  const commentText = richTextPlain(props.Comments || props.Notes);

  return {
    id: page.id,
    title,
    dueDate,
    plannedDay,
    dateCreated: page.created_time || new Date(0).toISOString(),
    lastEditedTime: page.last_edited_time,
    status,
    stage,
    priority,
    project,
    bucket,
    weekday: knownWeekday(selectName(props.Weekdays || props.Weekday)),
    daysUntilDue: daysUntilDueInUserTz(dueDate),
    todoItems: parseTodosText(todoText, `${page.id}-todo`),
    todosText: todoText,
    comments: splitRichLines(commentText),
    commentsText: commentText,
    nextAction: richTextPlain(props['Next Action']) || undefined,
    sourceText: richTextPlain(props.Source) || undefined,
    waitingOn: richTextPlain(props['Waiting On']) || undefined,
    people: multiNames(props.People),
    important: props.Important?.checkbox === true || props.important?.checkbox === true,
    urgent: props.Urgent?.checkbox === true || props.urgent?.checkbox === true,
    userEmail,
  };
}

export function richTextRequest(content: string) {
  if (!content) return [];
  const chunks = [];
  const size = 2000;
  for (let i = 0; i < content.length; i += size) {
    chunks.push({
      type: 'text' as const,
      text: { content: content.slice(i, i + size) },
    });
  }
  return chunks;
}
