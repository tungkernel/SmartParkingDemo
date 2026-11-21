import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: PaginationBarProps) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
      <span className="tabular-nums">
        Hiển thị{' '}
        <strong className="font-semibold text-slate-900 dark:text-slate-100">
          {start}–{end}
        </strong>{' '}
        trong{' '}
        <strong className="font-semibold text-slate-900 dark:text-slate-100">
          {total.toLocaleString('vi-VN')}
        </strong>{' '}
        bản ghi
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Trước
        </button>
        <span className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-mono-plate text-xs font-semibold text-slate-800 dark:text-slate-200">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          Sau
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
