import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-xs ring-1 ring-brand-600/20',
  secondary:
    'border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-surface-subtle dark:hover:bg-slate-800',
  subtle: 'border bg-brand-soft hover:brightness-95 dark:hover:brightness-110',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs ring-1 ring-rose-600/20',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs ring-1 ring-emerald-600/20',
};

const SIZE_CLS: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-[11px] rounded-lg gap-1',
  sm: 'h-8 px-3 text-xs rounded-xl gap-1.5',
  md: 'h-9 px-4 text-xs sm:text-[13px] rounded-xl gap-2',
  lg: 'h-11 px-5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap shrink-0 font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
        VARIANT_CLS[variant],
        SIZE_CLS[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  );
}
