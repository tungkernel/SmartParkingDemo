import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      titleIcon={
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            danger
              ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400'
              : 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
        </span>
      }
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
            {loading ? 'Đang xử lý...' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="p-5 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
        {message}
      </div>
    </Modal>
  );
}
