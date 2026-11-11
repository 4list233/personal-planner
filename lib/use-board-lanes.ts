'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from './store';
import { todayInUserTz } from './time';
import { addDays, BOARD_LANES, selectLanes } from './views';

/** Today and tomorrow, recomputed with each refresh so a tab left open overnight rolls over. */
export function useToday() {
  const lastFetchedAt = usePlannerStore((state) => state.lastFetchedAt);
  const today = useMemo(() => todayInUserTz(), [lastFetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  return { today, tomorrow: addDays(today, 1) };
}

export function useLanes() {
  const tasks = usePlannerStore((state) => state.tasks);
  const { today, tomorrow } = useToday();
  const lanes = useMemo(() => selectLanes(tasks, today, tomorrow), [tasks, today, tomorrow]);
  return { lanes, today, tomorrow };
}

/** Tells the j/k keyboard shortcuts which cards are on screen, in order. */
export function useVisibleIds(ids: string[]) {
  const setVisibleTaskIds = usePlannerStore((state) => state.setVisibleTaskIds);
  const order = ids.join(',');
  useEffect(() => {
    setVisibleTaskIds(order ? order.split(',') : []);
  }, [order, setVisibleTaskIds]);
}

export function useBoardLanes() {
  const result = useLanes();
  useVisibleIds(BOARD_LANES.flatMap((lane) => result.lanes[lane].map((task) => task.id)));
  return result;
}

// Matches Tailwind's md breakpoint: below it, five columns can't fit and a
// finger can't drag between them, so the board becomes tabbed lists.
const PHONE_QUERY = '(max-width: 767px)';

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}
