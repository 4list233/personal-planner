'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePlannerStore } from '@/lib/store';
import { mockTasks } from '@/lib/mock-data';
import { fetchTasksFromNotion } from '@/lib/notion';
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
    
    // Try to fetch from Notion, fallback to mock data
    const loadTasks = async () => {
      try {
        const notionTasks = await fetchTasksFromNotion();
        if (notionTasks && notionTasks.length > 0) {
          console.log('✅ Loaded tasks from Notion:', notionTasks.length);
          setTasks(notionTasks);
        } else {
          console.log('📝 Using mock data (Notion returned no tasks)');
          setTasks(mockTasks);
        }
      } catch (error) {
        console.error('❌ Failed to load from Notion, using mock data:', error);
        setTasks(mockTasks);
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
