import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CarFront, Moon, Palette, RefreshCw, Search, Sun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCENT_OPTIONS, useTheme } from '../../context/ThemeContext';
import { apiRequest } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { ActiveTurn } from '../../types';
import { LicensePlate } from '../ui/LicensePlate';
import type { NavItem } from './navConfig';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  visibleNav: NavItem[];
  onRefreshAll: () => void;
}

interface CommandItem {
  id: string;
  group: 'Xe đang trong bãi' | 'Điều hướng phân hệ' | 'Thao tác nhanh';
  label: string;
  hint?: string;
  keywords: string;
  icon: ReactNode;
  badge?: ReactNode;
  onSelect: () => void;
}

export function CommandPalette({ open, onClose, visibleNav, onRefreshAll }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const turnsQuery = useQuery<ActiveTurn[]>({
    queryKey: ['turns', 'active'],
    queryFn: ({ signal }) => apiRequest<ActiveTurn[]>('/api/v1/turns/active', { signal }),
    enabled: open,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }, 10);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: CommandItem[] = [];

    // 1. Active parked vehicles matching query (top 5 when searching, top 3 otherwise)
    const activeTurns = turnsQuery.data ?? [];
    const matchingTurns = q
      ? activeTurns.filter(
          (t) =>
            t.bienso.toLowerCase().includes(q) ||
            t.mathe.toLowerCase().includes(q) ||
            t.chu_xe.toLowerCase().includes(q),
        )
      : activeTurns.slice(0, 3);

    matchingTurns.slice(0, 5).forEach((turn) => {
      list.push({
        id: `turn-${turn.id_luotdo}`,
        group: 'Xe đang trong bãi',
        label: turn.bienso,
        hint: `Thẻ #${turn.mathe} · ${turn.tenbaido} (${turn.khuvuc}-${turn.vitri})`,
        keywords: `${turn.bienso} ${turn.mathe} ${turn.chu_xe} ${turn.tenbaido}`,
        icon: <CarFront className="h-4 w-4 text-sky-500" />,
        badge: <LicensePlate plate={turn.bienso} size="xs" />,
        onSelect: () => {
          onClose();
          navigate(`/gate?q=${encodeURIComponent(turn.bienso)}`);
        },
      });
    });

    // 2. Navigation items
    visibleNav.forEach((nav) => {
      const Icon = nav.icon;
      list.push({
        id: `nav-${nav.to}`,
        group: 'Điều hướng phân hệ',
        label: nav.label,
        hint: nav.subtitle,
        keywords: `${nav.label} ${nav.title} ${nav.subtitle} ${nav.to}`,
        icon: <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />,
        onSelect: () => {
          onClose();
          navigate(nav.to);
        },
      });
    });

    // 3. Quick actions
    const nextAccent =
      ACCENT_OPTIONS[
        (ACCENT_OPTIONS.findIndex((o) => o.id === accent) + 1) % ACCENT_OPTIONS.length
      ];

    list.push(
      {
        id: 'act-theme',
        group: 'Thao tác nhanh',
        label: theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối',
        hint: 'Tối ưu ánh sáng ngày/đêm tại bốt trực',
        keywords: 'dark light theme giao dien sang toi',
        icon:
          theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-500" />
          ),
        onSelect: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: 'act-accent',
        group: 'Thao tác nhanh',
        label: `Đổi điểm nhấn màu sang ${nextAccent?.label ?? 'Cobalt Ops'}`,
        hint: nextAccent?.tagline,
        keywords: 'mau sac accent theme color ptit crimson cobalt',
        icon: <Palette className="h-4 w-4 text-rose-500" />,
        onSelect: () => {
          if (nextAccent) setAccent(nextAccent.id);
          onClose();
        },
      },
      {
        id: 'act-refresh',
        group: 'Thao tác nhanh',
        label: 'Làm mới dữ liệu toàn hệ thống',
        hint: 'Đồng bộ lại toàn bộ truy vấn React Query',
        keywords: 'refresh reload lam moi dong bo',
        icon: <RefreshCw className="h-4 w-4 text-sky-500" />,
        onSelect: () => {
          onRefreshAll();
          onClose();
        },
      },
    );

    if (!q) return list;
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.hint?.toLowerCase().includes(q) ?? false) ||
        item.keywords.toLowerCase().includes(q),
    );
  }, [
    accent,
    navigate,
    onClose,
    onRefreshAll,
    query,
    setAccent,
    theme,
    toggleTheme,
    turnsQuery.data,
    visibleNav,
  ]);

  const safeIndex = items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0;

  if (!open) return null;

  const grouped = (['Xe đang trong bãi', 'Điều hướng phân hệ', 'Thao tác nhanh'] as const)
    .map((group) => ({
      group,
      entries: items
        .map((item, idx) => ({ item, idx }))
        .filter((entry) => entry.item.group === group),
    }))
    .filter((g) => g.entries.length > 0);

  return (
    <div
      className="no-print animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh tìm kiếm nhanh"
        className="animate-modal-in w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-surface dark:bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) =>
                  items.length > 0 ? (i - 1 + items.length) % items.length : 0,
                );
              } else if (e.key === 'Enter' && items[safeIndex]) {
                e.preventDefault();
                items[safeIndex].onSelect();
              }
            }}
            placeholder="Nhập biển số xe, tên phân hệ hoặc lệnh thao tác..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none"
          />
          <kbd className="kbd-keycap">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto scroll-pane p-2 space-y-3">
          {grouped.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Không tìm thấy kết quả khớp với &ldquo;{query}&rdquo;.
            </div>
          ) : (
            grouped.map((sec) => (
              <div key={sec.group}>
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {sec.group}
                </div>
                <div className="space-y-0.5">
                  {sec.entries.map(({ item, idx }) => {
                    const active = idx === safeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={item.onSelect}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                          active
                            ? 'bg-brand-soft border'
                            : 'border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/70',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {item.badge ?? (
                                <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {item.label}
                                </span>
                              )}
                            </div>
                            {item.hint && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {item.hint}
                              </div>
                            )}
                          </div>
                        </div>
                        <ArrowRight
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-opacity',
                            active ? 'opacity-100 text-brand-600 dark:text-brand-400' : 'opacity-0',
                          )}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd-keycap">↑↓</kbd> Chọn
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="kbd-keycap">Enter</kbd> Mở
            </span>
          </div>
          <span className="font-mono-plate text-[10px]">Smart Parking PTIT</span>
        </div>
      </div>
    </div>
  );
}
