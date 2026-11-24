import { Building2, CreditCard, Users } from 'lucide-react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CardsTab } from '../components/admin/CardsTab';
import { InfrastructureTab } from '../components/admin/InfrastructureTab';
import { PeopleTab } from '../components/admin/PeopleTab';
import { cn } from '../lib/cn';

export function AdminPage() {
  const tabs = [
    { to: '/admin/people', label: 'Nhân sự & Danh bạ', icon: Users },
    { to: '/admin/cards', label: 'Kho thẻ RFID', icon: CreditCard },
    { to: '/admin/infrastructure', label: 'Hạ tầng bãi/khu', icon: Building2 },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      <nav
        aria-label="Phân mục quản trị"
        className="shrink-0 card-surface flex flex-wrap gap-1.5 rounded-2xl p-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                  isActive
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="flex-1 min-h-0 flex flex-col">
        <Routes>
          <Route path="people" element={<PeopleTab />} />
          <Route path="cards" element={<CardsTab />} />
          <Route path="infrastructure" element={<InfrastructureTab />} />
          <Route path="*" element={<Navigate to="/admin/people" replace />} />
        </Routes>
      </div>
    </div>
  );
}
