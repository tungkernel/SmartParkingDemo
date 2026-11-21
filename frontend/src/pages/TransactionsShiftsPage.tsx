import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Download,
  Printer,
  ReceiptText,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LicensePlate } from '../components/ui/LicensePlate';
import { PaginationBar } from '../components/ui/PaginationBar';
import { SearchInput } from '../components/ui/SearchInput';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import { StatusBadge, paymentStatusTone } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  downloadAuthenticatedFile,
  formatDateTime,
  formatVnd,
  getErrorMessage,
} from '../lib/api';
import { cn } from '../lib/cn';
import { exportRowsToCsv } from '../lib/csv';
import { getVnDateIso } from '../lib/time';
import type {
  AuthUser,
  PaginatedResponse,
  PaymentStatus,
  ShiftCloseResult,
  ShiftRecord,
  TransactionRecord,
} from '../types';

interface TransactionsShiftsPageProps {
  user: AuthUser;
  onPrint: (doc: PrintableDocument) => void;
}

export function TransactionsShiftsPage({ user, onPrint }: TransactionsShiftsPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const idPrefix = useId();

  const tab: 'transactions' | 'shifts' =
    searchParams.get('tab') === 'shifts' ? 'shifts' : 'transactions';

  const switchTab = (next: 'transactions' | 'shifts') => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', next);
    setSearchParams(p, { replace: true });
  };

  // Transaction filter state
  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ keyword: '', start: '', end: '' });
  const [txPage, setTxPage] = useState(1);
  const [shiftPage, setShiftPage] = useState(1);

  // Shift form state — track per-shift user edit so WebSocket refetches NEVER clobber cashier input
  const [openingCash, setOpeningCash] = useState(500000);
  const [openNote, setOpenNote] = useState('');
  const [actualCashDraft, setActualCashDraft] = useState<{ shiftId: number; value: number } | null>(
    null,
  );
  const [closeNote, setCloseNote] = useState('');
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const txParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(txPage), page_size: '30' });
    if (appliedFilters.keyword) p.set('keyword', appliedFilters.keyword);
    if (appliedFilters.start) p.set('start_date', appliedFilters.start);
    if (appliedFilters.end) p.set('end_date', appliedFilters.end);
    return p.toString();
  }, [txPage, appliedFilters]);

  const txQuery = useQuery<PaginatedResponse<TransactionRecord>>({
    queryKey: ['transactions', txParams],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<TransactionRecord>>(`/api/v1/transactions?${txParams}`, {
        signal,
      }),
    enabled: tab === 'transactions',
  });

  const activeShiftQuery = useQuery<{ shift: ShiftRecord | null }>({
    queryKey: ['shifts', 'active'],
    queryFn: ({ signal }) =>
      apiRequest<{ shift: ShiftRecord | null }>('/api/v1/shifts/active', { signal }),
    enabled: tab === 'shifts',
  });

  const shiftsQuery = useQuery<PaginatedResponse<ShiftRecord>>({
    queryKey: ['shifts', 'list', shiftPage],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<ShiftRecord>>(`/api/v1/shifts?page=${shiftPage}&page_size=20`, {
        signal,
      }),
    enabled: tab === 'shifts',
  });

  const activeShift = activeShiftQuery.data?.shift ?? null;
  const effectiveActualCash =
    activeShift && actualCashDraft?.shiftId === activeShift.id
      ? actualCashDraft.value
      : (activeShift?.live_expected_cash ?? 0);

  const liveCashDiff = activeShift
    ? effectiveActualCash - (activeShift.live_expected_cash ?? 0)
    : 0;

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PaymentStatus }) =>
      apiRequest(`/api/v1/transactions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật trạng thái giao dịch.');
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const openShiftMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ id: number }>('/api/v1/shifts/open', {
        method: 'POST',
        body: JSON.stringify({ opening_cash: openingCash, note: openNote }),
      }),
    onSuccess: (res) => {
      notify('ok', `Đã mở ca trực #${res.id}.`);
      setOpenNote('');
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const closeShiftMutation = useMutation({
    mutationFn: (shiftId: number) =>
      apiRequest<ShiftCloseResult>(`/api/v1/shifts/${shiftId}/close`, {
        method: 'POST',
        body: JSON.stringify({ actual_cash: effectiveActualCash, note: closeNote }),
      }),
    onSuccess: (res) => {
      notify('ok', `Đã chốt ca #${res.shift_id}. Chênh lệch tiền mặt: ${formatVnd(res.diff)}.`);
      setCloseNote('');
      setActualCashDraft(null);
      setConfirmCloseOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const applyDatePreset = (preset: 'today' | '7d' | '30d' | 'month') => {
    const today = getVnDateIso(0);
    let start = today;
    if (preset === '7d') start = getVnDateIso(-6);
    else if (preset === '30d') start = getVnDateIso(-29);
    else if (preset === 'month') start = `${today.slice(0, 8)}01`;

    setDraftStart(start);
    setDraftEnd(today);
    setAppliedFilters({ keyword: draftKeyword.trim(), start, end: today });
    setTxPage(1);
  };

  const resetFilters = () => {
    setDraftKeyword('');
    setDraftStart('');
    setDraftEnd('');
    setAppliedFilters({ keyword: '', start: '', end: '' });
    setTxPage(1);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      if (user.role === 'ADMIN' || user.role === 'ACCOUNTANT') {
        await downloadAuthenticatedFile(
          `/api/v1/transactions/export?${txParams}`,
          `giao_dich_${new Date().toISOString().slice(0, 10)}.csv`,
        );
      } else {
        const items = txQuery.data?.items ?? [];
        exportRowsToCsv(
          [
            'Mã GD',
            'Thời gian',
            'Biển số',
            'Loại xe',
            'Loại GD',
            'Thanh toán',
            'Số tiền',
            'Trạng thái',
            'Thu ngân',
          ],
          items.map((t) => [
            t.ma_gd,
            formatDateTime(t.giothanhtoan),
            t.bienso ?? '',
            t.loaiphuongtien ?? '',
            t.hinhthuc,
            t.loaithanhtoan,
            t.chiphi,
            t.trangthai,
            t.nhanvien,
          ]),
          `giao_dich_${new Date().toISOString().slice(0, 10)}.csv`,
        );
      }
      notify('ok', 'Đã xuất báo cáo giao dịch CSV.');
    } catch (err: unknown) {
      notify('err', getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const canEditStatus = user.role === 'ADMIN' || user.role === 'ACCOUNTANT';
  const txItems = useMemo(() => txQuery.data?.items ?? [], [txQuery.data?.items]);
  const hasFilters = Boolean(appliedFilters.keyword || appliedFilters.start || appliedFilters.end);

  const pageSummary = useMemo(() => {
    const successTotal = txItems
      .filter((t) => t.trangthai === 'Thành công')
      .reduce((acc, t) => acc + t.chiphi, 0);
    return {
      successTotal,
      count: txQuery.data?.total ?? 0,
    };
  }, [txItems, txQuery.data?.total]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="Phân mục giao dịch và ca trực"
        className="shrink-0 self-start card-surface inline-flex rounded-xl p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'transactions'}
          onClick={() => switchTab('transactions')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors',
            tab === 'transactions'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
          )}
        >
          <ReceiptText className="h-3.5 w-3.5" />
          Lịch sử Giao dịch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shifts'}
          onClick={() => switchTab('shifts')}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors',
            tab === 'shifts'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
          )}
        >
          <Clock className="h-3.5 w-3.5" />
          Ca trực & Đối soát quỹ
        </button>
      </div>

      {tab === 'transactions' ? (
        <section className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[340px] max-h-[72vh] lg:max-h-none flex flex-col">
          <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 space-y-2.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAppliedFilters({
                  keyword: draftKeyword.trim(),
                  start: draftStart,
                  end: draftEnd,
                });
                setTxPage(1);
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[220px]">
                <label
                  htmlFor={`${idPrefix}-kw`}
                  className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
                >
                  Từ khóa (biển số, thẻ, mã GD, thu ngân)
                </label>
                <SearchInput
                  id={`${idPrefix}-kw`}
                  value={draftKeyword}
                  onChange={setDraftKeyword}
                  placeholder="Nhập từ khóa rồi nhấn Enter..."
                />
              </div>
              <div>
                <label
                  htmlFor={`${idPrefix}-from`}
                  className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
                >
                  Từ ngày
                </label>
                <input
                  id={`${idPrefix}-from`}
                  type="date"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor={`${idPrefix}-to`}
                  className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
                >
                  Đến ngày
                </label>
                <input
                  id={`${idPrefix}-to`}
                  type="date"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs"
                />
              </div>
              <Button type="submit" size="md">
                Lọc
              </Button>
              <Button
                variant="secondary"
                size="md"
                loading={exporting}
                icon={<Download className="h-3.5 w-3.5" />}
                onClick={() => void handleExportCsv()}
              >
                {exporting ? 'Đang xuất...' : 'Xuất CSV'}
              </Button>
            </form>

            {/* Quick Date Presets & Summary */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-medium text-slate-400 mr-1">Chọn nhanh:</span>
                {(
                  [
                    ['today', 'Hôm nay'],
                    ['7d', '7 ngày'],
                    ['30d', '30 ngày'],
                    ['month', 'Tháng này'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyDatePreset(key)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-surface-input dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                  >
                    {label}
                  </button>
                ))}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Xóa lọc
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Tổng khớp:{' '}
                <strong className="text-slate-800 dark:text-slate-100">{pageSummary.count}</strong>{' '}
                GD · Thu thành công trang này:{' '}
                <strong className="font-mono-plate text-emerald-600 dark:text-emerald-400">
                  {formatVnd(pageSummary.successTotal)}
                </strong>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 scroll-pane">
            {txQuery.isLoading ? (
              <TableSkeleton rows={7} cols={6} />
            ) : txQuery.isError ? (
              <div className="p-5">
                <ErrorState
                  message={getErrorMessage(txQuery.error)}
                  onRetry={() => void txQuery.refetch()}
                />
              </div>
            ) : txItems.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="h-5 w-5" />}
                title="Không có giao dịch nào khớp điều kiện lọc"
                description="Hãy mở rộng khoảng ngày hoặc xóa từ khóa tìm kiếm."
                action={
                  hasFilters && (
                    <Button variant="secondary" size="sm" onClick={resetFilters}>
                      Đặt lại bộ lọc
                    </Button>
                  )
                }
              />
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Mã GD / Thời gian</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số & Vị trí</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Loại GD / Thu ngân</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Phương thức TT</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Số tiền</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap text-right">In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {txItems.map((t) => (
                    <tr
                      key={t.ma_gd}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <div className="font-mono-plate font-bold text-slate-900 dark:text-slate-100">
                          #{t.ma_gd}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {formatDateTime(t.giothanhtoan)}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <LicensePlate plate={t.bienso} size="xs" />
                        <div className="text-[11px] text-slate-500 capitalize mt-1">
                          {t.loaiphuongtien || '—'} · {t.vitri || '—'}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {t.hinhthuc}
                        </div>
                        <div className="text-[11px] text-slate-500">{t.nhanvien}</div>
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        <StatusBadge tone={t.loaithanhtoan === 'Chuyển khoản' ? 'sky' : 'slate'}>
                          {t.loaithanhtoan}
                        </StatusBadge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono-plate font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatVnd(t.chiphi)}
                      </td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {canEditStatus ? (
                          <select
                            aria-label={`Trạng thái giao dịch #${t.ma_gd}`}
                            disabled={updateStatusMutation.isPending}
                            value={t.trangthai}
                            onChange={(e) =>
                              updateStatusMutation.mutate({
                                id: t.ma_gd,
                                status: e.target.value as PaymentStatus,
                              })
                            }
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold"
                          >
                            <option value="Thành công">Thành công</option>
                            <option value="Hoàn tiền">Hoàn tiền</option>
                            <option value="Thất bại">Thất bại</option>
                          </select>
                        ) : (
                          <StatusBadge tone={paymentStatusTone(t.trangthai)} dot>
                            {t.trangthai}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`In biên lai giao dịch #${t.ma_gd}`}
                          onClick={() =>
                            onPrint({
                              kind: 'receipt',
                              id: t.ma_gd,
                              plate: t.bienso || '—',
                              vehicleType: t.loaiphuongtien || undefined,
                              cardCode: t.mathe || undefined,
                              slotLabel: t.vitri || undefined,
                              ticketType: t.hinhthuc,
                              checkinTime: t.giovao || undefined,
                              checkoutTime: t.giothanhtoan,
                              paymentMethod: t.loaithanhtoan,
                              amount: t.chiphi,
                              operatorName: t.nhanvien,
                            })
                          }
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {txQuery.data && (
            <PaginationBar
              page={txQuery.data.page}
              totalPages={txQuery.data.total_pages}
              total={txQuery.data.total}
              pageSize={txQuery.data.page_size}
              onPageChange={setTxPage}
            />
          )}
        </section>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3.5">
          {/* Active Shift Card */}
          <section className="shrink-0 card-surface rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft">
                  <Wallet className="h-4 w-4" />
                </span>
                Ca trực hiện tại của {user.full_name}
              </h2>
              {activeShift && (
                <StatusBadge tone="emerald" dot pulse>
                  Ca #{activeShift.id} · Mở từ {formatDateTime(activeShift.started_at)}
                </StatusBadge>
              )}
            </div>

            {activeShiftQuery.isLoading ? (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : activeShiftQuery.isError ? (
              <ErrorState
                message={getErrorMessage(activeShiftQuery.error)}
                onRetry={() => void activeShiftQuery.refetch()}
              />
            ) : activeShift ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
                    <div className="text-slate-500 dark:text-slate-400">Tiền đầu ca</div>
                    <div className="mt-1 font-mono-plate text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {formatVnd(activeShift.opening_cash)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/70 dark:border-emerald-900/60 p-2.5">
                    <div className="text-emerald-700 dark:text-emerald-300">Thu tiền mặt</div>
                    <div className="mt-1 font-mono-plate text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                      {formatVnd(activeShift.live_cash_total)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-sky-50/70 dark:bg-sky-950/35 border border-sky-200/70 dark:border-sky-900/60 p-2.5">
                    <div className="text-sky-700 dark:text-sky-300">Thu chuyển khoản</div>
                    <div className="mt-1 font-mono-plate text-base font-extrabold text-sky-700 dark:text-sky-300">
                      {formatVnd(activeShift.live_transfer_total)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/35 border border-amber-200/70 dark:border-amber-900/60 p-2.5">
                    <div className="text-amber-700 dark:text-amber-300">Đã hoàn tiền</div>
                    <div className="mt-1 font-mono-plate text-base font-extrabold text-amber-700 dark:text-amber-300">
                      {formatVnd(activeShift.live_refund_total)}
                    </div>
                  </div>
                  <div className="col-span-2 lg:col-span-1 rounded-xl bg-brand-soft border p-2.5">
                    <div className="font-semibold">Tiền mặt kỳ vọng</div>
                    <div className="mt-1 font-mono-plate text-base font-extrabold">
                      {formatVnd(activeShift.live_expected_cash)}
                    </div>
                  </div>
                </div>

                {/* Live Cash Reconciliation Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setConfirmCloseOpen(true);
                  }}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end border-t border-slate-100 dark:border-slate-800 pt-4 text-xs"
                >
                  <div className="md:col-span-4">
                    <label
                      htmlFor={`${idPrefix}-actual`}
                      className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Tiền mặt thực đếm bàn giao (VNĐ)
                    </label>
                    <input
                      id={`${idPrefix}-actual`}
                      type="number"
                      min={0}
                      required
                      value={effectiveActualCash}
                      onChange={(e) =>
                        setActualCashDraft({
                          shiftId: activeShift.id,
                          value: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label
                      htmlFor={`${idPrefix}-cnote`}
                      className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Ghi chú chốt ca
                    </label>
                    <input
                      id={`${idPrefix}-cnote`}
                      type="text"
                      maxLength={255}
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="VD: Đủ quỹ, đã bàn giao ca tối"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Button
                      type="submit"
                      variant="danger"
                      size="lg"
                      loading={closeShiftMutation.isPending}
                      className="w-full"
                    >
                      Chốt ca #{activeShift.id}
                    </Button>
                  </div>
                </form>

                {/* Live Cash Variance Banner */}
                <div
                  className={cn(
                    'flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs font-semibold',
                    liveCashDiff === 0
                      ? 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : liveCashDiff < 0
                        ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                        : 'border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Chênh lệch dự kiến (Thực đếm − Kỳ vọng):
                  </span>
                  <span className="font-mono-plate text-sm font-extrabold">
                    {liveCashDiff === 0
                      ? 'Khớp quỹ (0 đ)'
                      : liveCashDiff > 0
                        ? `Thừa +${formatVnd(liveCashDiff)}`
                        : `Thiếu -${formatVnd(-liveCashDiff)}`}
                  </span>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openShiftMutation.mutate();
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs"
              >
                <div className="md:col-span-4">
                  <label
                    htmlFor={`${idPrefix}-open`}
                    className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Quỹ tiền lẻ đầu ca (VNĐ)
                  </label>
                  <input
                    id={`${idPrefix}-open`}
                    type="number"
                    min={0}
                    step={50000}
                    value={openingCash}
                    onChange={(e) => setOpeningCash(Math.max(0, Number(e.target.value)))}
                    className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold focus:border-brand-500 outline-none"
                  />
                </div>
                <div className="md:col-span-5">
                  <label
                    htmlFor={`${idPrefix}-onote`}
                    className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Ghi chú nhận ca
                  </label>
                  <input
                    id={`${idPrefix}-onote`}
                    type="text"
                    maxLength={255}
                    value={openNote}
                    onChange={(e) => setOpenNote(e.target.value)}
                    placeholder="Ca sáng 07:00 - 15:00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm focus:border-brand-500 outline-none"
                  />
                </div>
                <div className="md:col-span-3">
                  <Button
                    type="submit"
                    variant="success"
                    size="lg"
                    loading={openShiftMutation.isPending}
                    className="w-full"
                  >
                    {openShiftMutation.isPending ? 'Đang mở ca...' : 'Mở ca làm việc mới'}
                  </Button>
                </div>
              </form>
            )}
          </section>

          {/* Shift History */}
          <section className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[240px] max-h-[60vh] lg:max-h-none flex flex-col">
            <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Lịch sử ca trực ({shiftsQuery.data?.total ?? 0})
              </h3>
            </div>
            <div className="flex-1 min-h-0 scroll-pane">
              {shiftsQuery.isLoading ? (
                <TableSkeleton rows={5} cols={7} />
              ) : shiftsQuery.isError ? (
                <div className="p-5">
                  <ErrorState
                    message={getErrorMessage(shiftsQuery.error)}
                    onRetry={() => void shiftsQuery.refetch()}
                  />
                </div>
              ) : (shiftsQuery.data?.items ?? []).length === 0 ? (
                <EmptyState
                  icon={<Clock className="h-5 w-5" />}
                  title="Chưa có lịch sử ca trực"
                  description="Mở ca làm việc đầu tiên ở phía trên để bắt đầu đối soát quỹ thu ngân."
                />
              ) : (
                <table className="w-full text-left text-[13px]">
                  <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Ca / Nhân viên</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Thời gian</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Đầu ca</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Kỳ vọng</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thực bàn giao</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Chuyển khoản</th>
                      <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {(shiftsQuery.data?.items ?? []).map((s) => {
                      const diff = s.actual_cash !== null ? s.actual_cash - s.expected_cash : null;
                      return (
                        <tr
                          key={s.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-3.5 py-2.5">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              <span className="font-mono-plate">#{s.id}</span> · {s.ten_nhanvien}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {s.tenbaido || 'Toàn hệ thống'}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap tabular-nums">
                            <div>{formatDateTime(s.started_at)}</div>
                            <div className="text-[11px] text-slate-500">
                              {s.ended_at ? `→ ${formatDateTime(s.ended_at)}` : 'Đang trực'}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono-plate whitespace-nowrap">
                            {formatVnd(s.opening_cash)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono-plate font-semibold whitespace-nowrap">
                            {formatVnd(s.expected_cash)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono-plate font-bold whitespace-nowrap">
                            <div>{s.actual_cash !== null ? formatVnd(s.actual_cash) : '—'}</div>
                            {diff !== null && diff !== 0 && (
                              <div
                                className={cn(
                                  'text-[10px] font-bold',
                                  diff < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-amber-600 dark:text-amber-400',
                                )}
                              >
                                {diff > 0 ? `+${formatVnd(diff)}` : `-${formatVnd(-diff)}`}
                              </div>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono-plate text-sky-600 dark:text-sky-400 font-semibold whitespace-nowrap">
                            {formatVnd(s.transfer_total)}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <StatusBadge tone={s.status === 'OPEN' ? 'emerald' : 'slate'} dot>
                              {s.status === 'OPEN' ? 'Đang mở' : 'Đã chốt'}
                            </StatusBadge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {shiftsQuery.data && (
              <PaginationBar
                page={shiftsQuery.data.page}
                totalPages={shiftsQuery.data.total_pages}
                total={shiftsQuery.data.total}
                pageSize={shiftsQuery.data.page_size}
                onPageChange={setShiftPage}
              />
            )}
          </section>

          <ConfirmDialog
            open={confirmCloseOpen && Boolean(activeShift)}
            title={activeShift ? `Xác nhận chốt ca trực #${activeShift.id}` : 'Chốt ca trực'}
            message={
              activeShift
                ? `Xác nhận bàn giao ${formatVnd(effectiveActualCash)} (kỳ vọng ${formatVnd(activeShift.live_expected_cash)}, chênh lệch ${liveCashDiff >= 0 ? '+' : '-'}${formatVnd(Math.abs(liveCashDiff))})? Hành động này không thể hoàn tác.`
                : ''
            }
            confirmLabel="Xác nhận chốt ca"
            danger={liveCashDiff !== 0}
            loading={closeShiftMutation.isPending}
            onConfirm={() => activeShift && closeShiftMutation.mutate(activeShift.id)}
            onCancel={() => setConfirmCloseOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
