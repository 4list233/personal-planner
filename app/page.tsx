'use client';

import { useEffect, useState } from 'react';
import { usePlannerStore } from '@/lib/store';
import { mockTasks } from '@/lib/mock-data';
import DashboardHeader from '@/components/DashboardHeader';

// Lazy load views to avoid compilation hang
const BoardView = dynamic(() => import('@/components/BoardView'), { ssr: false });
const WeekdaysView = dynamic(() => import('@/components/WeekdaysView'), { ssr: false });
const CalendarView = dynamic(() => import('@/components/CalendarView'), { ssr: false });
const TaskModal = dynamic(() => import('@/components/TaskModal'), { ssr: false });

import dynamic from 'next/dynamic';

export default function Home() {
  const { currentView, setTasks } = usePlannerStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Initialize with mock data
    setTasks(mockTasks);
  }, [setTasks]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-gray-500">Loading...</div>
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
