import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Unlock, UserPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, formatDateTime, getErrorMessage } from '../../lib/api';
import type { AccountRecord, EmployeeRecord, UserRole } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

export function AccountsTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const prefix = useId();

  const [empId, setEmpId] = useState<number | ''>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');

  const accountsQuery = useQuery<AccountRecord[]>({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => apiRequest<AccountRecord[]>('/api/v1/accounts', { signal }),
  });

  const employeesQuery = useQuery<EmployeeRecord[]>({
    queryKey: ['people', 'employees'],
    queryFn: ({ signal }) => apiRequest<EmployeeRecord[]>('/api/v1/people/employees', { signal }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: Number(empId),
          username,
          password,
          role,
        }),
      }),
    onSuccess: () => {
      notify('ok', `Đã tạo tài khoản @${username}.`);
      setUsername('');
      setPassword('');
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (acc: AccountRecord) =>
      apiRequest(`/api/v1/accounts/${acc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !acc.is_active }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật trạng thái tài khoản và đồng bộ phiên đăng nhập.');
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const accounts = accountsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];
  const usedEmpIds = new Set(accounts.map((a) => a.idnv));
  const unassignedEmps = employees.filter((e) => !usedEmpIds.has(e.id));

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (empId) createMutation.mutate();
        }}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end text-xs"
      >
        <div>
          <label htmlFor={`${prefix}-emp`} className="block font-semibold mb-1">
            Nhân viên chưa có tài khoản
          </label>
          <select
            id={`${prefix}-emp`}
            required
            value={empId}
            onChange={(e) => setEmpId(e.target.value ? Number(e.target.value) : '')}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          >
            <option value="">-- Chọn nhân viên --</option>
            {unassignedEmps.map((e) => (
              <option key={e.id} value={e.id}>
                #{e.id} · {e.hoten} ({e.chucvu})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${prefix}-u`} className="block font-semibold mb-1">
            Tên đăng nhập
          </label>
          <input
            id={`${prefix}-u`}
            required
            minLength={3}
            maxLength={50}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="baove_b2"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-p`} className="block font-semibold mb-1">
            Mật khẩu (tối thiểu 8 ký tự)
          </label>
          <input
            id={`${prefix}-p`}
            type="password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-r`} className="block font-semibold mb-1">
            Vai trò RBAC
          </label>
          <select
            id={`${prefix}-r`}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          >
            <option value="OPERATOR">OPERATOR (Bảo vệ/Cổng)</option>
            <option value="ACCOUNTANT">ACCOUNTANT (Thu ngân/Kế toán)</option>
            <option value="ADMIN">ADMIN (Quản trị)</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending || !empId}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" />
          {createMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Nhân viên / Bãi</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Đăng nhập gần nhất</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {accounts.map((acc) => {
                const active = Boolean(acc.is_active);
                return (
                  <tr key={acc.id}>
                    <td className="px-4 py-3 font-mono-plate font-bold">@{acc.username}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{acc.ten_nhanvien}</div>
                      <div className="text-[11px] text-slate-500">
                        {acc.chucvu} · {acc.tenbaido || 'Toàn hệ thống'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={acc.role === 'ADMIN' ? 'indigo' : acc.role === 'ACCOUNTANT' ? 'sky' : 'slate'}>
                        {acc.role}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDateTime(acc.last_login_at)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={active ? 'emerald' : 'rose'}>
                        {active ? 'Hoạt động' : 'Đã khóa'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate(acc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                      >
                        {active ? <Lock className="h-3 w-3 text-rose-500" /> : <Unlock className="h-3 w-3 text-emerald-500" />}
                        {active ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
