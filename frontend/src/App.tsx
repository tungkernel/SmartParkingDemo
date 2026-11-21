import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TicketPrintModal } from './components/TicketPrintModal';
import type { PrintableDocument } from './components/TicketPrintModal';
import { CommandPalette } from './components/layout/CommandPalette';
import { NAV_ITEMS } from './components/layout/navConfig';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { BrandMark } from './components/ui/BrandMark';
import { PageSkeleton } from './components/ui/Skeleton';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { useLiveSocket } from './hooks/useLiveSocket';
import { apiRequest } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import type { OperationalAlerts, ShiftRecord, UserRole } from './types';

const SIDEBAR_STORAGE_KEY = 'smart_parking_sidebar_collapsed';

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
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

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

function readInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const { user, bootstrapping, logout } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readInitialCollapsed);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const wsConnected = useLiveSocket(Boolean(user));

  const { data: alerts } = useQuery<OperationalAlerts>({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => apiRequest<OperationalAlerts>('/api/v1/alerts', { signal }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const { data: activeShiftRes } = useQuery<{ shift: ShiftRecord | null }>({
    queryKey: ['shifts', 'active'],
    queryFn: ({ signal }) =>
      apiRequest<{ shift: ShiftRecord | null }>('/api/v1/shifts/active', { signal }),
    enabled: Boolean(user),
    staleTime: 30_000,
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

  // Global Command Palette shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    if (!user) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    setMobileMenu(false);
    setCommandOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const handleManualRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
    notify('info', 'Đã làm mới dữ liệu toàn hệ thống.');
  }, [queryClient, notify]);

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-canvas bg-grid-dots">
        <BrandMark size="lg" />
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Đang xác thực phiên làm việc...
        </div>
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

  const canAccessAdmin = user.role === 'ADMIN' || user.role === 'ACCOUNTANT';

  return (
    <div className="app-shell-root min-h-screen lg:h-dvh lg:overflow-hidden flex bg-canvas text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Chuyển tới nội dung chính
      </a>

      <Sidebar
        user={user}
        visibleNav={visibleNav}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileMenu}
        onCloseMobile={() => setMobileMenu(false)}
        onOpenChangePassword={() => setShowChangePassword(true)}
        onLogout={() => void handleLogout()}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:h-full lg:overflow-hidden">
        <TopHeader
          activeNav={activeNav}
          wsConnected={wsConnected}
          alerts={alerts}
          activeShift={activeShiftRes?.shift}
          canAccessAdmin={canAccessAdmin}
          onOpenMobileMenu={() => setMobileMenu(true)}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onManualRefresh={handleManualRefresh}
        />

        {user.must_change_password && (
          <div
            role="status"
            className="no-print shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/70 bg-amber-50/90 dark:bg-amber-950/50 px-4 lg:px-6 py-2.5 text-xs text-amber-900 dark:text-amber-200"
          >
            <span className="inline-flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              Tài khoản đang sử dụng mật khẩu khởi tạo mặc định. Vui lòng đổi mật khẩu để bảo đảm an
              toàn.
            </span>
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="rounded-xl bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 transition-colors"
            >
              Đổi mật khẩu ngay
            </button>
          </div>
        )}

        <main
          id="main-content"
          className="no-print flex-1 min-h-0 flex flex-col p-3 sm:p-4 lg:px-5 lg:py-4 max-w-[1520px] w-full mx-auto lg:overflow-y-auto scroll-pane"
        >
          <Suspense fallback={<PageSkeleton />}>
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

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        visibleNav={visibleNav}
        onRefreshAll={handleManualRefresh}
        onOpenChangePassword={() => setShowChangePassword(true)}
      />

      <TicketPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />

      <ChangePasswordModal
        open={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        onPasswordChanged={handleLogout}
      />
    </div>
  );
}
