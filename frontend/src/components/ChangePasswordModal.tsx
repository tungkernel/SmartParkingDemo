import { KeyRound } from 'lucide-react';
import { useId, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { apiRequest, getErrorMessage } from '../lib/api';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { PasswordInput } from './ui/PasswordInput';

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
      subtitle="Phiên hiện tại sẽ được đăng xuất sau khi cập nhật thành công"
      titleIcon={
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
          <KeyRound className="h-4 w-4" />
        </span>
      }
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
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Mật khẩu hiện tại
          </label>
          <PasswordInput
            id={`${idPrefix}-old`}
            required
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-new`}
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Mật khẩu mới (tối thiểu 8 ký tự)
          </label>
          <PasswordInput
            id={`${idPrefix}-new`}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-confirm`}
            className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Nhập lại mật khẩu mới
          </label>
          <PasswordInput
            id={`${idPrefix}-confirm`}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button variant="secondary" disabled={submitting} onClick={resetAndClose}>
            Hủy
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? 'Đang cập nhật...' : 'Lưu mật khẩu mới'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
