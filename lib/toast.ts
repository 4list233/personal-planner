import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'durationMs'> & { id?: string; durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const durationMs = t.durationMs ?? (t.variant === 'destructive' ? 8000 : 4000);
    const next: Toast = {
      id,
      message: t.message,
      variant: t.variant,
      action: t.action,
      durationMs,
    };
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), next] }));
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), durationMs);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export const toast = {
  success: (message: string, action?: ToastAction) =>
    useToastStore.getState().push({ message, variant: 'success', action }),
  error: (message: string, action?: ToastAction) =>
    useToastStore.getState().push({ message, variant: 'destructive', action }),
  info: (message: string, action?: ToastAction) =>
    useToastStore.getState().push({ message, variant: 'default', action }),
};
