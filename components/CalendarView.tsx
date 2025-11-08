'use client';

import { usePlannerStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function CalendarView() {
  const { tasks, setSelectedTask, setIsModalOpen, updateTask, submitPartial } = usePlannerStore();
  const [FullCalendar, setFullCalendar] = useState<any>(null);
  const [dayGridPlugin, setDayGridPlugin] = useState<any>(null);
  const [interactionPlugin, setInteractionPlugin] = useState<any>(null);

  useEffect(() => {
    // Dynamically import FullCalendar to avoid SSR issues
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

  if (!FullCalendar || !dayGridPlugin || !interactionPlugin) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      </div>
    );
  }

  const events = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    date: task.dueDate,
    backgroundColor: getEventColor(task.status),
    borderColor: getEventColor(task.status),
    extendedProps: {
      task,
    },
  }));

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

  const handleEventDrop = (info: any) => {
    const taskId = info.event.id;
    const newDate = info.event.startStr;
    
    updateTask(taskId, { dueDate: newDate });
    submitPartial(taskId, { dueDate: newDate });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
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
