'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from './store';
import { todayInUserTz } from './time';
import { addDays, BOARD_LANES, selectLanes } from './views';

export function useBoardLanes() {
  const tasks = usePlannerStore((state) => state.tasks);
  const setVisibleTaskIds = usePlannerStore((state) => state.setVisibleTaskIds);
  // Recomputed with each refresh so a tab left open overnight rolls to the new day.
  const lastFetchedAt = usePlannerStore((state) => state.lastFetchedAt);
  const today = useMemo(() => todayInUserTz(), [lastFetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const tomorrow = addDays(today, 1);
  const lanes = useMemo(() => selectLanes(tasks, today, tomorrow), [tasks, today, tomorrow]);

  const order = BOARD_LANES.flatMap((lane) => lanes[lane].map((task) => task.id)).join(',');
  useEffect(() => {
    setVisibleTaskIds(order ? order.split(',') : []);
  }, [order, setVisibleTaskIds]);

  return { lanes, today, tomorrow };
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
