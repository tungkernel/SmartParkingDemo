import { Building2, CreditCard, History, Shield, Users } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AccountsTab } from '../components/admin/AccountsTab';
import { AuditLogsTab } from '../components/admin/AuditLogsTab';
import { CardsTab } from '../components/admin/CardsTab';
import { InfrastructureTab } from '../components/admin/InfrastructureTab';
import { PeopleTab } from '../components/admin/PeopleTab';
import type { AuthUser } from '../types';

interface AdminPageProps {
  user: AuthUser;
}

export function AdminPage({ user }: AdminPageProps) {
  const isAdmin = user.role === 'ADMIN';
  const tabs = [
    ...(isAdmin ? [{ to: '/admin/accounts', label: 'Tài khoản RBAC', icon: Shield }] : []),
    { to: '/admin/people', label: 'Nhân sự & Danh bạ', icon: Users },
    { to: '/admin/cards', label: 'Kho thẻ RFID', icon: CreditCard },
    ...(isAdmin ? [{ to: '/admin/infrastructure', label: 'Hạ tầng bãi/khu', icon: Building2 }] : []),
    { to: '/admin/audit', label: 'Nhật ký Kiểm toán', icon: History },
  ];

  const defaultTab = isAdmin ? '/admin/accounts' : '/admin/people';

  return (
    <div className="space-y-5">
      <nav
        aria-label="Phân mục quản trị"
        className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <Routes>
        {isAdmin && <Route path="accounts" element={<AccountsTab />} />}
        <Route path="people" element={<PeopleTab />} />
        <Route path="cards" element={<CardsTab />} />
        {isAdmin && <Route path="infrastructure" element={<InfrastructureTab />} />}
        <Route path="audit" element={<AuditLogsTab />} />
        <Route path="*" element={<Navigate to={defaultTab} replace />} />
      </Routes>
    </div>
  );
}
