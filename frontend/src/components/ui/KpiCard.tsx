import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type KpiTone = 'neutral' | 'brand' | 'emerald' | 'sky' | 'amber' | 'violet' | 'rose';

const ICON_BG: Record<KpiTone, string> = {
  neutral: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  brand: 'bg-brand-soft',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
  sky: 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
};

const VALUE_COLOR: Record<KpiTone, string> = {
  neutral: 'text-slate-900 dark:text-slate-100',
  brand: 'text-brand-600 dark:text-brand-400',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  sky: 'text-sky-700 dark:text-sky-300',
  amber: 'text-amber-700 dark:text-amber-300',
  violet: 'text-violet-700 dark:text-violet-300',
  rose: 'text-rose-700 dark:text-rose-300',
};

const BAR_COLOR: Record<KpiTone, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand-600',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
};

interface KpiCardProps {
  label: string;
  value: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  tone?: KpiTone;
  progressPct?: number;
  className?: string;
}

export function KpiCard({
  label,
  value,
  sublabel,
  icon,
  tone = 'neutral',
  progressPct,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'card-surface rounded-2xl p-3.5 transition-all duration-150 hover:border-slate-300 dark:hover:border-slate-700',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {icon && (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
              ICON_BG[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          'mt-1.5 text-xl font-extrabold tracking-tight tabular-nums',
          VALUE_COLOR[tone],
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {sublabel}
        </div>
      )}
      {progressPct !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={cn('h-full rounded-full transition-all duration-500', BAR_COLOR[tone])}
            style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
