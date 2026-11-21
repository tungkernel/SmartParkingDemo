import { AlertTriangle, Building2, CarFront, CreditCard } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ParkingLot } from '../../types';

interface GateStatsStripProps {
  selectedLot: ParkingLot | undefined;
  activeCount: number;
  monthlyCount: number;
  overdueCount: number;
  availableCardsCount: number;
  onFilterOverdue: () => void;
}

export function GateStatsStrip({
  selectedLot,
  activeCount,
  monthlyCount,
  overdueCount,
  availableCardsCount,
  onFilterOverdue,
}: GateStatsStripProps) {
  const totalSlots = selectedLot?.tong_cho ?? 0;
  const freeSlots = selectedLot?.cho_trong ?? 0;
  const occupiedSlots = selectedLot?.dang_do ?? 0;
  const occPct = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;
  const dailyCount = Math.max(0, activeCount - monthlyCount);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
      {/* Selected Lot Capacity */}
      <div className="card-surface rounded-2xl px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span className="truncate">{selectedLot?.tenbaido ?? 'Công suất bãi'}</span>
          <Building2 className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="text-lg font-extrabold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
            {freeSlots}{' '}
            <span className="text-xs font-medium text-slate-400">/ {totalSlots} trống</span>
          </div>
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 font-mono-plate text-[10px] font-bold',
              occPct >= 85
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                : occPct >= 60
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
            )}
          >
            {occPct}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              occPct >= 85 ? 'bg-rose-500' : occPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500',
            )}
            style={{ width: `${occPct}%` }}
          />
        </div>
      </div>

      {/* Active Turns Split */}
      <div className="card-surface rounded-2xl px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Xe đang gửi</span>
          <CarFront className="h-3.5 w-3.5 text-sky-500 shrink-0" />
        </div>
        <div className="mt-1 text-lg font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
          {activeCount} <span className="text-xs font-medium text-slate-400">xe</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            Ngày: <strong className="text-slate-700 dark:text-slate-200">{dailyCount}</strong>
          </span>
          <span>·</span>
          <span>
            Tháng: <strong className="text-violet-600 dark:text-violet-400">{monthlyCount}</strong>
          </span>
        </div>
      </div>

      {/* Available RFID Cards */}
      <div className="card-surface rounded-2xl px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Thẻ RFID sẵn sàng</span>
          <CreditCard className="h-3.5 w-3.5 text-violet-500 shrink-0" />
        </div>
        <div className="mt-1 text-lg font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
          {availableCardsCount} <span className="text-xs font-medium text-slate-400">thẻ</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {availableCardsCount === 0 ? (
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              Cần bổ sung thẻ trống
            </span>
          ) : (
            'Sẵn sàng phát tại cổng'
          )}
        </div>
      </div>

      {/* Overdue > 24h Alert */}
      <button
        type="button"
        disabled={overdueCount === 0}
        onClick={onFilterOverdue}
        className={cn(
          'card-surface rounded-2xl px-3.5 py-2.5 text-left transition-all',
          overdueCount > 0
            ? 'border-rose-300/90 dark:border-rose-800/80 bg-rose-50/40 dark:bg-rose-950/20 hover:border-rose-400'
            : 'disabled:cursor-default',
        )}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>Gửi quá 24 giờ</span>
          <AlertTriangle
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              overdueCount > 0 ? 'text-rose-500' : 'text-slate-400',
            )}
          />
        </div>
        <div
          className={cn(
            'mt-1 text-lg font-extrabold tracking-tight tabular-nums',
            overdueCount > 0
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-slate-900 dark:text-slate-100',
          )}
        >
          {overdueCount} <span className="text-xs font-medium text-slate-400">lượt</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {overdueCount > 0 ? 'Nhấn để lọc các xe quá hạn' : 'Không có lượt bất thường'}
        </div>
      </button>
    </div>
  );
}
