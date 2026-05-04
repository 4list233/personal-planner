'use client';

// Disable caching of this page in production by using a no-store fetch for data already.
// (Removed export const dynamic to avoid name clash with next/dynamic import.)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePlannerStore, setAuthTokenGetter } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import DashboardHeader from '@/components/DashboardHeader';
import ViewErrorBoundary from '@/components/ViewErrorBoundary';

// Lazy load views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });
const WeekdaysView = dynamic(() => import('@/components/WeekdaysView'), { ssr: false });
const CalendarView = dynamic(() => import('@/components/CalendarView'), { ssr: false });
const MatrixView = dynamic(() => import('@/components/MatrixView'), { ssr: false });
const TaskModal = dynamic(() => import('@/components/TaskModal'), { ssr: false });

const VIEW_TITLES: Record<string, string> = {
  board: 'Personal Planner',
  weekdays: 'Weekdays — Personal Planner',
  calendar: 'Calendar — Personal Planner',
  matrix: 'Matrix — Personal Planner',
};

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const currentView = usePlannerStore((s) => s.currentView);
  const fetchTasks = usePlannerStore((s) => s.fetchTasks);
  const lastFetchedAt = usePlannerStore((s) => s.lastFetchedAt);
  const [mounted, setMounted] = useState(false);

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Set up auth token getter for the store. getIdToken is recreated on every
  // AuthProvider render so we register it via a ref-stable user id dependency
  // and read the latest function inside the store call instead.
  useEffect(() => {
    if (user) {
      setAuthTokenGetter(getIdToken);
    }
    // intentionally not depending on getIdToken — it's recreated each render
    // and would cause this to re-run on every render of AuthProvider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Update document title to reflect the active view
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = VIEW_TITLES[currentView] ?? 'Personal Planner';
    }
  }, [currentView]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Single source of truth for the initial fetch: this effect, dedupe-guarded
  // by the store. Re-runs only when the signed-in user actually changes.
  useEffect(() => {
    if (!user) return;
    fetchTasks();
  }, [user?.uid, fetchTasks]);

  // Loading until we've completed at least one fetch for this user.
  const loading = !!user && lastFetchedAt === null;

  // Show loading state while checking auth or loading tasks
  if (!mounted || authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-500">
            {authLoading ? 'Authenticating...' : loading ? 'Loading tasks...' : 'Loading...'}
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, return null (redirect will happen via useEffect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      
      <main className="max-w-[100vw] mx-auto px-4 py-4 overflow-x-hidden">
        <ViewErrorBoundary
          key={currentView}
          viewName={
            currentView.charAt(0).toUpperCase() + currentView.slice(1)
          }
          title={VIEW_TITLES[currentView] ?? 'Personal Planner'}
        >
          {currentView === 'board' && <BoardView />}
          {currentView === 'weekdays' && <WeekdaysView />}
          {currentView === 'calendar' && <CalendarView />}
          {currentView === 'matrix' && <MatrixView />}
        </ViewErrorBoundary>
      </main>

      <TaskModal />
    </div>
  );
}
