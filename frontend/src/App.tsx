import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TicketPrintModal } from './components/TicketPrintModal';
import type { PrintableDocument } from './components/TicketPrintModal';
import { CommandPalette } from './components/layout/CommandPalette';
import { NAV_ITEMS } from './components/layout/navConfig';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { PageSkeleton } from './components/ui/Skeleton';
import { useToast } from './context/ToastContext';
import { useLiveSocket } from './hooks/useLiveSocket';
import { apiRequest } from './lib/api';
import type { OperationalAlerts } from './types';

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
const TransactionsPage = lazy(() =>
  import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
);
const AnalyticsPage = lazy(() =>
  import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

function readInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readInitialCollapsed);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocument | null>(null);

  const wsConnected = useLiveSocket(true);

  const { data: alerts } = useQuery<OperationalAlerts>({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => apiRequest<OperationalAlerts>('/api/v1/alerts', { signal }),
    refetchInterval: 60_000,
  });

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
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const handleManualRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
    notify('info', 'Đã làm mới dữ liệu toàn hệ thống.');
  }, [queryClient, notify]);

  return (
    <div className="app-shell-root min-h-screen lg:h-dvh lg:overflow-hidden flex bg-canvas text-slate-900 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Chuyển tới nội dung chính
      </a>

      <Sidebar
        visibleNav={NAV_ITEMS}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileMenu}
        onCloseMobile={() => setMobileMenu(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:h-full lg:overflow-hidden">
        <TopHeader
          activeNav={activeNav}
          wsConnected={wsConnected}
          alerts={alerts}
          onOpenMobileMenu={() => setMobileMenu(true)}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onManualRefresh={handleManualRefresh}
        />

        <main
          id="main-content"
          className="no-print flex-1 min-h-0 flex flex-col p-3 sm:p-4 lg:px-5 lg:py-4 max-w-[1520px] w-full mx-auto lg:overflow-y-auto scroll-pane"
        >
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              <Route path="/gate" element={<GatePosPage onPrint={setPrintDoc} />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/passes" element={<PassesTariffsPage onPrint={setPrintDoc} />} />
              <Route path="/transactions" element={<TransactionsPage onPrint={setPrintDoc} />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/admin/*" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/gate" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        visibleNav={NAV_ITEMS}
        onRefreshAll={handleManualRefresh}
      />

      <TicketPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
