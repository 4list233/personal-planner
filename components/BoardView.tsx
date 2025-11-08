'use client';

import { usePlannerStore } from '@/lib/store';
import { Task, TaskStatus } from '@/lib/types';
import TaskCard from './TaskCard';
import { Plus, ChevronDown, ChevronRight, Archive } from 'lucide-react';
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

const statuses: { status: TaskStatus; color: string }[] = [
  { status: 'Reminders', color: 'bg-purple-50' },
  { status: 'Long Term Deadlines', color: 'bg-pink-50' },
  { status: 'To Do', color: 'bg-orange-50' },
  { status: 'Doing Today', color: 'bg-green-50' },
  { status: 'Doing Tomorrow', color: 'bg-yellow-50' },
  { status: 'Archived', color: 'bg-gray-50' },
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

function DroppableColumn({ status, color, tasks, isCollapsed, onToggle }: { 
  status: TaskStatus; 
  color: string; 
  tasks: Task[];
  isCollapsed?: boolean;
  onToggle?: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: status,
  });
  const { setSelectedTask, setIsModalOpen } = usePlannerStore();

  const isArchived = status === 'Archived';

  if (isArchived && isCollapsed) {
    return (
      <div ref={setNodeRef} className="flex-shrink-0 w-full min-w-[240px] max-w-[280px]">
        <button
          onClick={onToggle}
          className={`w-full rounded-lg ${color} p-4 hover:bg-gray-100 transition-colors`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive size={16} className="text-gray-600" />
              <h2 className="font-semibold text-gray-900 text-sm">
                {status}
              </h2>
              <span className="bg-white text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {tasks.length}
              </span>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className="flex-shrink-0 w-full min-w-[240px] max-w-[280px]">
      <div className={`rounded-lg ${color} p-4`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            {isArchived && <Archive size={16} className="text-gray-600" />}
            {status}
            <span className="bg-white text-gray-600 text-xs px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          </h2>
          {isArchived && (
            <button onClick={onToggle} className="text-gray-600 hover:text-gray-900">
              <ChevronDown size={16} />
            </button>
          )}
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

export default function BoardView() {
  const { tasks, updateTask, submitPartial } = usePlannerStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isArchiveCollapsed, setIsArchiveCollapsed] = useState(true);

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
    
    // Check if we dropped on a column (status) or on another task
    let newStatus: TaskStatus;
    
    // If over.id is a status column, use it directly
    const statusList: TaskStatus[] = [
      'Reminders',
      'Long Term Deadlines',
      'To Do',
      'Doing Today',
      'Doing Tomorrow',
      'Archived'
    ];
    
    if (statusList.includes(over.id as TaskStatus)) {
      newStatus = over.id as TaskStatus;
    } else {
      // If we dropped on a task, find that task's status
      const targetTask = tasks.find((t) => t.id === over.id);
      if (!targetTask) return;
      newStatus = targetTask.status;
    }

    // Only update if the status actually changed
    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask && draggedTask.status !== newStatus) {
      // Local optimistic update
      updateTask(taskId, { status: newStatus });
      // Fire-and-forget persist of just the status (ignore drafts)
      submitPartial(taskId, { status: newStatus });
    }
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((task) => task.status === status);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statuses.map(({ status, color }) => {
          const statusTasks = getTasksByStatus(status);
          const isArchived = status === 'Archived';
          return (
            <DroppableColumn
              key={status}
              status={status}
              color={color}
              tasks={statusTasks}
              isCollapsed={isArchived ? isArchiveCollapsed : false}
              onToggle={isArchived ? () => setIsArchiveCollapsed(!isArchiveCollapsed) : undefined}
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
