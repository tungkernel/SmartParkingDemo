import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CarFront,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  RefreshCw,
  Shield,
  Sun,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TicketPrintModal } from './components/TicketPrintModal';
import type { PrintableDocument } from './components/TicketPrintModal';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import { useToast } from './context/ToastContext';
import { useLiveSocket } from './hooks/useLiveSocket';
import { apiRequest } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import type { OperationalAlerts, UserRole } from './types';

const GatePosPage = lazy(() =>
  import('./pages/GatePosPage').then((m) => ({ default: m.GatePosPage })),
);
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const PassesTariffsPage = lazy(() =>
  import('./pages/PassesTariffsPage').then((m) => ({ default: m.PassesTariffsPage })),
);
const TransactionsShiftsPage = lazy(() =>
  import('./pages/TransactionsShiftsPage').then((m) => ({ default: m.TransactionsShiftsPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })),
);

interface NavItem {
  to: string;
  label: string;
  title: string;
  icon: LucideIcon;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/gate',
    label: 'Cổng Vào / Ra (POS)',
    title: 'Quầy Vào / Ra (POS)',
    icon: CarFront,
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/overview',
    label: 'Tổng quan & Sơ đồ',
    title: 'Tổng quan & Sơ đồ Bãi xe',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/passes',
    label: 'Vé tháng & Bảng giá',
    title: 'Quản lý Vé tháng & Bảng giá',
    icon: CreditCard,
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/transactions',
    label: 'Giao dịch & Ca trực',
    title: 'Lịch sử Giao dịch & Ca trực',
    icon: ReceiptText,
    roles: ['ADMIN', 'ACCOUNTANT', 'OPERATOR'],
  },
  {
    to: '/analytics',
    label: 'Phân tích Doanh thu',
    title: 'Phân tích Doanh thu',
    icon: BarChart3,
    roles: ['ADMIN', 'ACCOUNTANT'],
  },
  {
    to: '/admin',
    label: 'Quản trị & Kiểm toán',
    title: 'Quản trị Hệ thống & Kiểm toán',
    icon: Shield,
    roles: ['ADMIN', 'ACCOUNTANT'],
  },
];

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-slate-500 dark:text-slate-400">
      Đang tải phân hệ...
    </div>
  );
}

function RequireRole({
  roles,
  userRole,
  children,
}: {
  roles: UserRole[];
  userRole: UserRole;
  children: React.ReactNode;
}) {
  if (!roles.includes(userRole)) {
    return <Navigate to="/gate" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, bootstrapping, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenu, setMobileMenu] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const alertMenuRef = useRef<HTMLDivElement>(null);

  const wsConnected = useLiveSocket(Boolean(user));

  const { data: alerts } = useQuery<OperationalAlerts>({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => apiRequest<OperationalAlerts>('/api/v1/alerts', { signal }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const visibleNav = useMemo(
    () => (user ? NAV_ITEMS.filter((item) => item.roles.includes(user.role)) : []),
    [user],
  );

  const activeNav = useMemo(
    () => NAV_ITEMS.find((n) => location.pathname.startsWith(n.to)),
    [location.pathname],
  );

  useEffect(() => {
    document.title = activeNav
      ? `${activeNav.title} | Smart Parking PTIT`
      : 'Smart Parking PTIT — Hệ thống Quản lý Bãi đỗ xe';
  }, [activeNav]);

  useEffect(() => {
    if (!showAlerts) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (alertMenuRef.current && !alertMenuRef.current.contains(e.target as Node)) {
        setShowAlerts(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAlerts(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showAlerts]);

  const handleLogout = useCallback(async () => {
    setShowAlerts(false);
    setMobileMenu(false);
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleManualRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
    notify('info', 'Đã làm mới dữ liệu toàn hệ thống.');
  }, [queryClient, notify]);

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm">
        Đang xác thực phiên đăng nhập...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const alertCount =
    (alerts?.overdue_turns.length ?? 0) +
    (alerts?.expiring_passes.length ?? 0) +
    (alerts?.lost_cards.length ?? 0);

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CarFront className="h-5 w-5" />
          </div>
          <div>
            <div className="font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Smart Parking
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              PTIT Operations v2.1
            </div>
          </div>
        </div>

        <nav aria-label="Điều hướng chính" className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
              {user.full_name}
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>@{user.username}</span>
              <span className="rounded-md bg-indigo-100 dark:bg-indigo-950 px-1.5 py-0.5 font-semibold text-indigo-700 dark:text-indigo-300">
                {user.role}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 hover:border-indigo-200"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Đổi mật khẩu
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-600 hover:border-rose-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenu && (
        <div
          className="no-print fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Menu điều hướng"
        >
          <div className="fixed inset-0 bg-slate-900/50" onClick={() => setMobileMenu(false)} />
          <div className="relative z-10 flex w-72 flex-col bg-white dark:bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
              <span className="font-bold text-slate-900 dark:text-slate-100">Smart Parking PTIT</span>
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setMobileMenu(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-3 rounded-xl bg-slate-50 dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                {user.full_name}
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>@{user.username}</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{user.role}</span>
              </div>
            </div>
            <nav className="flex-1 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenu(false)}
                    className={({ isActive }) =>
                      `w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-semibold'
                          : 'text-slate-600 dark:text-slate-300'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenu(false);
                  setShowChangePassword(true);
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400"
              >
                <KeyRound className="h-4 w-4" />
                Đổi mật khẩu
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-sm font-medium text-rose-600"
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 lg:px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Mở menu điều hướng"
              onClick={() => setMobileMenu(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-base lg:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {activeNav?.title ?? 'Smart Parking PTIT'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                wsConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {wsConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span>{wsConnected ? 'Đồng bộ Real-time' : 'Đang kết nối lại...'}</span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <div className="relative" ref={alertMenuRef}>
              <button
                type="button"
                aria-label="Xem cảnh báo vận hành"
                aria-expanded={showAlerts}
                onClick={() => setShowAlerts((v) => !v)}
                className="relative rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
                {alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {alertCount}
                  </span>
                )}
              </button>

              {showAlerts && (
                <div className="fixed sm:absolute right-3 sm:right-0 mt-2 w-[calc(100vw-1.5rem)] sm:w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl z-40">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Cảnh báo vận hành ({alertCount})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAlerts(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Đóng
                    </button>
                  </div>
                  <div className="mt-2.5 max-h-72 overflow-y-auto space-y-2.5 text-xs">
                    {alertCount === 0 && (
                      <div className="py-4 text-center text-slate-400">
                        Không có cảnh báo bất thường.
                      </div>
                    )}
                    {alerts && alerts.overdue_turns.length > 0 && (
                      <div>
                        <div className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 mb-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Xe gửi quá 24 giờ ({alerts.overdue_turns.length})
                        </div>
                        {alerts.overdue_turns.slice(0, 5).map((t) => (
                          <div
                            key={t.id}
                            className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 mb-1 text-slate-700 dark:text-slate-200"
                          >
                            <span className="font-mono-plate font-bold">{t.bienso}</span> —{' '}
                            {t.tenbaido} ({t.hours_parked}h)
                          </div>
                        ))}
                      </div>
                    )}
                    {alerts && alerts.expiring_passes.length > 0 && (
                      <div>
                        <div className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                          Vé tháng sắp hết hạn ({alerts.expiring_passes.length})
                        </div>
                        {alerts.expiring_passes.slice(0, 5).map((p) => (
                          <div
                            key={p.id}
                            className="rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 mb-1 text-slate-700 dark:text-slate-200"
                          >
                            <span className="font-mono-plate font-bold">{p.bienso}</span> ({p.ten_khachhang}) — còn {p.days_left} ngày
                          </div>
                        ))}
                      </div>
                    )}
                    {alerts && alerts.lost_cards.length > 0 && (
                      <div>
                        <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Thẻ đang báo Mất / Hỏng ({alerts.lost_cards.length})
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {alerts.lost_cards.slice(0, 12).map((c) => (
                            <span
                              key={c.id}
                              className="rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 font-mono-plate text-[11px] font-semibold"
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

            <button
              type="button"
              onClick={handleManualRefresh}
              aria-label="Làm mới dữ liệu"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </header>

        {user.must_change_password && (
          <div
            role="status"
            className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 px-4 lg:px-6 py-2.5 text-xs text-amber-900 dark:text-amber-200"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              Tài khoản đang sử dụng mật khẩu khởi tạo mặc định. Vui lòng đổi mật khẩu để bảo đảm an toàn.
            </span>
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700"
            >
              Đổi mật khẩu ngay
            </button>
          </div>
        )}

        <main className="no-print flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/gate" element={<GatePosPage user={user} onPrint={setPrintDoc} />} />
              <Route path="/overview" element={<OverviewPage user={user} />} />
              <Route
                path="/passes"
                element={<PassesTariffsPage user={user} onPrint={setPrintDoc} />}
              />
              <Route
                path="/transactions"
                element={<TransactionsShiftsPage user={user} onPrint={setPrintDoc} />}
              />
              <Route
                path="/analytics"
                element={
                  <RequireRole roles={['ADMIN', 'ACCOUNTANT']} userRole={user.role}>
                    <AnalyticsPage />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <RequireRole roles={['ADMIN', 'ACCOUNTANT']} userRole={user.role}>
                    <AdminPage user={user} />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Navigate to="/gate" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <TicketPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onPasswordChanged={handleLogout}
      />
    </div>
  );
}
