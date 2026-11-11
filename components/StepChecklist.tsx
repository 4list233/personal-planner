'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { usePlannerStore } from '@/lib/store';
import { groupSteps, parseSteps, stepProgress, type StepGroup, type StepLine } from '@/lib/steps';
import type { Task } from '@/lib/types';
import InlineText from './InlineText';

const lineRef = (line: StepLine) => ({ index: line.index, raw: line.raw });

function AddLine({
  placeholder,
  ariaLabel,
  onAdd,
}: {
  placeholder: string;
  ariaLabel: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <input
      type="text"
      value={text}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      }}
      onBlur={submit}
      className="w-full h-9 text-sm text-ink placeholder:text-muted bg-transparent border-b border-line hover:border-line-strong focus:border-accent focus:outline-none px-1"
    />
  );
}

function StepRow({ task, step }: { task: Task; step: StepLine }) {
  const changeSteps = usePlannerStore((state) => state.changeSteps);
  return (
    <div className="flex items-start gap-3 group/step">
      <input
        type="checkbox"
        checked={step.completed}
        aria-label={`Mark "${step.text}" ${step.completed ? 'not done' : 'done'}`}
        onChange={() => void changeSteps(task.id, { type: 'toggle', line: lineRef(step), completed: !step.completed })}
        className="w-[18px] h-[18px] mt-0.5 flex-shrink-0 cursor-pointer accent-accent"
      />
      <div className="flex-1 min-w-0">
        <InlineText
          taskId={task.id}
          field={`step-${step.index}`}
          value={step.text}
          ariaLabel="Step"
          required
          // The @owner and (due ...) show as labels below, and stay on the line.
          onCommit={(text) =>
            void changeSteps(task.id, { type: 'edit', line: lineRef(step), text: text + step.body.slice(step.text.length) })
          }
          className={`w-full text-sm bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none px-1 ${
            step.completed ? 'line-through text-muted' : 'text-ink'
          }`}
        />
        {step.owner || step.due ? (
          <div className="flex gap-2 px-1 text-xs text-muted">
            {step.owner ? <span>@{step.owner}</span> : null}
            {step.due ? <span>Due {step.due}</span> : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Remove step ${step.text}`}
        onClick={() => void changeSteps(task.id, { type: 'remove', line: lineRef(step) })}
        // Padding with a matching negative margin: a bigger tap target on a phone, same layout.
        className="p-2 -m-1.5 opacity-60 sm:opacity-0 group-hover/step:opacity-100 focus:opacity-100 text-muted hover:text-late cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Group({ task, group }: { task: Task; group: StepGroup }) {
  const changeSteps = usePlannerStore((state) => state.changeSteps);
  const done = group.steps.filter((step) => step.completed).length;
  return (
    <div>
      {group.heading ? (
        <div className="flex items-center gap-2 mb-2">
          <InlineText
            taskId={task.id}
            field={`milestone-${group.heading.index}`}
            value={group.heading.body}
            ariaLabel="Milestone name"
            required
            onCommit={(text) =>
              void changeSteps(task.id, { type: 'edit', line: lineRef(group.heading!), text })
            }
            className="flex-1 min-w-0 text-xs font-semibold text-muted bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none px-1"
          />
          <span className="text-xs text-muted flex-shrink-0">
            {done}/{group.steps.length}
          </span>
        </div>
      ) : null}
      <div className="space-y-2">
        {group.steps.map((step) => (
          <StepRow key={step.index} task={task} step={step} />
        ))}
        <div className="pl-7">
          <AddLine
            placeholder="Add a subtask, press Enter"
            ariaLabel={group.milestone ? `Add subtask to ${group.milestone}` : 'Add subtask'}
            onAdd={(text) => void changeSteps(task.id, { type: 'addStep', text, milestone: group.milestone })}
          />
        </div>
      </div>
    </div>
  );
}

export default function StepChecklist({ task }: { task: Task }) {
  const changeSteps = usePlannerStore((state) => state.changeSteps);
  const groups = useMemo(() => groupSteps(parseSteps(task.todosText || '')), [task.todosText]);
  const progress = stepProgress(task.todosText);
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Subtasks</h3>
        <span className="text-[13px] text-muted">
          {progress.done}/{progress.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Subtasks complete"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1 bg-chip rounded-full overflow-hidden mb-3"
      >
        <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="space-y-5">
        {groups.map((group, index) => (
          <Group key={group.heading?.index ?? `loose-${index}`} task={task} group={group} />
        ))}
        {groups.length === 0 ? (
          <AddLine
            placeholder="Add a subtask, press Enter"
            ariaLabel="Add subtask"
            onAdd={(text) => void changeSteps(task.id, { type: 'addStep', text, milestone: null })}
          />
        ) : null}
        <AddLine
          placeholder="Add a group of subtasks"
          ariaLabel="Add subtask group"
          onAdd={(name) => void changeSteps(task.id, { type: 'addMilestone', name })}
        />
      </div>
    </div>
  );
}
