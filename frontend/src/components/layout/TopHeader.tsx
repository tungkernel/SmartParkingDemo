import { Clock, Menu, Moon, RefreshCw, Search, Sun, Wallet, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn';
import { formatVietnamClock } from '../../lib/time';
import type { OperationalAlerts, ShiftRecord } from '../../types';
import { AlertsPopover } from './AlertsPopover';
import type { NavItem } from './navConfig';

interface TopHeaderProps {
  activeNav: NavItem | undefined;
  wsConnected: boolean;
  alerts: OperationalAlerts | undefined;
  activeShift: ShiftRecord | null | undefined;
  canAccessAdmin: boolean;
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onManualRefresh: () => void;
}

export function TopHeader({
  activeNav,
  wsConnected,
  alerts,
  activeShift,
  canAccessAdmin,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onManualRefresh,
}: TopHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => formatVietnamClock(new Date()));
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(formatVietnamClock(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleRefresh = () => {
    setSpinning(true);
    onManualRefresh();
    window.setTimeout(() => setSpinning(false), 600);
  };

  return (
    <header className="no-print shrink-0 sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/90 bg-[var(--surface-header)] backdrop-blur-md px-4 lg:px-5">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          aria-label="Mở menu điều hướng"
          onClick={onOpenMobileMenu}
          className="lg:hidden rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {activeNav?.title ?? 'Smart Parking PTIT'}
          </h1>
          {activeNav?.subtitle && (
            <p className="hidden md:block text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {activeNav.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Mở tìm kiếm nhanh (Ctrl+K)"
          className="hidden md:inline-flex items-center gap-2.5 h-9 rounded-xl border border-slate-200 dark:border-slate-700/90 bg-slate-50/90 dark:bg-slate-900 px-3 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Tìm nhanh...</span>
          <kbd className="kbd-keycap">Ctrl K</kbd>
        </button>

        {/* Active Shift Telemetry Pill */}
        {activeShift !== undefined && (
          <button
            type="button"
            onClick={() => navigate('/transactions?tab=shifts')}
            title={
              activeShift
                ? `Đang trực ca #${activeShift.id} — nhấn để đối soát quỹ`
                : 'Chưa mở ca trực — nhấn để mở ca làm việc'
            }
            className={cn(
              'hidden xl:inline-flex items-center gap-1.5 h-9 rounded-xl border px-3 text-xs font-semibold transition-colors',
              activeShift
                ? 'border-emerald-200/90 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/70'
                : 'border-amber-200/90 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70',
            )}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            <span className="tabular-nums">
              {activeShift ? `Ca #${activeShift.id}` : 'Chưa mở ca'}
            </span>
          </button>
        )}

        {/* Live Vietnam Clock */}
        <div
          aria-label="Đồng hồ vận hành Việt Nam"
          className="hidden 2xl:inline-flex items-center gap-1.5 h-9 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 px-3 text-xs text-slate-600 dark:text-slate-300"
        >
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-mono-plate font-bold text-slate-800 dark:text-slate-100">
            {clock.time}
          </span>
          <span className="text-[11px] text-slate-400 capitalize">{clock.date}</span>
        </div>

        {/* Live WebSocket Indicator */}
        <div
          title={
            wsConnected ? 'Kết nối WebSocket thời gian thực' : 'Đang tự động kết nối lại WebSocket'
          }
          className={cn(
            'hidden sm:inline-flex items-center gap-1.5 h-9 rounded-xl border px-2.5 text-xs font-semibold',
            wsConnected
              ? 'border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
          )}
        >
          {wsConnected ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">{wsConnected ? 'LIVE' : 'Offline'}</span>
          {wsConnected && <Wifi className="h-3.5 w-3.5 lg:hidden" />}
        </div>

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700/90 bg-surface dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Actionable Alerts */}
        <AlertsPopover alerts={alerts} canAccessAdmin={canAccessAdmin} />

        {/* Refresh Button */}
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Làm mới dữ liệu"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700/90 bg-surface dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
          <span className="hidden sm:inline">Làm mới</span>
        </button>
      </div>
    </header>
  );
}
