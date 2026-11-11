'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePlannerStore, setAuthTokenGetter } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { useIsPhone } from '@/lib/use-board-lanes';
import { useBackgroundRefresh, useDetailUrl, usePlannerKeyboard } from '@/lib/use-planner-sync';
import DashboardHeader from '@/components/DashboardHeader';
import PhoneLists from '@/components/PhoneLists';
import ViewErrorBoundary from '@/components/ViewErrorBoundary';

// Lazy load the heavy views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });
const TaskModal = dynamic(() => import('@/components/TaskModal'), { ssr: false });
const TaskDetail = dynamic(() => import('@/components/TaskDetail'), { ssr: false });

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const fetchTasks = usePlannerStore((s) => s.fetchTasks);
  const loadCachedTasks = usePlannerStore((s) => s.loadCachedTasks);
  const setCacheOwner = usePlannerStore((s) => s.setCacheOwner);
  const lastFetchedAt = usePlannerStore((s) => s.lastFetchedAt);
  const hasRows = usePlannerStore((s) => s.tasks.length > 0);
  const syncError = usePlannerStore((s) => s.syncError);
  const isPhone = useIsPhone();
  const [mounted, setMounted] = useState(false);

  useDetailUrl();
  usePlannerKeyboard();
  useBackgroundRefresh(!!user);

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Single source of truth for the initial fetch: this effect, dedupe-guarded
  // by the store. Re-runs only when the signed-in user actually changes.
  useEffect(() => {
    if (!user) return;
    // getIdToken is recreated every render, so it is registered here against
    // the stable uid and has to happen before the fetch below.
    setAuthTokenGetter(getIdToken);
    setCacheOwner(user.uid);
    loadCachedTasks(user.uid);
    void fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, fetchTasks, loadCachedTasks, setCacheOwner]);

  // Cached rows paint at once; a first load with no cache has nothing to show.
  const loading = !!user && lastFetchedAt === null && !hasRows && !syncError;

  // Show loading state while checking auth or loading tasks
  if (!mounted || authLoading || loading) {
    return (
      <div className="min-h-screen bg-ground font-sans flex items-center justify-center text-muted">
        {authLoading ? 'Signing in…' : 'Loading your tasks…'}
      </div>
    );
  }

  // If not authenticated, return null (redirect will happen via useEffect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-ground text-ink font-sans">
      <DashboardHeader />
      <main className="flex items-start gap-4 px-4 md:px-6 pb-6">
        <div className="flex-1 min-w-0">
          <ViewErrorBoundary viewName="Board" title="Personal Planner">
            {isPhone ? <PhoneLists /> : <BoardView />}
          </ViewErrorBoundary>
        </div>
        <TaskDetail />
      </main>
      <TaskModal />
    </div>
  );
}
