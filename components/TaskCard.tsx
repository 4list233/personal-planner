'use client';

import { Task } from '@/lib/types';
import { FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const getDaysUntilDueColor = (days?: number) => {
    if (days === undefined) return 'text-gray-600';
    if (days < 0) return 'text-red-600';
    if (days === 0) return 'text-orange-600';
    if (days <= 7) return 'text-yellow-600';
    return 'text-gray-600';
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
      className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="flex items-start gap-2 mb-2">
        <FileText size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
        <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
          {task.title}
        </h3>
      </div>

      {task.dueDate && (
        <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
          <Calendar size={12} />
          {task.dueDate.split('T')[0].replace(/-/g, '/')}
        </div>
      )}

      {task.daysUntilDue !== undefined && (
        <div className={`text-xs font-medium mb-2 ${getDaysUntilDueColor(task.daysUntilDue)}`}>
          {task.daysUntilDue}
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
            <div key={item.id} className="flex items-center gap-2 text-xs text-gray-600 mb-1">
              <input
                type="checkbox"
                checked={item.completed}
                readOnly
                className="w-3 h-3 rounded border-gray-300"
              />
              <span className={item.completed ? 'line-through' : ''}>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
