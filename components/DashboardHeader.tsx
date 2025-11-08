'use client';

import { usePlannerStore } from '@/lib/store';
import ViewSwitcher from './ViewSwitcher';
import { Filter, ArrowUpDown, Search, Plus, ExternalLink } from 'lucide-react';

export default function DashboardHeader() {
  const { currentView, setCurrentView, addTask, setSelectedTask, setIsModalOpen } = usePlannerStore();

  const dbIdPublic = process.env.NEXT_PUBLIC_NOTION_DATABASE_ID;
  // Show the button placeholder even if the env var isn't set so it's clear in prod
  const notionDbUrl = dbIdPublic && dbIdPublic !== 'placeholder_id'
    ? `https://www.notion.so/${dbIdPublic.replace(/-/g, '')}`
    : undefined;

  const handleNewTask = async () => {
    // Always create a local draft first; no server call until user submits
    const tempTask = {
      id: `temp-${Date.now()}`,
      title: 'New Task',
      dueDate: new Date().toISOString().split('T')[0],
      dateCreated: new Date().toISOString(),
      status: 'To Do' as const,
      weekday: 'No Weekdays' as const,
      daysUntilDue: 0,
      todoItems: [],
    } as const;
    addTask(tempTask as any);
    setSelectedTask(tempTask as any);
    setIsModalOpen(true);
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="px-4 py-4 max-w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 flex items-center gap-2">
              Scrappy Tool 2.0
            </h1>
            <p className="text-sm text-gray-500 mt-1">Forest's Personal Planner 😁</p>
          </div>
          <div className="flex items-center gap-2">
            {notionDbUrl ? (
              <a
                href={notionDbUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-2 text-sm text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                title="Open Notion database"
              >
                <ExternalLink size={16} />
                Notion DB
              </a>
            ) : (
              <span
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 rounded-lg"
                title="Set NEXT_PUBLIC_NOTION_DATABASE_ID in environment to enable link"
              >
                <ExternalLink size={16} />
                Notion DB
              </span>
            )}
          <button 
            onClick={handleNewTask}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            <Plus size={16} />
            Add Task
          </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />
          
          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Search size={16} />
              <span className="hidden sm:inline">Search</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <Filter size={16} />
              <span className="hidden sm:inline">Filter</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowUpDown size={16} />
              <span className="hidden sm:inline">Sort</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
