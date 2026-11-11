'use client';

import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { columnCollisionDetection } from '@/lib/dnd';
import { usePlannerStore } from '@/lib/store';
import type { Task } from '@/lib/types';
import { useBoardLanes } from '@/lib/use-board-lanes';
import { BOARD_LANES, laneOf, patchForLane, type Lane } from '@/lib/views';
import TaskCard from './TaskCard';

const EMPTY_TEXT: Record<Lane, string> = {
  Today: 'Nothing planned today',
  Tomorrow: 'Drag something here',
  'This Week': 'Nothing this week',
  Inbox: 'Inbox is clear',
  Done: 'Drop here to complete',
};

// Done only grows. Showing it all by default would dwarf the lanes beside it.
const DONE_PREVIEW = 25;

function DraggableCard({ task }: { task: Task }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} {...listeners}>
      <TaskCard task={task} />
    </div>
  );
}

function LaneColumn({ lane, tasks }: { lane: Lane; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  const [showAll, setShowAll] = useState(false);
  const isDoneLane = lane === 'Done';
  const shown = isDoneLane && !showAll ? tasks.slice(0, DONE_PREVIEW) : tasks;

  return (
    <section
      ref={setNodeRef}
      aria-label={lane}
      className={
        'min-h-[560px] rounded-xl p-2.5 transition-colors ' +
        (isDoneLane ? (isOver ? 'bg-accent-strong ' : 'bg-accent-soft ') : isOver ? 'bg-lane-over ' : 'bg-lane ') +
        (isOver ? 'outline-2 -outline-offset-2 outline-accent' : '')
      }
    >
      <div className="flex items-baseline gap-2 px-1 pt-1 pb-2.5">
        <h2 className="text-sm font-semibold">{lane}</h2>
        <span className="text-[13px] text-muted">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line-strong px-2 py-5 text-center text-[13px] text-muted">
            {EMPTY_TEXT[lane]}
          </div>
        ) : null}
        {tasks.length > shown.length ? (
          <button type="button" onClick={() => setShowAll(true)} className="py-2 text-[13px] font-medium text-accent cursor-pointer">
            Show all {tasks.length}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function BoardView() {
  const { lanes, today, tomorrow } = useBoardLanes();
  const tasks = usePlannerStore((state) => state.tasks);
  const saveChange = usePlannerStore((state) => state.saveChange);
  const completeTask = usePlannerStore((state) => state.completeTask);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    // Far enough that a click with a shaky hand still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A held press on tablets, so a swipe can still scroll the lanes.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((task) => task.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    if (!event.over) return;
    const lane = event.over.id as Lane;
    const dragged = tasks.find((task) => task.id === event.active.id);
    if (!dragged || laneOf(dragged, today, tomorrow) === lane) return;
    if (lane === 'Done') void completeTask(dragged.id);
    else void saveChange(dragged.id, patchForLane(dragged, lane, today, tomorrow));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
    >
      <div className="overflow-x-auto">
        {/* 150px is the widest lane that still fits five, Done included, beside the panel at 1280. */}
        <div className="grid grid-cols-[repeat(5,minmax(150px,1fr))] items-start gap-2.5">
          {BOARD_LANES.map((lane) => (
            <LaneColumn key={lane} lane={lane} tasks={lanes[lane]} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
