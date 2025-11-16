'use client';

// Disable caching of this page in production by using a no-store fetch for data already.
// (Removed export const dynamic to avoid name clash with next/dynamic import.)

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { usePlannerStore, setAuthTokenGetter } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import DashboardHeader from '@/components/DashboardHeader';

// Lazy load views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });
const WeekdaysView = dynamic(() => import('@/components/WeekdaysView'), { ssr: false });
const CalendarView = dynamic(() => import('@/components/CalendarView'), { ssr: false });
const TaskModal = dynamic(() => import('@/components/TaskModal'), { ssr: false });

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, getIdToken } = useAuth();
  const { currentView, setTasks } = usePlannerStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Set up auth token getter for store
  useEffect(() => {
    if (user) {
      setAuthTokenGetter(getIdToken);
    }
  }, [user, getIdToken]);

  useEffect(() => {
    setMounted(true);
    
    const loadTasks = async () => {
      // Don't load tasks if not authenticated
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const token = await getIdToken();
        const res = await fetch('/api/tasks', { 
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        console.log(`✅ Loaded ${tasks.length} task(s) from Notion via API`);
        setTasks(tasks);
      } catch (error) {
        console.error('❌ Failed to load tasks from API:', error);
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadTasks();
  }, [user, getIdToken, setTasks]);

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
        {currentView === 'board' && <BoardView />}
        {currentView === 'weekdays' && <WeekdaysView />}
        {currentView === 'calendar' && <CalendarView />}
      </main>

      <TaskModal />
    </div>
  );
}
