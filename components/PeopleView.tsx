'use client';

import { useEffect, useMemo, useState } from 'react';
import { shortDate } from '@/lib/formatters';
import { parseSteps, type StepLine } from '@/lib/steps';
import { usePlannerStore } from '@/lib/store';
import type { Task } from '@/lib/types';
import { useToday, useVisibleIds } from '@/lib/use-board-lanes';
import { isOpen, ownerMatches, peopleIn, plannedFor } from '@/lib/views';

const PERSON_PARAM = 'person';

function StepList({ task, steps, label }: { task: Task; steps: StepLine[]; label: string }) {
  const changeSteps = usePlannerStore((state) => state.changeSteps);
  if (steps.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-muted pb-1">{label}</div>
      <ul>
        {steps.map((step) => (
          <li key={step.index}>
            <label className="flex items-start gap-2.5 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={step.completed}
                onChange={() =>
                  void changeSteps(task.id, {
                    type: 'toggle',
                    line: { index: step.index, raw: step.raw },
                    completed: !step.completed,
                  })
                }
                className="mt-0.5 w-[18px] h-[18px] flex-none cursor-pointer accent-accent"
              />
              <span className="text-sm leading-snug">{step.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonTask({ task, person, today, tomorrow }: { task: Task; person: string; today: string; tomorrow: string }) {
  const openDetail = usePlannerStore((state) => state.openDetail);
  const steps = useMemo(
    () => parseSteps(task.todosText || '').filter((line) => line.kind === 'step' && !line.completed),
    [task.todosText]
  );
  // Their steps carry their @name; steps with no owner are yours to get ready.
  // Steps owned by someone else belong on that person's page.
  const theirs = steps.filter((step) => ownerMatches(step.owner, person));
  const yours = steps.filter((step) => !step.owner);
  const first = person.split(/\s+/)[0];
  const day = plannedFor(task, today, tomorrow);
  const meta = [
    day ? (day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : `Planned ${shortDate(day)}`) : null,
    task.dueDate ? `Due ${shortDate(task.dueDate)}` : null,
  ].filter(Boolean);

  return (
    <li className="bg-white border border-line rounded-xl p-4" data-task-card={task.id}>
      <button
        type="button"
        onClick={() => openDetail(task.id)}
        className="text-left font-semibold leading-snug break-words cursor-pointer hover:underline"
      >
        {task.title}
      </button>
      {meta.length ? <div className="mt-0.5 text-[13px] text-muted">{meta.join(' · ')}</div> : null}
      <StepList task={task} steps={yours} label="You prep" />
      <StepList task={task} steps={theirs} label={`${first} does`} />
      {theirs.length === 0 && yours.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          Nothing to prep. End a subtask with @{first} for something {first} does.
        </p>
      ) : null}
    </li>
  );
}

export default function PeopleView() {
  const tasks = usePlannerStore((state) => state.tasks);
  const addQuickTask = usePlannerStore((state) => state.addQuickTask);
  const { today, tomorrow } = useToday();
  const people = useMemo(() => peopleIn(tasks), [tasks]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // ?person= keeps the choice across reloads and makes a person linkable.
  useEffect(() => {
    setSelected(new URL(window.location.href).searchParams.get(PERSON_PARAM));
  }, []);

  const choose = (name: string) => {
    setSelected(name);
    const url = new URL(window.location.href);
    url.searchParams.set(PERSON_PARAM, name);
    window.history.replaceState(window.history.state, '', url);
  };

  const person = selected ?? people[0]?.name ?? null;
  const linked = useMemo(() => {
    if (!person) return [];
    return tasks
      .filter(
        (task) =>
          isOpen(task) &&
          ((task.people ?? []).includes(person) ||
            parseSteps(task.todosText || '').some((step) => !step.completed && ownerMatches(step.owner, person)))
      )
      .sort((a, b) => (plannedFor(a, today, tomorrow) ?? '9999').localeCompare(plannedFor(b, today, tomorrow) ?? '9999'));
  }, [tasks, person, today, tomorrow]);
  useVisibleIds(linked.map((task) => task.id));

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || !person) return;
    setDraft('');
    void addQuickTask(title, { people: [person] });
  };

  if (people.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-muted">
        <h2 className="font-display text-xl font-semibold text-ink">No people yet</h2>
        <p className="mt-2">Open a task and add someone under People. They show up here with what they owe you and what you need to prep for them.</p>
      </div>
    );
  }

  return (
    <div className="md:grid md:grid-cols-[220px_1fr] md:gap-6 md:items-start">
      <nav aria-label="People" className="flex md:flex-col gap-1.5 overflow-x-auto pb-3 md:pb-0">
        {people.map(({ name, open }) => (
          <button
            key={name}
            type="button"
            aria-current={name === person ? 'true' : undefined}
            onClick={() => choose(name)}
            className={`flex-none flex items-center gap-2 h-11 px-3 rounded-lg text-sm text-left cursor-pointer ${
              name === person ? 'bg-ink text-white font-semibold' : 'bg-white border border-line hover:bg-chip'
            }`}
          >
            <span className="truncate">{name}</span>
            <span className={`ml-auto text-xs ${name === person ? 'text-white/80' : 'text-muted'}`}>{open}</span>
          </button>
        ))}
      </nav>

      {person ? (
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-semibold">{person}</h2>
          <form onSubmit={add} className="flex gap-2 mt-3 mb-4">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={`New task with ${person}`}
              placeholder={`New task with ${person}`}
              className="flex-1 min-w-0 h-11 px-3 border border-line-strong rounded-lg bg-white text-sm placeholder:text-muted focus:outline-2 focus:-outline-offset-1 focus:outline-accent"
            />
            <button type="submit" className="h-11 px-4 rounded-lg bg-accent text-white text-sm font-semibold cursor-pointer">
              Add
            </button>
          </form>
          <ul className="flex flex-col gap-3">
            {linked.map((task) => (
              <PersonTask key={task.id} task={task} person={person} today={today} tomorrow={tomorrow} />
            ))}
          </ul>
          {linked.length === 0 ? <p className="py-8 text-muted">Nothing open with {person}.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
