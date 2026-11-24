import { Check, Database, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ACCENT_OPTIONS, useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn';
import { BrandMark } from '../ui/BrandMark';
import { NAV_GROUP_LABELS } from './navConfig';
import type { NavGroupKey, NavItem } from './navConfig';

interface SidebarProps {
  visibleNav: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const GROUP_ORDER: NavGroupKey[] = ['ops', 'finance', 'system'];

export function Sidebar({
  visibleNav,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { accent, setAccent } = useTheme();

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, onCloseMobile]);

  const groupedNav = GROUP_ORDER.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group],
    items: visibleNav.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0);

  const renderNavLinks = (isCollapsed: boolean, closeOnClick = false) => (
    <nav aria-label="Điều hướng chính" className="flex-1 min-h-0 scroll-pane px-3 py-4 space-y-5">
      {groupedNav.map((section) => (
        <div key={section.group}>
          {!isCollapsed && (
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {section.label}
            </div>
          )}
          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={isCollapsed ? item.label : undefined}
                  onClick={closeOnClick ? onCloseMobile : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-150',
                      isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                      isActive
                        ? 'bg-brand-soft border font-semibold shadow-2xs'
                        : 'border border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100/90 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand-600"
                        />
                      )}
                      <Icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-transform duration-150',
                          !isActive && 'group-hover:scale-105',
                        )}
                      />
                      {!isCollapsed && <span className="truncate">{item.label}</span>}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderAccentPicker = (isCollapsed: boolean) => (
    <div
      className={cn(
        'flex items-center gap-1.5',
        isCollapsed ? 'flex-col py-1' : 'justify-between px-1',
      )}
    >
      {!isCollapsed && (
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Điểm nhấn màu
        </span>
      )}
      <div className={cn('flex items-center gap-1.5', isCollapsed && 'flex-col')}>
        {ACCENT_OPTIONS.map((opt) => {
          const active = accent === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setAccent(opt.id)}
              title={`${opt.label} — ${opt.tagline}`}
              aria-label={`Chọn màu chủ đạo ${opt.label}`}
              aria-pressed={active}
              className={cn(
                'relative flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110',
                active &&
                  'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-500 dark:ring-offset-slate-900',
              )}
              style={{ backgroundColor: opt.swatch }}
            >
              {active && <Check className="h-3 w-3 text-white stroke-[3]" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'no-print hidden lg:flex lg:h-full lg:overflow-hidden shrink-0 flex-col border-r border-slate-200/90 dark:border-slate-800/90 bg-rail transition-[width] duration-200',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'shrink-0 flex items-center border-b border-slate-200/80 dark:border-slate-800/90 h-14',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark size={collapsed ? 'sm' : 'md'} />
            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold tracking-tight text-sm text-slate-900 dark:text-slate-100 truncate">
                    Smart Parking
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <span>PTIT OPS</span>
                  <span className="h-1 w-1 rounded-full bg-rose-500" />
                  <span className="font-mono-plate">13 Bảng</span>
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Thu gọn thanh điều hướng"
              title="Thu gọn thanh điều hướng"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Mở rộng thanh điều hướng"
              title="Mở rộng thanh điều hướng"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        {renderNavLinks(collapsed)}

        <div className="border-t border-slate-200/80 dark:border-slate-800/90 p-3 space-y-3">
          {renderAccentPicker(collapsed)}

          {collapsed ? (
            <div className="flex justify-center pt-1 border-t border-slate-100 dark:border-slate-800">
              <div
                title="Quản lý Bãi xe PTIT · 13 bảng CSDL"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft border"
              >
                <Database className="h-4 w-4" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-900/90 p-3 border border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft border">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    Quản lý Bãi xe PTIT
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Quản trị tập trung · 13 bảng CSDL
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="no-print animate-fade-in fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu điều hướng"
        >
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={onCloseMobile} />
          <div className="relative z-10 flex w-72 max-w-[85vw] flex-col bg-rail shadow-2xl border-r border-slate-200 dark:border-slate-800">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 h-14">
              <div className="flex items-center gap-2.5">
                <BrandMark size="sm" />
                <div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Smart Parking
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    PTIT Operations · 13 Bảng
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={onCloseMobile}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {renderNavLinks(false, true)}

            <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
              {renderAccentPicker(false)}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft border">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    Quản lý Bãi xe PTIT
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Quản trị tập trung · 13 bảng CSDL
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
