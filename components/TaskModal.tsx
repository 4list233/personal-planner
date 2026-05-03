'use client';

import { usePlannerStore } from '@/lib/store';
import { X, Calendar, Clock, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import { TaskStatus, Weekday, TodoItem } from '@/lib/types';

export default function TaskModal() {
  const { selectedTask, isModalOpen, setIsModalOpen, updateTask, deleteTask, submitTask } = usePlannerStore();
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  const dispatchModalAction = (action: 'submit' | 'cancel') => {
    if (!selectedTask) return;
    window.dispatchEvent(
      new CustomEvent<{ action: 'submit' | 'cancel'; taskId: string }>('task-modal-action', {
        detail: { action, taskId: selectedTask.id },
      })
    );
  };

  useEffect(() => {
    setTitleDraft(selectedTask?.title ?? '');
    setTitleError(null);
    setDateError(null);
    setNewCommentText('');
  }, [selectedTask?.id]);

  const commitTitle = () => {
    if (!selectedTask) return;
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== selectedTask.title) {
      updateTask(selectedTask.id, { title: trimmed });
    }
  };

  const handleClose = async () => {
    const isQueueDraft = Boolean(selectedTask?.queueId);
    if (selectedTask?.id.startsWith('temp-') && !isQueueDraft) {
      await deleteTask(selectedTask.id);
    }
    setIsModalOpen(false);
    dispatchModalAction('cancel');
  };

  const handleSave = async () => {
    if (!selectedTask) return;
    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle || trimmedTitle === 'New Task') {
      setTitleError('Title is required');
      return;
    }
    if (selectedTask.dueDate) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedTask.dueDate.split('T')[0]);
      if (!m) {
        setDateError('Date must be between 1970 and 2100');
        return;
      }
      const y = Number(m[1]);
      if (y < 1970 || y > 2100) {
        setDateError('Date must be between 1970 and 2100');
        return;
      }
    }
    if (trimmedTitle !== selectedTask.title) {
      updateTask(selectedTask.id, { title: trimmedTitle });
    }
    await submitTask(selectedTask.id);
    dispatchModalAction('submit');
    setIsModalOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void handleClose();
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping = activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName);
      const isDraftTask = selectedTask?.id.startsWith('temp-');

      // Submit draft tasks with Enter (and still support Cmd/Ctrl+Enter)
      if (isDraftTask) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          void handleSave();
        } else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !isTyping) {
          e.preventDefault();
          void handleSave();
        }
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, selectedTask]);

  if (!isModalOpen || !selectedTask) return null;

  const allStatuses: TaskStatus[] = [
    'Reminders',
    'Long Term Deadlines',
    'To Do',
    'Doing Today',
    'Doing Tomorrow',
    'Archived',
  ];

  const allWeekdays: Weekday[] = [
    'No Weekdays',
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

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
      'Reminders': 'bg-purple-100 text-purple-700',
      'Long Term Deadlines': 'bg-pink-100 text-pink-700',
      'To Do': 'bg-orange-100 text-orange-700',
      'Doing Today': 'bg-green-100 text-green-700',
      'Doing Tomorrow': 'bg-yellow-100 text-yellow-700',
      'Archived': 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => void handleClose()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => {
                setTitleDraft(e.target.value);
                if (titleError) setTitleError(null);
              }}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitTitle();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              autoFocus={selectedTask.id.startsWith('temp-') && selectedTask.title === 'New Task'}
              maxLength={500}
              placeholder="Task title"
              aria-label="Task title"
              className="w-full text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none px-0 line-clamp-2 max-w-full"
            />
            {titleError && (
              <div className="mt-1 text-xs text-red-600">{titleError}</div>
            )}
          </div>
          <button
            onClick={() => void handleClose()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Properties */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar size={18} className="text-gray-400 mt-1" />
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">Due Date</div>
                <input
                  type="date"
                  value={selectedTask.dueDate || ''}
                  onChange={(e) => updateTask(selectedTask.id, { dueDate: e.target.value })}
                  className="text-sm font-medium text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock size={18} className="text-gray-400 mt-1" />
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-1">Date Created</div>
                <div className="text-sm font-medium text-gray-900">
                  {format(new Date(selectedTask.dateCreated), 'MMMM dd, yyyy h:mm a')}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-[18px] h-[18px] flex items-center justify-center mt-1">
                <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-2">Status</div>
                <select
                  value={selectedTask.status}
                  onChange={(e) => updateTask(selectedTask.id, { status: e.target.value as TaskStatus })}
                  className={`px-3 py-1 rounded-md text-sm font-medium border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${getStatusColor(selectedTask.status)}`}
                >
                  {allStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedTask.daysUntilDue !== undefined && (
              <div className="flex items-start gap-3">
                <div className="w-[18px] h-[18px] flex items-center justify-center mt-1">
                  Σ
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-500 mb-1">Days Until Due</div>
                  <div className="text-sm font-medium text-gray-900">{selectedTask.daysUntilDue}</div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <div className="w-[18px] h-[18px] flex items-center justify-center mt-1">
                ☀️
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-500 mb-2">Weekdays</div>
                <select
                  value={selectedTask.weekday || 'No Weekdays'}
                  onChange={(e) => updateTask(selectedTask.id, { weekday: e.target.value as Weekday })}
                  className={`px-3 py-1 rounded-md text-sm font-medium border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${getWeekdayColor(selectedTask.weekday)}`}
                >
                  {allWeekdays.map((day) => (
                    <option key={day} value={day}>
                      🔵 {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">Comments</h3>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                F
              </div>
              <input
                type="text"
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* To-do Items */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">To-do</h3>
            <div className="space-y-2">
              {selectedTask.todoItems?.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => {
                      const updatedTodos = selectedTask.todoItems?.map((todo) =>
                        todo.id === item.id ? { ...todo, completed: !todo.completed } : todo
                      );
                      updateTask(selectedTask.id, { todoItems: updatedTodos });
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => {
                      const updatedTodos = selectedTask.todoItems?.map((todo) =>
                        todo.id === item.id ? { ...todo, text: e.target.value } : todo
                      );
                      updateTask(selectedTask.id, { todoItems: updatedTodos });
                    }}
                    className={`flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 ${
                      item.completed ? 'line-through text-gray-400' : 'text-gray-700'
                    }`}
                  />
                  <button
                    onClick={() => {
                      const updatedTodos = selectedTask.todoItems?.filter((todo) => todo.id !== item.id);
                      updateTask(selectedTask.id, { todoItems: updatedTodos });
                    }}
                    className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-xs"
                  >
                    Delete
                  </button>
                </div>
              ))}
              
              {/* Add new todo */}
              <div className="flex items-center gap-3 pt-2">
                <div className="w-4 h-4"></div>
                <input
                  type="text"
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && newTodoText.trim()) {
                      const newTodo: TodoItem = {
                        id: `todo-${Date.now()}`,
                        text: newTodoText,
                        completed: false,
                      };
                      const updatedTodos = [...(selectedTask.todoItems || []), newTodo];
                      updateTask(selectedTask.id, { todoItems: updatedTodos });
                      setNewTodoText('');
                    }
                  }}
                  placeholder="Add a to-do item..."
                  className="flex-1 text-sm text-gray-500 bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
                />
                <button
                  onClick={() => {
                    if (newTodoText.trim()) {
                      const newTodo: TodoItem = {
                        id: `todo-${Date.now()}`,
                        text: newTodoText,
                        completed: false,
                      };
                      const updatedTodos = [...(selectedTask.todoItems || []), newTodo];
                      updateTask(selectedTask.id, { todoItems: updatedTodos });
                      setNewTodoText('');
                    }
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded hover:bg-blue-50 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with persistent Submit button */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
