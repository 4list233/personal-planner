import { create } from 'zustand';
import { Task, ViewType } from './types';

// Auth token getter (set by AuthProvider in the app)
let getAuthTokenFn: (() => Promise<string>) | null = null;

export const setAuthTokenGetter = (fn: () => Promise<string>) => {
  getAuthTokenFn = fn;
};

// Helper to get auth headers with Bearer token
export async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (!getAuthTokenFn) {
    throw new Error('Auth token getter not configured');
  }
  try {
    const token = await getAuthTokenFn();
    headers['Authorization'] = `Bearer ${token}`;
  } catch (error) {
    throw new Error('Failed to get auth token: ' + (error instanceof Error ? error.message : String(error)));
  }
  return headers;
}

// Helper function to calculate days until due
function calculateDaysUntilDue(dueDate?: string): number | undefined {
  if (!dueDate) return undefined;
  
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

interface PlannerStore {
  tasks: Task[];
  currentView: ViewType;
  selectedTask: Task | null;
  isModalOpen: boolean;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => Promise<void> | void;
  submitTask: (id: string) => Promise<void>;
  submitPartial: (id: string, updates: Partial<Task>) => Promise<void>; // persist only provided fields
  setCurrentView: (view: ViewType) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsModalOpen: (isOpen: boolean) => void;
}

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  tasks: [],
  currentView: 'board',
  selectedTask: null,
  isModalOpen: false,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => {
    // Local-only add (drafts allowed). Persistence happens on submitTask.
    set((state) => ({ tasks: [...state.tasks, task] }));
  },
  updateTask: (id, updates) => {
    // If dueDate is being updated, recalculate daysUntilDue
    const enhancedUpdates: Partial<Task> = { ...updates };
    if ('dueDate' in updates) {
      enhancedUpdates.daysUntilDue = calculateDaysUntilDue(updates.dueDate);
    }

    // Optimistic update
    set((state) => {
      const updatedTasks = state.tasks.map((task) =>
        task.id === id ? { ...task, ...enhancedUpdates } : task
      );
      const updatedSelectedTask =
        state.selectedTask?.id === id
          ? { ...state.selectedTask, ...enhancedUpdates }
          : state.selectedTask;
      return { tasks: updatedTasks, selectedTask: updatedSelectedTask };
    });
  },
  submitTask: async (id) => {
    const state = get();
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;

    try {
      if (id.startsWith('temp-')) {
        // Create on server
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            title: task.title,
            dueDate: task.dueDate,
            status: task.status,
            weekday: task.weekday,
            todoItems: task.todoItems || [],
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const created: Task = data.task;
        set({
          tasks: state.tasks.map((t) => (t.id === id ? created : t)),
          selectedTask: state.selectedTask?.id === id ? created : state.selectedTask,
        });
      } else {
        // Update on server (send full task to avoid partial conflicts)
        const { id: _omit, ...payload } = task as any;
        // Basic retry to mitigate transient 409 conflicts
        let attempt = 0;
        let lastErr: any = null;
        let updated: Task | null = null;
        while (attempt < 3 && !updated) {
          try {
            const res = await fetch(`/api/tasks/${id}`, {
              method: 'PUT',
              headers: await getAuthHeaders(),
              body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            updated = data.task as Task;
          } catch (err) {
            lastErr = err;
            attempt += 1;
            if (attempt < 3) await new Promise(r => setTimeout(r, 200 * attempt));
          }
        }
        if (!updated) throw lastErr || new Error('Failed to update task');
        set({
          tasks: state.tasks.map((t) => (t.id === id ? updated! : t)),
          selectedTask: state.selectedTask?.id === id ? updated! : state.selectedTask,
        });
      }
    } catch (e) {
      console.error('Failed to submit task:', e);
    }
  },
  submitPartial: async (id, updates) => {
    // Persist only selected fields (used by drag/drop and calendar moves)
    if (id.startsWith('temp-')) return; // drafts should submit full task
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        console.error('Partial submit failed:', await res.text());
        return;
      }
      const data = await res.json();
      const updated: Task = data.task;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
        selectedTask: state.selectedTask?.id === id ? updated : state.selectedTask,
      }));
    } catch (e) {
      console.error('Partial submit error:', e);
    }
  },
  deleteTask: async (id) => {
    // Optimistic delete
    const prev = get().tasks;
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));

    if (!id.startsWith('temp-')) {
      try {
        const res = await fetch(`/api/tasks/${id}`, { 
          method: 'DELETE',
          headers: await getAuthHeaders(),
        });
        if (!res.ok) {
          console.error('Failed to delete task on server:', await res.text());
        }
      } catch (e) {
        console.error('Failed to delete task on server:', e);
        // Optionally restore on error
        set({ tasks: prev });
      }
    }
  },
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
}));
