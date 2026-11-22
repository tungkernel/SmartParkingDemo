import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Lock, Shield, Unlock, UserPlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { apiRequest, formatDateTime, getErrorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import type { AccountRecord, EmployeeRecord, UserRole } from '../../types';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { Modal } from '../ui/Modal';
import { PasswordInput } from '../ui/PasswordInput';
import { SearchInput } from '../ui/SearchInput';
import { TableSkeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';

export function AccountsTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const prefix = useId();

  const [createOpen, setCreateOpen] = useState(false);
  const [empId, setEmpId] = useState<number | ''>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [lockTarget, setLockTarget] = useState<AccountRecord | null>(null);
  const [editTarget, setEditTarget] = useState<AccountRecord | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('OPERATOR');
  const [resetPassword, setResetPassword] = useState('');

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
          username: username.trim(),
          password,
          role,
        }),
      }),
    onSuccess: () => {
      notify('ok', `Đã tạo tài khoản @${username.trim()}.`);
      setEmpId('');
      setUsername('');
      setPassword('');
      setRole('OPERATOR');
      setCreateOpen(false);
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
      setLockTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({
      accountId,
      payload,
    }: {
      accountId: number;
      payload: { role?: UserRole; new_password?: string };
    }) =>
      apiRequest(`/api/v1/accounts/${accountId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_res, vars) => {
      const msg = vars.payload.new_password
        ? 'Đã cập nhật tài khoản và đặt lại mật khẩu. Phiên cũ đã được thu hồi.'
        : 'Đã cập nhật vai trò tài khoản và đồng bộ phiên đăng nhập.';
      notify('ok', msg);
      setEditTarget(null);
      setResetPassword('');
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  const usedEmpIds = useMemo(() => new Set(accounts.map((a) => a.idnv)), [accounts]);
  const unassignedEmps = useMemo(
    () => employees.filter((e) => !usedEmpIds.has(e.id)),
    [employees, usedEmpIds],
  );

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (roleFilter !== 'ALL' && acc.role !== roleFilter) return false;
      if (!q) return true;
      return (
        acc.username.toLowerCase().includes(q) ||
        acc.ten_nhanvien.toLowerCase().includes(q) ||
        (acc.tenbaido?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [accounts, search, roleFilter]);

  const createFormId = `${prefix}-create-form`;
  const editFormId = `${prefix}-edit-form`;

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (resetPassword && resetPassword.length < 8) {
      notify('err', 'Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    const payload: { role?: UserRole; new_password?: string } = {};
    if (editRole !== editTarget.role) payload.role = editRole;
    if (resetPassword) payload.new_password = resetPassword;
    if (!payload.role && !payload.new_password) {
      notify('info', 'Không có thay đổi nào để cập nhật.');
      setEditTarget(null);
      return;
    }
    updateAccountMutation.mutate({ accountId: editTarget.id, payload });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[320px] max-h-[72vh] lg:max-h-none flex flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              containerClassName="w-60 sm:w-72"
              aria-label="Tìm tài khoản theo tên đăng nhập hoặc nhân viên"
              value={search}
              onChange={setSearch}
              placeholder="Tìm @username, họ tên, bãi..."
            />
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700/90 bg-slate-50 dark:bg-slate-800/80 p-0.5 text-xs">
              {(['ALL', 'ADMIN', 'ACCOUNTANT', 'OPERATOR'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 font-semibold transition-colors',
                    roleFilter === r
                      ? 'bg-surface dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  {r === 'ALL' ? 'Tất cả' : r}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setCreateOpen(true)}
          >
            Tạo tài khoản
          </Button>
        </div>

        <div className="flex-1 min-h-0 scroll-pane">
          {accountsQuery.isLoading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : accountsQuery.isError ? (
            <div className="p-5">
              <ErrorState
                message={getErrorMessage(accountsQuery.error)}
                onRetry={() => void accountsQuery.refetch()}
              />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-5 w-5" />}
              title="Không có tài khoản nào khớp bộ lọc"
              description="Thử xóa từ khóa tìm kiếm hoặc chọn lại nhóm vai trò."
            />
          ) : (
            <table className="w-full text-left text-[13px]">
              <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Tài khoản</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Nhân viên / Bãi phụ trách</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Vai trò RBAC</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Đăng nhập gần nhất</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                  <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredAccounts.map((acc) => {
                  const active = Boolean(acc.is_active);
                  return (
                    <tr
                      key={acc.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 font-mono-plate font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        @{acc.username}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {acc.ten_nhanvien}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {acc.chucvu} · {acc.tenbaido || 'Toàn hệ thống'}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <StatusBadge
                          tone={
                            acc.role === 'ADMIN'
                              ? 'violet'
                              : acc.role === 'ACCOUNTANT'
                                ? 'sky'
                                : 'slate'
                          }
                        >
                          {acc.role}
                        </StatusBadge>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-slate-500 tabular-nums">
                        {formatDateTime(acc.last_login_at)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <StatusBadge dot tone={active ? 'emerald' : 'rose'}>
                          {active ? 'Hoạt động' : 'Đã khóa'}
                        </StatusBadge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditRole(acc.role);
                              setResetPassword('');
                              setEditTarget(acc);
                            }}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Sửa / Đặt lại MK
                          </button>
                          <button
                            type="button"
                            disabled={toggleMutation.isPending}
                            onClick={() => {
                              if (active) {
                                setLockTarget(acc);
                              } else {
                                toggleMutation.mutate(acc);
                              }
                            }}
                            className={cn(
                              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
                              active
                                ? 'border-rose-200 dark:border-rose-900/80 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                : 'border-emerald-200 dark:border-emerald-900/80 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
                            )}
                          >
                            {active ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5" />
                            )}
                            {active ? 'Khóa' : 'Mở khóa'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Account Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidthClass="max-w-md"
        title="Tạo tài khoản nhân viên mới"
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <UserPlus className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={createFormId}
              variant="primary"
              loading={createMutation.isPending}
              disabled={!empId}
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
            </Button>
          </>
        }
      >
        <form
          id={createFormId}
          onSubmit={(e) => {
            e.preventDefault();
            if (empId) createMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div>
            <label
              htmlFor={`${prefix}-emp`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Nhân viên chưa có tài khoản ({unassignedEmps.length})
            </label>
            <select
              id={`${prefix}-emp`}
              required
              value={empId}
              onChange={(e) => setEmpId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
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
            <label
              htmlFor={`${prefix}-u`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
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
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-p`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Mật khẩu (tối thiểu 8 ký tự)
            </label>
            <PasswordInput
              id={`${prefix}-p`}
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-r`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Vai trò RBAC
            </label>
            <select
              id={`${prefix}-r`}
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
            >
              <option value="OPERATOR">OPERATOR (Bảo vệ / Quầy cổng)</option>
              <option value="ACCOUNTANT">ACCOUNTANT (Thu ngân / Kế toán)</option>
              <option value="ADMIN">ADMIN (Quản trị hệ thống)</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit Role / Reset Password Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        maxWidthClass="max-w-md"
        title={editTarget ? `Chỉnh sửa tài khoản @${editTarget.username}` : ''}
        subtitle={
          editTarget ? `${editTarget.ten_nhanvien} · Phiên cũ tự thu hồi sau khi lưu` : undefined
        }
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <Edit3 className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={editFormId}
              variant="primary"
              loading={updateAccountMutation.isPending}
            >
              {updateAccountMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </>
        }
      >
        {editTarget && (
          <form id={editFormId} onSubmit={handleEditSubmit} className="p-5 space-y-4 text-xs">
            <div>
              <label
                htmlFor={`${prefix}-edit-role`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Vai trò RBAC
              </label>
              <select
                id={`${prefix}-edit-role`}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
              >
                <option value="OPERATOR">OPERATOR (Bảo vệ / Quầy cổng)</option>
                <option value="ACCOUNTANT">ACCOUNTANT (Thu ngân / Kế toán)</option>
                <option value="ADMIN">ADMIN (Quản trị hệ thống)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor={`${prefix}-edit-pass`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Mật khẩu mới (để trống nếu không đổi, tối thiểu 8 ký tự)
              </label>
              <PasswordInput
                id={`${prefix}-edit-pass`}
                maxLength={128}
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Nhập mật khẩu đặt lại..."
              />
            </div>
          </form>
        )}
      </Modal>

      {/* Confirm Lock Account */}
      <ConfirmDialog
        open={Boolean(lockTarget)}
        title={lockTarget ? `Khóa tài khoản @${lockTarget.username}` : 'Khóa tài khoản'}
        message={
          lockTarget
            ? `Khóa tài khoản @${lockTarget.username} (${lockTarget.ten_nhanvien}) sẽ thu hồi ngay lập tức toàn bộ phiên đăng nhập và refresh token hiện hành. Bạn có chắc chắn muốn tiếp tục?`
            : ''
        }
        confirmLabel="Khóa tài khoản"
        loading={toggleMutation.isPending}
        onConfirm={() => lockTarget && toggleMutation.mutate(lockTarget)}
        onCancel={() => setLockTarget(null)}
      />
    </div>
  );
}
