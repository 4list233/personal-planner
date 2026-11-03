export type TaskStatus =
  | 'Reminders'
  | 'Long Term Deadlines'
  | 'To Do'
  | 'Doing Today'
  | 'Doing Tomorrow'
  | 'Archived'
  | 'Done'
  | 'Blocked';

export type Stage =
  | 'Inbox'
  | 'This Week'
  | 'Today'
  | 'In Progress'
  | 'Waiting'
  | 'Done';

export type Priority = 'P1' | 'P2' | 'P3';

export type ProjectName = 'Velox' | 'School' | 'Personal' | 'Leads' | 'Other';

export type Bucket = 'Mine' | 'Dispatch' | 'Follow-up' | 'Watch' | 'Long-term';

export type Weekday = 
  | 'No Weekdays'
  | 'Sunday'
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday';

export interface Task {
  id: string;
  title: string;
  dueDate?: string | null;
  dateCreated: string;
  status: TaskStatus;
  daysUntilDue?: number;
  weekday?: Weekday;
  todoItems?: TodoItem[];
  comments?: string[];
  /** Eisenhower flags — user-set */
  important?: boolean;
  urgent?: boolean;
  /** Local import source. The Notion "Source" property is `sourceText`. */
  source?: 'manual' | 'gemini-image' | 'gemini-text';
  queueId?: string;
  isDraft?: boolean;
  /** Local-only flag: server confirmation pending */
  pendingSync?: boolean;
  /** New planner fields. All optional so rows written before the schema change still load. */
  stage?: Stage | null;
  priority?: Priority | null;
  project?: ProjectName | null;
  bucket?: Bucket | null;
  plannedDay?: string | null;
  nextAction?: string | null;
  sourceText?: string | null;
  waitingOn?: string | null;
  lastEditedTime?: string;
  userEmail?: string;
  /**
   * Local-only. False means a save may update the Todos property but must not
   * rewrite page to-do blocks (the block list was never loaded).
   */
  syncChecklist?: boolean;
}

export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';
// Q1 = important + urgent
// Q2 = important + !urgent
// Q3 = !important + urgent
// Q4 = !important + !urgent

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  Q1: 'Do First',
  Q2: 'Schedule',
  Q3: 'Delegate / Quick',
  Q4: 'Backlog',
};

export function quadrantOf(task: Pick<Task, 'important' | 'urgent'>): Quadrant {
  const i = task.important === true;
  const u = task.urgent === true;
  if (i && u) return 'Q1';
  if (i && !u) return 'Q2';
  if (!i && u) return 'Q3';
  return 'Q4';
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export type ViewType = 'board' | 'weekdays' | 'calendar' | 'matrix';

export interface ViewState {
  currentView: ViewType;
  setView: (view: ViewType) => void;
}
