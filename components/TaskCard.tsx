'use client';

import { Task, Quadrant, QUADRANT_LABEL, quadrantOf } from '@/lib/types';
import { FileText, Calendar, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  /** When true, shows the full quadrant label (e.g. on the Matrix view) */
  showQuadrantLabel?: boolean;
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

export default function TaskCard({ task, onClick, showQuadrantLabel = false }: TaskCardProps) {
  const quadrant = quadrantOf(task);
  const showQuadrant = task.important === true || task.urgent === true || showQuadrantLabel;
  const getDaysUntilDueColor = (days?: number) => {
    if (days === undefined) return 'text-gray-600';
    if (days < 0) return 'text-red-600';
    if (days === 0) return 'text-orange-600';
    if (days <= 7) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const formatDaysUntilDue = (days?: number) => {
    if (days === undefined) return '';
    if (Math.abs(days) > 365) return days > 0 ? 'in 1+ year' : 'overdue 1+ year';
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days < 0) return `overdue ${Math.abs(days)}d`;
    return `in ${days} days`;
  };

  const getWeekdayColor = (weekday?: string) => {
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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Reminders': 'bg-purple-50 text-purple-700 border-purple-200',
      'Long Term Deadlines': 'bg-pink-50 text-pink-700 border-pink-200',
      'To Do': 'bg-orange-50 text-orange-700 border-orange-200',
      'Doing Today': 'bg-green-50 text-green-700 border-green-200',
      'Doing Tomorrow': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      'Archived': 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return colors[status] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  return (
    <div
      onClick={onClick}
      className="relative bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group"
    >
      {showQuadrant && (
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
      )}
      <div className="flex items-start gap-2 mb-2 pr-6">
        <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors break-words overflow-wrap-anywhere flex-1">
          {task.title}
        </h3>
        {task.pendingSync && (
          <span title="Save pending — server has not confirmed">
            <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          </span>
        )}
      </div>

      {task.dueDate && (
        <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <Calendar size={12} />
          {(() => {
            try {
              return format(new Date(task.dueDate), 'MMM d, yyyy');
            } catch {
              return task.dueDate;
            }
          })()}
        </div>
      )}

      {task.daysUntilDue !== undefined && (
        <div className={`text-xs font-medium mb-2 ${getDaysUntilDueColor(task.daysUntilDue)}`}>
          {formatDaysUntilDue(task.daysUntilDue)}
        </div>
      )}

      {task.weekday && (
        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getWeekdayColor(task.weekday)}`}>
          🔵 {task.weekday}
        </div>
      )}

      {task.todoItems && task.todoItems.length > 0 && (
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
      )}
    </div>
  );
}
