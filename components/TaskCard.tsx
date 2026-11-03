'use client';

import { Task, Quadrant, QUADRANT_LABEL, quadrantOf } from '@/lib/types';
import { FileText, Calendar, AlertTriangle } from 'lucide-react';
import { formatDueDateLocal } from '@/lib/formatters';
import { formatDaysUntilDue, daysUntilDueColorClass } from '@/lib/formatters';
import { isStale } from '@/lib/planner';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  /** When true, shows the full quadrant label (e.g. on the Matrix view) */
  showQuadrantLabel?: boolean;
  /** Keep the weekday tag and inline checklist used by the older views. */
  showLegacyDetails?: boolean;
  /** Visual treatment when this card is being rendered inside <DragOverlay>. */
  dragging?: boolean;
}

const QUADRANT_DOT_COLOR: Record<Quadrant, string> = {
  Q1: 'bg-red-500',
  Q2: 'bg-blue-500',
  Q3: 'bg-yellow-500',
  Q4: 'bg-gray-400',
};

const QUADRANT_BADGE_COLOR: Record<Quadrant, string> = {
  Q1: 'bg-red-100 text-red-800 border-red-200',
  Q2: 'bg-blue-100 text-blue-800 border-blue-200',
  Q3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Q4: 'bg-gray-100 text-gray-700 border-gray-200',
};

const QUADRANT_SHORT: Record<Quadrant, string> = {
  Q1: 'Do First',
  Q2: 'Schedule',
  Q3: 'Quick',
  Q4: 'Backlog',
};

const PRIORITY_CLASS: Record<string, string> = {
  P1: 'bg-red-100 text-red-800',
  P2: 'bg-amber-100 text-amber-800',
  P3: 'bg-gray-100 text-gray-600',
};

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${className || 'bg-gray-100 text-gray-700'}`}>
      {children}
    </span>
  );
}

export default function TaskCard({
  task,
  onClick,
  showQuadrantLabel = false,
  showLegacyDetails = false,
  dragging = false,
}: TaskCardProps) {
  const quadrant = quadrantOf(task);
  const showQuadrant = task.important === true || task.urgent === true || showQuadrantLabel;
  const stale = isStale(task.lastEditedTime);

  const weekdayColor = (weekday?: string) => {
    if (!weekday || weekday === 'No Weekdays') return 'bg-blue-100 text-blue-700';
    const colors: Record<string, string> = {
      Sunday: 'bg-green-100 text-green-700',
      Monday: 'bg-blue-100 text-blue-700',
      Tuesday: 'bg-purple-100 text-purple-700',
      Wednesday: 'bg-pink-100 text-pink-700',
      Thursday: 'bg-indigo-100 text-indigo-700',
      Friday: 'bg-red-100 text-red-700',
      Saturday: 'bg-yellow-100 text-yellow-700',
    };
    return colors[weekday] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={
        'relative bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group ' +
        (dragging ? 'opacity-90 shadow-xl ring-1 ring-blue-300' : '')
      }
    >
      {showQuadrant ? (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {showQuadrantLabel ? (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${QUADRANT_BADGE_COLOR[quadrant]}`}
              title={QUADRANT_LABEL[quadrant]}
            >
              {QUADRANT_SHORT[quadrant]}
            </span>
          ) : (
            <span
              className={`block w-2 h-2 rounded-full ${QUADRANT_DOT_COLOR[quadrant]}`}
              title={QUADRANT_LABEL[quadrant]}
            />
          )}
        </div>
      ) : null}
      <div className="flex items-start gap-2 mb-2 pr-6">
        <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors break-words flex-1">
          {task.title}
        </h3>
        {task.pendingSync ? (
          <span title="Save pending — server has not confirmed">
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {task.priority ? <Chip className={PRIORITY_CLASS[task.priority] || PRIORITY_CLASS.P3}>{task.priority}</Chip> : null}
        {task.project ? <Chip className="bg-sky-50 text-sky-800">{task.project}</Chip> : null}
        {task.bucket ? <Chip>{task.bucket}</Chip> : null}
        {stale ? (
          <Chip className="bg-orange-100 text-orange-800">
            <span title="Untouched for 7 or more days">Stale</span>
          </Chip>
        ) : null}
      </div>

      {task.waitingOn ? (
        <div className="text-xs text-purple-700 mb-2 break-words">Waiting on {task.waitingOn}</div>
      ) : null}

      {(task.plannedDay || task.dueDate) ? (
        <div className="text-xs text-gray-500 mb-1 flex flex-col gap-0.5">
          {task.plannedDay ? (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              Plan {formatDueDateLocal(task.plannedDay)}
            </span>
          ) : null}
          {task.dueDate ? (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              Due {formatDueDateLocal(task.dueDate)}
              {task.daysUntilDue !== undefined ? (
                <span className={daysUntilDueColorClass(task.daysUntilDue)}>
                  {formatDaysUntilDue(task.daysUntilDue)}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      {showLegacyDetails && task.weekday ? (
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium mt-2 ${weekdayColor(task.weekday)}`}>
          {task.weekday}
        </div>
      ) : null}

      {showLegacyDetails && task.todoItems && task.todoItems.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-700 mb-2">To-do</div>
          {task.todoItems.map((item) => (
            <div key={item.id} className="flex items-start gap-2 text-xs text-gray-600 mb-1">
              <input
                type="checkbox"
                checked={item.completed}
                readOnly
                className="w-3 h-3 rounded border-gray-300 mt-0.5 flex-shrink-0"
              />
              <span className={item.completed ? 'line-through break-words' : 'break-words'}>{item.text}</span>
            </div>
          ))}
        </div>
      ) : null}

      {!showLegacyDetails && task.todoItems && task.todoItems.length > 0 ? (
        <div className="mt-2 text-[11px] text-gray-400">
          {task.todoItems.length} to-do{task.todoItems.length === 1 ? '' : 's'}
        </div>
      ) : null}
    </div>
  );
}
