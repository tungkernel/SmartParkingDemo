import { cn } from '../../lib/cn';

interface BrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLS = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

export function BrandMark({ size = 'md', className }: BrandMarkProps) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-sm ring-1 ring-white/20',
        SIZE_CLS[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        className={size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-7 w-7' : 'h-6 w-6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.5 23V9h5.2a4.2 4.2 0 0 1 0 8.4h-5.2" />
        <path d="M21.2 9.4a6.2 6.2 0 0 1 2.1 4.6" opacity="0.9" />
        <path d="M24.4 7.2a9.6 9.6 0 0 1 2.6 6.8" opacity="0.55" />
      </svg>
      {/* Signature PTIT crimson telemetry dot */}
      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
    </div>
  );
}
