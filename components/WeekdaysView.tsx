'use client';

import { usePlannerStore } from '@/lib/store';
import { Weekday, Task } from '@/lib/types';
import TaskCard from './TaskCard';
import { Plus } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';

const weekdays: { day: Weekday; color: string }[] = [
  { day: 'No Weekdays', color: 'bg-blue-50' },
  { day: 'Sunday', color: 'bg-green-50' },
  { day: 'Monday', color: 'bg-blue-50' },
  { day: 'Tuesday', color: 'bg-purple-50' },
  { day: 'Wednesday', color: 'bg-pink-50' },
  { day: 'Thursday', color: 'bg-indigo-50' },
  { day: 'Friday', color: 'bg-red-50' },
  { day: 'Saturday', color: 'bg-yellow-50' },
];

function SortableTaskCard({ task }: { task: Task }) {
  const { setSelectedTask, setIsModalOpen } = usePlannerStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        task={task}
        onClick={() => {
          setSelectedTask(task);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}

function DroppableWeekday({ day, color, tasks }: { day: Weekday; color: string; tasks: Task[] }) {
  const { setNodeRef } = useDroppable({
    id: day,
  });

  return (
    <div ref={setNodeRef} className="flex flex-col">
      <div className={`rounded-lg ${color} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            {day === 'No Weekdays' ? '🔵 No Weekdays' : `● ${day}`}
            <span className="bg-white text-gray-600 text-xs px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </h2>
        </div>

        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 min-h-[200px]">
            {tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function WeekdaysView() {
  const { tasks, updateTask, submitPartial } = usePlannerStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    
    // Check if we dropped on a weekday or on another task
    let newWeekday: Weekday;
    
    const weekdayList: Weekday[] = [
      'No Weekdays',
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    
    if (weekdayList.includes(over.id as Weekday)) {
      newWeekday = over.id as Weekday;
    } else {
      // If we dropped on a task, find that task's weekday
      const targetTask = tasks.find((t) => t.id === over.id);
      if (!targetTask) return;
      newWeekday = targetTask.weekday || 'No Weekdays';
    }

    // Only update if the weekday actually changed
    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask && draggedTask.weekday !== newWeekday) {
      updateTask(taskId, { weekday: newWeekday });
      submitPartial(taskId, { weekday: newWeekday });
    }
  };

  const getTasksByWeekday = (day: Weekday) => {
    return tasks.filter((task) => task.weekday === day || (!task.weekday && day === 'No Weekdays'));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {weekdays.map(({ day, color }) => {
          const dayTasks = getTasksByWeekday(day);
          return (
            <DroppableWeekday
              key={day}
              day={day}
              color={color}
              tasks={dayTasks}
            />
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="opacity-90">
            <TaskCard task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
