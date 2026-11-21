import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { apiRequest, getErrorMessage } from '../lib/api';
import { Modal } from './ui/Modal';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onPasswordChanged: () => Promise<void>;
}

export function ChangePasswordModal({
  open,
  onClose,
  onPasswordChanged,
}: ChangePasswordModalProps) {
  const { notify } = useToast();
  const idPrefix = useId();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const resetAndClose = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword === oldPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });
      notify('ok', 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.');
      resetAndClose();
      await onPasswordChanged();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="Đổi mật khẩu tài khoản"
      titleIcon={<KeyRound className="h-4 w-4 text-indigo-600" />}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4 text-xs">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-rose-700 dark:text-rose-300 font-medium"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor={`${idPrefix}-old`}
            className="block font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Mật khẩu hiện tại
          </label>
          <input
            id={`${idPrefix}-old`}
            type="password"
            required
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-new`}
            className="block font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Mật khẩu mới (tối thiểu 8 ký tự)
          </label>
          <input
            id={`${idPrefix}-new`}
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-confirm`}
            className="block font-semibold text-slate-600 dark:text-slate-300 mb-1"
          >
            Nhập lại mật khẩu mới
          </label>
          <input
            id={`${idPrefix}-confirm`}
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={submitting}
            onClick={resetAndClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Đang cập nhật...' : 'Lưu mật khẩu mới'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
