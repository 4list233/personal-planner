'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { useToday, useVisibleIds } from '@/lib/use-board-lanes';
import { addDays, daysFrom, isOpen, patchForDay, patchForMove, plannedFor } from '@/lib/views';
import TaskCard from './TaskCard';

const UNPLANNED = 'unplanned';
const DAY_PREFIX = 'day:';

function dayLabel(day: string, today: string, tomorrow: string): { name: string; date: string } {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, date, 12));
  const short = value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const name =
    day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : value.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return { name, date: short };
}

function DraggableCard({ task }: { task: Task }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} {...listeners}>
      <TaskCard task={task} />
    </div>
  );
}

function Column({
  id,
  title,
  subtitle,
  tasks,
  empty,
  highlight = false,
}: {
  id: string;
  title: string;
  subtitle?: string;
  tasks: Task[];
  empty: string;
  highlight?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={
        'md:min-h-[520px] rounded-xl p-2.5 transition-colors ' +
        (isOver ? 'bg-lane-over outline-2 -outline-offset-2 outline-accent' : highlight ? 'bg-accent-soft' : 'bg-lane')
      }
    >
      <div className="flex items-baseline gap-2 px-1 pt-1 pb-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? <span className="text-[13px] text-muted">{subtitle}</span> : null}
        <span className="ml-auto text-[13px] text-muted">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-line-strong px-2 py-4 text-center text-[13px] text-muted">
            {empty}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const byPriority = (a: Task, b: Task) =>
  (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || a.title.localeCompare(b.title);

export default function WeekView() {
  const tasks = usePlannerStore((state) => state.tasks);
  const saveChange = usePlannerStore((state) => state.saveChange);
  const { today, tomorrow } = useToday();
  // Pages of seven days starting today: on a Sunday the page is the week ahead.
  const [page, setPage] = useState(0);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const days = useMemo(() => daysFrom(addDays(today, page * 7)), [today, page]);

  const { unplanned, byDay } = useMemo(() => {
    const byDay = new Map<string, Task[]>(days.map((day) => [day, []]));
    const unplanned: Task[] = [];
    for (const task of tasks) {
      if (!isOpen(task)) continue;
      const day = plannedFor(task, today, tomorrow);
      // A day that has passed needs a new day, so it goes back to be planned.
      if (!day || day < today) unplanned.push(task);
      else byDay.get(day)?.push(task);
    }
    unplanned.sort(byPriority);
    for (const list of byDay.values()) list.sort(byPriority);
    return { unplanned, byDay };
  }, [tasks, days, today, tomorrow]);

  useVisibleIds([...unplanned, ...days.flatMap((day) => byDay.get(day) ?? [])].map((task) => task.id));

  const sensors = useSensors(
    // Far enough that a click with a shaky hand still opens the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A held press on touch screens, so a swipe can still scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(tasks.find((task) => task.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    if (!event.over) return;
    const target = String(event.over.id);
    const dragged = tasks.find((task) => task.id === event.active.id);
    if (!dragged) return;
    const current = plannedFor(dragged, today, tomorrow);
    if (target === UNPLANNED) {
      if (current && current >= today) void saveChange(dragged.id, patchForMove(dragged, 'backlog', today, tomorrow));
      return;
    }
    const day = target.slice(DAY_PREFIX.length);
    if (day !== current) void saveChange(dragged.id, patchForDay(dragged, day, today, tomorrow));
  };

  const first = dayLabel(days[0], today, tomorrow);
  const last = dayLabel(days[days.length - 1], today, tomorrow);

  return (
    <div>
      <div className="flex items-center gap-2 pb-3">
        <h2 className="font-display text-xl font-semibold">Week</h2>
        <span className="text-sm text-muted">
          {first.date} to {last.date}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            aria-label="Previous seven days"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="w-11 h-11 flex items-center justify-center rounded-lg border border-line-strong bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next seven days"
            onClick={() => setPage(page + 1)}
            className="w-11 h-11 flex items-center justify-center rounded-lg border border-line-strong bg-white cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={columnCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveTask(null)}
      >
        <div className="md:overflow-x-auto">
          {/* 140px keeps eight columns readable; past that the row scrolls sideways. */}
          <div className="grid gap-2.5 md:grid-cols-[repeat(8,minmax(140px,1fr))] md:items-start">
            <Column id={UNPLANNED} title="To plan" tasks={unplanned} empty="Everything has a day" />
            {days.map((day) => {
              const label = dayLabel(day, today, tomorrow);
              return (
                <Column
                  key={day}
                  id={DAY_PREFIX + day}
                  title={label.name}
                  subtitle={label.date}
                  tasks={byDay.get(day) ?? []}
                  empty="Free"
                  highlight={day === today}
                />
              );
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
