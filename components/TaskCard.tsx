'use client';

import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { shortDate } from '@/lib/formatters';
import { stepProgress } from '@/lib/steps';
import { usePlannerStore } from '@/lib/store';
import type { Task } from '@/lib/types';
import { isFinished } from '@/lib/views';

// Inner controls must not start a drag or open the panel underneath them.
const stopCardGestures = {
  onClick: (event: React.MouseEvent) => event.stopPropagation(),
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
};

function dueLabel(task: Task, done: boolean): { text: string; late: boolean } | null {
  if (!task.dueDate) return null;
  const date = shortDate(task.dueDate);
  if (done || task.daysUntilDue === undefined || task.daysUntilDue > 0) return { text: `Due ${date}`, late: false };
  if (task.daysUntilDue === 0) return { text: 'Due today', late: true };
  return { text: `Overdue, ${date}`, late: true };
}

function TaskCard({ task, dragging = false }: { task: Task; dragging?: boolean }) {
  const openDetail = usePlannerStore((state) => state.openDetail);
  const completeTask = usePlannerStore((state) => state.completeTask);
  const reopenTask = usePlannerStore((state) => state.reopenTask);
  const highlighted = usePlannerStore(
    (state) => state.focusedTaskId === task.id || state.detailTaskId === task.id
  );

  const done = isFinished(task);
  const progress = stepProgress(task.todosText);
  const due = dueLabel(task, done);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const next = done ? null : progress.next || task.nextAction;
  const waiting = task.waitingOn ? `Waiting on ${task.waitingOn}` : task.stage === 'Waiting' ? 'Waiting' : null;
  const hasMeta = task.priority || task.urgent || due || waiting;

  return (
    <div
      onClick={() => openDetail(task.id)}
      data-task-card={task.id}
      className={
        'bg-white border rounded-[10px] p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ' +
        (highlighted ? 'border-accent ' : 'border-line ') +
        (dragging ? 'shadow-xl' : '')
      }
    >
      <div className="flex items-start gap-2.5">
        {/* The padding makes a 44px target on a phone, with the negative margin undoing its layout. */}
        <label {...stopCardGestures} className="flex-none flex -m-[13px] p-[13px] cursor-pointer">
          <input
            type="checkbox"
            checked={done}
            aria-label={`${done ? 'Reopen' : 'Complete'} ${task.title}`}
            onChange={() => void (done ? reopenTask(task.id) : completeTask(task.id))}
            className="mt-px w-[18px] h-[18px] cursor-pointer accent-accent"
          />
        </label>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openDetail(task.id);
          }}
          className={`min-w-0 flex-1 text-left text-sm font-medium leading-snug break-words cursor-pointer ${
            done ? 'text-muted line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </button>
        {task.pendingSync ? (
          <span title="Saving to Notion">
            <AlertTriangle size={14} className="mt-0.5 flex-none text-late" />
          </span>
        ) : null}
      </div>

      {hasMeta ? (
        <div className="mt-2 pl-7 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
          {task.priority ? (
            <span
              className={`px-1.5 py-px rounded font-semibold ${
                task.priority === 'P1' ? 'bg-ink text-white' : 'bg-chip text-ink'
              }`}
            >
              {task.priority}
            </span>
          ) : null}
          {task.urgent ? <span className="font-semibold text-late">Urgent</span> : null}
          {due ? <span className={due.late ? 'font-semibold text-late' : ''}>{due.text}</span> : null}
          {waiting ? <span>{waiting}</span> : null}
        </div>
      ) : null}

      {progress.total > 0 ? (
        <div className="mt-2.5 pl-7 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-chip overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs text-muted">
            {progress.done}/{progress.total}
          </span>
        </div>
      ) : null}

      {next ? <div className="mt-1.5 pl-7 text-xs leading-snug text-muted break-words">Next: {next}</div> : null}
    </div>
  );
}

// memo so a background refresh only repaints the rows that actually changed.
export default memo(TaskCard);
