'use client';

import { usePlannerStore, getAuthHeaders } from '@/lib/store';
import { Task, Quadrant, QUADRANT_LABEL, quadrantOf } from '@/lib/types';
import TaskCard from './TaskCard';
import { toast } from '@/lib/toast';
import { scheduleThisWeek, summarizeSchedule } from '@/lib/scheduling';
import { autoPlanThisWeek, summarizeAutoPlan } from '@/lib/auto-plan';
import { callBacklogGemini } from '@/lib/auto-plan-gemini';
import { Check, X, CalendarDays, Archive, Sparkles } from 'lucide-react';
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
import { useDraggable } from '@dnd-kit/core';
import { columnCollisionDetection } from '@/lib/dnd';
import { useMemo, useState } from 'react';

const QUADRANT_TONE: Record<Quadrant, { bg: string; border: string; title: string }> = {
  Q1: { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-900' },
  Q2: { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-900' },
  Q3: { bg: 'bg-yellow-50', border: 'border-yellow-200', title: 'text-yellow-900' },
  Q4: { bg: 'bg-gray-50', border: 'border-gray-200', title: 'text-gray-700' },
};

const QUADRANT_FLAGS: Record<Quadrant, { important: boolean; urgent: boolean }> = {
  Q1: { important: true, urgent: true },
  Q2: { important: true, urgent: false },
  Q3: { important: false, urgent: true },
  Q4: { important: false, urgent: false },
};

const QUADRANT_ORDER: Quadrant[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function DraggableMatrixCard({
  task,
  selected,
  onToggleSelection,
}: {
  task: Task;
  selected: boolean;
  onToggleSelection: (id: string) => void;
}) {
  const { setSelectedTask, setIsModalOpen } = usePlannerStore();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        className={`absolute top-1 left-1 z-10 rounded border bg-white/90 ${
          selected ? 'border-blue-500' : 'border-gray-300'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelection(task.id);
        }}
      >
        <button
          aria-label={selected ? 'Deselect task' : 'Select task'}
          aria-pressed={selected}
          className={`w-5 h-5 flex items-center justify-center rounded ${
            selected ? 'bg-blue-600 text-white' : 'bg-white text-transparent hover:text-gray-400'
          }`}
        >
          <Check size={12} />
        </button>
      </div>
      <div {...attributes} {...listeners}>
        <TaskCard
          task={task}
          showQuadrantLabel
          onClick={() => {
            setSelectedTask(task);
            setIsModalOpen(true);
          }}
        />
      </div>
    </div>
  );
}

function DroppableQuadrant({
  quadrant,
  tasks,
  selectedIds,
  onToggleSelection,
  isDragActive,
  isHoverTarget,
}: {
  quadrant: Quadrant;
  tasks: Task[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  isDragActive: boolean;
  isHoverTarget: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `matrix-${quadrant}` });
  const tone = QUADRANT_TONE[quadrant];
  const dimNonTarget = isDragActive && !isHoverTarget && !isOver;
  return (
    <div
      ref={setNodeRef}
      className={
        `relative rounded-lg border-2 ${tone.bg} ${
          isOver ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2 brightness-105' : tone.border
        } p-4 min-h-[160px] md:min-h-[260px] flex flex-col transition ` +
        (dimNonTarget ? 'opacity-70' : '')
      }
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-sm font-semibold ${tone.title}`}>
          {QUADRANT_LABEL[quadrant]}
        </h2>
        <span className="bg-white text-gray-600 text-xs px-2 py-0.5 rounded-full border">
          {tasks.length}
        </span>
      </div>
      <div className="space-y-2 flex-1">
        {tasks.length === 0 ? (
          <div className="text-xs text-gray-500 text-center py-6 select-none">
            Drop tasks here
          </div>
        ) : (
          tasks.map((t) => (
            <DraggableMatrixCard
              key={t.id}
              task={t}
              selected={selectedIds.has(t.id)}
              onToggleSelection={onToggleSelection}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function MatrixView() {
  const {
    tasks,
    selectedTaskIds,
    toggleSelection,
    clearSelection,
    updateTask,
    submitPartial,
    bulkUpdate,
    setCurrentView,
  } = usePlannerStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [hoverQuadrant, setHoverQuadrant] = useState<Quadrant | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isAutoPlanning, setIsAutoPlanning] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const visibleTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'Archived'),
    [tasks]
  );

  const tasksByQuadrant = useMemo(() => {
    const out: Record<Quadrant, Task[]> = { Q1: [], Q2: [], Q3: [], Q4: [] };
    for (const t of visibleTasks) out[quadrantOf(t)].push(t);
    return out;
  }, [visibleTasks]);

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedTaskIds.has(t.id)),
    [tasks, selectedTaskIds]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const t = tasks.find((x) => x.id === event.active.id);
    if (t) setActiveTask(t);
  };

  const handleDragOver = (event: { over: { id: string | number } | null }) => {
    const overId = event.over ? String(event.over.id) : '';
    if (overId.startsWith('matrix-')) {
      setHoverQuadrant(overId.slice('matrix-'.length) as Quadrant);
    } else {
      setHoverQuadrant(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setHoverQuadrant(null);
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith('matrix-')) return;
    const targetQuadrant = overId.slice('matrix-'.length) as Quadrant;
    const target = QUADRANT_FLAGS[targetQuadrant];
    const t = tasks.find((x) => x.id === active.id);
    if (!t) return;
    const current = quadrantOf(t);
    if (current === targetQuadrant) return;
    updateTask(t.id, { important: target.important, urgent: target.urgent });
    submitPartial(t.id, { important: target.important, urgent: target.urgent });
  };

  const handleScheduleThisWeek = async () => {
    if (selectedTasks.length === 0) return;
    setIsScheduling(true);
    try {
      const today = new Date();
      const assignments = scheduleThisWeek(selectedTasks, today);
      const summary = summarizeSchedule(assignments, today);

      // Optimistic local update
      assignments.forEach((a, id) => {
        updateTask(id, { weekday: a.weekday, status: a.status });
      });

      const updates = Array.from(assignments.entries()).map(([id, a]) => ({
        id,
        patch: { weekday: a.weekday, status: a.status } as Partial<Task>,
      }));
      const result = await bulkUpdate(updates, { concurrency: 3 });

      const total = result.ok;
      if (result.failed === 0) {
        toast.success(
          `Scheduled ${total} task${total === 1 ? '' : 's'}: ${summary.today} today, ${summary.tomorrow} tomorrow, ${summary.later} later this week.`
        );
      } else {
        toast.error(
          `Scheduled ${total} task${total === 1 ? '' : 's'}, ${result.failed} failed. Check the warning icons.`
        );
      }
      clearSelection();
      setCurrentView('weekdays');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleAutoPlan = async () => {
    if (isAutoPlanning) return;
    setIsAutoPlanning(true);
    const maxPerDay = Number(process.env.NEXT_PUBLIC_MAX_TASKS_PER_DAY) || 5;
    const today = new Date();
    let infoToastId: string | null = null;
    let geminiAvailable = true;
    try {
      const callGemini = async (payload: Parameters<typeof callBacklogGemini>[0]) => {
        if (!infoToastId) {
          infoToastId = toast.info('Consulting Gemini for backlog placement…');
        }
        try {
          const headers = await getAuthHeaders();
          return await callBacklogGemini(payload, headers);
        } catch (err) {
          geminiAvailable = false;
          throw err;
        }
      };

      const result = await autoPlanThisWeek({
        tasks,
        today,
        maxPerDay,
        callGemini,
        selectedTaskIds: selectedTaskIds.size > 0 ? selectedTaskIds : undefined,
      });

      if (result.assignments.size === 0) {
        toast.info('Nothing to plan — all eligible tasks already have a day.');
        return;
      }

      // Optimistic local update.
      result.assignments.forEach((a, id) => {
        updateTask(id, { weekday: a.weekday, status: a.status });
      });

      const updates = Array.from(result.assignments.entries()).map(([id, a]) => ({
        id,
        patch: { weekday: a.weekday, status: a.status } as Partial<Task>,
      }));
      const persistResult = await bulkUpdate(updates, { concurrency: 3 });

      const summary = summarizeAutoPlan(result, today);
      const breakdown = `${summary.today} today, ${summary.tomorrow} tomorrow, ${summary.later} later this week`;
      const reasoning = result.geminiReasoning ? ` Gemini: "${result.geminiReasoning}"` : '';
      const fallbackHint = !geminiAvailable && !result.geminiConsulted
        ? ' Gemini unavailable, used round-robin.'
        : '';

      if (persistResult.failed === 0) {
        toast.success(
          `Planned ${summary.total} task${summary.total === 1 ? '' : 's'}: ${breakdown}.${reasoning}${fallbackHint}`
        );
      } else {
        toast.error(
          `Planned ${persistResult.ok}, ${persistResult.failed} failed. ${breakdown}.${fallbackHint}`
        );
      }
      clearSelection();
      setCurrentView('weekdays');
    } catch (err) {
      console.error('Auto-plan failed:', err);
      toast.error("Auto-plan failed. Try again or use Schedule This Week.");
    } finally {
      setIsAutoPlanning(false);
    }
  };

  const handleMarkDone = async () => {
    if (selectedTasks.length === 0) return;
    selectedTasks.forEach((t) => updateTask(t.id, { status: 'Archived' }));
    const updates = selectedTasks.map((t) => ({
      id: t.id,
      patch: { status: 'Archived' } as Partial<Task>,
    }));
    const result = await bulkUpdate(updates, { concurrency: 3 });
    if (result.failed === 0) {
      toast.success(`Marked ${result.ok} task${result.ok === 1 ? '' : 's'} done.`);
    } else {
      toast.error(`Marked ${result.ok} done, ${result.failed} failed.`);
    }
    clearSelection();
  };

  const selectedCount = selectedTaskIds.size;

  return (
    <div className="relative">
      <div className="flex items-center justify-end mb-3">
        <button
          onClick={handleAutoPlan}
          disabled={isAutoPlanning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60"
          title={
            selectedTaskIds.size > 0
              ? 'Plan only the selected tasks across the rest of the week'
              : 'Plan every eligible task across the rest of the week'
          }
        >
          <Sparkles size={14} />
          {isAutoPlanning ? 'Planning…' : 'Auto-Plan This Week'}
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={columnCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveTask(null);
          setHoverQuadrant(null);
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUADRANT_ORDER.map((q) => (
            <DroppableQuadrant
              key={q}
              quadrant={q}
              tasks={tasksByQuadrant[q]}
              selectedIds={selectedTaskIds}
              onToggleSelection={toggleSelection}
              isDragActive={activeTask !== null}
              isHoverTarget={hoverQuadrant === q}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCard task={activeTask} showQuadrantLabel dragging /> : null}
        </DragOverlay>
      </DndContext>

      {selectedCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 pointer-events-none">
          <div className="pointer-events-auto bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-900">
              {selectedCount} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={handleScheduleThisWeek}
              disabled={isScheduling}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              <CalendarDays size={14} />
              Schedule This Week
            </button>
            <button
              onClick={handleAutoPlan}
              disabled={isAutoPlanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60"
            >
              <Sparkles size={14} />
              {isAutoPlanning ? 'Planning…' : 'Auto-Plan This Week'}
            </button>
            <button
              onClick={handleMarkDone}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Archive size={14} />
              Mark Done
            </button>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <X size={14} />
              Clear Selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
