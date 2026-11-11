'use client';

import { useToastStore } from '@/lib/toast';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    // Left of the overlay panel at tablet widths, so it can't cover Complete. Above the phone tabs.
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 xl:left-1/2 xl:-translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const styles =
          t.variant === 'destructive'
            ? 'bg-red-600 text-white border-red-700'
            : t.variant === 'success'
              ? 'bg-ink text-white border-ink'
              : 'bg-ink text-white border-ink';
        const Icon =
          t.variant === 'destructive'
            ? AlertTriangle
            : t.variant === 'success'
              ? CheckCircle2
              : Info;
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-[10px] border shadow-lg px-4 py-2.5 flex items-center gap-3 font-sans ${styles}`}
          >
            <Icon size={18} className="flex-shrink-0" />
            <div className="flex-1 text-sm">{t.message}</div>
            {t.action && (
              <button
                onClick={() => {
                  void t.action!.onClick();
                  dismiss(t.id);
                }}
                className="h-8 px-3 rounded-md bg-white text-ink text-sm font-semibold cursor-pointer"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="opacity-70 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
