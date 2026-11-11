'use client';

import { useEffect, useState } from 'react';
import { usePlannerStore } from '@/lib/store';

// The confirm state expires so a stray later click can't archive anything.
const CONFIRM_WINDOW_MS = 4000;

export default function ArchiveButton({ taskId, title }: { taskId: string; title: string }) {
  const archiveTask = usePlannerStore((state) => state.archiveTask);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <button
      type="button"
      aria-label={confirming ? `Confirm archive ${title}` : `Archive ${title}`}
      onClick={() => {
        if (confirming) void archiveTask(taskId);
        else setConfirming(true);
      }}
      className={`h-11 px-3.5 rounded-lg border text-sm cursor-pointer ${
        confirming ? 'border-late text-late' : 'border-line-strong text-ink bg-white hover:bg-chip'
      }`}
    >
      {confirming ? 'Confirm archive?' : 'Archive'}
    </button>
  );
}
