'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { getAuthHeaders, usePlannerStore } from '@/lib/store';
import { statusForStage } from '@/lib/planner';
import { formatDaysUntilDue } from '@/lib/formatters';
import type { Bucket, Priority, ProjectName, Stage, Task, TaskStatus } from '@/lib/types';
import { isArchived, isDone } from '@/lib/views';
import ArchiveButton from './ArchiveButton';
import InlineText from './InlineText';
import StepChecklist from './StepChecklist';

const STAGES: Stage[] = ['Inbox', 'This Week', 'Today', 'In Progress', 'Waiting', 'Done'];
// Done and Archived are left out: those only happen through their own buttons.
const STATUSES: TaskStatus[] = ['To Do', 'Doing Today', 'Doing Tomorrow', 'Blocked', 'Reminders', 'Long Term Deadlines'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3'];
const BUCKETS: Bucket[] = ['Mine', 'Dispatch', 'Follow-up', 'Watch', 'Long-term'];
const PROJECTS: ProjectName[] = ['Velox', 'School', 'Personal', 'Leads', 'Other'];

const inputClass =
  'w-full h-11 px-2.5 border border-line-strong rounded-lg text-sm text-ink bg-white focus:outline-2 focus:-outline-offset-1 focus:outline-accent';
// Multi-line fields grow with their text, so they can't share the fixed height.
const areaClass =
  'w-full px-2.5 py-2 border border-line-strong rounded-lg text-sm text-ink bg-white placeholder:text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-accent';
const secondaryButton =
  'h-11 px-3.5 rounded-lg border border-line-strong bg-white text-sm cursor-pointer hover:bg-chip';
const primaryButton = 'h-11 px-4 rounded-lg bg-accent text-white text-sm font-semibold cursor-pointer';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  allowNone = true,
}: {
  label: string;
  value?: T | null;
  options: T[];
  onChange: (value: T | null) => void;
  allowNone?: boolean;
}) {
  // A value the site doesn't offer (Done, or a new Notion option) must still display.
  const shown = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
        className={inputClass}
      >
        {allowNone ? <option value="">None</option> : null}
        {shown.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="date"
        aria-label={label}
        min="1970-01-01"
        max="2100-12-31"
        value={value ? value.slice(0, 10) : ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={inputClass}
      />
    </Field>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`w-full h-11 rounded-lg border text-sm cursor-pointer ${
        on ? 'bg-ink text-white border-ink font-semibold' : 'bg-white text-ink border-line-strong hover:bg-chip'
      }`}
    >
      {label}
    </button>
  );
}

function PriorityPicker({ value, onChange }: { value?: Priority | null; onChange: (value: Priority | null) => void }) {
  return (
    <Field label="Priority">
      <div role="group" aria-label="Priority" className="flex gap-1.5">
        {PRIORITIES.map((priority) => (
          <button
            key={priority}
            type="button"
            aria-pressed={value === priority}
            // Clicking the current choice clears it, since Priority can be empty in Notion.
            onClick={() => onChange(value === priority ? null : priority)}
            className={`flex-1 h-11 rounded-lg border text-sm cursor-pointer ${
              value === priority
                ? 'bg-ink text-white border-ink font-semibold'
                : 'bg-white text-ink border-line-strong hover:bg-chip'
            }`}
          >
            {priority}
          </button>
        ))}
      </div>
    </Field>
  );
}

function Body({ task, onClose }: { task: Task; onClose: () => void }) {
  const saveChange = usePlannerStore((state) => state.saveChange);
  const completeTask = usePlannerStore((state) => state.completeTask);
  const reopenTask = usePlannerStore((state) => state.reopenTask);
  const moveTask = usePlannerStore((state) => state.moveTask);
  const submitTask = usePlannerStore((state) => state.submitTask);
  const discardDraft = usePlannerStore((state) => state.discardDraft);
  const held = usePlannerStore((state) => state.heldUpdates[task.id]);
  const applyHeldUpdate = usePlannerStore((state) => state.applyHeldUpdate);

  const save = (patch: Partial<Task>) => void saveChange(task.id, patch);
  const done = isDone(task);
  const archived = isArchived(task);
  const draft = task.id.startsWith('temp-');

  const changeStage = (stage: Stage | null) => {
    if (!stage) return;
    if (stage === 'Done') void completeTask(task.id);
    // To Do for This Week, as on the board: Doing Tomorrow would move it to Tomorrow.
    else save({ stage, status: stage === 'This Week' ? 'To Do' : statusForStage(stage) });
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-line px-4 py-3 flex items-start gap-2">
        <InlineText
          taskId={task.id}
          field="title"
          value={task.title}
          ariaLabel="Task title"
          required
          onCommit={(title) => save({ title })}
          className="flex-1 min-w-0 font-display text-lg font-semibold text-ink bg-transparent border-b-2 border-transparent hover:border-line focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close task"
          className="w-11 h-11 -mr-2 -mt-1.5 flex items-center justify-center rounded-lg hover:bg-chip flex-shrink-0 cursor-pointer"
        >
          <X size={20} className="text-muted" />
        </button>
      </div>

      {held ? (
        <div className="bg-accent-soft border-b border-line px-4 py-2 text-sm flex items-center justify-between gap-3">
          <span>Row updated elsewhere.</span>
          <button type="button" onClick={() => applyHeldUpdate(task.id)} className="font-semibold underline cursor-pointer">
            Reload?
          </button>
        </div>
      ) : null}

      <div className="flex-1 p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <DateField label="Due date" value={task.dueDate} onChange={(dueDate) => save({ dueDate })} />
            {task.daysUntilDue !== undefined && !done ? (
              <div className={`mt-1 text-xs ${task.daysUntilDue <= 0 ? 'font-semibold text-late' : 'text-muted'}`}>
                {formatDaysUntilDue(task.daysUntilDue)}
              </div>
            ) : null}
          </div>
          <DateField label="Planned day" value={task.plannedDay} onChange={(plannedDay) => save({ plannedDay })} />
          <PriorityPicker value={task.priority} onChange={(priority) => save({ priority })} />
          <Select label="Bucket" value={task.bucket} options={BUCKETS} onChange={(bucket) => save({ bucket })} />
        </div>

        <Field label="Next action">
          <InlineText
            taskId={task.id}
            field="nextAction"
            value={task.nextAction ?? ''}
            ariaLabel="Next action"
            placeholder="The next concrete step"
            multiline
            rows={2}
            onCommit={(nextAction) => save({ nextAction })}
            className={areaClass}
          />
        </Field>

        <div className="border-t border-line pt-4">
          <StepChecklist task={task} />
        </div>

        <div className="border-t border-line pt-4">
          <Field label="Comments">
            <InlineText
              taskId={task.id}
              field="comments"
              value={task.commentsText ?? ''}
              ariaLabel="Comments"
              multiline
              rows={4}
              onCommit={(commentsText) => save({ commentsText })}
              className={areaClass}
            />
          </Field>
        </div>

        <details className="border-t border-line pt-3">
          <summary className="py-1.5 text-sm text-muted cursor-pointer">More fields</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Waiting on">
              <InlineText
                taskId={task.id}
                field="waitingOn"
                value={task.waitingOn ?? ''}
                ariaLabel="Waiting on"
                placeholder="Person or thing"
                onCommit={(waitingOn) => save({ waitingOn })}
                className={inputClass}
              />
            </Field>
            <Field label="Urgency">
              <Toggle label="Urgent" on={!!task.urgent} onChange={(urgent) => save({ urgent })} />
            </Field>
            <Select label="Stage" value={task.stage} options={STAGES} onChange={changeStage} allowNone={false} />
            <Select
              label="Status"
              value={task.status}
              options={STATUSES}
              allowNone={false}
              onChange={(status) => {
                if (status) save({ status });
              }}
            />
            <Select label="Project" value={task.project} options={PROJECTS} onChange={(project) => save({ project })} />
            <Field label="Importance">
              <Toggle label="Important" on={!!task.important} onChange={(important) => save({ important })} />
            </Field>
            <div className="col-span-2">
              <Field label="Source">
                <InlineText
                  taskId={task.id}
                  field="source"
                  value={task.sourceText ?? ''}
                  ariaLabel="Source"
                  onCommit={(sourceText) => save({ sourceText })}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </details>

        {draft ? null : (
          <a
            href={`https://www.notion.so/${task.id.replace(/-/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 py-1.5 text-sm font-medium text-accent"
          >
            Open in Notion <ExternalLink size={14} />
          </a>
        )}
      </div>

      <div className="sticky bottom-0 bg-white border-t border-line px-4 py-3 flex flex-wrap items-center gap-2">
        {draft ? (
          <>
            <button type="button" onClick={() => void submitTask(task.id)} className={primaryButton}>
              Save to Notion
            </button>
            <button
              type="button"
              onClick={() => {
                discardDraft(task.id);
                onClose();
              }}
              className={secondaryButton}
            >
              Discard
            </button>
          </>
        ) : done ? (
          <>
            <button type="button" onClick={() => void reopenTask(task.id)} className={primaryButton}>
              Reopen
            </button>
            <ArchiveButton taskId={task.id} title={task.title} />
          </>
        ) : archived ? (
          <span className="text-sm text-muted">Archived. Change it in Notion if you need it back.</span>
        ) : (
          <>
            <button type="button" onClick={() => void completeTask(task.id)} className={primaryButton}>
              Complete
            </button>
            <button type="button" onClick={() => void moveTask(task.id, 'tomorrow')} className={secondaryButton}>
              Move to Tomorrow
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function TaskDetail() {
  const detailTaskId = usePlannerStore((state) => state.detailTaskId);
  const closeDetail = usePlannerStore((state) => state.closeDetail);
  const addTask = usePlannerStore((state) => state.addTask);
  const lastFetchedAt = usePlannerStore((state) => state.lastFetchedAt);
  const task = usePlannerStore((state) => state.tasks.find((item) => item.id === state.detailTaskId));
  const [missing, setMissing] = useState(false);

  // A deep link can point at a row that isn't in the loaded list.
  useEffect(() => {
    setMissing(false);
    if (!detailTaskId || task || lastFetchedAt === null) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/tasks/${detailTaskId}`, { cache: 'no-store', headers });
        if (cancelled) return;
        if (!response.ok) {
          setMissing(true);
          return;
        }
        const data = await response.json();
        if (!cancelled) addTask(data.task as Task);
      } catch (error) {
        console.error('Failed to load task', error);
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-check when the target changes or the first list arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTaskId, lastFetchedAt === null]);

  if (!detailTaskId) return null;

  return (
    // Beside the board and with no backdrop, so cards stay draggable while it's open.
    // 6rem clears the header above it, so Complete is on screen before any scrolling.
    <aside
      role="dialog"
      aria-modal={false}
      aria-label={task?.title ?? 'Task'}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-white md:left-auto md:w-[380px] md:border-l md:border-line md:shadow-xl xl:sticky xl:inset-auto xl:top-4 xl:z-auto xl:flex-none xl:max-h-[calc(100vh-6rem)] xl:rounded-xl xl:border xl:shadow-none"
    >
      {task ? (
        <Body key={task.id} task={task} onClose={closeDetail} />
      ) : (
        <div className="p-8 text-center">
          <p className="text-sm text-muted">{missing ? 'That task is not on your planner.' : 'Loading task…'}</p>
          <button type="button" onClick={closeDetail} className="mt-4 text-sm font-medium text-accent cursor-pointer">
            Close
          </button>
        </div>
      )}
    </aside>
  );
}
