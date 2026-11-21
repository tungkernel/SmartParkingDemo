import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest, formatDateTime, formatVnd } from '../../lib/api';
import type { CustomerRecord, EmployeeRecord, VehicleRecord, WalkinRecord } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

type PeopleSubTab = 'employees' | 'customers' | 'walkins' | 'vehicles';

export function PeopleTab() {
  const [sub, setSub] = useState<PeopleSubTab>('employees');

  const employeesQuery = useQuery<EmployeeRecord[]>({
    queryKey: ['people', 'employees'],
    queryFn: ({ signal }) => apiRequest<EmployeeRecord[]>('/api/v1/people/employees', { signal }),
    enabled: sub === 'employees',
  });

  const customersQuery = useQuery<CustomerRecord[]>({
    queryKey: ['people', 'customers'],
    queryFn: ({ signal }) => apiRequest<CustomerRecord[]>('/api/v1/people/customers', { signal }),
    enabled: sub === 'customers',
  });

  const walkinsQuery = useQuery<WalkinRecord[]>({
    queryKey: ['people', 'walkins'],
    queryFn: ({ signal }) => apiRequest<WalkinRecord[]>('/api/v1/people/walkins?limit=200', { signal }),
    enabled: sub === 'walkins',
  });

  const vehiclesQuery = useQuery<VehicleRecord[]>({
    queryKey: ['vehicles'],
    queryFn: ({ signal }) => apiRequest<VehicleRecord[]>('/api/v1/vehicles', { signal }),
    enabled: sub === 'vehicles',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Danh bạ đối tượng">
        {(
          [
            ['employees', 'Nhân sự vận hành'],
            ['customers', 'Khách vé tháng'],
            ['walkins', 'Khách vãng lai'],
            ['vehicles', 'Danh bạ phương tiện'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sub === key}
            onClick={() => setSub(key)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold border transition ${
              sub === key
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          {sub === 'employees' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Họ tên / Chức vụ</th>
                  <th className="px-4 py-3">Bãi phụ trách</th>
                  <th className="px-4 py-3">SĐT / CCCD</th>
                  <th className="px-4 py-3">Email / Địa chỉ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(employeesQuery.data ?? []).map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">
                      <div className="font-bold">{e.hoten}</div>
                      <div className="text-[11px] text-slate-500">{e.chucvu}</div>
                    </td>
                    <td className="px-4 py-3">{e.tenbaido}</td>
                    <td className="px-4 py-3 font-mono-plate">
                      <div>{e.sdt || '—'}</div>
                      <div className="text-[11px] text-slate-500">{e.cccd || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{e.email || '—'}</div>
                      <div className="text-[11px] text-slate-500">{e.diachi || '—'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'customers' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Họ tên</th>
                  <th className="px-4 py-3">Đối tượng</th>
                  <th className="px-4 py-3">SĐT / CCCD</th>
                  <th className="px-4 py-3">Biển số đăng ký</th>
                  <th className="px-4 py-3 text-right">Vé hiệu lực</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(customersQuery.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-bold">{c.hoten}</td>
                    <td className="px-4 py-3">{c.loaikhachhang}</td>
                    <td className="px-4 py-3 font-mono-plate">
                      <div>{c.sdt || '—'}</div>
                      <div className="text-[11px] text-slate-500">{c.cccd || '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono-plate">{c.bien_so_dang_ky}</td>
                    <td className="px-4 py-3 text-right font-bold">
                      {c.so_ve_hieu_luc} / {c.tong_ve_da_dang_ky}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'walkins' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Biển số / Xe</th>
                  <th className="px-4 py-3">Vị trí / Thẻ</th>
                  <th className="px-4 py-3">Giờ vào</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Chi phí</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(walkinsQuery.data ?? []).map((w) => (
                  <tr key={w.id_luotdo}>
                    <td className="px-4 py-3">
                      <div className="font-mono-plate font-bold">{w.bienso || '—'}</div>
                      <div className="text-[11px] text-slate-500">{w.loaiphuongtien || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{w.vitri_do}</div>
                      <div className="text-[11px] text-slate-500">Thẻ #{w.mathe}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(w.giovao)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={w.trang_thai === 'Đang gửi' ? 'amber' : 'emerald'}>
                        {w.trang_thai}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatVnd(w.chiphi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sub === 'vehicles' && (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Biển số</th>
                  <th className="px-4 py-3">Loại xe</th>
                  <th className="px-4 py-3">Chủ xe</th>
                  <th className="px-4 py-3 text-right">Tổng lượt</th>
                  <th className="px-4 py-3">Tình trạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(vehiclesQuery.data ?? []).map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 font-mono-plate font-bold">{v.bienso}</td>
                    <td className="px-4 py-3 capitalize">{v.loaiphuongtien}</td>
                    <td className="px-4 py-3">{v.chu_xe}</td>
                    <td className="px-4 py-3 text-right font-bold">{v.tong_luot}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={v.dang_trong_bai ? 'amber' : 'slate'}>
                        {v.dang_trong_bai ? 'Đang trong bãi' : 'Ngoài bãi'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
