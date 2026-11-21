import { ArrowRightLeft, LogOut, Printer, Search, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';
import { formatDateTime } from '../../lib/api';
import type { ActiveTurn } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

interface ActiveTurnsTableProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (val: string) => void;
  turns: ActiveTurn[];
  totalCount: number;
  loading: boolean;
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
  turns,
  totalCount,
  loading,
  canManageTurns,
  busyTurnId,
  onOpenCheckout,
  onOpenMoveSlot,
  onRequestCancel,
  onPrintTicket,
}: ActiveTurnsTableProps) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Xe đang gửi trong bãi ({totalCount})
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Nhấn F3 hoặc / để tìm nhanh — nhấn Enter khi còn 1 xe để mở check-out
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            aria-label="Tìm xe đang gửi theo biển số hoặc mã thẻ"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && turns.length === 1 && turns[0]) {
                e.preventDefault();
                onOpenCheckout(turns[0]);
              }
            }}
            placeholder="Tìm biển số, mã thẻ..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">Đang tải danh sách xe...</div>
        ) : turns.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            Không có xe nào khớp bộ lọc.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Biển số & Loại xe</th>
                <th className="px-4 py-3">Thẻ / Vị trí</th>
                <th className="px-4 py-3">Giờ vào</th>
                <th className="px-4 py-3">Loại vé</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {turns.map((turn) => {
                const isMonthly =
                  turn.is_monthly_pass !== undefined
                    ? Boolean(turn.is_monthly_pass)
                    : turn.loaive === 'tháng';
                const isBusy = busyTurnId === turn.id_luotdo;
                return (
                  <tr
                    key={turn.id_luotdo}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono-plate text-sm font-bold text-slate-900 dark:text-slate-100">
                        {turn.bienso}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        {turn.loaiphuongtien} · {turn.chu_xe}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono-plate font-semibold text-indigo-700 dark:text-indigo-300">
                        #{turn.mathe}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {turn.tenbaido} · {turn.khuvuc}-{turn.vitri}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatDateTime(turn.giovao)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={isMonthly ? 'indigo' : 'amber'}>
                        {isMonthly ? 'Vé tháng' : 'Vé ngày'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onOpenCheckout(turn)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          Check-out
                        </button>
                        <button
                          type="button"
                          aria-label={`In phiếu gửi xe ${turn.bienso}`}
                          onClick={() => onPrintTicket(turn)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {canManageTurns && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              aria-label={`Chuyển vị trí xe ${turn.bienso}`}
                              onClick={() => onOpenMoveSlot(turn)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              aria-label={`Hủy lượt gửi xe ${turn.bienso}`}
                              onClick={() => onRequestCancel(turn)}
                              className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 disabled:opacity-50"
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
        )}
      </div>
    </section>
  );
}
