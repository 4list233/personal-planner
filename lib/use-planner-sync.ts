'use client';

import { useEffect } from 'react';
import { usePlannerStore } from './store';

// Often enough to see the planner bot's writes, rare enough to stay well
// under Notion's rate limit given a full list takes several paged requests.
const REFRESH_INTERVAL_MS = 45_000;

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable);
};

export function useBackgroundRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void usePlannerStore.getState().fetchTasks({ background: true });
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);
}

export function useDetailUrl() {
  useEffect(() => {
    const store = usePlannerStore.getState();
    store.setDetailFromUrl();
    const sync = () => usePlannerStore.getState().setDetailFromUrl();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
}

/** j/k move, Enter opens, x completes, t moves to tomorrow, Esc closes. */
export function usePlannerKeyboard() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const store = usePlannerStore.getState();
      // The draft editor has its own keys.
      if (store.isModalOpen) return;

      if (event.key === 'Escape' && store.detailTaskId) {
        event.preventDefault();
        // Leaving the field first is what saves an in-progress edit.
        (document.activeElement as HTMLElement | null)?.blur();
        window.setTimeout(() => usePlannerStore.getState().closeDetail(), 0);
        return;
      }
      if (isTyping(event.target)) return;

      const target = store.detailTaskId ?? store.focusedTaskId;
      if (event.key === 'x' && target) {
        event.preventDefault();
        void store.completeTask(target);
        return;
      }
      if (event.key === 't' && target) {
        event.preventDefault();
        void store.moveTask(target, 'tomorrow');
        return;
      }
      if (store.detailTaskId) return;

      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const ids = store.visibleTaskIds;
        if (ids.length === 0) return;
        const current = store.focusedTaskId ? ids.indexOf(store.focusedTaskId) : -1;
        const next = event.key === 'j' ? Math.min(current + 1, ids.length - 1) : Math.max(current - 1, 0);
        store.setFocusedTask(ids[next]);
        document.querySelector(`[data-task-card="${ids[next]}"]`)?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (event.key === 'Enter' && store.focusedTaskId && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        store.openDetail(store.focusedTaskId);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
