'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePlannerStore } from '@/lib/store';
import DashboardHeader from '@/components/DashboardHeader';

// Lazy load views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });
const WeekdaysView = dynamic(() => import('@/components/WeekdaysView'), { ssr: false });
const CalendarView = dynamic(() => import('@/components/CalendarView'), { ssr: false });
const TaskModal = dynamic(() => import('@/components/TaskModal'), { ssr: false });

export default function Home() {
  const { currentView, setTasks } = usePlannerStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    
    const loadTasks = async () => {
      try {
        const res = await fetch('/api/tasks', { cache: 'no-store' });
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
  }, [setTasks]);

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-500">
            {loading ? 'Loading tasks...' : 'Loading...'}
          </div>
        </div>
      </div>
    );
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
