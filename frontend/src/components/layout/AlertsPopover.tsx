import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { OperationalAlerts } from '../../types';

interface AlertsPopoverProps {
  alerts: OperationalAlerts | undefined;
}

export function AlertsPopover({ alerts }: AlertsPopoverProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const overdue = alerts?.overdue_turns ?? [];
  const expiring = alerts?.expiring_passes ?? [];
  const lostCards = alerts?.lost_cards ?? [];
  const alertCount = overdue.length + expiring.length + lostCards.length;

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const jumpTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Xem cảnh báo vận hành"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700/90 bg-surface dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Bell className="h-4 w-4" />
        {alertCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-surface dark:ring-slate-900 tabular-nums">
            {alertCount > 99 ? '99+' : alertCount}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-modal-in fixed sm:absolute right-3 sm:right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-96 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-surface dark:bg-slate-900 shadow-2xl z-40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Cảnh báo vận hành ({alertCount})
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Đóng
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto scroll-pane p-3 space-y-3 text-xs">
            {alertCount === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  Hệ thống vận hành ổn định
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Không có xe gửi quá 24h, vé sắp hết hạn hay thẻ mất.
                </p>
              </div>
            )}

            {overdue.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Xe gửi quá 24 giờ ({overdue.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {overdue.slice(0, 5).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => jumpTo(`/gate?q=${encodeURIComponent(t.bienso)}`)}
                      className="group w-full flex items-center justify-between gap-2 rounded-xl border border-rose-200/70 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-3 py-2 text-left hover:border-rose-400 dark:hover:border-rose-700 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                            {t.bienso}
                          </span>
                          <span className="rounded-md bg-rose-600/15 px-1.5 py-0.5 font-mono-plate text-[10px] font-bold text-rose-700 dark:text-rose-300">
                            {t.hours_parked}h
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {t.tenbaido} · {t.khu_vuc}-{t.sothutu}
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-rose-500 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {expiring.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Vé tháng sắp hết hạn ({expiring.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {expiring.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => jumpTo(`/passes?q=${encodeURIComponent(p.bienso)}`)}
                      className="group w-full flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-left hover:border-amber-400 dark:hover:border-amber-700 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                            {p.bienso}
                          </span>
                          <span className="rounded-md bg-amber-600/15 px-1.5 py-0.5 font-mono-plate text-[10px] font-bold text-amber-800 dark:text-amber-300">
                            Còn {p.days_left} ngày
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {p.ten_khachhang} · Thẻ #{p.ma_the}
                        </div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-amber-600 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {lostCards.length > 0 && (
              <div>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-slate-500" />
                    Thẻ báo Mất / Hỏng ({lostCards.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => jumpTo('/admin/cards?status=2')}
                    className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Mở kho thẻ
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lostCards.slice(0, 12).map((c) => (
                    <span
                      key={c.id}
                      className="rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 font-mono-plate text-[11px] font-semibold text-slate-700 dark:text-slate-300"
                    >
                      #{c.maso}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
