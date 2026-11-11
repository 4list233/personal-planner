'use client';

import { useMemo, useState } from 'react';
import { usePlannerStore } from '@/lib/store';
import { todayInUserTz } from '@/lib/time';
import { isOverdue } from '@/lib/views';
import ImageTaskImport from './ImageTaskImport';

function headerDate(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function DashboardHeader() {
  const syncError = usePlannerStore((state) => state.syncError);
  const addQuickTask = usePlannerStore((state) => state.addQuickTask);
  const tasks = usePlannerStore((state) => state.tasks);
  const lastFetchedAt = usePlannerStore((state) => state.lastFetchedAt);
  const [draft, setDraft] = useState('');
  const [importing, setImporting] = useState(false);

  const today = useMemo(() => todayInUserTz(), [lastFetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const overdue = useMemo(() => tasks.filter((task) => isOverdue(task, today)).length, [tasks, today]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    void addQuickTask(title);
  };

  return (
    <header className="px-4 md:px-6 pt-5 pb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Planner</h1>
        <span className="text-sm text-muted">{headerDate(today)}</span>
        {overdue > 0 ? <span className="text-sm font-semibold text-late">{overdue} overdue</span> : null}
        {syncError ? (
          <span role="status" className="text-sm text-late">
            Couldn’t reach Notion. Showing the last saved list.
          </span>
        ) : null}
        <div className="flex gap-2 w-full md:w-auto md:ml-auto md:flex-[0_1_460px]">
          <form onSubmit={submit} className="flex flex-1 min-w-0 gap-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="New task"
              placeholder="Add a task to Inbox"
              className="flex-1 min-w-0 h-11 px-3 border border-line-strong rounded-lg bg-white text-sm text-ink placeholder:text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-accent"
            />
            <button type="submit" className="h-11 px-4 rounded-lg bg-accent text-white text-sm font-semibold cursor-pointer">
              Add
            </button>
          </form>
          <button
            type="button"
            aria-expanded={importing}
            onClick={() => setImporting(!importing)}
            className="h-11 px-3 rounded-lg border border-line-strong bg-white text-sm cursor-pointer hover:bg-chip"
          >
            Import
          </button>
        </div>
      </div>
      {importing ? <ImageTaskImport /> : null}
    </header>
  );
}
