import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'ok' | 'err' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
  durationMs: number;
}

interface ToastContextValue {
  notify: (kind: ToastKind, text: string) => void;
}

const DEFAULT_DURATION_MS = 4500;
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

  const scheduleDismiss = useCallback(
    (id: number, delayMs: number) => {
      const existing = timersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);
      const timer = window.setTimeout(() => dismiss(id), delayMs);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const pauseTimer = useCallback((id: number) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (kind: ToastKind, text: string) => {
      const id = nextIdRef.current++;
      const durationMs = kind === 'err' ? 6000 : DEFAULT_DURATION_MS;
      setToasts((prev) => [...prev.slice(-3), { id, kind, text, durationMs }]);
      scheduleDismiss(id, durationMs);
    },
    [scheduleDismiss],
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
        className="no-print fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2.5rem)]"
      >
        {toasts.map((toast) => {
          const accentBar =
            toast.kind === 'ok'
              ? 'bg-emerald-500'
              : toast.kind === 'err'
                ? 'bg-rose-500'
                : 'bg-brand-500';
          const iconColor =
            toast.kind === 'ok'
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/70'
              : toast.kind === 'err'
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/70'
                : 'text-brand-600 dark:text-brand-400 bg-brand-soft';

          return (
            <div
              key={toast.id}
              role={toast.kind === 'err' ? 'alert' : 'status'}
              onMouseEnter={() => pauseTimer(toast.id)}
              onMouseLeave={() => scheduleDismiss(toast.id, 2200)}
              className="animate-toast-in relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl"
            >
              <div className="flex items-start gap-3 px-3.5 py-3 text-[13px] text-slate-800 dark:text-slate-100">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${iconColor}`}
                >
                  {toast.kind === 'ok' && <CheckCircle2 className="h-4 w-4" />}
                  {toast.kind === 'err' && <AlertCircle className="h-4 w-4" />}
                  {toast.kind === 'info' && <Info className="h-4 w-4" />}
                </span>
                <span className="flex-1 leading-snug font-medium pt-0.5">{toast.text}</span>
                <button
                  type="button"
                  aria-label="Đóng thông báo"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-0.5 w-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full origin-left ${accentBar}`}
                  style={{
                    animation: `toastShrink ${toast.durationMs}ms linear forwards`,
                  }}
                />
              </div>
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
