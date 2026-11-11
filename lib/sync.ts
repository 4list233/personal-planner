// Folding a background refresh into what is already on screen.
import type { Task } from './types';

export interface MergeGuards {
  /** Rows with a write in flight: the server copy is older than ours. */
  busyIds: Set<string>;
  /** Rows saved so recently that this response may predate the save. */
  settledIds: Set<string>;
  /** The row whose field is being typed in right now. */
  editingId: string | null;
  /** The row open in the detail view, which must not vanish while open. */
  openId: string | null;
}

// Compares content, not just the timestamp: Notion's last_edited_time is coarse
// enough that two edits can share one, and daysUntilDue moves at midnight with
// no edit at all.
function changed(current: Task, incoming: Task): boolean {
  const { pendingSync: _pending, ...shown } = current;
  return JSON.stringify(shown) !== JSON.stringify(incoming);
}

function isOlder(incoming: Task, current: Task): boolean {
  return !!incoming.lastEditedTime && !!current.lastEditedTime && incoming.lastEditedTime < current.lastEditedTime;
}

export function mergeIncoming(
  local: Task[],
  incoming: Task[],
  guards: MergeGuards
): { tasks: Task[]; held: Record<string, Task> } {
  const localById = new Map(local.map((task) => [task.id, task]));
  const incomingIds = new Set(incoming.map((task) => task.id));
  const held: Record<string, Task> = {};

  const tasks = incoming.map((next) => {
    const current = localById.get(next.id);
    if (!current) return next;
    if (current.pendingSync || guards.busyIds.has(next.id) || guards.settledIds.has(next.id)) return current;
    if (isOlder(next, current)) return current;
    // Unchanged rows keep their identity so React does not repaint them.
    if (!changed(current, next)) return current;
    if (next.id === guards.editingId) {
      held[next.id] = next;
      return current;
    }
    return next;
  });

  // Unsaved drafts, the open row and just-created rows can be missing from
  // Notion's answer without having gone anywhere.
  for (const task of local) {
    if (incomingIds.has(task.id)) continue;
    if (task.id.startsWith('temp-') || task.id === guards.openId || guards.settledIds.has(task.id)) tasks.push(task);
  }
  return { tasks, held };
}
