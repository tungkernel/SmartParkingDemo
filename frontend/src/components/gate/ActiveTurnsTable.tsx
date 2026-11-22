import {
  AlertTriangle,
  ArrowRightLeft,
  CarFront,
  Clock,
  LogOut,
  Printer,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { formatDateTime } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatElapsedDuration, getHoursParked } from '../../lib/time';
import type { ActiveTurn } from '../../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LicensePlate } from '../ui/LicensePlate';
import { SearchInput } from '../ui/SearchInput';
import { TableSkeleton } from '../ui/Skeleton';
import { StatusBadge } from '../ui/StatusBadge';
import { VehicleIcon } from '../ui/VehicleIcon';

export type TurnQuickFilter = 'all' | 'daily' | 'monthly' | 'overdue';

interface ActiveTurnsTableProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (val: string) => void;
  quickFilter: TurnQuickFilter;
  onQuickFilterChange: (filter: TurnQuickFilter) => void;
  counts: { all: number; daily: number; monthly: number; overdue: number };
  turns: ActiveTurn[];
  totalCount: number;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  canManageTurns: boolean;
  busyTurnId: number | null;
  onOpenCheckout: (turn: ActiveTurn) => void;
  onOpenMoveSlot: (turn: ActiveTurn) => void;
  onRequestCancel: (turn: ActiveTurn) => void;
  onPrintTicket: (turn: ActiveTurn) => void;
}

export function ActiveTurnsTable({
  searchInputRef,
  search,
  onSearchChange,
  quickFilter,
  onQuickFilterChange,
  counts,
  turns,
  totalCount,
  loading,
  error,
  onRetry,
  canManageTurns,
  busyTurnId,
  onOpenCheckout,
  onOpenMoveSlot,
  onRequestCancel,
  onPrintTicket,
}: ActiveTurnsTableProps) {
  // Live duration ticker updated every 60 seconds
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const filterChips: Array<{
    key: TurnQuickFilter;
    label: string;
    count: number;
    danger?: boolean;
  }> = [
    { key: 'all', label: 'Tất cả', count: counts.all },
    { key: 'daily', label: 'Vé ngày', count: counts.daily },
    { key: 'monthly', label: 'Vé tháng', count: counts.monthly },
    ...(counts.overdue > 0
      ? [{ key: 'overdue' as const, label: 'Quá 24h', count: counts.overdue, danger: true }]
      : []),
  ];

  return (
    <section className="card-surface rounded-2xl overflow-hidden flex-1 flex flex-col min-h-[340px] max-h-[66vh] xl:max-h-none">
      <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Xe đang gửi trong bãi ({totalCount})
          </h2>
          <SearchInput
            inputRef={searchInputRef}
            containerClassName="w-full sm:w-72"
            aria-label="Tìm xe đang gửi theo biển số hoặc mã thẻ"
            value={search}
            onChange={onSearchChange}
            shortcutHint="F3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && turns.length === 1 && turns[0]) {
                e.preventDefault();
                onOpenCheckout(turns[0]);
              }
            }}
            placeholder="Tìm biển số, mã thẻ, chủ xe..."
          />
        </div>

        {/* Quick filter pills + shown count */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterChips.map((chip) => {
              const active = quickFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => onQuickFilterChange(chip.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition-colors',
                    active
                      ? chip.danger
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                        : 'bg-brand-soft'
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
                  )}
                >
                  {chip.danger && <AlertTriangle className="h-3 w-3 text-rose-500" />}
                  <span>{chip.label}</span>
                  <span className="font-mono-plate text-[10px] opacity-80">{chip.count}</span>
                </button>
              );
            })}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Hiển thị <strong className="text-slate-700 dark:text-slate-200">{turns.length}</strong>{' '}
            / {totalCount} xe
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={onRetry} />
          </div>
        ) : turns.length === 0 ? (
          <EmptyState
            icon={<CarFront className="h-5 w-5" />}
            title={
              search || quickFilter !== 'all'
                ? 'Không có xe nào khớp bộ lọc'
                : 'Bãi xe hiện đang trống'
            }
            description={
              search || quickFilter !== 'all'
                ? 'Thử xóa từ khóa tìm kiếm hoặc chuyển sang chế độ xem Tất cả.'
                : 'Nhập biển số ở bảng bên trái để tiếp nhận lượt xe vào đầu tiên.'
            }
            action={
              (search || quickFilter !== 'all') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onSearchChange('');
                    onQuickFilterChange('all');
                  }}
                >
                  Xóa bộ lọc
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block flex-1 min-h-0 scroll-pane">
              <table className="w-full text-left text-[13px]">
                <thead className="table-sticky-head text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số & Phương tiện</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Thẻ / Vị trí</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Giờ vào & Thời lượng</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Loại vé</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {turns.map((turn) => {
                    const isMonthly =
                      turn.is_monthly_pass !== undefined
                        ? Boolean(turn.is_monthly_pass)
                        : turn.loaive === 'tháng';
                    const isBusy = busyTurnId === turn.id_luotdo;
                    const hours = getHoursParked(turn.giovao, nowMs);
                    const elapsed = formatElapsedDuration(turn.giovao, nowMs);
                    const isOverdue = hours >= 24;
                    const isLong = hours >= 12 && hours < 24;

                    return (
                      <tr
                        key={turn.id_luotdo}
                        className={cn(
                          'transition-colors hover:bg-slate-50/90 dark:hover:bg-slate-800/40',
                          isOverdue && 'bg-rose-50/35 dark:bg-rose-950/15',
                        )}
                      >
                        <td className="px-3.5 py-2.5">
                          <LicensePlate plate={turn.bienso} size="sm" copyable />
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <VehicleIcon
                              vehicleType={turn.loaiphuongtien}
                              className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className="capitalize whitespace-nowrap">
                              {turn.loaiphuongtien}
                            </span>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">{turn.chu_xe}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <div className="font-mono-plate text-xs font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">
                            #{turn.mathe}
                          </div>
                          <div
                            className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[165px]"
                            title={`${turn.tenbaido} · ${turn.khuvuc}-${turn.vitri}`}
                          >
                            {turn.tenbaido} ·{' '}
                            <strong className="font-mono-plate text-slate-700 dark:text-slate-200">
                              {turn.khuvuc}-{turn.vitri}
                            </strong>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="text-xs text-slate-700 dark:text-slate-200 tabular-nums">
                            {formatDateTime(turn.giovao)}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono-plate text-[10px] font-bold',
                                isOverdue
                                  ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                                  : isLong
                                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
                              )}
                            >
                              <Clock className="h-2.5 w-2.5" />
                              {elapsed}
                            </span>
                            {isOverdue && (
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                Quá 24h
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <StatusBadge tone={isMonthly ? 'violet' : 'amber'} dot>
                            {isMonthly ? 'Vé tháng' : 'Vé ngày'}
                          </StatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="xs"
                              disabled={isBusy}
                              icon={<LogOut className="h-3.5 w-3.5" />}
                              onClick={() => onOpenCheckout(turn)}
                            >
                              Check-out
                            </Button>
                            <button
                              type="button"
                              aria-label={`In phiếu gửi xe ${turn.bienso}`}
                              title="In lại phiếu gửi xe"
                              onClick={() => onPrintTicket(turn)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            {canManageTurns && (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  aria-label={`Chuyển vị trí xe ${turn.bienso}`}
                                  title="Chuyển ô đỗ"
                                  onClick={() => onOpenMoveSlot(turn)}
                                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  aria-label={`Hủy lượt gửi xe ${turn.bienso}`}
                                  title="Hủy lượt nhập nhầm"
                                  onClick={() => onRequestCancel(turn)}
                                  className="rounded-lg border border-rose-200 dark:border-rose-900/80 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 disabled:opacity-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden flex-1 min-h-0 scroll-pane divide-y divide-slate-100 dark:divide-slate-800">
              {turns.map((turn) => {
                const isMonthly =
                  turn.is_monthly_pass !== undefined
                    ? Boolean(turn.is_monthly_pass)
                    : turn.loaive === 'tháng';
                const isBusy = busyTurnId === turn.id_luotdo;
                const hours = getHoursParked(turn.giovao, nowMs);
                const elapsed = formatElapsedDuration(turn.giovao, nowMs);
                const isOverdue = hours >= 24;

                return (
                  <div
                    key={turn.id_luotdo}
                    className={cn(
                      'p-4 space-y-3',
                      isOverdue && 'bg-rose-50/40 dark:bg-rose-950/15',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <LicensePlate plate={turn.bienso} size="sm" />
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {turn.loaiphuongtien} · Thẻ{' '}
                          <span className="font-mono-plate font-bold text-brand-600 dark:text-brand-400">
                            #{turn.mathe}
                          </span>
                        </div>
                      </div>
                      <StatusBadge tone={isMonthly ? 'violet' : 'amber'} dot>
                        {isMonthly ? 'Vé tháng' : 'Vé ngày'}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {turn.tenbaido} ·{' '}
                        <strong className="font-mono-plate text-slate-700 dark:text-slate-200">
                          {turn.khuvuc}-{turn.vitri}
                        </strong>
                      </span>
                      <span
                        className={cn(
                          'font-mono-plate font-bold',
                          isOverdue
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-300',
                        )}
                      >
                        {elapsed}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={isBusy}
                        icon={<LogOut className="h-3.5 w-3.5" />}
                        onClick={() => onOpenCheckout(turn)}
                        className="flex-1"
                      >
                        Check-out
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-label={`In phiếu gửi xe ${turn.bienso}`}
                        onClick={() => onPrintTicket(turn)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      {canManageTurns && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isBusy}
                            aria-label={`Chuyển vị trí xe ${turn.bienso}`}
                            onClick={() => onOpenMoveSlot(turn)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isBusy}
                            aria-label={`Hủy lượt gửi xe ${turn.bienso}`}
                            onClick={() => onRequestCancel(turn)}
                            className="text-rose-600 border-rose-200 dark:border-rose-900"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
