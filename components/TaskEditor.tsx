'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, MessageSquare, X } from 'lucide-react';
import { usePlannerStore } from '@/lib/store';
import { columnForTask, isStale, statusForStage } from '@/lib/planner';
import type { Bucket, Priority, ProjectName, Stage, Task, TodoItem, Weekday } from '@/lib/types';
import { daysUntilDueColorClass, formatDaysUntilDue } from '@/lib/formatters';

const STAGES: Stage[] = ['Inbox', 'This Week', 'Today', 'In Progress', 'Waiting', 'Done'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];
const PROJECTS: ProjectName[] = ['Velox', 'School', 'Personal', 'Leads', 'Other'];
const BUCKETS: Bucket[] = ['Mine', 'Dispatch', 'Follow-up', 'Watch', 'Long-term'];
const WEEKDAYS: Weekday[] = [
  'No Weekdays',
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const selectClass =
  'w-full sm:w-auto px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface TaskEditorProps {
  task: Task;
  variant: 'modal' | 'page';
  onClose?: () => void;
  onEdit?: () => void;
}

export default function TaskEditor({ task, variant, onClose, onEdit }: TaskEditorProps) {
  const { setIsModalOpen, updateTask, deleteTask, submitTask } = usePlannerStore();
  const edit = (patch: Partial<Task>) => {
    onEdit?.();
    updateTask(task.id, patch);
  };
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  useEffect(() => {
    setTitleDraft(task.title);
    setTitleError(null);
    setDateError(null);
    setNewCommentText('');
    setNewTodoText('');
  }, [task.id]);

  const dispatchModalAction = (action: 'submit' | 'cancel') => {
    window.dispatchEvent(
      new CustomEvent<{ action: 'submit' | 'cancel'; taskId: string }>('task-modal-action', {
        detail: { action, taskId: task.id },
      })
    );
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      edit({ title: trimmed });
    }
  };

  const finishClose = () => {
    if (onClose) onClose();
    else setIsModalOpen(false);
  };

  const handleClose = async () => {
    const isQueueDraft = Boolean(task.queueId);
    if (task.id.startsWith('temp-') && !isQueueDraft) {
      await deleteTask(task.id);
    }
    finishClose();
    dispatchModalAction('cancel');
  };

  const handleSave = async () => {
    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle || trimmedTitle === 'New Task') {
      setTitleError('Title is required');
      return;
    }
    if (task.dueDate) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(task.dueDate.split('T')[0]);
      if (!match || Number(match[1]) < 1970 || Number(match[1]) > 2100) {
        setDateError('Date must be between 1970 and 2100');
        return;
      }
    }
    if (trimmedTitle !== task.title) {
      edit({ title: trimmedTitle });
    }
    await submitTask(task.id);
    dispatchModalAction('submit');
    if (variant === 'modal') setIsModalOpen(false);
  };

  const closeRef = useRef(handleClose);
  const saveRef = useRef(handleSave);
  closeRef.current = handleClose;
  saveRef.current = handleSave;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void closeRef.current();
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const isTyping = !!activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
      const isDraftTask = task.id.startsWith('temp-');
      if (!isDraftTask) return;

      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void saveRef.current();
      } else if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !isTyping) {
        event.preventDefault();
        void saveRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    if (variant === 'modal') document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (variant === 'modal') document.body.style.overflow = 'unset';
    };
  }, [variant, task.id]);

  const hidden = columnForTask(task) === null;
  const stale = isStale(task.lastEditedTime);

  const setStage = (stage: Stage) => {
    edit({ stage, status: statusForStage(stage) });
  };

  const addTodo = () => {
    const text = newTodoText.trim();
    if (!text) return;
    const next: TodoItem = { id: `todo-${Date.now()}`, text, completed: false };
    edit({ todoItems: [...(task.todoItems || []), next] });
    setNewTodoText('');
  };

  const addComment = () => {
    const text = newCommentText.trim();
    if (!text) return;
    edit({ comments: [...(task.comments || []), text] });
    setNewCommentText('');
  };

  const form = (
    <>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between gap-3 z-10">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={titleDraft}
            onChange={(event) => {
              setTitleDraft(event.target.value);
              if (titleError) setTitleError(null);
            }}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle();
                (event.target as HTMLInputElement).blur();
              }
            }}
            autoFocus={task.id.startsWith('temp-') && task.title === 'New Task'}
            maxLength={500}
            placeholder="Task title"
            aria-label="Task title"
            className="w-full text-xl font-semibold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-blue-500 focus:outline-none"
          />
          {titleError ? <div className="mt-1 text-xs text-red-600">{titleError}</div> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {stale ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                Stale · 7+ days untouched
              </span>
            ) : null}
            {hidden ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                Hidden on the board
              </span>
            ) : null}
            {task.pendingSync ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Saving…
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleClose()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          aria-label="Close task"
        >
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Stage">
            <select
              aria-label="Stage"
              value={task.stage || ''}
              onChange={(event) => setStage(event.target.value as Stage)}
              className={selectClass}
            >
              <option value="" disabled>
                Choose a stage
              </option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Status stays in sync as {task.status}</p>
          </Field>

          <Field label="Priority">
            <select
              aria-label="Priority"
              value={task.priority || ''}
              onChange={(event) =>
                edit({ priority: (event.target.value || null) as Priority | null })
              }
              className={selectClass}
            >
              <option value="">None</option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Project">
            <select
              aria-label="Project"
              value={task.project || ''}
              onChange={(event) =>
                edit({ project: (event.target.value || null) as ProjectName | null })
              }
              className={selectClass}
            >
              <option value="">None</option>
              {PROJECTS.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bucket">
            <select
              aria-label="Bucket"
              value={task.bucket || ''}
              onChange={(event) =>
                edit({ bucket: (event.target.value || null) as Bucket | null })
              }
              className={selectClass}
            >
              <option value="">None</option>
              {BUCKETS.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {bucket}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Planned day">
            <input
              type="date"
              aria-label="Planned day"
              min="1970-01-01"
              max="2100-12-31"
              value={task.plannedDay ? task.plannedDay.slice(0, 10) : ''}
              onChange={(event) => edit({ plannedDay: event.target.value })}
              className="text-sm font-medium text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>

          <Field label="Due date">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                aria-label="Due date"
                min="1970-01-01"
                max="2100-12-31"
                value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
                onChange={(event) => {
                  setDateError(null);
                  edit({ dueDate: event.target.value });
                }}
                className="text-sm font-medium text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {task.daysUntilDue !== undefined ? (
                <span className={`text-xs ${daysUntilDueColorClass(task.daysUntilDue)}`}>
                  {formatDaysUntilDue(task.daysUntilDue)}
                </span>
              ) : null}
            </div>
            {dateError ? <div className="mt-1 text-xs text-red-600">{dateError}</div> : null}
          </Field>
        </div>

        <Field label="Next action">
          <textarea
            aria-label="Next action"
            value={task.nextAction || ''}
            onChange={(event) => edit({ nextAction: event.target.value })}
            rows={2}
            placeholder="The next concrete step"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Source">
            <input
              type="text"
              aria-label="Source"
              value={task.sourceText || ''}
              onChange={(event) => edit({ sourceText: event.target.value })}
              placeholder="Where this came from"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label="Waiting on">
            <input
              type="text"
              aria-label="Waiting on"
              value={task.waitingOn || ''}
              onChange={(event) => edit({ waitingOn: event.target.value })}
              placeholder="Person or thing"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <div className="flex items-start gap-3 text-sm text-gray-500">
          <Clock size={16} className="mt-0.5" />
          <div>
            <div>Created {format(new Date(task.dateCreated), 'MMMM d, yyyy h:mm a')}</div>
            {task.lastEditedTime ? (
              <div>Edited {format(new Date(task.lastEditedTime), 'MMMM d, yyyy h:mm a')}</div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={18} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Comments</h3>
          </div>
          {task.comments && task.comments.length > 0 ? (
            <div className="space-y-2 mb-3">
              {task.comments.map((comment, index) => (
                <div key={`${index}-${comment}`} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 break-words">
                  {comment}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newCommentText}
              onChange={(event) => setNewCommentText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addComment();
                }
              }}
              placeholder="Add a comment..."
              aria-label="Add a comment"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={addComment}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded hover:bg-blue-50"
            >
              Add
            </button>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Checklist</h3>
          <p className="text-xs text-gray-400 mb-4">
            Saved as to-do blocks on the Notion page, and mirrored to the Todos property.
          </p>
          <div className="space-y-2">
            {(task.todoItems || []).map((item) => (
              <div key={item.id} className="flex items-center gap-3 group">
                <input
                  type="checkbox"
                  checked={item.completed}
                  aria-label={`Mark "${item.text || 'to-do'}" ${item.completed ? 'incomplete' : 'complete'}`}
                  onChange={() => {
                    const todoItems = task.todoItems?.map((todo) =>
                      todo.id === item.id ? { ...todo, completed: !todo.completed } : todo
                    );
                    edit({ todoItems });
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={item.text}
                  aria-label="Checklist item"
                  onChange={(event) => {
                    const todoItems = task.todoItems?.map((todo) =>
                      todo.id === item.id ? { ...todo, text: event.target.value } : todo
                    );
                    edit({ todoItems });
                  }}
                  className={`flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 ${
                    item.completed ? 'line-through text-gray-400' : 'text-gray-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const todoItems = task.todoItems?.filter((todo) => todo.id !== item.id);
                    edit({ todoItems });
                  }}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-red-500 hover:text-red-700 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <div className="w-4 h-4" />
              <input
                type="text"
                value={newTodoText}
                onChange={(event) => setNewTodoText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTodo();
                  }
                }}
                placeholder="Add a to-do..."
                aria-label="Add a to-do"
                className="flex-1 text-sm text-gray-900 bg-transparent border-b border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1"
              />
              <button
                type="button"
                onClick={addTodo}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded hover:bg-blue-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <details className="border-t border-gray-200 pt-4">
          <summary className="text-sm text-gray-500 cursor-pointer">Older fields</summary>
          <div className="mt-4 flex flex-wrap gap-4">
            <Field label="Weekday">
              <select
                aria-label="Weekday"
                value={task.weekday || 'No Weekdays'}
                onChange={(event) => edit({ weekday: event.target.value as Weekday })}
                className={selectClass}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end gap-2 pb-1">
              <button
                type="button"
                aria-pressed={!!task.important}
                onClick={() => edit({ important: !task.important })}
                className={`px-3 py-1 rounded-full text-sm border ${
                  task.important
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                Important
              </button>
              <button
                type="button"
                aria-pressed={!!task.urgent}
                onClick={() => edit({ urgent: !task.urgent })}
                className={`px-3 py-1 rounded-full text-sm border ${
                  task.urgent ? 'bg-red-100 text-red-800 border-red-300' : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
        </details>
      </div>

      <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400 flex items-center gap-1">
          <Calendar size={12} />
          Save writes Stage and keeps Status in sync
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </>
  );

  if (variant === 'page') {
    return <div className="bg-white rounded-xl border border-gray-200 shadow-sm">{form}</div>;
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={() => void handleClose()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        {form}
      </div>
    </div>
  );
}
