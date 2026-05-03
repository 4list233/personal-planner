export type TaskStatus = 
  | 'Reminders'
  | 'Long Term Deadlines'
  | 'To Do'
  | 'Doing Today'
  | 'Doing Tomorrow'
  | 'Archived';

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
  dueDate?: string;
  dateCreated: string;
  status: TaskStatus;
  daysUntilDue?: number;
  weekday?: Weekday;
  todoItems?: TodoItem[];
  comments?: string[];
  /** Eisenhower flags — user-set */
  important?: boolean;
  urgent?: boolean;
  source?: 'manual' | 'gemini-image' | 'gemini-text';
  queueId?: string;
  isDraft?: boolean;
  /** Local-only flag: server confirmation pending */
  pendingSync?: boolean;
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
