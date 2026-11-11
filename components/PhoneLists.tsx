'use client';

import { useState } from 'react';
import type { Task } from '@/lib/types';
import { useBoardLanes } from '@/lib/use-board-lanes';
import type { Lane } from '@/lib/views';
import TaskCard from './TaskCard';

// Done includes everything ever archived, so it starts short.
const DONE_PREVIEW = 25;

function LaneList({ lane, tasks }: { lane: Lane; tasks: Task[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = lane === 'Done' && !showAll ? tasks.slice(0, DONE_PREVIEW) : tasks;
  return (
    <section aria-label={lane} className="mb-5">
      <div className="flex items-baseline gap-2 pb-2">
        <h2 className="font-display text-xl font-semibold">{lane}</h2>
        <span className="text-sm text-muted">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing here.</p> : null}
        {tasks.length > shown.length ? (
          <button type="button" onClick={() => setShowAll(true)} className="h-11 text-sm font-medium text-accent cursor-pointer">
            Show all {tasks.length}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const TABS: { label: string; lanes: Lane[] }[] = [
  { label: 'Today', lanes: ['Today'] },
  { label: 'Tomorrow', lanes: ['Tomorrow'] },
  { label: 'Later', lanes: ['This Week', 'Inbox'] },
  { label: 'Done', lanes: ['Done'] },
];

export default function PhoneLists() {
  const { lanes } = useBoardLanes();
  const [active, setActive] = useState(TABS[0]);

  return (
    <div className="pb-20">
      {active.lanes.map((lane) => (
        <LaneList key={lane} lane={lane} tasks={lanes[lane]} />
      ))}

      <nav aria-label="Lists" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 bg-white border-t border-line">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            aria-current={tab.label === active.label ? 'page' : undefined}
            onClick={() => setActive(tab)}
            className={`h-[60px] text-sm cursor-pointer ${
              tab.label === active.label ? 'font-semibold text-accent' : 'text-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
