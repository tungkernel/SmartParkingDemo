import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Không thể tải dữ liệu',
  message = 'Kiểm tra kết nối mạng hoặc thử tải lại phân hệ này.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</div>
      <p className="mt-1 max-w-md text-xs text-slate-600 dark:text-slate-400">{message}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={onRetry}
          className="mt-4"
        >
          Thử lại
        </Button>
      )}
    </div>
  );
}
