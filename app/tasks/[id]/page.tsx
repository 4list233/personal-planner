'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getAuthHeaders, setAuthTokenGetter, usePlannerStore } from '@/lib/store';
import TaskEditor from '@/components/TaskEditor';
import type { Task } from '@/lib/types';

export default function TaskPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const tasks = usePlannerStore((state) => state.tasks);
  const addTask = usePlannerStore((state) => state.addTask);
  const updateTask = usePlannerStore((state) => state.updateTask);
  const [missing, setMissing] = useState(false);
  const [refreshing, setRefreshing] = useState(!id.startsWith('temp-'));
  const edited = useRef(false);

  const task = tasks.find((item) => item.id === id);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) setAuthTokenGetter(getIdToken);
    // getIdToken is recreated every render; the uid is the stable signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !id || id.startsWith('temp-')) return;
    let cancelled = false;
    setRefreshing(true);
    setMissing(false);

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/tasks/${id}`, { cache: 'no-store', headers });
        if (cancelled) return;
        if (response.status === 404 || !response.ok) {
          const currentTask = usePlannerStore.getState().tasks.find((item) => item.id === id);
          if (!currentTask) setMissing(true);
          else updateTask(id, { syncChecklist: false });
          return;
        }
        const data = await response.json();
        const fresh = data.task as Task | undefined;
        if (!fresh) return;
        const current = usePlannerStore.getState().tasks.find((item) => item.id === id);
        const loaded = { ...fresh, syncChecklist: true };
        if (!current) {
          addTask(loaded);
          return;
        }
        if (current.pendingSync || edited.current) {
          updateTask(id, { syncChecklist: true });
          return;
        }
        updateTask(id, {
          todoItems: fresh.todoItems,
          lastEditedTime: fresh.lastEditedTime,
          syncChecklist: true,
        });
      } catch (error) {
        console.error('Failed to load task', error);
        const current = usePlannerStore.getState().tasks.find((item) => item.id === id);
        if (current) updateTask(id, { syncChecklist: false });
        else setMissing(true);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, id, addTask, updateTask]);

  useEffect(() => {
    if (task?.title) document.title = `${task.title} — Personal Planner`;
  }, [task?.title]);

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        {authLoading ? 'Authenticating...' : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            ← Board
          </Link>
          <p className="text-sm text-gray-500">
            {refreshing ? 'Refreshing from Notion…' : "Forest's planner"}
          </p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {task && !refreshing ? (
          <TaskEditor
            task={task}
            variant="page"
            onClose={() => router.push('/')}
            onEdit={() => {
              edited.current = true;
            }}
          />
        ) : missing && !refreshing ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900">Task not on your board</h1>
            <p className="mt-2 text-sm text-gray-500">
              It may be archived, or it belongs to a different email.
            </p>
          </div>
        ) : (
          <div className="text-gray-500 text-sm">Loading task…</div>
        )}
      </main>
    </div>
  );
}
