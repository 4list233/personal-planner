import { create } from 'zustand';
import { Task, ViewType } from './types';

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
  addTask: (task: Task) => Promise<void> | void;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void> | void;
  deleteTask: (id: string) => Promise<void> | void;
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
  addTask: async (task) => {
    // Optimistic add
    set((state) => ({ tasks: [...state.tasks, task] }));

    // If this is a temporary task, attempt to persist via API and replace it
    if (task.id.startsWith('temp-')) {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            dueDate: task.dueDate,
            status: task.status,
            weekday: task.weekday,
            todoItems: task.todoItems || [],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const created: Task = data.task;
          // Replace temp with created
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === task.id ? created : t)),
            selectedTask: state.selectedTask?.id === task.id ? created : state.selectedTask,
          }));
        } else {
          console.error('Failed to persist new task:', await res.text());
        }
      } catch (e) {
        console.error('Failed to persist new task:', e);
      }
    }
  },
  updateTask: async (id, updates) => {
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

    // Persist to server if not a temp id
    if (!id.startsWith('temp-')) {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(enhancedUpdates),
        });
        if (res.ok) {
          const data = await res.json();
          const updated: Task = data.task;
          set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
            selectedTask: state.selectedTask?.id === id ? updated : state.selectedTask,
          }));
        } else {
          console.error('Failed to sync update:', await res.text());
        }
      } catch (e) {
        console.error('Failed to sync update:', e);
      }
    }
  },
  deleteTask: async (id) => {
    // Optimistic delete
    const prev = get().tasks;
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));

    if (!id.startsWith('temp-')) {
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
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
