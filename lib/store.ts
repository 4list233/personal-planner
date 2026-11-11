import { create } from 'zustand';
import type { Task } from './types';
import { toast, useToastStore } from './toast';
import { daysUntilDueInUserTz, todayInUserTz } from './time';
import { applyStepOp, StepConflictError, type StepOp } from './steps';
import { mergeIncoming } from './sync';
import {
  addDays,
  COMPLETE_PATCH,
  isArchived,
  isDone,
  patchForMove,
  reopenPatch,
  type MoveTarget,
  type PriorState,
  isFinished,
} from './views';

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

// Normalize a user-provided date. Reject malformed years (>4 digits) and
// clamp to [1970-01-01, 2100-12-31] to keep Notion happy.
function normalizeDate(input?: string | null): { value?: string; error?: string } {
  if (input === undefined || input === null) return {};
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

type FetchResult = { ok: true; data: any } | { ok: false; failure: RequestFailure };

// Creating a row or editing a step isn't safe to replay: if Notion applied it
// and only the response was lost, a replay applies it twice. A 429 is the one
// answer that proves the request was refused.
const retryOnlyIfRefused = (status: number, attempt: number) => status === 429 && attempt < 2;

async function attemptFetch(
  url: string,
  init: RequestInit,
  retry: (status: number, attempt: number) => boolean = shouldRetry,
  retryNetworkError = true
): Promise<FetchResult> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      if (retryNetworkError && attempt < 2) {
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
    if (retry(res.status, attempt)) {
      await new Promise((r) => setTimeout(r, 200 * attempt));
      continue;
    }
    return { ok: false, failure: { status: res.status, body } };
  }
}

export interface EditingField {
  taskId: string;
  field: string;
}

interface PlannerStore {
  tasks: Task[];
  selectedTask: Task | null;
  isModalOpen: boolean;
  /** Row open in the detail popup. Mirrored to ?task=<id>. */
  detailTaskId: string | null;
  /** The field being typed in, which a background refresh must leave alone. */
  editing: EditingField | null;
  /** Newer copies of the row being edited, held until the user asks for them. */
  heldUpdates: Record<string, Task>;
  focusedTaskId: string | null;
  /** Rows in on-screen order, for j/k. */
  visibleTaskIds: string[];
  isFetching: boolean;
  /** Epoch ms of the last successful fetch — used to skip recent refetches. */
  lastFetchedAt: number | null;
  syncError: boolean;
  /** Epoch ms of each row's last confirmed save, so an older read can't undo it. */
  savedAt: Record<string, number>;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  /** Removes an unsaved local draft. Never touches Notion. */
  discardDraft: (id: string) => void;
  submitTask: (id: string) => Promise<void>;
  /** Creates a row in Inbox from just a title. */
  addQuickTask: (title: string) => Promise<void>;
  /** Apply a change on screen, write it to Notion, undo it on screen if that fails. */
  saveChange: (id: string, patch: Partial<Task>) => Promise<boolean>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  moveTask: (id: string, target: MoveTarget) => Promise<void>;
  changeSteps: (id: string, op: StepOp) => Promise<void>;
  fetchTasks: (opts?: { force?: boolean; background?: boolean }) => Promise<void>;
  loadCachedTasks: (uid: string) => void;
  setCacheOwner: (uid: string | null) => void;
  setSelectedTask: (task: Task | null) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  setDetailFromUrl: () => void;
  setEditing: (editing: EditingField | null) => void;
  applyHeldUpdate: (id: string) => void;
  setFocusedTask: (id: string | null) => void;
  setVisibleTaskIds: (ids: string[]) => void;
}

// Module-scoped guards so React StrictMode's double-invoked effects can't
// race two parallel fetches before the first one updates state.
let inFlightFetch: Promise<void> | null = null;
const FETCH_DEDUPE_MS = 5000;

// Notion's list query can trail a page update by a few seconds, so a list read
// just after a save may still hold the old row. A bot edit landing inside this
// window just shows up on the next refresh.
const STALE_READ_GRACE_MS = 10_000;

// Long enough to catch a misclick, per the spec's "about 5 seconds".
const UNDO_WINDOW_MS = 5000;

// Writes to one row run in order, so Undo can't reach Notion before the
// Complete it is undoing.
const writeQueues = new Map<string, { tail: Promise<unknown>; count: number }>();

function enqueueWrite<T>(id: string, work: () => Promise<T>): Promise<T> {
  const queue = writeQueues.get(id) ?? { tail: Promise.resolve(), count: 0 };
  queue.count += 1;
  writeQueues.set(id, queue);
  const run = queue.tail.then(work);
  queue.tail = run
    .catch(() => undefined)
    .finally(() => {
      queue.count -= 1;
      if (queue.count === 0) writeQueues.delete(id);
    });
  return run;
}

const isLastQueuedWrite = (id: string) => (writeQueues.get(id)?.count ?? 0) <= 1;

// What Notion is known to hold for a row with writes queued. Restoring this
// after a failure can't bring back an earlier edit that never saved.
const confirmedRows = new Map<string, Task>();

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private browsing and blocked site data make the accessor throw.
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = safeStorage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.warn(`Ignoring unreadable local data at ${key}`, error);
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    const storage = safeStorage();
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch (error) {
    // Quota errors only cost the cache; Notion still holds the data.
    console.warn(`Could not update local data at ${key}`, error);
  }
}

const priorStateKey = (id: string) => `planner.prior.${id}`;
const taskCacheKey = (uid: string) => `planner.tasks.v1.${uid}`;
let cacheOwner: string | null = null;

function dayPair() {
  const today = todayInUserTz();
  return { today, tomorrow: addDays(today, 1) };
}

function replaceRow(id: string, row: Task) {
  usePlannerStore.setState((state) => {
    // The saved row is newer than any copy held back during typing, so applying
    // that copy later would bring old values back.
    const { [id]: _superseded, ...heldUpdates } = state.heldUpdates;
    return {
      tasks: state.tasks.map((t) => (t.id === id ? { ...row, pendingSync: undefined } : t)),
      selectedTask: state.selectedTask?.id === id ? { ...row, pendingSync: undefined } : state.selectedTask,
      heldUpdates,
    };
  });
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

/** Queues one request for a row, folds the server's copy back in, and restores the row if it fails. */
async function sendWrite(
  id: string,
  url: string,
  method: string,
  body: unknown,
  before: Task,
  replayable = true
): Promise<RequestFailure | null> {
  if (!confirmedRows.has(id)) confirmedRows.set(id, before);
  setPendingSync(id, true);
  return enqueueWrite(id, async () => {
    let failure: RequestFailure | null = null;
    try {
      const headers = await getAuthHeaders();
      const init = { method, headers, body: JSON.stringify(body) };
      const result = replayable
        ? await attemptFetch(url, init)
        : await attemptFetch(url, init, retryOnlyIfRefused, false);
      if (!result.ok) {
        failure = result.failure;
      } else {
        const saved = result.data.task as Task;
        confirmedRows.set(id, saved);
        markSaved(id);
        if (isLastQueuedWrite(id)) replaceRow(id, saved);
      }
    } catch (error) {
      console.error('Write failed:', error);
      failure = { status: 0, body: error instanceof Error ? error.message : 'Write failed' };
    }
    if (isLastQueuedWrite(id)) {
      const confirmed = confirmedRows.get(id);
      if (failure && confirmed) replaceRow(id, confirmed);
      confirmedRows.delete(id);
    }
    return failure;
  });
}

function markSaved(id: string) {
  usePlannerStore.setState((state) => ({ savedAt: { ...state.savedAt, [id]: Date.now() } }));
}

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  tasks: [],
  selectedTask: null,
  isModalOpen: false,
  detailTaskId: null,
  editing: null,
  heldUpdates: {},
  focusedTaskId: null,
  visibleTaskIds: [],
  isFetching: false,
  lastFetchedAt: null,
  syncError: false,
  savedAt: {},
  setTasks: (tasks) => set({ tasks }),
  setCacheOwner: (uid) => {
    cacheOwner = uid;
  },
  loadCachedTasks: (uid) => {
    if (get().tasks.length > 0) return;
    const cached = readJson<Task[]>(taskCacheKey(uid));
    if (!Array.isArray(cached) || cached.length === 0) return;
    // No write is running after a reload, so a saved "pending" flag would make
    // the row ignore every refresh from then on.
    set({ tasks: cached.map(({ pendingSync: _stale, ...row }) => row) });
  },
  fetchTasks: async (opts = {}) => {
    const { force = false, background = false } = opts;
    const state = get();
    const now = Date.now();
    if (!force && state.lastFetchedAt && now - state.lastFetchedAt < FETCH_DEDUPE_MS) {
      return;
    }
    if (inFlightFetch) {
      return inFlightFetch;
    }
    set({ isFetching: true });
    const requestedAt = Date.now();
    inFlightFetch = (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/tasks', { cache: 'no-store', headers });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(text);
        }
        const data = await res.json();
        const incoming: Task[] = Array.isArray(data.tasks) ? data.tasks : [];
        const current = get();
        const cutoff = requestedAt - STALE_READ_GRACE_MS;
        const savedAt = Object.fromEntries(Object.entries(current.savedAt).filter(([, at]) => at >= cutoff));
        const { tasks, held } = mergeIncoming(current.tasks, incoming, {
          busyIds: new Set(writeQueues.keys()),
          settledIds: new Set(Object.keys(savedAt)),
          editingId: current.editing?.taskId ?? null,
          openId: current.detailTaskId,
        });
        set({ tasks, heldUpdates: held, savedAt, lastFetchedAt: Date.now(), syncError: false });
        if (cacheOwner) {
          // Only what Notion answered, never unconfirmed edits. Archived rows
          // never display, and they are most of the database.
          writeStorage(taskCacheKey(cacheOwner), JSON.stringify(incoming.filter((t) => !isArchived(t))));
        }
      } catch (e) {
        console.error('❌ Failed to load tasks from API:', e);
        set({ syncError: true });
        // A refresh that fails every 45 seconds should not toast every time;
        // the header shows the stale state instead.
        if (!background) toast.error('Could not load tasks from Notion.');
      } finally {
        set({ isFetching: false });
        inFlightFetch = null;
      }
    })();
    return inFlightFetch;
  },
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
      enhancedUpdates.dueDate = value ?? null;
      enhancedUpdates.daysUntilDue = daysUntilDueInUserTz(value);
    }
    if ('plannedDay' in updates) {
      const { value, error } = normalizeDate(updates.plannedDay);
      if (error) {
        toast.error(`Invalid date: ${error}`);
        return;
      }
      enhancedUpdates.plannedDay = value ?? null;
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
    // Only drafts are submitted whole. Existing rows save field by field, so a
    // save can't overwrite what the planner bot wrote since the page loaded.
    if (!id.startsWith('temp-')) return;
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    setPendingSync(id, true);
    try {
      const headers = await getAuthHeaders();
      const result = await attemptFetch('/api/tasks', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: task.title,
          dueDate: task.dueDate,
          plannedDay: task.plannedDay,
          status: task.status,
          stage: task.stage,
          priority: task.priority,
          project: task.project,
          bucket: task.bucket,
          weekday: task.weekday,
          todoItems: task.todoItems || [],
          comments: task.comments || [],
          nextAction: task.nextAction,
          sourceText: task.sourceText,
          waitingOn: task.waitingOn,
          important: task.important ?? false,
          urgent: task.urgent ?? false,
        }),
      }, retryOnlyIfRefused, false);
      if (!result.ok) {
        showSaveError(task.title, () => get().submitTask(id), result.failure.status);
        setPendingSync(id, false);
        return;
      }
      const created = result.data.task as Task;
      replaceRow(id, created);
      markSaved(created.id);
    } catch (e) {
      console.error('Failed to submit task:', e);
      toast.error(`Couldn't save '${task.title}'. Retry?`, {
        label: 'Retry',
        onClick: () => get().submitTask(id),
      });
      setPendingSync(id, false);
    }
  },
  addQuickTask: async (title) => {
    const id = `temp-${Date.now()}`;
    get().addTask({
      id,
      title,
      dateCreated: new Date().toISOString(),
      status: 'To Do',
      stage: 'Inbox',
      weekday: 'No Weekdays',
      todoItems: [],
    });
    await get().submitTask(id);
  },
  saveChange: async (id, patch) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return false;
    const normalized: Partial<Task> = { ...patch };
    for (const key of ['dueDate', 'plannedDay'] as const) {
      if (!(key in patch)) continue;
      const { value, error } = normalizeDate(patch[key]);
      if (error) {
        toast.error(`Invalid date: ${error}`);
        return false;
      }
      normalized[key] = value ?? null;
    }

    get().updateTask(id, normalized);
    if (id.startsWith('temp-')) return true;

    const failure = await sendWrite(id, `/api/tasks/${id}`, 'PUT', normalized, task);
    if (!failure) return true;
    showSaveError(task.title, () => void get().saveChange(id, patch), failure.status);
    return false;
  },
  completeTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || id.startsWith('temp-') || isDone(task) || isArchived(task)) return;

    const prior: PriorState = { stage: task.stage ?? null, status: task.status };
    writeStorage(priorStateKey(id), JSON.stringify(prior));
    useToastStore.getState().push({
      message: `Completed '${task.title}'`,
      variant: 'success',
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          writeStorage(priorStateKey(id), null);
          await get().saveChange(id, { stage: prior.stage, status: prior.status });
        },
      },
    });
    const saved = await get().saveChange(id, { ...COMPLETE_PATCH });
    if (!saved) writeStorage(priorStateKey(id), null);
  },
  reopenTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    // Archived rows reopen too: they show in Done, so the checkbox has to work.
    if (!task || !isFinished(task)) return;
    const { today, tomorrow } = dayPair();
    const prior = readJson<PriorState>(priorStateKey(id));
    const saved = await get().saveChange(id, reopenPatch(task, prior, today, tomorrow));
    if (saved) writeStorage(priorStateKey(id), null);
  },
  archiveTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task || !isDone(task)) return;
    const saved = await get().saveChange(id, { status: 'Archived' });
    if (saved) {
      writeStorage(priorStateKey(id), null);
      toast.info(`Archived '${task.title}'`);
    }
  },
  moveTask: async (id, target) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const { today, tomorrow } = dayPair();
    await get().saveChange(id, patchForMove(task, target, today, tomorrow));
  },
  changeSteps: async (id, op) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    let next: string;
    try {
      next = applyStepOp(task.todosText ?? '', op);
    } catch (error) {
      if (!(error instanceof StepConflictError)) throw error;
      toast.error(error.message);
      return;
    }
    get().updateTask(id, { todosText: next });
    const failure = await sendWrite(id, `/api/tasks/${id}/steps`, 'POST', op, task, false);
    if (!failure) return;
    if (failure.status === 409) {
      toast.error('That step changed in Notion. Showing the latest version.');
      void get().fetchTasks({ force: true, background: true });
      return;
    }
    // It may have saved with only the answer lost, so a Retry button could add
    // the step twice. Show what Notion really has instead.
    if (failure.status === 0 || failure.status >= 500) {
      toast.error("Couldn't confirm that change. Showing the latest from Notion.");
      void get().fetchTasks({ force: true, background: true });
      return;
    }
    showSaveError(task.title, () => void get().changeSteps(id, op), failure.status);
  },
  discardDraft: (id) => {
    if (!id.startsWith('temp-')) return;
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
  },
  setSelectedTask: (task) => set({ selectedTask: task }),
  setIsModalOpen: (isOpen) => set({ isModalOpen: isOpen }),
  // history instead of the Next router: a navigation would re-render the view
  // underneath and lose its scroll position, filters and tab.
  openDetail: (id) => {
    set({ detailTaskId: id, focusedTaskId: id });
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('task', id);
    window.history.pushState({}, '', url);
  },
  closeDetail: () => {
    set({ detailTaskId: null, editing: null });
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('task');
    window.history.pushState({}, '', url);
  },
  setDetailFromUrl: () => {
    if (typeof window === 'undefined') return;
    set({ detailTaskId: new URLSearchParams(window.location.search).get('task') });
  },
  setEditing: (editing) => set({ editing }),
  applyHeldUpdate: (id) => {
    const held = get().heldUpdates[id];
    if (!held) return;
    const { [id]: _applied, ...rest } = get().heldUpdates;
    set({ heldUpdates: rest, editing: null });
    replaceRow(id, held);
  },
  setFocusedTask: (id) => set({ focusedTaskId: id }),
  setVisibleTaskIds: (ids) => set({ visibleTaskIds: ids }),
}));
