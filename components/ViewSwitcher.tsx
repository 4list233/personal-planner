'use client';

import { ViewType } from '@/lib/types';
import { Calendar, LayoutGrid, Calendar as CalendarIcon } from 'lucide-react';

interface ViewSwitcherProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export default function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const views: { type: ViewType; label: string; icon: React.ReactNode }[] = [
    { type: 'board', label: 'Board View', icon: <LayoutGrid size={16} /> },
    { type: 'weekdays', label: 'Weekdays View', icon: <Calendar size={16} /> },
    { type: 'calendar', label: 'Calendar', icon: <CalendarIcon size={16} /> },
  ];

  return (
    <div className="flex gap-2 border border-gray-200 rounded-lg p-1 bg-gray-50">
      {views.map((view) => (
        <button
          key={view.type}
          onClick={() => onViewChange(view.type)}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${
              currentView === view.type
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }
          `}
        >
          {view.icon}
          {view.label}
        </button>
      ))}
    </div>
  );
}
