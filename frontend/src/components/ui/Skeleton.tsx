import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-xl bg-slate-200/80 dark:bg-slate-800/80', className)}
    />
  );
}

export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  const gridCols =
    count === 5
      ? 'grid-cols-2 lg:grid-cols-5'
      : count === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={cn('grid gap-4', gridCols)}>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="card-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3">
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      <div className="space-y-2.5 pt-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid gap-3 py-2 border-t border-slate-100 dark:border-slate-800/80"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} className={c === 0 ? 'h-5 w-28' : 'h-4 w-full max-w-[140px]'} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <KpiGridSkeleton count={4} />
      <div className="card-surface rounded-2xl p-5">
        <Skeleton className="h-5 w-48 mb-4" />
        <TableSkeleton rows={5} cols={5} />
      </div>
    </div>
  );
}
