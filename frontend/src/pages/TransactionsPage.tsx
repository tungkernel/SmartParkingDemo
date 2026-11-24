import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Printer, ReceiptText, RotateCcw } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LicensePlate } from '../components/ui/LicensePlate';
import { PaginationBar } from '../components/ui/PaginationBar';
import { SearchInput } from '../components/ui/SearchInput';
import { TableSkeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useToast } from '../context/ToastContext';
import { apiRequest, downloadFile, formatDateTime, formatVnd, getErrorMessage } from '../lib/api';
import { getVnDateIso } from '../lib/time';
import type {
  CatalogsResponse,
  PaginatedResponse,
  PaymentMethod,
  PaymentStatus,
  TransactionRecord,
} from '../types';

interface TransactionsPageProps {
  onPrint: (doc: PrintableDocument) => void;
}

export function TransactionsPage({ onPrint }: TransactionsPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const idPrefix = useId();

  const [draftKeyword, setDraftKeyword] = useState('');
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [draftEmployeeId, setDraftEmployeeId] = useState<string>('');
  const [draftMethod, setDraftMethod] = useState<'' | PaymentMethod>('');
  const [appliedFilters, setAppliedFilters] = useState({
    keyword: '',
    start: '',
    end: '',
    employeeId: '',
    paymentMethod: '' as '' | PaymentMethod,
  });
  const [txPage, setTxPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const catalogsQuery = useQuery<CatalogsResponse>({
    queryKey: ['catalogs'],
    queryFn: ({ signal }) => apiRequest<CatalogsResponse>('/api/v1/catalogs', { signal }),
    staleTime: 60_000,
  });

  const txParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(txPage), page_size: '30' });
    if (appliedFilters.keyword) p.set('keyword', appliedFilters.keyword);
    if (appliedFilters.start) p.set('start_date', appliedFilters.start);
    if (appliedFilters.end) p.set('end_date', appliedFilters.end);
    if (appliedFilters.employeeId) p.set('employee_id', appliedFilters.employeeId);
    if (appliedFilters.paymentMethod) p.set('payment_method', appliedFilters.paymentMethod);
    return p.toString();
  }, [txPage, appliedFilters]);

  const txQuery = useQuery<PaginatedResponse<TransactionRecord>>({
    queryKey: ['transactions', txParams],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<TransactionRecord>>(`/api/v1/transactions?${txParams}`, {
        signal,
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: PaymentStatus }) =>
      apiRequest(`/api/v1/transactions/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật trạng thái giao dịch.');
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
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
    setAppliedFilters({
      keyword: draftKeyword.trim(),
      start,
      end: today,
      employeeId: draftEmployeeId,
      paymentMethod: draftMethod,
    });
    setTxPage(1);
  };

  const resetFilters = () => {
    setDraftKeyword('');
    setDraftStart('');
    setDraftEnd('');
    setDraftEmployeeId('');
    setDraftMethod('');
    setAppliedFilters({
      keyword: '',
      start: '',
      end: '',
      employeeId: '',
      paymentMethod: '',
    });
    setTxPage(1);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile(
        `/api/v1/transactions/export?${txParams}`,
        `giao_dich_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      notify('ok', 'Đã xuất báo cáo giao dịch CSV.');
    } catch (err: unknown) {
      notify('err', getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const txItems = useMemo(() => txQuery.data?.items ?? [], [txQuery.data?.items]);
  const hasFilters = Boolean(
    appliedFilters.keyword ||
    appliedFilters.start ||
    appliedFilters.end ||
    appliedFilters.employeeId ||
    appliedFilters.paymentMethod,
  );

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
      <section className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[340px] max-h-[78vh] lg:max-h-none flex flex-col">
        <div className="shrink-0 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 space-y-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedFilters({
                keyword: draftKeyword.trim(),
                start: draftStart,
                end: draftEnd,
                employeeId: draftEmployeeId,
                paymentMethod: draftMethod,
              });
              setTxPage(1);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex-1 min-w-[200px]">
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
            <div>
              <label
                htmlFor={`${idPrefix}-emp`}
                className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
              >
                Nhân viên thu
              </label>
              <select
                id={`${idPrefix}-emp`}
                value={draftEmployeeId}
                onChange={(e) => setDraftEmployeeId(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs"
              >
                <option value="">Tất cả nhân viên</option>
                {(catalogsQuery.data?.employees ?? []).map((emp) => (
                  <option key={emp.id} value={String(emp.id)}>
                    {emp.hoten} ({emp.chucvu})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`${idPrefix}-method`}
                className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1"
              >
                Thanh toán
              </label>
              <select
                id={`${idPrefix}-method`}
                value={draftMethod}
                onChange={(e) => setDraftMethod(e.target.value as '' | PaymentMethod)}
                className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-3 text-xs"
              >
                <option value="">Tất cả hình thức</option>
                <option value="Tiền mặt">Tiền mặt</option>
                <option value="Chuyển khoản">Chuyển khoản</option>
              </select>
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
              <strong className="text-slate-800 dark:text-slate-100">{pageSummary.count}</strong> GD
              · Thu thành công trang này:{' '}
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
    </div>
  );
}
