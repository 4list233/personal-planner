'use client';

import { useToastStore } from '@/lib/toast';
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const styles =
          t.variant === 'destructive'
            ? 'bg-red-600 text-white border-red-700'
            : t.variant === 'success'
              ? 'bg-green-600 text-white border-green-700'
              : 'bg-gray-900 text-white border-gray-800';
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
            className={`pointer-events-auto rounded-lg border shadow-lg px-4 py-3 flex items-start gap-3 ${styles}`}
          >
            <Icon size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">{t.message}</div>
            {t.action && (
              <button
                onClick={() => {
                  void t.action!.onClick();
                  dismiss(t.id);
                }}
                className="text-sm font-semibold underline hover:opacity-90"
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
