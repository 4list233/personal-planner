'use client';

import { usePlannerStore } from '@/lib/store';
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { partitionTasksForCalendar } from '@/lib/calendar-utils';

export default function CalendarView() {
  const { tasks, setSelectedTask, setIsModalOpen, updateTask, submitPartial } = usePlannerStore();
  const [FullCalendar, setFullCalendar] = useState<any>(null);
  const [dayGridPlugin, setDayGridPlugin] = useState<any>(null);
  const [interactionPlugin, setInteractionPlugin] = useState<any>(null);
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null);
  const [showOutOfRange, setShowOutOfRange] = useState(false);

  useEffect(() => {
    Promise.all([
      import('@fullcalendar/react'),
      import('@fullcalendar/daygrid'),
      import('@fullcalendar/interaction'),
    ]).then(([fcModule, dayGridModule, interactionModule]) => {
      setFullCalendar(() => fcModule.default);
      setDayGridPlugin(() => dayGridModule.default);
      setInteractionPlugin(() => interactionModule.default);
    });
  }, []);

  const { valid, outOfSaneRange } = useMemo(
    () => partitionTasksForCalendar(tasks),
    [tasks]
  );

  const events = useMemo(
    () =>
      valid.map(({ task }) => ({
        id: task.id,
        title: task.title,
        date: task.dueDate,
        backgroundColor: getEventColor(task.status),
        borderColor: getEventColor(task.status),
        extendedProps: { task },
      })),
    [valid]
  );

  const outOfRangeTasks = useMemo(() => {
    const fromSane = outOfSaneRange;
    if (!viewRange) return fromSane;
    const fromView = valid
      .filter(({ date }) => date < viewRange.start || date >= viewRange.end)
      .map(({ task }) => task);
    return [...fromView, ...fromSane];
  }, [valid, outOfSaneRange, viewRange]);

  const calendarReady = FullCalendar && dayGridPlugin && interactionPlugin;

  const handleEventDrop = (info: any) => {
    const taskId = info.event.id;
    const newDate = info.event.startStr;
    updateTask(taskId, { dueDate: newDate });
    submitPartial(taskId, { dueDate: newDate });
  };

  if (!calendarReady) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {outOfRangeTasks.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3">
          <span className="text-sm text-amber-900">
            {outOfRangeTasks.length} task{outOfRangeTasks.length === 1 ? ' has a date' : 's have dates'} outside this view
          </span>
          <button
            onClick={() => setShowOutOfRange(true)}
            className="text-sm font-medium text-amber-900 underline hover:no-underline"
          >
            Show list
          </button>
        </div>
      )}
      {showOutOfRange && (
        <div
          className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
          onClick={() => setShowOutOfRange(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Tasks outside this view</h3>
              <button
                onClick={() => setShowOutOfRange(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {outOfRangeTasks.map((t) => (
                <li
                  key={t.id}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedTask(t);
                    setIsModalOpen(true);
                    setShowOutOfRange(false);
                  }}
                >
                  <div className="text-sm font-medium text-gray-900 truncate">{t.title}</div>
                  <div className="text-xs text-gray-500">
                    {(() => {
                      if (!t.dueDate) return '';
                      const d = new Date(t.dueDate);
                      if (Number.isNaN(d.getTime())) return t.dueDate;
                      return format(d, 'MMM d, yyyy');
                    })()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek',
        }}
        height="auto"
        editable={true}
        droppable={true}
        datesSet={(arg: any) => {
          setViewRange({ start: arg.start, end: arg.end });
        }}
        eventDrop={handleEventDrop}
        eventClick={(info: any) => {
          const task = info.event.extendedProps.task;
          setSelectedTask(task);
          setIsModalOpen(true);
        }}
        dateClick={(info: any) => {
          console.log('Date clicked:', info.dateStr);
        }}
        eventContent={(arg: any) => {
          const task = arg.event.extendedProps.task;
          const weekday = task.weekday || 'No Weekdays';

          return (
            <div className="p-1 text-xs overflow-hidden">
              <div className="font-medium truncate">{arg.event.title}</div>
              {weekday !== 'No Weekdays' && (
                <div className="text-[10px] opacity-75">🔵 {weekday}</div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}

function getEventColor(status: string) {
  const colors: Record<string, string> = {
    'Reminders': '#9333ea',
    'Long Term Deadlines': '#ec4899',
    'To Do': '#f59e0b',
    'Doing Today': '#10b981',
    'Doing Tomorrow': '#eab308',
    'Archived': '#6b7280',
  };
  return colors[status] || '#6b7280';
}
