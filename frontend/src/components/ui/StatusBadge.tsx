import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone =
  'emerald' | 'amber' | 'rose' | 'indigo' | 'violet' | 'blue' | 'sky' | 'slate' | 'brand';

const TONE_MAP: Record<BadgeTone, string> = {
  emerald:
    'bg-emerald-50/90 text-emerald-800 border-emerald-300/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
  amber:
    'bg-amber-50/95 text-amber-800 border-amber-300/85 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/70',
  rose: 'bg-rose-50/90 text-rose-800 border-rose-300/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/70',
  indigo:
    'bg-violet-50/90 text-violet-800 border-violet-300/80 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/70',
  violet:
    'bg-violet-50/90 text-violet-800 border-violet-300/80 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/70',
  blue: 'bg-blue-50/90 text-blue-800 border-blue-300/80 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/70',
  sky: 'bg-sky-50/90 text-sky-800 border-sky-300/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/70',
  slate:
    'bg-slate-100 text-slate-700 border-slate-300/80 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/80',
  brand: 'bg-brand-soft',
};

const DOT_MAP: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  indigo: 'bg-violet-500',
  violet: 'bg-violet-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-500',
  slate: 'bg-slate-400',
  brand: 'bg-brand-500',
};

interface StatusBadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({
  tone = 'slate',
  dot = false,
  pulse = false,
  children,
  className = '',
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight whitespace-nowrap',
        TONE_MAP[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={cn(
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
                DOT_MAP[tone],
              )}
            />
          )}
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', DOT_MAP[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}

export function paymentStatusTone(status: string): BadgeTone {
  if (status === 'Thành công') return 'emerald';
  if (status === 'Hoàn tiền') return 'amber';
  return 'rose';
}
