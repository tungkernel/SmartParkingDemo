import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastContextValue {
  notify: (kind: ToastKind, text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());
  const nextIdRef = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
      const timer = window.setTimeout(() => dismiss(id), 4500);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2.5rem)]"
      >
        {toasts.map((toast) => {
          const styles =
            toast.kind === 'ok'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : toast.kind === 'err'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-800 text-white border-slate-700';
          return (
            <div
              key={toast.id}
              role={toast.kind === 'err' ? 'alert' : 'status'}
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl ${styles}`}
            >
              {toast.kind === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
              {toast.kind === 'err' && <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              {toast.kind === 'info' && <Info className="h-4 w-4 shrink-0 mt-0.5" />}
              <span className="flex-1 leading-snug">{toast.text}</span>
              <button
                type="button"
                aria-label="Đóng thông báo"
                onClick={() => dismiss(toast.id)}
                className="rounded-md p-0.5 opacity-80 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
