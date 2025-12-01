'use client';

import { usePlannerStore } from '@/lib/store';
import { Task, TaskStatus } from '@/lib/types';
import TaskCard from './TaskCard';
import ImageTaskImport from './ImageTaskImport';
import { Plus, ChevronDown, ChevronRight, Archive } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';

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

interface DroppableColumnProps {
  status: TaskStatus;
  color: string;
  tasks: Task[];
  droppableId: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

function DroppableColumn({ status, color, tasks, isCollapsed, onToggle, droppableId }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({
    id: droppableId,
  });
  const { setSelectedTask, setIsModalOpen } = usePlannerStore();

  const isArchived = status === 'Archived';

  if (isArchived && isCollapsed) {
    return (
      <div className="flex-shrink-0 w-full min-w-[240px] max-w-[280px]">
        <div 
          ref={setNodeRef}
          className={`w-full rounded-lg ${color} p-4 min-h-[100px] transition-colors border-2 border-dashed border-transparent hover:border-gray-300`}
        >
          <button
            onClick={onToggle}
            className="w-full"
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
          <div className="mt-2 text-xs text-gray-500 text-center">
            Drop tasks here to archive
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-full min-w-[240px] max-w-[280px]">
      <div ref={setNodeRef} className={`rounded-lg ${color} p-4 min-h-[300px]`}>
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

  // Slug mapping avoids whitespace/special-character issues in droppable ids
  const statusToId = (s: TaskStatus) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const idToStatus = useMemo(() => {
    const map: Record<string, TaskStatus> = {};
    for (const { status } of statuses) map[statusToId(status)] = status;
    return map;
  }, []);

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
    let newStatus: TaskStatus | undefined;

    // If dropped over a column droppable, map id back to status
    const byColumn = idToStatus[ String(over.id) ];
    if (byColumn) {
      newStatus = byColumn;
    } else {
      // If we dropped on a task, find that task's status
      const targetTask = tasks.find((t) => t.id === over.id);
      if (!targetTask) return;
      newStatus = targetTask.status;
    }

    // Only update if the status actually changed
    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask && newStatus && draggedTask.status !== newStatus) {
      // Local optimistic update
      updateTask(taskId, { status: newStatus });
      // Fire-and-forget persist of just the status (ignore drafts)
      submitPartial(taskId, { status: newStatus });
    }
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks
      .filter((task) => task.status === status)
      .sort((a, b) => {
        // Sort by due date: earliest first, tasks without dates go to the end
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
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
              droppableId={statusToId(status)}
              isCollapsed={isArchived ? isArchiveCollapsed : false}
              onToggle={isArchived ? () => setIsArchiveCollapsed(!isArchiveCollapsed) : undefined}
            />
          );
        })}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="opacity-90">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="mt-8">
        <ImageTaskImport />
      </div>
    </>
  );
}
