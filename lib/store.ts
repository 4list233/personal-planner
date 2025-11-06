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
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setCurrentView: (view: ViewType) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsModalOpen: (isOpen: boolean) => void;
}

export const usePlannerStore = create<PlannerStore>((set) => ({
  tasks: [],
  currentView: 'board',
  selectedTask: null,
  isModalOpen: false,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) =>
    set((state) => {
      // If dueDate is being updated, recalculate daysUntilDue
      const enhancedUpdates = { ...updates };
      if ('dueDate' in updates) {
        enhancedUpdates.daysUntilDue = calculateDaysUntilDue(updates.dueDate);
      }
      
      const updatedTasks = state.tasks.map((task) =>
        task.id === id ? { ...task, ...enhancedUpdates } : task
      );
      
      // Also update selectedTask if it's the one being updated
      const updatedSelectedTask =
        state.selectedTask?.id === id
          ? { ...state.selectedTask, ...enhancedUpdates }
          : state.selectedTask;
      
      return {
        tasks: updatedTasks,
        selectedTask: updatedSelectedTask,
      };
    }),
  deleteTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== id),
    })),
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
}));
