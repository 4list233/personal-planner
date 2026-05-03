import { create } from 'zustand';
import { Task, ViewType } from './types';
import { toast } from './toast';

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

  // Parse date as local timezone to avoid off-by-one errors
  const dateStr = dueDate.split('T')[0]; // Get YYYY-MM-DD part
  const [year, month, day] = dateStr.split('-').map(Number);
  const due = new Date(year, month - 1, day); // Month is 0-indexed

  const now = new Date();
  now.setHours(0, 0, 0, 0); // Reset to start of day for accurate comparison

  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

// Normalize a user-provided date. Reject malformed years (>4 digits) and
// clamp to [1970-01-01, 2100-12-31] to keep Notion happy.
function normalizeDate(input?: string): { value?: string; error?: string } {
  if (input === undefined) return {};
  if (input === '') return { value: undefined };
  const datePart = input.split('T')[0];
  const m = /^(-?\d+)-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return { error: 'Invalid date' };
  const yearStr = m[1];
  if (yearStr.length > 4 || yearStr.startsWith('-')) return { error: 'Year must be 4 digits' };
  const y = Number(yearStr);
  if (!Number.isFinite(y)) return { error: 'Invalid year' };
  if (y < 1970) return { value: '1970-01-01' };
  if (y > 2100) return { value: '2100-12-31' };
  return { value: `${yearStr.padStart(4, '0')}-${m[2]}-${m[3]}` };
}

// HTTP retry policy: only retry on 409 (Notion conflict). Optionally one
// retry on 408/425/429 (transient) and one on 5xx. Validation errors (4xx
// other than the above) are NOT retried.
function shouldRetry(status: number, attempt: number): boolean {
  if (status === 409) return attempt < 3; // up to 3 attempts on conflict
  if (status === 408 || status === 425 || status === 429) return attempt < 2;
  if (status >= 500 && status < 600) return attempt < 2;
  return false;
}

interface RequestFailure {
  status: number;
  body: string;
}

async function attemptFetch(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: any } | { ok: false; failure: RequestFailure }> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      return { ok: false, failure: { status: 0, body: 'Network error' } };
    }
    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
    const body = await res.text().catch(() => res.statusText);
    if (shouldRetry(res.status, attempt)) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
      continue;
    }
    return { ok: false, failure: { status: res.status, body } };
  }
}

interface PlannerStore {
  tasks: Task[];
  currentView: ViewType;
  selectedTask: Task | null;
  isModalOpen: boolean;
  /** Multi-selection set used by the Matrix view. */
  selectedTaskIds: Set<string>;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => Promise<void> | void;
  submitTask: (id: string) => Promise<void>;
  submitPartial: (id: string, updates: Partial<Task>) => Promise<void>; // persist only provided fields
  setCurrentView: (view: ViewType) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  bulkUpdate: (
    updates: Array<{ id: string; patch: Partial<Task> }>,
    opts?: { concurrency?: number }
  ) => Promise<{ ok: number; failed: number }>;
}

function setPendingSync(taskId: string, pending: boolean) {
  usePlannerStore.setState((state) => ({
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, pendingSync: pending || undefined } : t)),
    selectedTask:
      state.selectedTask?.id === taskId
        ? { ...state.selectedTask, pendingSync: pending || undefined }
        : state.selectedTask,
  }));
}

function showSaveError(title: string, retry: () => void | Promise<void>, status: number) {
  // 4xx validation errors usually aren't retry-able — surface a different message.
  const isValidation = status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429 && status !== 409;
  if (isValidation) {
    toast.error(`Couldn't save '${title}' — invalid data (${status}).`);
  } else {
    toast.error(`Couldn't save '${title}'. Retry?`, {
      label: 'Retry',
      onClick: retry,
    });
  }
}

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  tasks: [],
  currentView: 'board',
  selectedTask: null,
  isModalOpen: false,
  selectedTaskIds: new Set<string>(),
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => {
    set((state) => ({ tasks: [...state.tasks, task] }));
  },
  updateTask: (id, updates) => {
    const enhancedUpdates: Partial<Task> = { ...updates };
    if ('dueDate' in updates) {
      const { value, error } = normalizeDate(updates.dueDate);
      if (error) {
        toast.error(`Invalid date: ${error}`);
        return;
      }
      enhancedUpdates.dueDate = value;
      enhancedUpdates.daysUntilDue = calculateDaysUntilDue(value);
    }

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

    setPendingSync(id, true);

    try {
      if (id.startsWith('temp-')) {
        const headers = await getAuthHeaders();
        const result = await attemptFetch('/api/tasks', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: task.title,
            dueDate: task.dueDate,
            status: task.status,
            weekday: task.weekday,
            todoItems: task.todoItems || [],
            comments: task.comments || [],
            important: (task as any).important ?? false,
            urgent: (task as any).urgent ?? false,
          }),
        });
        if (!result.ok) {
          showSaveError(task.title, () => get().submitTask(id), result.failure.status);
          setPendingSync(id, false);
          return;
        }
        const created: Task = result.data.task;
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...created, pendingSync: undefined } : t)),
          selectedTask:
            get().selectedTask?.id === id ? { ...created, pendingSync: undefined } : get().selectedTask,
        });
      } else {
        const { id: _omit, pendingSync: _ps, ...payload } = task as any;
        const headers = await getAuthHeaders();
        const result = await attemptFetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
        if (!result.ok) {
          showSaveError(task.title, () => get().submitTask(id), result.failure.status);
          setPendingSync(id, false);
          return;
        }
        const updated: Task = result.data.task;
        set({
          tasks: get().tasks.map((t) => (t.id === id ? { ...updated, pendingSync: undefined } : t)),
          selectedTask:
            get().selectedTask?.id === id ? { ...updated, pendingSync: undefined } : get().selectedTask,
        });
      }
    } catch (e) {
      console.error('Failed to submit task:', e);
      toast.error(`Couldn't save '${task.title}'. Retry?`, {
        label: 'Retry',
        onClick: () => get().submitTask(id),
      });
      setPendingSync(id, false);
    }
  },
  submitPartial: async (id, updates) => {
    if (id.startsWith('temp-')) return;
    const task = get().tasks.find((t) => t.id === id);
    setPendingSync(id, true);
    try {
      const headers = await getAuthHeaders();
      const result = await attemptFetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });
      if (!result.ok) {
        showSaveError(task?.title ?? 'task', () => get().submitPartial(id, updates), result.failure.status);
        setPendingSync(id, false);
        return;
      }
      const updated: Task = result.data.task;
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...updated, pendingSync: undefined } : t)),
        selectedTask: state.selectedTask?.id === id ? { ...updated, pendingSync: undefined } : state.selectedTask,
      }));
    } catch (e) {
      console.error('Partial submit error:', e);
      toast.error(`Couldn't save '${task?.title ?? 'task'}'. Retry?`, {
        label: 'Retry',
        onClick: () => get().submitPartial(id, updates),
      });
      setPendingSync(id, false);
    }
  },
  deleteTask: async (id) => {
    const prev = get().tasks;
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));

    if (!id.startsWith('temp-')) {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE', headers });
        if (!res.ok) {
          console.error('Failed to delete task on server:', await res.text());
          toast.error('Failed to delete task on server.');
          set({ tasks: prev });
        }
      } catch (e) {
        console.error('Failed to delete task on server:', e);
        toast.error('Failed to delete task on server.');
        set({ tasks: prev });
      }
    }
  },
  setCurrentView: (view) => set({ currentView: view }),
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedTaskIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedTaskIds: next };
    }),
  clearSelection: () => set({ selectedTaskIds: new Set<string>() }),
  bulkUpdate: async (updates, opts = {}) => {
    const concurrency = Math.max(1, opts.concurrency ?? 3);
    let ok = 0;
    let failed = 0;
    let i = 0;

    // Mark all targeted tasks pending up-front for visual feedback.
    set((state) => ({
      tasks: state.tasks.map((t) =>
        updates.some((u) => u.id === t.id) ? { ...t, pendingSync: true } : t
      ),
    }));

    const runOne = async (u: { id: string; patch: Partial<Task> }) => {
      try {
        const headers = await getAuthHeaders();
        const result = await attemptFetch(`/api/tasks/${u.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(u.patch),
        });
        if (!result.ok) {
          failed++;
          setPendingSync(u.id, false);
          return;
        }
        const updated: Task = result.data.task;
        ok++;
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === u.id ? { ...updated, pendingSync: undefined } : t
          ),
          selectedTask:
            state.selectedTask?.id === u.id
              ? { ...updated, pendingSync: undefined }
              : state.selectedTask,
        }));
      } catch {
        failed++;
        setPendingSync(u.id, false);
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(
        (async () => {
          while (i < updates.length) {
            const idx = i++;
            await runOne(updates[idx]);
          }
        })()
      );
    }
    await Promise.all(workers);
    return { ok, failed };
  },
}));
