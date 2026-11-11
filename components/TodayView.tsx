'use client';

import { useMemo, useState } from 'react';
import { shortDate } from '@/lib/formatters';
import { parseSteps } from '@/lib/steps';
import { usePlannerStore } from '@/lib/store';
import { todayInUserTz } from '@/lib/time';
import type { Task } from '@/lib/types';
import { useLanes, useVisibleIds } from '@/lib/use-board-lanes';
import { isFinished } from '@/lib/views';

function Subtasks({ task }: { task: Task }) {
  const changeSteps = usePlannerStore((state) => state.changeSteps);
  const steps = useMemo(() => parseSteps(task.todosText || '').filter((line) => line.kind === 'step'), [task.todosText]);
  if (steps.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col">
      {steps.map((step) => (
        <li key={step.index}>
          <label className="flex items-start gap-3 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={step.completed}
              onChange={() =>
                void changeSteps(task.id, {
                  type: 'toggle',
                  line: { index: step.index, raw: step.raw },
                  completed: !step.completed,
                })
              }
              className="mt-0.5 w-[18px] h-[18px] flex-none cursor-pointer accent-accent"
            />
            <span className={`text-[15px] leading-snug ${step.completed ? 'text-muted line-through' : 'text-ink'}`}>
              {step.text}
              {step.owner ? <span className="text-muted"> · {step.owner}</span> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function FocusRow({ task }: { task: Task }) {
  const completeTask = usePlannerStore((state) => state.completeTask);
  const openDetail = usePlannerStore((state) => state.openDetail);
  const meta = [
    task.priority,
    task.dueDate ? (task.daysUntilDue !== undefined && task.daysUntilDue < 0 ? `Overdue, ${shortDate(task.dueDate)}` : `Due ${shortDate(task.dueDate)}`) : null,
    task.people?.length ? `With ${task.people.join(', ')}` : null,
  ].filter(Boolean);

  return (
    <li className="bg-white border border-line rounded-xl p-4" data-task-card={task.id}>
      <div className="flex items-start gap-3.5">
        <input
          type="checkbox"
          checked={false}
          aria-label={`Complete ${task.title}`}
          onChange={() => void completeTask(task.id)}
          className="mt-0.5 w-6 h-6 flex-none cursor-pointer accent-accent"
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => openDetail(task.id)}
            className="text-left font-display text-lg font-semibold leading-snug break-words cursor-pointer hover:underline"
          >
            {task.title}
          </button>
          {meta.length ? <div className="mt-1 text-sm text-muted">{meta.join(' · ')}</div> : null}
          <Subtasks task={task} />
        </div>
      </div>
    </li>
  );
}

export default function TodayView() {
  const { lanes, today } = useLanes();
  const tasks = usePlannerStore((state) => state.tasks);
  const addQuickTask = usePlannerStore((state) => state.addQuickTask);
  const reopenTask = usePlannerStore((state) => state.reopenTask);
  const [draft, setDraft] = useState('');

  const open = lanes.Today;
  // Finished today, by Notion's last edit: close enough to show the day's progress.
  const doneToday = useMemo(
    () => tasks.filter((task) => isFinished(task) && task.lastEditedTime && todayInUserTz(new Date(task.lastEditedTime)) === today),
    [tasks, today]
  );
  useVisibleIds(open.map((task) => task.id));

  const total = open.length + doneToday.length;
  const percent = total === 0 ? 0 : Math.round((doneToday.length / total) * 100);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    void addQuickTask(title, { plannedDay: today, stage: 'Today', status: 'Doing Today' });
  };

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <div className="pt-2 pb-4">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Today</h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-chip overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-sm text-muted">
            {doneToday.length} of {total} done
          </span>
        </div>
      </div>

      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Add to today"
          placeholder="Add something for today"
          className="flex-1 min-w-0 h-11 px-3 border border-line-strong rounded-lg bg-white text-sm placeholder:text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-accent"
        />
        <button type="submit" className="h-11 px-4 rounded-lg bg-accent text-white text-sm font-semibold cursor-pointer">
          Add
        </button>
      </form>

      <ul className="flex flex-col gap-3">
        {open.map((task) => (
          <FocusRow key={task.id} task={task} />
        ))}
      </ul>
      {open.length === 0 ? (
        <p className="py-10 text-center text-muted">
          {doneToday.length ? 'All done for today.' : 'Nothing planned for today. Drag something onto Today in the board or week.'}
        </p>
      ) : null}

      {doneToday.length ? (
        <section aria-label="Done today" className="mt-8">
          <h3 className="text-sm font-semibold text-muted pb-2">Done today</h3>
          <ul className="flex flex-col gap-1">
            {doneToday.map((task) => (
              <li key={task.id}>
                <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked
                    aria-label={`Reopen ${task.title}`}
                    onChange={() => void reopenTask(task.id)}
                    className="w-[18px] h-[18px] flex-none cursor-pointer accent-accent"
                  />
                  <span className="text-[15px] text-muted line-through">{task.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
