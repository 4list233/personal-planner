'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlannerStore } from '@/lib/store';
import { Task } from '@/lib/types';
import { BOARD_COLUMNS, BoardColumn, columnForTask, compareBoardTasks, patchForColumn } from '@/lib/planner';
import TaskCard from './TaskCard';
import ImageTaskImport from './ImageTaskImport';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { columnCollisionDetection } from '@/lib/dnd';

const COLUMN_META: { column: BoardColumn; color: string; hint: string }[] = [
  { column: 'Inbox', color: 'bg-orange-50', hint: 'New and unsorted work' },
  { column: 'This Week', color: 'bg-yellow-50', hint: "This week's plan" },
  { column: 'Today', color: 'bg-green-50', hint: 'On today’s list' },
  { column: 'In Progress', color: 'bg-blue-50', hint: 'Started' },
  { column: 'Waiting', color: 'bg-purple-50', hint: 'Blocked or waiting on someone' },
  { column: 'Unsorted', color: 'bg-gray-50', hint: 'Doesn’t match a stage yet' },
];

function columnDropId(column: BoardColumn) {
  return `column:${column.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function SortableTaskCard({ task }: { task: Task }) {
  const router = useRouter();
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
      <TaskCard task={task} onClick={() => router.push(`/tasks/${task.id}`)} />
    </div>
  );
}

function DroppableColumn({
  column,
  color,
  hint,
  tasks,
}: {
  column: BoardColumn;
  color: string;
  hint: string;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(column) });

  return (
    <div className="flex-shrink-0 w-full min-w-[240px]">
      <div
        ref={setNodeRef}
        className={
          `rounded-lg ${color} p-3 min-h-[140px] md:min-h-[240px] transition ` +
          (isOver ? 'ring-2 ring-blue-500 ring-offset-2 brightness-105' : '')
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            {column}
            <span className="bg-white text-gray-600 text-xs px-2 py-0.5 rounded-full">{tasks.length}</span>
          </h2>
        </div>
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 min-h-[80px] md:min-h-[200px]">
            {tasks.map((task) => (
              <SortableTaskCard key={task.id} task={task} />
            ))}
            {tasks.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4 select-none">{hint}</div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default function BoardView() {
  const router = useRouter();
  const { tasks, updateTask, submitPartial } = usePlannerStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columnByDropId = useMemo(() => {
    const map: Record<string, BoardColumn> = {};
    for (const column of BOARD_COLUMNS) map[columnDropId(column)] = column;
    return map;
  }, []);

  const tasksByColumn = useMemo(() => {
    const grouped = new Map<BoardColumn, Task[]>();
    for (const column of BOARD_COLUMNS) grouped.set(column, []);
    for (const task of tasks) {
      const column = columnForTask(task);
      if (!column) continue;
      grouped.get(column)?.push(task);
    }
    for (const list of grouped.values()) list.sort(compareBoardTasks);
    return grouped;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((item) => item.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const taskId = String(active.id);
    const dragged = tasks.find((item) => item.id === taskId);
    if (!dragged) return;

    let nextColumn = columnByDropId[String(over.id)];
    if (!nextColumn) {
      const target = tasks.find((item) => item.id === over.id);
      if (!target) return;
      const targetColumn = columnForTask(target);
      if (!targetColumn) return;
      nextColumn = targetColumn;
    }

    if (columnForTask(dragged) === nextColumn) return;
    const patch = patchForColumn(nextColumn);
    if (!patch) return;

    updateTask(taskId, patch);
    submitPartial(taskId, patch);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={columnCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {COLUMN_META.map(({ column, color, hint }) => (
            <DroppableColumn
              key={column}
              column={column}
              color={color}
              hint={hint}
              tasks={tasksByColumn.get(column) || []}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <TaskCard task={activeTask} dragging onClick={() => router.push(`/tasks/${activeTask.id}`)} />
          ) : null}
        </DragOverlay>
      </DndContext>
      <p className="mt-4 text-xs text-gray-400">
        Done and archived tasks stay in Notion and are hidden here. Anything else that doesn’t match a stage lands in Unsorted.
      </p>
      <div className="mt-8">
        <ImageTaskImport />
      </div>
    </>
  );
}
