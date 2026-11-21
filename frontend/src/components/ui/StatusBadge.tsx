import type { ReactNode } from 'react';

type BadgeTone = 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate' | 'sky';

const TONE_MAP: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone = 'slate', children, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_MAP[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function paymentStatusTone(status: string): BadgeTone {
  if (status === 'Thành công') return 'emerald';
  if (status === 'Hoàn tiền') return 'amber';
  return 'rose';
}
