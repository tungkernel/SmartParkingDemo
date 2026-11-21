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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
      <span>
        Hiển thị <strong className="text-slate-900 dark:text-slate-100">{start}–{end}</strong> trong{' '}
        <strong className="text-slate-900 dark:text-slate-100">{total.toLocaleString('vi-VN')}</strong> bản ghi
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Trước
        </button>
        <span className="px-2 font-semibold text-slate-800 dark:text-slate-200">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          Sau
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
