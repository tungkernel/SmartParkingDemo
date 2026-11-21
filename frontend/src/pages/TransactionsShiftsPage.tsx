import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Download, Printer, ReceiptText, Search, Wallet } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { StatusBadge, paymentStatusTone } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import {
  apiRequest,
  downloadAuthenticatedFile,
  formatDateTime,
  formatVnd,
  getErrorMessage,
} from '../lib/api';
import { exportRowsToCsv } from '../lib/csv';
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
  const idPrefix = useId();

  const [tab, setTab] = useState<'transactions' | 'shifts'>('transactions');

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
      apiRequest<PaginatedResponse<ShiftRecord>>(
        `/api/v1/shifts?page=${shiftPage}&page_size=20`,
        { signal },
      ),
    enabled: tab === 'shifts',
  });

  const activeShift = activeShiftQuery.data?.shift ?? null;
  const effectiveActualCash =
    activeShift && actualCashDraft?.shiftId === activeShift.id
      ? actualCashDraft.value
      : (activeShift?.live_expected_cash ?? 0);

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
      notify(
        'ok',
        `Đã chốt ca #${res.shift_id}. Chênh lệch tiền mặt: ${formatVnd(res.diff)}.`,
      );
      setCloseNote('');
      setActualCashDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

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
          ['Mã GD', 'Thời gian', 'Biển số', 'Loại xe', 'Loại GD', 'Thanh toán', 'Số tiền', 'Trạng thái', 'Thu ngân'],
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

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Phân mục giao dịch và ca trực"
        className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'transactions'}
          onClick={() => setTab('transactions')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            tab === 'transactions'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ReceiptText className="h-3.5 w-3.5" />
          Lịch sử Giao dịch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shifts'}
          onClick={() => setTab('shifts')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            tab === 'shifts'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Ca trực & Đối soát quỹ
        </button>
      </div>

      {tab === 'transactions' ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedFilters({ keyword: draftKeyword.trim(), start: draftStart, end: draftEnd });
              setTxPage(1);
            }}
            className="flex flex-wrap items-end gap-3 border-b border-slate-200 dark:border-slate-800 p-4"
          >
            <div className="flex-1 min-w-[200px]">
              <label htmlFor={`${idPrefix}-kw`} className="block text-[11px] font-semibold text-slate-500 mb-1">
                Từ khóa (biển số, thẻ, mã GD, thu ngân)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  id={`${idPrefix}-kw`}
                  type="text"
                  value={draftKeyword}
                  onChange={(e) => setDraftKeyword(e.target.value)}
                  placeholder="Nhập từ khóa rồi nhấn Enter..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-2 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${idPrefix}-from`} className="block text-[11px] font-semibold text-slate-500 mb-1">
                Từ ngày
              </label>
              <input
                id={`${idPrefix}-from`}
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-to`} className="block text-[11px] font-semibold text-slate-500 mb-1">
                Đến ngày
              </label>
              <input
                id={`${idPrefix}-to`}
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Lọc
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportCsv()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? 'Đang xuất...' : 'Xuất CSV'}
            </button>
          </form>

          <div className="overflow-x-auto">
            {txQuery.isLoading ? (
              <div className="p-10 text-center text-sm text-slate-400">Đang tải lịch sử giao dịch...</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Mã GD / Thời gian</th>
                    <th className="px-4 py-3">Biển số / Loại xe</th>
                    <th className="px-4 py-3">Loại GD / Thu ngân</th>
                    <th className="px-4 py-3">Phương thức TT</th>
                    <th className="px-4 py-3 text-right">Số tiền</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(txQuery.data?.items ?? []).map((t) => (
                    <tr key={t.ma_gd} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono-plate font-bold">#{t.ma_gd}</div>
                        <div className="text-[11px] text-slate-500">{formatDateTime(t.giothanhtoan)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono-plate font-bold">{t.bienso || '—'}</div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {t.loaiphuongtien || '—'} · {t.vitri || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{t.hinhthuc}</div>
                        <div className="text-[11px] text-slate-500">{t.nhanvien}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={t.loaithanhtoan === 'Chuyển khoản' ? 'sky' : 'slate'}>
                          {t.loaithanhtoan}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{formatVnd(t.chiphi)}</td>
                      <td className="px-4 py-3">
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
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold"
                          >
                            <option value="Thành công">Thành công</option>
                            <option value="Hoàn tiền">Hoàn tiền</option>
                            <option value="Thất bại">Thất bại</option>
                          </select>
                        ) : (
                          <StatusBadge tone={paymentStatusTone(t.trangthai)}>{t.trangthai}</StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                          className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
        <div className="space-y-6">
          {/* Active Shift Card */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-bold mb-4">
              <Wallet className="h-4 w-4 text-indigo-600" />
              Ca trực hiện tại của {user.full_name}
            </h2>

            {activeShiftQuery.isLoading ? (
              <div className="py-6 text-center text-xs text-slate-400">Đang kiểm tra ca trực...</div>
            ) : activeShift ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                    <div className="text-slate-500">Tiền đầu ca</div>
                    <div className="mt-1 text-base font-bold">{formatVnd(activeShift.opening_cash)}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-3">
                    <div className="text-emerald-700 dark:text-emerald-300">Thu tiền mặt</div>
                    <div className="mt-1 text-base font-bold text-emerald-700 dark:text-emerald-300">
                      {formatVnd(activeShift.live_cash_total)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 p-3">
                    <div className="text-sky-700 dark:text-sky-300">Thu chuyển khoản</div>
                    <div className="mt-1 text-base font-bold text-sky-700 dark:text-sky-300">
                      {formatVnd(activeShift.live_transfer_total)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 p-3">
                    <div className="text-amber-700 dark:text-amber-300">Đã hoàn tiền</div>
                    <div className="mt-1 text-base font-bold text-amber-700 dark:text-amber-300">
                      {formatVnd(activeShift.live_refund_total)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/50 p-3">
                    <div className="text-indigo-700 dark:text-indigo-300">Tiền mặt kỳ vọng</div>
                    <div className="mt-1 text-base font-extrabold text-indigo-700 dark:text-indigo-200">
                      {formatVnd(activeShift.live_expected_cash)}
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    closeShiftMutation.mutate(activeShift.id);
                  }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end border-t border-slate-100 dark:border-slate-800 pt-4 text-xs"
                >
                  <div>
                    <label htmlFor={`${idPrefix}-actual`} className="block font-semibold mb-1">
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
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-bold"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${idPrefix}-cnote`} className="block font-semibold mb-1">
                      Ghi chú chốt ca
                    </label>
                    <input
                      id={`${idPrefix}-cnote`}
                      type="text"
                      maxLength={255}
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="VD: Đủ quỹ, đã bàn giao ca tối"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={closeShiftMutation.isPending}
                    className="rounded-xl bg-rose-600 py-2.5 px-4 font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {closeShiftMutation.isPending ? 'Đang chốt ca...' : `Chốt ca #${activeShift.id}`}
                  </button>
                </form>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  openShiftMutation.mutate();
                }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end text-xs"
              >
                <div>
                  <label htmlFor={`${idPrefix}-open`} className="block font-semibold mb-1">
                    Quỹ tiền lẻ đầu ca (VNĐ)
                  </label>
                  <input
                    id={`${idPrefix}-open`}
                    type="number"
                    min={0}
                    step={50000}
                    value={openingCash}
                    onChange={(e) => setOpeningCash(Math.max(0, Number(e.target.value)))}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-onote`} className="block font-semibold mb-1">
                    Ghi chú nhận ca
                  </label>
                  <input
                    id={`${idPrefix}-onote`}
                    type="text"
                    maxLength={255}
                    value={openNote}
                    onChange={(e) => setOpenNote(e.target.value)}
                    placeholder="Ca sáng 07:00 - 15:00"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  disabled={openShiftMutation.isPending}
                  className="rounded-xl bg-emerald-600 py-2.5 px-4 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {openShiftMutation.isPending ? 'Đang mở ca...' : 'Mở ca làm việc mới'}
                </button>
              </form>
            )}
          </section>

          {/* Shift History */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <h3 className="text-sm font-bold">
                Lịch sử ca trực ({shiftsQuery.data?.total ?? 0})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Ca / Nhân viên</th>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3 text-right">Đầu ca</th>
                    <th className="px-4 py-3 text-right">Kỳ vọng</th>
                    <th className="px-4 py-3 text-right">Thực bàn giao</th>
                    <th className="px-4 py-3 text-right">Chuyển khoản</th>
                    <th className="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(shiftsQuery.data?.items ?? []).map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <div className="font-bold">#{s.id} · {s.ten_nhanvien}</div>
                        <div className="text-[11px] text-slate-500">{s.tenbaido || 'Toàn hệ thống'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>{formatDateTime(s.started_at)}</div>
                        <div className="text-[11px] text-slate-500">
                          {s.ended_at ? `→ ${formatDateTime(s.ended_at)}` : 'Đang trực'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">{formatVnd(s.opening_cash)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatVnd(s.expected_cash)}</td>
                      <td className="px-4 py-3 text-right font-bold">
                        {s.actual_cash !== null ? formatVnd(s.actual_cash) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sky-600 dark:text-sky-400">
                        {formatVnd(s.transfer_total)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={s.status === 'OPEN' ? 'emerald' : 'slate'}>
                          {s.status === 'OPEN' ? 'Đang mở' : 'Đã chốt'}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        </div>
      )}
    </div>
  );
}
