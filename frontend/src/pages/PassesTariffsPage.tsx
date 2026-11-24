import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Plus,
  QrCode,
  RefreshCw,
  Tag,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PrintableDocument } from '../components/TicketPrintModal';
import { RegisterPassDrawer } from '../components/passes/RegisterPassDrawer';
import type { RegisterPassPayload } from '../components/passes/RegisterPassDrawer';
import { TariffMatrix } from '../components/passes/TariffMatrix';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LicensePlate } from '../components/ui/LicensePlate';
import { Modal } from '../components/ui/Modal';
import { PaginationBar } from '../components/ui/PaginationBar';
import { SearchInput } from '../components/ui/SearchInput';
import { TableSkeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { VehicleIcon } from '../components/ui/VehicleIcon';
import { useToast } from '../context/ToastContext';
import { apiRequest, formatDate, formatVnd, getErrorMessage } from '../lib/api';
import { cn } from '../lib/cn';
import { getDaysRemaining, getPassProgressPct } from '../lib/time';
import { buildVietQrPayload } from '../lib/vietqr';
import { formatEmployeeOption, pickDefaultEmployeeId } from '../lib/employee';
import { findMatchingLotForVehicleType } from './GatePosPage';
import type {
  CardRecord,
  CatalogsResponse,
  MonthlyPass,
  PaginatedResponse,
  PaymentMethod,
  Tariff,
} from '../types';

interface RenewPassVars {
  pass: MonthlyPass;
  renewM: number;
  method: PaymentMethod;
  employeeId: number;
  employeeName?: string;
}

interface PassesTariffsPageProps {
  onPrint: (doc: PrintableDocument) => void;
}

export function PassesTariffsPage({ onPrint }: PassesTariffsPageProps) {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefix = useId();

  const section: 'passes' | 'tariffs' =
    searchParams.get('tab') === 'tariffs' ? 'tariffs' : 'passes';
  const keyword = searchParams.get('q') ?? '';
  const [registerOpen, setRegisterOpen] = useState(false);

  // Filters & pagination
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'expired'>('');

  const setSection = (next: 'passes' | 'tariffs') => {
    const p = new URLSearchParams(searchParams);
    if (next === 'tariffs') p.set('tab', 'tariffs');
    else p.delete('tab');
    setSearchParams(p, { replace: true });
  };

  const setKeyword = (val: string) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set('q', val);
    else p.delete('q');
    setSearchParams(p, { replace: true });
  };

  // Modals
  const [renewTarget, setRenewTarget] = useState<MonthlyPass | null>(null);
  const [renewMonths, setRenewMonths] = useState(1);
  const [renewPayMethod, setRenewPayMethod] = useState<PaymentMethod>('Tiền mặt');
  const [renewEmpOverride, setRenewEmpOverride] = useState<number | ''>('');
  const [assetsTarget, setAssetsTarget] = useState<MonthlyPass | null>(null);
  const [assetsPlate, setAssetsPlate] = useState('');
  const [assetsVehicleTypeId, setAssetsVehicleTypeId] = useState<number | ''>('');
  const [assetsCardId, setAssetsCardId] = useState<number | ''>('');
  const [cancelTarget, setCancelTarget] = useState<MonthlyPass | null>(null);

  const [createTariffOpen, setCreateTariffOpen] = useState(false);
  const [newTariffTicketType, setNewTariffTicketType] = useState<'ngày' | 'tháng'>('ngày');
  const [newTariffVehId, setNewTariffVehId] = useState<number | ''>('');
  const [newTariffCustId, setNewTariffCustId] = useState<number | ''>('');
  const [newTariffPrice, setNewTariffPrice] = useState(5000);
  const [editTariffTarget, setEditTariffTarget] = useState<Tariff | null>(null);
  const [editTariffPrice, setEditTariffPrice] = useState(0);
  const [deleteTariffTarget, setDeleteTariffTarget] = useState<Tariff | null>(null);

  const passParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), page_size: '25' });
    if (statusFilter) p.set('status_filter', statusFilter);
    if (keyword.trim()) p.set('keyword', keyword.trim());
    return p.toString();
  }, [page, statusFilter, keyword]);

  const passesQuery = useQuery<PaginatedResponse<MonthlyPass>>({
    queryKey: ['passes', passParams],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<MonthlyPass>>(`/api/v1/passes?${passParams}`, { signal }),
  });

  const tariffsQuery = useQuery<Tariff[]>({
    queryKey: ['tariffs'],
    queryFn: ({ signal }) => apiRequest<Tariff[]>('/api/v1/tariffs', { signal }),
  });

  const catalogsQuery = useQuery<CatalogsResponse>({
    queryKey: ['catalogs'],
    queryFn: ({ signal }) => apiRequest<CatalogsResponse>('/api/v1/catalogs', { signal }),
    staleTime: 60_000,
  });

  const cardsQuery = useQuery<CardRecord[]>({
    queryKey: ['cards', 'available'],
    queryFn: ({ signal }) =>
      apiRequest<CardRecord[]>('/api/v1/cards?only_available=true', { signal }),
  });

  const catalogs = catalogsQuery.data;
  const employees = useMemo(() => catalogs?.employees ?? [], [catalogs?.employees]);
  const tariffs = useMemo(() => tariffsQuery.data ?? [], [tariffsQuery.data]);
  const cards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);

  const effectiveRenewEmpId = useMemo<number | ''>(() => {
    if (renewEmpOverride && employees.some((e) => e.id === renewEmpOverride)) {
      return renewEmpOverride;
    }
    const matchedLotId = findMatchingLotForVehicleType(
      catalogs?.lots ?? [],
      renewTarget?.loaiphuongtien,
    )?.id;
    return pickDefaultEmployeeId(employees, { lotId: matchedLotId, preferredRole: 'cashier' });
  }, [renewEmpOverride, employees, catalogs?.lots, renewTarget?.loaiphuongtien]);

  const invalidatePassData = () => {
    void queryClient.invalidateQueries({ queryKey: ['passes'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const registerMutation = useMutation({
    mutationFn: (vars: { payload: RegisterPassPayload; resetForm: () => void }) =>
      apiRequest<{ id: number }>('/api/v1/passes', {
        method: 'POST',
        body: JSON.stringify({
          hoten: vars.payload.hoten,
          sdt: vars.payload.sdt,
          cccd: vars.payload.cccd,
          customer_type_id: vars.payload.customerTypeId,
          license_plate: vars.payload.plate,
          vehicle_type_id: vars.payload.vehicleTypeId,
          card_id: vars.payload.cardId,
          months: vars.payload.months,
          payment_method: vars.payload.payMethod,
          employee_id: vars.payload.employeeId,
        }),
      }),
    onSuccess: (res, vars) => {
      notify('ok', `Đăng ký vé tháng #${res.id} thành công!`);
      vars.resetForm();
      setRegisterOpen(false);
      onPrint({
        kind: 'receipt',
        id: `VT-${res.id}`,
        plate: vars.payload.plate,
        vehicleType: vars.payload.vehicleTypeName,
        cardCode: vars.payload.cardCode,
        ticketType: `Đăng ký vé tháng (${vars.payload.months} tháng)`,
        checkoutTime: new Date().toISOString(),
        paymentMethod: vars.payload.payMethod,
        amount: vars.payload.estimatedAmount,
        operatorName: vars.payload.employeeName,
      });
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const renewMutation = useMutation({
    mutationFn: (vars: RenewPassVars) =>
      apiRequest<{ pass_id: number; new_end_date: string; amount: number }>(
        `/api/v1/passes/${vars.pass.id}/renew`,
        {
          method: 'POST',
          body: JSON.stringify({
            months: vars.renewM,
            payment_method: vars.method,
            employee_id: vars.employeeId,
          }),
        },
      ),
    onSuccess: (res, vars) => {
      notify('ok', `Gia hạn vé #${res.pass_id} đến ${formatDate(res.new_end_date)}.`);
      onPrint({
        kind: 'receipt',
        id: `GH-${res.pass_id}`,
        plate: vars.pass.bienso,
        vehicleType: vars.pass.loaiphuongtien,
        cardCode: vars.pass.mathe,
        ticketType: `Gia hạn vé tháng (+${vars.renewM} tháng)`,
        checkoutTime: new Date().toISOString(),
        paymentMethod: vars.method,
        amount: res.amount,
        operatorName: vars.employeeName,
      });
      setRenewTarget(null);
      setRenewEmpOverride('');
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateAssetsMutation = useMutation({
    mutationFn: (vars: {
      passId: number;
      plate: string;
      vehicleTypeId: number;
      newCardId: number;
    }) =>
      apiRequest(`/api/v1/passes/${vars.passId}/assets`, {
        method: 'PUT',
        body: JSON.stringify({
          plate: vars.plate.trim().toUpperCase(),
          vehicle_type_id: vars.vehicleTypeId,
          new_card_id: vars.newCardId,
        }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật biển số / thẻ RFID cho vé tháng.');
      setAssetsTarget(null);
      invalidatePassData();
      void queryClient.invalidateQueries({ queryKey: ['turns'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const cancelPassMutation = useMutation({
    mutationFn: (passId: number) => apiRequest(`/api/v1/passes/${passId}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('ok', 'Đã hủy hiệu lực vé tháng.');
      setCancelTarget(null);
      invalidatePassData();
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const createTariffMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ id: number }>('/api/v1/tariffs', {
        method: 'POST',
        body: JSON.stringify({
          ticket_type: newTariffTicketType,
          vehicle_type_id: Number(newTariffVehId),
          customer_type_id: newTariffCustId ? Number(newTariffCustId) : null,
          unit_price: newTariffPrice,
        }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã thêm biểu giá mới.');
      setCreateTariffOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const updateTariffMutation = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) =>
      apiRequest(`/api/v1/tariffs/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ unit_price: price }),
      }),
    onSuccess: () => {
      notify('ok', 'Đã cập nhật đơn giá.');
      setEditTariffTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const deleteTariffMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/v1/tariffs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify('ok', 'Đã xóa biểu giá.');
      setDeleteTariffTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['tariffs'] });
    },
    onError: (err: unknown) => notify('err', getErrorMessage(err)),
  });

  const passItems = passesQuery.data?.items ?? [];
  const assetsFormId = `${prefix}-assets-form`;
  const createTariffFormId = `${prefix}-create-tariff-form`;

  const openAssetsModal = (p: MonthlyPass) => {
    const matchedVt =
      p.vehicle_type_id ??
      catalogs?.vehicle_types.find((v) => v.tenloai === p.loaiphuongtien)?.id ??
      catalogs?.vehicle_types[0]?.id ??
      '';
    setAssetsPlate(p.bienso);
    setAssetsVehicleTypeId(matchedVt);
    setAssetsCardId(p.card_id ?? cards[0]?.id ?? '');
    setAssetsTarget(p);
  };

  const openCreateTariffModal = () => {
    setNewTariffTicketType('ngày');
    setNewTariffVehId(catalogs?.vehicle_types[0]?.id ?? '');
    setNewTariffCustId('');
    setNewTariffPrice(5000);
    setCreateTariffOpen(true);
  };

  const renewAmount = renewTarget ? renewTarget.dongia * renewMonths : 0;
  const renewQrPayload = renewTarget
    ? buildVietQrPayload({
        config: catalogs?.vietqr,
        amount: renewAmount,
        description: `PTIT RENEW ${renewTarget.id} ${renewTarget.bienso}`,
      })
    : '';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3.5">
      {/* Top Tabs + Primary CTA */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Phân mục vé tháng và bảng giá"
          className="card-surface inline-flex rounded-xl p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'passes'}
            onClick={() => setSection('passes')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors',
              section === 'passes'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Danh sách Vé tháng ({passesQuery.data?.total ?? 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'tariffs'}
            onClick={() => setSection('tariffs')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors',
              section === 'tariffs'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
          >
            <Tag className="h-3.5 w-3.5" />
            Bảng giá dịch vụ ({tariffs.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {section === 'tariffs' && (
            <Button
              variant="secondary"
              size="md"
              icon={<Plus className="h-4 w-4" />}
              onClick={openCreateTariffModal}
            >
              Thêm biểu giá
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setRegisterOpen(true)}
          >
            Đăng ký vé tháng mới
          </Button>
        </div>
      </div>

      {section === 'passes' ? (
        <section className="card-surface rounded-2xl overflow-hidden flex-1 min-h-[340px] max-h-[72vh] lg:max-h-none flex flex-col">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                containerClassName="w-64 sm:w-72"
                aria-label="Tìm vé tháng theo tên, biển số hoặc thẻ"
                value={keyword}
                onChange={(val) => {
                  setKeyword(val);
                  setPage(1);
                }}
                placeholder="Tìm tên, SĐT, biển số, mã thẻ..."
              />
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700/90 bg-slate-50 dark:bg-slate-800/80 p-0.5 text-xs">
                {(
                  [
                    ['', 'Tất cả'],
                    ['active', 'Còn hạn'],
                    ['expired', 'Hết hạn'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val || 'all'}
                    type="button"
                    onClick={() => {
                      setStatusFilter(val);
                      setPage(1);
                    }}
                    className={cn(
                      'rounded-lg px-3 py-1.5 font-semibold transition-colors',
                      statusFilter === val
                        ? 'bg-surface dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Thẻ RFID trống sẵn sàng:{' '}
              <strong className="font-mono-plate text-slate-800 dark:text-slate-200">
                {cards.length}
              </strong>
            </div>
          </div>

          <div className="flex-1 min-h-0 scroll-pane">
            {passesQuery.isLoading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : passesQuery.isError ? (
              <div className="p-5">
                <ErrorState
                  message={getErrorMessage(passesQuery.error)}
                  onRetry={() => void passesQuery.refetch()}
                />
              </div>
            ) : passItems.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-5 w-5" />}
                title="Chưa có vé tháng nào khớp bộ lọc"
                description="Thử xóa từ khóa lọc hoặc nhấn Đăng ký vé tháng mới để phát hành thẻ cho khách hàng."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setRegisterOpen(true)}
                  >
                    Đăng ký vé tháng mới
                  </Button>
                }
              />
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="table-sticky-head text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Khách hàng</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Biển số & Thẻ RFID</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Thời hạn hiệu lực</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap">Trạng thái</th>
                    <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {passItems.map((p) => {
                    const isActive = p.status_code
                      ? p.status_code === 'active'
                      : p.trangthai === 'Còn hạn';
                    const daysLeft = getDaysRemaining(p.ngayketthuc);
                    const expiringSoon = isActive && daysLeft !== null && daysLeft <= 7;
                    const progressPct = getPassProgressPct(p.ngaybatdau, p.ngayketthuc);

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-3.5 py-2.5">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {p.hoten}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {p.loaikhachhang} · <span className="font-mono-plate">{p.sdt}</span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5">
                          <LicensePlate plate={p.bienso} size="sm" copyable />
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <VehicleIcon vehicleType={p.loaiphuongtien} className="h-3.5 w-3.5" />
                            <span className="capitalize">{p.loaiphuongtien}</span>
                            <span>·</span>
                            <span className="font-mono-plate font-semibold text-brand-600 dark:text-brand-400">
                              #{p.mathe}
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap min-w-[200px]">
                          <div className="flex items-center justify-between text-xs tabular-nums">
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                              {formatDate(p.ngaybatdau)} → {formatDate(p.ngayketthuc)}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                !isActive
                                  ? 'bg-slate-400'
                                  : expiringSoon
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500',
                              )}
                              style={{ width: `${isActive ? progressPct : 100}%` }}
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            <span>{formatVnd(p.dongia)}/tháng</span>
                            {isActive && daysLeft !== null && (
                              <span
                                className={cn(
                                  'font-semibold',
                                  expiringSoon
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400',
                                )}
                              >
                                {daysLeft <= 0 ? 'Hết hạn hôm nay' : `Còn ${daysLeft} ngày`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <StatusBadge
                            dot
                            tone={!isActive ? 'slate' : expiringSoon ? 'amber' : 'emerald'}
                          >
                            {!isActive ? 'Hết hạn' : expiringSoon ? 'Sắp hết hạn' : 'Còn hạn'}
                          </StatusBadge>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="subtle"
                              size="xs"
                              icon={<RefreshCw className="h-3 w-3" />}
                              onClick={() => {
                                setRenewTarget(p);
                                setRenewMonths(1);
                                setRenewPayMethod('Tiền mặt');
                                setRenewEmpOverride('');
                              }}
                            >
                              Gia hạn
                            </Button>
                            {isActive && (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Đổi xe/thẻ vé tháng #${p.id}`}
                                  title="Đổi biển số hoặc cấp đổi thẻ RFID"
                                  onClick={() => openAssetsModal(p)}
                                  className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand-600 transition-colors"
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Hủy vé tháng #${p.id}`}
                                  onClick={() => setCancelTarget(p)}
                                  className="rounded-lg border border-rose-200 dark:border-rose-900 p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
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
          {passesQuery.data && (
            <PaginationBar
              page={passesQuery.data.page}
              totalPages={passesQuery.data.total_pages}
              total={passesQuery.data.total}
              pageSize={passesQuery.data.page_size}
              onPageChange={setPage}
            />
          )}
        </section>
      ) : tariffsQuery.isLoading ? (
        <div className="card-surface rounded-2xl">
          <TableSkeleton rows={6} cols={4} />
        </div>
      ) : tariffsQuery.isError ? (
        <ErrorState
          message={getErrorMessage(tariffsQuery.error)}
          onRetry={() => void tariffsQuery.refetch()}
        />
      ) : (
        <TariffMatrix
          tariffs={tariffs}
          canManage
          canDelete
          onEditTariff={(t) => {
            setEditTariffTarget(t);
            setEditTariffPrice(t.dongia);
          }}
          onDeleteTariff={setDeleteTariffTarget}
        />
      )}

      {/* Register New Monthly Pass Slide-Over Drawer */}
      <RegisterPassDrawer
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        catalogs={catalogs}
        tariffs={tariffs}
        cards={cards}
        submitting={registerMutation.isPending}
        onSubmit={(payload, resetForm) => registerMutation.mutate({ payload, resetForm })}
      />

      {/* Renew Modal with VietQR */}
      <Modal
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        maxWidthClass="max-w-md"
        title={renewTarget ? `Gia hạn vé tháng #${renewTarget.id}` : ''}
        subtitle={renewTarget ? `${renewTarget.hoten} · Biển số ${renewTarget.bienso}` : undefined}
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <RefreshCw className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenewTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={renewMutation.isPending}
              disabled={!effectiveRenewEmpId}
              onClick={() => {
                if (!renewTarget || !effectiveRenewEmpId) return;
                const empId = Number(effectiveRenewEmpId);
                const emp = employees.find((e) => e.id === empId);
                renewMutation.mutate({
                  pass: renewTarget,
                  renewM: renewMonths,
                  method: renewPayMethod,
                  employeeId: empId,
                  employeeName: emp?.hoten,
                });
              }}
            >
              {renewMutation.isPending ? 'Đang gia hạn...' : 'Xác nhận gia hạn'}
            </Button>
          </>
        }
      >
        {renewTarget && (
          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5">
              <span className="text-slate-500">Hạn hiện tại:</span>
              <strong className="font-mono-plate text-slate-900 dark:text-slate-100">
                {formatDate(renewTarget.ngayketthuc)}
              </strong>
            </div>

            <div>
              <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Số tháng gia hạn
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 6, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRenewMonths(n)}
                    className={cn(
                      'rounded-xl border py-2 text-xs font-bold transition-colors',
                      renewMonths === n
                        ? 'bg-brand-soft'
                        : 'border-slate-200 dark:border-slate-700 bg-surface-input dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:border-brand-400',
                    )}
                  >
                    {n}T
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor={`${prefix}-renew-emp`}
                className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                Nhân viên thu phí
              </label>
              <select
                id={`${prefix}-renew-emp`}
                value={effectiveRenewEmpId}
                onChange={(e) => setRenewEmpOverride(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800/90 px-3 py-2 text-xs font-medium"
              >
                {employees.length === 0 ? (
                  <option value="">Chưa có nhân viên</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {formatEmployeeOption(emp)}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Phương thức thanh toán
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['Tiền mặt', 'Chuyển khoản'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setRenewPayMethod(method)}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all',
                      renewPayMethod === method
                        ? 'bg-brand-soft'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    {method === 'Tiền mặt' ? (
                      <Banknote className="h-4 w-4" />
                    ) : (
                      <QrCode className="h-4 w-4" />
                    )}
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {renewPayMethod === 'Chuyển khoản' && renewAmount > 0 && (
              <div className="flex flex-col items-center rounded-2xl border border-sky-200 dark:border-sky-900/70 bg-sky-50/40 dark:bg-sky-950/25 p-3.5 text-center">
                <div className="rounded-xl bg-white p-2.5 shadow-sm">
                  <QRCodeSVG value={renewQrPayload} size={130} level="M" />
                </div>
                <div className="mt-2 font-mono-plate text-[11px] text-slate-500">
                  VietQR · STK {catalogs?.vietqr.account_no ?? '0123456789'}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between rounded-2xl bg-slate-900 dark:bg-slate-950 px-4 py-3 text-white">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tổng tiền thu
              </span>
              <span className="font-mono-plate text-xl font-extrabold">
                {formatVnd(renewAmount)}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Tariff Modal */}
      <Modal
        open={Boolean(editTariffTarget)}
        onClose={() => setEditTariffTarget(null)}
        maxWidthClass="max-w-sm"
        title={editTariffTarget ? `Cập nhật đơn giá #${editTariffTarget.id}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTariffTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={updateTariffMutation.isPending}
              onClick={() =>
                editTariffTarget &&
                updateTariffMutation.mutate({ id: editTariffTarget.id, price: editTariffPrice })
              }
            >
              {updateTariffMutation.isPending ? 'Đang lưu...' : 'Lưu đơn giá'}
            </Button>
          </>
        }
      >
        {editTariffTarget && (
          <div className="p-5 space-y-3 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-slate-600 dark:text-slate-300">
              Vé{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {editTariffTarget.loaive}
              </strong>{' '}
              — <span className="capitalize">{editTariffTarget.loaiphuongtien}</span> (
              {editTariffTarget.loaikhachhang})
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Đơn giá mới (VNĐ)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={editTariffPrice}
                onChange={(e) => setEditTariffPrice(Math.max(0, Number(e.target.value)))}
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-base font-bold focus:border-brand-500 outline-none"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Update Pass Assets (Plate / Card) Modal */}
      <Modal
        open={Boolean(assetsTarget)}
        onClose={() => setAssetsTarget(null)}
        maxWidthClass="max-w-md"
        title={assetsTarget ? `Đổi xe / thẻ vé tháng #${assetsTarget.id}` : ''}
        subtitle={
          assetsTarget ? `${assetsTarget.hoten} · Đang gắn thẻ #${assetsTarget.mathe}` : undefined
        }
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <ArrowRightLeft className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssetsTarget(null)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={assetsFormId}
              variant="primary"
              loading={updateAssetsMutation.isPending}
              disabled={!assetsPlate.trim() || !assetsVehicleTypeId || !assetsCardId}
            >
              {updateAssetsMutation.isPending ? 'Đang cập nhật...' : 'Lưu thay đổi'}
            </Button>
          </>
        }
      >
        {assetsTarget && (
          <form
            id={assetsFormId}
            onSubmit={(e) => {
              e.preventDefault();
              if (!assetsVehicleTypeId || !assetsCardId) return;
              updateAssetsMutation.mutate({
                passId: assetsTarget.id,
                plate: assetsPlate,
                vehicleTypeId: Number(assetsVehicleTypeId),
                newCardId: Number(assetsCardId),
              });
            }}
            className="p-5 space-y-4 text-xs"
          >
            <div>
              <label
                htmlFor={`${prefix}-assets-plate`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Biển số xe mới
              </label>
              <input
                id={`${prefix}-assets-plate`}
                required
                maxLength={15}
                value={assetsPlate}
                onChange={(e) => setAssetsPlate(e.target.value.toUpperCase())}
                placeholder="29A-123.45"
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-sm font-bold uppercase focus:border-brand-500 outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-assets-vt`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Loại phương tiện
              </label>
              <select
                id={`${prefix}-assets-vt`}
                required
                value={assetsVehicleTypeId}
                onChange={(e) => setAssetsVehicleTypeId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
              >
                {(catalogs?.vehicle_types ?? []).map((vt) => (
                  <option key={vt.id} value={vt.id}>
                    {vt.tenloai}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`${prefix}-assets-card`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Thẻ RFID sử dụng
              </label>
              <select
                id={`${prefix}-assets-card`}
                required
                value={assetsCardId}
                onChange={(e) => setAssetsCardId(e.target.value ? Number(e.target.value) : '')}
                className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold"
              >
                {assetsTarget.card_id && (
                  <option value={assetsTarget.card_id}>
                    #{assetsTarget.mathe} (Giữ nguyên thẻ hiện tại)
                  </option>
                )}
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.maso} (Thẻ trống mới)
                  </option>
                ))}
              </select>
            </div>
          </form>
        )}
      </Modal>

      {/* Create Tariff Modal */}
      <Modal
        open={createTariffOpen}
        onClose={() => setCreateTariffOpen(false)}
        maxWidthClass="max-w-md"
        title="Thêm biểu giá dịch vụ mới"
        titleIcon={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft">
            <Tag className="h-4 w-4" />
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateTariffOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              form={createTariffFormId}
              variant="primary"
              loading={createTariffMutation.isPending}
              disabled={!newTariffVehId}
            >
              {createTariffMutation.isPending ? 'Đang tạo...' : 'Tạo biểu giá'}
            </Button>
          </>
        }
      >
        <form
          id={createTariffFormId}
          onSubmit={(e) => {
            e.preventDefault();
            if (newTariffVehId) createTariffMutation.mutate();
          }}
          className="p-5 space-y-4 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`${prefix}-ct-type`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Loại vé
              </label>
              <select
                id={`${prefix}-ct-type`}
                value={newTariffTicketType}
                onChange={(e) => setNewTariffTicketType(e.target.value as 'ngày' | 'tháng')}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
              >
                <option value="ngày">Vé ngày</option>
                <option value="tháng">Vé tháng</option>
              </select>
            </div>
            <div>
              <label
                htmlFor={`${prefix}-ct-veh`}
                className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Loại phương tiện
              </label>
              <select
                id={`${prefix}-ct-veh`}
                required
                value={newTariffVehId}
                onChange={(e) => setNewTariffVehId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
              >
                {(catalogs?.vehicle_types ?? []).map((vt) => (
                  <option key={vt.id} value={vt.id}>
                    {vt.tenloai}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-ct-cust`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Đối tượng khách hàng
            </label>
            <select
              id={`${prefix}-ct-cust`}
              value={newTariffCustId}
              onChange={(e) => setNewTariffCustId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3 py-2.5 text-sm"
            >
              <option value="">Áp dụng chung (vãng lai)</option>
              {(catalogs?.customer_types ?? []).map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.tenloai}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor={`${prefix}-ct-price`}
              className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Đơn giá (VNĐ)
            </label>
            <input
              id={`${prefix}-ct-price`}
              type="number"
              min={0}
              step={1000}
              required
              value={newTariffPrice}
              onChange={(e) => setNewTariffPrice(Math.max(0, Number(e.target.value)))}
              className="font-mono-plate w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-surface-input dark:bg-slate-800 px-3.5 py-2.5 text-base font-bold focus:border-brand-500 outline-none"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTariffTarget)}
        title="Xóa biểu giá"
        message={
          deleteTariffTarget
            ? `Xác nhận xóa biểu giá #${deleteTariffTarget.id} (Vé ${deleteTariffTarget.loaive} — ${deleteTariffTarget.loaiphuongtien}, ${formatVnd(deleteTariffTarget.dongia)})? Chỉ xóa được nếu chưa có lượt/vé tham chiếu.`
            : ''
        }
        confirmLabel="Xóa biểu giá"
        loading={deleteTariffMutation.isPending}
        onConfirm={() => deleteTariffTarget && deleteTariffMutation.mutate(deleteTariffTarget.id)}
        onCancel={() => setDeleteTariffTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Hủy vé tháng trước hạn"
        message={
          cancelTarget
            ? `Xác nhận hủy vé tháng #${cancelTarget.id} của khách ${cancelTarget.hoten} (${cancelTarget.bienso})?`
            : ''
        }
        confirmLabel="Hủy vé tháng"
        loading={cancelPassMutation.isPending}
        onConfirm={() => cancelTarget && cancelPassMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
