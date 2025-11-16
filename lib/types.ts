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
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

export type ViewType = 'board' | 'weekdays' | 'calendar';

export interface ViewState {
  currentView: ViewType;
  setView: (view: ViewType) => void;
}
